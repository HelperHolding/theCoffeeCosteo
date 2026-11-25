// supabase/functions/_shared/compras/reglas.ts
// Reglas puras de la sincronización de compras (spec compras §2). Sin Deno ni Zoho: el portal también las importa.
import { en } from "../reporte/config.ts";
import { dif, enRango, finSemana } from "../reporte/fechas.ts";

// deno-lint-ignore no-explicit-any
type J = any;
export type Categoria = "CAF" | "BEB" | "DES" | "DEL" | "BA" | "LIM" | "FOD" | "RTD" | "otros";
export const CATEGORIAS: Exclude<Categoria, "otros">[] = ["CAF", "BEB", "DES", "DEL", "BA", "LIM", "FOD", "RTD"];
export type PorCategoria = Partial<Record<Categoria, number>>;

export function categoriaSku(sku: string): Categoria {
  const s = String(sku ?? "").toUpperCase();
  if (s.startsWith("RTD-")) return "RTD";
  const m = s.match(/^INS-([A-Z]+)-/);
  return m && (CATEGORIAS as string[]).includes(m[1]) ? (m[1] as Categoria) : "otros";
}

const cent = (x: number) => Math.round(x * 100) / 100;
export function sumar(lineas: { sku: string; monto: number }[]): PorCategoria {
  const p: PorCategoria = {};
  for (const l of lineas) { const c = categoriaSku(l.sku); p[c] = (p[c] ?? 0) + l.monto; }
  for (const k of Object.keys(p) as Categoria[]) p[k] = cent(p[k]!);
  return p;
}
export const insumos = (p: PorCategoria) => cent(CATEGORIAS.reduce((a, c) => a + (p[c] ?? 0), 0));

const s = (x: unknown) => String(x ?? "").trim();
const n = (x: unknown) => Number(x) || 0;
const iva = (base: number, tasa: unknown) => base * (1 + n(tasa) / 100);

export type FilaOc = {
  zoho_po_id: string; folio: string; proveedor: string; vendor_id: string; comprador: string; emision: string;
  arribo: string | null; estado: string; received_status: string; moneda: string; total: number; monto_ins: number;
  por_categoria: PorCategoria; es_registro: boolean; factura_previa: string | null; zoho_modificado: string;
};
export type FilaRecepcion = { zoho_receive_id: string; zoho_po_id: string; folio_oc: string; fecha: string; monto: number; por_categoria: PorCategoria };

export function ocDesdeDetalle(po: J, recepciones: Record<string, J>): { oc: FilaOc; recepciones: FilaRecepcion[] } {
  const mxn = s(po.currency_code || "MXN") === "MXN";
  const lineas: J[] = po.line_items ?? [];
  const porSku = new Map<string, J>(lineas.map((l) => [s(l.sku), l]));
  const por_categoria = mxn ? sumar(lineas.map((l) => ({ sku: s(l.sku), monto: iva(n(l.rate) * n(l.quantity), l.tax_percentage) }))) : {};
  const emision = s(po.date);
  const arribo = s(po.delivery_date) || null;
  const facturas = (po.bills ?? []).map((b: J) => s(b.date)).filter(Boolean).sort();
  const factura_previa = facturas.find((f: string) => f < emision) ?? null;
  const es_registro = (arribo != null && dif(arribo, emision) > 7) || factura_previa != null;
  const oc: FilaOc = {
    zoho_po_id: s(po.purchaseorder_id), folio: s(po.purchaseorder_number), proveedor: s(po.vendor_name), vendor_id: s(po.vendor_id),
    comprador: s(po.created_by_name) || "Sin comprador", emision, arribo, estado: s(po.status), received_status: s(po.received_status),
    moneda: s(po.currency_code || "MXN"), total: n(po.total), monto_ins: insumos(por_categoria), por_categoria, es_registro, factura_previa,
    zoho_modificado: s(po.last_modified_time),
  };
  const prs: J[] = po.purchasereceives ?? [];
  const recibido = (ls: { sku: string; q: number }[]): PorCategoria => (mxn
    ? sumar(ls.map((l) => { const pl = porSku.get(l.sku); return { sku: l.sku, monto: pl ? iva(n(pl.rate) * l.q, pl.tax_percentage) : 0 }; }))
    : {});
  const filas = prs.map((r) => {
    const ls = prs.length === 1
      ? lineas.map((l) => ({ sku: s(l.sku), q: n(l.quantity_received) }))
      : (recepciones[s(r.receive_id)]?.line_items ?? []).map((l: J) => ({ sku: s(l.sku), q: n(l.quantity) }));
    const pc = recibido(ls);
    const monto = cent(Object.values(pc).reduce((a, x) => a + (x ?? 0), 0));
    return { zoho_receive_id: s(r.receive_id), zoho_po_id: oc.zoho_po_id, folio_oc: oc.folio, fecha: s(r.date), monto, por_categoria: pc };
  });
  return { oc, recepciones: filas };
}

export type FilaFactura = { zoho_invoice_id: string; fecha: string; cliente: string; estado: string; total: number; por_categoria_ci: PorCategoria; zoho_modificado: string };
export const facturaDesdeDetalle = (inv: J): FilaFactura => ({
  zoho_invoice_id: s(inv.invoice_id), fecha: s(inv.date), cliente: s(inv.customer_name), estado: s(inv.status), total: n(inv.total),
  por_categoria_ci: sumar((inv.line_items ?? []).map((l: J) => ({ sku: s(l.sku), monto: iva(n(l.item_total), l.tax_percentage) }))),
  zoho_modificado: s(inv.last_modified_time),
});

export type VentaSemana = { semana: string; venta_total_ci: number; facturas: number; por_categoria_ci: PorCategoria };
export function ventaSemana(fs: FilaFactura[], lunes: string, excluir: string[]): VentaSemana {
  const fin = finSemana(lunes);
  const v = fs.filter((f) => f.estado !== "void" && f.estado !== "draft" && !en(excluir, f.cliente) && enRango(f.fecha, lunes, fin));
  const pc: PorCategoria = {};
  for (const f of v) for (const [k, x] of Object.entries(f.por_categoria_ci) as [Categoria, number][]) pc[k] = (pc[k] ?? 0) + x;
  for (const k of Object.keys(pc) as Categoria[]) pc[k] = cent(pc[k]!);
  return { semana: lunes, venta_total_ci: cent(v.reduce((a, f) => a + f.total, 0)), facturas: v.length, por_categoria_ci: pc };
}
