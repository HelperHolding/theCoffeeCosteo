import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { cerrarTransaccion, unirErrores, type Cierre } from './cierre';
import type { Conexion } from './fase4';

/**
 * Cambio de tamaños de un producto (doc 42): un producto de tamaño Único pasa a Chica y Grande, en UNA transacción y
 * por NOMBRE. Las cantidades del Único pasan a la Chica; la Grande recibe sus cantidades; los precios de lista y los
 * precios manuales por canal pasan a los tamaños nuevos como declara el manifiesto. Lo usan los productos que el POS
 * vende con vaso Regular y Large y que en Costeo eran de un solo tamaño.
 *  1. lote aprobado: manifiesto con huella fijada en LOTES_TAMANOS_APROBADOS;
 *  2. perfil obligatorio también en el ensayo (activo, admin): toca recetas y precios;
 *  3. REPEATABLE READ; bloquea los productos (FOR UPDATE) y el candado de edición de recetas;
 *  4. bloqueo optimista: versión exacta y estado previo exacto (tamaños, precios de lista, precios manuales y líneas con
 *     sus cantidades). Si ya está exactamente en el estado nuevo → «sin cambio»; cualquier otra cosa → problema;
 *  5. verificación: tamaños, precios, precios manuales y composición iguales al estado nuevo; costo por tamaño igual al
 *     esperado; ningún otro costo de producto ni de subreceta cambia;
 *  6. bitácora: exactamente los registros que causan los cambios (alta y baja de tamaños y precios manuales, cambio de
 *     tamaño de cada cantidad, cantidades y líneas nuevas), de esta transacción, con autor y origen carga_masiva;
 *  7. huellas del resto: insumos, enlaces POS, el resto de recetas, tamaños, precios manuales, líneas y cantidades;
 *  8. cierre verificado (cierre.ts); COMMIT solo en aplicar/revertir.
 * `revertir` exige el id de ejecución, se niega si hubo cambios posteriores y deja el producto como estaba.
 */
export type ModoTamanos = 'ensayo' | 'aplicar' | 'revertir';
export type NombreTamano = 'Chica' | 'Grande' | 'Único';
export interface PrecioManual {
  canal: string;
  precio: number;
  nota: string | null;
}
export interface EstadoTamano {
  precioLista: number | null;
  manuales: PrecioManual[];
}
export interface LineaEstado {
  componente: string;
  tipo: 'insumo' | 'subreceta';
  cantidades: Partial<Record<NombreTamano, number>>;
  origen?: string;
}
export interface ProductoTamanos {
  nombre: string;
  version: number;
  previo: { tamanos: Partial<Record<NombreTamano, EstadoTamano>>; lineas: LineaEstado[] };
  nuevo: { tamanos: Partial<Record<NombreTamano, EstadoTamano>>; lineas: LineaEstado[] };
  /** Tamaño previo cuyas cantidades pasan al tamaño nuevo indicado (p. ej. Único → Chica). */
  renombrar: { de: NombreTamano; a: NombreTamano };
  costoPrevio: Partial<Record<NombreTamano, number>>;
  costoNuevo: Partial<Record<NombreTamano, number>>;
  nota?: string;
}
export interface ManifiestoTamanos {
  lote: string;
  fuente: { archivo: string; sha256: string };
  productos: ProductoTamanos[];
  aprobacion: string;
}

