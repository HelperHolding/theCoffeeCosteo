import { accesoSucursales } from '@/lib/supabase/sesion';
import { alcanceDe, rpcDelAlcance, vacioDe } from '@/lib/sucursales/alcance';
import { leerMes } from '@/lib/sucursales/consumo-mes';
import type { DesgloseConsumo } from '@/lib/sucursales/contratos';
import type { Origen } from '@/lib/sucursales/normalizar';
import { json } from '@/lib/sucursales/rutas';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Consumo por sucursal y origen de un insumo (?insumo) o de todos (para exportar). Con `ciudad`, las de esa ciudad. */
export async function GET(req: Request) {
  const a = await accesoSucursales();
  if (!a.ok) return json({ error: a.mensaje }, a.status);
  const q = new URL(req.url).searchParams;
  const alcance = alcanceDe(q, a.companias);
  if ('error' in alcance) return json({ error: alcance.error }, alcance.status);
  const sucursales = alcance.sucursales;
  if (!sucursales.length) return json({ error: vacioDe(alcance) }, 404);
  const m = leerMes(q.get('mes') ?? '');
  if (!m) return json({ error: 'Mes inválido (AAAA-MM).' }, 400);
  const insumo = q.get('insumo');
  if (insumo && !UUID.test(insumo)) return json({ error: 'Insumo inválido.' }, 400);
  const r = await rpcDelAlcance(a.db, alcance, 'sucursales_consumo_desglose', {
    p_mes: m.mes,
    p_companias: sucursales.map((s) => s.companyId),
    p_insumo: insumo,
  });
  if (r.error || !r.data) {
    console.error('[sucursales] desglose de consumo', r.error);
    return json({ error: 'No se pudo leer el desglose.' }, 503);
  }
  const filas = (r.data as { company_id: number; insumo_id: string; origen: Origen; cantidad: number | string }[]).map(
    (x) => ({ companyId: x.company_id, insumoId: x.insumo_id, origen: x.origen, cantidad: Number(x.cantidad) }),
  );
  return json<DesgloseConsumo>({ mes: m.mes, filas });
}
