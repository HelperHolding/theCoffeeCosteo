import { type SupabaseClient, todo } from "./db.ts";
import { ocAbierta, SKU_MARCADOR } from "../zoho-sync/sync.ts";

export type Fila = {
  sku: string; nombre: string; zoho_item_id: string | null; zoho_vendor_id: string | null; zoho_vendor_name: string | null;
  costo: number | null; fisico: number; fisicoRespaldo: boolean; saldo_yulius: number; enCamino: number; enOcAbierta: boolean;
  minimo: number; maximo: number; venta_diaria: number; kits_max: number; multiplo: number | null; minimoPzas: number | null; lead_time: number;
};

// desdeSync: inicio del último zoho-sync exitoso. Las OCs reales creadas después todavía no están en
// com_zoho_oc_lineas, así que se toman de com_oc_auto para no volver a pedir lo mismo.
export async function cargarFilas(db: SupabaseClient, desdeSync: string): Promise<Fila[]> {
  const [mm, cat, oc, recientes] = await Promise.all([
    todo<{ sku: string; minimo: number; maximo: number; venta_diaria: number; kits_max: number; lead_time: number | null }>((a, b) =>
      db.from("com_minmax").select("sku,minimo,maximo,venta_diaria,kits_max,lead_time").order("sku").range(a, b)),
    todo<Record<string, unknown> & { sku: string }>((a, b) =>
      db.from("com_catalogo").select("sku,nombre,zoho_item_id,zoho_vendor_id,zoho_vendor_name,costo_unitario,zoho_stock,zoho_stock_fisico,saldo_yulius,multiplo_compra,minimo_compra_pzas")
        .order("sku").range(a, b)),
    todo<{ sku: string; status: string; cantidad: number; cantidad_recibida: number }>((a, b) =>
      db.from("com_zoho_oc_lineas").select("sku,status,cantidad,cantidad_recibida").order("zoho_po_id").order("sku").range(a, b)),
    todo<{ lineas: unknown }>((a, b) =>
      db.from("com_oc_auto").select("lineas").eq("modo", "real").eq("estado", "creada").gt("creada_at", desdeSync).order("id").range(a, b)),
  ]);
  const catPor = new Map(cat.map((c) => [c.sku, c]));
  const camino = new Map<string, number>();
  const abierta = new Set<string>();
  const sumar = (sku: string, pendiente: number) => {
    if (!sku || !(pendiente > 0)) return;
    abierta.add(sku);
    camino.set(sku, (camino.get(sku) ?? 0) + pendiente);
  };
  // Solo bloquea la línea que aún tiene unidades por recibir; una OC "billed" con pendientes sí cuenta.
  for (const l of oc) if (ocAbierta(l.status)) sumar(l.sku, Number(l.cantidad) - Number(l.cantidad_recibida));
  for (const r of recientes) {
    for (const l of (Array.isArray(r.lineas) ? r.lineas : []) as { sku?: string; cantidad?: unknown }[]) sumar(String(l.sku ?? ""), Number(l.cantidad));
  }
  return mm.map((m) => {
    const c = catPor.get(m.sku) ?? {} as Record<string, unknown>;
    const num = (x: unknown) => (x == null || x === "" ? null : Number(x));
    return {
      sku: m.sku, nombre: String(c.nombre ?? ""), zoho_item_id: (c.zoho_item_id as string) ?? null,
      zoho_vendor_id: (c.zoho_vendor_id as string) ?? null, zoho_vendor_name: (c.zoho_vendor_name as string) ?? null,
      costo: num(c.costo_unitario),
      // Físico en mano de Zoho; si aún no llega (null) se usa el contable y se marca como respaldo.
      fisico: c.zoho_stock_fisico == null ? Number(c.zoho_stock ?? 0) : Number(c.zoho_stock_fisico),
      fisicoRespaldo: c.zoho_stock_fisico == null,
      saldo_yulius: Number(c.saldo_yulius ?? 0),
      enCamino: camino.get(m.sku) ?? 0, enOcAbierta: abierta.has(m.sku),
      minimo: Number(m.minimo), maximo: Number(m.maximo), venta_diaria: Number(m.venta_diaria), kits_max: Number(m.kits_max),
      multiplo: num(c.multiplo_compra), minimoPzas: num(c.minimo_compra_pzas), lead_time: Number(m.lead_time ?? 0),
    };
  });
}

export type LineaAbierta = {
  zoho_po_id: string; sku: string; vendor_id: string | null; vendor_name: string | null; pendiente: number;
  precio: number | null; fecha_oc: string | null; fecha_entrega: string | null;
  // OC "billed": su factura ya está en Zoho y el pago va por cuentas por pagar. Bloquea recompras, pero no es comprometido.
  facturada: boolean;
};

/** Líneas de OC abiertas con unidades por recibir (sin marcadores). */
export async function cargarAbiertas(db: SupabaseClient): Promise<LineaAbierta[]> {
  const filas = await todo<Record<string, unknown>>((a, b) =>
    db.from("com_zoho_oc_lineas")
      .select("zoho_po_id,sku,status,vendor_id,vendor_name,cantidad,cantidad_recibida,precio,fecha_oc,fecha_entrega")
      .order("zoho_po_id").order("sku").range(a, b));
  const out: LineaAbierta[] = [];
  for (const l of filas) {
    const sku = String(l.sku ?? "");
    if (!ocAbierta(String(l.status ?? "")) || sku === SKU_MARCADOR) continue;
    const pendiente = Number(l.cantidad) - Number(l.cantidad_recibida);
    if (!(pendiente > 0)) continue;
    out.push({
      zoho_po_id: String(l.zoho_po_id), sku, vendor_id: (l.vendor_id as string) ?? null, vendor_name: (l.vendor_name as string) ?? null,
      pendiente, precio: l.precio == null ? null : Number(l.precio), fecha_oc: (l.fecha_oc as string) ?? null,
      fecha_entrega: (l.fecha_entrega as string) ?? null, facturada: String(l.status ?? "").toLowerCase() === "billed",
    });
  }
  return out;
}
