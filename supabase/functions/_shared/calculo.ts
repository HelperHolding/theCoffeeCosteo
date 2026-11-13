import { difDias, sumarDias } from "./fechas.ts";

export type Item = { nombre?: string; sku?: string; cantidad: number | string };
export type Pedido = {
  id: string; fecha_pedido: string; status: string; apertura_id?: string | null;
  items: Item[] | string | null; items_editados: Item[] | string | null;
  // Campos que usa la clasificación por tipo de pedido del Plan (planEngine.planDatTipo).
  franquiciatario_email?: string | null; notas_shopify?: string | null; es_llenado_canal?: boolean | null;
  marketing_proyecto_id?: string | null;
};
export type MapaSku = Record<string, string>;
export type Apertura = { id: string; estatus: string | null; fecha: string | null; conPedido: boolean };

export const ESTATUS_FUERA = new Set(["activa", "cancelada", "cancelacion_pendiente", "corporativo"]);

export function normalizarNombre(s: string): string {
  return String(s ?? "").trim().toLowerCase();
}

function parse(x: Item[] | string | null): Item[] | null {
  if (x == null) return null;
  let v: unknown = x;
  if (typeof x === "string") { try { v = JSON.parse(x); } catch { return null; } }
  return Array.isArray(v) ? v : null;
}

/** Cantidad de un ítem como número finito; basura (texto, NaN, Infinity) cuenta 0. */
function cant(x: unknown): number {
  const n = Number(x || 0);
  return Number.isFinite(n) ? n : 0;
}

export function itemsDe(p: Pedido): Item[] {
  const ed = parse(p.items_editados);
  return (ed && ed.length ? ed : parse(p.items)) ?? [];
}

export function skuDe(i: Item, mapa: MapaSku): string | null {
  if (i.sku) return i.sku;
  return mapa[normalizarNombre(i.nombre ?? "")] ?? null;
}

export function kitApertura(pedidosApertura: Pedido[], mapa: MapaSku): Record<string, { promedio: number; muestra: number }> {
  const n = pedidosApertura.length;
  const tot: Record<string, { t: number; ped: Set<string> }> = {};
  for (const p of pedidosApertura) {
    for (const it of itemsDe(p)) {
      const sku = skuDe(it, mapa);
      if (!sku) continue;
      tot[sku] ??= { t: 0, ped: new Set() };
      tot[sku].t += cant(it.cantidad);
      tot[sku].ped.add(p.id);
    }
  }
  const out: Record<string, { promedio: number; muestra: number }> = {};
  for (const [sku, v] of Object.entries(tot)) out[sku] = { promedio: n ? v.t / n : 0, muestra: v.ped.size };
  return out;
}

export function fechasKit(aps: Apertura[], hoy: string, antelacion: number, vencidaMax: number): string[] {
  const out: string[] = [];
  for (const a of aps) {
    if (a.estatus && ESTATUS_FUERA.has(a.estatus)) continue;
    if (a.conPedido || !a.fecha) continue;
    if (difDias(a.fecha, hoy) > vencidaMax) continue;
    const fk = sumarDias(a.fecha, -antelacion);
    out.push(fk < hoy ? hoy : fk);
  }
  return out;
}

export function contarHasta(fechas: string[], hoy: string, dias: number): number {
  return fechas.filter((f) => difDias(hoy, f) <= dias).length;
}

/** Mínimo = demanda pronosticada a (LT + seg) + kits; máximo = demanda a (LT + seg + cobertura) + kits. */
export function minMax(a: {
  demandaMin: number; demandaMax: number; lt: number; seg: number; cobertura: number; kit: number; fechas: string[]; hoy: string;
}): { minimo: number; maximo: number; kitsMin: number; kitsMax: number } {
  const hMin = a.lt + a.seg;
  const hMax = hMin + a.cobertura;
  const kitsMin = a.kit * contarHasta(a.fechas, a.hoy, hMin);
  const kitsMax = a.kit * contarHasta(a.fechas, a.hoy, hMax);
  return { minimo: a.demandaMin + kitsMin, maximo: a.demandaMax + kitsMax, kitsMin, kitsMax };
}

export function cantidadAPedir(a: {
  disponible: number; enCamino: number; minimo: number; maximo: number;
  multiplo: number | null; minimoPzas: number | null; enOcAbierta: boolean;
}): number {
  const maximo = Math.max(a.maximo, a.minimo); // un máximo capturado por debajo del mínimo nunca pide menos que el mínimo
  if (a.enOcAbierta || maximo <= 0) return 0;
  const pos = a.disponible + a.enCamino;
  if (pos > a.minimo) return 0;
  let q = Math.ceil(maximo - pos - 1e-9);
  if (q <= 0) return 0;
  if (a.multiplo && a.multiplo > 1) q = Math.ceil(q / a.multiplo) * a.multiplo;
  if (a.minimoPzas && q < a.minimoPzas) q = a.minimoPzas;
  return q;
}
