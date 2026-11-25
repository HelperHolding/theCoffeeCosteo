import { assertEquals } from "@std/assert";
import { calcularReporte, type Lectura } from "./reporte.ts";
import { configReporteDef } from "./config.ts";

const ok = <T>(datos: T) => ({ ok: true as const, datos });
const base: Lectura = { facturas: ok([]), paquetes: ok([]), ovs: ok([]), descripciones: ok({}), notas: ok([]), pendientes: ok([]) };

Deno.test("calcularReporte: una lectura fallida solo apaga sus secciones", () => {
  const r = calcularReporte({ ...base, notas: { ok: false, error: "Zoho 429" } }, configReporteDef(), "2026-11-16", "2026-11-23", "2026-11-23T10:00:00Z", null);
  assertEquals(r.notas, { ok: false, error: "Zoho 429" });
  assertEquals(r.ventas.ok, true);
  assertEquals(r.fin, "2026-11-22");
});

Deno.test("calcularReporte: paquetes fallidos apagan surtido y aperturas pero no atención", () => {
  const r = calcularReporte({ ...base, paquetes: { ok: false, error: "x" } }, configReporteDef(), "2026-11-16", "2026-11-23", "t", null);
  assertEquals([r.surtido.ok, r.aperturas.ok, r.atencion.ok], [false, false, true]);
});

Deno.test("calcularReporte: anterior de la foto y valores sin clasificar", () => {
  const r = calcularReporte({
    ...base,
    facturas: ok([{ numero: "F", ov: "", fecha: "2026-11-17", vence: "", cliente: "X", sucursal: "", tipoEnvio: "Nuevo tipo", total: 1, saldo: 0, estado: "paid" }]),
    ovs: ok([{ id: "1", numero: "A", fecha: "2026-11-17", cliente: "X", sucursal: "", tipoEnvio: "Ordinario", incidencia: "Raro", resolucion: "", estado: "open", estadoEnvio: "" }]),
  }, configReporteDef(), "2026-11-16", "2026-11-23", "t", { externos: 266433.05, creditos: 0, interna: 0 });
  assertEquals(r.externos.ok && r.externos.datos.anterior, 266433.05);
  assertEquals(r.sinClasificar, ["Tipo de envío: Nuevo tipo", "Tipo de incidencia: Raro"]);
});
