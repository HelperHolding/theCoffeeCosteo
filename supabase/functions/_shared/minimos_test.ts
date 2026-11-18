import { assertEquals } from "@std/assert";
import { aplicarMinimos, conciliarMinimo, type FilaMin, type OpcionesMinimos } from "./minimos.ts";
import type { FilaPago } from "./proyeccion.ts";

const p = (sku: string, fecha_oc: string, monto: number, vendor_id = "V1"): FilaPago => ({ tipo: "proyectado", sku, nombre: sku, vendor_id,
  vendor_name: vendor_id, fecha_oc, fecha_llegada: fecha_oc, fecha_pago: fecha_oc, cantidad: 1, costo: monto, monto, zoho_po_id: null,
  adelanto_cierre: false, cierre_tarde: false, cierre_id: null, adelanto_minimo: false, bajo_minimo: false });
const o = (x: Partial<OpcionesMinimos> = {}): OpcionesMinimos => ({ minimos: { V1: 1000 }, hoy: "2026-11-12", ventana: 14, modo: "consolidar",
  reprogramar: (_f, d) => ({ fecha_llegada: d, fecha_pago: d }), cerradoPara: () => false, ...x });
const ver = (fs: FilaMin[]) => fs.filter((f) => f.tipo === "proyectado").map((f) => [f.sku, f.fecha_oc, f.adelanto_minimo, f.bajo_minimo]);

Deno.test("adelanta de lo más urgente hasta alcanzar el mínimo", () => {
  const r = aplicarMinimos([p("A", "2026-11-12", 400), p("B", "2026-11-15", 300), p("C", "2026-11-20", 500), p("D", "2026-11-22", 900)], o());
  assertEquals(ver(r), [["A", "2026-11-12", false, false], ["B", "2026-11-12", true, false], ["C", "2026-11-12", true, false], ["D", "2026-11-22", false, true]]);
});

Deno.test("si no alcanza ni con la ventana: marca bajo_minimo y la OC sale igual", () => {
  const r = aplicarMinimos([p("A", "2026-11-12", 400), p("B", "2026-11-30", 900)], o());
  assertEquals(ver(r), [["A", "2026-11-12", false, true], ["B", "2026-11-30", false, true]]);
});

Deno.test("modo avisar solo marca; mínimo 0 o proveedor sin mínimo no cambia nada", () => {
  assertEquals(ver(aplicarMinimos([p("A", "2026-11-12", 400), p("B", "2026-11-15", 900)], o({ modo: "avisar" }))),
    [["A", "2026-11-12", false, true], ["B", "2026-11-15", false, true]]);
  const base = [p("A", "2026-11-12", 400, "V2"), p("B", "2026-11-15", 300, "V2")];
  assertEquals(ver(aplicarMinimos(base, o())), [["A", "2026-11-12", false, false], ["B", "2026-11-15", false, false]]);
  assertEquals(ver(aplicarMinimos(base, o({ minimos: { V2: 0 } }))), [["A", "2026-11-12", false, false], ["B", "2026-11-15", false, false]]);
});

Deno.test("no mueve filas de otro proveedor, cerradas ese día, ni comprometidas; reprograma llegada y pago", () => {
  const com = { ...p("Z", "2026-11-13", 5000), tipo: "comprometido" as const };
  const r = aplicarMinimos([p("A", "2026-11-12", 400), p("X", "2026-11-13", 5000, "V2"), com, p("B", "2026-11-14", 700), p("C", "2026-11-14", 700)],
    o({ cerradoPara: (sku) => sku === "B", reprogramar: (_f, d) => ({ fecha_llegada: "LL" + d, fecha_pago: "PP" + d }) }));
  const c = r.find((f) => f.sku === "C")!;
  assertEquals([c.fecha_oc, c.fecha_llegada, c.fecha_pago, c.adelanto_minimo], ["2026-11-12", "LL2026-11-12", "PP2026-11-12", true]);
  assertEquals(r.find((f) => f.sku === "B")!.fecha_oc, "2026-11-14");
  assertEquals(r.find((f) => f.sku === "X")!.fecha_oc, "2026-11-13");
  assertEquals(r.find((f) => f.tipo === "comprometido")!.fecha_oc, "2026-11-13");
});

Deno.test("un día que quedó vacío por adelanto no es OC (Review Focus 1)", () => {
  const r = aplicarMinimos([p("A", "2026-11-12", 600), p("B", "2026-11-13", 600)], o());
  assertEquals(ver(r), [["A", "2026-11-12", false, false], ["B", "2026-11-12", true, false]]);
});

Deno.test("conciliarMinimo: Zoho cambió, plataforma pendiente, ambos, sin campo", () => {
  const e = (x = {}) => ({ minimo_compra: 1000, minimo_zoho_visto: 1000, minimo_pendiente: false, minimo_editado_at: "2026-11-10T10:00:00Z", ...x });
  assertEquals(conciliarMinimo(e(), 1500, "2026-11-11T10:00:00Z"), { accion: "aplicar_zoho", valor: 1500 });
  assertEquals(conciliarMinimo(e({ minimo_compra: 2000, minimo_pendiente: true }), 1000, "2026-11-01T00:00:00Z"), { accion: "reenviar", valor: 2000 });
  assertEquals(conciliarMinimo(e({ minimo_compra: 2000, minimo_pendiente: true }), 1500, "2026-11-11T10:00:00Z"), { accion: "aplicar_zoho", valor: 1500 });
  assertEquals(conciliarMinimo(e({ minimo_compra: 2000, minimo_pendiente: true }), 1500, "2026-11-09T10:00:00Z"), { accion: "reenviar", valor: 2000 });
  assertEquals(conciliarMinimo(e(), null, null), { accion: "nada", valor: 1000 });
  assertEquals(conciliarMinimo(e(), 1000, "2026-11-11T10:00:00Z"), { accion: "nada", valor: 1000 });
});

Deno.test("conciliarMinimo: primera vista (visto null) y pendiente: gana la plataforma, diga lo que diga Zoho", () => {
  const e = { minimo_compra: 15000, minimo_zoho_visto: null, minimo_pendiente: true, minimo_editado_at: "2026-11-12T18:00:00Z" };
  assertEquals(conciliarMinimo(e, 0, "2026-11-13T10:00:00-0600"), { accion: "reenviar", valor: 15000 });
  assertEquals(conciliarMinimo(e, 20000, "2026-11-14T10:00:00-0600"), { accion: "reenviar", valor: 15000 });
  // visto null sin pendiente: se conserva el comportamiento (aplicar lo de Zoho)
  assertEquals(conciliarMinimo({ ...e, minimo_pendiente: false }, 20000, "2026-11-14T10:00:00-0600"), { accion: "aplicar_zoho", valor: 20000 });
});

Deno.test("ventana: una fila a exactamente +14 días se adelanta; a +15 no", () => {
  const r = aplicarMinimos([p("A", "2026-11-12", 400), p("B", "2026-11-26", 700), p("C", "2026-11-27", 700)], o());
  assertEquals(ver(r), [["A", "2026-11-12", false, false], ["B", "2026-11-12", true, false], ["C", "2026-11-27", false, true]]);
});
