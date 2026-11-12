import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { conciliar, excedeTope, lineasDesdeZoho, type Conciliacion, type FilaPlat, type LineaZoho } from "./conciliarOc.ts";

const HOY = "2026-11-09";
const z = (o: Partial<LineaZoho> = {}): LineaZoho => ({
  folio: "COM-OC-01258", sku: "SKU1", ped: 120, rec: 0, pend: 120, arribo: "2026-10-20", fecha: "2026-10-06",
  prov: "Proveedor Uno", monto: null, borrador: false, ...o,
});
const p = (o: Partial<FilaPlat> = {}): FilaPlat => ({
  id: 1, sku: "SKU1", folio: "COM-OC-01258", fecha: "2026-10-06", fecha_arribo: "2026-10-20",
  cantidad: 120, cantidad_recibida: 0, monto: null, proveedor: "Proveedor Uno", ...o,
});

Deno.test("1 sin contraparte en Zoho y vencida -> cerrar", () => {
  const C = conciliar([], [p()], HOY);
  assertEquals(C.cerrar.map((x) => x.id), [1]);
});
Deno.test("2 mismo folio y SKU con mismo pendiente -> mantener", () => {
  const C = conciliar([z()], [p()], HOY);
  assertEquals(C.mantener.length, 1);
  assertEquals(C.ajustar.length, 0);
});
Deno.test("3 Zoho pide mas -> ajustar", () => {
  const C = conciliar([z({ ped: 155, pend: 155 })], [p({ cantidad: 39 })], HOY);
  assertEquals(C.ajustar.length, 1);
  assertEquals(C.ajustar[0].nuevaCant, 155);
  assertEquals(C.ajustar[0].nuevoRec, 0);
});
Deno.test("4 borrador de Zoho con pareja -> quitar", () => {
  const C = conciliar([z({ borrador: true })], [p()], HOY);
  assertEquals(C.quitar.length, 1);
  assertEquals(C.mantener.length, 0);
});
Deno.test("5 Zoho sin pareja: faltan o borradores", () => {
  assertEquals(conciliar([z()], [], HOY).faltan.length, 1);
  const C = conciliar([z({ borrador: true })], [], HOY);
  assertEquals(C.borradores.length, 1);
  assertEquals(C.faltan.length, 0);
});
Deno.test("6 arribo futuro no en Zoho -> futuras", () => {
  const C = conciliar([], [p({ fecha_arribo: "2026-11-20" })], HOY);
  assertEquals(C.futuras.length, 1);
  assertEquals(C.cerrar.length, 0);
});
Deno.test("7 creada dentro de gracia -> respetar", () => {
  const C = conciliar([], [p({ fecha: "2026-11-08" })], HOY);
  assertEquals(C.respetar.length, 1);
  assertEquals(C.cerrar.length, 0);
});
Deno.test("8 formatos de folio distintos comparten key", () => {
  const C = conciliar([z({ folio: "COM-OC-01258" })], [p({ folio: "OC 1258" })], HOY);
  assertEquals(C.mantener.length, 1);
  assertEquals(C.mantener[0].p.key, C.mantener[0].z.key);
});
Deno.test("9 idempotencia tras aplicar", () => {
  const rows = [
    p({ id: 1, sku: "A", folio: "OC 1" }),
    p({ id: 2, sku: "B", folio: "COM-OC-00002", cantidad: 39 }),
  ];
  const L = [z({ folio: "COM-OC-00002", sku: "B", ped: 155, pend: 155 })];
  const C = conciliar(L, rows, HOY);
  assertEquals(C.cerrar.length, 1);
  assertEquals(C.ajustar.length, 1);
  const aplicadas = rows.map((r) => {
    if (C.cerrar.some((x) => x.id === r.id)) return { ...r, cantidad_recibida: r.cantidad };
    const a = C.ajustar.find((x) => x.p.id === r.id);
    return a ? { ...r, cantidad: a.nuevaCant, cantidad_recibida: a.nuevoRec } : r;
  });
  const C2 = conciliar(L, aplicadas, HOY);
  assertEquals([C2.cerrar.length, C2.ajustar.length, C2.faltan.length], [0, 0, 0]);
});
Deno.test("10 excedeTope", () => {
  const mk = (cerrar: number, abiertas: number) =>
    ({ cerrar: new Array(cerrar).fill(0), abiertas: new Array(abiertas).fill(0) }) as unknown as Conciliacion;
  assertEquals(excedeTope(mk(101, 1000)), true);
  assertEquals(excedeTope(mk(16, 20)), true);
  assertEquals(excedeTope(mk(15, 20)), false); // piso: 15 o menos nunca dispara el 30 %
  assertEquals(excedeTope(mk(1, 3)), false);
  assertEquals(excedeTope(mk(16, 60)), false); // 16 <= 30 % de 60
  assertEquals(excedeTope(mk(5, 100)), false);
});
Deno.test("11 lineasDesdeZoho", () => {
  const base = { cantidad_recibida: null, fecha_entrega: "2026-10-20", fecha_oc: "2026-10-06", vendor_name: "V", status: "open" };
  const L = lineasDesdeZoho([
    { ...base, po_number: "PO1", sku: "A", cantidad: 10, precio: 2.5 },
    { ...base, po_number: "PO1", sku: "B", cantidad: 4, precio: 1.25, status: "Draft", cantidad_recibida: 1 },
    { ...base, po_number: "PO1", sku: "(sin-sku)", cantidad: 8, precio: 1 },
    { ...base, po_number: "", sku: "C", cantidad: 9, precio: 1 },
  ]);
  assertEquals(L.length, 2);
  assertEquals(L[0].monto, 38); // 25 + 5 + 8: total de la OC, solo en la primera línea
  assertEquals(L[1].monto, null);
  assertEquals(L[1].borrador, true);
  assertEquals(L[1].pend, 3);
  assertEquals(L[0].rec, 0);
});
Deno.test("12 linea totalmente recibida en Zoho con fila ya cerrada: no se reinserta", () => {
  const L = [z({ ped: 10, rec: 10, pend: 0 })];
  const rows = [p({ cantidad: 10, cantidad_recibida: 10 })];
  for (let i = 0; i < 2; i++) {
    const C = conciliar(L, rows, HOY);
    assertEquals(C.faltan.length, 0);
    assertEquals([C.mantener.length, C.ajustar.length, C.cerrar.length, C.quitar.length], [0, 0, 0, 0]);
  }
});
Deno.test("13 linea pend 0 en Zoho con fila abierta del mismo folio y SKU -> ajustar y cerrar", () => {
  const C = conciliar([z({ ped: 120, rec: 120, pend: 0 })], [p()], HOY);
  assertEquals(C.ajustar.length, 1);
  assertEquals(C.ajustar[0].nuevaCant, 120);
  assertEquals(C.ajustar[0].nuevoRec, 120);
  assertEquals(C.faltan.length, 0);
});
Deno.test("14 paso 2: otro formato de folio, mismo SKU, proveedor y cantidad; fecha cercana", () => {
  const L = [z({ folio: "PO-777", prov: "Tostadores Andinos SAS", fecha: "2026-10-06" })];
  const cerca = conciliar(L, [p({ folio: "OC 1258", proveedor: "Andinos", fecha: "2026-10-20" })], HOY);
  assertEquals(cerca.mantener.length, 1);
  assertEquals(cerca.faltan.length, 0);
  const lejos = conciliar(L, [p({ folio: "OC 1258", proveedor: "Andinos", fecha: "2026-11-05" })], HOY);
  assertEquals(lejos.mantener.length, 0);
  assertEquals(lejos.faltan.length, 1);
});
Deno.test("15 paso 2 ignora lineas pend 0 de Zoho", () => {
  const C = conciliar([z({ folio: "PO-777", ped: 120, rec: 120, pend: 0 })], [p({ folio: "OC 1258" })], HOY);
  assertEquals(C.ajustar.length, 0);
  assertEquals(C.faltan.length, 0);
});
