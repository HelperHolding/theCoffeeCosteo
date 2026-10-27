import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { cerrarTransaccion, unirErrores, type Cierre } from './cierre';
import type { Conexion } from './fase4';

/**
 * Lote de recetas del PDF vigente (doc 29): en UNA transacción, celdas de cantidad (como recetas-correcciones.ts) y
 * cambios de insumo de una línea con los mismos números (como hielo-unidad.ts). Primero las cantidades y después los
 * insumos; al revertir, en el orden inverso. No crea ni modifica insumos, precios ni enlaces.
 *  1. lote aprobado: manifiesto con huella fijada en LOTES_PDF_APROBADOS; declara recetas con su versión y página, el
 *     estado de cada insumo que toca (costo de paquete, presentación, unidad), cada celda (valor previo y nuevo) y cada
 *     cambio de insumo (origen, destino y las cantidades finales de la línea);
 *  2. perfil obligatorio también en el ensayo (activo, operaciones o admin): updated_by y bitácora;
 *  3. REPEATABLE READ; bloquea insumos, recetas, líneas y celdas (FOR UPDATE);
 *  4. bloqueo optimista: versión exacta de cada receta y valores previos exactos. Si todo ya está en el estado nuevo →
 *     «sin cambio» (idempotente); cualquier mezcla → problema y no se toca nada;
 *  5. un cambio de insumo nunca cambia el costo: origen y destino deben tener el mismo costo unitario;
 *  6. bitácora: exactamente un registro por celda (linea_cantidades.cantidad) y uno por línea (receta_lineas.insumo_id),
 *     de esta transacción, con receta, autor y origen carga_masiva; se les pone la nota de la ejecución. Otro registro
 *     propio aborta. Cada receta sube una versión por registro;
 *  7. costos: v_costo_producto y v_costo_subreceta deben quedar idénticos (con los costos de compra actuales el lote no
 *     cambia ningún costo; si Compras cambia un costo antes de aplicar, el lote se detiene y requiere revisión);
 *  8. huellas: precios, enlaces POS, insumos, el resto de líneas, cantidades y recetas no cambian;
 *  9. cierre verificado (cierre.ts); COMMIT solo en aplicar/revertir.
 * `revertir` exige el id de ejecución y se niega si alguna receta del lote tiene registros posteriores en la bitácora.
 */
export type ModoPdf = 'ensayo' | 'aplicar' | 'revertir';
export interface InsumoDeclarado {
  id: string;
  nombre: string;
  unidad: 'gr' | 'ml' | 'pza';
  costo_paquete: number;
  presentacion: number;
}
export interface RecetaPdf {
  id: string;
  nombre: string;
  version: number;
  pagina: number;
}
export interface CeldaPdf {
  receta_id: string;
  linea_id: string;
  insumo_id: string;
  insumo: string;
  tamano_id: string;
  tamano: string;
  previo: number;
  nuevo: number;
  fuente: string;
}
export interface CambioInsumo {
  receta_id: string;
  linea_id: string;
  desde_id: string;
  desde: string;
  hacia_id: string;
  hacia: string;
  /** Cantidades de la línea DESPUÉS de las celdas del lote (los números no cambian al cambiar de insumo). */
  cantidades: { tamano_id: string; tamano: string; cantidad: number }[];
  fuente: string;
}
export interface ManifiestoPdf {
  lote: string;
  fuente: { archivo: string; sha256: string };
  insumos: InsumoDeclarado[];
  recetas: RecetaPdf[];
  celdas: CeldaPdf[];
  cambiosInsumo: CambioInsumo[];
  aprobacion: string;
}

