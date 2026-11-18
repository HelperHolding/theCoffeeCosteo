import { assertEquals } from "@std/assert";
import { proyectar, type EntradaProyeccion } from "./proyeccion.ts";
import type { Fila } from "./posicion.ts";

const fila = (o: Partial<Fila> = {}): Fila => ({
  sku: "A", nombre: "Art A", zoho_item_id: "I1", zoho_vendor_id: "V1", zoho_vendor_name: "Prov 1", costo: 10,
  fisico: 0, fisicoRespaldo: false, saldo_yulius: 0, enCamino: 0, enOcAbierta: false, minimo: 10, maximo: 20, venta_diaria: 1, kits_max: 0,
  multiplo: null, minimoPzas: null, lead_time: 5, ...o,
});
// Curva acumulada con venta constante de `v` por día: D(j) = v·j.
const lineal = (v: number, H: number) => Array.from({ length: H + 1 }, (_, j) => v * j);
const base = (o: Partial<EntradaProyeccion> = {}): EntradaProyeccion => ({
  hoy: "2026-11-06", horizonte: 30, base: "llegada", sumarYulius: true, filas: [fila()],
  curvas: { A: lineal(1, 30) }, kit: {}, fechasKit: [], credito: {}, abiertas: [], ltDefault: 7, ...o,
});

Deno.test("día 0 compra lo mismo que la OC automática y redondea al múltiplo", () => {
  const r = proyectar(base({ filas: [fila({ fisico: 4, enCamino: 2, multiplo: 6 })] }));
  const d0 = r.filas.filter((f) => f.fecha_oc === "2026-11-06");
  assertEquals(d0.map((f) => f.cantidad), [18]); // máx 20 − pos 6 = 14 → múltiplo 6 → 18
  assertEquals(d0[0].monto, 180);
});

Deno.test("vuelve a comprar cuando la posición toca el mínimo, después de que llega la compra anterior", () => {
  const r = proyectar(base({ filas: [fila({ fisico: 20 })] }));
  // pos 20 − 1/día: toca 10 el día 10 → compra 10; vuelve a tocar 10 los días 20 y 30 (el horizonte incluye el día 30).
  assertEquals(r.filas.map((f) => [f.fecha_oc, f.cantidad]), [["2026-11-16", 10], ["2026-11-26", 10], ["2026-12-06", 10]]);
});

Deno.test("fecha de pago: llegada + crédito, o fecha de OC + crédito con base 'oc'", () => {
  const r1 = proyectar(base({ credito: { V1: 30 } }));
  assertEquals([r1.filas[0].fecha_llegada, r1.filas[0].fecha_pago], ["2026-11-11", "2026-12-11"]);
  const r2 = proyectar(base({ credito: { V1: 30 }, base: "oc" }));
  assertEquals(r2.filas[0].fecha_pago, "2026-12-06");
});

Deno.test("los kits se consumen en su fecha de kit (los de hoy, el día 1)", () => {
  const r = proyectar(base({ filas: [fila({ fisico: 15 })], curvas: { A: lineal(0, 30) }, kit: { A: 3 },
    fechasKit: ["2026-11-06", "2026-11-10", "2026-11-10"] }));
  // día 1: 15 − 3 = 12; día 4 (11-10): 12 − 6 = 6 ≤ 10 → compra 14.
  assertEquals(r.filas.map((f) => [f.fecha_oc, f.cantidad]), [["2026-11-10", 14]]);
});

Deno.test("OC abierta bloquea el día 0 y hasta su llegada; con llegada vencida, desde el día 1 sí compra", () => {
  const abiertas = [{ zoho_po_id: "P", sku: "A", vendor_id: "V1", vendor_name: "Prov 1", pendiente: 0.5, precio: 10,
    fecha_oc: "2026-10-01", fecha_entrega: "2026-11-08", facturada: false }];
  const r1 = proyectar(base({ filas: [fila({ enOcAbierta: true })], abiertas }));
  assertEquals(r1.filas.filter((f) => f.tipo === "proyectado")[0].fecha_oc, "2026-11-09");
  const vencida = [{ ...abiertas[0], fecha_entrega: "2026-10-20" }];
  const r2 = proyectar(base({ filas: [fila({ enOcAbierta: true })], abiertas: vencida }));
  assertEquals(r2.filas.filter((f) => f.tipo === "proyectado")[0].fecha_oc, "2026-11-07");
});

