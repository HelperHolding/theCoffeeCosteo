import { timingSafeEqual } from 'node:crypto';

/** Llamada de Vercel Cron: `Authorization: Bearer CRON_SECRET`. Sin CRON_SECRET configurado, nada corre. */
export function autorizadoCron(req: Request): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const a = Buffer.from(req.headers.get('authorization') ?? '');
  const b = Buffer.from(`Bearer ${secreto}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
