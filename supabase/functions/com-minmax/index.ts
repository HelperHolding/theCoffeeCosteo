import { admin, lanzar, registrar } from "../_shared/db.ts";
import { recalcular } from "./minmax.ts";

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, apikey" } });
  const db = admin();
  return lanzar(() => registrar(db, "com-minmax", () => recalcular(db)));
});
