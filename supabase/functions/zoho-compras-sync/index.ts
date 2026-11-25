// supabase/functions/zoho-compras-sync/index.ts
import { autorizado } from "../_shared/acceso.ts";
import { admin, lanzar, registrar, responder } from "../_shared/db.ts";
import { zohoDesdeEnv } from "../_shared/zoho.ts";
import { avisarRachaFallas, sincronizar } from "./servicio.ts";

// Solo lectura de Zoho: OCs, recepciones y facturas para el tablero de compras (spec compras §2).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return responder(null);
  if (!autorizado(req)) return responder({ ok: false, error: "No autorizado" }, 401);
  const body = await req.json().catch(() => ({}));
  const db = admin();
  return lanzar(() => registrar(db, "zoho-compras-sync", () =>
    sincronizar(db, zohoDesdeEnv({ soloLectura: true, tokenVar: "ZOHO_REPORTE_REFRESH_TOKEN" }), new Date(), body?.forzar === true))
    .catch(async (e) => {
      // Dos fallas seguidas: aviso por correo (una sola vez por racha), como zoho-sync.
      await avisarRachaFallas(db, String((e as Error)?.message ?? e));
      throw e;
    }));
});
