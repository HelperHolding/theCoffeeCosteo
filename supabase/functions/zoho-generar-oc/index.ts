import { autorizado } from "../_shared/acceso.ts";
import { admin, lanzar, registrar } from "../_shared/db.ts";
import { zohoDesdeEnv } from "../_shared/zoho.ts";
import { generar } from "./generar.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey" } });
  if (!autorizado(req)) return new Response(JSON.stringify({ ok: false, error: "No autorizado" }), { status: 401, headers: { "Content-Type": "application/json" } });
  const body = await req.json().catch(() => ({}));
  const origen = body.origen === "cron" ? "cron" : "manual";
  const modo = body.modo === "real" || body.modo === "simulacion" ? body.modo : undefined;
  const db = admin();
  return lanzar(() => registrar(db, "zoho-generar-oc", () =>
    generar(db, zohoDesdeEnv, { origen, modo })));
});
