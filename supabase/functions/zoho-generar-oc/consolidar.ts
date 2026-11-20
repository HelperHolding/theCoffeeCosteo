import { SKU_MARCADOR } from "../zoho-sync/sync.ts";
import { esBorrador, type Fila, type OcProveedor, sinBorradores } from "../_shared/posicion.ts";
import type { Linea, Propuesta } from "./generar.ts";

export type Grupo = Propuesta["porProveedor"][number];
export type Consolidada = {
  vendor_id: string; vendor_name: string;
  borradores: { zoho_po_id: string; po_number: string }[];
  monto_antes: number;
  quitados: { sku: string; nombre: string; antes: number }[];
};
export type Alerta = {
  vendor_id: string; vendor_name: string;
  emitidas: { zoho_po_id: string; po_number: string; fecha_oc: string | null }[];
  skus: { sku: string; nombre: string; cantidad: number }[];
};
export type PlanConsolidar = { porProveedor: Grupo[]; consolidadas: Consolidada[]; alertas: Alerta[] };

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Proveedores con algo nuevo que pedir hoy y al menos un borrador abierto. */
export function vendoresConBorrador(prop: Propuesta, ocs: OcProveedor[]): Set<string> {
  const conLineas = new Set(prop.porProveedor.filter((g) => g.lineas.length).map((g) => g.vendor_id));
  const out = new Set<string>();
  for (const o of ocs) if (esBorrador(o.status) && conLineas.has(o.vendor_id)) out.add(o.vendor_id);
  return out;
}

export function planConsolidar(a: {
  filas: Fila[]; ocs: OcProveedor[]; prop: Propuesta; proponerCon: (filas: Fila[]) => Propuesta;
}): PlanConsolidar {
  const vendores = vendoresConBorrador(a.prop, a.ocs);
  const borradores = a.ocs.filter((o) => esBorrador(o.status) && vendores.has(o.vendor_id));
  const filaDe = new Map(a.filas.map((x) => [x.sku, x]));
  const manejado = (o: OcProveedor) => o.sku !== SKU_MARCADOR && filaDe.get(o.sku)?.zoho_vendor_id === o.vendor_id;
  const prop2 = vendores.size ? a.proponerCon(sinBorradores(a.filas, borradores)) : a.prop;
  const grupo2 = new Map(prop2.porProveedor.map((g) => [g.vendor_id, g]));

  const consolidadas: Consolidada[] = [];
  const porProveedor: Grupo[] = [];
  for (const g of a.prop.porProveedor) {
    if (!vendores.has(g.vendor_id)) { porProveedor.push(g); continue; }
    const suyos = borradores.filter((o) => o.vendor_id === g.vendor_id);
    const nuevos = new Set(g.lineas.map((l) => l.sku));
    const antes = new Map<string, number>();
    for (const o of suyos) antes.set(o.sku, (antes.get(o.sku) ?? 0) + o.cantidad);
    const base = grupo2.get(g.vendor_id) ?? g;
    const lineas: Linea[] = base.lineas
      .filter((l) => nuevos.has(l.sku) || antes.has(l.sku))
      .map((l) => nuevos.has(l.sku) ? { ...l, origen: "nuevo" as const } : { ...l, origen: "recalculado" as const, antes: antes.get(l.sku)! });
    const vistos = new Set(lineas.map((l) => l.sku));
    const quitados: Consolidada["quitados"] = [];
    const sueltos = new Map<string, OcProveedor[]>();
    for (const o of suyos) {
      if (manejado(o)) {
        if (!vistos.has(o.sku) && !quitados.some((q) => q.sku === o.sku)) {
          quitados.push({ sku: o.sku, nombre: filaDe.get(o.sku)!.nombre, antes: antes.get(o.sku)! });
        }
        continue;
      }
      sueltos.set(o.sku, [...(sueltos.get(o.sku) ?? []), o]);
    }
    for (const [sku, ls] of sueltos) {
      const cantidad = ls.reduce((s, o) => s + o.cantidad, 0);
      lineas.push({
        sku, nombre: filaDe.get(sku)?.nombre ?? sku, item_id: ls.find((o) => o.item_id)?.item_id ?? "", cantidad,
        costo: ls[0].precio ?? 0, disponible: 0, enCamino: 0, minimo: 0, maximo: 0, venta_diaria: 0, kits: 0,
        origen: "borrador", antes: cantidad,
      });
    }
    lineas.sort((x, y) => x.sku.localeCompare(y.sku));
    const monto = r2(lineas.reduce((s, l) => s + l.cantidad * l.costo, 0));
    porProveedor.push({ ...base, vendor_name: base.vendor_name || g.vendor_name, lineas, monto });
    const unicos = new Map(suyos.map((o) => [o.zoho_po_id, o.po_number]));
    consolidadas.push({
      vendor_id: g.vendor_id, vendor_name: g.vendor_name,
      borradores: [...unicos].map(([zoho_po_id, po_number]) => ({ zoho_po_id, po_number })).sort((x, y) => x.po_number.localeCompare(y.po_number)),
      monto_antes: r2(suyos.reduce((s, o) => s + o.cantidad * (o.precio ?? 0), 0)),
      quitados: quitados.sort((x, y) => x.sku.localeCompare(y.sku)),
    });
  }
  porProveedor.sort((x, y) => x.vendor_id.localeCompare(y.vendor_id));

  const alertas: Alerta[] = [];
  for (const g of porProveedor) {
    const emitidas = new Map<string, OcProveedor>();
    for (const o of a.ocs) if (o.vendor_id === g.vendor_id && !esBorrador(o.status)) emitidas.set(o.zoho_po_id, o);
    if (!emitidas.size) continue;
    const pedidas = g.lineas.filter((l) => l.origen === undefined || l.origen === "nuevo");
    if (!pedidas.length) continue;
    alertas.push({
      vendor_id: g.vendor_id, vendor_name: g.vendor_name,
      emitidas: [...emitidas.values()].map((o) => ({ zoho_po_id: o.zoho_po_id, po_number: o.po_number, fecha_oc: o.fecha_oc })),
      skus: pedidas.map((l) => ({ sku: l.sku, nombre: l.nombre, cantidad: l.cantidad })),
    });
  }
  return { porProveedor, consolidadas, alertas };
}
