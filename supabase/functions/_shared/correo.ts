import { efectosExternos } from "./acceso.ts";

/**
 * Envía a cada destinatario; nunca lanza. Devuelve false si algún envío falló (ya registrado en console.error).
 * send-email vive en el proyecto viejo durante la Fase 1 (CORREO_URL, CORREO_LLAVE). Sin efectos externos no envía.
 */
export async function enviarCorreo(to: string[], subject: string, html: string, enviadoPor = "OCs automáticas"): Promise<boolean> {
  if (!efectosExternos()) {
    console.log(`correo omitido (sin efectos externos): ${subject} → ${to.length} destinatario(s)`);
    return true;
  }
  const url = Deno.env.get("CORREO_URL") ?? "";
  let ok = true;
  for (const dest of to) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (Deno.env.get("CORREO_LLAVE") ?? "") },
        body: JSON.stringify({ area: "comercializadora", to: dest, subject, body_html: html, apertura_id: null, enviado_por: enviadoPor }),
      });
      if (!r.ok) {
        ok = false;
        console.error(`send-email ${dest}: HTTP ${r.status} ${(await r.text().catch(() => "")).slice(0, 300)}`);
      }
    } catch (e) {
      ok = false;
      console.error(`send-email ${dest}: ${(e as Error).message ?? e}`);
    }
  }
  return ok;
}