/** Manifiestos aprobados: nombre → ruta y sha256 (LF, sin BOM). Un lote nuevo entra al revisar este cambio. */
export const LOTES_PDF_APROBADOS: Record<string, { manifiesto: string; sha256: string }> = {
  // Preparado el 2026-10-27 (doc 29): hielo Grande de las Fresh Sodas, hielo de Cold brew en HIELO (g) e Iced
  // Chocolate sin la línea de AGUA duplicada. Aplicar exige aprobación aparte.
  'recetario-pdf-lote-1': {
    manifiesto: 'docs/conciliacion-brasil/29-recetario-pdf-lote-1.manifiesto.json',
    sha256: '67f024c163125d259351956a3f99f9581a960c5c4172800118bf624f5da16e4a',
  },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const normalizar = (t: string) => t.replace(/^﻿/, '').replace(/\r\n/g, '\n');
const numero = (x: unknown, minimo: number) => typeof x === 'number' && Number.isFinite(x) && x >= minimo;

export function validarManifiestoPdf(m: ManifiestoPdf) {
  if (!m.lote?.trim()) throw new Error('El manifiesto no declara el lote');
  if (!m.fuente?.archivo?.trim() || !/^[0-9a-f]{64}$/.test(m.fuente.sha256 ?? ''))
    throw new Error('El manifiesto no declara la fuente con su sha256');
  const insumos = new Map<string, InsumoDeclarado>();
  for (const i of m.insumos ?? []) {
    if (!UUID.test(i.id ?? '') || insumos.has(i.id))
      throw new Error(`Insumo inválido o repetido: ${i.nombre}`);
    if (
      !['gr', 'ml', 'pza'].includes(i.unidad) ||
      !numero(i.costo_paquete, 0) ||
      !numero(i.presentacion, 0) ||
      i.presentacion <= 0
    )
      throw new Error(`Insumo ${i.nombre}: unidad, costo o presentación inválidos`);
    insumos.set(i.id, i);
  }
  const recetas = new Set<string>();
  for (const r of m.recetas ?? []) {
    if (!UUID.test(r.id ?? '') || recetas.has(r.id) || !Number.isInteger(r.version))
      throw new Error(`Receta inválida o repetida: ${r.nombre}`);
    if (!Number.isInteger(r.pagina) || r.pagina < 1)
      throw new Error(`Falta la página del PDF de ${r.nombre}`);
    recetas.add(r.id);
  }
  if (!recetas.size) throw new Error('El manifiesto no tiene recetas');
  const celdas = m.celdas ?? [];
  const cambios = m.cambiosInsumo ?? [];
  if (!celdas.length && !cambios.length) throw new Error('El manifiesto no tiene cambios');
  const conCambios = new Set<string>();
  const vistas = new Set<string>();
  for (const c of celdas) {
    if (![c.receta_id, c.linea_id, c.insumo_id, c.tamano_id].every((x) => UUID.test(x ?? '')))
      throw new Error(`Identificadores inválidos en ${c.insumo} ${c.tamano}`);
    if (!recetas.has(c.receta_id))
      throw new Error(`La celda ${c.insumo} ${c.tamano} es de una receta no declarada`);
    if (!insumos.has(c.insumo_id)) throw new Error(`El insumo ${c.insumo} no está declarado`);
    if (!numero(c.previo, 0) || !numero(c.nuevo, 0) || c.previo === c.nuevo)
      throw new Error(`Valores inválidos en ${c.insumo} ${c.tamano}`);
    if (!c.fuente?.trim()) throw new Error(`Falta la fuente de ${c.insumo} ${c.tamano}`);
    const k = `${c.linea_id}:${c.tamano_id}`;
    if (vistas.has(k)) throw new Error(`Celda repetida: ${c.insumo} ${c.tamano}`);
    vistas.add(k);
    conCambios.add(c.receta_id);
  }
  const lineas = new Set<string>();
  for (const c of cambios) {
    if (![c.receta_id, c.linea_id, c.desde_id, c.hacia_id].every((x) => UUID.test(x ?? '')))
      throw new Error(`Identificadores inválidos en el cambio de ${c.desde}`);
    if (!recetas.has(c.receta_id)) throw new Error(`El cambio de ${c.desde} es de una receta no declarada`);
    if (lineas.has(c.linea_id)) throw new Error(`Línea repetida en los cambios de insumo`);
    lineas.add(c.linea_id);
    const [o, d] = [insumos.get(c.desde_id), insumos.get(c.hacia_id)];
    if (!o || !d || c.desde_id === c.hacia_id)
      throw new Error(`Insumos no declarados o iguales en ${c.desde}`);
    if (o.costo_paquete / o.presentacion !== d.costo_paquete / d.presentacion)
      throw new Error(
        `${c.desde} → ${c.hacia}: costo unitario distinto; el cambio de insumo cambiaría costos`,
      );
    if (!c.fuente?.trim()) throw new Error(`Falta la fuente del cambio de ${c.desde}`);
    const tamanos = new Set<string>();
    if (!Array.isArray(c.cantidades) || !c.cantidades.length)
      throw new Error(`El cambio de ${c.desde} no declara cantidades`);
    for (const x of c.cantidades) {
      if (
        !UUID.test(x.tamano_id ?? '') ||
        tamanos.has(x.tamano_id) ||
        !numero(x.cantidad, 0) ||
        x.cantidad <= 0
      )
        throw new Error(`Cantidad inválida o repetida en el cambio de ${c.desde}`);
      tamanos.add(x.tamano_id);
    }
    for (const celda of celdas.filter((x) => x.linea_id === c.linea_id)) {
      if (celda.insumo_id !== c.desde_id)
        throw new Error(`La celda ${celda.tamano} no usa el insumo origen de su línea`);
      if (c.cantidades.find((x) => x.tamano_id === celda.tamano_id)?.cantidad !== celda.nuevo)
        throw new Error(`Las cantidades finales de ${c.desde} no coinciden con la celda ${celda.tamano}`);
    }
    conCambios.add(c.receta_id);
  }
  for (const r of m.recetas)
    if (!conCambios.has(r.id)) throw new Error(`La receta ${r.nombre} no tiene cambios`);
}

export async function leerLotePdf(
  nombre: string,
  raiz = '.',
  aprobados = LOTES_PDF_APROBADOS,
): Promise<ManifiestoPdf> {
  const entrada = aprobados[nombre];
  if (!entrada) throw new Error(`El lote «${nombre}» no está aprobado (no figura en LOTES_PDF_APROBADOS)`);
  const texto = normalizar(await readFile(`${raiz}/${entrada.manifiesto}`, 'utf8'));
  const huella = createHash('sha256').update(texto).digest('hex');
  if (huella !== entrada.sha256)
    throw new Error(`El manifiesto de «${nombre}» no es el aprobado (sha256 ${huella}). Requiere revisión.`);
  const m = JSON.parse(texto) as ManifiestoPdf;
  if (m.lote !== nombre) throw new Error(`El manifiesto declara «${m.lote}», no «${nombre}»`);
  validarManifiestoPdf(m);
  return m;
}

export type ResultadoPdf = 'cambiada' | 'sin cambio' | 'revertida' | 'problema';
export interface InformeCambio {
  tipo: 'cantidad' | 'insumo';
  receta: string;
  detalle: string;
  resultado: ResultadoPdf;
  bitacora?: number;
  problemas: string[];
}
export interface InformePdf {
  modo: ModoPdf;
  lote: string;
  usuario: string;
  ejecucion: string;
  cambios: InformeCambio[];
  versiones: Record<string, { esperada: number; antes?: number; despues?: number }>;
  totales: Record<ResultadoPdf, number>;
  bitacoraPropia: number;
  bitacoraAjena: number;
  costosSinCambios?: boolean;
  restoSinCambios?: boolean;
  transaccion: Cierre;
  error?: string;
}

/** [nombre, consulta, parámetros]: 'c' = claves de celdas, 'l' = líneas con cambio de insumo, 'r' = recetas. */
const HUELLAS: [string, string, ('c' | 'l' | 'r')[]][] = [
  ['producto_tamanos', 'select * from public.producto_tamanos', []],
  ['precio_canal_manual', 'select * from public.precio_canal_manual', []],
  ['producto_codigo_pos', 'select * from public.producto_codigo_pos', []],
  ['insumos', 'select * from public.insumos', []],
  ['receta_lineas (resto)', 'select * from public.receta_lineas where id <> all ($1::uuid[])', ['l']],
  [
    'receta_lineas del lote (sin insumo)',
    'select id, receta_id, subreceta_id, orden from public.receta_lineas where id = any ($1::uuid[])',
    ['l'],
  ],
  [
    'linea_cantidades (resto)',
    `select * from public.linea_cantidades
      where (linea_id::text || ':' || coalesce(tamano_id::text, '')) <> all ($1::text[])`,
    ['c'],
  ],
  ['recetas (resto)', 'select * from public.recetas where id <> all ($1::uuid[])', ['r']],
  [
    'recetas del lote (sin versión)',
    `select id, nombre, tipo, categoria_id, rendimiento, unidad_rendimiento, activo from public.recetas
      where id = any ($1::uuid[])`,
    ['r'],
  ],
];
const COSTOS = [
  'select producto_id, tamano_id, round(costo, 6) as costo, usa_inactivo from public.v_costo_producto',
  'select subreceta_id, round(costo_unitario, 6) as costo, usa_inactivo from public.v_costo_subreceta',
];
const huellaDe = `select count(*)::text || ':' || md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h`;

export async function aplicarLotePdf(
  cx: Conexion,
  modo: ModoPdf,
  m: ManifiestoPdf,
  opciones: { usuario: string; ejecucion?: string },
): Promise<InformePdf> {
  const ejecucion = modo === 'revertir' ? (opciones.ejecucion ?? '') : (opciones.ejecucion ?? randomUUID());
  const nombreReceta = (id: string) => m.recetas?.find((r) => r.id === id)?.nombre ?? id;
  const informe: InformePdf = {
    modo,
    lote: m.lote,
    usuario: opciones.usuario,
    ejecucion,
    cambios: [
      ...(m.celdas ?? []).map((c) => ({
        tipo: 'cantidad' as const,
        receta: nombreReceta(c.receta_id),
        detalle: `${c.insumo} ${c.tamano}: ${c.previo} → ${c.nuevo}`,
        resultado: 'problema' as ResultadoPdf,
        problemas: [],
      })),
      ...(m.cambiosInsumo ?? []).map((c) => ({
        tipo: 'insumo' as const,
        receta: nombreReceta(c.receta_id),
        detalle: `${c.desde} → ${c.hacia} (${c.cantidades.map((x) => `${x.tamano} ${x.cantidad}`).join(', ')})`,
        resultado: 'problema' as ResultadoPdf,
        problemas: [],
      })),
    ],
    versiones: Object.fromEntries((m.recetas ?? []).map((r) => [r.nombre, { esperada: r.version }])),
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
    validarManifiestoPdf(m);
  } catch (e) {
    informe.error = e instanceof Error ? e.message : String(e);
    return informe;
  }
  const nCeldas = m.celdas.length;
  const infCelda = (i: number) => informe.cambios[i];
  const infLinea = (i: number) => informe.cambios[nCeldas + i];
  const claves = m.celdas.map((c) => `${c.linea_id}:${c.tamano_id}`);
  const lineasInsumo = m.cambiosInsumo.map((c) => c.linea_id);
  const todasLineas = [...new Set([...m.celdas.map((c) => c.linea_id), ...lineasInsumo])];
  const recetas = m.recetas.map((r) => r.id).sort();
  const notaEjecucion = `${m.lote}, ejecución ${ejecucion} (docs/conciliacion-brasil/29)`;
  const nota =
    modo === 'revertir'
      ? `${m.lote}, reversión de la ejecución ${ejecucion} (docs/conciliacion-brasil/29)`
      : notaEjecucion;
  const huellas = async () => {
    const h: Record<string, string> = {};
    for (const [nombre, sql, params] of HUELLAS)
      h[nombre] = (
        await cx.query<{ h: string }>(
          `${huellaDe} from (${sql}) x`,
          params.map((p) => (p === 'c' ? claves : p === 'l' ? lineasInsumo : recetas)),
        )
      ).rows[0].h;
    return h;
  };
  const costos = async () => {
    const h: string[] = [];
    for (const sql of COSTOS)
      h.push((await cx.query<{ h: string }>(`${huellaDe} from (${sql}) x`)).rows[0].h);
    return h.join('/');
  };
  const leerLineas = async () =>
    new Map(
      (
        await cx.query<{ id: string; receta_id: string; insumo_id: string | null; cantidades: string }>(
          `select l.id, l.receta_id, l.insumo_id,
                  coalesce(string_agg(lc.tamano_id::text || '=' || lc.cantidad::text, ',' order by lc.tamano_id), '') as cantidades
             from public.receta_lineas l left join public.linea_cantidades lc on lc.linea_id = l.id
            where l.id = any ($1::uuid[]) group by l.id`,
          [todasLineas],
        )
      ).rows.map((x) => [
        x.id,
        {
          ...x,
          celdas: new Map(
            x.cantidades
              .split(',')
              .filter(Boolean)
              .map((p) => p.split('=') as [string, string])
              .map(([t, n]) => [t, Number(n)]),
          ),
        },
      ]),
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

    // Insumos: como los declara el manifiesto (costos de compra incluidos), bloqueados.
    const ins = (
      await cx.query<{
        id: string;
        nombre: string;
        unidad: string;
        costo_paquete: string;
        presentacion: string;
        activo: boolean;
      }>(
        `select id, nombre, unidad::text, costo_paquete::text, presentacion::text, activo from public.insumos
          where id = any ($1::uuid[]) order by id for update`,
        [m.insumos.map((i) => i.id)],
      )
    ).rows;
    for (const d of m.insumos) {
      const i = ins.find((x) => x.id === d.id);
      if (
        !i ||
        i.nombre !== d.nombre ||
        i.unidad !== d.unidad ||
        Number(i.costo_paquete) !== d.costo_paquete ||
        Number(i.presentacion) !== d.presentacion ||
        !i.activo
      )
        throw new Error(
          `El insumo ${d.nombre} no está como declara el manifiesto: ${JSON.stringify(i ?? null)}`,
        );
    }

    const rs = (
      await cx.query<{ id: string; nombre: string; tipo: string; activo: boolean; version: number }>(
        `select id, nombre, tipo, activo, version from public.recetas where id = any ($1::uuid[]) order by id for update`,
        [recetas],
      )
    ).rows;
    for (const r of m.recetas) {
      const a = rs.find((x) => x.id === r.id);
      if (!a) throw new Error(`La receta ${r.nombre} no existe`);
      if (a.nombre !== r.nombre) throw new Error(`La receta se llama «${a.nombre}», no «${r.nombre}»`);
      if (a.tipo !== 'producto' || !a.activo) throw new Error(`${r.nombre} no es un producto activo`);
      informe.versiones[r.nombre].antes = Number(a.version);
    }
    await cx.query(`select 1 from public.receta_lineas where id = any ($1::uuid[]) order by id for update`, [
      todasLineas,
    ]);
    await cx.query(
      `select 1 from public.linea_cantidades
        where (linea_id::text || ':' || coalesce(tamano_id::text, '')) = any ($1::text[]) order by linea_id, tamano_id for update`,
      [claves],
    );
    const maxBitacora = Number(
      (await cx.query<{ m: string }>(`select coalesce(max(id), 0) as m from bitacora`)).rows[0].m,
    );
    const huellasAntes = await huellas();
    const costosAntes = await costos();
    const actuales = await leerLineas();

    // Estado de partida y de llegada de cada cambio según el modo.
    const enNuevo = () =>
      m.celdas.every((c) => actuales.get(c.linea_id)?.celdas.get(c.tamano_id) === c.nuevo) &&
      m.cambiosInsumo.every((c) => actuales.get(c.linea_id)?.insumo_id === c.hacia_id);
    const todoSinCambio = modo !== 'revertir' && enNuevo();
    let propios: {
      id: string;
      tabla: string;
      registro_id: string;
      valor_anterior: string;
      valor_nuevo: string;
    }[] = [];
    if (modo === 'revertir') {
      propios = (
        await cx.query<(typeof propios)[number]>(
          `select id, tabla, registro_id, valor_anterior, valor_nuevo from bitacora where nota = $1 order by id`,
          [notaEjecucion],
        )
      ).rows;
      if (!propios.length)
        throw new Error(`No hay registros de la ejecución ${ejecucion}: nada que revertir`);
      const ultimo = Math.max(...propios.map((p) => Number(p.id)));
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
    } else if (!todoSinCambio) {
      for (const r of m.recetas) {
        const v = informe.versiones[r.nombre];
        if (v.antes !== r.version)
          throw new Error(
            `${r.nombre}: versión ${v.antes}, el manifiesto espera ${r.version}. No se toca nada.`,
          );
      }
    }

    m.celdas.forEach((c, i) => {
      const ic = infCelda(i);
      const a = actuales.get(c.linea_id);
      if (!a) return void ic.problemas.push('la línea no existe');
      if (a.receta_id !== c.receta_id) ic.problemas.push('la línea no pertenece a la receta');
      const valor = a.celdas.get(c.tamano_id);
      if (todoSinCambio) {
        if (!ic.problemas.length) ic.resultado = 'sin cambio';
        return;
      }
      const origen = modo === 'revertir' ? c.nuevo : c.previo;
      if (valor !== origen) ic.problemas.push(`valor actual ${valor ?? 'ninguno'}, se esperaba ${origen}`);
      // Al aplicar, la celda se cambia con el insumo origen de la línea; al revertir, la línea vuelve antes al origen.
      const cambio = m.cambiosInsumo.find((x) => x.linea_id === c.linea_id);
      const insumoAhora = cambio && modo === 'revertir' ? cambio.hacia_id : c.insumo_id;
      if (a.insumo_id !== insumoAhora)
        ic.problemas.push(`la línea usa ${a.insumo_id}, se esperaba ${insumoAhora}`);
      if (modo === 'revertir') {
        const p = propios.filter(
          (x) => x.tabla === 'linea_cantidades' && x.registro_id === `${c.linea_id}:${c.tamano_id}`,
        );
        if (
          p.length !== 1 ||
          Number(p[0].valor_anterior) !== c.previo ||
          Number(p[0].valor_nuevo) !== c.nuevo
        )
          ic.problemas.push('la ejecución no cambió esta celda como declara el manifiesto');
      }
    });
    m.cambiosInsumo.forEach((c, i) => {
      const il = infLinea(i);
      const a = actuales.get(c.linea_id);
      if (!a) return void il.problemas.push('la línea no existe');
      if (a.receta_id !== c.receta_id) il.problemas.push('la línea no pertenece a la receta');
      if (todoSinCambio) {
        if (!il.problemas.length) il.resultado = 'sin cambio';
        return;
      }
      const desde = modo === 'revertir' ? c.hacia_id : c.desde_id;
      if (a.insumo_id !== desde) il.problemas.push(`la línea usa ${a.insumo_id}, se esperaba ${desde}`);
      // Las cantidades de la línea al cambiar de insumo: las finales (las celdas del lote ya aplicadas, o aún no revertidas).
      const celdasLinea = m.celdas.filter((x) => x.linea_id === c.linea_id);
      const esperadas = c.cantidades.map((x) => {
        const celda = celdasLinea.find((y) => y.tamano_id === x.tamano_id);
        return { ...x, cantidad: celda && modo !== 'revertir' ? celda.previo : x.cantidad };
      });
      if (
        a.celdas.size !== esperadas.length ||
        esperadas.some((x) => a.celdas.get(x.tamano_id) !== x.cantidad)
      )
        il.problemas.push(
          `cantidades ${[...a.celdas].map(([t, n]) => `${t}=${n}`).join(',')}, se esperaban ${esperadas.map((x) => `${x.tamano_id}=${x.cantidad}`).join(',')}`,
        );
      if (modo === 'revertir') {
        const p = propios.filter((x) => x.tabla === 'receta_lineas' && x.registro_id === c.linea_id);
        if (p.length !== 1 || p[0].valor_anterior !== c.desde_id || p[0].valor_nuevo !== c.hacia_id)
          il.problemas.push('la ejecución no cambió esta línea como declara el manifiesto');
      }
    });
    if (informe.cambios.some((x) => x.problemas.length))
      throw new Error('Algún cambio no está como declara el manifiesto: no se toca nada');

    const actualizarCeldas = async (destino: 'nuevo' | 'previo') => {
      const origen = destino === 'nuevo' ? 'previo' : 'nuevo';
      const hechos = (
        await cx.query<{ clave: string }>(
          `update public.linea_cantidades lc set cantidad = v.objetivo
             from unnest($1::uuid[], $2::uuid[], $3::numeric[], $4::numeric[]) as v(linea_id, tamano_id, origen, objetivo)
            where lc.linea_id = v.linea_id and lc.tamano_id = v.tamano_id and lc.cantidad = v.origen
           returning lc.linea_id::text || ':' || lc.tamano_id::text as clave`,
          [
            m.celdas.map((c) => c.linea_id),
            m.celdas.map((c) => c.tamano_id),
            m.celdas.map((c) => c[origen]),
            m.celdas.map((c) => c[destino]),
          ],
        )
      ).rows;
      if (hechos.length !== m.celdas.length)
        throw new Error(`Se actualizaron ${hechos.length} celdas y se esperaban ${m.celdas.length}`);
    };
    const actualizarInsumos = async (sentido: 'ida' | 'vuelta') => {
      for (const c of m.cambiosInsumo) {
        const [de, a] = sentido === 'ida' ? [c.desde_id, c.hacia_id] : [c.hacia_id, c.desde_id];
        const hechos = (
          await cx.query(
            `update public.receta_lineas set insumo_id = $1 where id = $2 and insumo_id = $3 returning id`,
            [a, c.linea_id, de],
          )
        ).rows;
        if (hechos.length !== 1) throw new Error(`No se cambió el insumo de la línea ${c.linea_id}`);
      }
    };
    if (!todoSinCambio) {
      if (modo === 'revertir') {
        await actualizarInsumos('vuelta');
        if (m.celdas.length) await actualizarCeldas('previo');
      } else {
        if (m.celdas.length) await actualizarCeldas('nuevo');
        await actualizarInsumos('ida');
      }
    }

    // Verificación: estado final, bitácora propia, versiones, costos y huellas del resto.
    const despues = await leerLineas();
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
    const registro = (
      ic: InformeCambio,
      tabla: string,
      registroId: string,
      campo: string,
      receta: string,
      igual: (anterior: string | null, nuevo: string | null) => boolean,
    ) => {
      const b = mias.filter((x) => x.tabla === tabla && x.registro_id === registroId);
      if (
        b.length !== 1 ||
        b[0].campo !== campo ||
        b[0].receta_id !== receta ||
        !igual(b[0].valor_anterior, b[0].valor_nuevo) ||
        b[0].origen !== 'carga_masiva' ||
        b[0].usuario_id !== opciones.usuario
      )
        ic.problemas.push(`bitácora inesperada: ${JSON.stringify(b)}`);
      else {
        ic.bitacora = Number(b[0].id);
        usadas.add(b[0].id);
      }
    };
    m.celdas.forEach((c, i) => {
      const ic = infCelda(i);
      if (ic.resultado === 'sin cambio') return;
      const [de, a] = modo === 'revertir' ? [c.nuevo, c.previo] : [c.previo, c.nuevo];
      const valor = despues.get(c.linea_id)?.celdas.get(c.tamano_id);
      if (valor !== a) ic.problemas.push(`quedó en ${valor}, se esperaba ${a}`);
      registro(
        ic,
        'linea_cantidades',
        `${c.linea_id}:${c.tamano_id}`,
        'cantidad',
        c.receta_id,
        (x, y) => Number(x) === de && Number(y) === a,
      );
      if (!ic.problemas.length) ic.resultado = modo === 'revertir' ? 'revertida' : 'cambiada';
    });
    m.cambiosInsumo.forEach((c, i) => {
      const il = infLinea(i);
      if (il.resultado === 'sin cambio') return;
      const [de, a] = modo === 'revertir' ? [c.hacia_id, c.desde_id] : [c.desde_id, c.hacia_id];
      if (despues.get(c.linea_id)?.insumo_id !== a)
        il.problemas.push('la línea no quedó en el insumo esperado');
      registro(il, 'receta_lineas', c.linea_id, 'insumo_id', c.receta_id, (x, y) => x === de && y === a);
      if (!il.problemas.length) il.resultado = modo === 'revertir' ? 'revertida' : 'cambiada';
    });
    const sobrantes = mias.filter((x) => !usadas.has(x.id));
    if (sobrantes.length)
      throw new Error(
        `Esta ejecución dejó ${sobrantes.length} registro(s) de bitácora inesperado(s): no se aplica nada`,
      );
    if (usadas.size)
      await cx.query(`update bitacora set nota = $2 where id = any ($1::bigint[])`, [[...usadas], nota]);

    const vers = (
      await cx.query<{ id: string; nombre: string; version: number }>(
        `select id, nombre, version from public.recetas where id = any ($1::uuid[])`,
        [recetas],
      )
    ).rows;
    for (const r of vers) {
      const v = informe.versiones[r.nombre];
      v.despues = Number(r.version);
      const n = todoSinCambio
        ? 0
        : m.celdas.filter((c) => c.receta_id === r.id).length +
          m.cambiosInsumo.filter((c) => c.receta_id === r.id).length;
      if (v.despues !== (v.antes ?? 0) + n)
        throw new Error(`La versión de ${r.nombre} pasó de ${v.antes} a ${v.despues}; se esperaba +${n}`);
    }
    informe.costosSinCambios = (await costos()) === costosAntes;
    informe.restoSinCambios = JSON.stringify(await huellas()) === JSON.stringify(huellasAntes);
    for (const ic of informe.cambios) {
      if (ic.problemas.length) ic.resultado = 'problema';
      informe.totales[ic.resultado]++;
    }
    if (informe.totales.problema)
      throw new Error(`${informe.totales.problema} cambio(s) con problemas: no se aplica nada`);
    if (!informe.costosSinCambios)
      throw new Error('Cambió el costo de algún producto o subreceta: no se aplica nada');
    if (!informe.restoSinCambios)
      throw new Error(
        'Cambió algo fuera del lote (precios, enlaces, insumos, otras líneas, cantidades o recetas)',
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
