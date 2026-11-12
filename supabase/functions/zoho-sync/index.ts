import { admin, lanzar, registrar } from "../_shared/db.ts";
import { zohoDesdeEnv } from "../_shared/zoho.ts";
import { avisarRachaFallas, sincronizar, syncReciente } from "./sync.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey" } });
  const db = admin();
  // Si otro sync exitoso acaba de terminar, no se llama a Zoho (protege la cuota de la API).
  return lanzar(async () => (await syncReciente(db)) ? { omitida: "sync reciente" }
    : registrar(db, "zoho-sync", () => sincronizar(db, zohoDesdeEnv())).catch(async (e) => {
      // Dos fallas seguidas: aviso por correo (una sola vez por racha). Luego se relanza como siempre.
      await avisarRachaFallas(db, String((e as Error)?.message ?? e));
      throw e;
    }));
});
