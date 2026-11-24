import { assertEquals } from "@std/assert";
import type { Fila, OcProveedor } from "../_shared/posicion.ts";
import { proponer } from "./generar.ts";
import { planConsolidar, vendoresConBorrador } from "./consolidar.ts";

const f = (o: Partial<Fila>): Fila => ({
  sku: "S", nombre: "N", zoho_item_id: "i", zoho_vendor_id: "v1", zoho_vendor_name: "P1", costo: 10, inventario: 0,
  saldo_yulius: 0, enCamino: 0, enOcAbierta: false, minimo: 340, maximo: 640, venta_diaria: 20, kits_max: 0, multiplo: null,
  minimoPzas: null, lead_time: 7, ...o,
});
const oc = (o: Partial<OcProveedor>): OcProveedor => ({
  zoho_po_id: "po1", po_number: "COM-OC-1", status: "draft", vendor_id: "v1", vendor_name: "P1", sku: "A", item_id: null,
  cantidad: 100, pendiente: 100, precio: 10, fecha_oc: "2026-11-16", ...o,
});
const correr = (filas: Fila[], ocs: OcProveedor[]) =>
  planConsolidar({ filas, ocs, prop: proponer(filas, true), proponerCon: (x) => proponer(x, true) });
const lineas = (g: { lineas: { sku: string; cantidad: number; origen?: string; antes?: number }[] }) =>
  g.lineas.map((l) => [l.sku, l.cantidad, l.origen ?? null, l.antes ?? null]);

Deno.test("borrador + algo nuevo → una OC con lo nuevo y el SKU del borrador recalculado", () => {
  // A está en borrador (100 en camino, bloqueado); B es nuevo. Sin el borrador, A pide 640.
  const p = correr([f({ sku: "A", enCamino: 100, enOcAbierta: true }), f({ sku: "B" })], [oc({ sku: "A" })]);
  assertEquals(p.porProveedor.length, 1);
  assertEquals(lineas(p.porProveedor[0]), [["A", 640, "recalculado", 100], ["B", 640, "nuevo", null]]);
  assertEquals(p.porProveedor[0].monto, 12800);
  assertEquals(p.consolidadas, [{ vendor_id: "v1", vendor_name: "P1", borradores: [{ zoho_po_id: "po1", po_number: "COM-OC-1" }], monto_antes: 1000, quitados: [] }]);
  assertEquals(p.alertas, []);
});

Deno.test("borrador sin nada nuevo → no se toca", () => {
  const filas = [f({ sku: "A", enCamino: 100, enOcAbierta: true })];
  const p = correr(filas, [oc({ sku: "A" })]);
  assertEquals([p.porProveedor, p.consolidadas, p.alertas], [[], [], []]);
});

Deno.test("varios borradores del mismo proveedor → una sola OC y los dos en reemplaza", () => {
  const p = correr(
    [f({ sku: "A", enCamino: 100, enOcAbierta: true }), f({ sku: "C", enCamino: 50, enOcAbierta: true }), f({ sku: "B" })],
    [oc({ sku: "A" }), oc({ zoho_po_id: "po2", po_number: "COM-OC-2", sku: "C", cantidad: 50, pendiente: 50 })],
  );
  assertEquals(p.consolidadas[0].borradores.map((b) => b.po_number), ["COM-OC-1", "COM-OC-2"]);
  assertEquals(p.porProveedor[0].lineas.map((l) => l.sku), ["A", "B", "C"]);
});

Deno.test("SKU manejado que recalcula a 0 sale y va a quitados", () => {
  // A tiene 1000 físico: sin el borrador ya no hace falta.
  const p = correr([f({ sku: "A", inventario: 1000, enCamino: 100, enOcAbierta: true }), f({ sku: "B" })], [oc({ sku: "A" })]);
  assertEquals(lineas(p.porProveedor[0]), [["B", 640, "nuevo", null]]);
  assertEquals(p.consolidadas[0].quitados, [{ sku: "A", nombre: "N", antes: 100 }]);
});

Deno.test("SKU no manejado (sin fila o marcador) pasa con cantidad y precio del borrador", () => {
  const p = correr([f({ sku: "B" })], [oc({ sku: "ENV", cantidad: 1, pendiente: 1, precio: 250, item_id: "it-env" }), oc({ sku: "X9", cantidad: 3, pendiente: 3, precio: 7 })]);
  assertEquals(lineas(p.porProveedor[0]), [["B", 640, "nuevo", null], ["ENV", 1, "borrador", 1], ["X9", 3, "borrador", 3]]);
  assertEquals(p.porProveedor[0].lineas.find((l) => l.sku === "ENV")!.item_id, "it-env");
  assertEquals(p.porProveedor[0].monto, 6400 + 250 + 21);
});

