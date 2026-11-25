// supabase/functions/zoho-compras-sync/servicio.ts
import type { SupabaseClient } from "../_shared/db.ts";
import { cargarConfig } from "../_shared/db.ts";
import { enviarCorreo } from "../_shared/correo.ts";
import type { ZohoClient } from "../_shared/zoho.ts";
import { normalizarConfigReporte } from "../_shared/reporte/config.ts";
import { lunesDe, sumar as sumarDias } from "../_shared/reporte/fechas.ts";
import { hoyCdmx } from "../_shared/fechas.ts";
import { type FilaFactura, facturaDesdeDetalle, ocDesdeDetalle, ventaSemana } from "../_shared/compras/reglas.ts";
import { detallar, LIMITE_DETALLES, leerModificados, type Marca } from "../_shared/compras/zohoCompras.ts";

// deno-lint-ignore no-explicit-any
type J = any;
export const ENFRIAMIENTO_MS = 10 * 60_000;
const INICIO_OCS = "2026-07-01";
const PROCESO = "zoho-compras-sync";
// Tiempo de lectura de detalles por corrida: por debajo de los 120 s de com_invocar y del límite de las Edge Functions.
const LIMITE_MS = 75_000;
// Una OC puede pedir detalles de recepciones además del suyo: cupo menor que el de facturas.
const CUPO_OCS = 20;

export const enfriando = (ultimaOk: string | null, ahora: Date, forzar: boolean) =>
  !forzar && !!ultimaOk && ahora.getTime() - Date.parse(ultimaOk) < ENFRIAMIENTO_MS;

/** Lunes únicos y ordenados de las fechas tocadas, sin semanas anteriores al periodo guardado. */
export const semanasTocadas = (fechas: string[], desde: string) =>
  [...new Set(fechas.filter(Boolean).map(lunesDe))].filter((l) => l >= desde).sort();

/** Corridas más recientes primero (la [0] es la que acaba de fallar): avisar solo en la segunda falla después de una buena. */
export const debeAvisar = (oks: boolean[]) => oks.length >= 3 && oks[0] === false && oks[1] === false && oks[2] === true;

export const faseSinAvance = (f: { filas: unknown[]; omitidos: string[]; error: string | null }) =>
  !!f.error && f.filas.length === 0 && f.omitidos.length === 0;

export type Resumen = { omitida?: string; ocs: number; recepciones: number; facturas: number; omitidos: number; semanas: string[]; pendientes: boolean; avisos: string[] };

async function ok<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const r = await p;
  if (r.error) throw r.error;
  return r.data;
}

export async function avisarRachaFallas(db: SupabaseClient, mensaje: string, enviar = enviarCorreo): Promise<void> {
  try {
    const { data, error } = await db.from("com_sync_log").select("ok").eq("proceso", PROCESO).not("fin", "is", null)
      .order("inicio", { ascending: false }).limit(3);
    if (error || !data || !debeAvisar(data.map((r: { ok: boolean }) => r.ok))) return;
    const cfg = await cargarConfig(db);
    await enviar(cfg.auto.correos, "⚠ Sincronización de compras con Zoho falló 2 veces seguidas",
      `<p>La sincronización de compras (OCs, recepciones y facturas) falló dos veces seguidas. Último error:</p><pre>${mensaje.replace(/[<&>]/g, "")}</pre>` +
      `<p>Mientras no se resuelva, el tablero de compras no recibe cambios de Zoho.</p>`, "Sincronización de compras");
  } catch (e) {
    console.error(`avisarRachaFallas compras: ${(e as Error)?.message ?? e}`);
  }
}

