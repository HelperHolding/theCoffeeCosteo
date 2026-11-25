// Pagos de Sucursales propias (spec §5): conecta el manejador (manejar.ts) con Supabase, Zoho y Deno.serve.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { autorizado } from "../_shared/acceso.ts";
import { admin } from "../_shared/db.ts";
import { zohoSucDesdeEnv } from "../_shared/zohoSuc.ts";
import { repoSupabase } from "../_shared/sucPagosRepo.ts";
import { manejar } from "./manejar.ts";

/** Usuario y nivel de 'sucursales_pagos' según la base (suc_pagos_nivel ya exige rol Holding y perfil activo). */
async function usuarioPagos(jwt: string): Promise<{ id: string; nivel: string | null } | null> {
  if (!jwt) return null;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: u, error } = await db.auth.getUser(jwt);
  if (error || !u.user) return null;
  const { data: nivel, error: e2 } = await db.rpc("suc_pagos_nivel");
  if (e2) return null;
  return { id: u.user.id, nivel: (nivel as string | null) ?? null };
}

Deno.serve((req) =>
  manejar(req, { autorizado, usuarioPagos, zoho: zohoSucDesdeEnv, repo: () => repoSupabase(admin()) })
);
