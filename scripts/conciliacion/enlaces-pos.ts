import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { cerrarTransaccion, unirErrores, type Cierre } from './cierre';
import type { Conexion } from './fase4';

/**
 * Lote 1 de códigos POS → recetas (tabla producto_codigo_pos, migración 22). Lógica independiente de la conexión: la
 * usa el CLI con pg y las pruebas con PGlite. Todo en UNA transacción:
 *  1. lote fijado: 17-lote-1.csv con cabecera, 57 filas, tipos, sin repetidos y sha256 esperados; cualquier variación
 *     detiene todo (se revisa y se decide, no se ajusta el número para que pase);
 *  2. perfil obligatorio (activo, operaciones o admin) también en el ensayo: queda en creado_por y en la bitácora;
 *  3. bloquea la tabla de enlaces (escrituras concurrentes) y las recetas del lote (FOR SHARE: nadie las renombra ni
 *     desactiva mientras tanto) y verifica cada receta: existe, es producto, está activa y conserva el nombre esperado;
 *  4. por código: sin enlace → alta con carga_id de esta ejecución; enlace idéntico (receta, nombre observado y
 *     evidencia) → sin cambio; cualquier otra diferencia → conflicto. Un solo problema aborta toda la carga;
 *  5. bitácora: solo cuenta los registros de esta transacción (fecha = now()) y deben ser exactamente uno por fila
 *     dada de alta o baja; la actividad de otras sesiones solo se informa;
 *  6. verifica que recetas, tamaños/precios, precios manuales, líneas, cantidades e insumos no cambien (huellas);
 *  7. aislamiento REPEATABLE READ: una instantánea para toda la ejecución;
 *  8. el cierre se verifica (cierre.ts): si COMMIT o ROLLBACK fallan, se informa `fallida` con el error;
 *  9. COMMIT solo en aplicar/revertir; el ensayo y cualquier problema terminan en ROLLBACK.
 * `revertir` borra solo las filas de una carga (carga_id) que sigan exactamente como se cargaron; nunca por código.
 */
export type ModoEnlaces = 'ensayo' | 'aplicar' | 'revertir';
export interface Enlace {
  codigo: string;
  receta_id: string;
  receta_nombre: string;
  nombre_observado: string;
  evidencia: string;
}
export const ARCHIVO_LOTE = 'docs/conciliacion-brasil/17-lote-1.csv';
/** Identidad fijada del lote 1 (contenido con saltos de línea LF y sin BOM). Cambiarla exige revisión. */
export const LOTE_ESPERADO = {
  filas: 57,
  sha256: '5c36c6ce7b9a4a24b5542e663703e637b0b583316e064ed50752c3e29486f357',
};
const CABECERA = 'codigo,receta_id,receta_nombre,nombre_observado,evidencia';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CODIGO = /^[A-Z0-9]+$/;
/** Tablas comerciales que la carga no debe tocar: se compara una huella antes y después dentro de la transacción. */
const COMERCIALES = [
  'recetas',
  'producto_tamanos',
  'precio_canal_manual',
  'receta_lineas',
  'linea_cantidades',
  'insumos',
];

function celdas(linea: string) {
  const c: string[] = [];
  let x = '';
  let q = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (q) {
      if (ch === '"' && linea[i + 1] === '"') {
        x += '"';
        i++;
      } else if (ch === '"') q = false;
      else x += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      c.push(x);
      x = '';
    } else x += ch;
  }
  if (q) throw new Error(`Comillas sin cerrar: ${linea}`);
  c.push(x);
  return c;
}

