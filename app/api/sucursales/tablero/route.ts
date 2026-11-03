import { accesoSucursales } from '@/lib/supabase/sesion';
import { sucursalesAccesibles } from '@/lib/sucursales/acceso';
import { SEMANAS_PERMITIDAS, hoyLocal } from '@/lib/sucursales/datos';
import { diaLunes } from '@/lib/sucursales/metricas';
import { armarHoy, armarPeriodo, type RpcHoy, type RpcPeriodo } from '@/lib/sucursales/resumen';
import { json } from '@/lib/sucursales/rutas';
import { sumarDias } from '@/lib/sucursales/tiempo';
import type { TableroMexico } from '@/lib/sucursales/contratos';

export const runtime = 'nodejs';

/**
 * Tablero de México (docs/sucursales/16): solo lee los totales que guarda el corte, de las sucursales asignadas Y
 * configuradas del usuario (sucursales_acceso en la base, además del filtro aquí). Nunca lee pedidos.
 */
export async function GET(req: Request) {
  const a = await accesoSucursales();
  if (!a.ok) return json({ error: a.mensaje }, a.status);
  const sucursales = sucursalesAccesibles(a.companias);
  if (!sucursales.length) return json({ error: 'Sin sucursales asignadas.' }, 404);
  const semanas = Number(new URL(req.url).searchParams.get('semanas') ?? '8');
  if (!(SEMANAS_PERMITIDAS as readonly number[]).includes(semanas))
    return json({ error: 'Semanas: 4, 8 o 12.' }, 400);

  const hoys = sucursales.map((s) => hoyLocal(s).fecha);
  // Semanas completas (lunes a domingo) hasta el domingo pasado, en la fecha de la Ciudad de México.
  const hoy = hoys.reduce((m, f) => (f > m ? f : m));
  const lunes = sumarDias(hoy, -diaLunes(hoy));
  const hasta = sumarDias(lunes, -1);
  const desde = sumarDias(lunes, -7 * semanas);
  const companias = sucursales.map((s) => s.companyId);
  const [h, p] = await Promise.all([
    a.db.rpc('sucursales_tablero_hoy', { p_companias: companias, p_hoys: hoys }),
    a.db.rpc('sucursales_tablero_periodo', { p_companias: companias, p_desde: desde, p_hasta: hasta }),
  ]);
  if (h.error || p.error || !h.data || !p.data) {
    console.error('[sucursales] tablero', h.error ?? p.error);
    return json({ error: 'No se pudo leer el tablero.' }, 503);
  }
  return json<TableroMexico>({
    generadoEn: new Date().toISOString(),
    semanas,
    hoy: armarHoy(h.data as unknown as RpcHoy, sucursales),
    periodo: armarPeriodo(p.data as unknown as RpcPeriodo, desde, hasta, sucursales),
  });
}
