import { assertEquals } from "@std/assert";
import { configReporteDef, en, esPropia, norm, normalizarConfigReporte, pct, sucursalPropia, tipoEnvio, titulo } from "./config.ts";
import { diasHabiles, enRango, esLunes, finSemana, lunesDe } from "./fechas.ts";

Deno.test("norm: sin acentos, mayúsculas y espacios colapsados", () => {
  assertEquals(norm("  Ávila   Camacho "), "AVILA CAMACHO");
  assertEquals(en(["Compras The Coffee"], "COMPRAS  THE COFFEE"), true);
  assertEquals(en(["DODO PIZZA"], "Dodo"), false);
});

Deno.test("esPropia y sucursalPropia: Sucursal de Zoho o el nombre del cliente", () => {
  assertEquals(esPropia("SUCURSALES THE COFFEE-ALEDEN"), true);
  assertEquals(esPropia("SUCURSALES THE COFFEE - GRAN PLAZA"), true);
  assertEquals(esPropia("OPERADORA DE FRANQUICIAS MJA"), false);
  assertEquals(sucursalPropia({ cliente: "SUCURSALES THE COFFEE-ALEDEN", sucursal: "Aleden " }), "Aleden");
  assertEquals(sucursalPropia({ cliente: "SUCURSALES THE COFFEE - GRAN PLAZA", sucursal: "" }), "Gran Plaza");
});

Deno.test("titulo: palabras capitalizadas, conectores en minúscula, siglas sin vocal en mayúscula", () => {
  assertEquals(titulo("VIRTUO MARKETING INTEGRAL"), "Virtuo Marketing Integral");
  assertEquals(titulo("MAGNOLIA GC"), "Magnolia GC");
  assertEquals(titulo("ALIMENTOS, REPOSTERIA Y CAFFE GOURMET"), "Alimentos, Reposteria y Caffe Gourmet");
});

Deno.test("tipoEnvio: los tres valores de Zoho; lo demás es Sin clasificar", () => {
  assertEquals(tipoEnvio("Llenado de canal "), "Llenado de canal");
  assertEquals(tipoEnvio(""), "Sin clasificar");
});

Deno.test("normalizarConfigReporte: defaults, listas limpias y metas acotadas", () => {
  const d = configReporteDef();
  assertEquals(normalizarConfigReporte(null), d);
  const c = normalizarConfigReporte({ excluir_ventas: [" A ", "", 3, "A"], metas: { fill: 150, stock: "2" }, creditos_activos: [{ cliente: "X", nota: "n" }, { nota: "sin cliente" }] });
  assertEquals(c.excluir_ventas, ["A"]);
  assertEquals(c.metas.fill, 100);
  assertEquals(c.metas.stock, 2);
  assertEquals(c.creditos_activos, [{ cliente: "X", sucursal: "", nota: "n" }]);
  assertEquals(c.deuda_interna, d.deuda_interna);
});

Deno.test("pct: null cuando el divisor es 0", () => {
  assertEquals(pct(1, 4), 0.25);
  assertEquals(pct(1, 0), null);
});

Deno.test("fechas de semana", () => {
  assertEquals(esLunes("2026-11-16"), true);
  assertEquals(esLunes("2026-11-18"), false);
  assertEquals(esLunes("hola"), false);
  assertEquals(esLunes(undefined), false);
  assertEquals(lunesDe("2026-11-22"), "2026-11-16");
  assertEquals(lunesDe("2026-11-16"), "2026-11-16");
  assertEquals(finSemana("2026-11-16"), "2026-11-22");
  assertEquals(enRango("2026-11-22", "2026-11-16", "2026-11-22"), true);
  assertEquals(enRango("2026-11-23", "2026-11-16", "2026-11-22"), false);
});

Deno.test("diasHabiles: cuenta lunes a viernes después de la fecha de la OV", () => {
  assertEquals(diasHabiles("2026-11-12", "2026-11-18"), 4); // jue → mié (Durango Centro)
  assertEquals(diasHabiles("2026-11-17", "2026-11-17"), 0);
  assertEquals(diasHabiles("2026-11-20", "2026-11-23"), 1); // vie → lun
});
