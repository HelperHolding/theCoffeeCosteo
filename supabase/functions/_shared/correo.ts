/** Envía a cada destinatario; nunca lanza. Devuelve false si algún envío falló (ya registrado en console.error). */
export async function enviarCorreo(to: string[], subject: string, html: string, enviadoPor = "OCs automáticas"): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL") + "/functions/v1/send-email";
  let ok = true;
  for (const dest of to) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + Deno.env.get("SUPABASE_ANON_KEY") },
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
