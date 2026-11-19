import { assertEquals, assertStringIncludes } from "@std/assert";
import { avisadoHoy, avisarBorradores, borradoresViejos, correoBorradoresHtml, type LineaBorrador } from "./avisoBorradores.ts";

const HOY = "2026-11-19";
const linea = (o: Partial<LineaBorrador> = {}): LineaBorrador => ({
  zoho_po_id: "p1", po_number: "COM-OC-01500", vendor_name: "Prov <A>", fecha_oc: "2026-11-17",
  cantidad: 10, precio: 25, es_auto: true, ...o,
});

Deno.test("borradoresViejos: agrupa por OC, suma el monto y deja solo los de 2 días o más", () => {
  const r = borradoresViejos([
    linea(), linea({ cantidad: 2, precio: 50 }), // misma OC: 10×25 + 2×50
    linea({ zoho_po_id: "p2", po_number: "COM-OC-01501", fecha_oc: "2026-11-18" }), // 1 día: todavía no
    linea({ zoho_po_id: "p3", po_number: "COM-OC-01490", fecha_oc: "2026-11-12", es_auto: false, precio: null }),
  ], HOY);
  assertEquals(r, [
    { po: "p3", numero: "COM-OC-01490", proveedor: "Prov <A>", fecha: "2026-11-12", dias: 7, monto: 0, auto: false },
    { po: "p1", numero: "COM-OC-01500", proveedor: "Prov <A>", fecha: "2026-11-17", dias: 2, monto: 350, auto: true },
  ]);
});

Deno.test("borradoresViejos: sin fecha de OC no se puede saber su edad y no avisa", () => {
  assertEquals(borradoresViejos([linea({ fecha_oc: null })], HOY), []);
});

Deno.test("correoBorradoresHtml: escapa, fecha en español, días y monto", () => {
  const h = correoBorradoresHtml(HOY, borradoresViejos([linea()], HOY));
  assertStringIncludes(h, "Prov &lt;A&gt;");
  assertStringIncludes(h, "COM-OC-01500");
  assertStringIncludes(h, "17 nov");
  assertStringIncludes(h, "$250.00");
  assertStringIncludes(h, ">2<");
  assertStringIncludes(h, "Automática");
});

Deno.test("avisarBorradores: con borradores viejos manda un correo a los destinatarios", async () => {
  const envios: { to: string[]; asunto: string }[] = [];
  const r = await avisarBorradores(["compras@x.com"], HOY, [linea(), linea({ zoho_po_id: "p2", fecha_oc: "2026-11-10" })],
    (to, asunto) => { envios.push({ to, asunto }); return Promise.resolve(true); });
  assertEquals(envios, [{ to: ["compras@x.com"], asunto: "OCs en borrador sin enviar: 2 con 2 días o más" }]);
  assertEquals(r, { enviados: 1, borradores: 2 });
});

Deno.test("avisarBorradores: sin borradores viejos no envía; sin destinatarios o con envío fallido lo reporta", async () => {
  let llamado = false;
  const enviar = () => { llamado = true; return Promise.resolve(true); };
  assertEquals(await avisarBorradores(["a@x.com"], HOY, [linea({ fecha_oc: HOY })], enviar), { enviados: 0, borradores: 0 });
  assertEquals(llamado, false);
  assertEquals(await avisarBorradores([], HOY, [linea()], enviar), { enviados: 0, borradores: 1, error: "sin destinatarios de alertas" });
  assertEquals(await avisarBorradores(["a@x.com"], HOY, [linea()], () => Promise.resolve(false)),
    { enviados: 0, borradores: 1, error: "falló el envío del correo" });
});

Deno.test("avisadoHoy: busca en la bitácora un com-minmax de hoy (CDMX) que ya mandó el correo", async () => {
  const filtros: unknown[][] = [];
  const q = {
    select: (c: string) => { filtros.push(["select", c]); return q; },
    eq: (c: string, v: unknown) => { filtros.push(["eq", c, v]); return q; },
    gte: (c: string, v: unknown) => { filtros.push(["gte", c, v]); return q; },
    limit: (k: number) => { filtros.push(["limit", k]); return Promise.resolve({ data: [{ id: 9 }], error: null }); },
  };
  // deno-lint-ignore no-explicit-any
  const db = { from: (t: string) => { filtros.push(["from", t]); return q; } } as any;
  assertEquals(await avisadoHoy(db, HOY), true);
  assertEquals(filtros, [
    ["from", "com_sync_log"], ["select", "id"], ["eq", "proceso", "com-minmax"], ["eq", "ok", true],
    ["gte", "inicio", "2026-11-19T06:00:00.000Z"], ["eq", "resumen->borradores->>enviados", "1"], ["limit", 1],
  ]);
});
