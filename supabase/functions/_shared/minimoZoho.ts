// Mínimo de compra del proveedor <-> campo personalizado del contacto en Zoho Books (spec 2026-11-12 §2 y §4).
// Lo único que la plataforma escribe en Zoho es ese campo del contacto; nunca otro dato.
import type { SupabaseClient } from "./db.ts";
import { type ZohoClient, ZohoError } from "./zoho.ts";

export const MENSAJE_PERMISO = "Falta permiso de escritura de contactos en Zoho";
export const MENSAJE_SIN_CAMPO = "Falta crear el campo en Zoho";
export const MENSAJE_NO_GUARDO = "Zoho no guardó el valor (¿existe el campo?)";

/** ¿La respuesta del PUT trae el campo con el monto enviado? (acepta "15000" o "15000.00" contra 15000) */
function respuestaTieneValor(resp: unknown, apiName: string, monto: number): boolean {
  const hash = (resp as { contact?: { custom_field_hash?: Record<string, unknown> } } | null)?.contact?.custom_field_hash;
  if (!hash || typeof hash !== "object" || !(apiName in hash)) return false;
  const v = hash[apiName];
  if (v === null || v === undefined || (typeof v === "string" && v.trim() === "")) return false;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim().replace(/,/g, "")) : NaN;
  return Number.isFinite(n) && Math.abs(n - monto) < 0.005;
}

/** Número finito >= 0 con hasta 2 decimales. Acepta texto como "15,000.50" o "$1,200". Si no, null. */
export function validarMonto(x: unknown): number | null {
  let n: number;
  if (typeof x === "number") n = x;
  else if (typeof x === "string") {
    const t = x.trim().replace(/^\$/, "");
    // Miles con coma solo en grupos de 3: "1,5" o "1.234,5" se rechazan (la coma decimal no se adivina).
    if (!/^\d{1,3}(,\d{3})*(\.\d{1,2})?$/.test(t) && !/^\d+(\.\d{1,2})?$/.test(t)) return null;
    n = Number(t.replace(/,/g, ""));
  } else return null;
  if (!Number.isFinite(n) || n < 0 || n > 100_000_000) return null;
  if (Math.abs(n * 100 - Math.round(n * 100)) >= 1e-6) return null;
  return Math.round(n * 100) / 100;
}

export function mensajeErrorZoho(e: unknown): string {
  if (e instanceof ZohoError && (e.status === 401 || e.status === 403 || e.code === 57)) return MENSAJE_PERMISO;
  return String((e as Error)?.message ?? e);
}

/** PUT del campo al contacto. Nunca lanza: el resultado deja el estado (pendiente o al día) en la base. */
export async function enviarMinimo(
  db: SupabaseClient, z: ZohoClient, a: { vendor_id: string; monto: number; apiName: string },
): Promise<{ ok: boolean; error?: string }> {
  let resp: unknown;
  try {
    resp = await z.put(`/contacts/${a.vendor_id}`, { custom_fields: [{ api_name: a.apiName, value: a.monto }] });
  } catch (e) {
    const error = mensajeErrorZoho(e);
    try { await db.from("com_zoho_proveedor").update({ minimo_error: error }).eq("vendor_id", a.vendor_id).eq("minimo_compra", a.monto); } catch { /* ya se informa en el resultado */ }
    return { ok: false, error };
  }
  // Zoho responde ok aunque ignore un campo inexistente: solo cuenta como enviado si el valor vino de vuelta.
  if (!respuestaTieneValor(resp, a.apiName, a.monto)) {
    try { await db.from("com_zoho_proveedor").update({ minimo_error: MENSAJE_NO_GUARDO }).eq("vendor_id", a.vendor_id).eq("minimo_compra", a.monto); } catch { /* ya se informa en el resultado */ }
    return { ok: false, error: MENSAJE_NO_GUARDO };
  }
  try {
    const { error } = await db.from("com_zoho_proveedor")
      .update({ minimo_pendiente: false, minimo_zoho_visto: a.monto, minimo_error: null })
      .eq("vendor_id", a.vendor_id).eq("minimo_compra", a.monto); // si ya hay un valor más nuevo, sigue pendiente
    if (error) throw error;
  } catch (e) {
    // Zoho ya lo tiene; si no se pudo anotar, la próxima conciliación lo detecta (Zoho = plataforma).
    return { ok: false, error: String((e as Error)?.message ?? e) };
  }
  return { ok: true };
}

/** Guarda el mínimo capturado en la plataforma (queda pendiente de enviarse a Zoho) y lo deja en la bitácora. */
export async function guardarMinimoPlataforma(
  db: SupabaseClient, a: { vendor_id: string; monto: number; por: string },
): Promise<void> {
  const { data: previo, error: e0 } = await db.from("com_zoho_proveedor").select("minimo_compra").eq("vendor_id", a.vendor_id).maybeSingle();
  if (e0) throw e0;
  const { error: e1 } = await db.from("com_zoho_proveedor").update({
    minimo_compra: a.monto, minimo_origen: "plataforma", minimo_editado_at: new Date().toISOString(),
    minimo_editado_por: a.por, minimo_pendiente: true, minimo_error: null,
  }).eq("vendor_id", a.vendor_id);
  if (e1) throw e1;
  const { error: e2 } = await db.from("com_sync_cambios").insert({
    corrida: crypto.randomUUID(), tabla: "com_zoho_proveedor", clave: a.vendor_id, campo: "minimo_compra",
    antes: previo?.minimo_compra ?? null, despues: a.monto, aplicado: true, origen: "plataforma",
  });
  if (e2) throw e2;
}
