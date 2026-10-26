import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { cerrarTransaccion, unirErrores, type Cierre } from './cierre';
import type { Conexion } from './fase4';

/**
 * Renombres por lote para alinear `recetas.nombre` con el nombre literal del POS (docs/conciliacion-brasil/25).
 * Sustituye a renombres-b.ts para lotes nuevos: aquel lee un CSV sin huella, permite el ensayo sin perfil y revierte la
 * lista completa; este exige manifiesto aprobado y revierte por ejecución. renombres-b.ts queda como registro de B1–B6.
 * Lógica independiente de la conexión (CLI con pg, pruebas con PGlite). Todo en UNA transacción:
 *  1. lote aprobado: manifiesto con huella fijada en LOTES_RENOMBRES_APROBADOS; por fila fija UUID, nombre previo,
 *     nombre nuevo (el literal del POS, salvo una excepción declarada), versión esperada y código POS. La escritura no
 *     usa similitud: solo aplica lo que dice cada fila;
 *  2. perfil obligatorio también en el ensayo (activo, operaciones o admin): updated_by y bitácora;
 *  3. REPEATABLE READ; bloquea las recetas del lote (FOR UPDATE, en orden fijo);
 *  4. por fila: producto activo, nombre y versión esperados. Unicidad del nombre nuevo contra TODAS las recetas
 *     (productos y subrecetas, activas o no), comparando sin mayúsculas, acentos ni espacios repetidos. Si todas las
 *     filas ya tienen el nombre nuevo → «sin cambio» (idempotente);
 *  5. solo cambian `nombre`, `version`, `updated_at` y `updated_by` de esas recetas; huellas de precios, precios manuales,
 *     insumos, líneas, cantidades, enlaces POS, el resto de recetas y costos/márgenes de v_resumen deben quedar iguales;
 *  6. bitácora: exactamente un registro `recetas.nombre` por receta cambiada (origen carga_masiva, autor), con la nota
 *     de la ejecución. Cualquier otro registro propio aborta;
 *  7. cierre verificado (cierre.ts): COMMIT solo en aplicar/revertir; COMMIT incierto o ROLLBACK fallido se informan.
 * `revertir` exige el id de ejecución: devuelve el nombre previo solo a las recetas que esa ejecución cambió, si siguen
 * con el nombre nuevo y sin registros posteriores en la bitácora (no pisa ediciones posteriores).
 */
export type ModoRenombre = 'ensayo' | 'aplicar' | 'revertir';
export interface FilaRenombre {
  id: string;
  receta_id: string;
  nombre_previo: string;
  nombre_nuevo: string;
  version: number;
  codigo_pos: string;
  /** Nombre del POS tal como llega (sin tocar). Igual a nombre_nuevo salvo excepción declarada. */
  nombre_pos: string;
  /** Solo si nombre_nuevo ≠ nombre_pos: la excepción de presentación aprobada (p. ej. B7). */
  excepcion?: string;
  evidencia: string;
}
export interface ManifiestoRenombres {
  lote: string;
  fuente: string;
  renombres: FilaRenombre[];
  aprobacion: string;
}

