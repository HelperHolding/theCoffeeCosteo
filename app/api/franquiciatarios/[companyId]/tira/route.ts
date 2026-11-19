import { hoyLocal } from '@/lib/sucursales/datos';
import { invalido, leerOrigen } from '@/lib/sucursales/rutas';
import { diasEntre, fechaValida } from '@/lib/sucursales/tiempo';
import { autorizarFranq, json } from '@/lib/franquiciatarios/rutas';
import { construirTira, DIAS_TIRA, fuentesFranq, sinDatosSensibles } from '@/lib/franquiciatarios/ventas';

export const runtime = 'nodejs';

/** Tira de venta de un día (hoy o los 6 anteriores). */
export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const a = await autorizarFranq(params);
  if ('respuesta' in a) return a.respuesta;
  const q = new URL(req.url).searchParams;
  const origen = leerOrigen(q);
  if (!origen) return invalido('Origen inválido.');
  const hoy = hoyLocal(a.cfg).fecha;
  const dia = q.get('dia') ?? hoy;
  if (!fechaValida(dia) || dia > hoy) return invalido('Día inválido.');
  if (diasEntre(dia, hoy) >= DIAS_TIRA) return invalido(`Solo los últimos ${DIAS_TIRA} días.`);
  const tira = await construirTira(a.cfg, dia, origen, await fuentesFranq(a.cfg));
  return json(sinDatosSensibles(tira));
}
