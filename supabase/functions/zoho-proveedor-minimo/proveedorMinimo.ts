import { cargarConfig, responder, type SupabaseClient } from "../_shared/db.ts";
import { enviarMinimo, guardarMinimoPlataforma, mensajeErrorZoho, MENSAJE_SIN_CAMPO, validarMonto } from "../_shared/minimoZoho.ts";
import type { ZohoClient } from "../_shared/zoho.ts";

/** Guarda el mínimo en la plataforma y lo envía a Zoho. Lo guardado queda aunque Zoho falle. */
export async function manejarMinimo(db: SupabaseClient, zoho: () => ZohoClient, body: Record<string, unknown>): Promise<Response> {
  const monto = validarMonto(body.monto);
  if (monto === null) return responder({ ok: false, error: "Monto inválido" }, 400);
  const vendor_id = typeof body.vendor_id === "string" ? body.vendor_id : "";
  const por = typeof body.por === "string" && body.por.trim() ? body.por.trim() : "plataforma";
  try {
    const { data, error } = vendor_id
      ? await db.from("com_zoho_proveedor").select("vendor_id").eq("vendor_id", vendor_id).maybeSingle()
      : { data: null, error: null };
    if (error) throw error;
    if (!data) return responder({ ok: false, error: "Proveedor no encontrado" }, 404);
    await guardarMinimoPlataforma(db, { vendor_id, monto, por });
  } catch (e) {
    return responder({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
  try {
    const cfg = await cargarConfig(db);
    // Si la última sincronización terminada vio que el campo no existe, no se envía: queda pendiente con el aviso.
    let campo: unknown;
    try {
      const { data: log } = await db.from("com_sync_log").select("resumen").eq("proceso", "zoho-sync").eq("ok", true)
        .not("fin", "is", null).order("inicio", { ascending: false }).limit(1).maybeSingle();
      campo = (log?.resumen as { minimoCampo?: unknown } | null | undefined)?.minimoCampo;
    } catch { /* sin dato: se intenta el envío; enviarMinimo verifica la respuesta */ }
    if (campo === "falta") {
      try { await db.from("com_zoho_proveedor").update({ minimo_error: MENSAJE_SIN_CAMPO }).eq("vendor_id", vendor_id); } catch { /* queda pendiente */ }
      return responder({ ok: true, enviado: false, error: MENSAJE_SIN_CAMPO });
    }
    const r = await enviarMinimo(db, zoho(), { vendor_id, monto, apiName: cfg.auto.zoho_cf_minimo });
    return responder(r.ok ? { ok: true, enviado: true } : { ok: true, enviado: false, error: r.error });
  } catch (e) {
    const error = mensajeErrorZoho(e);
    try { await db.from("com_zoho_proveedor").update({ minimo_error: error }).eq("vendor_id", vendor_id); } catch { /* queda pendiente */ }
    return responder({ ok: true, enviado: false, error });
  }
}
