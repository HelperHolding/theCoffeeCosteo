import 'server-only';

export type FuncionCom = 'com-minmax' | 'zoho-generar-oc' | 'zoho-sync' | 'zoho-proveedor-minimo';

/**
 * Llama una Edge Function de Comercializadora con el secreto compartido (plan 2, decisión 5; plan 3, decisión 5).
 * Solo servidor: COM_SECRETO nunca llega al navegador. Nunca lanza; los errores salen en lenguaje claro.
 */
export async function invocarFuncion(
  nombre: FuncionCom,
  body: object = {},
  deps: { fetch?: typeof fetch; url?: string; secreto?: string; timeoutMs?: number } = {},
): Promise<{ ok: true; datos: unknown } | { ok: false; error: string }> {
  const secreto = deps.secreto ?? process.env.COM_SECRETO ?? '';
  const base =
    deps.url ?? process.env.COM_FUNCIONES_URL ?? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1`;
  if (!secreto)
    return {
      ok: false,
      error: 'El acceso a las funciones de Comercializadora no está configurado (COM_SECRETO).',
    };
  try {
    const r = await (deps.fetch ?? fetch)(`${base}/${nombre}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-com-secreto': secreto },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(deps.timeoutMs ?? 150_000),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (r.status === 401)
      return { ok: false, error: 'La función rechazó la llamada: revisa el secreto compartido.' };
    if (!r.ok || j.ok === false) return { ok: false, error: j.error || `La función respondió ${r.status}.` };
    return { ok: true, datos: j };
  } catch {
    return { ok: false, error: 'No se pudo contactar la función. Intenta de nuevo en unos minutos.' };
  }
}
