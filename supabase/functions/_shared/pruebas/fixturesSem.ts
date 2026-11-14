// deno-lint-ignore-file no-explicit-any
// Datos de prueba del Plan de abastos y Esta semana (plan 3f): los de Importaciones y Café más compras locales con
// proveedores de Zoho (mínimos y días de crédito), OCs emitidas de las últimas semanas y borradores de zoho-sync. No importa
// appVieja.ts (que lee Deno.env): también lo usan las pruebas de Vitest.
import type { DatosPlan, LineaBorrador, Servidor } from "../planDatos.ts";
import { CAT_IMP, datosImp, OC_IMP, pedidosImp } from "./fixturesImp.ts";

/** Generador determinista (el mismo de appVieja.ts). */
function rng(seed: number) {
  return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
}

/** Lo que portan planSem.ts y planHoy.ts (además de los nombres del plan, Importaciones y Café). */
export const NOMBRES_SEM = [
  "_planSemUI", "_PSEM_CATS", "_psemZ", "_psemIncLeer", "_psemUI", "_psemGrupos", "_psemGruposImp", "_psemImpSet", "_psemPasadas",
  "_planSemCalc", "_psemSum", "_planSemW", "_psemFamDe", "_psemHoyMonto", "_zocBorradorFolios", "_zocBorrFolMemo", "_impDif",
  "_PLAN_MESES", "_planFechaCorta", "_planEngDia", "_planNF", "_planN",
];
/** Esta semana: pagos, riesgos y borradores. */
export const NOMBRES_HOY = [
  "_hoyUI", "_hoyGrupos", "_hoyRiesgos", "_borrAnalisis", "_ctxFila", "_PAGO_MARGEN", "_PAGO_DIAS", "_pagoViernesSig",
  "_pagoViernesAnt", "_pagoFecha", "_pagoTxt", "_pagoPedidoFecha", "_pagoPorFecha", "_planIso",
];
/**
 * _planSemCalc, _hoyRiesgos y _borrAnalisis leen globales del navegador: el plan local (_planCache), el de café
 * (_cafeOrdenes), la fuente de borradores (_borrFuente) y los días de crédito (_pagoCredito). Se leen de globalThis.
 */
export const STUBS_SEM = [
  "var _planCache=new Proxy({},{get:function(t,k){return globalThis.__C?globalThis.__C[k]:undefined;}});",
  "function _cafeOrdenes(){if(globalThis.__CC_ERR)throw new Error(globalThis.__CC_ERR);return globalThis.__CC;}",
  "function _planSimple(){return true;}",
  "function _borrFuente(){return globalThis.__F||null;}",
  "function _pagoCredito(n){return (globalThis.__CR||{})[n]||0;}",
].join("\n");

const loc = (o: Record<string, unknown>) => ({ estatus: "Compra Recurrente", categoria: "Barra", zoho_sync_at: null, saldo_yulius: 0,
  cantidad_por_apertura: 0, minimo_compra_pzas: 0, multiplo_compra: 1, dias_seguridad: null, created_at: "2024-01-10T15:00:00+00:00",
  origen: "LOCAL", clasificacion_detallada: null, zoho_vendor_id: null, ...o });
