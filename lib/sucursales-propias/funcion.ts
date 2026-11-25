import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { invocarFuncion } from '@/lib/comercializadora/funciones';

export type AccionPagos = 'proveedores' | 'facturas' | 'aplicar';

/** Llama zoho-suc-pagos con el secreto del portal y el JWT del usuario (la función vuelve a revisar su acceso). */
export async function invocarPagos(db: SupabaseClient, accion: AccionPagos, body: object = {}) {
  const { data } = await db.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) return { ok: false as const, error: 'La sesión venció. Vuelve a entrar.' };
  return invocarFuncion(
    'zoho-suc-pagos',
    { accion, ...body },
    { encabezados: { 'x-usuario-jwt': jwt }, timeoutMs: 120_000 },
  );
}