Deno.test("SKU del borrador cuyo proveedor de catálogo es otro: no se recalcula, viaja como borrador", () => {
  const p = correr([f({ sku: "A", zoho_vendor_id: "v2", enCamino: 100, enOcAbierta: true }), f({ sku: "B" })], [oc({ sku: "A" })]);
  assertEquals(lineas(p.porProveedor.find((g) => g.vendor_id === "v1")!), [["A", 100, "borrador", 100], ["B", 640, "nuevo", null]]);
  assertEquals(p.porProveedor.some((g) => g.vendor_id === "v2"), false);
});

Deno.test("OC emitida + algo nuevo → OC aparte (sin cambios) y alerta", () => {
  const p = correr([f({ sku: "A", enCamino: 100, enOcAbierta: true }), f({ sku: "B" })], [oc({ sku: "A", status: "open", po_number: "COM-OC-9" })]);
  assertEquals(lineas(p.porProveedor[0]), [["B", 640, null, null]]);
  assertEquals(p.consolidadas, []);
  assertEquals(p.alertas, [{ vendor_id: "v1", vendor_name: "P1", emitidas: [{ zoho_po_id: "po1", po_number: "COM-OC-9", fecha_oc: "2026-11-16" }],
    skus: [{ sku: "B", nombre: "N", cantidad: 640 }] }]);
});

Deno.test("borrador + emitida + nuevo → consolida el borrador y alerta por la emitida", () => {
  const p = correr(
    [f({ sku: "A", enCamino: 100, enOcAbierta: true }), f({ sku: "C", enCamino: 30, enOcAbierta: true }), f({ sku: "B" })],
    [oc({ sku: "A" }), oc({ zoho_po_id: "po9", po_number: "COM-OC-9", status: "open", sku: "C", cantidad: 30, pendiente: 30 })],
  );
  assertEquals(p.porProveedor[0].lineas.map((l) => l.sku), ["A", "B"]); // C sigue bloqueado por la emitida
  assertEquals(p.consolidadas.length, 1);
  assertEquals(p.alertas[0].emitidas.map((e) => e.po_number), ["COM-OC-9"]);
  assertEquals(p.alertas[0].skus.map((s) => s.sku), ["B"]);
});

Deno.test("vendoresConBorrador: solo proveedores con líneas propuestas y algún borrador", () => {
  const filas = [f({ sku: "B" }), f({ sku: "D", zoho_vendor_id: "v3" })];
  const v = vendoresConBorrador(proponer(filas, true), [oc({ sku: "A" }), oc({ vendor_id: "v2", sku: "Z" }), oc({ vendor_id: "v3", sku: "Q", status: "open" })]);
  assertEquals([...v], ["v1"]);
});

Deno.test("revisión: el pendiente que se resta es el sincronizado, no el vivo (borrador bajado después del sync)", () => {
  const filas = [f({ sku: "A", enCamino: 100, enOcAbierta: true }), f({ sku: "B" })];
  const vivo = [oc({ sku: "A", cantidad: 80, pendiente: 80 })];
  const p = planConsolidar({ filas, ocs: vivo, sincronizadas: [oc({ sku: "A" })], prop: proponer(filas, true), proponerCon: (x) => proponer(x, true) });
  assertEquals(lineas(p.porProveedor[0]), [["A", 640, "recalculado", 80], ["B", 640, "nuevo", null]]);
  assertEquals(p.consolidadas[0].quitados, []);
});

Deno.test("revisión: proveedor con cobertura por cierre o adelanto por mínimo no se consolida (queda como antes)", () => {
  const filas = [f({ sku: "A", enCamino: 100, enOcAbierta: true }), f({ sku: "B" })];
  const ajuste = { cerrados: new Set<string>(), cobertura: new Map([["A", { cantidad: 50, cierre_id: 1, adelanto: true, tarde: false }]]) };
  const prop = proponer(filas, true, ajuste);
  const p = planConsolidar({ filas, ocs: [oc({ sku: "A" })], prop, proponerCon: (x) => proponer(x, true, ajuste) });
  assertEquals([p.consolidadas, p.porProveedor], [[], prop.porProveedor]);
  const minimos = { extra: new Map([["B", 10]]), bajo: new Set<string>() };
  const prop2 = proponer(filas, true, undefined, minimos);
  const p2 = planConsolidar({ filas, ocs: [oc({ sku: "A" })], prop: prop2, proponerCon: (x) => proponer(x, true, undefined, minimos) });
  assertEquals([p2.consolidadas, p2.porProveedor], [[], prop2.porProveedor]);
});