Deno.test("comprometido: pendiente × precio, pago vencido cae hoy, sin precio va a sinCosto", () => {
  const abiertas = [
    { zoho_po_id: "P1", sku: "A", vendor_id: "V1", vendor_name: "Prov 1", pendiente: 4, precio: 12.5, fecha_oc: "2026-11-01", fecha_entrega: null, facturada: false },
    { zoho_po_id: "P2", sku: "A", vendor_id: "V1", vendor_name: "Prov 1", pendiente: 2, precio: 10, fecha_oc: "2026-09-01", fecha_entrega: "2026-09-10", facturada: false },
    { zoho_po_id: "P3", sku: "Z", vendor_id: "V9", vendor_name: "Otro", pendiente: 3, precio: null, fecha_oc: "2026-11-01", fecha_entrega: null, facturada: false },
  ];
  const r = proyectar(base({ filas: [fila({ fisico: 100 })], abiertas }));
  const c = r.filas.filter((f) => f.tipo === "comprometido");
  assertEquals(c.map((f) => [f.zoho_po_id, f.monto, f.fecha_llegada, f.fecha_pago]),
    [["P1", 50, "2026-11-06", "2026-11-06"], ["P2", 20, "2026-09-10", "2026-11-06"]]);
  assertEquals(r.sinCosto, ["Z"]);
});

Deno.test("OC facturada (billed): bloquea la recompra hasta su llegada pero no es comprometido", () => {
  const abiertas = [{ zoho_po_id: "PB", sku: "A", vendor_id: "V1", vendor_name: "Prov 1", pendiente: 0.5, precio: 10,
    fecha_oc: "2026-10-01", fecha_entrega: "2026-11-08", facturada: true }];
  const r = proyectar(base({ filas: [fila({ enOcAbierta: true })], abiertas }));
  assertEquals(r.filas.filter((f) => f.tipo === "comprometido"), []);
  assertEquals(r.filas.filter((f) => f.tipo === "proyectado")[0].fecha_oc, "2026-11-09"); // igual que una abierta sin facturar
  assertEquals(r.sinCosto, []);
});

Deno.test("sin proveedor o sin costo no generan monto; sin venta no compra; curva corta no da NaN", () => {
  const r = proyectar(base({
    filas: [fila({ sku: "S", zoho_vendor_id: null }), fila({ sku: "C", costo: null }), fila({ sku: "Q", fisico: 50 }),
      fila({ sku: "N", fisico: 50 })],
    curvas: { S: lineal(1, 30), C: lineal(1, 30), Q: [0, 0], N: lineal(1, 3) },
  }));
  assertEquals(r.sinProveedor, ["S"]);
  assertEquals(r.sinCosto, ["C"]);
  assertEquals(r.filas.filter((f) => f.sku === "Q"), []);
  assertEquals(r.filas.every((f) => Number.isFinite(f.monto) && Number.isFinite(f.cantidad)), true);
});

Deno.test("OC automática más nueva que el sync (enOcAbierta sin líneas abiertas) bloquea hasta hoy + lead time", () => {
  const r = proyectar(base({ filas: [fila({ enOcAbierta: true, fisico: 0, lead_time: 5 })], abiertas: [], curvas: { A: lineal(1, 30) } }));
  assertEquals(r.filas.filter((f) => f.tipo === "proyectado")[0].fecha_oc, "2026-11-12");
});

const cierre = (o: Partial<import("./cierres.ts").Cierre> = {}) =>
  ({ id: 7, vendor_id: "V1", ini: "2026-11-20", fin: "2026-11-29", skus: null, cancelado: false, ...o });

Deno.test("cierre: no compra en días cerrados y cubre en U hasta la primera entrega posterior", () => {
  // pos 30, 1/día. U = 11-20 − 5 − 1 = 11-14 (j=8, pos 22). R = 11-30 + 5 = 12-05 (j=29).
  // Necesidad = mín 10 + D(29)−D(8) = 21 → 10 + 21 − 22 = 9 → q = max(qNormal 0, 9) = 9 (adelanto).
  const r = proyectar(base({ filas: [fila({ fisico: 30 })], cierres: [cierre()] }));
  const p = r.filas.filter((f) => f.tipo === "proyectado");
  assertEquals(p[0].fecha_oc, "2026-11-14");
  assertEquals([p[0].cantidad, p[0].adelanto_cierre, p[0].cierre_id, p[0].cierre_tarde], [9, true, 7, false]);
  assertEquals(p[0].fecha_llegada, "2026-11-19");
  assertEquals(p.some((f) => f.fecha_oc >= "2026-11-20" && f.fecha_oc <= "2026-11-29"), false);
});