/** Artículos locales: proveedores con y sin vendor de Zoho, uno con paréntesis en el nombre, uno sin costo y uno sin proveedor. */
export const CAT_LOCAL = [
  loc({ sku: "LOC-VAS-001", nombre: "Vaso papel 8 oz", costo_unitario: 1.2, saldo_cedis: 300, proveedor_preferido: "Vasos SA", zoho_vendor_id: "v3", clasificacion_detallada: "Desechables" }),
  loc({ sku: "LOC-JAR-001", nombre: "Jarabe vainilla 1 L", costo_unitario: 95, saldo_cedis: 10, proveedor_preferido: "Jarabes MX", zoho_vendor_id: "v4", clasificacion_detallada: "Bebidas > Jarabes" }),
  loc({ sku: "LOC-JAR-002", nombre: "Jarabe caramelo 1 L", costo_unitario: 95, saldo_cedis: 65, proveedor_preferido: "Jarabes MX", zoho_vendor_id: "v4" }),
  loc({ sku: "LOC-POL-001", nombre: "Polvo chai 1 kg", costo_unitario: 210, saldo_cedis: 0, proveedor_preferido: "Polvos y Bases" }),
  loc({ sku: "LOC-LEC-001", nombre: "Leche deslactosada", costo_unitario: 25, saldo_cedis: 40, proveedor_preferido: "Lácteos (refrigerados)" }),
  loc({ sku: "LOC-TIS-001", nombre: "Tisana jamaica", costo_unitario: 0, saldo_cedis: 5, proveedor_preferido: "Tisanas" }),
  loc({ sku: "LOC-SIN-001", nombre: "Servilleta", costo_unitario: 0.3, saldo_cedis: 10, proveedor_preferido: null, clasificacion_detallada: "Limpieza" }),
];
export const CAT_SEM = [...CAT_IMP, ...CAT_LOCAL];
const SKUS_LOCAL = ["LOC-VAS-001", "LOC-JAR-001", "LOC-JAR-002", "LOC-POL-001", "LOC-LEC-001", "LOC-TIS-001", "LOC-SIN-001"];
/** 130 días de pedidos de artículos locales (además de los de importación y café). */
export function pedidosSem(n = 400): any[] {
  const r = rng(77), out: any[] = pedidosImp();
  for (let i = 0; i < n; i++) {
    const dias = Math.floor(r() * 130) - 1;
    const t = Date.UTC(2026, 10, 13, 6) - dias * 864e5 + Math.floor(r() * 24) * 3600e3;
    const items: any[] = [];
    for (let j = 0, nl = 1 + Math.floor(r() * 3); j < nl; j++) {
      const sku = SKUS_LOCAL[Math.floor(r() * SKUS_LOCAL.length)];
      items.push({ sku, nombre: "x", cantidad: Math.round(r() * (sku === "LOC-VAS-001" ? 400 : 8)) });
    }
    out.push({ id: "l" + i, fecha_pedido: new Date(t).toISOString(), status: "enviado", apertura_id: "s" + (i % 7), franquiciatario_email: "f@x.com", items, items_editados: null });
  }
  return out;
}
/** OCs locales de las últimas semanas: con monto, sin monto, un borrador de Zoho y una fuera de las 6 semanas. */
export const OC_LOCAL = [
  { id: "l1", sku: "LOC-JAR-001", folio: "COM-OC-03010", fecha: "2026-11-10", fecha_arribo: "2026-11-17", cantidad: 20, cantidad_recibida: 20, monto: 1900, proveedor: "Jarabes MX" },
  { id: "l2", sku: "LOC-JAR-002", folio: "COM-OC-03010", fecha: "2026-11-10", fecha_arribo: "2026-11-17", cantidad: 10, cantidad_recibida: 10, monto: 950, proveedor: "Jarabes MX" },
  { id: "l3", sku: "LOC-VAS-001", folio: "COM-OC-03011", fecha: "2026-10-27", fecha_arribo: "2026-11-03", cantidad: 2000, cantidad_recibida: 2000, monto: 2400, proveedor: "Vasos SA" },
  { id: "l4", sku: "LOC-LEC-001", folio: "COM-OC-03012", fecha: "2026-10-15", fecha_arribo: "2026-10-17", cantidad: 50, cantidad_recibida: 50, monto: 0, proveedor: "Lácteos (refrigerados)" },
  { id: "l5", sku: "LOC-JAR-001", folio: "COM-OC-03001", fecha: "2026-11-12", fecha_arribo: "2026-11-19", cantidad: 40, cantidad_recibida: 0, monto: 3800, proveedor: "Jarabes MX" },
  { id: "l6", sku: "LOC-POL-001", folio: "COM-OC-03013", fecha: "2026-08-01", fecha_arribo: "2026-08-20", cantidad: 5, cantidad_recibida: 5, monto: 1050, proveedor: "Polvos y Bases" },
];
export const OC_SEM = [...OC_IMP, ...OC_LOCAL];
/** Borradores de Zoho (com_zoho_oc_lineas con status 'draft'), como los lee el motor. */
export const BORR_SEM: LineaBorrador[] = [
  { po_number: "COM-OC-03001", sku: "LOC-JAR-001", vendor_name: "Jarabes MX", fecha_oc: "2026-11-12", cantidad: 40, cantidad_recibida: 0, precio: 95, synced_at: "2026-11-13T15:00:00Z" },
  { po_number: "COM-OC-03002", sku: "LOC-VAS-001", vendor_name: "Vasos SA", fecha_oc: "2026-11-11", cantidad: 6000, cantidad_recibida: 0, precio: 1.2, synced_at: "2026-11-13T15:00:00Z" },
  { po_number: "COM-OC-03002", sku: "LOC-TIS-001", vendor_name: "Vasos SA", fecha_oc: "2026-11-11", cantidad: 12, cantidad_recibida: 0, precio: null, synced_at: "2026-11-13T15:00:00Z" },
  { po_number: "COM-OC-03003", sku: "MER-TAZ-001", vendor_name: "Simbs", fecha_oc: "2026-09-01", cantidad: 10, cantidad_recibida: 0, precio: 80, synced_at: "2026-11-13T15:00:00Z" },
  { po_number: "COM-OC-03004", sku: "LOC-SIN-001", vendor_name: "Proveedor USD", fecha_oc: "2026-11-13", cantidad: 500, cantidad_recibida: 100, precio: null, synced_at: "2026-11-13T16:30:00Z" },
];
/**
 * Los mismos borradores como la carga de Zoho de la configuración (cfg.zoho_oc) que leía el viejo: la paridad le da esto
 * a la app (que no conoce com_zoho_oc_lineas) y al port, para que los dos excluyan los mismos.
 */
