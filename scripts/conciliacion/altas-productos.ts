import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { cerrarTransaccion, unirErrores, type Cierre } from './cierre';
import type { Conexion } from './fase4';

/**
 * Alta de productos nuevos con su receta (doc 31): en UNA transacción, cada producto se crea con guardar_receta (el
 * mismo camino del portal: permisos, componentes activos, tamaños y bitácora). No modifica insumos existentes, enlaces
 * POS ni otras recetas. Opcional (doc 39): insumos NUEVOS que usan sus líneas (productos terminados, como el Pan de
 * Muerto) y el precio de lista por tamaño de los productos del lote.
 *  1. lote aprobado: manifiesto con huella fijada en LOTES_ALTAS_APROBADOS; declara nombre, categoría, tamaños,
 *     líneas (componente, tipo y cantidad por tamaño) y el costo esperado por tamaño; y, si los hay, los insumos nuevos
 *     (proveedor, categoría, costo del paquete, presentación y unidad) y el precio de lista;
 *  2. perfil obligatorio también en el ensayo (activo, operaciones o admin): autor de la bitácora;
 *  3. REPEATABLE READ; ningún producto ni insumo nuevo del lote puede existir ya (si todos existen exactamente como
 *     en el manifiesto → «sin cambio»; cualquier otra mezcla → problema y no se crea nada);
 *  4. tras crear: insumos, receta, tamaños, líneas, cantidades y precios idénticos al manifiesto; costo por tamaño =
 *     costo esperado (si un costo de compra cambió desde que se preparó el lote, se detiene);
 *  5. bitácora: exactamente un registro por insumo, receta, tamaño, línea, cantidad y precio, de esta transacción,
 *     con autor y origen carga_masiva; se les pone la nota de la ejecución. Otro registro propio aborta;
 *  6. huellas: el resto de insumos, enlaces POS, precios manuales, el resto de recetas, líneas, cantidades, tamaños
 *     y costos;
 *  7. cierre verificado (cierre.ts); COMMIT solo en aplicar/revertir.
 * `revertir` exige el id de ejecución: borra solo los productos y los insumos que esa ejecución creó, si no tienen
 * registros posteriores en la bitácora, enlaces POS, precios manuales ni otras recetas que usen esos insumos.
 */
export type ModoAlta = 'ensayo' | 'aplicar' | 'revertir';
export type NombreTamano = 'Chica' | 'Grande' | 'Único';
export interface LineaAlta {
  componente: string;
  tipo: 'insumo' | 'subreceta';
  cantidades: Partial<Record<NombreTamano, number>>;
  origen: string;
}
export interface ProductoAlta {
  nombre: string;
  categoria: string;
  tamanos: NombreTamano[];
  lineas: LineaAlta[];
  costoEsperado: Partial<Record<NombreTamano, number>>;
  /** Precio de lista (con IVA) por tamaño; sin él, el producto queda sin precio de lista. */
  precioLista?: Partial<Record<NombreTamano, number>>;
  nota?: string;
}
/** Insumo nuevo del lote, por nombres de catálogo (proveedor y categoría de insumo deben existir). */
export interface InsumoAlta {
  nombre: string;
  proveedor: string;
  categoria: string;
  costoPaquete: number;
  presentacion: number;
  unidad: 'gr' | 'ml' | 'pza';
  origen: string;
}
export interface ManifiestoAltas {
  lote: string;
  fuente: { archivo: string; sha256: string };
  insumos?: InsumoAlta[];
  productos: ProductoAlta[];
  aprobacion: string;
}

