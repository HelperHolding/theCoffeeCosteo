import {
  fechaLocal,
  parseItems,
  planDatTipo,
  planEngCeil,
  planEngMediana,
  type PedidoPlan,
} from '../../supabase/functions/_shared/planEngine.ts';
import { validarCorreos } from './config';
import { difDias, masDias } from './fechas';

/**
 * Orden de venta sugerida, piloto (spec 2026-11-18-ov-sugerida-piloto-design.md, §4): "receta calibrada" por tienda.
 * Puro: no lee la base ni el POS. Fechas en días de CDMX ('YYYY-MM-DD'); cantidades de SKU en paquetes del catálogo.
 */
export const DIAS_HISTORIA = 90;
export const DIAS_CONSUMO = 28;
export const CADENCIA_MIN = 7;
export const CADENCIA_MAX = 30;
export const CADENCIA_POR_DEFECTO = 14;
export const K_MIN = 0.8;
export const K_MAX = 1.5;
export const TOLERANCIA = 0.2;
export const ARRASTRE_MAX = 1;
export const CORREOS_OVS = ['compras@mx.thecoffee.jp', 'scervera@mx.thecoffee.jp'];

export interface PedidoTienda {
  id: string;
  /** Día local de CDMX del pedido. */
  fecha: string;
  /** SKU canónico del catálogo → cantidad. */
  lineas: Record<string, number>;
}
export interface FilaCatalogoOv {
  sku: string;
  nombre: string | null;
  estatus: string | null;
  costo_unitario: number | null;
}
export interface InsumoSku {
  insumo_id: string;
  sku: string;
  /** Unidades del insumo (gr, ml, pza) por paquete del SKU. */
  factor: number;
  activo: boolean;
}
export interface InsumoConsumido {
  insumoId: string;
  insumo: string;
  cantidad: number;
}
export type OrigenOv = 'receta' | 'historial';
export interface LineaOv {
  sku: string;
  nombre: string | null;
  origen: OrigenOv;
  /** Calibración; null en lo de historial. */
  k: number | null;
  /** Paquetes por día (receta × k, o compras de 90 días ÷ 90). */
  diario: number;
  necesidad: number;
  ya_pedido: number;
  arrastre: number;
  sugerido: number;
  /** sugerido × costo_unitario; null si el SKU no tiene costo. */
  monto: number | null;
}
export interface FilaMedicion {
  sku: string;
  nombre: string | null;
  sugerido: number;
  pedido: number;
  diferencia: number;
}
export interface Medicion {
  desde: string;
  filas: FilaMedicion[];
  montoSugerido: number;
  montoPedido: number;
}

const CANCELADOS = new Set(['cancelado', 'cancelacion_pendiente']);
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const r2 = (x: number) => Math.round(x * 100) / 100;
const acotar = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

/** Lunes (ISO) de la semana de una fecha. */
export function lunesDe(fecha: string): string {
  const dia = new Date(`${fecha}T00:00:00Z`).getUTCDay(); // 0 = domingo
  return masDias(fecha, -((dia + 6) % 7));
}

/** Destinatarios: com_plan_config.config.ovs.correos si es una lista válida; si no, las dos direcciones del piloto. */
export function correosOvs(config: unknown): string[] {
  const lista = (config as { ovs?: { correos?: unknown } } | null | undefined)?.ovs?.correos;
  if (!Array.isArray(lista) || !lista.length) return CORREOS_OVS;
  const v = validarCorreos(lista.map(String).join(','));
  return 'correos' in v && v.correos.length ? v.correos : CORREOS_OVS;
}

type ItemPedido = { sku?: string; nombre?: string; cantidad?: unknown } | null;

/**
 * Pedidos de resurtido de una apertura (§4.1), con las reglas de ítems de serieDiaria: sin cancelados; items_editados
 * manda aunque venga vacío; el sku de una línea editada se recupera de la línea original con el mismo nombre y si no,
 * de com_sku_mapping; SKU canónico del catálogo (sin espacios, sin importar mayúsculas). El tipo es el de planDatTipo
 * sin aperturas: llenado de canal, marketing, corporativo, sin sucursal y apertura (tabla o nota) no cuentan.
 */
