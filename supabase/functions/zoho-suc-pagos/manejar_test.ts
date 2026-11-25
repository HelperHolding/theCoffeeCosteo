import { assertEquals } from "@std/assert";
import type { RepoPagos, ZohoPagos } from "../_shared/sucPagos.ts";
import { type DepsPagos, manejar } from "./manejar.ts";

const pedir = (body: unknown, jwt = "jwt-valido") =>
  new Request("http://x/zoho-suc-pagos", {
    method: "POST",
    headers: { "x-usuario-jwt": jwt, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

function deps(o: { autorizado?: boolean; nivel?: string | null; sinUsuario?: boolean; zohoFalla?: string } = {}) {
  const uso = { zoho: 0, repo: 0, transferencia: 0 };
  const zoho = {
    async listAll<T>() { return [{ contact_id: "v1", contact_name: "OH LALA" }] as T[]; },
  } as unknown as ZohoPagos;
  const repo = {
    async transferencia() { uso.transferencia++; return null; },
  } as unknown as RepoPagos;
  const d: DepsPagos = {
    autorizado: () => o.autorizado ?? true,
    usuarioPagos: async (jwt) => (o.sinUsuario || jwt !== "jwt-valido" ? null : { id: "u1", nivel: o.nivel === undefined ? "edicion" : o.nivel }),
    zoho: () => {
      uso.zoho++;
      if (o.zohoFalla) throw new Error(o.zohoFalla);
      return zoho;
    },
    repo: () => { uso.repo++; return repo; },
  };
  return { d, uso };
}

const leer = async (r: Response) => ({ status: r.status, body: await r.json() });

Deno.test("sin el secreto del portal responde 401 y no consulta al usuario", async () => {
  const { d, uso } = deps({ autorizado: false });
  let consultado = false;
  d.usuarioPagos = async () => { consultado = true; return { id: "u1", nivel: "edicion" }; };
  const r = await leer(await manejar(pedir({ accion: "proveedores" }), d));
  assertEquals(r, { status: 401, body: { ok: false, error: "No autorizado" } });
  assertEquals(consultado, false);
  assertEquals(uso.zoho, 0);
});

Deno.test("sin JWT, con JWT inválido o sin nivel responde 403", async () => {
  for (const [o, jwt] of [[{}, ""], [{}, "otro"], [{ sinUsuario: true }, "jwt-valido"], [{ nivel: null }, "jwt-valido"]] as const) {
    const { d, uso } = deps(o);
    const r = await leer(await manejar(pedir({ accion: "proveedores" }, jwt), d));
    assertEquals(r.status, 403);
    assertEquals(r.body.error, "No tienes acceso a Pagos de Sucursales propias.");
    assertEquals(uso.zoho, 0);
  }
});

Deno.test("nivel lectura puede consultar pero no aplicar", async () => {
  const { d, uso } = deps({ nivel: "lectura" });
  const r = await leer(await manejar(pedir({ accion: "aplicar", id: 1 }), d));
  assertEquals(r, { status: 403, body: { ok: false, error: "Tu acceso a Pagos es de solo lectura." } });
  assertEquals(uso, { zoho: 0, repo: 0, transferencia: 0 });
  const p = await leer(await manejar(pedir({ accion: "proveedores" }), d));
  assertEquals(p, { status: 200, body: { ok: true, proveedores: [{ id: "v1", nombre: "OH LALA" }] } });
});

Deno.test("nivel edicion aplica (llega al núcleo con el repo y Zoho inyectados)", async () => {
  const { d, uso } = deps({ nivel: "edicion" });
  const r = await leer(await manejar(pedir({ accion: "aplicar", id: 7 }), d));
  assertEquals(r, { status: 200, body: { ok: true, estado: "error", mensaje: "La transferencia no existe." } });
  assertEquals(uso.transferencia, 1);
});

Deno.test("id inválido y acción desconocida responden 400", async () => {
  for (const id of [0, -1, 1.5, "x", undefined]) {
    const { d, uso } = deps();
    const r = await leer(await manejar(pedir({ accion: "aplicar", id }), d));
    assertEquals(r, { status: 400, body: { ok: false, error: "id inválido." } });
    assertEquals(uso.transferencia, 0);
  }
  const { d } = deps();
  assertEquals(await leer(await manejar(pedir({ accion: "borrar" }), d)), {
    status: 400, body: { ok: false, error: "Acción desconocida." },
  });
  assertEquals((await manejar(pedir({ accion: "facturas", vendorIds: "v1" }), d)).status, 400);
});

Deno.test("Zoho sin configurar responde 502 con el mensaje genérico, sin el nombre del secreto", async () => {
  const { d } = deps({ zohoFalla: "Falta el secreto ZOHO_SUC_REFRESH_TOKEN" });
  const original = console.error;
  console.error = () => {};
  try {
    const r = await leer(await manejar(pedir({ accion: "proveedores" }), d));
    assertEquals(r, { status: 502, body: { ok: false, error: "Zoho de Sucursales GDL no está configurado." } });
    const { d: d2 } = deps({ zohoFalla: "timeout" });
    const r2 = await leer(await manejar(pedir({ accion: "proveedores" }), d2));
    assertEquals(r2, { status: 502, body: { ok: false, error: "Zoho no respondió. Intenta de nuevo." } });
  } finally {
    console.error = original;
  }
});