/** Manifiestos aprobados: nombre → ruta y sha256 (LF, sin BOM). Un lote nuevo entra al revisar este cambio. */
export const LOTES_TAMANOS_APROBADOS: Record<string, { manifiesto: string; sha256: string }> = {
  // Carlo, 2026-11-02 (doc 42): Gelato Frappé Coffee y Matcha pasan de Único a Chica y Grande con el recetario oficial.
  // Cada paso remoto exige aprobación aparte.
  'tamanos-gelato-lote-1': {
    manifiesto: 'docs/conciliacion-brasil/42-tamanos-gelato-lote-1.manifiesto.json',
    sha256: 'd8eaa55dab1164ac81a9ceb9344b667cb71ae03f2ff09c33c83e4f1f219b6df7',
  },
  // Carlo, 2026-11-03 (doc 45): los 4 combos que el POS vende con vaso Regular y Large pasan a Chica y Grande; la Grande
  // lleva la bebida Grande de su receta suelta. Cada paso remoto exige aprobación aparte.
  'tamanos-combos-lote-1': {
    manifiesto: 'docs/conciliacion-brasil/45-tamanos-combos-lote-1.manifiesto.json',
    sha256: 'fd093436992bb1931b2218904f84233cfb5bfefcc0b0bae3a4ac664954d74ed2',
  },
};
/** Documento de cada lote, para la nota de la bitácora y la carpeta de informes. */
export const DOC_TAMANOS: Record<string, string> = {
  'tamanos-gelato-lote-1': '42',
  'tamanos-combos-lote-1': '45',
};
export const docTamanos = (lote: string) => DOC_TAMANOS[lote] ?? '42';

const TOL = 1e-4;
const TAMANOS: NombreTamano[] = ['Único', 'Chica', 'Grande'];
const normalizar = (t: string) => t.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const clave = (tipo: string, nombre: string) => `${tipo}:${nombre}`;
const igual = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null ? a == null && b == null : Math.abs(a - b) <= TOL;

export function validarManifiestoTamanos(m: ManifiestoTamanos) {
  if (!m.lote?.trim()) throw new Error('El manifiesto no declara el lote');
  if (!m.fuente?.archivo?.trim() || !/^[0-9a-f]{64}$/.test(m.fuente.sha256 ?? ''))
    throw new Error('El manifiesto no declara la fuente con su sha256');
  if (!m.aprobacion?.trim()) throw new Error('El manifiesto no declara la aprobación');
  if (!Array.isArray(m.productos) || !m.productos.length) throw new Error('El manifiesto no tiene productos');
  const nombres = new Set<string>();
  for (const p of m.productos) {
    if (!p.nombre?.trim() || nombres.has(p.nombre))
      throw new Error(`Producto inválido o repetido: «${p.nombre}»`);
    nombres.add(p.nombre);
    if (!Number.isInteger(p.version) || p.version < 1) throw new Error(`${p.nombre}: versión inválida`);
    for (const lado of ['previo', 'nuevo'] as const) {
      const e = p[lado];
      const ts = Object.keys(e?.tamanos ?? {}) as NombreTamano[];
      if (!ts.length || ts.some((t) => !TAMANOS.includes(t)))
        throw new Error(`${p.nombre}: tamaños ${lado} inválidos`);
      for (const t of ts) {
        const x = e.tamanos[t]!;
        if (x.precioLista !== null && !(typeof x.precioLista === 'number' && x.precioLista > 0))
          throw new Error(`${p.nombre}: precio de lista ${lado} inválido en ${t}`);
        const canales = new Set<string>();
        for (const mm of x.manuales ?? []) {
          if (!mm.canal?.trim() || canales.has(mm.canal) || !(mm.precio > 0))
            throw new Error(`${p.nombre}: precio manual ${lado} inválido en ${t}`);
          canales.add(mm.canal);
        }
      }
      if (!e.lineas?.length) throw new Error(`${p.nombre}: sin líneas ${lado}`);
      const comps = new Set<string>();
      for (const l of e.lineas) {
        const k = clave(l.tipo, l.componente);
        if (!l.componente?.trim() || !['insumo', 'subreceta'].includes(l.tipo) || comps.has(k))
          throw new Error(`${p.nombre}: línea ${lado} inválida o repetida (${l.componente})`);
        comps.add(k);
        const cs = Object.entries(l.cantidades ?? {});
        if (
          !cs.length ||
          cs.some(([t, v]) => !ts.includes(t as NombreTamano) || !(typeof v === 'number' && v > 0))
        )
          throw new Error(`${p.nombre}: cantidades ${lado} inválidas en ${l.componente}`);
      }
      const costos = lado === 'previo' ? p.costoPrevio : p.costoNuevo;
      for (const t of ts)
        if (!(typeof costos?.[t] === 'number' && costos[t]! >= 0))
          throw new Error(`${p.nombre}: falta el costo ${lado} de ${t}`);
    }
    const { de, a } = p.renombrar ?? ({} as ProductoTamanos['renombrar']);
    if (!p.previo.tamanos[de!] || !p.nuevo.tamanos[a!] || p.nuevo.tamanos[de!] || p.previo.tamanos[a!])
      throw new Error(`${p.nombre}: renombrar debe ir de un tamaño previo a uno nuevo`);
    // Cada línea previa sigue en el estado nuevo con la misma cantidad en el tamaño renombrado.
    const nuevas = new Map(p.nuevo.lineas.map((l) => [clave(l.tipo, l.componente), l]));
    for (const l of p.previo.lineas) {
      const n = nuevas.get(clave(l.tipo, l.componente));
      if (!n || !igual(n.cantidades[a!], l.cantidades[de!]))
        throw new Error(`${p.nombre}: ${l.componente} debe conservar su cantidad del ${de} en el ${a}`);
    }
    for (const l of p.nuevo.lineas)
      if (
        !nuevas.has(clave(l.tipo, l.componente)) ||
        (!p.previo.lineas.some((x) => x.componente === l.componente) && !l.origen?.trim())
      )
        throw new Error(`${p.nombre}: falta el origen de ${l.componente}`);
  }
}

