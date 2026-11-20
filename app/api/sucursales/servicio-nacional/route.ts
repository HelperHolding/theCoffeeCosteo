import { accesoSucursales } from '@/lib/supabase/sesion';
import { sucursalesAccesibles } from '@/lib/sucursales/acceso';
import { DIAS_PERIODO_LARGO, json } from '@/lib/sucursales/rutas';
import { construirServicioNacional, type RpcServicioNacional } from '@/lib/sucursales/servicio-nacional';
import { enZona, diasEntre, fechaValida } from '@/lib/sucursales/tiempo';

export const runtime = 'nodejs';

/**
 * Tablero de México · Nivel de servicio (docs/rappi-portal/08, fase 3): Rappi del portal de todas las sucursales del
 * usuario (asignadas y configuradas; la RPC vuelve a filtrar con sucursales_acceso). Una sola llamada, hasta 62 días.
 * Las fechas son las de Rappi (hora del centro).
 */
export async function GET(req: Request) {
  const a = await accesoSucursales();
  if (!a.ok) return json({ error: a.mensaje }, a.status);
  const sucursales = sucursalesAccesibles(a.companias);
  if (!sucursales.length) return json({ error: 'Sin sucursales asignadas.' }, 404);
  const q = new URL(req.url).searchParams;
  const hoy = enZona(new Date(), 'America/Mexico_City').fecha;
  const desde = q.get('desde') ?? hoy;
  const hasta = q.get('hasta') ?? desde;
  if (!fechaValida(desde) || !fechaValida(hasta))
    return json({ error: 'Fecha inválida (usa AAAA-MM-DD).' }, 400);
  if (desde > hasta) return json({ error: 'La fecha inicial es posterior a la final.' }, 400);
  if (hasta > hoy) return json({ error: 'El periodo no puede incluir fechas futuras.' }, 400);
  if (diasEntre(desde, hasta) >= DIAS_PERIODO_LARGO)
    return json({ error: `El periodo máximo es de ${DIAS_PERIODO_LARGO} días.` }, 400);
  const r = await a.db.rpc('sucursales_servicio_nacional', {
    p_companias: sucursales.map((s) => s.companyId),
    p_desde: desde,
    p_hasta: hasta,
  });
  if (r.error || !r.data) {
    console.error('[sucursales] servicio nacional', r.error);
    return json({ error: 'No se pudo leer el nivel de servicio de Rappi.' }, 503);
  }
  return json(
    construirServicioNacional(
      r.data as unknown as RpcServicioNacional,
      desde,
      hasta,
      sucursales.map((s) => ({
        companyId: s.companyId,
        nombre: s.nombre,
        ciudad: s.ciudad,
        rappiPortal: s.rappiPortal,
      })),
    ),
  );
}
