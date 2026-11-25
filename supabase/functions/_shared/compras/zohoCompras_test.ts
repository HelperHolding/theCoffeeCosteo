// supabase/functions/_shared/compras/zohoCompras_test.ts
import { assertEquals } from "@std/assert";
import { detallar, pendientesDesde } from "./zohoCompras.ts";

const x = (id: string, mod: string) => ({ id, last_modified_time: mod });

Deno.test("pendientesDesde: solo posteriores a la marca, del más viejo al más nuevo", () => {
  const l = [x("c", "2026-11-25T10:00:00-0600"), x("b", "2026-11-24T10:00:00-0600"), x("a", "2026-11-20T10:00:00-0600")];
  assertEquals(pendientesDesde(l, "2026-11-21T00:00:00-0600").map((y) => y.id), ["b", "c"]);
  assertEquals(pendientesDesde(l, null).map((y) => y.id), ["a", "b", "c"]);
});

Deno.test("detallar: respeta el cupo, avanza la marca y avisa pendientes", async () => {
  const xs = ["1", "2", "3", "4", "5"].map((i) => x(i, `2026-11-2${i}T10:00:00-0600`));
  const pausas: number[] = [];
  const r = await detallar(xs, 3, async (y) => y.id, async (ms) => { pausas.push(ms); });
  assertEquals([r.filas, r.marca, r.pendientes, r.error], [["1", "2", "3"], "2026-11-23T10:00:00-0600", true, null]);
});

Deno.test("detallar: si un detalle falla, guarda lo anterior y la marca se queda en el último bueno", async () => {
  const xs = ["1", "2", "3"].map((i) => x(i, `2026-11-2${i}T10:00:00-0600`));
  const r = await detallar(xs, 60, async (y) => { if (y.id === "2") throw new Error("429"); return y.id; }, async () => {});
  assertEquals([r.filas, r.marca, r.pendientes], [["1"], "2026-11-21T10:00:00-0600", true]);
  assertEquals(r.error?.includes("429"), true);
});