/** Lee y valida el lote; `esperado` solo se sustituye en pruebas. */
export async function leerLote(
  raiz = '.',
  esperado = LOTE_ESPERADO,
  archivo = ARCHIVO_LOTE,
): Promise<Enlace[]> {
  const texto = (await readFile(`${raiz}/${archivo}`, 'utf8')).replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const huella = createHash('sha256').update(texto).digest('hex');
  const [cabecera, ...lineas] = texto.replace(/\n$/, '').split('\n');
  if (cabecera !== CABECERA) throw new Error(`Cabecera inesperada en ${archivo}`);
  const lote = lineas.map((l) => {
    const v = celdas(l);
    if (v.length !== 5 || v.some((x) => x !== x.trim() || x === '')) throw new Error(`Fila inválida: ${l}`);
    const [codigo, receta_id, receta_nombre, nombre_observado, evidencia] = v;
    if (!CODIGO.test(codigo) || codigo === 'GENERIC') throw new Error(`Código inválido: ${codigo}`);
    if (!UUID.test(receta_id)) throw new Error(`receta_id inválido: ${receta_id}`);
    return { codigo, receta_id, receta_nombre, nombre_observado, evidencia };
  });
  for (const k of ['codigo', 'receta_id'] as const)
    if (new Set(lote.map((f) => f[k])).size !== lote.length) throw new Error(`${k} repetido en ${archivo}`);
  if (lote.length !== esperado.filas || huella !== esperado.sha256)
    throw new Error(
      `El lote no es el revisado: ${lote.length} filas, sha256 ${huella} (esperado ${esperado.filas}, ${esperado.sha256}). Requiere revisión y decisión.`,
    );
  return lote;
}

export type Resultado = 'alta' | 'sin cambio' | 'baja' | 'problema';
export interface InformeEnlace {
  codigo: string;
  receta_id: string;
  resultado: Resultado;
  id?: string;
  bitacora?: number;
  problemas: string[];
}
export interface InformeEnlaces {
  modo: ModoEnlaces;
  usuario: string;
  carga_id: string;
  /** Huella del contenido del lote recibido (el CLI además exige el sha256 fijado del archivo). */
  lote: { filas: number; huella: string };
  antes: { filasEnTabla: number; delLote: number; deEstaCarga: number };
  despues?: { filasEnTabla: number; delLote: number; deEstaCarga: number };
  enlaces: InformeEnlace[];
  totales: Record<Resultado, number>;
  idsPropios: string[];
  bitacoraPropia: number;
  bitacoraAjena: number;
  comercialSinCambios?: boolean;
  /** Resultado real del cierre; `fallida` si COMMIT o ROLLBACK no se confirmaron (ver error). */
  transaccion: Cierre;
  error?: string;
}

const iguales = (a: Record<string, unknown>, f: Enlace) =>
  a.receta_id === f.receta_id && a.nombre_observado === f.nombre_observado && a.evidencia === f.evidencia;

