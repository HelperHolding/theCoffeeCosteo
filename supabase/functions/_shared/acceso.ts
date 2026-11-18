/** Correos y escrituras a Zoho solo con COM_EFECTOS_EXTERNOS=si (plan 2, decisión 4). Apagado por omisión. */
export function efectosExternos(): boolean {
  return Deno.env.get("COM_EFECTOS_EXTERNOS") === "si";
}

/** El cron (com_invocar) y el portal mandan x-com-secreto; sin COM_SECRETO configurado no pasa nadie. */
export function autorizado(req: Request): boolean {
  const esperado = Deno.env.get("COM_SECRETO") ?? "";
  const recibido = req.headers.get("x-com-secreto") ?? "";
  if (!esperado || recibido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ recibido.charCodeAt(i);
  return dif === 0;
}
