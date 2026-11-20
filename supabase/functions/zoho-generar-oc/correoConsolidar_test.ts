import { assertEquals, assertStringIncludes } from "@std/assert";
import { asuntoConsolidar, correoConsolidarHtml } from "./correoConsolidar.ts";

const base = {
  vendor_name: "ODISA <b>", nueva: "COM-OC-20", borradores: [{ po_number: "COM-OC-1", cancelada: true }],
  lineas: [{ sku: "A", nombre: "Vaso", antes: 100, ahora: 640, origen: "recalculado" as const }, { sku: "B", nombre: "Tapa", antes: null, ahora: 50, origen: "nuevo" as const }],
  quitados: [{ sku: "C", nombre: "Popote", antes: 10 }], monto_antes: 1000, monto: 6900,
};

Deno.test("asunto con y sin simulación", () => {
  assertEquals(asuntoConsolidar("2026-11-26", "real"), "OC automática 2026-11-26: consolidaciones y alertas");
  assertEquals(asuntoConsolidar("2026-11-26", "simulacion"), "OC automática 2026-11-26: consolidaciones y alertas (simulación)");
});

Deno.test("consolidada: viejas → nueva, antes → ahora, quitados, totales y escape", () => {
  const h = correoConsolidarHtml({ fecha: "2026-11-26", modo: "real", consolidadas: [base], alertas: [] });
  assertStringIncludes(h, "ODISA &lt;b&gt;");
  assertStringIncludes(h, "COM-OC-1");
  assertStringIncludes(h, "COM-OC-20");
  assertStringIncludes(h, "100 → 640");
  assertStringIncludes(h, "nuevo");
  assertStringIncludes(h, "quitado: ya no hace falta");
  assertStringIncludes(h, "$1,000.00");
  assertStringIncludes(h, "$6,900.00");
});

Deno.test("cancelación fallida pide cancelar a mano", () => {
  const h = correoConsolidarHtml({ fecha: "2026-11-26", modo: "real", alertas: [],
    consolidadas: [{ ...base, borradores: [{ po_number: "COM-OC-1", cancelada: false, error: "Zoho 400" }] }] });
  assertStringIncludes(h, "cancelar a mano COM-OC-1");
});

Deno.test("alerta: OC emitida y lo pedido aparte", () => {
  const h = correoConsolidarHtml({ fecha: "2026-11-26", modo: "simulacion", consolidadas: [],
    alertas: [{ vendor_id: "v1", vendor_name: "MAHA", emitidas: [{ zoho_po_id: "p", po_number: "COM-OC-9", fecha_oc: "2026-11-16" }],
      skus: [{ sku: "B", nombre: "Tapa", cantidad: 50 }] }] });
  assertStringIncludes(h, "SIMULACIÓN");
  assertStringIncludes(h, "ya tiene la OC emitida COM-OC-9 del 2026-11-16");
  assertStringIncludes(h, "B Tapa (50)");
});
