import { timingSafeEqual } from 'node:crypto';
import { clienteServicio, cortar } from '@/lib/sucursales/corte-servidor';

export const runtime = 'nodejs';
// Hoy de todas las sucursales tarda ~20 s (16.5 s medido con 79, 4 lecturas a la vez); el cierre de 8 días, más.
export const maxDuration = 300;

const autorizado = (req: Request) => {
  const secreto = process.env.CRON_SECRET;
  const dado = req.headers.get('authorization') ?? '';
  if (!secreto) return false;
  const a = Buffer.from(dado);
  const b = Buffer.from(`Bearer ${secreto}`);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Corte del Tablero de México (docs/sucursales/16), llamado por Vercel Cron con `Authorization: Bearer CRON_SECRET`:
 * cada 10 min, hoy; a las 5:30 de la Ciudad de México, `?dias=8` (hoy y los 7 días cerrados anteriores, para que
 * entren los cambios tardíos de Rappi y el cierre del día). Sin CRON_SECRET configurado no corre.
 */
export async function GET(req: Request) {
  if (!autorizado(req)) return Response.json({ error: 'No autorizado.' }, { status: 401 });
  const db = clienteServicio();
  if (!db) return Response.json({ error: 'Falta la llave de servicio de Supabase.' }, { status: 503 });
  const dias = Number(new URL(req.url).searchParams.get('dias') ?? '1');
  if (!Number.isInteger(dias) || dias < 1 || dias > 8)
    return Response.json({ error: 'dias: 1 a 8.' }, { status: 400 });
  try {
    return Response.json(await cortar(db, { dias }));
  } catch (e) {
    console.error('[sucursales] corte', e);
    return Response.json({ error: 'El corte no se pudo guardar.' }, { status: 500 });
  }
}
