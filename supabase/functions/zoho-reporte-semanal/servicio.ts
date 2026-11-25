// supabase/functions/zoho-reporte-semanal/servicio.ts
import type { SupabaseClient } from "../_shared/db.ts";
import { hoyCdmx } from "../_shared/fechas.ts";
import type { ZohoClient } from "../_shared/zoho.ts";
import { normalizarConfigReporte } from "../_shared/reporte/config.ts";
import { esLunes, lunesDe, sumar } from "../_shared/reporte/fechas.ts";
import { calcularReporte, type Reporte } from "../_shared/reporte/reporte.ts";
import { type Foto, fotoDe } from "../_shared/reporte/saldos.ts";
import { leerZoho } from "../_shared/reporte/zohoReporte.ts";

const VIGENCIA_MS = 15 * 60_000;
export type Respuesta = { reporte: Reporte; cache: boolean; aviso: string | null };

export function validarSemana(x: unknown): string {
  if (!esLunes(x)) throw new Error("Semana no válida: manda la fecha del lunes (YYYY-MM-DD).");
  return x;
}

export function usarCache(c: { leido_en: string } | null, cfgActualizado: string | null, ahora: Date, forzar: boolean): boolean {
  if (!c || forzar) return false;
  const t = Date.parse(c.leido_en);
  if (ahora.getTime() - t >= VIGENCIA_MS) return false;
  return !cfgActualizado || t > Date.parse(cfgActualizado);
}

const minutos = (desde: string, ahora: Date) => Math.max(0, Math.round((ahora.getTime() - Date.parse(desde)) / 60_000));

export async function generar(db: SupabaseClient, zoho: () => ZohoClient, ahora: Date, body: { semana?: unknown; forzar?: unknown }): Promise<Respuesta> {
  const lunes = validarSemana(body.semana);
  const [cfgR, cacheR] = await Promise.all([
    db.from("com_reporte_config").select("config,actualizado_at").eq("id", 1).maybeSingle(),
    db.from("com_reporte_semanal_cache").select("datos,leido_en").eq("semana", lunes).maybeSingle(),
  ]);
  if (cfgR.error) throw cfgR.error;
  const cfg = normalizarConfigReporte(cfgR.data?.config);
  const cache = cacheR.data as { datos: Reporte; leido_en: string } | null;
  if (usarCache(cache, cfgR.data?.actualizado_at ?? null, ahora, body.forzar === true)) return { reporte: cache!.datos, cache: true, aviso: null };

  const corte = hoyCdmx(ahora);
  const lectura = await leerZoho(zoho(), cfg, lunes);
  const fuentes = Object.values(lectura);
  if (fuentes.every((f) => !f.ok)) {
    const f0 = fuentes[0];
    const error = f0.ok ? "" : f0.error;
    if (cache) return { reporte: cache.datos, cache: true, aviso: `Datos de hace ${minutos(cache.leido_en, ahora)} min; ${error}` };
    throw new Error(error);
  }

  const semanaFoto = lunesDe(corte);
  const anterior = await db.from("com_reporte_saldos").select("externos,creditos,interna").eq("semana", sumar(semanaFoto, -7)).maybeSingle();
  const reporte = calcularReporte(lectura, cfg, lunes, corte, ahora.toISOString(), (anterior.data as Foto | null) ?? null);
  if (reporte.externos.ok) {
    await db.from("com_reporte_saldos").upsert({ semana: semanaFoto, ...fotoDe(reporte.externos.datos) }, { onConflict: "semana", ignoreDuplicates: true });
  }
  await db.from("com_reporte_semanal_cache").upsert({ semana: lunes, datos: reporte, leido_en: ahora.toISOString() }, { onConflict: "semana" });
  return { reporte, cache: false, aviso: null };
}
