// Pagos de Sucursales propias (spec §5): exige el secreto del portal Y el JWT del usuario (x-usuario-jwt).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { autorizado } from "../_shared/acceso.ts";
import { admin } from "../_shared/db.ts";
import { zohoSucDesdeEnv } from "../_shared/zohoSuc.ts";
import { aplicar, facturasAbiertas, listarProveedores } from "../_shared/sucPagos.ts";
import { repoSupabase } from "../_shared/sucPagosRepo.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

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

Deno.serve(async (req) => {
  if (!autorizado(req)) return json({ ok: false, error: "No autorizado" }, 401);
  const u = await usuarioPagos(req.headers.get("x-usuario-jwt") ?? "");
  if (!u?.nivel) return json({ ok: false, error: "No tienes acceso a Pagos de Sucursales propias." }, 403);
  const body = await req.json().catch(() => ({}));
  try {
    const zoho = zohoSucDesdeEnv();
    if (body.accion === "proveedores") return json({ ok: true, proveedores: await listarProveedores(zoho) });
    if (body.accion === "facturas") {
      const ids = body.vendorIds;
      if (!Array.isArray(ids) || ids.length > 100 || !ids.every((x: unknown) => typeof x === "string" && x)) {
        return json({ ok: false, error: "vendorIds: lista de 1 a 100 ids." }, 400);
      }
      return json({ ok: true, facturas: await facturasAbiertas(zoho, ids) });
    }
    if (body.accion === "aplicar") {
      if (u.nivel !== "edicion" && u.nivel !== "desarrollador") {
        return json({ ok: false, error: "Tu acceso a Pagos es de solo lectura." }, 403);
      }
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: "id inválido." }, 400);
      return json({ ok: true, ...(await aplicar(repoSupabase(admin()), zoho, id, u.id)) });
    }
    return json({ ok: false, error: "Acción desconocida." }, 400);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error("[zoho-suc-pagos]", body.accion, m);
    return json({
      ok: false,
      error: m.startsWith("Falta el secreto") ? "Zoho de Sucursales GDL no está configurado." : "Zoho no respondió. Intenta de nuevo.",
    }, 502);
  }
});