export function pedidosResurtido(a: {
  pedidos: PedidoPlan[];
  aperturaId: string;
  pedidosApertura: Iterable<string>;
  mapa: { shopify_nombre: string; sku: string }[];
  catalogo: FilaCatalogoOv[];
}): { pedidos: PedidoTienda[]; sinSku: number; fueraDeCatalogo: string[] } {
  const pedEnAper: Record<string, boolean> = {};
  for (const id of a.pedidosApertura) pedEnAper[id] = true;
  const skuMap: Record<string, string> = {};
  a.mapa.forEach((m) => {
    skuMap[m.shopify_nombre] = m.sku;
  });
  const catSku = new Map(a.catalogo.map((c) => [String(c.sku).trim().toUpperCase(), c.sku]));
  const fuera = new Set<string>();
  let sinSku = 0;
  const salida: PedidoTienda[] = [];
  for (const p of a.pedidos) {
    if (String(p.apertura_id ?? '') !== a.aperturaId) continue;
    if (p.status == null || CANCELADOS.has(p.status)) continue;
    if (planDatTipo(p, {}, pedEnAper, 0, 0) !== 'resurtido') continue;
    const t = new Date(p.fecha_pedido).getTime();
    if (isNaN(t)) continue;
    const orig = parseItems(p.items) as ItemPedido[];
    const its = p.items_editados ? (parseItems(p.items_editados) as ItemPedido[]) : orig;
    let idxNom: Record<string, string> | null = null;
    const lineas: Record<string, number> = {};
    for (const it of its) {
      if (!it) continue;
      let sku = it.sku || (it.nombre ? skuMap[it.nombre] : undefined);
      if (!sku && it.nombre) {
        idxNom ??= Object.fromEntries(
          orig.filter((o) => o && o.sku && o.nombre).map((o) => [o!.nombre as string, o!.sku as string]),
        );
        sku = idxNom[it.nombre];
      }
      const qty = Number(it.cantidad == null ? 0 : it.cantidad);
      if (!isFinite(qty) || qty < 0) continue;
      if (!sku) {
        if (it.nombre) sinSku++;
        continue;
      }
      const real = catSku.get(String(sku).trim().toUpperCase());
      if (!real) {
        fuera.add(String(sku));
        continue;
      }
      lineas[real] = (lineas[real] ?? 0) + qty;
    }
    salida.push({ id: String(p.id), fecha: fechaLocal(t), lineas });
  }
  salida.sort((x, y) => x.fecha.localeCompare(y.fecha) || x.id.localeCompare(y.id));
  return { pedidos: salida, sinSku, fueraDeCatalogo: [...fuera].sort() };
}

/** §4.2: mediana de días entre días con pedido de hoy-90 a hoy, acotada a [7, 30]; con menos de 2 días, 14. */
export function cadencia(
  pedidos: PedidoTienda[],
  hoy: string,
): { dias: number; porDefecto: boolean; diasConPedido: number } {
  const desde = masDias(hoy, -DIAS_HISTORIA);
  const fechas = [
    ...new Set(pedidos.filter((p) => p.fecha >= desde && p.fecha <= hoy).map((p) => p.fecha)),
  ].sort();
  if (fechas.length < 2)
    return { dias: CADENCIA_POR_DEFECTO, porDefecto: true, diasConPedido: fechas.length };
  const saltos = fechas.slice(1).map((f, i) => difDias(fechas[i], f));
  return {
    dias: acotar(Math.round(planEngMediana(saltos)), CADENCIA_MIN, CADENCIA_MAX),
    porDefecto: false,
    diasConPedido: fechas.length,
  };
}

export function ultimoPedido(pedidos: PedidoTienda[], hoy: string): string | null {
  const fechas = pedidos.map((p) => p.fecha).filter((f) => f <= hoy);
  return fechas.length ? fechas.reduce((x, y) => (y > x ? y : x)) : null;
}

/** Cantidad pedida por SKU con día entre desde y hasta (incluidos). */
export function comprasEn(pedidos: PedidoTienda[], desde: string, hasta: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of pedidos)
    if (p.fecha >= desde && p.fecha <= hasta)
      for (const [sku, q] of Object.entries(p.lineas)) m.set(sku, (m.get(sku) ?? 0) + q);
  return m;
}

/**
 * §4.4: paquetes por día de cada SKU = Σ consumo del insumo ÷ factor ÷ días. Solo mapeos activos; un insumo con
 * consumo y sin mapeo activo no entra (leche, hielo, panadería…) y se lista por nombre.
 */
export function diarioPorSku(a: { insumos: InsumoConsumido[]; dias: number; mapeo: InsumoSku[] }): {
  porSku: Map<string, number>;
  sinMapeo: string[];
} {
  const porInsumo = new Map(a.mapeo.filter((m) => m.activo && m.factor > 0).map((m) => [m.insumo_id, m]));
  const porSku = new Map<string, number>();
  const sinMapeo = new Set<string>();
  if (!(a.dias > 0)) return { porSku, sinMapeo: [] };
  for (const i of a.insumos) {
    if (!(i.cantidad > 0)) continue;
    const m = porInsumo.get(i.insumoId);
    if (!m) {
      sinMapeo.add(i.insumo);
      continue;
    }
    porSku.set(m.sku, (porSku.get(m.sku) ?? 0) + i.cantidad / m.factor / a.dias);
  }
  return { porSku, sinMapeo: [...sinMapeo].sort((x, y) => x.localeCompare(y, 'es')) };
}

