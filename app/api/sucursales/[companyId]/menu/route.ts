import { autorizar, json } from '@/lib/sucursales/rutas';
import { construirMenu, type RpcMenuRappi } from '@/lib/sucursales/menu-rappi';

export const runtime = 'nodejs';

/**
 * Menú/Carta de Rappi de una sucursal (docs/rappi-portal/09): productos y toppings encendidos y apagados, leídos del
 * portal de Partners cada 30 min por el lector de n8n. Aquí solo se leen bajo el acceso del usuario a la sucursal (la
 * RPC lo vuelve a exigir). Sin tienda en el portal: 404, como Nivel de servicio.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const a = await autorizar(params);
  if (!a.ok) return a.respuesta;
  if (!a.cfg.rappiPortal) return json({ error: 'Esta sucursal no está conectada al portal de Rappi.' }, 404);
  const r = await a.db.rpc('sucursales_menu_rappi', { p_company: a.cfg.companyId });
  if (r.error) {
    console.error('[sucursales] menú Rappi', r.error);
    return json({ error: 'No se pudo leer el menú de Rappi.' }, 503);
  }
  if (!r.data) return json({ error: 'Sucursal no disponible.' }, 404);
  return json(construirMenu(r.data as unknown as RpcMenuRappi));
}
