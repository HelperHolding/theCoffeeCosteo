import { construirConsumo } from '@/lib/sucursales/datos';
import { leerCatalogoPos } from '@/lib/sucursales/catalogo-pos';
import { leerDatosConsumo } from '@/lib/sucursales/consumo-servidor';
import {
  DIAS_PERIODO_LARGO,
  autorizar,
  invalido,
  json,
  leerOrigen,
  leerPeriodo,
} from '@/lib/sucursales/rutas';

export const runtime = 'nodejs';

/** Sección Consumo: consumo teórico según receta, solo cantidades. Para quien ve la sucursal. */
export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const a = await autorizar(params);
  if (!a.ok) return a.respuesta;
  const q = new URL(req.url).searchParams;
  const origen = leerOrigen(q);
  if (!origen) return invalido('Origen inválido.');
  const periodo = leerPeriodo(q, a.cfg, DIAS_PERIODO_LARGO);
  if (typeof periodo === 'string') return invalido(periodo);
  const [recetas, catalogo] = await Promise.all([
    leerDatosConsumo(a.db, a.cfg.companyId),
    leerCatalogoPos(a.db, a.cfg.companyId),
  ]);
  if (!recetas) return json({ error: 'No se pudieron leer las recetas para el consumo.' }, 503);
  return json(await construirConsumo(a.cfg, periodo.desde, periodo.hasta, origen, recetas, catalogo));
}