export async function leerLoteTamanos(
  nombre: string,
  raiz = '.',
  aprobados = LOTES_TAMANOS_APROBADOS,
): Promise<ManifiestoTamanos> {
  const entrada = aprobados[nombre];
  if (!entrada)
    throw new Error(`El lote «${nombre}» no está aprobado (no figura en LOTES_TAMANOS_APROBADOS)`);
  const texto = normalizar(await readFile(`${raiz}/${entrada.manifiesto}`, 'utf8'));
  const huella = createHash('sha256').update(texto).digest('hex');
  if (huella !== entrada.sha256)
    throw new Error(`El manifiesto de «${nombre}» no es el aprobado (sha256 ${huella}). Requiere revisión.`);
  const m = JSON.parse(texto) as ManifiestoTamanos;
  if (m.lote !== nombre) throw new Error(`El manifiesto declara «${m.lote}», no «${nombre}»`);
  validarManifiestoTamanos(m);
  return m;
}

export type ResultadoTamanos = 'cambiado' | 'sin cambio' | 'revertido' | 'problema';
export interface InformeTamanos {
  modo: ModoTamanos;
  lote: string;
  usuario: string;
  ejecucion: string;
  productos: {
    nombre: string;
    id?: string;
    resultado: ResultadoTamanos;
    costos?: Record<string, number>;
    problemas: string[];
  }[];
  totales: Record<ResultadoTamanos, number>;
  bitacoraPropia: number;
  bitacoraAjena: number;
  costosCompletos?: boolean;
  restoSinCambios?: boolean;
  transaccion: Cierre;
  error?: string;
}

/** [nombre, consulta]: $1 = ids de los productos del lote. */
const HUELLAS: [string, string][] = [
  ['insumos', 'select * from public.insumos'],
  ['producto_codigo_pos', 'select * from public.producto_codigo_pos'],
  ['recetas (resto)', 'select * from public.recetas where id <> all ($1::uuid[])'],
  ['producto_tamanos (resto)', 'select * from public.producto_tamanos where producto_id <> all ($1::uuid[])'],
  [
    'precio_canal_manual (resto)',
    'select * from public.precio_canal_manual where producto_id <> all ($1::uuid[])',
  ],
  ['receta_lineas (resto)', 'select * from public.receta_lineas where receta_id <> all ($1::uuid[])'],
  [
    'linea_cantidades (resto)',
    `select lc.* from public.linea_cantidades lc join public.receta_lineas l on l.id = lc.linea_id where l.receta_id <> all ($1::uuid[])`,
  ],
  [
    'v_costo_producto (resto)',
    'select producto_id, tamano_id, round(costo, 6), usa_inactivo from public.v_costo_producto where producto_id <> all ($1::uuid[])',
  ],
  [
    'v_costo_subreceta',
    'select subreceta_id, round(costo_unitario, 6), usa_inactivo from public.v_costo_subreceta',
  ],
];

