import { assertEquals } from "@std/assert";
import { aplica, alcanceCierres, cerradoEn, coberturas, diaPedidoEfectivo, diaPedidoReportado, llegadaAjustada, periodosDe, ultimoDiaPedido,
  type Cierre } from "./cierres.ts";

const c = (o: Partial<Cierre> = {}): Cierre => ({ id: 1, vendor_id: "V1", ini: "2026-12-15", fin: "2026-12-30", skus: null, cancelado: false, ...o });
const HOY = "2026-11-11";

Deno.test("aplica: todo el proveedor o solo sus SKUs listados; otro proveedor nunca", () => {
  assertEquals(aplica(c(), "A", "V1"), true);
  assertEquals(aplica(c(), "A", "V2"), false);
  assertEquals(aplica(c({ skus: ["B"] }), "A", "V1"), false);
  assertEquals(aplica(c({ skus: ["A"] }), "A", "V1"), true);
  assertEquals(aplica(c({ skus: [] }), "A", "V1"), true, "lista vacía = todo el proveedor");
  assertEquals(aplica(c({ skus: ["A"] }), "A", null), false, "sin proveedor en Zoho no aplica");
});

Deno.test("periodosDe: descarta cancelados y terminados, ordena y fusiona traslapes y contiguos", () => {
  const ps = periodosDe([
    c({ id: 3, ini: "2027-01-10", fin: "2027-01-12" }),
    c({ id: 1, ini: "2026-12-15", fin: "2026-12-20" }),
    c({ id: 2, ini: "2026-12-21", fin: "2026-12-30" }),      // contiguo → se fusiona con 1
    c({ id: 4, ini: "2026-12-01", fin: "2026-12-05", cancelado: true }),
    c({ id: 5, ini: "2026-10-01", fin: "2026-11-10" }),      // terminó ayer
  ], "A", "V1", HOY);
  assertEquals(ps, [{ id: 1, ini: "2026-12-15", fin: "2026-12-30" }, { id: 3, ini: "2027-01-10", fin: "2027-01-12" }]);
});

Deno.test("cerradoEn y llegadaAjustada", () => {
  const ps = [{ id: 1, ini: "2026-12-15", fin: "2026-12-30" }];
  assertEquals(cerradoEn(ps, "2026-12-14"), null);
  assertEquals(cerradoEn(ps, "2026-12-15")?.id, 1);
  assertEquals(cerradoEn(ps, "2026-12-30")?.id, 1);
  assertEquals(llegadaAjustada(ps, "2026-12-20"), "2026-12-31");
  assertEquals(llegadaAjustada(ps, "2026-12-14"), "2026-12-14");
});

Deno.test("ultimoDiaPedido redondea el LT hacia arriba; LT 0 → un día antes", () => {
  assertEquals(ultimoDiaPedido("2026-12-15", 5), "2026-12-09");
  assertEquals(ultimoDiaPedido("2026-12-15", 4.2), "2026-12-09");
  assertEquals(ultimoDiaPedido("2026-12-15", 0), "2026-12-14");
});

Deno.test("coberturas: en U a tiempo; tarde si U ya pasó; ninguna si hoy está cerrado", () => {
  const ps = [{ id: 1, ini: "2026-12-15", fin: "2026-12-30" }];
  assertEquals(coberturas(ps, HOY, 5), [{ periodo: ps[0], dia: "2026-12-09", U: "2026-12-09", R: "2027-01-05", tarde: false }]);
  assertEquals(coberturas(ps, "2026-12-12", 5), [{ periodo: ps[0], dia: "2026-12-12", U: "2026-12-09", R: "2027-01-05", tarde: true }]);
  assertEquals(coberturas(ps, "2026-12-20", 5), []);
});

Deno.test("alcanceCierres: días desde hoy hasta la entrega posterior más lejana; 0 sin cierres", () => {
  assertEquals(alcanceCierres([], HOY, 10), 0);
  // fin 2026-12-30 → R = 2026-12-31 + 10 = 2027-01-10 → 60 días desde 2026-11-11
  assertEquals(alcanceCierres([c()], HOY, 10), 60);
  assertEquals(alcanceCierres([c({ cancelado: true })], HOY, 10), 0);
});

