// supabase/functions/zoho-compras-sync/servicio.ts
import type { SupabaseClient } from "../_shared/db.ts";
import type { ZohoClient } from "../_shared/zoho.ts";
import { normalizarConfigReporte } from "../_shared/reporte/config.ts";
import { lunesDe, sumar as sumarDias } from "../_shared/reporte/fechas.ts";
import { hoyCdmx } from "../_shared/fechas.ts";
import { type FilaFactura, facturaDesdeDetalle, ocDesdeDetalle, ventaSemana } from "../_shared/compras/reglas.ts";
import { detallar, LIMITE_DETALLES, leerModificados } from "../_shared/compras/zohoCompras.ts";

// deno-lint-ignore no-explicit-any
type J = any;
export const ENFRIAMIENTO_MS = 10 * 60_000;
const INICIO_OCS = "2026-07-01";

export const enfriando = (ultimaOk: string | null, ahora: Date, forzar: boolean) =>
  !forzar && !!ultimaOk && ahora.getTime() - Date.parse(ultimaOk) < ENFRIAMIENTO_MS;

export const semanasTocadas = (fechas: string[]) => [...new Set(fechas.filter(Boolean).map(lunesDe))].sort();

export type Resumen = { omitida?: string; ocs: number; recepciones: number; facturas: number; semanas: string[]; pendientes: boolean; avisos: string[] };

async function ok<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const r = await p;
  if (r.error) throw r.error;
  return r.data;
}

export async function sincronizar(db: SupabaseClient, z: ZohoClient, ahora: Date, forzar: boolean, pausa?: (ms: number) => Promise<void>): Promise<Resumen> {
  const ultima = await ok(db.from("com_sync_log").select("fin").eq("proceso", "zoho-compras-sync").eq("ok", true)
    .not("fin", "is", null).order("fin", { ascending: false }).limit(1).maybeSingle()) as { fin: string } | null;
  if (enfriando(ultima?.fin ?? null, ahora, forzar)) {
    return { omitida: "sincronización reciente", ocs: 0, recepciones: 0, facturas: 0, semanas: [], pendientes: false, avisos: [] };
  }

  const estado = await ok(db.from("com_compras_sync_estado").select("oc_modificado_hasta,factura_modificado_hasta").eq("id", 1).single()) as
    { oc_modificado_hasta: string | null; factura_modificado_hasta: string | null };
  const cfgR = await ok(db.from("com_reporte_config").select("config").eq("id", 1).maybeSingle()) as { config: unknown } | null;
  const excluir = normalizarConfigReporte(cfgR?.config).excluir_ventas;
  const avisos: string[] = [];

  // OCs: detalle de cada OC modificada; detalle de recepciones solo si tiene más de una.
  const ocsLista = await leerModificados(z, "/purchaseorders", "purchaseorders", estado.oc_modificado_hasta, INICIO_OCS);
  const ocs = await detallar(ocsLista, Math.floor(LIMITE_DETALLES / 2), async (x: J) => {
    const po = (await z.get<J>(`/purchaseorders/${x.purchaseorder_id}`)).purchaseorder;
    const recs: Record<string, J> = {};
    if ((po.purchasereceives ?? []).length > 1)
      for (const r of po.purchasereceives) recs[r.receive_id] = (await z.get<J>(`/purchasereceives/${r.receive_id}`)).purchasereceive;
    return ocDesdeDetalle(po, recs);
  }, pausa);
  let nRec = 0;
  for (const { oc, recepciones } of ocs.filas) {
    await ok(db.from("com_compras_oc").upsert({ ...oc, actualizado_at: ahora.toISOString() }, { onConflict: "zoho_po_id" }));
    await ok(db.from("com_compras_recepcion").delete().eq("zoho_po_id", oc.zoho_po_id));
    if (recepciones.length) await ok(db.from("com_compras_recepcion").insert(recepciones));
    nRec += recepciones.length;
  }
  if (ocs.error) avisos.push(`OCs: ${ocs.error}`);

  // Facturas: detalle con líneas; luego se recalculan las semanas tocadas.
  const inicioFact = sumarDias(lunesDe(hoyCdmx(ahora)), -7 * 16);
  const factLista = await leerModificados(z, "/invoices", "invoices", estado.factura_modificado_hasta, inicioFact);
  const facts = await detallar(factLista, LIMITE_DETALLES - ocs.filas.length, async (x: J) =>
    facturaDesdeDetalle((await z.get<J>(`/invoices/${x.invoice_id}`)).invoice), pausa);
  if (facts.filas.length) await ok(db.from("com_compras_factura").upsert(facts.filas, { onConflict: "zoho_invoice_id" }));
  if (facts.error) avisos.push(`Facturas: ${facts.error}`);
  const semanas = semanasTocadas(facts.filas.map((f) => f.fecha));
  for (const lunes of semanas) {
    const fs = await ok(db.from("com_compras_factura").select("zoho_invoice_id,fecha,cliente,estado,total,por_categoria_ci,zoho_modificado")
      .gte("fecha", lunes).lte("fecha", sumarDias(lunes, 6))) as FilaFactura[];
    await ok(db.from("com_compras_venta_semana").upsert({ ...ventaSemana(fs, lunes, excluir), calculado_at: ahora.toISOString() }, { onConflict: "semana" }));
  }

  await ok(db.from("com_compras_sync_estado").update({
    oc_modificado_hasta: ocs.marca ?? estado.oc_modificado_hasta,
    factura_modificado_hasta: facts.marca ?? estado.factura_modificado_hasta,
  }).eq("id", 1));
  if (ocs.error && facts.error && !ocs.filas.length && !facts.filas.length) throw new Error(avisos.join(" · "));
  return { ocs: ocs.filas.length, recepciones: nRec, facturas: facts.filas.length, semanas, pendientes: ocs.pendientes || facts.pendientes, avisos };
}
