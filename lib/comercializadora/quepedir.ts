import { masDias } from './fechas';
import type { ArticuloCatalogo, CompraProyectada, LineaOcZoho, MinMax, ResumenProyeccion } from './tipos';

const n = (x: unknown) => Number(x) || 0;

/** _comSaldoCedis: sin sync de Zoho, saldo de plataforma; con sync, físico de Zoho y si no, contable. */
export function saldoCedis(c: ArticuloCatalogo | undefined): number {
  if (!c) return 0;
  if (c.zoho_sync_at == null) return n(c.saldo_cedis);
  return c.zoho_stock_fisico != null ? Number(c.zoho_stock_fisico) : n(c.zoho_stock);
}

/** Inventario contable de Zoho (stock_on_hand: lo comprado menos lo facturado a venta), el que usa la simulación. */
export function contable(c: ArticuloCatalogo | undefined): number {
  return n(c?.zoho_stock);
}

/** Físico de Zoho (actual_available_stock), solo informativo: no entra en ningún cálculo. null si Zoho no lo manda. */
export function fisicoZoho(c: ArticuloCatalogo | undefined): number | null {
  return c?.zoho_stock_fisico == null ? null : Number(c.zoho_stock_fisico);
}

const CERRADAS = ['closed', 'cancelled', 'void'];
/** Pendiente de recibir de una línea de OC abierta de Zoho (borradores incluidos); 0 si está cerrada o es el marcador. */
function pendienteOc(l: LineaOcZoho): number {
  if (l.sku === '(sin-sku)' || CERRADAS.includes(String(l.status ?? '').toLowerCase())) return 0;
  const p = n(l.cantidad) - n(l.cantidad_recibida);
  return p > 0 ? p : 0;
}

/**
 * Filtros de lo en camino:
 * - sinFacturadas: deja fuera las OCs "billed", cuyas piezas ya cuentan en el contable (como en la simulación);
 * - sinBorradores: solo OCs emitidas, parcialmente recibidas o facturadas (columna "En camino" de Inventario);
 * - soloBorradores: solo OCs en borrador (columna "En borrador"). Pedido del usuario 2026-11-26.
 */
export interface FiltroCamino {
  sinFacturadas?: boolean;
  sinBorradores?: boolean;
  soloBorradores?: boolean;
}
/** Lo en camino que usa Qué pedir: sin borradores (pedido del usuario 2026-11-26) y sin facturadas, que ya están en el contable. */
export const FILTRO_QUE_PEDIR: FiltroCamino = { sinFacturadas: true, sinBorradores: true };

function entra(l: LineaOcZoho, f: FiltroCamino): boolean {
  const s = String(l.status ?? '').toLowerCase();
  if (f.sinFacturadas && s === 'billed') return false;
  if (f.sinBorradores && s === 'draft') return false;
  if (f.soloBorradores && s !== 'draft') return false;
  return true;
}

/** Piezas en camino por SKU: lo pendiente de recibir de OCs de Zoho abiertas (renderComQuePedir). */
export function enCamino(lineas: LineaOcZoho[], filtro: FiltroCamino = {}): Record<string, number> {
  const r: Record<string, number> = {};
  for (const l of lineas) {
    if (!entra(l, filtro)) continue;
    const p = pendienteOc(l);
    if (p > 0) r[l.sku] = (r[l.sku] ?? 0) + p;
  }
  return r;
}

/** Folios de las OCs que aportan a lo en camino de cada SKU, sin repetir y en orden. */
export function ocsEnCamino(lineas: LineaOcZoho[], filtro: FiltroCamino = {}): Record<string, string[]> {
  const r: Record<string, Set<string>> = {};
  for (const l of lineas) {
    if (!entra(l, filtro) || !(pendienteOc(l) > 0) || !l.po_number) continue;
    (r[l.sku] ??= new Set()).add(l.po_number);
  }
  return Object.fromEntries(
    Object.entries(r).map(([sku, s]) => [sku, [...s].sort((a, b) => a.localeCompare(b, 'es'))]),
  );
}

export interface DatosQuePedir {
  catalogo: ArticuloCatalogo[];
  minmax: MinMax[];
  compras: CompraProyectada[];
  camino: Record<string, number>;
  /** Llegada más próxima de lo en camino por SKU (llegadaEnCamino); opcional. */
  llegadas?: Record<string, LlegadaCamino>;
  yulius: boolean;
  resumen: ResumenProyeccion;
}