// Dos cierres separados (no se fusionan) a menos de un lead time: U de B (11-23) cae dentro de A.
const PA = { id: 1, ini: "2026-11-20", fin: "2026-11-25" };
const PB = { id: 2, ini: "2026-11-29", fin: "2026-12-05" };

Deno.test("coberturas: si U de un cierre cae dentro de uno anterior, una sola compra en el día de A llega hasta R de B", () => {
  // U_A = 11-14; U_B = 11-23 (cerrado por A) → se mueve al 11-14. R_B = 12-06 + 5 = 12-11.
  assertEquals(coberturas([PA, PB], HOY, 5), [{ periodo: PB, dia: "2026-11-14", U: "2026-11-23", R: "2026-12-11", tarde: false }]);
  // En cadena: C dentro de B, B dentro de A → todo en el día de A.
  const PC = { id: 3, ini: "2026-12-08", fin: "2026-12-10" }; // U_C = 12-02, dentro de B
  assertEquals(coberturas([PA, PB, PC], HOY, 5).map((c) => [c.dia, c.periodo.id, c.R]), [["2026-11-14", 3, "2026-12-16"]]);
  // Hoy dentro de A: A no tiene día y B tampoco (la regla normal retoma al reabrir).
  assertEquals(coberturas([PA, PB], "2026-11-22", 5), []);
});

Deno.test("coberturas: dos coberturas el mismo día se juntan en una con el R más tardío; tarde si cualquiera lo era", () => {
  // Ambos U ya pasaron → los dos compran hoy (12-12).
  const a = { id: 1, ini: "2026-12-14", fin: "2026-12-15" }, b = { id: 2, ini: "2026-12-17", fin: "2026-12-18" };
  assertEquals(coberturas([a, b], "2026-12-12", 5), [{ periodo: b, dia: "2026-12-12", U: "2026-12-11", R: "2026-12-24", tarde: true }]);
  // A tarde (U 11-14 < hoy 11-16) y B movido al día de A a tiempo → la entrada única queda tarde.
  assertEquals(coberturas([PA, PB], "2026-11-16", 5), [{ periodo: PB, dia: "2026-11-16", U: "2026-11-23", R: "2026-12-11", tarde: true }]);
  // A lo más una entrada por día.
  const dias = coberturas([PA, PB, a, b], HOY, 5).map((c) => c.dia);
  assertEquals(dias.length, new Set(dias).size);
});

Deno.test("diaPedidoEfectivo y diaPedidoReportado: día movido por un cierre anterior; U tal cual si no; null sin cobertura", () => {
  assertEquals(diaPedidoEfectivo([PA, PB], PB.ini, HOY, 5), "2026-11-14");
  assertEquals(diaPedidoReportado([PA, PB], PB.ini, HOY, 5), "2026-11-14");
  assertEquals(diaPedidoReportado([PA, PB], PA.ini, HOY, 5), "2026-11-14");
  // U ya pasó sin cierre anterior: el efectivo es hoy, pero se reporta U (para "Ya no alcanza").
  assertEquals(diaPedidoEfectivo([PA], PA.ini, "2026-11-16", 5), "2026-11-16");
  assertEquals(diaPedidoReportado([PA], PA.ini, "2026-11-16", 5), "2026-11-14");
  // Hoy dentro de A: B no tiene cobertura → null; A (ya empezó) conserva su U.
  assertEquals(diaPedidoEfectivo([PA, PB], PB.ini, "2026-11-22", 5), null);
  assertEquals(diaPedidoReportado([PA, PB], PB.ini, "2026-11-22", 5), null);
  assertEquals(diaPedidoReportado([PA, PB], PA.ini, "2026-11-22", 5), "2026-11-14");
  // Fecha fuera de todo periodo.
  assertEquals(diaPedidoEfectivo([PA], "2026-11-01", HOY, 5), null);
});