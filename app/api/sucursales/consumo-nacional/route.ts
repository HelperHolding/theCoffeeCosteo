import { accesoSucursales } from '@/lib/supabase/sesion';
import { alcanceDe, rpcDelAlcance, vacioDe } from '@/lib/sucursales/alcance';
import { leerMes } from '@/lib/sucursales/consumo-mes';
import { armarConsumoNacional, type RpcConsumoNacional } from '@/lib/sucursales/consumo-nacional';
import type { ConsumoNacional } from '@/lib/sucursales/contratos';
import { json } from '@/lib/sucursales/rutas';

export const runtime = 'nodejs';

/**
 * Consumo nacional por mes (docs/sucursales/17): solo lee lo que guardó el script consumo-mes, de las sucursales
 * asignadas Y configuradas del usuario. Sin ?mes, el último calculado. Con `ciudad`, las de esa ciudad para quien
 * tiene el módulo (docs/sucursales/19).
 */
export async function GET(req: Request) {
  const a = await accesoSucursales();
  if (!a.ok) return json({ error: a.mensaje }, a.status);
  const q = new URL(req.url).searchParams;
  const alcance = alcanceDe(q, a.companias);
  if ('error' in alcance) return json({ error: alcance.error }, alcance.status);
  const sucursales = alcance.sucursales;
  if (!sucursales.length) return json({ error: vacioDe(alcance) }, 404);
  const texto = q.get('mes');
  const pedido = texto ? leerMes(texto) : null;
  if (texto && !pedido) return json({ error: 'Mes inválido (AAAA-MM).' }, 400);
  const companias = sucursales.map((s) => s.companyId);
  const leer = (mes: string) =>
    rpcDelAlcance(a.db, alcance, 'sucursales_consumo_nacional', { p_mes: mes, p_companias: companias });
  // Sin mes: se pide un mes cualquiera para conocer los calculados y se relee el último.
  let mes = pedido?.mes ?? null;
  let r = await leer(mes ?? '1900-01-01');
  if (!r.error && !mes) {
    mes = (r.data as unknown as RpcConsumoNacional).meses[0] ?? null;
    if (mes) r = await leer(mes);
  }
  if (r.error || !r.data) {
    console.error('[sucursales] consumo nacional', r.error);
    return json({ error: 'No se pudo leer el consumo.' }, 503);
  }
  return json<ConsumoNacional>(
    armarConsumoNacional(r.data as unknown as RpcConsumoNacional, mes, sucursales, new Date().toISOString()),
  );
}
