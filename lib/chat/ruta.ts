import { createAnthropic } from '@ai-sdk/anthropic';
import { isStepCount, streamText } from 'ai';
import { servidor } from '@/lib/supabase/servidor';
import { mensajesModelo } from '@/lib/chat/entrada';
import { herramientasChat } from '@/lib/chat/herramientas';
import { agentes, type IdAgente } from '@/lib/chat/agentes';

const fallo = (error: string, status: number) =>
  Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });
/** Atiende una pregunta para el agente de un módulo: misma seguridad y cuotas, distintas reglas y consultas. */
export async function atender(req: Request, agente: IdAgente) {
  if (req.headers.get('origin') !== new URL(req.url).origin) return fallo('Origen no permitido.', 403);
  const db = await servidor();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return fallo('Tu sesión venció. Vuelve a iniciar sesión.', 401);
  const perfil = await db.from('perfiles').select('activo').eq('user_id', data.user.id).maybeSingle();
  if (perfil.error) return fallo('No se pudo verificar tu cuenta.', 503);
  if (!perfil.data?.activo) return fallo('Se requiere una cuenta activa.', 403);
  if (agente === 'crm') {
    // Mismo criterio que sesionCrm; la RLS lo vuelve a exigir en cada consulta.
    const acceso = await db
      .from('perfil_modulos')
      .select('nivel')
      .eq('user_id', data.user.id)
      .eq('modulo', 'crm')
      .maybeSingle();
    if (acceso.error) return fallo('No se pudo verificar tu cuenta.', 503);
    if (!acceso.data) return fallo('No tienes acceso al CRM.', 403);
  }
  // Modo demo solo en local: sin clave, fuera de producción y con CHAT_DEMO=1 (guion de costeo).
  const demo =
    agente === 'costeo' &&
    process.env.CHAT_DEMO === '1' &&
    process.env.NODE_ENV !== 'production' &&
    !process.env.ANTHROPIC_API_KEY;
  if (!process.env.ANTHROPIC_API_KEY && !demo) return fallo('El asistente aún no está disponible.', 503);
  let messages;
  try {
    if (Number(req.headers.get('content-length')) > 100000)
      return fallo('Inicia una conversación nueva o acorta la pregunta.', 413);
    // Acota también cuerpos sin Content-Length, antes de parsear JSON.
    const reader = req.body?.getReader();
    if (!reader) return fallo('Falta la pregunta.', 400);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 100000) {
        await reader.cancel();
        return fallo('Inicia una conversación nueva o acorta la pregunta.', 413);
      }
      chunks.push(value);
    }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      buffer.set(chunk, offset);
      offset += chunk.length;
    }
    messages = mensajesModelo(JSON.parse(new TextDecoder().decode(buffer)));
  } catch {
    return fallo('Pregunta inválida o conversación extensa. Inicia una nueva.', 400);
  }
  const cupo = await db.rpc('reservar_consulta_chat');
  if (cupo.error) return fallo('El asistente aún no está disponible.', 503);
  if (cupo.data !== true) return fallo('Alcanzaste el límite de consultas. Intenta más tarde.', 429);
  try {
    const signal = AbortSignal.any([req.signal, AbortSignal.timeout(55000)]);
    const resultado = streamText({
      model: demo
        ? (await import('@/lib/chat/demo')).modeloDemo()
        : createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(
            process.env.CHAT_MODEL || 'claude-sonnet-5-5',
          ),
      instructions: `${agentes[agente].instrucciones}
Hoy es ${new Date().toLocaleDateString('es-MX', { dateStyle: 'full', timeZone: 'America/Mexico_City' })}.`,
      messages,
      tools: herramientasChat(db, signal, agente),
      stopWhen: isStepCount(agentes[agente].pasos),
      maxOutputTokens: 1800,
      maxRetries: 0,
      abortSignal: signal,
    });
    return resultado.toUIMessageStreamResponse({
      headers: { 'Cache-Control': 'no-store' },
      sendReasoning: false,
      onError: () => 'No se pudo completar la respuesta. Intenta de nuevo más tarde.',
    });
  } catch {
    return fallo('No se pudo completar la respuesta. Intenta más tarde.', 503);
  }
}