export interface FilaQuePedir {
  sku: string;
  nombre: string;
  vendor: string;
  vendorNombre: string;
  /** Inventario contable de Zoho (más 3PL si está activado). */
  inventario: number;
  /** Físico de Zoho, solo informativo. */
  fisico: number | null;
  camino: number;
  llegada: LlegadaCamino | null;
  venta: number;
  dias: number | null;
  costo: number | null;
  pedir: boolean;
  cant: number;
  monto: number;
  veces: number;
  adelanto: boolean;
  tarde: boolean;
  adMin: boolean;
  bajo: boolean;
  nota: 'sin proveedor en Zoho' | 'sin costo' | null;
}

/** _qpFilas: una fila por SKU del mín/máx; las compras con fecha ≤ hoy + dias − 1 (las vencidas siguen pendientes). */
export function filasQuePedir(d: DatosQuePedir, dias: number, hoy: string): FilaQuePedir[] {
  const fin = masDias(hoy, dias - 1);
  const cat = new Map(d.catalogo.map((c) => [c.sku, c]));
  const compra = new Map<
    string,
    {
      cant: number;
      monto: number;
      veces: number;
      adelanto: boolean;
      tarde: boolean;
      adMin: boolean;
      bajo: boolean;
    }
  >();
  for (const r of d.compras) {
    const f = String(r.fecha_oc ?? '').slice(0, 10);
    if (!f || f > fin) continue;
    const a = compra.get(r.sku) ?? {
      cant: 0,
      monto: 0,
      veces: 0,
      adelanto: false,
      tarde: false,
      adMin: false,
      bajo: false,
    };
    a.cant += n(r.cantidad);
    a.monto += n(r.monto);
    a.veces++;
    if (r.adelanto_cierre) a.adelanto = true;
    if (r.cierre_tarde) a.tarde = true;
    if (r.adelanto_minimo) a.adMin = true;
    if (r.bajo_minimo) a.bajo = true;
    compra.set(r.sku, a);
  }
  const sinCosto = new Set(Array.isArray(d.resumen.sinCosto) ? d.resumen.sinCosto : []);
  const sinProv = new Set(Array.isArray(d.resumen.sinProveedor) ? d.resumen.sinProveedor : []);
  return d.minmax.map((m) => {
    const c = cat.get(m.sku);
    const inventario = contable(c) + (d.yulius ? n(c?.saldo_yulius) : 0);
    const v = n(m.venta_diaria);
    const a = compra.get(m.sku);
    const costo = n(c?.costo_unitario) > 0 ? Number(c!.costo_unitario) : null;
    return {
      sku: m.sku,
      nombre: c?.nombre ?? '',
      vendor: String(c?.zoho_vendor_id || c?.zoho_vendor_name || '(sin proveedor)'),
      vendorNombre: c?.zoho_vendor_name || '(sin proveedor)',
      inventario,
      fisico: fisicoZoho(c),
      camino: n(d.camino[m.sku]),
      llegada: d.llegadas?.[m.sku] ?? null,
      venta: v,
      dias: v > 0 ? inventario / v : null,
      costo,
      pedir: !!a,
      cant: a?.cant ?? 0,
      monto: a?.monto ?? 0,
      veces: a?.veces ?? 0,
      adelanto: !!a?.adelanto,
      tarde: !!a?.tarde,
      adMin: !!a?.adMin,
      bajo: !!a?.bajo,
      nota: sinProv.has(m.sku) ? 'sin proveedor en Zoho' : sinCosto.has(m.sku) ? 'sin costo' : null,
    };
  });
}

export interface ProveedorQuePedir {
  vendor: string;
  nombre: string;
  skus: FilaQuePedir[];
  valor: number;
  ventaValor: number;
  caminoValor: number;
  aPedir: number;
  piezas: number;
  monto: number;
  bajo: boolean;
  dias: number | null;
  diasMin: number | null;
  pedir: boolean;
}

/** _qpProveedores: disponible y días en pesos (inventario × costo, venta × costo), solo artículos con costo. */
export function proveedoresQuePedir(filas: FilaQuePedir[]): ProveedorQuePedir[] {
  const g = new Map<string, ProveedorQuePedir>();
  for (const f of filas) {
    const p = g.get(f.vendor) ?? {
      vendor: f.vendor,
      nombre: f.vendorNombre,
      skus: [],
      valor: 0,
      ventaValor: 0,
      caminoValor: 0,
      aPedir: 0,
      piezas: 0,
      monto: 0,
      bajo: false,
      dias: null,
      diasMin: null,
      pedir: false,
    };
    p.skus.push(f);
    if (f.costo != null) {
      p.valor += Math.max(0, f.inventario) * f.costo;
      p.ventaValor += f.venta * f.costo;
      p.caminoValor += f.camino * f.costo;
    }
    if (f.pedir) {
      p.aPedir++;
      p.piezas += f.cant;
      p.monto += f.monto;
      if (f.bajo) p.bajo = true;
    }
    g.set(f.vendor, p);
  }
  return [...g.values()].map((p) => ({
    ...p,
    dias: p.ventaValor > 0 ? p.valor / p.ventaValor : null,
    pedir: p.aPedir > 0,
    diasMin: p.skus.reduce<number | null>(
      (m, f) => (f.dias != null && (m == null || f.dias < m) ? f.dias : m),
      null,
    ),
  }));
}

