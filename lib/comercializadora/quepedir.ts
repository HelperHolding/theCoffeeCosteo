import { masDias } from './fechas';
import type { ArticuloCatalogo, CompraProyectada, LineaOcZoho, MinMax, ResumenProyeccion } from './tipos';

const n = (x: unknown) => Number(x) || 0;

/** _comSaldoCedis: sin sync de Zoho, saldo de plataforma; con sync, físico de Zoho y si no, contable. */
export function saldoCedis(c: ArticuloCatalogo | undefined): number {
  if (!c) return 0;
  if (c.zoho_sync_at == null) return n(c.saldo_cedis);
  return c.zoho_stock_fisico != null ? Number(c.zoho_stock_fisico) : n(c.zoho_stock);
}

const CERRADAS = ['closed', 'cancelled', 'void'];
/** Piezas en camino por SKU: lo pendiente de recibir de OCs de Zoho abiertas (renderComQuePedir). */
export function enCamino(lineas: LineaOcZoho[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const l of lineas) {
    if (l.sku === '(sin-sku)' || CERRADAS.includes(String(l.status ?? '').toLowerCase())) continue;
    const p = n(l.cantidad) - n(l.cantidad_recibida);
    if (p > 0) r[l.sku] = (r[l.sku] ?? 0) + p;
  }
  return r;
}

export interface DatosQuePedir {
  catalogo: ArticuloCatalogo[];
  minmax: MinMax[];
  compras: CompraProyectada[];
  camino: Record<string, number>;
  yulius: boolean;
  resumen: ResumenProyeccion;
}

export interface FilaQuePedir {
  sku: string;
  nombre: string;
  vendor: string;
  vendorNombre: string;
  disp: number;
  camino: number;
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
    const disp = saldoCedis(c) + (d.yulius ? n(c?.saldo_yulius) : 0);
    const v = n(m.venta_diaria);
    const a = compra.get(m.sku);
    const costo = n(c?.costo_unitario) > 0 ? Number(c!.costo_unitario) : null;
    return {
      sku: m.sku,
      nombre: c?.nombre ?? '',
      vendor: String(c?.zoho_vendor_id || c?.zoho_vendor_name || '(sin proveedor)'),
      vendorNombre: c?.zoho_vendor_name || '(sin proveedor)',
      disp,
      camino: n(d.camino[m.sku]),
      venta: v,
      dias: v > 0 ? disp / v : null,
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

/** _qpProveedores: disponible y días en pesos (disp × costo, venta × costo), solo artículos con costo. */
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
      p.valor += Math.max(0, f.disp) * f.costo;
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