export async function enlazar(
  cx: Conexion,
  modo: ModoEnlaces,
  lote: Enlace[],
  opciones: { usuario: string; carga?: string },
): Promise<InformeEnlaces> {
  const carga = modo === 'revertir' ? (opciones.carga ?? '') : (opciones.carga ?? randomUUID());
  const informe: InformeEnlaces = {
    modo,
    usuario: opciones.usuario,
    carga_id: carga,
    lote: { filas: lote.length, huella: '' },
    antes: { filasEnTabla: 0, delLote: 0, deEstaCarga: 0 },
    enlaces: [],
    totales: { alta: 0, 'sin cambio': 0, baja: 0, problema: 0 },
    idsPropios: [],
    bitacoraPropia: 0,
    bitacoraAjena: 0,
    transaccion: 'rollback',
  };
  informe.lote.huella = createHash('sha256')
    .update(lote.map((f) => Object.values(f).join('\u0000')).join('\n'))
    .digest('hex');
  if (!opciones.usuario) {
    informe.error =
      'Falta --usuario (perfil activo de operaciones o admin), obligatorio también en el ensayo';
    return informe;
  }
  if (!UUID.test(carga)) {
    informe.error =
      modo === 'revertir' ? 'Revertir exige --carga <uuid> de la ejecución' : 'carga_id inválido';
    return informe;
  }
  const codigos = lote.map((f) => f.codigo);
  const conteo = async () => {
    const r = (
      await cx.query<{ t: string; l: string; c: string }>(
        `select count(*) as t, count(*) filter (where codigo = any($1)) as l, count(*) filter (where carga_id = $2) as c
           from producto_codigo_pos`,
        [codigos, carga],
      )
    ).rows[0];
    return { filasEnTabla: Number(r.t), delLote: Number(r.l), deEstaCarga: Number(r.c) };
  };
  // Una consulta a la vez: una sola conexión pg no admite consultas concurrentes dentro de la transacción.
  const huellas = async () => {
    const h: Record<string, string> = {};
    for (const t of COMERCIALES)
      h[t] = (
        await cx.query<{ h: string }>(
          `select md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h from public.${t} x`,
        )
      ).rows[0].h;
    return h;
  };

  // REPEATABLE READ: las huellas comerciales y la bitácora se leen en la misma instantánea; un cambio concurrente
  // sobre las filas bloqueadas aborta la carga (error de serialización) en vez de mezclarse con ella.
  await cx.query('begin isolation level repeatable read');
  let fin: 'commit' | 'rollback' = 'rollback';
  try {
    await cx.query(
      `select set_config('statement_timeout', '15s', true), set_config('lock_timeout', '5s', true),
              set_config('idle_in_transaction_session_timeout', '60s', true), set_config('app.origen', 'carga_masiva', true)`,
    );
    const perfil = await cx.query(
      `select 1 from perfiles where user_id = $1 and activo and rol in ('operaciones', 'admin')`,
      [opciones.usuario],
    );
    if (perfil.rows.length !== 1)
      throw new Error('El usuario indicado no es un perfil activo de operaciones o admin');
    // creado_por y bitacora.usuario_id salen de auth.uid().
    await cx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [opciones.usuario]);
    if (
      !(await cx.query<{ e: boolean }>(`select to_regclass('public.producto_codigo_pos') is not null as e`))
        .rows[0].e
    )
      throw new Error('La tabla producto_codigo_pos no existe (migración 22 no aplicada)');
    await cx.query('lock table public.producto_codigo_pos in share row exclusive mode');
    const huellasAntes = await huellas();
    informe.antes = await conteo();
    const maxBitacora = Number(
      (await cx.query<{ m: string }>(`select coalesce(max(id), 0) as m from bitacora`)).rows[0].m,
    );
    const esperadas: string[] = [];

    if (modo === 'revertir') {
      const filas = (
        await cx.query<Record<string, unknown>>(
          `select * from producto_codigo_pos where carga_id = $1 order by codigo for update`,
          [carga],
        )
      ).rows;
      if (!filas.length) throw new Error(`No hay filas de la carga ${carga}: nada que revertir`);
      for (const a of filas) {
        const f = lote.find((x) => x.codigo === a.codigo);
        const ir: InformeEnlace = {
          codigo: String(a.codigo),
          receta_id: String(a.receta_id),
          resultado: 'problema',
          id: String(a.id),
          problemas: [],
        };
        informe.enlaces.push(ir);
        if (!f) ir.problemas.push('el código no pertenece al lote');
        else if (!iguales(a, f))
          ir.problemas.push('la fila cambió desde la carga (receta, nombre o evidencia)');
        if (ir.problemas.length) continue;
        await cx.query(`delete from producto_codigo_pos where id = $1`, [a.id]);
        ir.resultado = 'baja';
        esperadas.push(String(a.id));
      }
    } else {
      const recetas = new Map(
        (
          await cx.query<{ id: string; nombre: string; tipo: string; activo: boolean }>(
            `select id, nombre, tipo, activo from recetas where id = any($1::uuid[]) order by id for share`,
            [lote.map((f) => f.receta_id)],
          )
        ).rows.map((r) => [r.id, r]),
      );
      const existentes = new Map(
        (
          await cx.query<Record<string, unknown>>(
            `select * from producto_codigo_pos where codigo = any($1)`,
            [codigos],
          )
        ).rows.map((r) => [String(r.codigo), r]),
      );
      for (const f of lote) {
        const ir: InformeEnlace = {
          codigo: f.codigo,
          receta_id: f.receta_id,
          resultado: 'problema',
          problemas: [],
        };
        informe.enlaces.push(ir);
        const r = recetas.get(f.receta_id);
        if (!r) ir.problemas.push('la receta no existe');
        else {
          if (r.tipo !== 'producto') ir.problemas.push(`la receta es ${r.tipo}, no producto`);
          if (!r.activo) ir.problemas.push('la receta está inactiva');
          if (r.nombre !== f.receta_nombre)
            ir.problemas.push(`la receta se llama «${r.nombre}», no «${f.receta_nombre}»`);
        }
        const ya = existentes.get(f.codigo);
        if (ya) {
          ir.id = String(ya.id);
          if (!iguales(ya, f))
            ir.problemas.push(
              ya.receta_id === f.receta_id
                ? 'el código ya existe con otro nombre observado o evidencia'
                : `el código ya está ligado a otra receta (${ya.receta_id})`,
            );
          else if (!ir.problemas.length) ir.resultado = 'sin cambio';
          continue;
        }
        if (ir.problemas.length) continue;
        const nuevo = (
          await cx.query<{ id: string; creado_por: string | null; carga_id: string }>(
            `insert into producto_codigo_pos (codigo, receta_id, nombre_observado, evidencia, carga_id)
             values ($1, $2, $3, $4, $5) returning id, creado_por, carga_id`,
            [f.codigo, f.receta_id, f.nombre_observado, f.evidencia, carga],
          )
        ).rows[0];
        ir.id = nuevo.id;
        if (nuevo.creado_por !== opciones.usuario || nuevo.carga_id !== carga)
          ir.problemas.push('autoría o carga_id inesperados en la fila nueva');
        else {
          ir.resultado = 'alta';
          esperadas.push(nuevo.id);
        }
      }
    }

    // Bitácora de esta transacción (fecha = now()) frente a la de otras sesiones; un registro por alta o baja.
    const nuevas = (
      await cx.query<{
        id: string;
        propia: boolean;
        tabla: string;
        registro_id: string;
        campo: string;
        origen: string;
        usuario_id: string | null;
        fila: { codigo?: string; receta_id?: string } | null;
      }>(
        `select id, fecha = now() as propia, tabla, registro_id, campo, origen, usuario_id,
                case when fecha = now() and campo = '*' then coalesce(valor_nuevo, valor_anterior)::jsonb end as fila
           from bitacora where id > $1 order by id`,
        [maxBitacora],
      )
    ).rows;
    const propias = nuevas.filter((b) => b.propia);
    informe.bitacoraPropia = propias.length;
    informe.bitacoraAjena = nuevas.length - propias.length;
    for (const ir of informe.enlaces.filter((x) => x.resultado === 'alta' || x.resultado === 'baja')) {
      const b = propias.filter((x) => x.registro_id === ir.id);
      const ok =
        b.length === 1 &&
        b[0].tabla === 'producto_codigo_pos' &&
        b[0].campo === '*' &&
        b[0].origen === 'carga_masiva' &&
        b[0].usuario_id === opciones.usuario &&
        b[0].fila?.codigo === ir.codigo &&
        b[0].fila?.receta_id === ir.receta_id;
      if (!ok) {
        ir.problemas.push(`bitácora inesperada: ${JSON.stringify(b)}`);
        ir.resultado = 'problema';
        continue;
      }
      ir.bitacora = Number(b[0].id);
      await cx.query(`update bitacora set nota = $2 where id = $1`, [
        b[0].id,
        `${modo === 'revertir' ? 'Reversión de la carga' : 'Lote 1 SKU, carga'} ${carga} (docs/conciliacion-brasil/17)`,
      ]);
    }
    if (propias.length !== esperadas.length || propias.some((b) => !esperadas.includes(b.registro_id)))
      throw new Error(
        `Esta ejecución dejó ${propias.length} registros de bitácora y se esperaban ${esperadas.length}: no se aplica nada`,
      );

    for (const ir of informe.enlaces) informe.totales[ir.resultado]++;
    informe.idsPropios = esperadas;
    informe.despues = await conteo();
    informe.comercialSinCambios = JSON.stringify(await huellas()) === JSON.stringify(huellasAntes);
    if (informe.totales.problema)
      throw new Error(`${informe.totales.problema} código(s) con problemas: no se aplica ninguno`);
    if (!informe.comercialSinCambios)
      throw new Error('Cambiaron datos comerciales (recetas, precios o costos): ROLLBACK');
    if (modo !== 'ensayo') fin = 'commit';
  } catch (e) {
    informe.error = e instanceof Error ? e.message : String(e);
    fin = 'rollback';
  }
  const cierre = await cerrarTransaccion(cx, fin);
  informe.transaccion = cierre.transaccion;
  informe.error = unirErrores(informe.error, cierre.error);
  if (!informe.error) delete informe.error;
  return informe;
}
