import { construirProductos } from '@/lib/sucursales/datos';
import { leerCatalogoPos } from '@/lib/sucursales/catalogo-pos';
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

export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const a = await autorizar(params);
  if (!a.ok) return a.respuesta;
  const q = new URL(req.url).searchParams;
  const origen = leerOrigen(q);
  if (!origen) return invalido('Origen inválido.');
  const periodo = leerPeriodo(q, a.cfg, DIAS_PERIODO_LARGO);
  if (typeof periodo === 'string') return invalido(periodo);
  const catalogo = await leerCatalogoPos(a.db, a.cfg.companyId);
  return json(
    await construirProductos(a.cfg, periodo.desde, periodo.hasta, origen, catalogo, fuenteRappi(a.db, a.cfg)),
  );
}
