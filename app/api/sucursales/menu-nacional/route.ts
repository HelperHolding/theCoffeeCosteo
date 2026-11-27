import { accesoSucursales } from '@/lib/supabase/sesion';
import { alcanceDe, rpcDelAlcance, vacioDe } from '@/lib/sucursales/alcance';
import { construirMenuNacional, type RpcMenuNacional } from '@/lib/sucursales/menu-rappi';
import { json } from '@/lib/sucursales/rutas';

export const runtime = 'nodejs';

/**
 * Tablero de México · Menú/Carta de Rappi (docs/rappi-portal/09): todas las sucursales del usuario en una sola llamada
 * (la RPC vuelve a filtrar con sucursales_acceso). Sumas por tienda y la lista de apagados; nunca el menú completo.
 * Con `ciudad`, las de esa ciudad para quien tiene el módulo (docs/sucursales/19).
 */
export async function GET(req: Request) {
  const a = await accesoSucursales();
  if (!a.ok) return json({ error: a.mensaje }, a.status);
  const alcance = alcanceDe(new URL(req.url).searchParams, a.companias);
  if ('error' in alcance) return json({ error: alcance.error }, alcance.status);
  const sucursales = alcance.sucursales;
  if (!sucursales.length) return json({ error: vacioDe(alcance) }, 404);
  const r = await rpcDelAlcance(a.db, alcance, 'sucursales_menu_nacional', {
    p_companias: sucursales.map((s) => s.companyId),
  });
  if (r.error || !r.data) {
    console.error('[sucursales] menú Rappi nacional', r.error);
    return json({ error: 'No se pudo leer el menú de Rappi.' }, 503);
  }
  return json(
    construirMenuNacional(
      r.data as unknown as RpcMenuNacional,
      sucursales.map((s) => ({
        companyId: s.companyId,
        nombre: s.nombre,
        ciudad: s.ciudad,
        rappiPortal: !!s.rappiPortal,
      })),
    ),
  );
}
