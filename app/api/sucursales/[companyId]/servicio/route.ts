import { DIAS_PERIODO_LARGO, autorizar, invalido, json, leerPeriodo } from '@/lib/sucursales/rutas';
import { mismaHoraQueRappi } from '@/lib/sucursales/rappi-pos';
import { construirServicio, type RpcServicio } from '@/lib/sucursales/servicio';

export const runtime = 'nodejs';

/**
 * Sección «Nivel de servicio» · indicadores, reclamos y conectividad de Rappi leídos del portal de Partners
 * (docs/rappi-portal/08). Los guarda el cron de n8n; aquí solo se leen bajo el acceso del usuario a la sucursal (la RPC
 * lo vuelve a exigir). Hasta 62 días. Sin tienda en el portal: 404, como la pestaña Rappi.
 */
export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const a = await autorizar(params);
  if (!a.ok) return a.respuesta;
  if (!a.cfg.rappiPortal) return json({ error: 'Esta sucursal no está conectada al portal de Rappi.' }, 404);
  const periodo = leerPeriodo(new URL(req.url).searchParams, a.cfg, DIAS_PERIODO_LARGO);
  if (typeof periodo === 'string') return invalido(periodo);
  const r = await a.db.rpc('sucursales_nivel_servicio', {
    p_company: a.cfg.companyId,
    p_desde: periodo.desde,
    p_hasta: periodo.hasta,
  });
  if (r.error) return json({ error: 'No se pudo leer el nivel de servicio de Rappi.' }, 503);
  if (!r.data) return json({ error: 'Sucursal no disponible.' }, 404);
  return json(
    construirServicio(
      r.data as unknown as RpcServicio,
      periodo.desde,
      periodo.hasta,
      a.cfg.zona,
      !mismaHoraQueRappi(a.cfg.zona, periodo.hasta),
    ),
  );
}
