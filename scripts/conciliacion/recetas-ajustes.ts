import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { cerrarTransaccion, unirErrores, type Cierre } from './cierre';
import type { Conexion } from './fase4';

/**
 * Ajustes de recetas existentes y de costos de insumos (doc 40): en UNA transacción, por NOMBRE de receta e insumo,
 * cambia cantidades, cambia el insumo de una línea (aunque cambie el costo), agrega líneas y cambia el costo del paquete
 * de insumos. A diferencia de recetas-pdf.ts, los costos de los productos SÍ cambian: el manifiesto declara cada
 * producto y tamaño cuyo costo cambia, con su costo previo y nuevo. No crea productos ni insumos (eso es altas-productos).
 *  1. lote aprobado: manifiesto con huella fijada en LOTES_AJUSTES_APROBADOS;
 *  2. perfil obligatorio también en el ensayo: operaciones o admin si hay recetas, compras o admin si hay costos;
 *  3. REPEATABLE READ; bloquea recetas e insumos del lote (FOR UPDATE) y el candado de edición de recetas;
 *  4. bloqueo optimista: versión exacta de cada receta y cada valor previo exacto (cantidad, insumo de la línea, línea
 *     ausente, costo). Si todo ya está en el estado nuevo → «sin cambio»; cualquier mezcla → problema y no se toca nada;
 *  5. composición: en las recetas del lote solo cambia lo declarado (el resto de líneas y cantidades queda igual);
 *  6. costos: cada producto y tamaño declarado pasa de su costo previo al nuevo, y NINGÚN otro costo de producto ni de
 *     subreceta cambia (la lista de efectos debe estar completa);
 *  7. bitácora: exactamente un registro por costo, cambio de insumo y cantidad, y uno por línea nueva más uno por cada
 *     cantidad suya; de esta transacción, con autor y origen carga_masiva; se les pone la nota de la ejecución;
 *  8. huellas: el resto de insumos, recetas, líneas y cantidades, tamaños y precios, precios manuales y enlaces POS;
 *  9. cierre verificado (cierre.ts); COMMIT solo en aplicar/revertir.
 * `revertir` exige el id de ejecución y se niega si alguna receta o insumo del lote tiene registros posteriores en la
 * bitácora: borra las líneas que creó, devuelve cantidades, insumos y costos a su valor previo.
 */
export type ModoAjuste = 'ensayo' | 'aplicar' | 'revertir';
export type NombreTamano = 'Chica' | 'Grande' | 'Único';
export type TipoComponente = 'insumo' | 'subreceta';
export interface CostoInsumo {
  insumo: string;
  previo: number;
  nuevo: number;
  origen: string;
}
export interface CeldaAjuste {
  componente: string;
  tipo: TipoComponente;
  tamano: NombreTamano;
  previo: number;
  nuevo: number;
  origen: string;
}
export interface LineaNueva {
  componente: string;
  tipo: TipoComponente;
  cantidades: Partial<Record<NombreTamano, number>>;
  origen: string;
}
/** Cambio del insumo de una línea: conserva la línea y sus cantidades. */
export interface CambioInsumoLinea {
  desde: string;
  hacia: string;
  origen: string;
}
export interface RecetaAjuste {
  nombre: string;
  version: number;
  celdas?: CeldaAjuste[];
  lineasNuevas?: LineaNueva[];
  cambiosInsumo?: CambioInsumoLinea[];
}
export interface CostoProducto {
  producto: string;
  tamano: NombreTamano;
  previo: number;
  nuevo: number;
}
export interface ManifiestoAjustes {
  lote: string;
  fuente: { archivo: string; sha256: string };
  costosInsumo?: CostoInsumo[];
  recetas?: RecetaAjuste[];
  /** Todos los productos y tamaños cuyo costo cambia (por las recetas o por los costos de insumo). */
  costos: CostoProducto[];
  aprobacion: string;
}

/** Manifiestos aprobados: nombre → ruta y sha256 (LF, sin BOM). Un lote nuevo entra al revisar este cambio. */
export const LOTES_AJUSTES_APROBADOS: Record<string, { manifiesto: string; sha256: string }> = {
  // Carlo, 2026-10-30 (doc 40): cantidades de 10 recetas y el costo de la Cookie Triple Chocolate según el costeo del
  // equipo (Costeo_TheCoffee.xlsx). Preparado sin merge; cada paso remoto exige aprobación aparte.
  'recetas-excel-lote-1': {
    manifiesto: 'docs/conciliacion-brasil/40-recetas-excel-lote-1.manifiesto.json',
    sha256: '18b09ac8cf0e52ba9807c0c4e09118f35e28a6367b6f596e413ffe5ba5e021a0',
  },
};

