import { accesoSucursales } from '@/lib/supabase/sesion';
import { sucursalesAccesibles } from '@/lib/sucursales/acceso';
import { leerMes } from '@/lib/sucursales/consumo-mes';
import type { DesgloseConsumo } from '@/lib/sucursales/contratos';
import type { Origen } from '@/lib/sucursales/normalizar';
import { json } from '@/lib/sucursales/rutas';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Consumo por sucursal y origen de un insumo (?insumo) o de todos (para exportar). */
export async function GET(req: Request) {
  const a = await accesoSucursales();
  if (!a.ok) return json({ error: a.mensaje }, a.status);
  const sucursales = sucursalesAccesibles(a.companias);
  if (!sucursales.length) return json({ error: 'Sin sucursales asignadas.' }, 404);
  const q = new URL(req.url).searchParams;
  const m = leerMes(q.get('mes') ?? '');
  if (!m) return json({ error: 'Mes inválido (AAAA-MM).' }, 400);
  const insumo = q.get('insumo');
  if (insumo && !UUID.test(insumo)) return json({ error: 'Insumo inválido.' }, 400);
  const r = await a.db.rpc('sucursales_consumo_desglose', {
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
