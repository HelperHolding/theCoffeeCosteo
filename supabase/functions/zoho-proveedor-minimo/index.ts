import { admin } from "../_shared/db.ts";
import { zohoDesdeEnv } from "../_shared/zoho.ts";
import { manejarMinimo } from "./proveedorMinimo.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey" } });
  const body = await req.json().catch(() => ({}));
  return manejarMinimo(admin(), zohoDesdeEnv, body ?? {});
});