/** Documento de cada lote, para la nota de la bitácora y la carpeta de informes. */
export const DOC_AJUSTES: Record<string, string> = { 'recetas-excel-lote-1': '40' };
export const docAjustes = (lote: string) => DOC_AJUSTES[lote] ?? '40';

const TOL = 1e-4;
const TAMANOS: NombreTamano[] = ['Chica', 'Grande', 'Único'];
const normalizar = (t: string) => t.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const numero = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const clave = (tipo: TipoComponente, nombre: string) => `${tipo}:${nombre}`;

export function validarManifiestoAjustes(m: ManifiestoAjustes) {
  if (!m.lote?.trim()) throw new Error('El manifiesto no declara el lote');
  if (!m.fuente?.archivo?.trim() || !/^[0-9a-f]{64}$/.test(m.fuente.sha256 ?? ''))
    throw new Error('El manifiesto no declara la fuente con su sha256');
  if (!m.aprobacion?.trim()) throw new Error('El manifiesto no declara la aprobación');
  const costosInsumo = m.costosInsumo ?? [];
  const recetas = m.recetas ?? [];
  if (!costosInsumo.length && !recetas.length) throw new Error('El manifiesto no tiene cambios');
  const insumos = new Set<string>();
  for (const c of costosInsumo) {
    if (!c.insumo?.trim() || insumos.has(c.insumo))
      throw new Error(`Costo de insumo inválido o repetido: «${c.insumo}»`);
    insumos.add(c.insumo);
    if (!numero(c.previo) || !numero(c.nuevo) || Math.abs(c.previo - c.nuevo) <= TOL)
      throw new Error(`${c.insumo}: costos previo y nuevo inválidos`);
    if (!c.origen?.trim()) throw new Error(`${c.insumo}: falta el origen`);
  }
  const nombres = new Set<string>();
  for (const r of recetas) {
    if (!r.nombre?.trim() || nombres.has(r.nombre))
      throw new Error(`Receta inválida o repetida: «${r.nombre}»`);
    nombres.add(r.nombre);
    if (!Number.isInteger(r.version) || r.version < 1) throw new Error(`${r.nombre}: versión inválida`);
    const [celdas, nuevas, cambios] = [r.celdas ?? [], r.lineasNuevas ?? [], r.cambiosInsumo ?? []];
    if (!celdas.length && !nuevas.length && !cambios.length) throw new Error(`${r.nombre}: no tiene cambios`);
    const tocadas = new Set<string>();
    const vistas = new Set<string>();
    for (const c of celdas) {
      if (!c.componente?.trim() || !['insumo', 'subreceta'].includes(c.tipo) || !TAMANOS.includes(c.tamano))
        throw new Error(`${r.nombre}: celda inválida`);
      const k = `${clave(c.tipo, c.componente)}@${c.tamano}`;
      if (vistas.has(k)) throw new Error(`${r.nombre}: celda repetida ${k}`);
      vistas.add(k);
      tocadas.add(clave(c.tipo, c.componente));
      if (!numero(c.previo) || !numero(c.nuevo) || Math.abs(c.previo - c.nuevo) <= TOL)
        throw new Error(`${r.nombre}: valores inválidos en ${k}`);
      if (!c.origen?.trim()) throw new Error(`${r.nombre}: falta el origen de ${k}`);
    }
    for (const l of nuevas) {
      if (!l.componente?.trim() || !['insumo', 'subreceta'].includes(l.tipo))
        throw new Error(`${r.nombre}: línea nueva inválida`);
      const k = clave(l.tipo, l.componente);
      if (tocadas.has(k)) throw new Error(`${r.nombre}: ${k} aparece en más de un cambio`);
      tocadas.add(k);
      const cs = Object.entries(l.cantidades ?? {});
      if (!cs.length || cs.some(([t, v]) => !TAMANOS.includes(t as NombreTamano) || !(numero(v) && v! > 0)))
        throw new Error(`${r.nombre}: cantidades inválidas en ${k}`);
      if (!l.origen?.trim()) throw new Error(`${r.nombre}: falta el origen de ${k}`);
    }
    for (const c of cambios) {
      if (!c.desde?.trim() || !c.hacia?.trim() || c.desde === c.hacia)
        throw new Error(`${r.nombre}: cambio de insumo inválido`);
      for (const k of [clave('insumo', c.desde), clave('insumo', c.hacia)]) {
        if (tocadas.has(k)) throw new Error(`${r.nombre}: ${k} aparece en más de un cambio`);
        tocadas.add(k);
      }
      if (!c.origen?.trim()) throw new Error(`${r.nombre}: falta el origen del cambio ${c.desde}`);
    }
  }
  const costos = new Set<string>();
  if (!Array.isArray(m.costos)) throw new Error('El manifiesto no declara los costos que cambian');
  for (const c of m.costos) {
    const k = `${c.producto}@${c.tamano}`;
    if (!c.producto?.trim() || !TAMANOS.includes(c.tamano) || costos.has(k))
      throw new Error(`Costo de producto inválido o repetido: ${k}`);
    costos.add(k);
    if (!numero(c.previo) || !numero(c.nuevo) || Math.abs(c.previo - c.nuevo) <= TOL)
      throw new Error(`${k}: costos previo y nuevo inválidos`);
  }
}

