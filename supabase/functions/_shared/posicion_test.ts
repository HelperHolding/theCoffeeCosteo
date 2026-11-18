import { assertEquals } from "@std/assert";
import { cargarAbiertas, cargarFilas } from "./posicion.ts";

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

Deno.test("cargarFilas: posición con físico; contable solo como respaldo; facturado sin recibir no se cuenta doble", async () => {
  const mm = (sku: string) => ({ sku, minimo: 10, maximo: 20, venta_diaria: 1, kits_max: 0, lead_time: 5 });
  const filas = await cargarFilas(dbTablas({
    com_minmax: [mm("CAB"), mm("SIN")],
    com_catalogo: [
      { sku: "CAB", nombre: "Caballete", zoho_stock: 12, zoho_stock_fisico: 5, saldo_yulius: 0 },
      { sku: "SIN", nombre: "Sin físico", zoho_stock: 12, zoho_stock_fisico: null, saldo_yulius: 0 },
    ],
    com_zoho_oc_lineas: [{ sku: "CAB", status: "billed", cantidad: 10, cantidad_recibida: 0 }],
    com_oc_auto: [],
  }), "2026-11-07T00:00:00Z");
  const cab = filas.find((f) => f.sku === "CAB")!, sin = filas.find((f) => f.sku === "SIN")!;
  assertEquals([cab.fisico, cab.enCamino, cab.fisico + cab.enCamino, cab.fisicoRespaldo], [5, 10, 15, false]);
  assertEquals([sin.fisico, sin.fisicoRespaldo], [12, true]);
});