/** Manifiestos aprobados: nombre → ruta y sha256 (LF, sin BOM). Un lote nuevo entra al revisar este cambio. */
export const LOTES_ALTAS_APROBADOS: Record<string, { manifiesto: string; sha256: string }> = {
  // Carlo, 2026-10-27 (doc 31): 11 productos del recetario de Zoho que no existían en nuestra base. Aplicar exige
  // aprobación aparte.
  'altas-zoho-lote-1': {
    manifiesto: 'docs/conciliacion-brasil/31-altas-zoho-lote-1.manifiesto.json',
    sha256: 'f132a72b05f4098ea92e0aa5672b8c848da28b0e6f64ff41a0766b5cd3b4ef5f',
  },
  // Carlo, 2026-10-29 (doc 37): 3 combos del menú del POS armados con nuestras recetas. Aplicar exige aprobación aparte.
  'altas-combos-lote-1': {
    manifiesto: 'docs/conciliacion-brasil/37-altas-combos-lote-1.manifiesto.json',
    sha256: '28b8eee7d461e7ac13635ec821b66eef4f2fadd0d644f4b4b558d4451878614f',
  },
  // Carlo, 2026-10-29 (doc 39): Pan de Muerto del brief a franquiciatarios (2 insumos nuevos, 2 panes y el combo con
  // True White). Cada paso remoto exige aprobación aparte.
  'pan-de-muerto-lote-1': {
    manifiesto: 'docs/conciliacion-brasil/39-pan-de-muerto-lote-1.manifiesto.json',
    sha256: '2c1c4afc729f3aa82eb50d6decfdbd5181242237f7ae2ffafd0b84adf9eff668',
  },
  // Carlo, 2026-10-30 (doc 40): Espresso Tonic y 3 cookies del costeo del equipo (Costeo_TheCoffee.xlsx), con los 3
  // insumos de las cookies. Preparado sin merge; cada paso remoto exige aprobación aparte.
  'altas-excel-lote-1': {
    manifiesto: 'docs/conciliacion-brasil/40-altas-excel-lote-1.manifiesto.json',
    sha256: '541fdd48eb8b949786720ec7019cfd54814f169b3d01976d4d9bf47556ebe463',
  },
};

/** Documento de cada lote, para la nota de la bitácora y la carpeta de informes (por omisión, el 31). */
export const DOC_ALTAS: Record<string, string> = {
  'altas-zoho-lote-1': '31',
  'altas-combos-lote-1': '37',
  'pan-de-muerto-lote-1': '39',
  'altas-excel-lote-1': '40',
};
export const docAltas = (lote: string) => DOC_ALTAS[lote] ?? '31';

const TOL = 1e-4;
const normalizar = (t: string) => t.replace(/^﻿/, '').replace(/\r\n/g, '\n');

export function validarManifiestoAltas(m: ManifiestoAltas) {
  if (!m.lote?.trim()) throw new Error('El manifiesto no declara el lote');
  if (!m.fuente?.archivo?.trim() || !/^[0-9a-f]{64}$/.test(m.fuente.sha256 ?? ''))
    throw new Error('El manifiesto no declara la fuente con su sha256');
  if (!Array.isArray(m.productos) || !m.productos.length) throw new Error('El manifiesto no tiene productos');
  const nuevos = new Set<string>();
  for (const i of m.insumos ?? []) {
    if (!i.nombre?.trim() || i.nombre !== i.nombre.trim() || nuevos.has(i.nombre))
      throw new Error(`Insumo inválido o repetido: «${i.nombre}»`);
    nuevos.add(i.nombre);
    if (!i.proveedor?.trim() || !i.categoria?.trim())
      throw new Error(`${i.nombre}: falta proveedor o categoría`);
    if (!(
      Number.isFinite(i.costoPaquete) &&
      i.costoPaquete >= 0 &&
      Number.isFinite(i.presentacion) &&
      i.presentacion > 0
    ))
      throw new Error(`${i.nombre}: costo o presentación inválidos`);
    if (!['gr', 'ml', 'pza'].includes(i.unidad)) throw new Error(`${i.nombre}: unidad inválida`);
    if (!i.origen?.trim()) throw new Error(`${i.nombre}: falta el origen`);
  }
  const nombres = new Set<string>();
  for (const p of m.productos) {
    if (!p.nombre?.trim() || p.nombre !== p.nombre.trim() || nombres.has(p.nombre))
      throw new Error(`Nombre inválido o repetido: «${p.nombre}»`);
    nombres.add(p.nombre);
    if (!p.categoria?.trim()) throw new Error(`${p.nombre}: falta la categoría`);
    const t = [...p.tamanos].sort().join(',');
    if (t !== 'Chica,Grande' && t !== 'Único')
      throw new Error(`${p.nombre}: tamaños deben ser Chica y Grande, o Único`);
    if (!p.lineas?.length) throw new Error(`${p.nombre}: sin líneas`);
    const comps = new Set<string>();
    for (const l of p.lineas) {
      if (!l.componente?.trim() || !['insumo', 'subreceta'].includes(l.tipo))
        throw new Error(`${p.nombre}: línea inválida`);
      if (comps.has(`${l.tipo}:${l.componente}`))
        throw new Error(`${p.nombre}: componente repetido ${l.componente}`);
      comps.add(`${l.tipo}:${l.componente}`);
      const cs = Object.entries(l.cantidades ?? {});
      if (
        !cs.length ||
        cs.some(
          ([k, v]) =>
            !p.tamanos.includes(k as NombreTamano) || !(typeof v === 'number' && v > 0 && Number.isFinite(v)),
        )
      )
        throw new Error(`${p.nombre}: cantidades inválidas en ${l.componente}`);
      if (!l.origen?.trim()) throw new Error(`${p.nombre}: falta el origen de ${l.componente}`);
    }
    for (const tam of p.tamanos)
      if (!(typeof p.costoEsperado?.[tam] === 'number' && p.costoEsperado[tam]! >= 0))
        throw new Error(`${p.nombre}: falta el costo esperado de ${tam}`);
    for (const [t, v] of Object.entries(p.precioLista ?? {}))
      if (!p.tamanos.includes(t as NombreTamano) || !(typeof v === 'number' && Number.isFinite(v) && v > 0))
        throw new Error(`${p.nombre}: precio de lista inválido en ${t}`);
  }
}