/** §4.5: compras de 90 días ÷ (diario × 90), acotado a [0.8, 1.5]; sin compras o sin consumo, 1. */
export function calibracion(compras90: number, diario: number): number {
  if (!(compras90 > 0) || !(diario > 0)) return 1;
  return acotar(compras90 / (diario * DIAS_HISTORIA), K_MIN, K_MAX);
}

/** §4.9: bruto = necesidad − ya pedido + arrastre anterior; sugerido = max(0, ⌈bruto − 0.2⌉); arrastre en ±1. */
export function conArrastre(
  necesidad: number,
  yaPedido: number,
  arrastrePrevio: number,
): { bruto: number; sugerido: number; arrastre: number } {
  const bruto = necesidad - yaPedido + arrastrePrevio;
  const sugerido = Math.max(0, planEngCeil(bruto - TOLERANCIA));
  return { bruto, sugerido, arrastre: acotar(bruto - sugerido, -ARRASTRE_MAX, ARRASTRE_MAX) };
}

/**
 * §4.6–4.11. Universo: SKUs con consumo por receta y SKUs comprados en hoy-90 … hoy-1. Es "receta" si algún insumo
 * activo se mapea a él (aunque no haya vendido en 28 días); si no, "historial". Ya pedido = lo pedido hoy (decisión 1
 * del plan). Inactivos fuera; los que pide la receta se devuelven aparte.
 */
export function calcularLineas(a: {
  hoy: string;
  cadencia: number;
  recetaDiaria: Map<string, number>;
  skusReceta: Set<string>;
  pedidos: PedidoTienda[];
  catalogo: FilaCatalogoOv[];
  arrastrePrevio: Map<string, number>;
}): { lineas: LineaOv[]; inactivos: { sku: string; nombre: string | null }[] } {
  const cat = new Map(a.catalogo.map((c) => [c.sku, c]));
  const compras = comprasEn(a.pedidos, masDias(a.hoy, -DIAS_HISTORIA), masDias(a.hoy, -1));
  const deHoy = comprasEn(a.pedidos, a.hoy, a.hoy);
  const skus = [...new Set([...a.recetaDiaria.keys(), ...compras.keys()])].sort();
  const lineas: LineaOv[] = [];
  const inactivos: { sku: string; nombre: string | null }[] = [];
  for (const sku of skus) {
    const c = cat.get(sku);
    const base = a.recetaDiaria.get(sku) ?? 0;
    const deReceta = a.skusReceta.has(sku) || a.recetaDiaria.has(sku);
    if (c?.estatus === 'Inactivo') {
      if (base > 0) inactivos.push({ sku, nombre: c.nombre });
      continue;
    }
    const comprado = compras.get(sku) ?? 0;
    const k = deReceta ? calibracion(comprado, base) : null;
    const diario = k != null ? base * k : comprado / DIAS_HISTORIA;
    const necesidad = diario * a.cadencia;
    const ya = deHoy.get(sku) ?? 0;
    const r = conArrastre(necesidad, ya, a.arrastrePrevio.get(sku) ?? 0);
    const costo = c?.costo_unitario;
    lineas.push({
      sku,
      nombre: c?.nombre ?? null,
      origen: deReceta ? 'receta' : 'historial',
      k: k == null ? null : r4(k),
      diario: r4(diario),
      necesidad: r4(necesidad),
      ya_pedido: ya,
      arrastre: r4(r.arrastre),
      sugerido: r.sugerido,
      monto: costo == null ? null : r2(r.sugerido * costo),
    });
  }
  return { lineas, inactivos };
}

/** §7: lo sugerido la semana pasada (sugerido > 0) contra lo que la tienda pidió desde su lunes hasta hoy. */
export function medicion(a: {
  anteriores: { sku: string; sugerido: number }[];
  desde: string;
  hoy: string;
  pedidos: PedidoTienda[];
  catalogo: FilaCatalogoOv[];
}): Medicion {
  const cat = new Map(a.catalogo.map((c) => [c.sku, c]));
  const pedido = comprasEn(a.pedidos, a.desde, a.hoy);
  const sug = new Map(a.anteriores.filter((l) => l.sugerido > 0).map((l) => [l.sku, l.sugerido]));
  let montoSugerido = 0;
  let montoPedido = 0;
  const filas = [...new Set([...sug.keys(), ...pedido.keys()])].sort().map((sku) => {
    const s = sug.get(sku) ?? 0;
    const p = pedido.get(sku) ?? 0;
    const costo = cat.get(sku)?.costo_unitario ?? 0;
    montoSugerido += s * costo;
    montoPedido += p * costo;
    return { sku, nombre: cat.get(sku)?.nombre ?? null, sugerido: s, pedido: p, diferencia: p - s };
  });
  return { desde: a.desde, filas, montoSugerido: r2(montoSugerido), montoPedido: r2(montoPedido) };
}
