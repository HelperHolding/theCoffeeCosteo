import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { cerrarTransaccion, unirErrores, type Cierre } from './cierre';
import type { Conexion } from './fase4';

/**
 * H2 del documento 22/23: representar el hielo en gramos sin cambiar unidades globalmente ni convertir cantidades.
 * El insumo `HIELO` (ml, $0) no se modifica. Se usa un insumo destino en `gr` con el proveedor y la categoría del origen y
 * con el costo de paquete y la presentación DECLARADOS en el manifiesto como supuesto provisional (no se copia la
 * presentación en ml); su costo unitario debe ser igual al del origen, así que ningún costo cambia. Solo las líneas cuyos
 * números ya coinciden con los gramos del recetario pasan de un insumo al otro con los MISMOS números. Las demás líneas
 * de HIELO se quedan como están.
 * Todo en UNA transacción, con las garantías de recetas-correcciones.ts:
 *  1. lote aprobado: manifiesto con huella fijada en LOTES_HIELO_APROBADOS;
 *  2. perfil obligatorio también en el ensayo (activo, operaciones o admin): updated_by y bitácora;
 *  3. REPEATABLE READ; bloquea el insumo origen, las recetas y las líneas (FOR UPDATE);
 *  4. bloqueo optimista por línea: versión de la receta, insumo origen y cantidades exactas por tamaño. Si la línea ya
 *     usa el destino con las mismas cantidades → «sin cambio» (idempotente);
 *  5. auditoría: el trigger receta_lineas_bitacora registra el cambio de insumo_id (uno por línea, campo insumo_id,
 *     valores anterior y nuevo, receta, autor, carga_masiva). El alta del destino deja su registro en insumos. A todos se
 *     les pone la nota de la ejecución. Cualquier otro registro propio aborta;
 *  6. costos: la huella de v_costo_producto (todos los productos) debe quedar idéntica, igual que linea_cantidades
 *     completa, precios, enlaces POS, el resto de insumos, de líneas y de recetas;
 *  7. cierre verificado (cierre.ts); COMMIT solo en aplicar/revertir.
 * `revertir` exige el id de ejecución: devuelve al origen solo las líneas que esa ejecución cambió, si siguen en el
 * destino y si no hubo registros posteriores de esas recetas. El insumo destino no se borra: si queda sin uso, el informe
 * lo declara como objeto residual (la reversión restaura las líneas, no el catálogo).
 */
export type ModoHielo = 'ensayo' | 'aplicar' | 'revertir';
export interface LineaHielo {
  receta_id: string;
  receta: string;
  version: number;
  linea_id: string;
  pagina: number;
  cantidades: { tamano_id: string; tamano: string; cantidad: number }[];
}
export interface ManifiestoHielo {
  lote: string;
  fuente: { archivo: string; sha256: string };
  origen: { id: string; nombre: string; unidad: 'ml'; costo_paquete: number; presentacion: number };
  /** costo_paquete y presentacion son un supuesto declarado (no validado por Compras); `supuesto` lo explica. */
  destino: { nombre: string; unidad: 'gr'; costo_paquete: number; presentacion: number; supuesto: string };
  lineas: LineaHielo[];
  aprobacion: string;
}