Deno.test("cierre: hoy cerrado → día 0 sin compra; compra normal desde que reabre", () => {
  const r = proyectar(base({ filas: [fila({ fisico: 0 })], cierres: [cierre({ ini: "2026-11-01", fin: "2026-11-10" })] }));
  const p = r.filas.filter((f) => f.tipo === "proyectado");
  assertEquals(p[0].fecha_oc, "2026-11-11");
  assertEquals(p[0].cierre_id, null);
});

Deno.test("cierre: U ya pasó → cobertura hoy marcada tarde, llega al reabrir", () => {
  const r = proyectar(base({ filas: [fila({ fisico: 5 })], cierres: [cierre({ ini: "2026-11-08", fin: "2026-11-15" })] }));
  const d0 = r.filas.find((f) => f.tipo === "proyectado" && f.fecha_oc === "2026-11-06");
  assertEquals([d0?.cantidad, d0?.adelanto_cierre, d0?.cierre_tarde], [20, true, true]);
  assertEquals(d0?.fecha_llegada, "2026-11-16");
});

Deno.test("cierre: una OC abierta que llegaría en el cierre se recorre al reabrir (fila comprometido y bloqueo)", () => {
  const abiertas = [{ zoho_po_id: "P", sku: "A", vendor_id: "V1", vendor_name: "Prov 1", pendiente: 5, precio: 10,
    fecha_oc: "2026-11-01", fecha_entrega: "2026-11-22", facturada: false }];
  const r = proyectar(base({ filas: [fila({ fisico: 30, enOcAbierta: true })], abiertas, cierres: [cierre()] }));
  const com = r.filas.find((f) => f.tipo === "comprometido")!;
  assertEquals([com.fecha_llegada, com.cierre_id], ["2026-11-30", 7]);
});

Deno.test("cierre limitado a otro SKU no cambia nada", () => {
  const sin = proyectar(base({ filas: [fila({ fisico: 30 })] }));
  const con = proyectar(base({ filas: [fila({ fisico: 30 })], cierres: [cierre({ skus: ["Z"] })] }));
  assertEquals(con.filas.map((f) => [f.fecha_oc, f.cantidad]), sin.filas.map((f) => [f.fecha_oc, f.cantidad]));
});
Deno.test("cierre: artículo con mínimo y máximo en 0 no recibe compra de cobertura", () => {
  const r = proyectar(base({ filas: [fila({ fisico: 5, minimo: 0, maximo: 0 })], cierres: [cierre()] }));
  assertEquals(r.filas.filter((f) => f.tipo === "proyectado").length, 0);
});
Deno.test("cierre: un segundo cierre a menos de un LT del primero se cubre desde antes del primero (posición ≥ mín hasta R_B)", () => {
  // LT 5, 1/día, mín 10, máx 20. A = 11-20..25, B = 11-29..12-05 (U_B = 11-23 cae en A). R_B = 12-06 + 5 = 12-11.
  const cierres = [cierre({ id: 1, ini: "2026-11-20", fin: "2026-11-25" }), cierre({ id: 2, ini: "2026-11-29", fin: "2026-12-05" })];
  const r = proyectar(base({ filas: [fila({ fisico: 20 })], curvas: { A: lineal(1, 60) }, horizonte: 45, cierres }));
  const p = r.filas.filter((f) => f.tipo === "proyectado");
  const cob = p.filter((f) => f.cierre_id != null);
  // Una sola compra de cobertura el 11-14: pos 12; necesidad = 10 + D(35) − D(8) − 12 = 25.
  assertEquals(cob.map((f) => [f.fecha_oc, f.cantidad, f.cierre_id, f.adelanto_cierre]), [["2026-11-14", 25, 2, true]]);
  const cerrado = (d: string) => cierres.some((c) => d >= c.ini && d <= c.fin);
  assertEquals(p.filter((f) => cerrado(f.fecha_oc)).map((f) => f.fecha_oc), [], "no compra en días cerrados");
  // Posición (físico − demanda + compras hechas) nunca baja del mínimo antes de R_B (día 35).
  for (let j = 0; j < 35; j++) {
    const fecha = new Date(Date.UTC(2026, 10, 6 + j)).toISOString().slice(0, 10);
    const pos = 20 - j + p.filter((f) => f.fecha_oc <= fecha).reduce((s, f) => s + f.cantidad, 0);
    if (pos < 10) throw new Error(`posición ${pos} < mínimo el ${fecha}`);
  }
});