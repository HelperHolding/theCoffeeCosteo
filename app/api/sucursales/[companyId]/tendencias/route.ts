import { SEMANAS_PERMITIDAS, construirTendencias } from '@/lib/sucursales/datos';
import { autorizar, invalido, json, leerOrigen } from '@/lib/sucursales/rutas';
import { fuenteRappi } from '@/lib/sucursales/rappi-pos-servidor';

export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const a = await autorizar(params);
  if (!a.ok) return a.respuesta;
  const q = new URL(req.url).searchParams;
  const origen = leerOrigen(q);
  if (!origen) return invalido('Origen inválido.');
  const semanas = Number(q.get('semanas') ?? '4');
  if (!(SEMANAS_PERMITIDAS as readonly number[]).includes(semanas)) return invalido('Semanas: 4, 8 o 12.');
  return json(
    await construirTendencias(
      a.cfg,
      semanas as (typeof SEMANAS_PERMITIDAS)[number],
      origen,
      fuenteRappi(a.db, a.cfg),
    ),
  );
}
