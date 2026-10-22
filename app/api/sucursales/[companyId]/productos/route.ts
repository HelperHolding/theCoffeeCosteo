import { construirProductos } from '@/lib/sucursales/datos';
import { autorizar, invalido, json, leerOrigen, leerPeriodo } from '@/lib/sucursales/rutas';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const a = await autorizar(params);
  if (!a.ok) return a.respuesta;
  const q = new URL(req.url).searchParams;
  const origen = leerOrigen(q);
  if (!origen) return invalido('Origen inválido.');
  const periodo = leerPeriodo(q, a.cfg, 31);
  if (typeof periodo === 'string') return invalido(periodo);
  return json(await construirProductos(a.cfg, periodo.desde, periodo.hasta, origen));
}
