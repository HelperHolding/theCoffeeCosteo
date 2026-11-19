import { correrOvs, depsReales } from '@/lib/comercializadora/ovSugeridaServidor';
import { autorizadoCron } from '@/lib/cron';
import { clienteServicio } from '@/lib/sucursales/corte-servidor';

export const runtime = 'nodejs';
// Tres tiendas × 28 días del POS (4 lecturas a la vez) más el puente: holgado dentro de 300 s.
export const maxDuration = 300;

/**
 * Piloto de orden de venta sugerida (spec 2026-11-18): Vercel Cron los lunes 12:00 UTC (06:00 CDMX) con
 * `Authorization: Bearer CRON_SECRET`. Solo escribe sus tablas (com_ovs_*), la bitácora y manda el correo interno.
 */
export async function GET(req: Request) {
  if (!autorizadoCron(req)) return Response.json({ error: 'No autorizado.' }, { status: 401 });
  const db = clienteServicio();
  if (!db) return Response.json({ error: 'Falta la llave de servicio de Supabase.' }, { status: 503 });
  try {
    return Response.json(await correrOvs(depsReales(db)));
  } catch (e) {
    console.error('[comercializadora] ov-sugerida', e instanceof Error ? e.message : e);
    return Response.json({ error: 'La orden de venta sugerida no se pudo calcular.' }, { status: 500 });
  }
}
