import { readFile } from 'node:fs/promises';
import type { Conexion } from './fase4';

/**
 * Decisiones B1–B6 · Renombre de recetas (solo `recetas.nombre`), independiente de la conexión: la usa el CLI con pg
 * y las pruebas con PGlite. Todo ocurre en UNA transacción:
 *  1. bloquea las recetas de la lista y verifica por receta: existe, es producto, está activa, tiene el nombre de
 *     partida (o ya el final: sin cambio) y el nombre final no choca con otra receta (ni siquiera en mayúsculas);
 *  2. renombra cada receta en su propio SAVEPOINT y verifica: solo cambió el nombre, la versión subió 1 y la bitácora
 *     tiene exactamente un registro nuevo `recetas.nombre` con origen `carga_masiva`, al que se le pone la nota;
 *  3. aísla la bitácora de esta ejecución de la actividad ajena: los registros de esta transacción son los de
 *     `fecha = now()` (la hora de inicio de la transacción, que el trigger usa por defecto); deben ser exactamente
 *     los verificados por receta. Lo que otras sesiones registren mientras tanto solo se informa (bitacoraAjena);
 *  4. COMMIT solo en modo aplicar/revertir sin ningún problema; el ensayo y cualquier problema terminan en ROLLBACK.
 * `revertir` usa la misma lista en sentido contrario.
 */
export type ModoRenombre = 'ensayo' | 'aplicar' | 'revertir';
export interface Renombre {
  decision: string;
  receta_id: string;
  nombre_actual: string;
  nombre_nuevo: string;
  codigo_pos: string;
}
export type Resultado = 'renombrada' | 'sin cambio' | 'problema';
export interface InformeReceta {
  decision: string;
  receta_id: string;
  desde: string;
  hacia: string;
  resultado: Resultado;
  version?: { antes: number; despues: number };
  bitacora?: {
    id: number;
    campo: string;
    valor_anterior: string;
    valor_nuevo: string;
    origen: string;
    usuario_id: string | null;
  };
  problemas: string[];
}
export interface Informe {
  modo: ModoRenombre;
  usuario: string | null;
  recetas: InformeReceta[];
  totales: Record<Resultado, number>;
  /** Registros de bitácora de esta transacción (deben ser los verificados por receta). */
  bitacoraNueva: number;
  /** Registros nuevos de otras sesiones durante la ejecución: no se cuentan ni se tocan, solo se informan. */
  bitacoraAjena: number;
  transaccion: 'commit' | 'rollback';
  error?: string;
}

export const ARCHIVO = 'docs/conciliacion-brasil/19-renombres-b1-b6.csv';
const COLUMNAS = ['decision', 'receta_id', 'nombre_actual', 'nombre_nuevo', 'codigo_pos'] as const;
/** Columnas que el trigger `antes_de_actualizar_receta` cambia solo; cualquier otra diferencia es un problema. */
const AUTOMATICAS = ['nombre', 'version', 'updated_at', 'updated_by'];

export async function leerLista(raiz = '.'): Promise<Renombre[]> {
  const [cabecera, ...filas] = (await readFile(`${raiz}/${ARCHIVO}`, 'utf8'))
    .replace(/^\uFEFF/, '')
    .trim()
    .split(/\r?\n/);
  if (cabecera !== COLUMNAS.join(',')) throw new Error(`Cabecera inesperada en ${ARCHIVO}`);
  const lista = filas.map((f) => {
    const v = f.split(',');
    if (v.length !== COLUMNAS.length || v.some((x) => x.trim() !== x || x === ''))
      throw new Error(`Fila inválida: ${f}`);
    return Object.fromEntries(COLUMNAS.map((c, i) => [c, v[i]])) as unknown as Renombre;
  });
  for (const k of ['decision', 'receta_id', 'nombre_actual', 'nombre_nuevo'] as const) {
    if (new Set(lista.map((r) => r[k])).size !== lista.length) throw new Error(`${k} repetido en ${ARCHIVO}`);
  }
  if (lista.some((r) => r.nombre_actual === r.nombre_nuevo))
    throw new Error('Hay filas sin cambio de nombre');
  return lista;
}

