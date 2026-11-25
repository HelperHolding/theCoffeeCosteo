// supabase/functions/zoho-reporte-semanal/index.ts
import { autorizado } from "../_shared/acceso.ts";
import { admin, lanzar, responder } from "../_shared/db.ts";
import { zohoDesdeEnv } from "../_shared/zoho.ts";
import { generar } from "./servicio.ts";

// Solo lectura: arma el reporte semanal desde Zoho Books (spec 2026-11-25-reporte-semanal-comercializadora-design.md).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return responder(null);
  if (!autorizado(req)) return responder({ ok: false, error: "No autorizado" }, 401);
  const body = await req.json().catch(() => ({}));
  return lanzar(() => generar(admin(), zohoDesdeEnv, new Date(), body));
});