export async function leerLoteAltas(
  nombre: string,
  raiz = '.',
  aprobados = LOTES_ALTAS_APROBADOS,
): Promise<ManifiestoAltas> {
  const entrada = aprobados[nombre];
  if (!entrada) throw new Error(`El lote «${nombre}» no está aprobado (no figura en LOTES_ALTAS_APROBADOS)`);
  const texto = normalizar(await readFile(`${raiz}/${entrada.manifiesto}`, 'utf8'));
  const huella = createHash('sha256').update(texto).digest('hex');
  if (huella !== entrada.sha256)
    throw new Error(`El manifiesto de «${nombre}» no es el aprobado (sha256 ${huella}). Requiere revisión.`);
  const m = JSON.parse(texto) as ManifiestoAltas;
  if (m.lote !== nombre) throw new Error(`El manifiesto declara «${m.lote}», no «${nombre}»`);
  validarManifiestoAltas(m);
  return m;
}

export type ResultadoAlta = 'creado' | 'sin cambio' | 'borrado' | 'problema';
export interface InformeAlta {
  modo: ModoAlta;
  lote: string;
  usuario: string;
  ejecucion: string;
  productos: {
    nombre: string;
    id?: string;
    resultado: ResultadoAlta;
    costos?: Record<string, number>;
    problemas: string[];
  }[];
  /** Insumos nuevos del lote (vacío si el lote no trae). */
  insumos: { nombre: string; id?: string; resultado: ResultadoAlta; problemas: string[] }[];
  totales: Record<ResultadoAlta, number>;
  bitacoraPropia: number;
  bitacoraAjena: number;
  restoSinCambios?: boolean;
  transaccion: Cierre;
  error?: string;
}

/**
 * [nombre, consulta]: $1 = ids de las recetas del lote (vacío antes de crear), salvo en «insumos (resto)», donde $1 son
 * los nombres de los insumos nuevos del lote.
 */
const HUELLAS: [string, string][] = [
  ['insumos (resto)', 'select * from public.insumos where nombre <> all ($1::text[])'],
  ['producto_codigo_pos', 'select * from public.producto_codigo_pos'],
  ['precio_canal_manual', 'select * from public.precio_canal_manual'],
  ['recetas (resto)', 'select * from public.recetas where id <> all ($1::uuid[])'],
  ['producto_tamanos (resto)', 'select * from public.producto_tamanos where producto_id <> all ($1::uuid[])'],
  ['receta_lineas (resto)', 'select * from public.receta_lineas where receta_id <> all ($1::uuid[])'],
  [
    'linea_cantidades (resto)',
    `select lc.* from public.linea_cantidades lc join public.receta_lineas l on l.id = lc.linea_id where l.receta_id <> all ($1::uuid[])`,
  ],
  [
    'v_costo_producto (resto)',
    'select producto_id, tamano_id, round(costo, 6), usa_inactivo from public.v_costo_producto where producto_id <> all ($1::uuid[])',
  ],
];

type Composicion = Map<string, Map<string, number>>; // "tipo:componente" → tamaño → cantidad

