import 'server-only';

export type ResultadoCorreo = 'enviado' | 'no-configurado' | 'fallo';

/**
 * Envía a cada destinatario por el mismo servicio que las funciones (supabase/functions/_shared/correo.ts: CORREO_URL y
 * CORREO_LLAVE, mismo cuerpo). EXCEPCIÓN documentada (spec OV sugerida §7): no pasa por COM_EFECTOS_EXTERNOS porque
 * solo va a direcciones internas. Sin variables no envía ("correo no configurado"). Nunca lanza ni imprime la llave.
 */
export async function enviarCorreoInterno(
  para: string[],
  asunto: string,
  html: string,
  enviadoPor = 'OV sugerida (piloto)',
): Promise<ResultadoCorreo> {
  const url = process.env.CORREO_URL;
  const llave = process.env.CORREO_LLAVE;
  if (!url || !llave) {
    console.log(
      `[comercializadora] correo no configurado: no se envió "${asunto}" (${para.length} destinatarios)`,
    );
    return 'no-configurado';
  }
  let ok = true;
  for (const to of para) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${llave}` },
        body: JSON.stringify({
          area: 'comercializadora',
          to,
          subject: asunto,
          body_html: html,
          apertura_id: null,
          enviado_por: enviadoPor,
        }),
      });
      if (!r.ok) {
        ok = false;
        console.error(
          `[comercializadora] send-email ${to}: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 300)}`,
        );
      }
    } catch (e) {
      ok = false;
      console.error(`[comercializadora] send-email ${to}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return ok ? 'enviado' : 'fallo';
}
