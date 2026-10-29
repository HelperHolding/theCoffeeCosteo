import { construirCosteo } from '@/lib/sucursales/datos';
import { leerCatalogoPos } from '@/lib/sucursales/catalogo-pos';
import { leerDatosCosteo } from '@/lib/sucursales/costeo-servidor';
import {
  DIAS_PERIODO_LARGO,
  autorizar,
  invalido,
  json,
  leerOrigen,
  leerPeriodo,
} from '@/lib/sucursales/rutas';
import { fuenteRappi } from '@/lib/sucursales/rappi-pos-servidor';

export const runtime = 'nodejs';

/** Sección Costeo: 403 sin permiso de Costeo para esta sucursal, ANTES de leer la API del POS. */
export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const a = await autorizar(params);
  if (!a.ok) return a.respuesta;
  const q = new URL(req.url).searchParams;
  const origen = leerOrigen(q);
  if (!origen) return invalido('Origen inválido.');
  const periodo = leerPeriodo(q, a.cfg, DIAS_PERIODO_LARGO);
  if (typeof periodo === 'string') return invalido(periodo);
  const [costeo, catalogo] = await Promise.all([
    leerDatosCosteo(a.db, a.perfil, a.cfg.companyId),
    leerCatalogoPos(a.db, a.cfg.companyId),
  ]);
  if (costeo.estado === 'sin-permiso')
    return json({ error: 'No tienes acceso al Costeo de esta sucursal.' }, 403);
  if (costeo.estado === 'error') return json({ error: 'No se pudieron leer los costos de Costeo.' }, 503);
  return json(
    await construirCosteo(
      a.cfg,
      periodo.desde,
      periodo.hasta,
      origen,
      costeo.datos,
      catalogo,
      fuenteRappi(a.db, a.cfg),
    ),
  );
}
