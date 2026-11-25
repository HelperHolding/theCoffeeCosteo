import { assertEquals, assertAlmostEquals } from "@std/assert";
import { calcularVentas } from "./ventas.ts";
import { configReporteDef } from "./config.ts";
import type { Factura } from "./tipos.ts";

const f = (o: Partial<Factura>): Factura => ({ numero: "F", ov: "", fecha: "2026-11-17", vence: "", cliente: "CLIENTE X", sucursal: "", tipoEnvio: "Ordinario", total: 100, saldo: 0, estado: "paid", ...o });
const cfg = configReporteDef();

Deno.test("ventas: suma la semana sin excluidos ni anuladas", () => {
  const v = calcularVentas([
    f({ total: 116 }), f({ total: 50, cliente: "DODO PIZZA" }), f({ total: 70, estado: "void" }), f({ total: 10, fecha: "2026-11-23" }),
  ], cfg, "2026-11-16");
  assertEquals(v.total, 116);
  assertEquals(v.pedidos, 1);
  assertAlmostEquals(v.sinIva, 100, 1e-9);
});

Deno.test("ventas: top agrupa Corporativo AP y sucursales propias, con sus sucursales por monto", () => {
  const v = calcularVentas([
    f({ cliente: "OPERADORA DE FRANQUICIAS MJA", sucursal: "Santa Fe", total: 300 }),
    f({ cliente: "OPERADORA DE CAFETERIAS SEJ", sucursal: "Avándaro", total: 100 }),
    f({ cliente: "SUCURSALES THE COFFEE-VENTURA", sucursal: "Ventura", total: 200 }),
    f({ cliente: "MAGNOLIA GC", sucursal: "Puerta Paraíso", total: 50 }),
  ], cfg, "2026-11-16");
  assertEquals(v.top.map((t) => [t.nombre, t.total]), [["Corporativo AP (MJA + SEJ)", 400], ["The Coffee Sucursales", 200], ["Magnolia GC", 50]]);
  assertEquals(v.top[0].sucursales, ["Santa Fe", "Avándaro"]);
});

Deno.test("ventas: 5 semanas por tipo y variaciones", () => {
  const v = calcularVentas([
    f({ fecha: "2026-11-10", total: 200, tipoEnvio: "Ordinario" }),
    f({ fecha: "2026-11-10", total: 100, tipoEnvio: "Apertura" }),
    f({ fecha: "2026-11-17", total: 150, tipoEnvio: "Ordinario" }),
    f({ fecha: "2026-11-18", total: 30, tipoEnvio: "Raro" }),
  ], cfg, "2026-11-16");
  assertEquals(v.semanas.map((s) => s.lunes), ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"]);
  assertEquals(v.semanas[3].porTipo, { Ordinario: 200, "Llenado de canal": 0, Apertura: 100 });
  assertEquals(v.semanas[4].porTipo, { Ordinario: 150, "Llenado de canal": 0, Apertura: 0, "Sin clasificar": 30 });
  assertEquals(v.difAnterior, -120);
  assertAlmostEquals(v.vsAnterior!, -0.4, 1e-9);
  assertEquals(v.difAnteriorOrdinario, -50);
  assertEquals(v.promedio, 96);
});

Deno.test("ventas: semana vacía no da NaN", () => {
  const v = calcularVentas([], cfg, "2026-11-16");
  assertEquals(v.total, 0);
  assertEquals(v.vsAnterior, null);
  assertEquals(v.vsPromedio, null);
  assertEquals(v.top, []);
});
