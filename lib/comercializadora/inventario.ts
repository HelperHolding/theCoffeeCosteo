import { difDias } from './fechas';
import { enCamino, saldoCedis } from './quepedir';
import type { ArticuloCatalogo, LineaOcZoho } from './tipos';

const n = (x: unknown) => Number(x) || 0;

export interface ArticuloInventario extends ArticuloCatalogo {
  categoria: string | null;
  estatus: string | null;
  yulius_actualizado_at: string | null;
}
export interface MinMaxInventario {
  sku: string;
  minimo: number | null;
  maximo: number | null;
  minimo_manual: number | null;
  maximo_manual: number | null;
  venta_diaria: number | null;
}
export interface DatosInventario {
  catalogo: ArticuloInventario[];
  minmax: MinMaxInventario[];
  ventas: { sku: string; cantidad: number }[];
  lineas: LineaOcZoho[];
  yulius: boolean;
}
export interface FilaInventario {
  sku: string;
  nombre: string;
  categoria: string;
  estatus: string;
  proveedor: string;
  fisico: number;
  contable: number | null;
  comprometido: number;
  disponible: number;
  camino: number;
  minimo: number | null;
  maximo: number | null;
  minManual: boolean;
  maxManual: boolean;
  venta: number;
  cobertura: number | null;
  estado: 'rojo' | 'amarillo' | 'verde' | null;
  tresPl: number;
  costo: number | null;
}

/** _comInvSemaforo: con posición = disponible + en camino. */
export function semaforo(
  disp: number,
  camino: number,
  mm: { minimo: number | null; venta_diaria: number | null } | null,
) {
  if (!mm) return null;
  const pos = disp + camino;
  if (pos <= n(mm.minimo)) return 'rojo' as const;
  if (pos <= n(mm.minimo) + 7 * n(mm.venta_diaria)) return 'amarillo' as const;
  return 'verde' as const;
}

/** Comprometido por SKU: suma de ventas por enviar (renderComInventario no filtra por días). */
export function comprometido(ventas: { sku: string; cantidad: number }[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const v of ventas) r[v.sku] = (r[v.sku] ?? 0) + n(v.cantidad);
  return r;
}

/** Filas de la tabla de Inventario. El disponible no resta lo comprometido (el físico de Zoho ya lo incluye). */
export function filasInventario(d: DatosInventario): FilaInventario[] {
  const mm = new Map(d.minmax.map((m) => [m.sku, m]));
  const comp = comprometido(d.ventas);
  const cam = enCamino(d.lineas);
  return d.catalogo.map((c) => {
    const m = mm.get(c.sku) ?? null;
    const fisico = saldoCedis(c);
    const disponible = fisico + (d.yulius ? n(c.saldo_yulius) : 0);
    const camino = n(cam[c.sku]);
    const venta = n(m?.venta_diaria);
    return {
      sku: c.sku,
      nombre: c.nombre ?? '',
      categoria: c.categoria ?? '',
      estatus: c.estatus ?? '',
      proveedor: c.zoho_vendor_name ?? '',
      fisico,
      contable: c.zoho_sync_at == null ? null : n(c.zoho_stock),
      comprometido: n(comp[c.sku]),
      disponible,
      camino,
      minimo: m?.minimo ?? null,
      maximo: m?.maximo ?? null,
      minManual: m?.minimo_manual != null,
      maxManual: m?.maximo_manual != null,
      venta,
      cobertura: venta > 0 ? Math.round((disponible + camino) / venta) : null,
      estado: semaforo(disponible, camino, m),
      tresPl: n(c.saldo_yulius),
      costo: n(c.costo_unitario) > 0 ? Number(c.costo_unitario) : null,
    };
  });
}

/** KPI "Valor total de inventario (CEDIS + 3PL)": siempre suma 3PL; solo activos con costo; cuenta los que tienen stock sin costo. */
export function valorInventario(cat: ArticuloInventario[]): { valor: number; sinCosto: number } {
  let valor = 0;
  let sinCosto = 0;
  for (const c of cat) {
    if (c.estatus === 'Inactivo') continue;
    const stock = saldoCedis(c) + n(c.saldo_yulius);
    if (n(c.costo_unitario) > 0) valor += stock * Number(c.costo_unitario);
    else if (stock > 0) sinCosto++;
  }
  return { valor, sinCosto };
}

/** Etiqueta "3PL sin actualizar": saldo de 3PL y su fecha de actualización a más de `dias` días de hoy. */
export function tresPlViejo(c: ArticuloInventario, hoy: string, dias = 15): boolean {
  if (!(n(c.saldo_yulius) > 0)) return false;
  if (!c.yulius_actualizado_at) return true;
  return difDias(c.yulius_actualizado_at.slice(0, 10), hoy) > dias;
}

/** _planConteoCantidad: "1,200" → 1200, "1,5" → 1.5, "1.200,50" → 1200.5; vacío, negativo o texto → null. */
export function cantidadConteo(txt: string): number | null {
  let t = String(txt ?? '')
    .trim()
    .replace(/\s/g, '');
  if (!t) return null;
  // Puntos de miles solo con coma decimal ("1.200,50"): "1.500" sin coma es 1.5, como en _planConteoCantidad.
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  else if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** Cantidad de "sumar / restar": el signo aparte y el resto como un conteo (miles con coma). Vacío → null. */
export function cantidadAjuste(txt: string): number | null {
  const t = String(txt ?? '').trim();
  const neg = /^-/.test(t);
  const c = cantidadConteo(t.replace(/^[-+]/, ''));
  return c == null ? null : neg ? -c : c;
}

/** _planConteoPegar: líneas "SKU<sep>cantidad" (tab, ;, coma o espacio); suma repetidos; ignora encabezado y vacías. */
export function pegarConteo(txt: string): { sku: string; cantidad: number }[] {
  const r = new Map<string, number>();
  for (const linea of String(txt ?? '').split(/\r?\n/)) {
    const m = linea.trim().match(/^(\S+?)[\t; ]+(.+)$/) ?? linea.trim().match(/^([^,]+),(.+)$/);
    if (!m) continue;
    const cant = cantidadConteo(m[2]);
    if (cant == null) continue;
    r.set(m[1], (r.get(m[1]) ?? 0) + cant);
  }
  return [...r.entries()].map(([sku, cantidad]) => ({ sku, cantidad }));
}
