import { assertEquals } from "@std/assert";
import { manejarMinimo } from "./proveedorMinimo.ts";

function fakeDb(existe: boolean, minimoCampo?: string) {
  const log: string[] = [];
  const db = {
    from(tabla: string) {
      const q: Record<string, unknown> = {};
      let accion = "";
      q.select = () => { if (!accion) accion = "select"; return q; };
      q.eq = () => q;
      q.not = q.order = q.limit = () => q;
      q.update = (v: unknown) => { accion = "update"; log.push(`valor:${JSON.stringify(v)}`); return q; };
      q.insert = () => { accion = "insert"; return q; };
      q.maybeSingle = q.single = () => q;
      q.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
        log.push(`${tabla}:${accion}`);
        const data = accion === "select" ? (tabla === "com_plan_config" ? { config: {} } : tabla === "com_sync_log" ? (minimoCampo ? { resumen: { minimoCampo } } : null) : existe ? { vendor_id: "V1", minimo_compra: 0 } : null) : null;
        return Promise.resolve({ data, error: null }).then(ok, ko);
      };
      return q;
    },
  };
  return { db: db as never, log };
}

Deno.test("monto inválido → 400 y no toca la base", async () => {
  const f = fakeDb(true);
  const r = await manejarMinimo(f.db, () => ({}) as never, { vendor_id: "V1", monto: "abc", por: "x" });
  assertEquals(r.status, 400);
  assertEquals((await r.json()).error, "Monto inválido");
  assertEquals(f.log, []);
});

Deno.test("proveedor inexistente → 404 sin guardar nada", async () => {
  const f = fakeDb(false);
  const r = await manejarMinimo(f.db, () => ({}) as never, { vendor_id: "NOPE", monto: 10, por: "x" });
  assertEquals(r.status, 404);
  assertEquals(f.log.some((l) => l.endsWith(":update")), false);
});

Deno.test("Zoho falla → queda guardado y responde enviado=false con el error", async () => {
  const f = fakeDb(true);
  const r = await manejarMinimo(f.db, () => ({ put: () => Promise.reject(new Error("caído")) }) as never, { vendor_id: "V1", monto: "1,500", por: "ana" });
  assertEquals(r.status, 200);
  assertEquals(await r.json(), { ok: true, enviado: false, error: "caído" });
});

Deno.test("Zoho ok → enviado=true", async () => {
  const f = fakeDb(true);
  const r = await manejarMinimo(f.db, () => ({ put: () => Promise.resolve({ contact: { custom_field_hash: { cf_minimo_de_compra_mxn: 10 } } }) }) as never, { vendor_id: "V1", monto: 10, por: "ana" });
  assertEquals(await r.json(), { ok: true, enviado: true });
});

Deno.test("el campo falta según el último sync: no hay PUT, queda pendiente con el aviso", async () => {
  const f = fakeDb(true, "falta");
  let puts = 0;
  const r = await manejarMinimo(f.db, () => ({ put: () => { puts++; return Promise.resolve({}); } }) as never, { vendor_id: "V1", monto: 10, por: "ana" });
  assertEquals(await r.json(), { ok: true, enviado: false, error: "Falta crear el campo en Zoho" });
  assertEquals(puts, 0);
  assertEquals(f.log.includes(`valor:{"minimo_error":"Falta crear el campo en Zoho"}`), true);
  assertEquals(f.log.some((l) => l.includes("minimo_pendiente\":false")), false);
});

Deno.test("Zoho responde sin el valor: enviado=false y no se marca sincronizado", async () => {
  const f = fakeDb(true, "ok");
  const r = await manejarMinimo(f.db, () => ({ put: () => Promise.resolve({ contact: {} }) }) as never, { vendor_id: "V1", monto: 10, por: "ana" });
  assertEquals(await r.json(), { ok: true, enviado: false, error: "Zoho no guardó el valor (¿existe el campo?)" });
  assertEquals(f.log.some((l) => l.includes("minimo_pendiente\":false")), false);
});