/** Manifiestos aprobados: nombre → ruta y sha256 (LF, sin BOM). Un lote nuevo entra al revisar este cambio. */
export const LOTES_HIELO_APROBADOS: Record<string, { manifiesto: string; sha256: string }> = {
  // Aprobado por Carlo el 2026-10-26: 26 líneas verificadas, sin Cold brew (doc 23).
  'hielo-gramos-lote-1': {
    manifiesto: 'docs/conciliacion-brasil/23-hielo-gramos-lote-1.manifiesto.json',
    sha256: 'e025cb9318532820ab9e771cd56a2752bd205405d4eb50b7af2289533b434d1d',
  },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const normalizar = (t: string) => t.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

export function validarManifiestoHielo(m: ManifiestoHielo) {
  if (!m.lote?.trim()) throw new Error('El manifiesto no declara el lote');
  if (!UUID.test(m.origen?.id ?? '') || m.origen.unidad !== 'ml')
    throw new Error('El insumo origen debe ser un uuid en ml');
  if (!m.destino?.nombre?.trim() || m.destino.unidad !== 'gr' || m.destino.nombre === m.origen.nombre)
    throw new Error('El insumo destino debe tener otro nombre y estar en gr');
  const { costo_paquete, presentacion, supuesto } = m.destino;
  if (
    typeof costo_paquete !== 'number' ||
    !Number.isFinite(costo_paquete) ||
    costo_paquete < 0 ||
    typeof presentacion !== 'number' ||
    !Number.isFinite(presentacion) ||
    presentacion <= 0
  )
    throw new Error('El destino debe declarar costo de paquete y presentación');
  if (!supuesto?.trim()) throw new Error('El destino debe declarar el supuesto de su costo y presentación');
  if (!Array.isArray(m.lineas) || !m.lineas.length) throw new Error('El manifiesto no tiene líneas');
  const vistas = new Set<string>();
  const versiones = new Map<string, number>();
  for (const l of m.lineas) {
    if (![l.receta_id, l.linea_id].every((x) => UUID.test(x ?? '')) || !Number.isInteger(l.version))
      throw new Error(`Identificadores o versión inválidos en ${l.receta}`);
    if (vistas.has(l.linea_id)) throw new Error(`Línea repetida en ${l.receta}`);
    vistas.add(l.linea_id);
    if ((versiones.get(l.receta_id) ?? l.version) !== l.version)
      throw new Error(`Versiones distintas para ${l.receta}`);
    versiones.set(l.receta_id, l.version);
    if (!Number.isInteger(l.pagina) || l.pagina < 1)
      throw new Error(`Falta la página del PDF de ${l.receta}`);
    if (!Array.isArray(l.cantidades) || !l.cantidades.length)
      throw new Error(`La línea de ${l.receta} no declara cantidades`);
    const tamanos = new Set<string>();
    for (const c of l.cantidades) {
      if (!UUID.test(c.tamano_id ?? '') || tamanos.has(c.tamano_id))
        throw new Error(`Tamaño inválido o repetido en ${l.receta}`);
      tamanos.add(c.tamano_id);
      if (typeof c.cantidad !== 'number' || !Number.isFinite(c.cantidad) || c.cantidad <= 0)
        throw new Error(`Cantidad inválida en ${l.receta} ${c.tamano}`);
    }
  }
}

/** Uso de HIELO por celda, con la clasificación de 22-usos-hielo.csv. */
export interface UsoHielo {
  receta_id: string;
  receta: string;
  linea_id: string;
  tamano_id: string;
  tamano: string;
  cantidad: number;
  pagina: number | null;
  verificada: boolean;
}

/**
 * Una línea entra al lote solo si TODAS sus celdas coinciden con los gramos de una ficha del PDF. Una línea con una celda
 * sin verificar (sin ficha, tamaño ausente o distinta al PDF) se conserva entera en el insumo origen.
 */
export function separarLineas(usos: UsoHielo[]) {
  const porLinea = new Map<string, UsoHielo[]>();
  for (const u of usos) porLinea.set(u.linea_id, [...(porLinea.get(u.linea_id) ?? []), u]);
  const migrables: Omit<LineaHielo, 'version'>[] = [];
  const conservadas: { linea_id: string; receta: string; motivo: string }[] = [];
  for (const [linea_id, celdas] of porLinea) {
    const pendientes = celdas.filter((c) => !c.verificada || c.pagina === null);
    if (pendientes.length)
      conservadas.push({
        linea_id,
        receta: celdas[0].receta,
        motivo: `sin verificar: ${pendientes.map((c) => `${c.tamano} ${c.cantidad}`).join(', ')}`,
      });
    else
      migrables.push({
        receta_id: celdas[0].receta_id,
        receta: celdas[0].receta,
        linea_id,
        pagina: celdas[0].pagina!,
        cantidades: celdas.map((c) => ({ tamano_id: c.tamano_id, tamano: c.tamano, cantidad: c.cantidad })),
      });
  }
  return { migrables, conservadas };
}

/**
 * Regenera un manifiesto contra las versiones vigentes, en una transacción de SOLO LECTURA. Solo actualiza `version`:
 * si una línea ya no existe, cambió de receta o de insumo, o sus cantidades no son las del manifiesto, se niega (eso
 * exige una revisión completa, no una regeneración). Devuelve el manifiesto nuevo, marcado como borrador, y la lista de
 * versiones que cambiaron para revisar el diff. No quita el control de versión: el resultado vuelve a fijar una versión.
 */
export async function regenerarVersiones(cx: Conexion, m: ManifiestoHielo) {
  validarManifiestoHielo(m);
  await cx.query('begin read only');
  try {
    const filas = (
      await cx.query<{
        linea_id: string;
        receta_id: string;
        insumo_id: string | null;
        version: number;
        cantidades: string;
      }>(
        `select l.id as linea_id, l.receta_id, l.insumo_id, r.version,
                coalesce(string_agg(lc.tamano_id::text || '=' || lc.cantidad::text, ',' order by lc.tamano_id), '') as cantidades
           from public.receta_lineas l join public.recetas r on r.id = l.receta_id
           left join public.linea_cantidades lc on lc.linea_id = l.id
          where l.id = any ($1::uuid[]) group by l.id, r.version`,
        [m.lineas.map((l) => l.linea_id)],
      )
    ).rows;
    const problemas: string[] = [];
    const cambios: { receta: string; antes: number; ahora: number }[] = [];
    const lineas = m.lineas.map((l) => {
      const f = filas.find((x) => x.linea_id === l.linea_id);
      const esperadas = [...l.cantidades]
        .sort((a, b) => a.tamano_id.localeCompare(b.tamano_id))
        .map((c) => `${c.tamano_id}=${c.cantidad}`)
        .join(',');
      const reales = (f?.cantidades ?? '')
        .split(',')
        .filter(Boolean)
        .map((x) => x.replace(/=(.*)$/, (_, n: string) => `=${Number(n)}`))
        .join(',');
      if (!f) problemas.push(`${l.receta}: la línea no existe`);
      else if (f.receta_id !== l.receta_id) problemas.push(`${l.receta}: la línea cambió de receta`);
      else if (f.insumo_id !== m.origen.id)
        problemas.push(`${l.receta}: la línea ya no usa el insumo origen`);
      else if (reales !== esperadas)
        problemas.push(`${l.receta}: cantidades ${reales}, el manifiesto dice ${esperadas}`);
      const ahora = Number(f?.version ?? l.version);
      if (f && ahora !== l.version && !cambios.some((c) => c.receta === l.receta))
        cambios.push({ receta: l.receta, antes: l.version, ahora });
      return { ...l, version: ahora };
    });
    if (problemas.length)
      throw new Error(`No se regenera: requiere revisión completa del manifiesto. ${problemas.join('; ')}`);
    return {
      manifiesto: {
        ...m,
        lineas,
        aprobacion: `BORRADOR regenerado contra versiones vigentes (${cambios.length} receta(s) con versión nueva); requiere revisión del diff y aprobación expresa.`,
      } satisfies ManifiestoHielo,
      cambios,
    };
  } finally {
    await cx.query('rollback');
  }
}

export async function leerLoteHielo(
  nombre: string,
  raiz = '.',
  aprobados = LOTES_HIELO_APROBADOS,
): Promise<ManifiestoHielo> {
  const entrada = aprobados[nombre];
  if (!entrada) throw new Error(`El lote «${nombre}» no está aprobado (no figura en LOTES_HIELO_APROBADOS)`);
  const texto = normalizar(await readFile(`${raiz}/${entrada.manifiesto}`, 'utf8'));
  const huella = createHash('sha256').update(texto).digest('hex');
  if (huella !== entrada.sha256)
    throw new Error(`El manifiesto de «${nombre}» no es el aprobado (sha256 ${huella}). Requiere revisión.`);
  const m = JSON.parse(texto) as ManifiestoHielo;
  if (m.lote !== nombre) throw new Error(`El manifiesto declara «${m.lote}», no «${nombre}»`);
  validarManifiestoHielo(m);
  return m;
}

export type ResultadoLinea = 'cambiada' | 'sin cambio' | 'revertida' | 'problema';
export interface InformeLinea {
  receta: string;
  linea_id: string;
  resultado: ResultadoLinea;
  bitacora?: number;
  problemas: string[];
}
export interface InformeHielo {
  modo: ModoHielo;
  lote: string;
  usuario: string;
  ejecucion: string;
  destino: { id?: string; creado: boolean };
  /** Objetos que quedan tras la operación y no forman parte de la restauración (p. ej. el destino sin uso). */
  residuos?: string[];
  lineas: InformeLinea[];
  versiones: Record<string, { antes?: number; despues?: number }>;
  totales: Record<ResultadoLinea, number>;
  bitacoraPropia: number;
  bitacoraAjena: number;
  hieloSinMigrar?: { antes: number; despues: number };
  costosSinCambios?: boolean;
  restoSinCambios?: boolean;
  transaccion: Cierre;
  error?: string;
}

/** [nombre, consulta, parámetros]: 'l' = líneas del lote, 'r' = recetas del lote, 'd' = nombre del insumo destino. */
const HUELLAS: [string, string, ('l' | 'r' | 'd')[]][] = [
  ['producto_tamanos', 'select * from public.producto_tamanos', []],
  ['precio_canal_manual', 'select * from public.precio_canal_manual', []],
  ['producto_codigo_pos', 'select * from public.producto_codigo_pos', []],
  ['linea_cantidades', 'select * from public.linea_cantidades', []],
  ['insumos (resto)', 'select * from public.insumos where nombre <> $1', ['d']],
  ['receta_lineas (resto)', 'select * from public.receta_lineas where id <> all ($1::uuid[])', ['l']],
  ['recetas (resto)', 'select * from public.recetas where id <> all ($1::uuid[])', ['r']],
  [
    'recetas del lote (sin versión)',
    `select id, nombre, tipo, categoria_id, rendimiento, unidad_rendimiento, activo from public.recetas
      where id = any ($1::uuid[])`,
    ['r'],
  ],
];
const COSTOS = `select producto_id, tamano_id, round(costo, 6) as costo, usa_inactivo from public.v_costo_producto`;

export async function migrarHielo(
  cx: Conexion,
  modo: ModoHielo,
  m: ManifiestoHielo,
  opciones: { usuario: string; ejecucion?: string },
): Promise<InformeHielo> {
  const ejecucion = modo === 'revertir' ? (opciones.ejecucion ?? '') : (opciones.ejecucion ?? randomUUID());
  const informe: InformeHielo = {
    modo,
    lote: m.lote,
    usuario: opciones.usuario,
    ejecucion,
    destino: { creado: false },
    lineas: m.lineas.map((l) => ({
      receta: l.receta,
      linea_id: l.linea_id,
      resultado: 'problema',
      problemas: [],
    })),
    versiones: {},
    totales: { cambiada: 0, 'sin cambio': 0, revertida: 0, problema: 0 },
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
    validarManifiestoHielo(m);
  } catch (e) {
    informe.error = e instanceof Error ? e.message : String(e);
    return informe;
  }
  const lineas = m.lineas.map((l) => l.linea_id);
  const recetas = [...new Set(m.lineas.map((l) => l.receta_id))].sort();
  const notaEjecucion = `${m.lote}, ejecución ${ejecucion} (docs/conciliacion-brasil/23)`;
  const nota =
    modo === 'revertir'
      ? `${m.lote}, reversión de la ejecución ${ejecucion} (docs/conciliacion-brasil/23)`
      : notaEjecucion;
  const huellas = async () => {
    const h: Record<string, string> = {};
    for (const [nombre, sql, params] of HUELLAS)
      h[nombre] = (
        await cx.query<{ h: string }>(
          `select count(*)::text || ':' || md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h
             from (${sql}) x`,
          params.map((p) => (p === 'l' ? lineas : p === 'r' ? recetas : m.destino.nombre)),
        )
      ).rows[0].h;
    return h;
  };
  const costos = async () =>
    (
      await cx.query<{ h: string }>(
        `select count(*)::text || ':' || md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h from (${COSTOS}) x`,
      )
    ).rows[0].h;
  const contarOrigen = async () =>
    Number(
      (
        await cx.query<{ n: string }>(
          `select count(*) as n from public.receta_lineas where insumo_id = $1 and id <> all ($2::uuid[])`,
          [m.origen.id, lineas],
        )
      ).rows[0].n,
    );

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

    // Insumo origen: intacto y con el costo declarado.
    const o = (
      await cx.query<{
        nombre: string;
        unidad: string;
        costo_paquete: string;
        presentacion: string;
        activo: boolean;
        proveedor_id: string;
        categoria_id: string;
      }>(
        `select nombre, unidad::text, costo_paquete::text, presentacion::text, activo, proveedor_id, categoria_id
           from public.insumos where id = $1 for update`,
        [m.origen.id],
      )
    ).rows[0];
    if (!o) throw new Error('El insumo origen no existe');
    if (
      o.nombre !== m.origen.nombre ||
      o.unidad !== 'ml' ||
      Number(o.costo_paquete) !== m.origen.costo_paquete ||
      Number(o.presentacion) !== m.origen.presentacion ||
      !o.activo
    )
      throw new Error(`El insumo origen no está como declara el manifiesto: ${JSON.stringify(o)}`);

    // Insumo destino: mismo proveedor, categoría, costo de paquete y presentación (mismo costo unitario), en gr.
    let d = (
      await cx.query<{
        id: string;
        unidad: string;
        costo_paquete: string;
        presentacion: string;
        activo: boolean;
        proveedor_id: string;
        categoria_id: string;
      }>(
        `select id, unidad::text, costo_paquete::text, presentacion::text, activo, proveedor_id, categoria_id
           from public.insumos where nombre = $1 for update`,
        [m.destino.nombre],
      )
    ).rows[0];
    const maxBitacora = Number(
      (await cx.query<{ m: string }>(`select coalesce(max(id), 0) as m from bitacora`)).rows[0].m,
    );
    const huellasAntes = await huellas();
    const costosAntes = await costos();
    const origenAntes = await contarOrigen();
    if (!d) {
      if (modo === 'revertir') throw new Error('El insumo destino no existe: nada que revertir');
      d = (
        await cx.query<NonNullable<typeof d>>(
          `insert into public.insumos (nombre, proveedor_id, categoria_id, costo_paquete, presentacion, unidad, activo)
           values ($1, $2, $3, $4, $5, 'gr', true)
           returning id, unidad::text, costo_paquete::text, presentacion::text, activo, proveedor_id, categoria_id`,
          [m.destino.nombre, o.proveedor_id, o.categoria_id, m.destino.costo_paquete, m.destino.presentacion],
        )
      ).rows[0];
      informe.destino.creado = true;
    }
    informe.destino.id = d.id;
    if (
      d.unidad !== 'gr' ||
      !d.activo ||
      d.proveedor_id !== o.proveedor_id ||
      d.categoria_id !== o.categoria_id ||
      Number(d.costo_paquete) !== m.destino.costo_paquete ||
      Number(d.presentacion) !== m.destino.presentacion
    )
      throw new Error(`El insumo destino no está como declara el manifiesto: ${JSON.stringify(d)}`);
    // Ningún costo cambia: el costo unitario del destino debe ser el del origen.
    if (Number(d.costo_paquete) / Number(d.presentacion) !== Number(o.costo_paquete) / Number(o.presentacion))
      throw new Error('El costo unitario del destino no es igual al del origen: cambiaría costos');
    const desde = modo === 'revertir' ? d.id : m.origen.id;
    const hacia = modo === 'revertir' ? m.origen.id : d.id;

    // Recetas y líneas bloqueadas, en orden fijo.
    const rs = (
      await cx.query<{ id: string; nombre: string; version: number }>(
        `select id, nombre, version from public.recetas where id = any ($1::uuid[]) order by id for update`,
        [recetas],
      )
    ).rows;
    for (const r of rs) informe.versiones[r.nombre] = { antes: Number(r.version) };
    const actuales = new Map(
      (
        await cx.query<{ id: string; receta_id: string; insumo_id: string | null; cantidades: string }>(
          `select l.id, l.receta_id, l.insumo_id,
                  coalesce(string_agg(lc.tamano_id::text || '=' || lc.cantidad::text, ',' order by lc.tamano_id), '') as cantidades
             from public.receta_lineas l left join public.linea_cantidades lc on lc.linea_id = l.id
            where l.id = any ($1::uuid[]) group by l.id`,
          [lineas],
        )
      ).rows.map((x) => [x.id, x]),
    );
    await cx.query(`select 1 from public.receta_lineas where id = any ($1::uuid[]) order by id for update`, [
      lineas,
    ]);

    let propiosRevertir: { id: string; registro_id: string; valor_anterior: string; valor_nuevo: string }[] =
      [];
    if (modo === 'revertir') {
      propiosRevertir = (
        await cx.query<{ id: string; registro_id: string; valor_anterior: string; valor_nuevo: string }>(
          `select id, registro_id, valor_anterior, valor_nuevo from bitacora
            where tabla = 'receta_lineas' and campo = 'insumo_id' and nota = $1 order by id`,
          [notaEjecucion],
        )
      ).rows;
      if (!propiosRevertir.length)
        throw new Error(`No hay registros de la ejecución ${ejecucion}: nada que revertir`);
      const ultimo = Math.max(...propiosRevertir.map((p) => Number(p.id)));
      const posteriores = Number(
        (
          await cx.query<{ n: string }>(
            `select count(*) as n from bitacora where receta_id = any ($1::uuid[]) and id > $2`,
            [recetas, ultimo],
          )
        ).rows[0].n,
      );
      if (posteriores)
        throw new Error(`Hubo ${posteriores} cambio(s) posterior(es) en las recetas: no se revierte`);
    }

    const sinCambio = (l: LineaHielo) => actuales.get(l.linea_id)?.insumo_id === hacia;
    const todasSinCambio = modo !== 'revertir' && m.lineas.every(sinCambio);
    m.lineas.forEach((l, i) => {
      const il = informe.lineas[i];
      const a = actuales.get(l.linea_id);
      const r = rs.find((x) => x.id === l.receta_id);
      if (!r) return void il.problemas.push('la receta no existe');
      if (r.nombre !== l.receta) il.problemas.push(`la receta se llama «${r.nombre}»`);
      if (!a) return void il.problemas.push('la línea no existe');
      if (a.receta_id !== l.receta_id) il.problemas.push('la línea no pertenece a la receta');
      const esperadas = [...l.cantidades]
        .sort((x, y) => x.tamano_id.localeCompare(y.tamano_id))
        .map((c) => `${c.tamano_id}=${c.cantidad}`)
        .join(',');
      const reales = a.cantidades
        .split(',')
        .filter(Boolean)
        .map((x) => x.replace(/=(.*)$/, (_, n: string) => `=${Number(n)}`))
        .join(',');
      if (reales !== esperadas) il.problemas.push(`cantidades ${reales}, se esperaban ${esperadas}`);
      if (modo === 'revertir') {
        const p = propiosRevertir.find((x) => x.registro_id === l.linea_id);
        if (!p || p.valor_anterior !== m.origen.id || p.valor_nuevo !== d!.id)
          il.problemas.push('la ejecución no cambió esta línea como declara el manifiesto');
      }
      if (sinCambio(l) && modo !== 'revertir') {
        if (!il.problemas.length) il.resultado = 'sin cambio';
        return;
      }
      if (a.insumo_id !== desde) il.problemas.push(`la línea usa ${a.insumo_id}, se esperaba ${desde}`);
      if (modo !== 'revertir' && !todasSinCambio && Number(r.version) !== l.version)
        il.problemas.push(`versión ${r.version}, el manifiesto espera ${l.version}`);
    });
    if (informe.lineas.some((il) => il.problemas.length))
      throw new Error('Alguna línea no está como declara el manifiesto: no se toca nada');

    const aCambiar = m.lineas.filter((_, i) => informe.lineas[i].resultado !== 'sin cambio');
    if (aCambiar.length) {
      const hechos = (
        await cx.query<{ id: string }>(
          `update public.receta_lineas set insumo_id = $1 where id = any ($2::uuid[]) and insumo_id = $3 returning id`,
          [hacia, aCambiar.map((l) => l.linea_id), desde],
        )
      ).rows;
      if (hechos.length !== aCambiar.length)
        throw new Error(`Se cambiaron ${hechos.length} líneas y se esperaban ${aCambiar.length}`);
    }

    // Verificación: bitácora propia, versiones, costos y huellas del resto.
    const propias = (
      await cx.query<{
        id: string;
        propia: boolean;
        tabla: string;
        registro_id: string;
        receta_id: string | null;
        campo: string;
        valor_anterior: string | null;
        valor_nuevo: string | null;
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
    const usadas = new Set<string>();
    for (const [i, l] of m.lineas.entries()) {
      const il = informe.lineas[i];
      if (il.resultado === 'sin cambio') continue;
      const b = mias.filter((x) => x.tabla === 'receta_lineas' && x.registro_id === l.linea_id);
      if (
        b.length !== 1 ||
        b[0].campo !== 'insumo_id' ||
        b[0].receta_id !== l.receta_id ||
        b[0].valor_anterior !== desde ||
        b[0].valor_nuevo !== hacia ||
        b[0].origen !== 'carga_masiva' ||
        b[0].usuario_id !== opciones.usuario
      )
        il.problemas.push(`bitácora inesperada: ${JSON.stringify(b)}`);
      else {
        il.bitacora = Number(b[0].id);
        usadas.add(b[0].id);
      }
      if (!il.problemas.length) il.resultado = modo === 'revertir' ? 'revertida' : 'cambiada';
    }
    if (informe.destino.creado) {
      const alta = mias.filter((x) => x.tabla === 'insumos' && x.registro_id === d.id && x.campo === '*');
      if (alta.length !== 1 || alta[0].usuario_id !== opciones.usuario || alta[0].origen !== 'carga_masiva')
        throw new Error(`El alta del insumo destino no dejó el registro esperado: ${JSON.stringify(alta)}`);
      usadas.add(alta[0].id);
    }
    const sobrantes = mias.filter((x) => !usadas.has(x.id));
    if (sobrantes.length)
      throw new Error(
        `Esta ejecución dejó ${sobrantes.length} registro(s) de bitácora inesperado(s): no se aplica nada`,
      );
    if (usadas.size)
      await cx.query(`update bitacora set nota = $2 where id = any ($1::bigint[])`, [[...usadas], nota]);

    const despues = (
      await cx.query<{ id: string; nombre: string; version: number }>(
        `select id, nombre, version from public.recetas where id = any ($1::uuid[])`,
        [recetas],
      )
    ).rows;
    for (const r of despues) {
      const v = informe.versiones[r.nombre];
      v.despues = Number(r.version);
      const n = aCambiar.filter((l) => l.receta_id === r.id).length;
      if (v.despues !== (v.antes ?? 0) + n)
        throw new Error(`La versión de ${r.nombre} pasó de ${v.antes} a ${v.despues}; se esperaba +${n}`);
    }
    if (modo === 'revertir') {
      const usos = Number(
        (
          await cx.query<{ n: string }>(
            `select count(*) as n from public.receta_lineas where insumo_id = $1`,
            [d.id],
          )
        ).rows[0].n,
      );
      if (!usos)
        informe.residuos = [
          `insumo «${m.destino.nombre}» (${d.id}) sin uso: objeto residual; no forma parte de la restauración y borrarlo requiere aprobación aparte`,
        ];
    }
    informe.hieloSinMigrar = { antes: origenAntes, despues: await contarOrigen() };
    if (informe.hieloSinMigrar.despues !== informe.hieloSinMigrar.antes)
      throw new Error('Cambiaron líneas de HIELO que no están en el manifiesto');
    informe.costosSinCambios = (await costos()) === costosAntes;
    informe.restoSinCambios = JSON.stringify(await huellas()) === JSON.stringify(huellasAntes);
    for (const il of informe.lineas) {
      if (il.problemas.length) il.resultado = 'problema';
      informe.totales[il.resultado]++;
    }
    if (informe.totales.problema)
      throw new Error(`${informe.totales.problema} línea(s) con problemas: no se aplica nada`);
    if (!informe.costosSinCambios) throw new Error('Cambió el costo de algún producto: no se aplica nada');
    if (!informe.restoSinCambios)
      throw new Error(
        'Cambió algo fuera de las líneas del lote (cantidades, precios, insumos, enlaces u otras recetas)',
      );
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
