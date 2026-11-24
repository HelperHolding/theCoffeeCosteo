import { assertEquals } from "@std/assert";
import { cargarAbiertas, cargarFilas, esBorrador, type Fila, type OcProveedor, sinBorradores } from "./posicion.ts";

// Doble mínimo de db: from().select().order().order().range() devuelve las filas dadas.
function dbCon(filas: Record<string, unknown>[]) {
  const q = { select: () => q, order: () => q, range: () => Promise.resolve({ data: filas, error: null }) };
  return { from: () => q } as never;
}

Deno.test("cargarAbiertas: marca facturada solo a 'billed'; partially_billed sigue comprometida; cerradas fuera", async () => {
  const l = { vendor_id: "V", vendor_name: "P", cantidad: 5, cantidad_recibida: 1, precio: 10, fecha_oc: "2026-11-01", fecha_entrega: null };
  const r = await cargarAbiertas(dbCon([
    { ...l, zoho_po_id: "1", sku: "A", status: "billed" },
    { ...l, zoho_po_id: "2", sku: "A", status: "Billed" },
    { ...l, zoho_po_id: "3", sku: "A", status: "partially_billed" },
    { ...l, zoho_po_id: "4", sku: "A", status: "open" },
    { ...l, zoho_po_id: "5", sku: "A", status: "closed" },
  ]));
  assertEquals(r.map((x) => [x.zoho_po_id, x.facturada, x.pendiente]), [["1", true, 4], ["2", true, 4], ["3", false, 4], ["4", false, 4]]);
});

function dbTablas(t: Record<string, Record<string, unknown>[]>) {
  return {
    from: (tabla: string) => {
      const q = { select: () => q, order: () => q, eq: () => q, gt: () => q,
        range: () => Promise.resolve({ data: t[tabla] ?? [], error: null }) };
      return q;
    },
  } as never;
}

Deno.test("cargarFilas: posición con el contable, sin importar el físico; facturado sin recibir no se cuenta doble", async () => {
  const mm = (sku: string) => ({ sku, minimo: 10, maximo: 20, venta_diaria: 1, kits_max: 0, lead_time: 5 });
  const filas = await cargarFilas(dbTablas({
    com_minmax: [mm("CAB"), mm("SIN")],
    com_catalogo: [
      { sku: "CAB", nombre: "Caballete", zoho_stock: 12, zoho_stock_fisico: 5, saldo_yulius: 0 },
      { sku: "SIN", nombre: "Sin físico", zoho_stock: 12, zoho_stock_fisico: null, saldo_yulius: 0 },
    ],
    com_zoho_oc_lineas: [
      { sku: "CAB", status: "billed", cantidad: 10, cantidad_recibida: 0 },
      { sku: "SIN", status: "open", cantidad: 7, cantidad_recibida: 2 },
    ],
    com_oc_auto: [],
  }), "2026-11-07T00:00:00Z");
  const cab = filas.find((f) => f.sku === "CAB")!, sin = filas.find((f) => f.sku === "SIN")!;
  // La OC "billed" ya subió el contable: bloquea recompras, pero no suma en camino.
  assertEquals([cab.inventario, cab.enCamino, cab.enOcAbierta], [12, 0, true]);
  assertEquals([sin.inventario, sin.enCamino, sin.enOcAbierta], [12, 5, true]);
});

const fila = (o: Partial<Fila>): Fila => ({
  sku: "A", nombre: "A", zoho_item_id: "i", zoho_vendor_id: "v1", zoho_vendor_name: "P", costo: 10, inventario: 0,
  saldo_yulius: 0, enCamino: 0, enOcAbierta: false, minimo: 340, maximo: 640, venta_diaria: 20, kits_max: 0, multiplo: null,
  minimoPzas: null, lead_time: 7, ...o,
});
const oc = (o: Partial<OcProveedor>): OcProveedor => ({
  zoho_po_id: "po1", po_number: "COM-OC-1", status: "draft", vendor_id: "v1", vendor_name: "P", sku: "A", item_id: "i",
  cantidad: 100, pendiente: 100, precio: 10, fecha_oc: "2026-11-16", ...o,
});

Deno.test("esBorrador solo para draft", () => {
  assertEquals(["draft", "DRAFT", "open", "billed"].map(esBorrador), [true, true, false, false]);
});

Deno.test("sinBorradores quita el pendiente del borrador y desbloquea si no queda nada en camino", () => {
  const out = sinBorradores([fila({ enCamino: 100, enOcAbierta: true })], [oc({})]);
  assertEquals([out[0].enCamino, out[0].enOcAbierta], [0, false]);
});

Deno.test("sinBorradores deja bloqueado si además hay una OC emitida", () => {
  const out = sinBorradores([fila({ enCamino: 150, enOcAbierta: true })], [oc({ pendiente: 100 })]);
  assertEquals([out[0].enCamino, out[0].enOcAbierta], [50, true]);
});

Deno.test("sinBorradores no toca un SKU cuyo proveedor de catálogo es otro", () => {
  const filas = [fila({ zoho_vendor_id: "v2", enCamino: 100, enOcAbierta: true })];
  const out = sinBorradores(filas, [oc({})]);
  assertEquals([out[0].enCamino, out[0].enOcAbierta], [100, true]);
  assertEquals(filas[0].enCamino, 100); // no muta
});
