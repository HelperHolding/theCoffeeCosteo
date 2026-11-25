// supabase/functions/_shared/reporte/saldos_test.ts
import { assertEquals } from "@std/assert";
import { calcularSaldosExternos, calcularSaldosSucursales, fotoDe } from "./saldos.ts";
import { configReporteDef } from "./config.ts";
import type { Factura } from "./tipos.ts";

const f = (o: Partial<Factura>): Factura => ({ numero: "F", ov: "", fecha: "2026-11-10", vence: "2026-11-25", cliente: "X", sucursal: "", tipoEnvio: "Ordinario", total: 100, saldo: 100, estado: "sent", ...o });
const C = "2026-11-23";

Deno.test("sucursales: dentro de crédito, fuera del año y anteriores; excluye Polanco", () => {
  const cfg = configReporteDef();
  const s = calcularSaldosSucursales([
    f({ cliente: "SUCURSALES THE COFFEE-VENTURA", sucursal: "Ventura", saldo: 10 }),
    f({ cliente: "SUCURSALES THE COFFEE-VENTURA", sucursal: "Ventura", vence: "2026-11-01", saldo: 20 }),
    f({ cliente: "SUCURSALES THE COFFEE-VENTURA", sucursal: "", fecha: "2025-12-01", vence: "", saldo: 5 }),
    f({ cliente: "SUCURSALES THE COFFEE-POLANCO", sucursal: "Polanco", saldo: 999 }),
    f({ cliente: "MAGNOLIA GC", saldo: 50 }),
    f({ cliente: "SUCURSALES THE COFFEE-OTTAWA", sucursal: "Ottawa", saldo: 0 }),
  ], cfg, C);
  assertEquals(s.anio, 2026);
  assertEquals(s.filas, [{ sucursal: "Ventura", dentro: 10, fueraAnio: 20, anteriores: 5, facturas: 3 }]);
  assertEquals([s.total, s.facturas], [35, 3]);
});

Deno.test("externos: por cliente, más antigua, llenado, créditos, interna y excluidos", () => {
  const cfg = { ...configReporteDef(), creditos_activos: [{ cliente: "TANDEM CORPORATIVO EMPRESARIAL", sucursal: "Patio Santa Fe", nota: "apertura · crédito 6×6" }] };
  const s = calcularSaldosExternos([
    f({ cliente: "TANDEM CORPORATIVO EMPRESARIAL", fecha: "2026-10-13", saldo: 30, tipoEnvio: "Llenado de canal" }),
    f({ cliente: "TANDEM CORPORATIVO EMPRESARIAL", fecha: "2026-11-01", saldo: 5 }),
    f({ cliente: "TANDEM CORPORATIVO EMPRESARIAL", sucursal: "Patio Santa Fe", fecha: "2026-06-29", saldo: 500 }),
    f({ cliente: "MARKETING", fecha: "2026-04-21", saldo: 70 }),
    f({ cliente: "DODO PIZZA", saldo: 22 }),
    f({ cliente: "SUCURSALES THE COFFEE-VENTURA", saldo: 1000 }),
  ], cfg, C);
  assertEquals(s.filas, [{ cliente: "Tandem Corporativo Empresarial", nota: "", masAntigua: "2026-10-13", dias: 41, saldo: 35, llenado: 30 }]);
  assertEquals(s.creditos.map((c) => [c.cliente, c.nota, c.saldo, c.dias]), [["Tandem Corporativo Empresarial", "Patio Santa Fe · apertura · crédito 6×6", 500, 147]]);
  assertEquals([s.subtotal, s.subtotalCreditos, s.total, s.totalInterna], [35, 500, 535, 70]);
  assertEquals(s.excluidos, [{ cliente: "Dodo Pizza", saldo: 22 }]);
  assertEquals(fotoDe(s), { externos: 535, creditos: 500, interna: 70 });
});