export async function sincronizar(db: SupabaseClient, z: ZohoClient, ahora: Date, forzar: boolean, pausa?: (ms: number) => Promise<void>): Promise<Resumen> {
  const ultima = await ok(db.from("com_sync_log").select("fin").eq("proceso", PROCESO).eq("ok", true)
    .not("fin", "is", null).order("fin", { ascending: false }).limit(1).maybeSingle()) as { fin: string } | null;
  if (enfriando(ultima?.fin ?? null, ahora, forzar)) {
    return { omitida: "sincronización reciente", ocs: 0, recepciones: 0, facturas: 0, omitidos: 0, semanas: [], pendientes: false, avisos: [] };
  }

  const estado = await ok(db.from("com_compras_sync_estado")
    .select("oc_modificado_hasta,oc_ids_en_marca,factura_modificado_hasta,factura_ids_en_marca").eq("id", 1).single()) as
    { oc_modificado_hasta: string | null; oc_ids_en_marca: string[] | null; factura_modificado_hasta: string | null; factura_ids_en_marca: string[] | null };
  const cfgR = await ok(db.from("com_reporte_config").select("config").eq("id", 1).maybeSingle()) as { config: unknown } | null;
  const excluir = normalizarConfigReporte(cfgR?.config).excluir_ventas;
  const avisos: string[] = [];
  const t0 = Date.now();

  // OCs: detalle de cada OC modificada; detalle de recepciones solo si tiene más de una.
  const marcaOc: Marca = { t: estado.oc_modificado_hasta, ids: estado.oc_ids_en_marca ?? [] };
  const ocsLista = await leerModificados(z, "/purchaseorders", "purchaseorders", marcaOc, INICIO_OCS, "purchaseorder_id");
  const ocs = await detallar(ocsLista, CUPO_OCS, "purchaseorder_id", async (x: J) => {
    const po = (await z.get<J>(`/purchaseorders/${x.purchaseorder_id}`)).purchaseorder;
    const recs: Record<string, J> = {};
    if ((po.purchasereceives ?? []).length > 1)
      for (const r of po.purchasereceives) recs[r.receive_id] = (await z.get<J>(`/purchasereceives/${r.receive_id}`)).purchasereceive;
    return ocDesdeDetalle(po, recs);
  }, { pausa, limite: LIMITE_MS / 2 });
  let nRec = 0;
  for (const { oc, recepciones } of ocs.filas) {
    await ok(db.from("com_compras_oc").upsert({ ...oc, actualizado_at: ahora.toISOString() }, { onConflict: "zoho_po_id" }));
    await ok(db.from("com_compras_recepcion").delete().eq("zoho_po_id", oc.zoho_po_id));
    if (recepciones.length) await ok(db.from("com_compras_recepcion").insert(recepciones));
    nRec += recepciones.length;
  }
  // La marca de OCs se guarda en cuanto sus filas quedaron guardadas: si la corrida se corta después, no se repiten.
  if (ocs.marca) await ok(db.from("com_compras_sync_estado").update({ oc_modificado_hasta: ocs.marca.t, oc_ids_en_marca: ocs.marca.ids }).eq("id", 1));
  if (ocs.error) avisos.push(`OCs: ${ocs.error}`);

  // Facturas: detalle con líneas; luego se recalculan las semanas tocadas dentro del periodo guardado.
  const inicioFact = sumarDias(lunesDe(hoyCdmx(ahora)), -7 * 16);
  const marcaFact: Marca = { t: estado.factura_modificado_hasta, ids: estado.factura_ids_en_marca ?? [] };
  const factLista = await leerModificados(z, "/invoices", "invoices", marcaFact, inicioFact, "invoice_id");
  const restante = Math.max(0, LIMITE_MS - (Date.now() - t0));
  const facts = await detallar(factLista, LIMITE_DETALLES - ocs.filas.length, "invoice_id", async (x: J) =>
    facturaDesdeDetalle((await z.get<J>(`/invoices/${x.invoice_id}`)).invoice), { pausa, limite: restante });
  if (facts.filas.length) await ok(db.from("com_compras_factura").upsert(facts.filas, { onConflict: "zoho_invoice_id" }));
  if (facts.error) avisos.push(`Facturas: ${facts.error}`);
  const semanas = semanasTocadas(facts.filas.map((f) => f.fecha), inicioFact);
  for (const lunes of semanas) {
    const fs = await ok(db.from("com_compras_factura").select("zoho_invoice_id,fecha,cliente,estado,total,por_categoria_ci,zoho_modificado")
      .gte("fecha", lunes).lte("fecha", sumarDias(lunes, 6))) as FilaFactura[];
    await ok(db.from("com_compras_venta_semana").upsert({ ...ventaSemana(fs, lunes, excluir), calculado_at: ahora.toISOString() }, { onConflict: "semana" }));
  }
  if (facts.marca) await ok(db.from("com_compras_sync_estado").update({ factura_modificado_hasta: facts.marca.t, factura_ids_en_marca: facts.marca.ids }).eq("id", 1));

  // Una fase que no pudo avanzar nada (scope, token, documento que siempre falla) marca la corrida como fallida: entra al aviso de racha.
  if (faseSinAvance(ocs) || faseSinAvance(facts)) throw new Error(avisos.join(" · "));
  return {
    ocs: ocs.filas.length, recepciones: nRec, facturas: facts.filas.length, omitidos: ocs.omitidos.length + facts.omitidos.length,
    semanas, pendientes: ocs.pendientes || facts.pendientes, avisos,
  };
}