export async function aplicarAltas(
  cx: Conexion,
  modo: ModoAlta,
  m: ManifiestoAltas,
  opciones: { usuario: string; ejecucion?: string },
): Promise<InformeAlta> {
  const ejecucion = modo === 'revertir' ? (opciones.ejecucion ?? '') : (opciones.ejecucion ?? randomUUID());
  const informe: InformeAlta = {
    modo,
    lote: m.lote,
    usuario: opciones.usuario,
    ejecucion,
    productos: (m.productos ?? []).map((p) => ({ nombre: p.nombre, resultado: 'problema', problemas: [] })),
    insumos: (m.insumos ?? []).map((i) => ({ nombre: i.nombre, resultado: 'problema', problemas: [] })),
    totales: { creado: 0, 'sin cambio': 0, borrado: 0, problema: 0 },
    bitacoraPropia: 0,
    bitacoraAjena: 0,
    transaccion: 'rollback',
  };
  if (!opciones.usuario) {
    informe.error =
      'Falta --usuario (perfil activo de operaciones o admin), obligatorio también en el ensayo';
    return informe;
  }
  if (!/^[0-9a-f-]{36}$/.test(ejecucion)) {
    informe.error = modo === 'revertir' ? 'Revertir exige --ejecucion <uuid>' : 'Id de ejecución inválido';
    return informe;
  }
  try {
    validarManifiestoAltas(m);
  } catch (e) {
    informe.error = e instanceof Error ? e.message : String(e);
    return informe;
  }
  const nota = `${m.lote}, ejecución ${ejecucion} (docs/conciliacion-brasil/${docAltas(m.lote)})`;
  const nuevos = m.insumos ?? [];
  const huellas = async (ids: string[]) => {
    const h: Record<string, string> = {};
    for (const [nombre, sql] of HUELLAS)
      h[nombre] = (
        await cx.query<{ h: string }>(
          `select count(*)::text || ':' || md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h from (${sql}) x`,
          nombre === 'insumos (resto)' ? [nuevos.map((i) => i.nombre)] : sql.includes('$1') ? [ids] : [],
        )
      ).rows[0].h;
    return h;
  };
  /** Diferencias entre un insumo de la base y el del manifiesto. */
  const difiereInsumo = async (i: InsumoAlta) => {
    const x = (
      await cx.query<{
        proveedor: string;
        categoria: string;
        costo_paquete: string;
        presentacion: string;
        unidad: string;
        activo: boolean;
      }>(
        `select p.nombre as proveedor, c.nombre as categoria, i.costo_paquete::text, i.presentacion::text, i.unidad::text, i.activo
           from public.insumos i join public.proveedores p on p.id = i.proveedor_id join public.categorias_insumo c on c.id = i.categoria_id
          where i.nombre = $1`,
        [i.nombre],
      )
    ).rows[0];
    if (!x) return ['no existe'];
    const problemas: string[] = [];
    if (x.proveedor !== i.proveedor) problemas.push(`proveedor ${x.proveedor}, se esperaba ${i.proveedor}`);
    if (x.categoria !== i.categoria) problemas.push(`categoría ${x.categoria}, se esperaba ${i.categoria}`);
    if (Math.abs(Number(x.costo_paquete) - i.costoPaquete) > TOL)
      problemas.push(`costo del paquete ${x.costo_paquete}, se esperaba ${i.costoPaquete}`);
    if (Math.abs(Number(x.presentacion) - i.presentacion) > TOL)
      problemas.push(`presentación ${x.presentacion}, se esperaba ${i.presentacion}`);
    if (x.unidad !== i.unidad) problemas.push(`unidad ${x.unidad}, se esperaba ${i.unidad}`);
    if (!x.activo) problemas.push('inactivo');
    return problemas;
  };
  const composicion = async (
    id: string,
  ): Promise<{
    categoria: string | null;
    tamanos: string[];
    precios: Map<string, number | null>;
    comp: Composicion;
  }> => {
    const cab = (
      await cx.query<{ categoria: string | null }>(
        `select c.nombre as categoria from public.recetas r left join public.categorias_producto c on c.id = r.categoria_id where r.id = $1`,
        [id],
      )
    ).rows[0];
    const filas = (
      await cx.query<{ t: string; precio: string | null }>(
        `select t.nombre as t, pt.precio_lista::text as precio from public.producto_tamanos pt join public.tamanos t on t.id = pt.tamano_id where pt.producto_id = $1 order by 1`,
        [id],
      )
    ).rows;
    const tamanos = filas.map((x) => x.t);
    const precios = new Map(filas.map((x) => [x.t, x.precio === null ? null : Number(x.precio)]));
    const comp: Composicion = new Map();
    for (const l of (
      await cx.query<{ k: string; t: string; c: string }>(
        `select case when l.insumo_id is not null then 'insumo:' || i.nombre else 'subreceta:' || s.nombre end as k,
                t.nombre as t, lc.cantidad::text as c
           from public.receta_lineas l left join public.insumos i on i.id = l.insumo_id left join public.recetas s on s.id = l.subreceta_id
           join public.linea_cantidades lc on lc.linea_id = l.id join public.tamanos t on t.id = lc.tamano_id where l.receta_id = $1`,
        [id],
      )
    ).rows) {
      const x = comp.get(l.k) ?? new Map<string, number>();
      comp.set(l.k, x);
      x.set(l.t, (x.get(l.t) ?? 0) + Number(l.c));
    }
    return { categoria: cab?.categoria ?? null, tamanos, precios, comp };
  };
  const difiere = (p: ProductoAlta, real: Awaited<ReturnType<typeof composicion>>) => {
    const problemas: string[] = [];
    if (real.categoria !== p.categoria)
      problemas.push(`categoría ${real.categoria}, se esperaba ${p.categoria}`);
    if (real.tamanos.join(',') !== [...p.tamanos].sort().join(','))
      problemas.push(`tamaños ${real.tamanos.join('/')}`);
    // El precio de lista solo se compara si el lote lo declara (los lotes anteriores no tocan precios).
    if (p.precioLista)
      for (const t of p.tamanos) {
        const a = p.precioLista[t] ?? null,
          b = real.precios.get(t) ?? null;
        if (a === null ? b !== null : b === null || Math.abs(a - b) > TOL)
          problemas.push(`precio de lista ${t} ${b ?? 'ninguno'}, se esperaba ${a ?? 'ninguno'}`);
      }
    const esperado: Composicion = new Map(
      p.lineas.map((l) => [
        `${l.tipo}:${l.componente}`,
        new Map(Object.entries(l.cantidades) as [string, number][]),
      ]),
    );
    for (const k of new Set([...esperado.keys(), ...real.comp.keys()])) {
      const a = esperado.get(k) ?? new Map(),
        b = real.comp.get(k) ?? new Map();
      for (const t of new Set([...a.keys(), ...b.keys()]))
        if (Math.abs((a.get(t) ?? 0) - (b.get(t) ?? 0)) > TOL)
          problemas.push(`${k} ${t}: ${b.get(t) ?? 0}, se esperaba ${a.get(t) ?? 0}`);
    }
    return problemas;
  };

  await cx.query('begin isolation level repeatable read');
  let fin: 'commit' | 'rollback' = 'rollback';
  try {
    await cx.query(
      `select set_config('statement_timeout', '30s', true), set_config('lock_timeout', '5s', true),
              set_config('idle_in_transaction_session_timeout', '60s', true), set_config('app.origen', 'carga_masiva', true)`,
    );
    const perfil = await cx.query(
      `select 1 from perfiles where user_id = $1 and activo and rol in ('operaciones', 'admin')`,
      [opciones.usuario],
    );
    if (perfil.rows.length !== 1)
      throw new Error('El usuario indicado no es un perfil activo de operaciones o admin');
    await cx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [opciones.usuario]);
    await cx.query(`select pg_advisory_xact_lock(hashtext('receta_lineas_ciclo'))`);
    const tamanos = new Map(
      (await cx.query<{ id: string; nombre: string }>(`select id, nombre from public.tamanos`)).rows.map(
        (t) => [t.nombre, t.id],
      ),
    );
    const existentes = new Map(
      (
        await cx.query<{ id: string; nombre: string }>(
          `select id, nombre from public.recetas where nombre = any ($1::text[]) for update`,
          [m.productos.map((p) => p.nombre)],
        )
      ).rows.map((r) => [r.nombre, r.id]),
    );
    const insumosExistentes = new Map(
      (
        await cx.query<{ id: string; nombre: string }>(
          `select id, nombre from public.insumos where nombre = any ($1::text[]) for update`,
          [nuevos.map((i) => i.nombre)],
        )
      ).rows.map((r) => [r.nombre, r.id]),
    );
    const maxBitacora = Number(
      (await cx.query<{ m: string }>(`select coalesce(max(id), 0) as m from bitacora`)).rows[0].m,
    );
    let ids: string[] = [];
    let idsInsumos: string[] = [];

    if (modo === 'revertir') {
      const propios = (
        await cx.query<{ receta_id: string; m: string }>(
          `select receta_id, max(id)::text as m from bitacora where nota = $1 and tabla = 'recetas' group by receta_id`,
          [nota],
        )
      ).rows;
      if (!propios.length)
        throw new Error(`No hay registros de la ejecución ${ejecucion}: nada que revertir`);
      const ultimo = Number(
        (await cx.query<{ m: string }>(`select max(id)::text as m from bitacora where nota = $1`, [nota]))
          .rows[0].m,
      );
      ids = propios.map((p) => p.receta_id);
      idsInsumos = (
        await cx.query<{ id: string }>(
          `select registro_id as id from bitacora where nota = $1 and tabla = 'insumos' and campo = '*'`,
          [nota],
        )
      ).rows.map((x) => x.id);
      const posteriores = Number(
        (
          await cx.query<{ n: string }>(
            `select count(*) as n from bitacora
              where (receta_id = any ($1::uuid[]) or (tabla = 'insumos' and registro_id = any ($3::text[]))) and id > $2`,
            [ids, ultimo, idsInsumos],
          )
        ).rows[0].n,
      );
      if (posteriores)
        throw new Error(`Hubo ${posteriores} cambio(s) posterior(es) en los productos: no se revierte`);
      const usos = Number(
        (
          await cx.query<{ n: string }>(
            `select (select count(*) from public.producto_codigo_pos where receta_id = any ($1::uuid[]))
                  + (select count(*) from public.precio_canal_manual where producto_id = any ($1::uuid[])) as n`,
            [ids],
          )
        ).rows[0].n,
      );
      if (usos) throw new Error('Algún producto ya tiene enlace POS o precio manual: no se revierte');
      const antes = await huellas(ids);
      for (const [i, p] of m.productos.entries()) {
        const id = existentes.get(p.nombre);
        if (!id || !ids.includes(id))
          informe.productos[i].problemas.push('esta ejecución no creó este producto');
        else informe.productos[i].id = id;
      }
      for (const [i, n] of nuevos.entries()) {
        const id = insumosExistentes.get(n.nombre);
        if (!id || !idsInsumos.includes(id))
          informe.insumos[i].problemas.push('esta ejecución no creó este insumo');
        else informe.insumos[i].id = id;
      }
      if (idsInsumos.length !== nuevos.length)
        throw new Error(
          `La ejecución creó ${idsInsumos.length} insumo(s) y el lote declara ${nuevos.length}`,
        );
      if ([...informe.productos, ...informe.insumos].some((x) => x.problemas.length))
        throw new Error('El lote no coincide con lo que creó la ejecución');
      const borrados = (
        await cx.query(`delete from public.recetas where id = any ($1::uuid[]) returning id`, [ids])
      ).rows.length;
      if (borrados !== ids.length)
        throw new Error(`Se borraron ${borrados} productos y se esperaban ${ids.length}`);
      for (const x of informe.productos) x.resultado = 'borrado';
      if (idsInsumos.length) {
        // Sin los productos del lote, ninguna otra receta puede usar los insumos que se borran.
        const enUso = Number(
          (
            await cx.query<{ n: string }>(
              `select count(*) as n from public.receta_lineas where insumo_id = any ($1::uuid[])`,
              [idsInsumos],
            )
          ).rows[0].n,
        );
        if (enUso)
          throw new Error(`Otras recetas usan ${enUso} vez/veces los insumos del lote: no se revierte`);
        const insumosBorrados = (
          await cx.query(`delete from public.insumos where id = any ($1::uuid[]) returning id`, [idsInsumos])
        ).rows.length;
        if (insumosBorrados !== idsInsumos.length)
          throw new Error(`Se borraron ${insumosBorrados} insumos y se esperaban ${idsInsumos.length}`);
        for (const x of informe.insumos) x.resultado = 'borrado';
      }
      informe.restoSinCambios = JSON.stringify(await huellas(ids)) === JSON.stringify(antes);
    } else {
      const todos = m.productos.every((p) => existentes.has(p.nombre));
      if (existentes.size && !todos)
        throw new Error(
          `Ya existen ${existentes.size} de ${m.productos.length} productos del lote: estado mezclado, no se crea nada`,
        );
      // Los insumos nuevos siguen a los productos: todos existen (repetición) o ninguno (alta).
      if (insumosExistentes.size !== (todos ? nuevos.length : 0))
        throw new Error(
          `Ya existen ${insumosExistentes.size} de ${nuevos.length} insumos nuevos del lote: estado mezclado, no se crea nada`,
        );
      if (todos) {
        // Idempotente: solo si cada insumo y cada producto están exactamente como en el manifiesto.
        for (const [i, n] of nuevos.entries()) {
          informe.insumos[i].id = insumosExistentes.get(n.nombre);
          informe.insumos[i].problemas.push(...(await difiereInsumo(n)));
          if (!informe.insumos[i].problemas.length) informe.insumos[i].resultado = 'sin cambio';
        }
        for (const [i, p] of m.productos.entries()) {
          const id = existentes.get(p.nombre)!;
          informe.productos[i].id = id;
          informe.productos[i].problemas.push(...difiere(p, await composicion(id)));
          if (!informe.productos[i].problemas.length) informe.productos[i].resultado = 'sin cambio';
        }
        if ([...informe.productos, ...informe.insumos].some((x) => x.problemas.length))
          throw new Error('Los productos o insumos existen con otros datos: no se toca nada');
      } else {
        const antes = await huellas([]);
        const categorias = new Map(
          (
            await cx.query<{ id: string; nombre: string }>(
              `select id, nombre from public.categorias_producto`,
            )
          ).rows.map((c) => [c.nombre, c.id]),
        );
        if (nuevos.length) {
          const catalogo = async (tabla: 'proveedores' | 'categorias_insumo') =>
            new Map(
              (
                await cx.query<{ id: string; nombre: string }>(`select id, nombre from public.${tabla}`)
              ).rows.map((x) => [x.nombre, x.id]),
            );
          const [proveedores, categoriasInsumo] = [
            await catalogo('proveedores'),
            await catalogo('categorias_insumo'),
          ];
          for (const [i, n] of nuevos.entries()) {
            const ii = informe.insumos[i];
            const [prov, cat] = [proveedores.get(n.proveedor), categoriasInsumo.get(n.categoria)];
            if (!prov) ii.problemas.push(`el proveedor ${n.proveedor} no existe`);
            if (!cat) ii.problemas.push(`la categoría de insumo ${n.categoria} no existe`);
            if (ii.problemas.length) continue;
            ii.id = (
              await cx.query<{ id: string }>(
                `insert into public.insumos (nombre, proveedor_id, categoria_id, costo_paquete, presentacion, unidad, updated_by)
                 values ($1, $2, $3, $4, $5, $6::public.unidad, $7) returning id`,
                [n.nombre, prov, cat, n.costoPaquete, n.presentacion, n.unidad, opciones.usuario],
              )
            ).rows[0].id;
            ii.problemas.push(...(await difiereInsumo(n)));
            if (!ii.problemas.length) ii.resultado = 'creado';
          }
          if (informe.insumos.some((x) => x.problemas.length))
            throw new Error('Algún insumo nuevo no se puede crear: no se crea nada');
          idsInsumos = informe.insumos.map((x) => x.id!);
        }
        const insumos = new Map(
          (
            await cx.query<{ id: string; nombre: string }>(
              `select id, nombre from public.insumos where activo`,
            )
          ).rows.map((x) => [x.nombre, x.id]),
        );
        const subrecetas = new Map(
          (
            await cx.query<{ id: string; nombre: string }>(
              `select id, nombre from public.recetas where tipo = 'subreceta' and activo`,
            )
          ).rows.map((x) => [x.nombre, x.id]),
        );
        for (const [i, p] of m.productos.entries()) {
          const ip = informe.productos[i];
          const cat = categorias.get(p.categoria);
          if (!cat) ip.problemas.push(`la categoría ${p.categoria} no existe`);
          const lineas = p.lineas.map((l, orden) => {
            const id = (l.tipo === 'insumo' ? insumos : subrecetas).get(l.componente);
            if (!id) ip.problemas.push(`${l.tipo} «${l.componente}» no existe o está inactivo`);
            return {
              insumo_id: l.tipo === 'insumo' ? id : null,
              subreceta_id: l.tipo === 'subreceta' ? id : null,
              orden,
              cantidades: Object.entries(l.cantidades).map(([t, c]) => ({
                tamano_id: tamanos.get(t),
                cantidad: c,
              })),
            };
          });
          if (ip.problemas.length) continue;
          const r = (
            await cx.query<{ r: { id: string } }>(`select public.guardar_receta($1::jsonb) as r`, [
              JSON.stringify({
                nombre: p.nombre,
                tipo: 'producto',
                categoria_id: cat,
                activo: true,
                tamanos: p.tamanos.map((t) => tamanos.get(t)),
                lineas,
              }),
            ])
          ).rows[0].r;
          ip.id = r.id;
          // guardar_receta no acepta precios: el de lista va aparte, como en el portal.
          for (const [t, precio] of Object.entries(p.precioLista ?? {})) {
            const n = (
              await cx.query(
                `update public.producto_tamanos set precio_lista = $3 where producto_id = $1 and tamano_id = $2 returning 1`,
                [r.id, tamanos.get(t), precio],
              )
            ).rows.length;
            if (n !== 1) ip.problemas.push(`no se pudo poner el precio de lista ${t}`);
          }
        }
        if (informe.productos.some((x) => x.problemas.length))
          throw new Error('Algún producto no se puede crear: no se crea nada');
        ids = informe.productos.map((x) => x.id!);
        // Verificación: composición y costo por tamaño.
        for (const [i, p] of m.productos.entries()) {
          const ip = informe.productos[i];
          ip.problemas.push(...difiere(p, await composicion(ip.id!)));
          const costos = (
            await cx.query<{ t: string; c: string; inactivo: boolean }>(
              `select t.nombre as t, v.costo::text as c, v.usa_inactivo as inactivo from public.v_costo_producto v join public.tamanos t on t.id = v.tamano_id where v.producto_id = $1`,
              [ip.id],
            )
          ).rows;
          ip.costos = Object.fromEntries(costos.map((c) => [c.t, Number(Number(c.c).toFixed(4))]));
          for (const t of p.tamanos) {
            const c = costos.find((x) => x.t === t);
            if (!c || c.inactivo || Math.abs(Number(c.c) - p.costoEsperado[t]!) > TOL)
              ip.problemas.push(
                `costo ${t} ${c ? Number(c.c) : 'ninguno'}, se esperaba ${p.costoEsperado[t]}`,
              );
          }
          if (!ip.problemas.length) ip.resultado = 'creado';
        }
        informe.restoSinCambios = JSON.stringify(await huellas(ids)) === JSON.stringify(antes);
      }
    }

    // Bitácora: solo registros de esta transacción, todos de los productos e insumos del lote y del autor.
    const propias = (
      await cx.query<{
        id: string;
        propia: boolean;
        tabla: string;
        registro_id: string | null;
        receta_id: string | null;
        campo: string;
        origen: string;
        usuario_id: string | null;
      }>(
        `select id, fecha = now() as propia, tabla, registro_id, receta_id, campo, origen, usuario_id from bitacora where id > $1 order by id`,
        [maxBitacora],
      )
    ).rows;
    const mias = propias.filter((b) => b.propia);
    informe.bitacoraPropia = mias.length;
    informe.bitacoraAjena = propias.length - mias.length;
    const esperadas =
      modo === 'revertir'
        ? null // las bajas en cascada registran recetas, tamaños, líneas y cantidades: se cuentan abajo
        : informe.productos.every((x) => x.resultado === 'sin cambio')
          ? 0
          : nuevos.length +
            m.productos.reduce(
              (s, p) =>
                s +
                1 +
                p.tamanos.length +
                p.lineas.length +
                p.lineas.reduce((t, l) => t + Object.keys(l.cantidades).length, 0) +
                Object.keys(p.precioLista ?? {}).length,
              0,
            );
    const ajenas = mias.filter((b) => {
      if (b.origen !== 'carga_masiva' || b.usuario_id !== opciones.usuario) return true;
      if (b.tabla === 'insumos') return b.campo !== '*' || !idsInsumos.includes(String(b.registro_id));
      // El alta de un tamaño registra «*»; ponerle el precio de lista registra solo ese campo.
      const campoValido = b.campo === '*' || (b.tabla === 'producto_tamanos' && b.campo === 'precio_lista');
      return (
        !['recetas', 'producto_tamanos', 'receta_lineas', 'linea_cantidades'].includes(b.tabla) ||
        !ids.includes(String(b.receta_id)) ||
        !campoValido
      );
    });
    if (ajenas.length)
      throw new Error(
        `Esta ejecución dejó ${ajenas.length} registro(s) de bitácora inesperado(s): no se aplica nada`,
      );
    if (esperadas !== null && mias.length !== esperadas)
      throw new Error(`Esta ejecución dejó ${mias.length} registros de bitácora y se esperaban ${esperadas}`);
    if (modo === 'revertir' && !mias.length) throw new Error('La reversión no dejó registros en la bitácora');
    if (mias.length)
      await cx.query(`update bitacora set nota = $2 where id = any ($1::bigint[])`, [
        mias.map((b) => b.id),
        modo === 'revertir'
          ? `${m.lote}, reversión de la ejecución ${ejecucion} (docs/conciliacion-brasil/${docAltas(m.lote)})`
          : nota,
      ]);
    for (const x of informe.productos) {
      if (x.problemas.length) x.resultado = 'problema';
      informe.totales[x.resultado]++;
    }
    for (const x of informe.insumos) if (x.problemas.length) x.resultado = 'problema';
    if (informe.totales.problema)
      throw new Error(`${informe.totales.problema} producto(s) con problemas: no se aplica nada`);
    if (informe.insumos.some((x) => x.resultado === 'problema'))
      throw new Error('Algún insumo nuevo con problemas: no se aplica nada');
    if (informe.restoSinCambios === false) throw new Error('Cambió algo fuera de los productos del lote');
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
