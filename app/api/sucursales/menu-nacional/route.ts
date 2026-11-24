import { accesoSucursales } from '@/lib/supabase/sesion';
import { sucursalesAccesibles } from '@/lib/sucursales/acceso';
import { construirMenuNacional, type RpcMenuNacional } from '@/lib/sucursales/menu-rappi';
import { json } from '@/lib/sucursales/rutas';

export const runtime = 'nodejs';

/**
 * Tablero de México · Menú/Carta de Rappi (docs/rappi-portal/09): todas las sucursales del usuario en una sola llamada
 * (la RPC vuelve a filtrar con sucursales_acceso). Sumas por tienda y la lista de apagados; nunca el menú completo.
 */
export async function GET() {
  const a = await accesoSucursales();
  if (!a.ok) return json({ error: a.mensaje }, a.status);
  const sucursales = sucursalesAccesibles(a.companias);
  if (!sucursales.length) return json({ error: 'Sin sucursales asignadas.' }, 404);
  const r = await a.db.rpc('sucursales_menu_nacional', { p_companias: sucursales.map((s) => s.companyId) });
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