/** _qpOrden: lo que hay que pedir primero; luego menos días (sin venta = infinito); luego por SKU o nombre. */
export function ordenQuePedir(
  a: { pedir: boolean; dias: number | null; sku?: string; nombre?: string },
  b: { pedir: boolean; dias: number | null; sku?: string; nombre?: string },
): number {
  if (a.pedir !== b.pedir) return a.pedir ? -1 : 1;
  const da = a.dias ?? Infinity;
  const db = b.dias ?? Infinity;
  return da - db || String(a.sku ?? a.nombre).localeCompare(String(b.sku ?? b.nombre), 'es');
}

export function kpisQuePedir(filas: FilaQuePedir[], diasAlerta: number) {
  const pedir = filas.filter((f) => f.pedir);
  return {
    articulos: pedir.length,
    monto: pedir.reduce((s, f) => s + f.monto, 0),
    proveedores: new Set(pedir.map((f) => f.vendor)).size,
    cortos: filas.filter((f) => f.dias != null && f.dias < diasAlerta).length,
  };
}

/** Lead time de un SKU: el de Zoho (`zoho_lead_time`), si no el de `com_lead_times`, si no el de Configuración. */
export function leadTimePorSku(
  catalogo: { sku: string; zoho_lead_time?: number | null }[],
  leadTimes: { sku: string; dias: number | null }[],
  ltDefault: number,
): (sku: string) => number {
  const zoho = new Map(catalogo.map((c) => [c.sku, n(c.zoho_lead_time)]));
  const tabla = new Map(leadTimes.map((l) => [l.sku, n(l.dias)]));
  return (sku) =>
    n(zoho.get(sku)) > 0 ? n(zoho.get(sku)) : n(tabla.get(sku)) > 0 ? n(tabla.get(sku)) : ltDefault;
}

export interface LlegadaCamino {
  /** Llegada más próxima de lo en camino ('YYYY-MM-DD'). */
  fecha: string;
  /** true si salió de fecha de OC + lead time (la OC no trae fecha de entrega en Zoho). */
  estimada: boolean;
  /** La fecha ya pasó y sigue pendiente de recibir. */
  atrasada: boolean;
  /** Cuántas OCs más traen ese SKU, además de la más próxima. */
  mas: number;
}

/**
 * Llegada de lo en camino por SKU (pedido del usuario 2026-11-25): por cada OC con pendiente, la fecha de entrega de
 * Zoho o, si no tiene, fecha de la OC + lead time del SKU; se muestra la más próxima. Las OCs sin ninguna fecha no
 * cuentan. sinFacturadas: igual que enCamino (Qué pedir deja fuera las "billed").
 */
export function llegadaEnCamino(
  lineas: LineaOcZoho[],
  leadTime: (sku: string) => number,
  hoy: string,
  filtro: FiltroCamino = {},
): Record<string, LlegadaCamino> {
  const porSku = new Map<string, Map<string, { fecha: string; estimada: boolean }>>();
  for (const l of lineas) {
    if (!entra(l, filtro)) continue;
    if (!(pendienteOc(l) > 0)) continue;
    const fecha =
      l.fecha_entrega || (l.fecha_oc ? masDias(String(l.fecha_oc).slice(0, 10), leadTime(l.sku)) : null);
    if (!fecha) continue;
    const oc = String(l.zoho_po_id ?? l.po_number ?? `${l.sku}:${fecha}`);
    const ocs = porSku.get(l.sku) ?? new Map();
    const previa = ocs.get(oc);
    if (!previa || fecha < previa.fecha)
      ocs.set(oc, { fecha: String(fecha).slice(0, 10), estimada: !l.fecha_entrega });
    porSku.set(l.sku, ocs);
  }
  const r: Record<string, LlegadaCamino> = {};
  for (const [sku, ocs] of porSku) {
    const [primera] = [...ocs.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
    r[sku] = { ...primera, atrasada: primera.fecha < hoy, mas: ocs.size - 1 };
  }
  return r;
}
