// supabase/functions/zoho-reporte-semanal/servicio.ts
import type { SupabaseClient } from "../_shared/db.ts";
import { hoyCdmx } from "../_shared/fechas.ts";
import type { ZohoClient } from "../_shared/zoho.ts";
import { normalizarConfigReporte } from "../_shared/reporte/config.ts";
import { esLunes, lunesDe, sumar } from "../_shared/reporte/fechas.ts";
import { calcularReporte, type Lectura, type Reporte } from "../_shared/reporte/reporte.ts";
import { type Foto, fotoDe } from "../_shared/reporte/saldos.ts";
import { leerZoho } from "../_shared/reporte/zohoReporte.ts";

const VIGENCIA_MS = 15 * 60_000;
const ENFRIAMIENTO_MS = 2 * 60_000; // «Actualizar» no relee Zoho si la copia tiene menos de esto
export type Respuesta = { reporte: Reporte; cache: boolean; aviso: string | null };

export function validarSemana(x: unknown): string {
  if (!esLunes(x)) throw new Error("Semana no válida: manda la fecha del lunes (YYYY-MM-DD).");
  return x;
}

export function usarCache(c: { leido_en: string } | null, cfgActualizado: string | null, ahora: Date, forzar: boolean): boolean {
  if (!c) return false;
  const t = Date.parse(c.leido_en);
  if (forzar && ahora.getTime() - t >= ENFRIAMIENTO_MS) return false;
  if (ahora.getTime() - t >= VIGENCIA_MS) return false;
  return !cfgActualizado || t > Date.parse(cfgActualizado);
}

const minutos = (desde: string, ahora: Date) => Math.max(0, Math.round((ahora.getTime() - Date.parse(desde)) / 60_000));
export function hace(desde: string, ahora: Date): string {
  const m = minutos(desde, ahora);
  if (m >= 48 * 60) return `hace ${Math.floor(m / 1440)} días`;
  if (m >= 120) return `hace ${Math.floor(m / 60)} h`;
  return `hace ${m} min`;
}

type CacheFila = { datos: Reporte; leido_en: string };
export type Decision =
  | { usar: "cache"; aviso: string }
  | { usar: "nuevo"; guardar: boolean; aviso: string | null }
  | { usar: "error"; error: string };

/** Qué hacer con una lectura de Zoho: la caché solo se sobrescribe cuando todas las fuentes respondieron. */
export function decidirLectura(l: Lectura, cache: CacheFila | null, ahora: Date): Decision {
  const fuentes = Object.values(l);
  const falla = fuentes.find((f) => !f.ok);
  if (!falla || falla.ok) return { usar: "nuevo", guardar: true, aviso: null };
  if (cache) return { usar: "cache", aviso: `Datos de ${hace(cache.leido_en, ahora)}; ${falla.error}` };
  if (fuentes.every((f) => !f.ok)) return { usar: "error", error: falla.error };
  return { usar: "nuevo", guardar: false, aviso: "Algunas secciones no se pudieron leer de Zoho." };
}

export async function generar(db: SupabaseClient, zoho: () => ZohoClient, ahora: Date, body: { semana?: unknown; forzar?: unknown }): Promise<Respuesta> {
  const lunes = validarSemana(body.semana);
  const [cfgR, cacheR] = await Promise.all([
    db.from("com_reporte_config").select("config,actualizado_at").eq("id", 1).maybeSingle(),
    db.from("com_reporte_semanal_cache").select("datos,leido_en").eq("semana", lunes).maybeSingle(),
  ]);
  if (cfgR.error) throw cfgR.error;
  if (cacheR.error) console.error("zoho-reporte-semanal: no se pudo leer la caché", cacheR.error);
  const cfg = normalizarConfigReporte(cfgR.data?.config);
  const cache = cacheR.error ? null : (cacheR.data as CacheFila | null);
  if (usarCache(cache, cfgR.data?.actualizado_at ?? null, ahora, body.forzar === true)) return { reporte: cache!.datos, cache: true, aviso: null };

  const corte = hoyCdmx(ahora);
  const lectura = await leerZoho(zoho(), cfg, lunes);
  const decision = decidirLectura(lectura, cache, ahora);
  if (decision.usar === "error") throw new Error(decision.error);
  if (decision.usar === "cache") return { reporte: cache!.datos, cache: true, aviso: decision.aviso };

  const semanaFoto = lunesDe(corte);
  const anterior = await db.from("com_reporte_saldos").select("externos,creditos,interna").eq("semana", sumar(semanaFoto, -7)).maybeSingle();
  if (anterior.error) console.error("zoho-reporte-semanal: no se pudo leer la foto de saldos anterior", anterior.error);
  const reporte = calcularReporte(lectura, cfg, lunes, corte, ahora.toISOString(), anterior.error ? null : ((anterior.data as Foto | null) ?? null));
  if (reporte.externos.ok) {
    const r = await db.from("com_reporte_saldos").upsert({ semana: semanaFoto, ...fotoDe(reporte.externos.datos) }, { onConflict: "semana", ignoreDuplicates: true });
    if (r.error) console.error("zoho-reporte-semanal: no se pudo guardar la foto de saldos", r.error);
  }
  if (decision.guardar) {
    const r = await db.from("com_reporte_semanal_cache").upsert({ semana: lunes, datos: reporte, leido_en: ahora.toISOString() }, { onConflict: "semana" });
    if (r.error) console.error("zoho-reporte-semanal: no se pudo guardar la caché", r.error);
  }
  return { reporte, cache: false, aviso: decision.aviso };
}
