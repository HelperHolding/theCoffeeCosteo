import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { armarFicha, type Ficha, type RpcFicha } from './recetas';

/**
 * Ficha de recetas de una sucursal con la sesión del usuario: la RPC autoriza (franq_rol) y solo devuelve cantidades.
 * null = sin acceso o error de lectura.
 */
export async function leerFicha(db: SupabaseClient, companyId: number): Promise<Ficha | null> {
  const r = await db.rpc('franq_ficha_recetas', { p_company: companyId });
  if (r.error || !r.data) return null;
  return armarFicha(r.data as RpcFicha);
}
