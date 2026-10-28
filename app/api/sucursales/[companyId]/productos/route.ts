import { construirProductos } from '@/lib/sucursales/datos';
import { leerCatalogoPos } from '@/lib/sucursales/catalogo-pos';
import { leerDatosCosteo } from '@/lib/sucursales/costeo-servidor';
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
  // Costos solo si el perfil puede verlos y con su sesión (RLS); si no, la respuesta no los lleva.
  const [costeo, catalogo] = await Promise.all([leerDatosCosteo(a.db, a.perfil), leerCatalogoPos(a.db)]);
  return json(await construirProductos(a.cfg, periodo.desde, periodo.hasta, origen, costeo, catalogo));
}
