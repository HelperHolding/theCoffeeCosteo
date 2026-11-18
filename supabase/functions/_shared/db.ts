import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
export type { SupabaseClient };

export type PlanCfg = {
  seg: { dias: number }; consumo: { ventana: number };
  aper: { antelacion: number; vencida_max: number };
  compra: { lt_default: number; excluir_cafe: boolean; min_prov: "consolidar" | "avisar"; min_ventana_dias: number };
  inv: { yulius: boolean };
  auto: { modo: "simulacion" | "real"; cobertura_dias: number; max_edad_sync_horas: number; yulius_alerta_dias: number; correos: string[];
    pagos_horizonte: number; pagos_base: "llegada" | "oc"; sync_catalogo: "aplicar" | "registrar"; zoho_cf_minimo: string };
};

export function admin(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

/** Documento de configuración guardado tal cual (com_plan_config.config). */
// deno-lint-ignore no-explicit-any
export async function leerConfig(db: SupabaseClient): Promise<any> {
  const { data, error } = await db.from("com_plan_config").select("config").eq("id", 1).single();
  if (error) throw error;
  return data.config ?? {};
}

export async function cargarConfig(db: SupabaseClient): Promise<PlanCfg> {
  return aPlanCfg(await leerConfig(db));
}

const finitoO = (x: unknown, def: number) => { const n = Number(x ?? def); return Number.isFinite(n) ? n : def; };

// deno-lint-ignore no-explicit-any
export function aPlanCfg(c: any): PlanCfg {
  return {
    seg: { dias: Number(c.seg?.dias ?? 10) },
    consumo: { ventana: Number(c.consumo?.ventana ?? 30) },
    aper: { antelacion: Number(c.aper?.antelacion ?? 30), vencida_max: Number(c.aper?.vencida_max ?? 45) },
    compra: { lt_default: Number(c.compra?.lt_default ?? 7), excluir_cafe: c.compra?.excluir_cafe !== false,
      min_prov: c.compra?.min_prov === "avisar" ? "avisar" : "consolidar", min_ventana_dias: finitoO(c.compra?.min_ventana_dias, 14) },
    inv: { yulius: c.inv?.yulius !== false },
    auto: {
      modo: c.auto?.modo === "real" ? "real" : "simulacion",
      cobertura_dias: Number(c.auto?.cobertura_dias ?? 15),
      max_edad_sync_horas: Number(c.auto?.max_edad_sync_horas ?? 2),
      yulius_alerta_dias: Number(c.auto?.yulius_alerta_dias ?? 15),
      correos: Array.isArray(c.auto?.correos) ? c.auto.correos : [],
      pagos_horizonte: Math.min(180, Math.max(30, finitoO(c.auto?.pagos_horizonte, 90))),
      pagos_base: c.auto?.pagos_base === "oc" ? "oc" : "llegada",
      sync_catalogo: c.auto?.sync_catalogo === "aplicar" ? "aplicar" : "registrar",
      zoho_cf_minimo: typeof c.auto?.zoho_cf_minimo === "string" && c.auto.zoho_cf_minimo ? c.auto.zoho_cf_minimo : "cf_minimo_de_compra_mxn",
    },
  };
}

export async function registrar<T>(db: SupabaseClient, proceso: string, fn: () => Promise<T>): Promise<T> {
  const { data } = await db.from("com_sync_log").insert({ proceso }).select("id").single();
  try {
    const r = await fn();
    await db.from("com_sync_log").update({ fin: new Date().toISOString(), ok: true, resumen: r }).eq("id", data!.id);
    return r;
  } catch (e) {
    await db.from("com_sync_log").update({ fin: new Date().toISOString(), ok: false, error: String((e as Error).message ?? e) }).eq("id", data!.id);
    throw e;
  }
}

export async function todo<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await q(i, i + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** ¿El error de la base es "columna inexistente" (migración sin aplicar)? Postgres 42703 o PostgREST PGRST204. */
export function esColumnaFaltante(e: unknown): boolean {
  const x = e as { code?: string; message?: string } | null | undefined;
  return x?.code === "42703" || x?.code === "PGRST204" || /column .* does not exist|could not find the .* column/i.test(x?.message ?? "");
}

export function responder(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, content-type, apikey" },
  });
}

export async function lanzar<T>(fn: () => Promise<T>): Promise<Response> {
  try { return responder({ ok: true, ...(await fn() as object) }); }
  catch (e) { return responder({ ok: false, error: String((e as Error).message ?? e) }, 500); }
}
