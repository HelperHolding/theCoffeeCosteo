import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { diaOperacion, sumarDias } from './dia';
import { armarServicio, DIAS_SERVICIO, type RpcServicioFranq, type ServicioFranq } from './servicio';

/**
 * Nivel de servicio de Rappi de la sucursal con la sesión del usuario (la RPC exige gestor). Se leen 35 días hasta
 * hoy: alcanza para 30 publicados aunque Rappi vaya atrasado. null = sin acceso o error.
 */
export async function leerServicio(db: SupabaseClient, companyId: number): Promise<ServicioFranq | null> {
  const hoy = diaOperacion();
  const r = await db.rpc('franq_nivel_servicio', {
    p_company: companyId,
    p_desde: sumarDias(hoy, -(DIAS_SERVICIO + 4)),
    p_hasta: hoy,
  });
  if (r.error || !r.data) return null;
  return armarServicio(r.data as RpcServicioFranq);
}