export async function leerLoteAjustes(
  nombre: string,
  raiz = '.',
  aprobados = LOTES_AJUSTES_APROBADOS,
): Promise<ManifiestoAjustes> {
  const entrada = aprobados[nombre];
  if (!entrada)
    throw new Error(`El lote «${nombre}» no está aprobado (no figura en LOTES_AJUSTES_APROBADOS)`);
  const texto = normalizar(await readFile(`${raiz}/${entrada.manifiesto}`, 'utf8'));
  const huella = createHash('sha256').update(texto).digest('hex');
  if (huella !== entrada.sha256)
    throw new Error(`El manifiesto de «${nombre}» no es el aprobado (sha256 ${huella}). Requiere revisión.`);
  const m = JSON.parse(texto) as ManifiestoAjustes;
  if (m.lote !== nombre) throw new Error(`El manifiesto declara «${m.lote}», no «${nombre}»`);
  validarManifiestoAjustes(m);
  return m;
}

export type ResultadoAjuste = 'cambiada' | 'sin cambio' | 'revertida' | 'problema';
export interface InformeAjustes {
  modo: ModoAjuste;
  lote: string;
  usuario: string;
  ejecucion: string;
  recetas: { nombre: string; id?: string; resultado: ResultadoAjuste; problemas: string[] }[];
  insumos: { nombre: string; id?: string; resultado: ResultadoAjuste; problemas: string[] }[];
  costos: { producto: string; tamano: NombreTamano; antes?: number; despues?: number }[];
  totales: Record<ResultadoAjuste, number>;
  bitacoraPropia: number;
  bitacoraAjena: number;
  /** Ningún costo de producto o subreceta fuera de los declarados cambió. */
  costosCompletos?: boolean;
  restoSinCambios?: boolean;
  transaccion: Cierre;
  error?: string;
}

/** [nombre, consulta]: $1 = ids de las recetas del lote; en «insumos (resto)», nombres de los insumos con costo nuevo. */
const HUELLAS: [string, string][] = [
  ['insumos (resto)', 'select * from public.insumos where nombre <> all ($1::text[])'],
  ['producto_codigo_pos', 'select * from public.producto_codigo_pos'],
  ['precio_canal_manual', 'select * from public.precio_canal_manual'],
  ['producto_tamanos', 'select * from public.producto_tamanos'],
  ['recetas (resto)', 'select * from public.recetas where id <> all ($1::uuid[])'],
  ['receta_lineas (resto)', 'select * from public.receta_lineas where receta_id <> all ($1::uuid[])'],
  [
    'linea_cantidades (resto)',
    `select lc.* from public.linea_cantidades lc join public.receta_lineas l on l.id = lc.linea_id where l.receta_id <> all ($1::uuid[])`,
  ],
  [
    'v_costo_subreceta',
    'select subreceta_id, round(costo_unitario, 6), usa_inactivo from public.v_costo_subreceta',
  ],
];

interface LineaReal {
  id: string;
  k: string;
  orden: number;
  cantidades: Map<string, number>;
}
type Estado = 'previo' | 'nuevo';

