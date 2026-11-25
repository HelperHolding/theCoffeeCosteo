// Manejador de zoho-suc-pagos (spec §5) con sus dependencias inyectadas: index.ts lo conecta a Deno.serve y las
// pruebas lo llaman con dobles. Exige el secreto del portal Y el JWT del usuario (x-usuario-jwt).
import { aplicar, facturasAbiertas, listarProveedores, type RepoPagos, type ZohoPagos } from "../_shared/sucPagos.ts";

export interface DepsPagos {
  autorizado: (req: Request) => boolean;
  /** Usuario y nivel de 'sucursales_pagos' según la base; null si el JWT falta o no es válido. */
  usuarioPagos: (jwt: string) => Promise<{ id: string; nivel: string | null } | null>;
  /** Cliente de Zoho de Sucursales GDL; lanza "Falta el secreto …" si no está configurado. */
  zoho: () => ZohoPagos;
  repo: () => RepoPagos;
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

export async function manejar(req: Request, deps: DepsPagos): Promise<Response> {
  if (!deps.autorizado(req)) return json({ ok: false, error: "No autorizado" }, 401);
  const u = await deps.usuarioPagos(req.headers.get("x-usuario-jwt") ?? "");
  if (!u?.nivel) return json({ ok: false, error: "No tienes acceso a Pagos de Sucursales propias." }, 403);
  const body = await req.json().catch(() => ({}));
  try {
    if (body.accion === "proveedores") return json({ ok: true, proveedores: await listarProveedores(deps.zoho()) });
    if (body.accion === "facturas") {
      const ids = body.vendorIds;
      if (!Array.isArray(ids) || ids.length > 100 || !ids.every((x: unknown) => typeof x === "string" && x)) {
        return json({ ok: false, error: "vendorIds: lista de 1 a 100 ids." }, 400);
      }
      return json({ ok: true, facturas: await facturasAbiertas(deps.zoho(), ids) });
    }
    if (body.accion === "aplicar") {
      if (u.nivel !== "edicion" && u.nivel !== "desarrollador") {
        return json({ ok: false, error: "Tu acceso a Pagos es de solo lectura." }, 403);
      }
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: "id inválido." }, 400);
      return json({ ok: true, ...(await aplicar(deps.repo(), deps.zoho(), id, u.id)) });
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
}
