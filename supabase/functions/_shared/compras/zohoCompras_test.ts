// supabase/functions/_shared/compras/zohoCompras_test.ts
import { assertEquals } from "@std/assert";
import { detallar, pendientesDesde } from "./zohoCompras.ts";

const x = (id: string, mod: string) => ({ id, last_modified_time: mod });
const SIN_MARCA = { t: null, ids: [] as string[] };

Deno.test("pendientesDesde: solo posteriores a la marca, del más viejo al más nuevo", () => {
  const l = [x("c", "2026-11-25T10:00:00-0600"), x("b", "2026-11-24T10:00:00-0600"), x("a", "2026-11-20T10:00:00-0600")];
  assertEquals(pendientesDesde(l, { t: "2026-11-21T00:00:00-0600", ids: [] }, "id").map((y) => y.id), ["b", "c"]);
  assertEquals(pendientesDesde(l, SIN_MARCA, "id").map((y) => y.id), ["a", "b", "c"]);
});

Deno.test("pendientesDesde: en el mismo segundo de la marca solo omite los ya procesados (empates)", () => {
  const T = "2026-11-24T10:00:00-0600";
  const l = [x("a", T), x("b", T), x("c", T), x("d", "2026-11-24T10:00:01-0600")];
  assertEquals(pendientesDesde(l, { t: T, ids: ["a", "b"] }, "id").map((y) => y.id), ["c", "d"]);
});

Deno.test("detallar: respeta el cupo, avanza la marca con los ids de ese segundo y avisa pendientes", async () => {
  const T = "2026-11-23T10:00:00-0600";
  const xs = [x("1", "2026-11-21T10:00:00-0600"), x("2", T), x("3", T), x("4", T), x("5", "2026-11-25T10:00:00-0600")];
  const r = await detallar(xs, 3, "id", async (y) => y.id, { pausa: async () => {} });
  assertEquals([r.filas, r.marca, r.pendientes, r.error], [["1", "2", "3"], { t: T, ids: ["2", "3"] }, true, null]);
});

Deno.test("detallar: si un detalle falla, guarda lo anterior y la marca se queda en el último bueno", async () => {
  const xs = ["1", "2", "3"].map((i) => x(i, `2026-11-2${i}T10:00:00-0600`));
  const r = await detallar(xs, 60, "id", async (y) => { if (y.id === "2") throw new Error("429"); return y.id; }, { pausa: async () => {} });
  assertEquals([r.filas, r.marca, r.pendientes], [["1"], { t: "2026-11-21T10:00:00-0600", ids: ["1"] }, true]);
  assertEquals(r.error?.includes("429"), true);
});

Deno.test("detallar: un documento que ya no existe en Zoho (404) se salta y la marca avanza", async () => {
  const xs = ["1", "2", "3"].map((i) => x(i, `2026-11-2${i}T10:00:00-0600`));
  const r = await detallar(xs, 60, "id", async (y) => {
    if (y.id === "2") throw Object.assign(new Error("Resource does not exist"), { status: 404 });
    return y.id;
  }, { pausa: async () => {} });
  assertEquals([r.filas, r.marca?.t, r.pendientes, r.error, r.omitidos], [["1", "3"], "2026-11-23T10:00:00-0600", false, null, ["2"]]);
});

Deno.test("detallar: deja de leer al pasar el tiempo límite y avisa pendientes", async () => {
  let ahora = 0;
  const xs = ["1", "2", "3", "4"].map((i) => x(i, `2026-11-2${i}T10:00:00-0600`));
  const r = await detallar(xs, 60, "id", async (y) => { ahora += 30_000; return y.id; }, { pausa: async () => {}, limite: 50_000, reloj: () => ahora });
  assertEquals([r.filas, r.pendientes], [["1", "2"], true]);
});
