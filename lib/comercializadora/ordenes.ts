export interface MovCompra {
  id: string;
  folio: string;
  fecha: string | null;
  sku: string;
  cantidad: number | null;
  cantidad_recibida: number | null;
  monto: number | null;
  destino: string | null;
  fecha_arribo: string | null;
  proveedor: string | null;
  estado: string | null;
}
export interface OcGrupo {
  folio: string;
  fecha: string | null;
  proveedor: string | null;
  destino: string | null;
  fecha_arribo: string | null;
  skus: number;
  uds: number;
  monto: number;
  estado: 'emitida' | 'parcial' | 'recibida';
  items: MovCompra[];
}
export interface FormOc {
  folio: string;
  proveedor: string;
  fecha: string;
  fecha_arribo: string;
  destino: string;
  monto: number;
  lineas: { sku: string; cantidad: number }[];
}

const n = (x: unknown) => Number(x) || 0;

/** _ocEstadoCalculado. */
export function estadoOc(
  items: { cantidad: number | null; cantidad_recibida: number | null }[],
): OcGrupo['estado'] {
  const pedido = items.reduce((s, r) => s + n(r.cantidad), 0);
  const recibido = items.reduce((s, r) => s + n(r.cantidad_recibida), 0);
  if (recibido <= 0) return 'emitida';
  if (recibido >= pedido) return 'recibida';
  return 'parcial';
}

/** agrupar() de la pestaña Órdenes: un grupo por folio, de la fecha más reciente a la más vieja. */
export function agruparOcs(filas: MovCompra[]): OcGrupo[] {
  const g = new Map<string, OcGrupo>();
  for (const r of filas) {
    const x = g.get(r.folio) ?? {
      folio: r.folio,
      fecha: r.fecha,
      proveedor: r.proveedor,
      destino: r.destino,
      fecha_arribo: r.fecha_arribo,
      skus: 0,
      uds: 0,
      monto: 0,
      estado: 'emitida' as const,
      items: [],
    };
    x.skus++;
    x.uds += n(r.cantidad);
    if (r.monto) x.monto += n(r.monto);
    x.items.push(r);
    g.set(r.folio, x);
  }
  return [...g.values()]
    .map((x) => ({ ...x, estado: estadoOc(x.items) }))
    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

/** _ocResumenHtml: abiertas = con algo por recibir; atrasadas = abiertas con fecha de arribo antes de hoy. */
export function resumenOcs(filas: MovCompra[], hoy: string) {
  const f = new Map<string, { monto: number; abierta: boolean; tarde: boolean }>();
  for (const r of filas) {
    if (!r.folio) continue;
    const x = f.get(r.folio) ?? { monto: 0, abierta: false, tarde: false };
    x.monto += n(r.monto);
    if (n(r.cantidad) - n(r.cantidad_recibida) > 0) {
      x.abierta = true;
      if (r.fecha_arribo && r.fecha_arribo.slice(0, 10) < hoy) x.tarde = true;
    }
    f.set(r.folio, x);
  }
  let abiertas = 0,
    montoAbiertas = 0,
    atrasadas = 0,
    montoAtrasadas = 0;
  for (const x of f.values()) {
    if (!x.abierta) continue;
    abiertas++;
    montoAbiertas += x.monto;
    if (x.tarde) {
      atrasadas++;
      montoAtrasadas += x.monto;
    }
  }
  return { abiertas, montoAbiertas, atrasadas, montoAtrasadas };
}

/** Validación de _comGuardarOC: folio, proveedor, monto total (> 0) y al menos un artículo con cantidad. */
export function validarOc(f: FormOc): string | null {
  if (!f.folio.trim()) return 'Pon el folio de la OC';
  if (!f.proveedor.trim()) return 'Elige el proveedor';
  if (!f.lineas.some((l) => l.sku && Number(l.cantidad) > 0))
    return 'Agrega al menos un artículo con cantidad';
  if (!(Number(f.monto) > 0)) return 'Pon el monto total de la OC';
  return null;
}

/** _ubTxt: el destino 'Yulius' es el 3PL. */
export const textoDestino = (d: string | null | undefined) =>
  d == null || d === '' ? '—' : d === 'Yulius' ? '3PL' : d;
