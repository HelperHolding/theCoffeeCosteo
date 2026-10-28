import { leerCatalogoPos } from '@/lib/sucursales/catalogo-pos';
import { construirVivo } from '@/lib/sucursales/datos';
import { autorizar, invalido, json, leerOrigen } from '@/lib/sucursales/rutas';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const a = await autorizar(params);
  if (!a.ok) return a.respuesta;
  const q = new URL(req.url).searchParams;
  const origen = leerOrigen(q);
  if (!origen) return invalido('Origen inválido.');
  const catalogo = await leerCatalogoPos(a.db, a.cfg.companyId);
  return json(await construirVivo(a.cfg, origen, { forzar: q.get('fresco') === '1', catalogo }));
}
