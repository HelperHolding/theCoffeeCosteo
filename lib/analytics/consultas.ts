import 'server-only';
import type { servidor } from '../supabase/servidor';
import { sumarDias } from '../sucursales/tiempo';
import type { DatosSemana, FilaKpiDb, RappiZohoDb, TiendaDb } from './tablero';

type Db = Awaited<ReturnType<typeof servidor>>;

/** Lee todas las filas (PostgREST corta en 1,000). Cualquier error se propaga: nunca se muestra como cero. */
async function todas<T>(
  consulta: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
) {
  const r: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await consulta(i, i + 999);
    if (error || !data) throw new Error('No se pudieron leer los datos de Analytics.');
    r.push(...data);
    if (data.length < 1000) return r;
  }
}

/**
 * Datos de una semana con la sesión del usuario (la RLS exige admin activo). Solo agregados.
 */
export async function leerSemana(db: Db, lunes: string): Promise<DatosSemana> {
  const domingo = sumarDias(lunes, 6);
  const [tiendas, kpi, rappiZoho] = await Promise.all([
    todas<TiendaDb>((a, b) =>
      db.from('analytics_tiendas').select('company_id,store_id,nombre').order('company_id').range(a, b),
    ),
    todas<FilaKpiDb>((a, b) =>
      db
        .from('analytics_ventas_kpi')
        .select(
          'company_id,fecha,provisional,leido_en,venta_cent,tickets,unidades,mostrador_cent,app_cent,rappi_pos_tickets,rappi_pos_cent,sin_origen_tickets',
        )
        .gte('fecha', lunes)
        .lte('fecha', domingo)
        .order('company_id')
        .order('fecha')
        .range(a, b),
    ),
    todas<RappiZohoDb>((a, b) =>
      db
        .from('analytics_ventas_diarias')
        .select('company_id,fecha,venta_cent,tickets')
        .eq('fuente', 'zoho_rappi')
        .gte('fecha', lunes)
        .lte('fecha', domingo)
        .order('company_id')
        .order('fecha')
        .order('canal')
        .range(a, b),
    ),
  ]);
  return { tiendas, kpi, rappiZoho };
}
