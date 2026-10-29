import { construirPedidos } from '@/lib/sucursales/datos';
import { autorizar, invalido, json, leerOrigen, leerPeriodo } from '@/lib/sucursales/rutas';
import { fuenteRappi } from '@/lib/sucursales/rappi-pos-servidor';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const a = await autorizar(params);
  if (!a.ok) return a.respuesta;
  const q = new URL(req.url).searchParams;
  const origen = leerOrigen(q);
  if (!origen) return invalido('Origen inválido.');
  const periodo = leerPeriodo(q, a.cfg, 7);
  if (typeof periodo === 'string') return invalido(periodo);
  const pago = q.get('pago') || null;
  if (pago !== null && !/^[A-Z_]{1,40}$/.test(pago)) return invalido('Forma de pago inválida.');
  const pagina = Number(q.get('pagina') ?? '1');
  if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 10_000) return invalido('Página inválida.');
  return json(
    await construirPedidos(
      a.cfg,
      periodo.desde,
      periodo.hasta,
      origen,
      pago,
      pagina,
      fuenteRappi(a.db, a.cfg),
    ),
  );
}
