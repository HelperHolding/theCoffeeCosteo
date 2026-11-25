// supabase/functions/_shared/reporte/atencion_test.ts
import { assertEquals } from "@std/assert";
import { calcularAperturas, calcularAtencion, calcularNotas, casosAtencion } from "./atencion.ts";
import { configReporteDef } from "./config.ts";
import type { NotaCredito, Ov } from "./tipos.ts";

const ov = (o: Partial<Ov>): Ov => ({ id: o.numero ?? "1", numero: "OV-1", fecha: "2026-11-17", cliente: "MAGNOLIA GC", sucursal: "Puerta Paraíso", tipoEnvio: "Ordinario", incidencia: "Sin stock - Pedido incompleto", resolucion: "En Proceso", estado: "invoiced", estadoEnvio: "fulfilled", ...o });
const cfg = configReporteDef();
const L = "2026-11-16";

Deno.test("casosAtencion: abiertas de cualquier semana + resueltas de esta semana", () => {
  const c = casosAtencion([
    ov({ numero: "A" }), ov({ numero: "B", fecha: "2026-11-03" }), ov({ numero: "C", resolucion: "Resuelto" }),
    ov({ numero: "D", fecha: "2026-11-03", resolucion: "Resuelto" }), ov({ numero: "E", incidencia: "" }),
    ov({ numero: "F", cliente: "DODO PIZZA" }),
  ], cfg, L);
  assertEquals(c.map((o) => o.numero), ["A", "B", "C"]);
});

Deno.test("calcularAtencion: separa propias/externos y agrupa por semana, más reciente primero", () => {
  const a = calcularAtencion([
    ov({ numero: "A" }), ov({ numero: "B", fecha: "2026-11-10" }),
    ov({ numero: "C", cliente: "SUCURSALES THE COFFEE-NAMORA", sucursal: "Namora", resolucion: "Resuelto", incidencia: "Pedido Incompleto" }),
  ], { A: "Faltó vaso 8 oz", C: "Se corrigió" }, cfg, L);
  assertEquals(a.externos.abiertas, 2);
  assertEquals(a.externos.semanas.map((s) => [s.lunes, s.casos.map((c) => c.ov)]), [["2026-11-16", ["A"]], ["2026-11-09", ["B"]]]);
  assertEquals(a.externos.semanas[0].casos[0].descripcion, "Faltó vaso 8 oz");
  assertEquals(a.externos.semanas[0].casos[0].cliente, "Magnolia GC");
  assertEquals(a.propias.resueltasSemana, 1);
  assertEquals(a.propias.abiertas, 0);
});

Deno.test("calcularNotas: las de la semana sin anuladas", () => {
  const n = (o: Partial<NotaCredito>): NotaCredito => ({ numero: "CN", fecha: "2026-11-18", cliente: "X", sucursal: "", total: 10, estado: "open", descripcion: "", ...o });
  const r = calcularNotas([n({ total: 196.04 }), n({ total: 1, estado: "void" }), n({ total: 5, fecha: "2026-11-23" })], L);
  assertEquals(r.filas.length, 1);
  assertEquals(r.total, 196.04);
});

Deno.test("calcularAperturas: sin enviar o de la semana", () => {
  const r = calcularAperturas([
    ov({ numero: "A", tipoEnvio: "Apertura", fecha: "2026-11-24", incidencia: "" }),
    ov({ numero: "B", tipoEnvio: "Apertura", fecha: "2026-10-01", incidencia: "" }),
    ov({ numero: "C", tipoEnvio: "Apertura", fecha: "2026-11-10", incidencia: "" }),
    ov({ numero: "D", incidencia: "" }),
  ], [{ ov: "B", fecha: "2026-10-03", envio: "2026-10-03" }, { ov: "C", fecha: "2026-11-17", envio: "2026-11-17" }], cfg, L);
  assertEquals(r.map((a) => [a.ov, a.envio]), [["A", null], ["C", "2026-11-17"]]);
});