/** Manifiestos aprobados: nombre → ruta y sha256 (LF, sin BOM). Un lote nuevo entra al revisar este cambio. */
export const LOTES_RENOMBRES_APROBADOS: Record<string, { manifiesto: string; sha256: string }> = {
  'nombres-pos-lote-1': {
    manifiesto: 'docs/conciliacion-brasil/25-nombres-pos-lote-1.manifiesto.json',
    sha256: '8abae7c56259a75a0ddeecf83743272285eec9985ed2c7d82aa90bcd056ca24a',
  },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const normalizarTexto = (t: string) => t.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
/** Clave de comparación para choques: sin mayúsculas, acentos ni espacios repetidos. Solo detecta; nunca escribe. */
export const claveNombre = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export function validarManifiestoRenombres(m: ManifiestoRenombres) {
  if (!m.lote?.trim()) throw new Error('El manifiesto no declara el lote');
  if (!Array.isArray(m.renombres) || !m.renombres.length) throw new Error('El manifiesto no tiene renombres');
  const vistos = { id: new Set<string>(), receta: new Set<string>(), nuevo: new Set<string>() };
  for (const f of m.renombres) {
    if (!UUID.test(f.receta_id ?? '') || !Number.isInteger(f.version))
      throw new Error(`UUID o versión inválidos en ${f.id}`);
    for (const k of ['id', 'nombre_previo', 'nombre_nuevo', 'codigo_pos', 'nombre_pos', 'evidencia'] as const)
      if (typeof f[k] !== 'string' || !f[k].trim()) throw new Error(`Falta ${k} en ${f.id}`);
    if (f.nombre_nuevo !== f.nombre_nuevo.trim() || f.nombre_previo !== f.nombre_previo.trim())
      throw new Error(`Espacios al borde en ${f.id}`);
    if (f.nombre_previo === f.nombre_nuevo) throw new Error(`${f.id} no cambia el nombre`);
    if (f.nombre_nuevo !== f.nombre_pos && !f.excepcion?.trim())
      throw new Error(`${f.id}: el nombre nuevo no es el literal del POS y no declara excepción`);
    if (
      vistos.id.has(f.id) ||
      vistos.receta.has(f.receta_id) ||
      vistos.nuevo.has(claveNombre(f.nombre_nuevo))
    )
      throw new Error(`Fila repetida (id, receta o nombre nuevo) en ${f.id}`);
    vistos.id.add(f.id);
    vistos.receta.add(f.receta_id);
    vistos.nuevo.add(claveNombre(f.nombre_nuevo));
  }
}

export async function leerLoteRenombres(
  nombre: string,
  raiz = '.',
  aprobados = LOTES_RENOMBRES_APROBADOS,
): Promise<ManifiestoRenombres> {
  const entrada = aprobados[nombre];
  if (!entrada)
    throw new Error(`El lote «${nombre}» no está aprobado (no figura en LOTES_RENOMBRES_APROBADOS)`);
  const texto = normalizarTexto(await readFile(`${raiz}/${entrada.manifiesto}`, 'utf8'));
  const huella = createHash('sha256').update(texto).digest('hex');
  if (huella !== entrada.sha256)
    throw new Error(`El manifiesto de «${nombre}» no es el aprobado (sha256 ${huella}). Requiere revisión.`);
  const m = JSON.parse(texto) as ManifiestoRenombres;
  if (m.lote !== nombre) throw new Error(`El manifiesto declara «${m.lote}», no «${nombre}»`);
  validarManifiestoRenombres(m);
  return m;
}

export type ResultadoFila = 'renombrada' | 'sin cambio' | 'revertida' | 'problema';
export interface InformeFila {
  id: string;
  receta_id: string;
  desde: string;
  hacia: string;
  resultado: ResultadoFila;
  version?: { antes: number; despues?: number };
  bitacora?: number;
  problemas: string[];
}
export interface InformeRenombres {
  modo: ModoRenombre;
  lote: string;
  usuario: string;
  ejecucion: string;
  filas: InformeFila[];
  totales: Record<ResultadoFila, number>;
  bitacoraPropia: number;
  bitacoraAjena: number;
  costosSinCambios?: boolean;
  restoSinCambios?: boolean;
  transaccion: Cierre;
  error?: string;
}

/** [nombre, consulta, parámetros]: 'r' = recetas del lote. */
const HUELLAS: [string, string, 'r'[]][] = [
  ['producto_tamanos', 'select * from public.producto_tamanos', []],
  ['precio_canal_manual', 'select * from public.precio_canal_manual', []],
  ['insumos', 'select * from public.insumos', []],
  ['receta_lineas', 'select * from public.receta_lineas', []],
  ['linea_cantidades', 'select * from public.linea_cantidades', []],
  ['producto_codigo_pos', 'select * from public.producto_codigo_pos', []],
  ['recetas (resto)', 'select * from public.recetas where id <> all ($1::uuid[])', ['r']],
  [
    'recetas del lote (sin nombre ni versión)',
    `select id, tipo, categoria_id, rendimiento, unidad_rendimiento, activo from public.recetas
      where id = any ($1::uuid[])`,
    ['r'],
  ],
];
const COSTOS = `select producto_id, tamano_id, canal_id, round(costo, 6) as costo, precio_canal, round(margen, 6) as margen
                  from public.v_resumen`;

export async function renombrarLote(
  cx: Conexion,
  modo: ModoRenombre,
  m: ManifiestoRenombres,
  opciones: { usuario: string; ejecucion?: string },
): Promise<InformeRenombres> {
  const ejecucion = modo === 'revertir' ? (opciones.ejecucion ?? '') : (opciones.ejecucion ?? randomUUID());
  const informe: InformeRenombres = {
    modo,
    lote: m.lote,
    usuario: opciones.usuario,
    ejecucion,
    filas: m.renombres.map((f) => ({
      id: f.id,
      receta_id: f.receta_id,
      desde: modo === 'revertir' ? f.nombre_nuevo : f.nombre_previo,
      hacia: modo === 'revertir' ? f.nombre_previo : f.nombre_nuevo,
      resultado: 'problema',
      problemas: [],
    })),
    totales: { renombrada: 0, 'sin cambio': 0, revertida: 0, problema: 0 },
    bitacoraPropia: 0,
    bitacoraAjena: 0,
    transaccion: 'rollback',
  };
  if (!opciones.usuario) {
    informe.error =
      'Falta --usuario (perfil activo de operaciones o admin), obligatorio también en el ensayo';
    return informe;
  }
  if (!UUID.test(ejecucion)) {
    informe.error = modo === 'revertir' ? 'Revertir exige --ejecucion <uuid>' : 'Id de ejecución inválido';
    return informe;
  }
  try {
    validarManifiestoRenombres(m);
  } catch (e) {
    informe.error = e instanceof Error ? e.message : String(e);
    return informe;
  }
  const ids = m.renombres.map((f) => f.receta_id).sort();
  const notaEjecucion = `${m.lote}, ejecución ${ejecucion} (docs/conciliacion-brasil/25)`;
  const nota =
    modo === 'revertir'
      ? `${m.lote}, reversión de la ejecución ${ejecucion} (docs/conciliacion-brasil/25)`
      : notaEjecucion;
  const huella = async (sql: string, p: unknown[] = []) =>
    (
      await cx.query<{ h: string }>(
        `select count(*)::text || ':' || md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h from (${sql}) x`,
        p,
      )
    ).rows[0].h;
  const huellas = async () => {
    const h: Record<string, string> = {};
    for (const [nombre, sql, params] of HUELLAS)
      h[nombre] = await huella(
        sql,
        params.map(() => ids),
      );
    return h;
  };

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
    await cx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [opciones.usuario]);

    const rs = new Map(
      (
        await cx.query<{ id: string; nombre: string; tipo: string; activo: boolean; version: number }>(
          `select id, nombre, tipo, activo, version from public.recetas where id = any ($1::uuid[]) order by id for update`,
          [ids],
        )
      ).rows.map((r) => [r.id, r]),
    );
    const todas = (await cx.query<{ id: string; nombre: string }>(`select id, nombre from public.recetas`))
      .rows;
    const maxBitacora = Number(
      (await cx.query<{ m: string }>(`select coalesce(max(id), 0) as m from bitacora`)).rows[0].m,
    );
    const huellasAntes = await huellas();
    const costosAntes = await huella(COSTOS);

    let propiosRevertir: { id: string; registro_id: string; valor_anterior: string; valor_nuevo: string }[] =
      [];
    if (modo === 'revertir') {
      propiosRevertir = (
        await cx.query<{ id: string; registro_id: string; valor_anterior: string; valor_nuevo: string }>(
          `select id, registro_id, valor_anterior, valor_nuevo from bitacora
            where tabla = 'recetas' and campo = 'nombre' and nota = $1 order by id`,
          [notaEjecucion],
        )
      ).rows;
      if (!propiosRevertir.length)
        throw new Error(`No hay registros de la ejecución ${ejecucion}: nada que revertir`);
    }

    const todasSinCambio =
      modo !== 'revertir' && m.renombres.every((f) => rs.get(f.receta_id)?.nombre === f.nombre_nuevo);
    for (const [i, f] of m.renombres.entries()) {
      const fi = informe.filas[i];
      const r = rs.get(f.receta_id);
      if (!r) {
        fi.problemas.push('la receta no existe');
        continue;
      }
      fi.version = { antes: Number(r.version) };
      if (r.tipo !== 'producto') fi.problemas.push(`es ${r.tipo}, no producto`);
      if (!r.activo) fi.problemas.push('está inactiva');
      const choques = todas.filter(
        (x) => x.id !== f.receta_id && claveNombre(x.nombre) === claveNombre(fi.hacia),
      );
      if (choques.length)
        fi.problemas.push(
          `el nombre «${fi.hacia}» choca con ${choques.map((x) => `«${x.nombre}»`).join(', ')}`,
        );
      if (modo === 'revertir') {
        const p = propiosRevertir.find((x) => x.registro_id === f.receta_id);
        if (!p || p.valor_anterior !== f.nombre_previo || p.valor_nuevo !== f.nombre_nuevo)
          fi.problemas.push('la ejecución no renombró esta receta como declara el manifiesto');
        else {
          const posteriores = Number(
            (
              await cx.query<{ n: string }>(
                `select count(*) as n from bitacora where receta_id = $1 and id > $2`,
                [f.receta_id, p.id],
              )
            ).rows[0].n,
          );
          if (posteriores) fi.problemas.push(`hubo ${posteriores} cambio(s) posterior(es): no se revierte`);
        }
      }
      if (todasSinCambio) {
        if (!fi.problemas.length) fi.resultado = 'sin cambio';
        continue;
      }
      if (r.nombre !== fi.desde) fi.problemas.push(`el nombre actual es «${r.nombre}», no «${fi.desde}»`);
      if (modo !== 'revertir' && Number(r.version) !== f.version)
        fi.problemas.push(`versión ${r.version}, el manifiesto espera ${f.version}`);
    }
    if (informe.filas.some((fi) => fi.problemas.length))
      throw new Error('Alguna fila no está como declara el manifiesto: no se renombra nada');

    const aCambiar = informe.filas.filter((fi) => fi.resultado !== 'sin cambio');
    if (aCambiar.length) {
      const hechos = (
        await cx.query<{ id: string }>(
          `update public.recetas r set nombre = v.hacia
             from unnest($1::uuid[], $2::text[], $3::text[]) as v(id, desde, hacia)
            where r.id = v.id and r.nombre = v.desde returning r.id`,
          [
            aCambiar.map((fi) => fi.receta_id),
            aCambiar.map((fi) => fi.desde),
            aCambiar.map((fi) => fi.hacia),
          ],
        )
      ).rows;
      if (hechos.length !== aCambiar.length)
        throw new Error(`Se renombraron ${hechos.length} recetas y se esperaban ${aCambiar.length}`);
    }

    // Verificación: nombres, versiones, bitácora propia, costos y huellas del resto.
    const despues = new Map(
      (
        await cx.query<{ id: string; nombre: string; version: number }>(
          `select id, nombre, version from public.recetas where id = any ($1::uuid[])`,
          [ids],
        )
      ).rows.map((r) => [r.id, r]),
    );
    const propias = (
      await cx.query<{
        id: string;
        propia: boolean;
        tabla: string;
        registro_id: string;
        receta_id: string | null;
        campo: string;
        valor_anterior: string;
        valor_nuevo: string;
        origen: string;
        usuario_id: string | null;
      }>(
        `select id, fecha = now() as propia, tabla, registro_id, receta_id, campo, valor_anterior, valor_nuevo, origen,
                usuario_id from bitacora where id > $1 order by id`,
        [maxBitacora],
      )
    ).rows;
    const mias = propias.filter((b) => b.propia);
    informe.bitacoraPropia = mias.length;
    informe.bitacoraAjena = propias.length - mias.length;
    for (const fi of informe.filas) {
      const d = despues.get(fi.receta_id)!;
      fi.version!.despues = Number(d.version);
      if (fi.resultado === 'sin cambio') {
        if (fi.version!.despues !== fi.version!.antes) fi.problemas.push('la versión cambió sin renombrar');
        continue;
      }
      if (d.nombre !== fi.hacia) fi.problemas.push(`quedó «${d.nombre}», se esperaba «${fi.hacia}»`);
      if (fi.version!.despues !== fi.version!.antes + 1)
        fi.problemas.push('la versión no subió exactamente 1');
      const b = mias.filter((x) => x.receta_id === fi.receta_id);
      if (
        b.length !== 1 ||
        b[0].tabla !== 'recetas' ||
        b[0].registro_id !== fi.receta_id ||
        b[0].campo !== 'nombre' ||
        b[0].valor_anterior !== fi.desde ||
        b[0].valor_nuevo !== fi.hacia ||
        b[0].origen !== 'carga_masiva' ||
        b[0].usuario_id !== opciones.usuario
      )
        fi.problemas.push(`bitácora inesperada: ${JSON.stringify(b)}`);
      else {
        fi.bitacora = Number(b[0].id);
        await cx.query(`update bitacora set nota = $2 where id = $1`, [b[0].id, nota]);
      }
      if (!fi.problemas.length) fi.resultado = modo === 'revertir' ? 'revertida' : 'renombrada';
    }
    if (mias.length !== aCambiar.length)
      throw new Error(
        `Esta ejecución dejó ${mias.length} registros de bitácora y se esperaban ${aCambiar.length}: no se aplica nada`,
      );
    informe.costosSinCambios = (await huella(COSTOS)) === costosAntes;
    informe.restoSinCambios = JSON.stringify(await huellas()) === JSON.stringify(huellasAntes);
    for (const fi of informe.filas) {
      if (fi.problemas.length) fi.resultado = 'problema';
      informe.totales[fi.resultado]++;
    }
    if (informe.totales.problema)
      throw new Error(`${informe.totales.problema} fila(s) con problemas: no se renombra nada`);
    if (!informe.costosSinCambios) throw new Error('Cambió algún costo, precio o margen: no se aplica nada');
    if (!informe.restoSinCambios)
      throw new Error('Cambió algo fuera del nombre de las recetas del lote: no se aplica nada');
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
