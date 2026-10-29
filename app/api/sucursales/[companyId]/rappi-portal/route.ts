import { DIAS_PERIODO_LARGO, autorizar, invalido, json, leerPeriodo } from '@/lib/sucursales/rutas';
import { construirRappiPortal, type RpcRappiPortal } from '@/lib/sucursales/rappi-portal';

export const runtime = 'nodejs';

/**
 * Pestaña Rappi · pedidos leídos del portal de Partners (docs/rappi-portal). Los guarda el cron de n8n; aquí solo se
 * leen bajo el acceso del usuario a la sucursal (la RPC lo vuelve a exigir). Hasta 62 días.
 */
export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const a = await autorizar(params);
  if (!a.ok) return a.respuesta;
  if (!a.cfg.rappiPortal) return json({ error: 'Esta sucursal no está conectada al portal de Rappi.' }, 404);
  const periodo = leerPeriodo(new URL(req.url).searchParams, a.cfg, DIAS_PERIODO_LARGO);
  if (typeof periodo === 'string') return invalido(periodo);
  const r = await a.db.rpc('sucursales_rappi_portal', {
    p_company: a.cfg.companyId,
    p_desde: periodo.desde,
    p_hasta: periodo.hasta,
  });
  if (r.error) return json({ error: 'No se pudieron leer los pedidos de Rappi.' }, 503);
  if (!r.data) return json({ error: 'Sucursal no disponible.' }, 404);
  return json(construirRappiPortal(r.data as unknown as RpcRappiPortal, periodo.desde, periodo.hasta));
}
