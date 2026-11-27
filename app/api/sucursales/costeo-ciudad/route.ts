import { accesoSucursales } from '@/lib/supabase/sesion';
import { alcanceDe, type ClienteRpc } from '@/lib/sucursales/alcance';
import { leerMes } from '@/lib/sucursales/consumo-mes';
import {
  ORIGENES_COSTEO,
  armarCosteoCiudad,
  type CosteoCiudadRpc,
  type OrigenCosteo,
  type RespuestaCosteoCiudad,
} from '@/lib/sucursales/costeo-mes';
import { json } from '@/lib/sucursales/rutas';

export const runtime = 'nodejs';

/**
 * Costeo de un tablero de ciudad por mes cerrado (docs/sucursales/19): margen teórico por sucursal y productos de la
 * ciudad, con los costos del día en que se calculó el mes. La base exige el módulo Sucursales Y permiso de Costeo (rol
 * de Costeo o módulo sucursales_costeo); sin permiso, 403. Sin ?mes, el último calculado.
 */
export async function GET(req: Request) {
  const a = await accesoSucursales();
  if (!a.ok) return json({ error: a.mensaje }, a.status);
  const q = new URL(req.url).searchParams;
  const alcance = alcanceDe(q, a.companias);
  if ('error' in alcance) return json({ error: alcance.error }, alcance.status);
  if (alcance.tipo !== 'ciudad') return json({ error: 'Tablero no disponible.' }, 404);
  const texto = q.get('mes');
  const mes = texto ? leerMes(texto) : null;
  if (texto && !mes) return json({ error: 'Mes inválido (AAAA-MM).' }, 400);
  const origen = (q.get('origen') ?? 'todos') as OrigenCosteo;
  if (!ORIGENES_COSTEO.includes(origen)) return json({ error: 'Origen inválido.' }, 400);
  const r = await (a.db as unknown as ClienteRpc).rpc('sucursales_ciudad_costeo', {
    p_ciudad: alcance.clave,
    p_mes: mes?.mes ?? null,
  });
  if (r.error) {
    console.error('[sucursales] costeo de ciudad', r.error);
    return json({ error: 'No se pudo leer el costeo.' }, 503);
  }
  if (!r.data) return json({ error: 'Tu perfil no tiene acceso al Costeo.' }, 403);
  return json<RespuestaCosteoCiudad>(
    armarCosteoCiudad(r.data as CosteoCiudadRpc, alcance.sucursales, origen),
  );
}