export const ZOHO_OC_SEM = { cargado: "2026-11-13T16:30:00Z", lineas: BORR_SEM.map((l) => {
  const pend = Number(l.cantidad) - Number(l.cantidad_recibida);
  return { sku: l.sku, folio: l.po_number, prov: l.vendor_name, fecha: l.fecha_oc, pend, monto: l.precio != null ? pend * l.precio : null, borrador: true };
}) };
/** com_zoho_proveedor: mínimos y días de crédito. "Lácteos" y "Green Packaging" solo se encuentran por nombre sin paréntesis. */
export const ZPROV_SEM = [
  { vendor_id: "v1", nombre: "CAFICULTORES OMAC", minimo_compra: 40000, dias_credito: 15 },
  { vendor_id: "v2", nombre: "Tostador Local", minimo_compra: 0, dias_credito: 0 },
  { vendor_id: "v3", nombre: "Vasos SA", minimo_compra: 0, dias_credito: 30 },
  { vendor_id: "v4", nombre: "Jarabes MX", minimo_compra: 5000, dias_credito: 0 },
  { vendor_id: "v5", nombre: "POLVOS Y BASES", minimo_compra: 0, dias_credito: 7 },
  { vendor_id: "v6", nombre: "Lácteos", minimo_compra: 0, dias_credito: 45 },
  { vendor_id: "v7", nombre: "Green Packaging", minimo_compra: 0, dias_credito: 60 },
];
/** Simulación del servidor de hoy para algunos artículos locales (una compra hoy, otra en dos semanas). */
export const SRV_SEM: Servidor = { ok: true, motivo: null, calc: "2026-11-13T12:30:00Z", pagos: [], sinCosto: ["LOC-TIS-001"], sinProveedor: [],
  compras: [
    { sku: "LOC-JAR-001", fecha_oc: "2026-11-13", cantidad: 36, monto: 3420 },
    { sku: "LOC-JAR-001", fecha_oc: "2026-11-27", cantidad: 12, monto: 1140 },
    { sku: "LOC-POL-001", fecha_oc: "2026-11-15", cantidad: 6, monto: 1260 },
    { sku: "NO-EN-PLAN", fecha_oc: "2026-11-13", cantidad: 3, monto: 30 },
  ] };
/** R del Plan de abastos: Importaciones y Café más lo local. */
export function datosSem(extra: Partial<DatosPlan> = {}): DatosPlan {
  const base = datosImp();
  return { ...base, cat: CAT_SEM, pedidos: pedidosSem(), oc: OC_SEM,
    lt: [...base.lt, { sku: "LOC-VAS-001", dias: 5 }, { sku: "LOC-JAR-001", dias: 7 }, { sku: "LOC-JAR-002", dias: 7 }, { sku: "LOC-POL-001", dias: 20 }, { sku: "LOC-LEC-001", dias: 2 }],
    ocZohoBorr: BORR_SEM, zprov: ZPROV_SEM, ...extra };
}
