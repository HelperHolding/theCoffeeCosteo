// lib/comercializadora/reporteSemanal.ts
import 'server-only';
import { invocarFuncion } from './funciones';
import type { Reporte } from '../../supabase/functions/_shared/reporte/reporte.ts';
import { esLunes, lunesDe, sumar } from '../../supabase/functions/_shared/reporte/fechas.ts';

export type ResultadoReporte =
  | { ok: true; reporte: Reporte; cache: boolean; aviso: string | null }
  | { ok: false; error: string };

export const semanaPorDefecto = (hoy: string) => sumar(lunesDe(hoy), -7);
export const semanaDeUrl = (x: unknown, hoy: string) => (esLunes(x) ? x : semanaPorDefecto(hoy));

/** Lee el reporte de la Edge Function (Zoho en vivo con caché de 15 min). */
export async function leerReporteSemanal(
  semana: string,
  forzar = false,
  deps?: Parameters<typeof invocarFuncion>[2],
): Promise<ResultadoReporte> {
  const r = await invocarFuncion('zoho-reporte-semanal', { semana, forzar }, { timeoutMs: 150_000, ...deps });
  if (!r.ok) return r;
  const d = r.datos as { reporte: Reporte; cache: boolean; aviso: string | null };
  return { ok: true, reporte: d.reporte, cache: d.cache, aviso: d.aviso ?? null };
}