export async function renombrar(
  cx: Conexion,
  modo: ModoRenombre,
  lista: Renombre[],
  opciones: { solo?: string[]; usuario?: string } = {},
): Promise<Informe> {
  const elegidas = opciones.solo ? lista.filter((r) => opciones.solo!.includes(r.decision)) : lista;
  const informe: Informe = {
    modo,
    usuario: opciones.usuario ?? null,
    recetas: [],
    totales: { renombrada: 0, 'sin cambio': 0, problema: 0 },
    bitacoraNueva: 0,
    bitacoraAjena: 0,
    transaccion: 'rollback',
  };
  if (opciones.solo && elegidas.length !== opciones.solo.length) {
    informe.error = `Decisiones desconocidas en --solo: ${opciones.solo.filter((d) => !lista.some((r) => r.decision === d)).join(', ')}`;
    return informe;
  }
  if (modo !== 'ensayo' && !opciones.usuario) {
    informe.error =
      'Aplicar o revertir exige --usuario (perfil activo de operaciones o admin); la autoría no queda vacía';
    return informe;
  }
  await cx.query('begin');
  try {
    await cx.query(
      `select set_config('statement_timeout', '15s', true), set_config('lock_timeout', '5s', true)`,
    );
    await cx.query(`select set_config('app.origen', 'carga_masiva', true)`);
    if (opciones.usuario) {
      const p = await cx.query(
        `select 1 from perfiles where user_id = $1 and activo and rol in ('operaciones', 'admin')`,
        [opciones.usuario],
      );
      if (p.rows.length !== 1)
        throw new Error('El usuario indicado no es un perfil activo de operaciones o admin');
      // updated_by y bitacora.usuario_id salen de auth.uid(); sin usuario (solo en ensayo) quedan en null.
      await cx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [opciones.usuario]);
    }
    const ids = elegidas.map((r) => r.receta_id);
    await cx.query(`select id from recetas where id = any($1::uuid[]) order by id for update`, [ids]);
    const maxBitacora = Number(
      (await cx.query<{ m: string }>(`select coalesce(max(id), 0) as m from bitacora`)).rows[0].m,
    );

    const verificadas: number[] = [];

    for (const r of elegidas) {
      const [desde, hacia] =
        modo === 'revertir' ? [r.nombre_nuevo, r.nombre_actual] : [r.nombre_actual, r.nombre_nuevo];
      const ir: InformeReceta = {
        decision: r.decision,
        receta_id: r.receta_id,
        desde,
        hacia,
        resultado: 'problema',
        problemas: [],
      };
      informe.recetas.push(ir);
      const antes = (
        await cx.query<Record<string, unknown>>(`select * from recetas where id = $1`, [r.receta_id])
      ).rows[0];
      if (!antes) {
        ir.problemas.push('la receta no existe');
        continue;
      }
      if (antes.tipo !== 'producto') ir.problemas.push(`es ${antes.tipo}, no producto`);
      if (antes.activo !== true) ir.problemas.push('está inactiva');
      const choque = await cx.query<{ nombre: string }>(
        `select nombre from recetas where id <> $1 and lower(nombre) = lower($2)`,
        [r.receta_id, hacia],
      );
      if (choque.rows.length) ir.problemas.push(`el nombre final choca con «${choque.rows[0].nombre}»`);
      if (antes.nombre === hacia) {
        if (!ir.problemas.length) ir.resultado = 'sin cambio';
        continue;
      }
      if (antes.nombre !== desde) ir.problemas.push(`el nombre actual es «${antes.nombre}», no «${desde}»`);
      if (ir.problemas.length) continue;

      await cx.query('savepoint receta');
      await cx.query(`update recetas set nombre = $2 where id = $1`, [r.receta_id, hacia]);
      const despues = (
        await cx.query<Record<string, unknown>>(`select * from recetas where id = $1`, [r.receta_id])
      ).rows[0];
      ir.version = { antes: Number(antes.version), despues: Number(despues.version) };
      if (despues.nombre !== hacia) ir.problemas.push('el nombre no quedó como se esperaba');
      if (ir.version.despues !== ir.version.antes + 1) ir.problemas.push('la versión no subió exactamente 1');
      const otras = Object.keys(antes).filter(
        (k) => !AUTOMATICAS.includes(k) && JSON.stringify(antes[k]) !== JSON.stringify(despues[k]),
      );
      if (otras.length) ir.problemas.push(`cambiaron otras columnas: ${otras.join(', ')}`);
      const b = await cx.query<
        NonNullable<InformeReceta['bitacora']> & { tabla: string; registro_id: string; receta_id: string }
      >(
        `select id, tabla, registro_id, receta_id, campo, valor_anterior, valor_nuevo, origen, usuario_id
           from bitacora where id > $1 and receta_id = $2 order by id`,
        [maxBitacora, r.receta_id],
      );
      const fila = b.rows[0];
      if (
        b.rows.length !== 1 ||
        fila.tabla !== 'recetas' ||
        fila.registro_id !== r.receta_id ||
        fila.campo !== 'nombre' ||
        fila.valor_anterior !== desde ||
        fila.valor_nuevo !== hacia ||
        fila.origen !== 'carga_masiva' ||
        fila.usuario_id !== (opciones.usuario ?? null)
      ) {
        ir.problemas.push(`bitácora inesperada: ${JSON.stringify(b.rows)}`);
      } else {
        const nota = `${r.decision} · ${modo === 'revertir' ? 'reversión del renombre' : 'renombre'} (conciliación Brasil, docs/conciliacion-brasil/16) · código POS ${r.codigo_pos}`;
        await cx.query(`update bitacora set nota = $2 where id = $1`, [fila.id, nota]);
        verificadas.push(Number(fila.id));
        ir.bitacora = {
          id: Number(fila.id),
          campo: fila.campo,
          valor_anterior: fila.valor_anterior,
          valor_nuevo: fila.valor_nuevo,
          origen: fila.origen,
          usuario_id: fila.usuario_id,
        };
      }
      if (ir.problemas.length) {
        if (ir.bitacora) verificadas.pop();
        await cx.query('rollback to savepoint receta');
      } else {
        await cx.query('release savepoint receta');
        ir.resultado = 'renombrada';
      }
    }

    for (const ir of informe.recetas) informe.totales[ir.resultado]++;
    // Desde maxBitacora: lo de esta transacción (fecha = now()) frente a lo de otras sesiones (otra fecha).
    const nuevas = (
      await cx.query<{ id: string; propia: boolean }>(
        `select id, fecha = now() as propia from bitacora where id > $1 order by id`,
        [maxBitacora],
      )
    ).rows;
    const propias = nuevas.filter((x) => x.propia).map((x) => Number(x.id));
    informe.bitacoraNueva = propias.length;
    informe.bitacoraAjena = nuevas.length - propias.length;
    if (informe.totales.problema)
      throw new Error(`${informe.totales.problema} receta(s) con problemas; no se aplica ninguna`);
    if (
      informe.bitacoraNueva !== informe.totales.renombrada ||
      propias.some((id) => !verificadas.includes(id))
    )
      throw new Error(
        `Esta ejecución dejó ${informe.bitacoraNueva} registros de bitácora (${propias.join(', ')}) y se verificaron ${informe.totales.renombrada} (${verificadas.join(', ')})`,
      );
    if (modo === 'ensayo') {
      await cx.query('rollback');
    } else {
      await cx.query('commit');
      informe.transaccion = 'commit';
    }
  } catch (e) {
    await cx.query('rollback').catch(() => {});
    informe.error = e instanceof Error ? e.message : String(e);
  }
  return informe;
}