export async function aplicarAjustes(
  cx: Conexion,
  modo: ModoAjuste,
  m: ManifiestoAjustes,
  opciones: { usuario: string; ejecucion?: string },
): Promise<InformeAjustes> {
  const ejecucion = modo === 'revertir' ? (opciones.ejecucion ?? '') : (opciones.ejecucion ?? randomUUID());
  const recetas = m.recetas ?? [];
  const costosInsumo = m.costosInsumo ?? [];
  const informe: InformeAjustes = {
    modo,
    lote: m.lote,
    usuario: opciones.usuario,
    ejecucion,
    recetas: recetas.map((r) => ({ nombre: r.nombre, resultado: 'problema', problemas: [] })),
    insumos: costosInsumo.map((c) => ({ nombre: c.insumo, resultado: 'problema', problemas: [] })),
    costos: (m.costos ?? []).map((c) => ({ producto: c.producto, tamano: c.tamano })),
    totales: { cambiada: 0, 'sin cambio': 0, revertida: 0, problema: 0 },
    bitacoraPropia: 0,
    bitacoraAjena: 0,
    transaccion: 'rollback',
  };
  if (!opciones.usuario) {
    informe.error =
      'Falta --usuario (perfil activo con el rol que piden los cambios), obligatorio también en el ensayo';
    return informe;
  }
  if (!/^[0-9a-f-]{36}$/.test(ejecucion)) {
    informe.error = modo === 'revertir' ? 'Revertir exige --ejecucion <uuid>' : 'Id de ejecución inválido';
    return informe;
  }
  try {
    validarManifiestoAjustes(m);
  } catch (e) {
    informe.error = e instanceof Error ? e.message : String(e);
    return informe;
  }
  const doc = `docs/conciliacion-brasil/${docAjustes(m.lote)}`;
  const nota = `${m.lote}, ejecución ${ejecucion} (${doc})`;
  const roles =
    recetas.length && costosInsumo.length
      ? ['admin']
      : recetas.length
        ? ['operaciones', 'admin']
        : ['compras', 'admin'];

  await cx.query('begin isolation level repeatable read');
  let fin: 'commit' | 'rollback' = 'rollback';
  try {
    await cx.query(
      `select set_config('statement_timeout', '30s', true), set_config('lock_timeout', '5s', true),
              set_config('idle_in_transaction_session_timeout', '60s', true), set_config('app.origen', 'carga_masiva', true)`,
    );
    const perfil = await cx.query(
      `select 1 from perfiles where user_id = $1 and activo and rol = any ($2::text[])`,
      [opciones.usuario, roles],
    );
    if (perfil.rows.length !== 1)
      throw new Error(`El usuario indicado no es un perfil activo de ${roles.join(' o ')}`);
    await cx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [opciones.usuario]);
    await cx.query(`select pg_advisory_xact_lock(hashtext('receta_lineas_ciclo'))`);

    const tamanos = new Map(
      (await cx.query<{ id: string; nombre: string }>(`select id, nombre from public.tamanos`)).rows.map(
        (t) => [t.nombre, t.id],
      ),
    );
    const cabeceras = new Map(
      (
        await cx.query<{ id: string; nombre: string; tipo: string; activo: boolean; version: number }>(
          `select id, nombre, tipo, activo, version from public.recetas where nombre = any ($1::text[]) for update`,
          [recetas.map((r) => r.nombre)],
        )
      ).rows.map((r) => [r.nombre, r]),
    );
    // Componentes: insumos con costo nuevo y todos los que nombran las recetas (por nombre de catálogo).
    const nombresInsumo = new Set(costosInsumo.map((c) => c.insumo));
    const nombresSub = new Set<string>();
    for (const r of recetas) {
      for (const c of r.celdas ?? []) (c.tipo === 'insumo' ? nombresInsumo : nombresSub).add(c.componente);
      for (const l of r.lineasNuevas ?? [])
        (l.tipo === 'insumo' ? nombresInsumo : nombresSub).add(l.componente);
      for (const c of r.cambiosInsumo ?? []) nombresInsumo.add(c.desde).add(c.hacia);
    }
    const insumos = new Map(
      (
        await cx.query<{ id: string; nombre: string; costo: string; activo: boolean }>(
          `select id, nombre, costo_paquete::text as costo, activo from public.insumos where nombre = any ($1::text[]) for update`,
          [[...nombresInsumo]],
        )
      ).rows.map((x) => [x.nombre, x]),
    );
    const subrecetas = new Map(
      (
        await cx.query<{ id: string; nombre: string }>(
          `select id, nombre from public.recetas where tipo = 'subreceta' and activo and nombre = any ($1::text[])`,
          [[...nombresSub]],
        )
      ).rows.map((x) => [x.nombre, x.id]),
    );
    for (const n of nombresInsumo) if (!insumos.has(n)) throw new Error(`El insumo «${n}» no existe`);
    for (const n of nombresSub)
      if (!subrecetas.has(n)) throw new Error(`La subreceta «${n}» no existe o está inactiva`);
    const idComponente = (tipo: TipoComponente, nombre: string) =>
      tipo === 'insumo' ? insumos.get(nombre)!.id : subrecetas.get(nombre)!;

    const ids: string[] = [];
    for (const [i, r] of recetas.entries()) {
      const c = cabeceras.get(r.nombre);
      if (!c) informe.recetas[i].problemas.push('no existe');
      else if (c.tipo !== 'producto' || !c.activo)
        informe.recetas[i].problemas.push('no es un producto activo');
      else {
        informe.recetas[i].id = c.id;
        ids.push(c.id);
      }
    }
    for (const [i, c] of costosInsumo.entries()) informe.insumos[i].id = insumos.get(c.insumo)!.id;
    if (informe.recetas.some((x) => x.problemas.length))
      throw new Error('Alguna receta del lote no se puede ajustar');

    const lineasDe = async (recetaId: string): Promise<LineaReal[]> => {
      const filas = (
        await cx.query<{ id: string; k: string; orden: number; t: string | null; c: string | null }>(
          `select l.id, case when l.insumo_id is not null then 'insumo:' || i.nombre else 'subreceta:' || s.nombre end as k,
                  l.orden, t.nombre as t, lc.cantidad::text as c
             from public.receta_lineas l left join public.insumos i on i.id = l.insumo_id
             left join public.recetas s on s.id = l.subreceta_id
             left join public.linea_cantidades lc on lc.linea_id = l.id left join public.tamanos t on t.id = lc.tamano_id
            where l.receta_id = $1`,
          [recetaId],
        )
      ).rows;
      const por = new Map<string, LineaReal>();
      for (const f of filas) {
        const l = por.get(f.id) ?? { id: f.id, k: f.k, orden: f.orden, cantidades: new Map() };
        por.set(f.id, l);
        if (f.t && f.c !== null) l.cantidades.set(f.t, Number(f.c));
      }
      return [...por.values()];
    };
    /** Composición comparable: «tipo:componente» → «tamaño=cantidad» ordenado (una entrada por línea). */
    const composicion = (ls: LineaReal[]) =>
      ls
        .map(
          (l) =>
            `${l.k}|${[...l.cantidades]
              .sort()
              .map(([t, c]) => `${t}=${Number(c.toFixed(6))}`)
              .join(',')}`,
        )
        .sort();
    const unica = (ls: LineaReal[], k: string) => ls.filter((l) => l.k === k);

    /** Estado de cada cambio declarado: previo, nuevo o un problema. */
    const estados = async () => {
      const salida: { receta: number | null; estado: Estado | string }[] = [];
      for (const [i, r] of recetas.entries()) {
        const ls = await lineasDe(informe.recetas[i].id!);
        for (const c of r.celdas ?? []) {
          const l = unica(ls, clave(c.tipo, c.componente));
          const v = l.length === 1 ? l[0].cantidades.get(c.tamano) : undefined;
          salida.push({
            receta: i,
            estado:
              l.length !== 1
                ? `${c.componente}: ${l.length} líneas`
                : v !== undefined && Math.abs(v - c.previo) <= TOL
                  ? 'previo'
                  : v !== undefined && Math.abs(v - c.nuevo) <= TOL
                    ? 'nuevo'
                    : `${c.componente} ${c.tamano} = ${v ?? 'sin cantidad'} (previo ${c.previo}, nuevo ${c.nuevo})`,
          });
        }
        for (const n of r.lineasNuevas ?? []) {
          const l = unica(ls, clave(n.tipo, n.componente));
          const exacta =
            l.length === 1 &&
            l[0].cantidades.size === Object.keys(n.cantidades).length &&
            Object.entries(n.cantidades).every(
              ([t, q]) => Math.abs((l[0].cantidades.get(t) ?? -1) - q!) <= TOL,
            );
          salida.push({
            receta: i,
            estado: !l.length
              ? 'previo'
              : exacta
                ? 'nuevo'
                : `${n.componente}: la línea existe con otras cantidades`,
          });
        }
        for (const c of r.cambiosInsumo ?? []) {
          const [d, h] = [
            unica(ls, clave('insumo', c.desde)).length,
            unica(ls, clave('insumo', c.hacia)).length,
          ];
          salida.push({
            receta: i,
            estado:
              d === 1 && h === 0
                ? 'previo'
                : d === 0 && h === 1
                  ? 'nuevo'
                  : `${c.desde} → ${c.hacia}: ${d} y ${h} líneas`,
          });
        }
      }
      for (const c of costosInsumo) {
        const v = Number(
          (
            await cx.query<{ c: string }>(
              `select costo_paquete::text as c from public.insumos where nombre = $1`,
              [c.insumo],
            )
          ).rows[0].c,
        );
        salida.push({
          receta: null,
          estado:
            Math.abs(v - c.previo) <= TOL
              ? 'previo'
              : Math.abs(v - c.nuevo) <= TOL
                ? 'nuevo'
                : `${c.insumo}: costo ${v} (previo ${c.previo}, nuevo ${c.nuevo})`,
        });
      }
      return salida;
    };
    const costosProducto = async () =>
      new Map(
        (
          await cx.query<{ p: string; t: string; c: string; inactivo: boolean }>(
            `select r.nombre as p, t.nombre as t, v.costo::text as c, v.usa_inactivo as inactivo
               from public.v_costo_producto v join public.recetas r on r.id = v.producto_id join public.tamanos t on t.id = v.tamano_id`,
          )
        ).rows.map((x) => [`${x.p}@${x.t}`, x.inactivo ? NaN : Number(x.c)]),
      );
    const huellas = async () => {
      const h: Record<string, string> = {};
      for (const [nombre, sql] of HUELLAS)
        h[nombre] = (
          await cx.query<{ h: string }>(
            `select count(*)::text || ':' || md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h from (${sql}) x`,
            nombre === 'insumos (resto)'
              ? [costosInsumo.map((c) => c.insumo)]
              : sql.includes('$1')
                ? [ids]
                : [],
          )
        ).rows[0].h;
      return h;
    };

    const maxBitacora = Number(
      (await cx.query<{ m: string }>(`select coalesce(max(id), 0) as m from bitacora`)).rows[0].m,
    );
    const inicial = await estados();
    const malos = inicial.filter((e) => e.estado !== 'previo' && e.estado !== 'nuevo');
    for (const e of malos)
      (e.receta === null ? informe.insumos[0] : informe.recetas[e.receta]).problemas.push(String(e.estado));
    if (malos.length)
      throw new Error('El estado actual no es ni el previo ni el nuevo del lote: no se toca nada');
    const todosNuevo = inicial.every((e) => e.estado === 'nuevo');
    const todosPrevio = inicial.every((e) => e.estado === 'previo');
    const declarados = new Map((m.costos ?? []).map((c) => [`${c.producto}@${c.tamano}`, c]));

    if (modo !== 'revertir' && todosNuevo) {
      // Idempotente: todo ya está como en el manifiesto; los costos deben ser los nuevos.
      const actuales = await costosProducto();
      for (const [i, c] of (m.costos ?? []).entries()) {
        const v = actuales.get(`${c.producto}@${c.tamano}`);
        informe.costos[i].antes = informe.costos[i].despues = v;
        if (v === undefined || Number.isNaN(v) || Math.abs(v - c.nuevo) > TOL)
          throw new Error(`${c.producto} ${c.tamano}: costo ${v}, se esperaba ${c.nuevo}`);
      }
      for (const x of [...informe.recetas, ...informe.insumos]) x.resultado = 'sin cambio';
    } else {
      if (modo === 'revertir' ? !todosNuevo : !todosPrevio)
        throw new Error(
          modo === 'revertir'
            ? 'No todo está en el estado nuevo del lote: no se revierte'
            : 'Estado mezclado (parte previo, parte nuevo): no se toca nada',
        );
      const lineasCreadas = new Set<string>();
      if (modo === 'revertir') {
        const propios = (
          await cx.query<{ id: string; tabla: string; registro_id: string; campo: string }>(
            `select id::text, tabla, registro_id, campo from bitacora where nota = $1`,
            [nota],
          )
        ).rows;
        if (!propios.length)
          throw new Error(`No hay registros de la ejecución ${ejecucion}: nada que revertir`);
        const ultimo = Math.max(...propios.map((p) => Number(p.id)));
        for (const p of propios)
          if (p.tabla === 'receta_lineas' && p.campo === '*') lineasCreadas.add(p.registro_id);
        const posteriores = Number(
          (
            await cx.query<{ n: string }>(
              `select count(*) as n from bitacora
                where id > $1 and (receta_id = any ($2::uuid[]) or (tabla = 'insumos' and registro_id = any ($3::text[])))`,
              [ultimo, ids, informe.insumos.map((x) => x.id)],
            )
          ).rows[0].n,
        );
        if (posteriores)
          throw new Error(`Hubo ${posteriores} cambio(s) posterior(es) en el lote: no se revierte`);
      } else {
        for (const [i, r] of recetas.entries()) {
          const v = cabeceras.get(r.nombre)!.version;
          if (v !== r.version) informe.recetas[i].problemas.push(`versión ${v}, se esperaba ${r.version}`);
        }
        if (informe.recetas.some((x) => x.problemas.length))
          throw new Error('Alguna receta cambió desde que se preparó el lote: requiere revisión');
      }
      const desde: Estado = modo === 'revertir' ? 'nuevo' : 'previo';
      const valor = (c: { previo: number; nuevo: number }, e: Estado) =>
        e === 'previo' ? c.previo : c.nuevo;
      const costosAntes = await costosProducto();
      for (const [i, c] of (m.costos ?? []).entries()) {
        const v = costosAntes.get(`${c.producto}@${c.tamano}`);
        informe.costos[i].antes = v;
        if (v === undefined || Number.isNaN(v) || Math.abs(v - valor(c, desde)) > TOL)
          throw new Error(`${c.producto} ${c.tamano}: costo ${v}, se esperaba ${valor(c, desde)}`);
      }
      const compAntes = new Map<string, string[]>();
      for (const id of ids) compAntes.set(id, composicion(await lineasDe(id)));
      const antes = await huellas();

      // Cambios, en orden: costos de insumo, insumos de línea, cantidades y líneas (al revertir, en orden inverso).
      const hacia: Estado = modo === 'revertir' ? 'previo' : 'nuevo';
      for (const c of costosInsumo)
        await cx.query(`update public.insumos set costo_paquete = $2, updated_by = $3 where nombre = $1`, [
          c.insumo,
          valor(c, hacia),
          opciones.usuario,
        ]);
      for (const [i, r] of recetas.entries()) {
        const id = informe.recetas[i].id!;
        const ls = await lineasDe(id);
        for (const c of r.cambiosInsumo ?? []) {
          const [de, a] = modo === 'revertir' ? [c.hacia, c.desde] : [c.desde, c.hacia];
          await cx.query(`update public.receta_lineas set insumo_id = $2 where id = $1`, [
            unica(ls, clave('insumo', de))[0].id,
            insumos.get(a)!.id,
          ]);
        }
        for (const c of r.celdas ?? []) {
          const n = (
            await cx.query(
              `update public.linea_cantidades set cantidad = $3 where linea_id = $1 and tamano_id = $2 returning 1`,
              [unica(ls, clave(c.tipo, c.componente))[0].id, tamanos.get(c.tamano), valor(c, hacia)],
            )
          ).rows.length;
          if (n !== 1) informe.recetas[i].problemas.push(`${c.componente} ${c.tamano}: no se actualizó`);
        }
        let orden = Math.max(-1, ...ls.map((l) => l.orden));
        for (const n of r.lineasNuevas ?? []) {
          if (modo === 'revertir') {
            const l = unica(ls, clave(n.tipo, n.componente))[0];
            if (!lineasCreadas.has(l.id)) {
              informe.recetas[i].problemas.push(`${n.componente}: la línea no la creó esta ejecución`);
              continue;
            }
            await cx.query(`delete from public.receta_lineas where id = $1`, [l.id]);
            continue;
          }
          const lineaId = (
            await cx.query<{ id: string }>(
              `insert into public.receta_lineas (receta_id, insumo_id, subreceta_id, orden) values ($1, $2, $3, $4) returning id`,
              [
                id,
                n.tipo === 'insumo' ? idComponente('insumo', n.componente) : null,
                n.tipo === 'subreceta' ? idComponente('subreceta', n.componente) : null,
                ++orden,
              ],
            )
          ).rows[0].id;
          for (const [t, q] of Object.entries(n.cantidades))
            await cx.query(
              `insert into public.linea_cantidades (linea_id, tamano_id, cantidad) values ($1, $2, $3)`,
              [lineaId, tamanos.get(t), q],
            );
        }
      }
      if (informe.recetas.some((x) => x.problemas.length)) throw new Error('Algún cambio no se pudo hacer');

      // Verificación: estado final, composición, costos completos y huellas.
      const final = await estados();
      if (final.some((e) => e.estado !== hacia))
        throw new Error(`Algún cambio no quedó en el estado ${hacia}`);
      for (const [i, r] of recetas.entries()) {
        // Fuera de lo declarado, la receta conserva sus líneas y cantidades.
        const tocadas = new Set([
          ...(r.celdas ?? []).map((c) => clave(c.tipo, c.componente)),
          ...(r.lineasNuevas ?? []).map((l) => clave(l.tipo, l.componente)),
          ...(r.cambiosInsumo ?? []).flatMap((c) => [clave('insumo', c.desde), clave('insumo', c.hacia)]),
        ]);
        const resto = (xs: string[]) => xs.filter((x) => !tocadas.has(x.split('|')[0]));
        const ahora = composicion(await lineasDe(informe.recetas[i].id!));
        if (JSON.stringify(resto(ahora)) !== JSON.stringify(resto(compAntes.get(informe.recetas[i].id!)!)))
          informe.recetas[i].problemas.push('cambiaron líneas no declaradas');
      }
      const costosDespues = await costosProducto();
      for (const [i, c] of (m.costos ?? []).entries()) {
        const v = costosDespues.get(`${c.producto}@${c.tamano}`);
        informe.costos[i].despues = v;
        if (v === undefined || Number.isNaN(v) || Math.abs(v - valor(c, hacia)) > TOL)
          throw new Error(`${c.producto} ${c.tamano}: costo ${v}, se esperaba ${valor(c, hacia)}`);
      }
      const sorpresas = [...costosDespues].filter(([k, v]) => {
        const a = costosAntes.get(k);
        const igual = (Number.isNaN(a) && Number.isNaN(v)) || Math.abs((a ?? NaN) - v) <= TOL;
        return !igual && !declarados.has(k);
      });
      informe.costosCompletos = !sorpresas.length && costosDespues.size === costosAntes.size;
      if (!informe.costosCompletos)
        throw new Error(
          `Cambiaron costos no declarados: ${sorpresas.map(([k]) => k).join(', ') || 'cantidad de filas'}`,
        );
      informe.restoSinCambios = JSON.stringify(await huellas()) === JSON.stringify(antes);
      if (!informe.restoSinCambios) throw new Error('Cambió algo fuera de lo declarado en el lote');
      for (const x of [...informe.recetas, ...informe.insumos])
        x.resultado = modo === 'revertir' ? 'revertida' : 'cambiada';
    }

    // Bitácora: solo registros de esta transacción, de las recetas e insumos del lote, del autor y en carga masiva.
    const filas = (
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
    const mias = filas.filter((b) => b.propia);
    informe.bitacoraPropia = mias.length;
    informe.bitacoraAjena = filas.length - mias.length;
    const sinCambio = informe.recetas.concat(informe.insumos).every((x) => x.resultado === 'sin cambio');
    const esperadas = sinCambio
      ? 0
      : costosInsumo.length +
        recetas.reduce(
          (s, r) =>
            s +
            (r.celdas ?? []).length +
            (r.cambiosInsumo ?? []).length +
            (r.lineasNuevas ?? []).reduce((t, l) => t + 1 + Object.keys(l.cantidades).length, 0),
          0,
        );
    const idsInsumo = informe.insumos.map((x) => String(x.id));
    const ajenas = mias.filter((b) => {
      if (b.origen !== 'carga_masiva' || b.usuario_id !== opciones.usuario) return true;
      if (b.tabla === 'insumos')
        return b.campo !== 'costo_paquete' || !idsInsumo.includes(String(b.registro_id));
      return !['receta_lineas', 'linea_cantidades'].includes(b.tabla) || !ids.includes(String(b.receta_id));
    });
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
    for (const x of informe.recetas) {
      if (x.problemas.length) x.resultado = 'problema';
      informe.totales[x.resultado]++;
    }
    for (const x of informe.insumos) {
      if (x.problemas.length) x.resultado = 'problema';
      informe.totales[x.resultado]++;
    }
    if (informe.totales.problema)
      throw new Error(`${informe.totales.problema} cambio(s) con problemas: no se aplica nada`);
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
