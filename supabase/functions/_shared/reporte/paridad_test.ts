// Paridad contra el reporte hecho a mano del 16–22 nov 2026.
// Las diferencias con la captura del 25 nov están explicadas en la spec §7
// («Diferencias explicadas de la paridad»); no se ajusta ningún esperado sin citarlas.
import { assertAlmostEquals, assertEquals } from "@std/assert";
import { aFactura, aNota, aOv, aPaquete } from "./zohoReporte.ts";
import { calcularReporte } from "./reporte.ts";
import { configReporteDef } from "./config.ts";

// deno-lint-ignore no-explicit-any
const d: any = JSON.parse(await Deno.readTextFile(new URL("../pruebas/reporte-2026-11-16.json", import.meta.url)));
const ok = <T>(datos: T) => ({ ok: true as const, datos });
const cfg = { ...configReporteDef(), creditos_activos: [
  { cliente: "TANDEM CORPORATIVO EMPRESARIAL", sucursal: "Patio Santa Fe", nota: "apertura · crédito 6×6" },
  { cliente: "EMMANUEL ORTIZ LOPEZ", sucursal: "Paseo MS", nota: "crédito otorgado" },
] };

// deno-lint-ignore no-explicit-any
const calcular = (ovsCrudos: any[], paquetesCrudos: any[]) => calcularReporte({
  facturas: ok(d.facturas.map(aFactura)), paquetes: ok(paquetesCrudos.map(aPaquete)), ovs: ok(ovsCrudos.map(aOv)),
  descripciones: ok(d.descripciones ?? {}), notas: ok(d.notas.map(aNota)), pendientes: ok((d.pendientes ?? []).map(aFactura)),
}, cfg, "2026-11-16", "2026-11-23", d.capturado, null);

// Captura tal cual (25 nov).
const r = calcular(d.ovs, d.paquetes);

// Se deshacen solo los cambios de datos probados por folio (spec §7, puntos 1 y 2); el punto 3 es diferencia de criterio y no se toca.
const incidenciaTardia = new Set(["COM-OV-04806", "COM-OV-04808", "COM-OV-04945", "COM-OV-04949"]); // punto 1
const paqueteTardio = new Set(["COM-OV-04934", "COM-OV-04940", "COM-OV-04941"]); // punto 2
const r23 = calcular(
  // deno-lint-ignore no-explicit-any
  d.ovs.map((o: any) => incidenciaTardia.has(o.salesorder_number) ? { ...o, cf_tipo_de_incidencia: "" } : o),
  // deno-lint-ignore no-explicit-any
  d.paquetes.filter((p: any) =>
    !(paqueteTardio.has(p.salesorder_number) && p.shipment_date >= "2026-11-23")),
);

Deno.test("paridad: ventas 16–22 nov", () => {
  if (!r.ventas.ok) throw new Error(r.ventas.error);
  assertAlmostEquals(r.ventas.datos.total, 1_193_333, 1);
  assertEquals(r.ventas.datos.pedidos, 97);
  assertEquals(r.ventas.datos.semanas.map((s) => Math.round(s.total)), [989_317, 1_107_714, 1_534_595, 1_266_935, 1_193_333]);
  assertEquals(r.ventas.datos.top[0].nombre, "Corporativo AP (MJA + SEJ)");
  assertAlmostEquals(r.ventas.datos.top[0].total, 398_424, 1);
});

Deno.test("paridad: calidad de surtido con los datos del 23 nov (spec §7, puntos 1 y 2)", () => {
  if (!r23.surtido.ok) throw new Error(r23.surtido.error);
  const s = r23.surtido.datos;
  // Difieren de 71/33/34 (29/4/1) y de 55/54 del reporte a mano solo por OV-04803 y OV-04814 (spec §7 punto 3:
  // el reporte a mano contó el reenvío como envío; la regla del portal toma el primer paquete, del 14 nov).
  assertEquals([s.enviados, s.conFaltante, s.incidenciasTotal], [69, 31, 32]);
  assertEquals(s.casos, { stock: 27, pickeo: 4, paqueteria: 1, otro: 0 });
  assertEquals([s.envio.universo, s.envio.enMeta], [54, 54]);
  // Foto del comportamiento actual; diferencia con [8, 25, 21, 1] sin folio identificado (spec §7 punto 4).
  assertEquals(s.envio.buckets, [8, 24, 22, 0]);
});

Deno.test("paridad: calidad de surtido con la captura del 25 nov (spec §7, puntos 1 y 2)", () => {
  if (!r.surtido.ok) throw new Error(r.surtido.error);
  const s = r.surtido.datos;
  assertEquals([s.enviados, s.conFaltante, s.incidenciasTotal], [68, 32, 33]);
  assertEquals(s.casos, { stock: 26, pickeo: 6, paqueteria: 1, otro: 0 });
  assertEquals([s.envio.universo, s.envio.enMeta, s.envio.buckets], [54, 54, [8, 24, 22, 0]]);
});

Deno.test("paridad: notas de crédito", () => {
  if (!r.notas.ok) throw new Error(r.notas.error);
  assertEquals(r.notas.datos.filas.map((n) => n.numero), ["CN-00204", "CN-00203", "CN-00202", "CN-00201", "CN-00200"]);
  assertAlmostEquals(r.notas.datos.total, 3_357.73, 0.01);
});
