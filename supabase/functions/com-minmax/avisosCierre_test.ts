import { assertEquals, assertStringIncludes } from "@std/assert";
import { avisarCierres, correoCierresHtml, porAvisar } from "./avisosCierre.ts";
import type { ResumenCierre } from "./pagos.ts";

const HOY = "2026-11-10";
const cierre = (o: Partial<ResumenCierre> = {}): ResumenCierre => ({
  id: 1, vendor_id: "v1", vendor_name: "Prov <A>", ini: "2026-12-15", fin: "2026-12-30", u: "2026-11-30",
  skus_afectados: 3, monto_adelanto: 1500, aviso7_at: null, aviso0_at: null, ...o,
});
const ids = (cs: ResumenCierre[]) => cs.map((c) => c.id);

Deno.test("porAvisar: U en 8 días no avisa; en 7 avisa siete", () => {
  assertEquals(porAvisar([cierre({ u: "2026-11-18" })], HOY), { siete: [], ultimo: [] });
  const r = porAvisar([cierre({ u: "2026-11-17" })], HOY);
  assertEquals(ids(r.siete), [1]);
  assertEquals(r.ultimo, []);
});

Deno.test("porAvisar: U hoy con aviso7 marcado solo da ultimo", () => {
  const r = porAvisar([cierre({ u: HOY, aviso7_at: "x" })], HOY);
  assertEquals(r.siete, []);
  assertEquals(ids(r.ultimo), [1]);
});

Deno.test("porAvisar: U pasado antes de ini sin avisos da ambos", () => {
  const r = porAvisar([cierre({ u: "2026-11-05" })], HOY);
  assertEquals(ids(r.siete), [1]);
  assertEquals(ids(r.ultimo), [1]);
});

Deno.test("porAvisar: hoy >= ini o u null no avisa", () => {
  assertEquals(porAvisar([cierre({ ini: HOY, u: "2026-11-01" })], HOY), { siete: [], ultimo: [] });
  assertEquals(porAvisar([cierre({ u: null })], HOY), { siete: [], ultimo: [] });
});

Deno.test("correoCierresHtml: escapa, fechas en español y Ya no alcanza", () => {
  const h = correoCierresHtml({ hoy: HOY, siete: [cierre()], ultimo: [cierre({ id: 2, u: "2026-11-05" })] });
  assertStringIncludes(h, "Prov &lt;A&gt;");
  assertStringIncludes(h, "15 dic");
  assertStringIncludes(h, "30 nov");
  assertStringIncludes(h, "Ya no alcanza");
});

function dbFalso() {
  const updates: { data: Record<string, unknown>; ids: number[] }[] = [];
  const db = {
    from: (_t: string) => ({
      update: (data: Record<string, unknown>) => ({
        in: (_c: string, v: number[]) => { updates.push({ data, ids: v }); return Promise.resolve({ error: null }); },
      }),
    }),
  };
  // deno-lint-ignore no-explicit-any
  return { db: db as any, updates };
}

Deno.test("avisarCierres: envío fallido no marca nada", async () => {
  const { db, updates } = dbFalso();
  const r = await avisarCierres(db, ["a@x.com"], HOY, [cierre({ u: "2026-11-15" })], () => Promise.resolve(false));
  assertEquals(updates.length, 0);
  assertEquals(r.enviados, 0);
});

Deno.test("avisarCierres: envío exitoso marca las columnas correctas", async () => {
  const { db, updates } = dbFalso();
  let asunto = "";
  const cs = [cierre({ id: 1, u: "2026-11-15" }), cierre({ id: 2, u: "2026-11-10", aviso7_at: "x" })];
  const r = await avisarCierres(db, ["a@x.com"], HOY, cs, (_to, a) => { asunto = a; return Promise.resolve(true); });
  assertEquals(asunto, "Proveedores sin stock: 2 cierre(s) por atender");
  assertEquals(r.enviados, 1);
  assertEquals(updates.map((u) => [Object.keys(u.data)[0], u.ids]), [["aviso7_at", [1]], ["aviso0_at", [2]]]);
});

Deno.test("avisarCierres: sin pendientes no envía", async () => {
  const { db } = dbFalso();
  let llamado = false;
  const r = await avisarCierres(db, ["a@x.com"], HOY, [cierre({ u: "2026-12-30" })], () => { llamado = true; return Promise.resolve(true); });
  assertEquals(llamado, false);
  assertEquals(r.enviados, 0);
});