type Estado = ProductoTamanos['previo'];

export async function aplicarTamanos(
  cx: Conexion,
  modo: ModoTamanos,
  m: ManifiestoTamanos,
  opciones: { usuario: string; ejecucion?: string },
): Promise<InformeTamanos> {
  const ejecucion = modo === 'revertir' ? (opciones.ejecucion ?? '') : (opciones.ejecucion ?? randomUUID());
  const informe: InformeTamanos = {
    modo,
    lote: m.lote,
    usuario: opciones.usuario,
    ejecucion,
    productos: (m.productos ?? []).map((p) => ({ nombre: p.nombre, resultado: 'problema', problemas: [] })),
    totales: { cambiado: 0, 'sin cambio': 0, revertido: 0, problema: 0 },
    bitacoraPropia: 0,
    bitacoraAjena: 0,
    transaccion: 'rollback',
  };
  if (!opciones.usuario) {
    informe.error = 'Falta --usuario (perfil activo de admin), obligatorio también en el ensayo';
    return informe;
  }
  if (!/^[0-9a-f-]{36}$/.test(ejecucion)) {
    informe.error = modo === 'revertir' ? 'Revertir exige --ejecucion <uuid>' : 'Id de ejecución inválido';
    return informe;
  }
  try {
    validarManifiestoTamanos(m);
  } catch (e) {
    informe.error = e instanceof Error ? e.message : String(e);
    return informe;
  }
  const doc = `docs/conciliacion-brasil/${docTamanos(m.lote)}`;
  const nota = `${m.lote}, ejecución ${ejecucion} (${doc})`;

  await cx.query('begin isolation level repeatable read');
  let fin: 'commit' | 'rollback' = 'rollback';
  try {
    await cx.query(
      `select set_config('statement_timeout', '30s', true), set_config('lock_timeout', '5s', true),
              set_config('idle_in_transaction_session_timeout', '60s', true), set_config('app.origen', 'carga_masiva', true)`,
    );
    const perfil = await cx.query(`select 1 from perfiles where user_id = $1 and activo and rol = 'admin'`, [
      opciones.usuario,
    ]);
    if (perfil.rows.length !== 1) throw new Error('El usuario indicado no es un perfil activo de admin');
    await cx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [opciones.usuario]);
    await cx.query(`select pg_advisory_xact_lock(hashtext('receta_lineas_ciclo'))`);

    const tamanos = new Map(
      (await cx.query<{ id: string; nombre: string }>(`select id, nombre from public.tamanos`)).rows.map(
        (t) => [t.nombre, t.id],
      ),
    );
    const canales = new Map(
      (await cx.query<{ id: string; nombre: string }>(`select id, nombre from public.canales`)).rows.map(
        (c) => [c.nombre, c.id],
      ),
    );
    const cabeceras = new Map(
      (
        await cx.query<{ id: string; nombre: string; tipo: string; activo: boolean; version: number }>(
          `select id, nombre, tipo, activo, version from public.recetas where nombre = any ($1::text[]) for update`,
          [m.productos.map((p) => p.nombre)],
        )
      ).rows.map((r) => [r.nombre, r]),
    );
    const ids: string[] = [];
    for (const [i, p] of m.productos.entries()) {
      const c = cabeceras.get(p.nombre);
      if (!c || c.tipo !== 'producto' || !c.activo)
        informe.productos[i].problemas.push('no es un producto activo');
      else ids.push((informe.productos[i].id = c.id));
    }
    if (informe.productos.some((x) => x.problemas.length))
      throw new Error('Algún producto del lote no existe o no está activo');
    for (const p of m.productos)
      for (const e of [p.previo, p.nuevo])
        for (const x of Object.values(e.tamanos))
          for (const mm of x!.manuales)
            if (!canales.has(mm.canal)) throw new Error(`El canal «${mm.canal}» no existe`);

    /** Estado real de un producto con la misma forma que el manifiesto. */
    const leer = async (id: string): Promise<Estado> => {
      const ts = (
        await cx.query<{ t: string; precio: string | null }>(
          `select t.nombre as t, pt.precio_lista::text as precio from public.producto_tamanos pt join public.tamanos t on t.id = pt.tamano_id where pt.producto_id = $1`,
          [id],
        )
      ).rows;
      const ms = (
        await cx.query<{ t: string; canal: string; precio: string; nota: string | null }>(
          `select t.nombre as t, c.nombre as canal, m.precio::text as precio, m.nota from public.precio_canal_manual m
             join public.tamanos t on t.id = m.tamano_id join public.canales c on c.id = m.canal_id where m.producto_id = $1`,
          [id],
        )
      ).rows;
      const tamanosReales: Estado['tamanos'] = {};
      for (const t of ts)
        tamanosReales[t.t as NombreTamano] = {
          precioLista: t.precio === null ? null : Number(t.precio),
          manuales: ms
            .filter((x) => x.t === t.t)
            .map((x) => ({ canal: x.canal, precio: Number(x.precio), nota: x.nota })),
        };
      const filas = (
        await cx.query<{ id: string; k: string; t: string | null; c: string | null }>(
          `select l.id, case when l.insumo_id is not null then 'insumo:' || i.nombre else 'subreceta:' || s.nombre end as k,
                  t.nombre as t, lc.cantidad::text as c
             from public.receta_lineas l left join public.insumos i on i.id = l.insumo_id left join public.recetas s on s.id = l.subreceta_id
             left join public.linea_cantidades lc on lc.linea_id = l.id left join public.tamanos t on t.id = lc.tamano_id
            where l.receta_id = $1`,
          [id],
        )
      ).rows;
      const lineas = new Map<string, LineaEstado & { ids: Set<string> }>();
      for (const f of filas) {
        const [tipo, ...resto] = f.k.split(':');
        const l = lineas.get(f.k) ?? {
          componente: resto.join(':'),
          tipo: tipo as LineaEstado['tipo'],
          cantidades: {},
          ids: new Set(),
        };
        l.ids.add(f.id);
        if (f.t && f.c !== null) l.cantidades[f.t as NombreTamano] = Number(f.c);
        lineas.set(f.k, l);
      }
      const dupl = [...lineas.values()].filter((l) => l.ids.size > 1);
      if (dupl.length)
        throw new Error(`Componentes repetidos en la receta: ${dupl.map((l) => l.componente).join(', ')}`);
      return { tamanos: tamanosReales, lineas: [...lineas.values()].map(({ ids: _i, ...l }) => l) };
    };
    /** Diferencias entre un estado real y uno del manifiesto. */
    const difiere = (real: Estado, esperado: Estado) => {
      const problemas: string[] = [];
      const ts = [
        ...new Set([...Object.keys(real.tamanos), ...Object.keys(esperado.tamanos)]),
      ] as NombreTamano[];
      for (const t of ts) {
        const a = real.tamanos[t],
          b = esperado.tamanos[t];
        if (!a || !b) {
          problemas.push(`tamaño ${t}: ${a ? 'sobra' : 'falta'}`);
          continue;
        }
        if (!igual(a.precioLista, b.precioLista))
          problemas.push(`precio de lista ${t} ${a.precioLista}, se esperaba ${b.precioLista}`);
        const fm = (xs: PrecioManual[]) =>
          xs
            .map((x) => `${x.canal}=${Number(x.precio.toFixed(4))}|${x.nota ?? ''}`)
            .sort()
            .join(';');
        if (fm(a.manuales) !== fm(b.manuales))
          problemas.push(`precios manuales ${t}: ${fm(a.manuales) || 'ninguno'}`);
      }
      const fl = (xs: LineaEstado[]) =>
        xs
          .map(
            (l) =>
              `${clave(l.tipo, l.componente)} ${Object.entries(l.cantidades)
                .sort()
                .map(([t, c]) => `${t}=${Number(c!.toFixed(6))}`)
                .join(',')}`,
          )
          .sort();
      const [ra, rb] = [fl(real.lineas), fl(esperado.lineas)];
      for (const x of ra.filter((y) => !rb.includes(y))) problemas.push(`línea real distinta: ${x}`);
      for (const x of rb.filter((y) => !ra.includes(y))) problemas.push(`falta la línea: ${x}`);
      return problemas;
    };
    const costos = async () =>
      new Map(
        (
          await cx.query<{ p: string; t: string; c: string; inactivo: boolean }>(
            `select r.nombre as p, t.nombre as t, v.costo::text as c, v.usa_inactivo as inactivo
               from public.v_costo_producto v join public.recetas r on r.id = v.producto_id join public.tamanos t on t.id = v.tamano_id
              where v.producto_id = any ($1::uuid[])`,
            [ids],
          )
        ).rows.map((x) => [`${x.p}@${x.t}`, x.inactivo ? NaN : Number(x.c)]),
      );
    const huellas = async () => {
      const h: Record<string, string> = {};
      for (const [nombre, sql] of HUELLAS)
        h[nombre] = (
          await cx.query<{ h: string }>(
            `select count(*)::text || ':' || md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h from (${sql}) x`,
            sql.includes('$1') ? [ids] : [],
          )
        ).rows[0].h;
      return h;
    };
    const verificarCostos = async (lado: 'costoPrevio' | 'costoNuevo') => {
      const cs = await costos();
      for (const [i, p] of m.productos.entries()) {
        const esperado = p[lado];
        const reales = [...cs].filter(([k]) => k.startsWith(`${p.nombre}@`));
        informe.productos[i].costos = Object.fromEntries(
          reales.map(([k, v]) => [k.split('@')[1], Number(v.toFixed(4))]),
        );
        if (reales.length !== Object.keys(esperado).length)
          informe.productos[i].problemas.push(
            `hay ${reales.length} costos, se esperaban ${Object.keys(esperado).length}`,
          );
        for (const [t, v] of Object.entries(esperado))
          if (!igual(cs.get(`${p.nombre}@${t}`), v!))
            informe.productos[i].problemas.push(`costo ${t} ${cs.get(`${p.nombre}@${t}`)}, se esperaba ${v}`);
      }
      if (informe.productos.some((x) => x.problemas.length))
        throw new Error(`Los costos no son los ${lado === 'costoPrevio' ? 'previos' : 'nuevos'}`);
    };

    const maxBitacora = Number(
      (await cx.query<{ m: string }>(`select coalesce(max(id), 0) as m from bitacora`)).rows[0].m,
    );
    const reales = new Map<string, Estado>();
    for (const id of ids) reales.set(id, await leer(id));
    const enPrevio = m.productos.map(
      (p, i) => !difiere(reales.get(informe.productos[i].id!)!, p.previo).length,
    );
    const enNuevo = m.productos.map(
      (p, i) => !difiere(reales.get(informe.productos[i].id!)!, p.nuevo).length,
    );
    let esperadas = 0;

    if (modo !== 'revertir' && enNuevo.every(Boolean)) {
      await verificarCostos('costoNuevo');
      for (const x of informe.productos) x.resultado = 'sin cambio';
    } else {
      const desde = modo === 'revertir' ? enNuevo : enPrevio;
      for (const [i, p] of m.productos.entries())
        if (!desde[i])
          informe.productos[i].problemas.push(
            ...difiere(reales.get(informe.productos[i].id!)!, modo === 'revertir' ? p.nuevo : p.previo),
          );
      if (informe.productos.some((x) => x.problemas.length))
        throw new Error(
          modo === 'revertir'
            ? 'No todo está en el estado nuevo del lote: no se revierte'
            : 'El estado no es el previo del lote: no se toca nada',
        );
      if (modo === 'revertir') {
        const propios = (
          await cx.query<{ id: string }>(`select id::text from bitacora where nota = $1`, [nota])
        ).rows;
        if (!propios.length)
          throw new Error(`No hay registros de la ejecución ${ejecucion}: nada que revertir`);
        const ultimo = Math.max(...propios.map((x) => Number(x.id)));
        const posteriores = Number(
          (
            await cx.query<{ n: string }>(
              `select count(*) as n from bitacora where id > $1 and receta_id = any ($2::uuid[])`,
              [ultimo, ids],
            )
          ).rows[0].n,
        );
        if (posteriores)
          throw new Error(`Hubo ${posteriores} cambio(s) posterior(es) en los productos: no se revierte`);
      } else
        for (const [i, p] of m.productos.entries()) {
          const v = cabeceras.get(p.nombre)!.version;
          if (v !== p.version) informe.productos[i].problemas.push(`versión ${v}, se esperaba ${p.version}`);
        }
      if (informe.productos.some((x) => x.problemas.length))
        throw new Error('Algún producto cambió desde que se preparó el lote');
      await verificarCostos(modo === 'revertir' ? 'costoNuevo' : 'costoPrevio');
      const antes = await huellas();

      for (const [i, p] of m.productos.entries()) {
        const id = informe.productos[i].id!;
        const [origen, destino] = modo === 'revertir' ? [p.nuevo, p.previo] : [p.previo, p.nuevo];
        const [de, a] =
          modo === 'revertir' ? [p.renombrar.a, p.renombrar.de] : [p.renombrar.de, p.renombrar.a];
        // 1. Tamaños que entran, con su precio de lista y sus precios manuales.
        for (const [t, x] of Object.entries(destino.tamanos) as [NombreTamano, EstadoTamano][]) {
          if (origen.tamanos[t]) continue;
          await cx.query(
            `insert into public.producto_tamanos (producto_id, tamano_id, precio_lista) values ($1, $2, $3)`,
            [id, tamanos.get(t), x.precioLista],
          );
          esperadas++;
          for (const mm of x.manuales) {
            await cx.query(
              `insert into public.precio_canal_manual (producto_id, tamano_id, canal_id, precio, nota) values ($1, $2, $3, $4, $5)`,
              [id, tamanos.get(t), canales.get(mm.canal), mm.precio, mm.nota],
            );
            esperadas++;
          }
        }
        // 2. Líneas: las cantidades del tamaño renombrado pasan al nuevo; las demás se agregan o se quitan.
        const lineasDe = async () =>
          (
            await cx.query<{ id: string; k: string; tamano_id: string | null; t: string | null }>(
              `select l.id, case when l.insumo_id is not null then 'insumo:' || i.nombre else 'subreceta:' || s.nombre end as k,
                      lc.tamano_id, t.nombre as t
                 from public.receta_lineas l left join public.insumos i on i.id = l.insumo_id left join public.recetas s on s.id = l.subreceta_id
                 left join public.linea_cantidades lc on lc.linea_id = l.id left join public.tamanos t on t.id = lc.tamano_id
                where l.receta_id = $1`,
              [id],
            )
          ).rows;
        const actuales = await lineasDe();
        const idLinea = new Map(actuales.map((x) => [x.k, x.id]));
        const destinoPor = new Map(destino.lineas.map((l) => [clave(l.tipo, l.componente), l]));
        for (const x of actuales.filter((y) => y.t === de)) {
          await cx.query(
            `update public.linea_cantidades set tamano_id = $3 where linea_id = $1 and tamano_id = $2`,
            [x.id, x.tamano_id, tamanos.get(a)],
          );
          esperadas++;
        }
        for (const [k, l] of destinoPor) {
          let linea = idLinea.get(k);
          if (!linea) {
            const orden =
              Math.max(
                -1,
                ...(
                  await cx.query<{ o: number }>(
                    `select orden as o from public.receta_lineas where receta_id = $1`,
                    [id],
                  )
                ).rows.map((r) => r.o),
              ) + 1;
            const comp = (
              await cx.query<{ id: string }>(
                l.tipo === 'insumo'
                  ? `select id from public.insumos where nombre = $1 and activo`
                  : `select id from public.recetas where nombre = $1 and tipo = 'subreceta' and activo`,
                [l.componente],
              )
            ).rows[0];
            if (!comp)
              throw new Error(`${p.nombre}: el componente «${l.componente}» no existe o está inactivo`);
            linea = (
              await cx.query<{ id: string }>(
                `insert into public.receta_lineas (receta_id, insumo_id, subreceta_id, orden) values ($1, $2, $3, $4) returning id`,
                [id, l.tipo === 'insumo' ? comp.id : null, l.tipo === 'subreceta' ? comp.id : null, orden],
              )
            ).rows[0].id;
            esperadas++;
          }
          for (const [t, q] of Object.entries(l.cantidades) as [NombreTamano, number][]) {
            if (t === a && idLinea.has(k)) continue; // ya renombrada
            await cx.query(
              `insert into public.linea_cantidades (linea_id, tamano_id, cantidad) values ($1, $2, $3)`,
              [linea, tamanos.get(t), q],
            );
            esperadas++;
          }
        }
        for (const [k, lineaId] of idLinea) {
          if (destinoPor.has(k)) {
            // Cantidades de tamaños que salen (los no renombrados).
            for (const x of actuales.filter(
              (y) => y.id === lineaId && y.t && y.t !== de && !destino.tamanos[y.t as NombreTamano],
            )) {
              await cx.query(`delete from public.linea_cantidades where linea_id = $1 and tamano_id = $2`, [
                lineaId,
                x.tamano_id,
              ]);
              esperadas++;
            }
            continue;
          }
          const n =
            actuales.filter((y) => y.id === lineaId && y.t && y.t !== de).length +
            (actuales.some((y) => y.id === lineaId && y.t === de) ? 1 : 0);
          await cx.query(`delete from public.receta_lineas where id = $1`, [lineaId]);
          esperadas += 1 + n;
        }
        // 3. Tamaños que salen (sus precios manuales caen en cascada).
        for (const [t, x] of Object.entries(origen.tamanos) as [NombreTamano, EstadoTamano][]) {
          if (destino.tamanos[t]) continue;
          await cx.query(`delete from public.producto_tamanos where producto_id = $1 and tamano_id = $2`, [
            id,
            tamanos.get(t),
          ]);
          esperadas += 1 + x.manuales.length;
        }
        // Verificación del producto.
        informe.productos[i].problemas.push(...difiere(await leer(id), destino));
      }
      if (informe.productos.some((x) => x.problemas.length))
        throw new Error('El producto no quedó como declara el lote');
      await verificarCostos(modo === 'revertir' ? 'costoPrevio' : 'costoNuevo');
      informe.costosCompletos = true;
      informe.restoSinCambios = JSON.stringify(await huellas()) === JSON.stringify(antes);
      if (!informe.restoSinCambios) throw new Error('Cambió algo fuera de los productos del lote');
      for (const x of informe.productos) x.resultado = modo === 'revertir' ? 'revertido' : 'cambiado';
    }

    const filas = (
      await cx.query<{
        id: string;
        propia: boolean;
        tabla: string;
        receta_id: string | null;
        origen: string;
        usuario_id: string | null;
      }>(
        `select id, fecha = now() as propia, tabla, receta_id, origen, usuario_id from bitacora where id > $1 order by id`,
        [maxBitacora],
      )
    ).rows;
    const mias = filas.filter((b) => b.propia);
    informe.bitacoraPropia = mias.length;
    informe.bitacoraAjena = filas.length - mias.length;
    const ajenas = mias.filter(
      (b) =>
        b.origen !== 'carga_masiva' ||
        b.usuario_id !== opciones.usuario ||
        !['producto_tamanos', 'precio_canal_manual', 'receta_lineas', 'linea_cantidades'].includes(b.tabla) ||
        !ids.includes(String(b.receta_id)),
    );
    if (ajenas.length)
      throw new Error(
        `Esta ejecución dejó ${ajenas.length} registro(s) de bitácora inesperado(s): no se aplica nada`,
      );
    if (mias.length !== esperadas)
      throw new Error(`Esta ejecución dejó ${mias.length} registros de bitácora y se esperaban ${esperadas}`);
    if (mias.length)
      await cx.query(`update bitacora set nota = $2 where id = any ($1::bigint[])`, [
        mias.map((b) => b.id),
        modo === 'revertir' ? `${m.lote}, reversión de la ejecución ${ejecucion} (${doc})` : nota,
      ]);
    for (const x of informe.productos) {
      if (x.problemas.length) x.resultado = 'problema';
      informe.totales[x.resultado]++;
    }
    if (informe.totales.problema)
      throw new Error(`${informe.totales.problema} producto(s) con problemas: no se aplica nada`);
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
