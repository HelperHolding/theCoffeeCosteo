import { construirPedidos } from '@/lib/sucursales/datos';
import { hoyLocal } from '@/lib/sucursales/datos';
import { invalido, leerOrigen, leerPeriodo } from '@/lib/sucursales/rutas';
import { diasEntre } from '@/lib/sucursales/tiempo';
import { autorizarFranq, json } from '@/lib/franquiciatarios/rutas';
import { DIAS_TIRA, fuentesFranq, sinDatosSensibles } from '@/lib/franquiciatarios/ventas';

export const runtime = 'nodejs';

/** Pedidos con su desglose (hasta 7 días), mismo constructor que Sucursales, sin neto, costos ni márgenes. */
export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const a = await autorizarFranq(params);
  if ('respuesta' in a) return a.respuesta;
  const q = new URL(req.url).searchParams;
  const origen = leerOrigen(q);
  if (!origen) return invalido('Origen inválido.');
  const periodo = leerPeriodo(q, a.cfg, 7);
  if (typeof periodo === 'string') return invalido(periodo);
  // El módulo solo muestra hoy y los 6 días anteriores.
  if (diasEntre(periodo.desde, hoyLocal(a.cfg).fecha) >= DIAS_TIRA) return invalido(`Solo los últimos ${DIAS_TIRA} días.`);
  const pago = q.get('pago') || null;
  if (pago !== null && !/^[A-Z_]{1,40}$/.test(pago)) return invalido('Forma de pago inválida.');
  const pagina = Number(q.get('pagina') ?? '1');
  if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 10_000) return invalido('Página inválida.');
  const { rappi } = await fuentesFranq(a.cfg);
  const datos = await construirPedidos(a.cfg, periodo.desde, periodo.hasta, origen, pago, pagina, rappi);
  return json(sinDatosSensibles(datos));
}
