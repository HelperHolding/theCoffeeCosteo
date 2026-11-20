import { construirVivo } from '@/lib/sucursales/datos';
import { invalido, leerOrigen } from '@/lib/sucursales/rutas';
import { autorizarFranq, json } from '@/lib/franquiciatarios/rutas';
import { fuentesFranq, sinDatosSensibles } from '@/lib/franquiciatarios/ventas';

export const runtime = 'nodejs';

/** «En vivo» de la sucursal para el módulo: mismo constructor que Sucursales, sin neto, costos ni márgenes. */
export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const a = await autorizarFranq(params);
  if (!a.ok) return a.respuesta;
  const q = new URL(req.url).searchParams;
  const origen = leerOrigen(q);
  if (!origen) return invalido('Origen inválido.');
  const { rappi, catalogo } = await fuentesFranq(a.cfg);
  const datos = await construirVivo(a.cfg, origen, { forzar: q.get('fresco') === '1', catalogo, rappi });
  return json(sinDatosSensibles(datos));
}
