// deno-lint-ignore-file no-explicit-any
// Datos de prueba del plan (catálogo, pedidos, OCs, por enviar, aperturas) para las pruebas de paridad del plan 3d.
import { PLAN_AP_FUERA } from "../planEngine.ts";
import type { DatosPlan } from "../planDatos.ts";
import { NOMBRES_MOTOR, rng } from "./appVieja.ts";

export const HOY = "2026-11-02";

/** Lo que planDatos.ts porta, además del motor. */
export const NOMBRES_DATOS = [
  ...NOMBRES_MOTOR, "today", "_planIso", "_planParseItems", "parseLocalDate", "daysUntil", "_CORP_EMAILS", "_PLAN_AP_FUERA",
  "_PLAN_RE_NOTA_APERTURA", "_planDatTipo", "_planDatAMotor", "_planOcDeZoho", "_planOcFuente", "_zocKey", "_zocBorrMemo",
  "_zocFuenteBorr", "_zocBorradorSet", "_comSaldoCedis", "_planInvUltSync", "_planHistNecesaria",
];

export const CAT = [
  { sku: "INS-VAS-001", nombre: "Vaso 12 oz", estatus: "Compra Recurrente", categoria: "Desechables", created_at: "2024-01-10T15:00:00+00:00", costo_unitario: 2.5, saldo_cedis: 50, saldo_yulius: 20, zoho_sync_at: "2026-11-01T12:00:00Z", zoho_stock: 40, zoho_stock_fisico: 45, cantidad_por_apertura: 100, minimo_compra_pzas: 0, multiplo_compra: 1, dias_seguridad: null, proveedor_preferido: "Vasos SA", origen: null },
  { sku: "ALI-JAR-003", nombre: "Mermelada", estatus: "Compra Recurrente", categoria: "Alimentos", created_at: "2026-10-20T05:59:00+00:00", costo_unitario: "40", saldo_cedis: 7, saldo_yulius: null, zoho_sync_at: null, zoho_stock: null, zoho_stock_fisico: null, cantidad_por_apertura: 0, minimo_compra_pzas: 12, multiplo_compra: 6, dias_seguridad: "", proveedor_preferido: null, origen: "IMPORTADO" },
  { sku: "INS-NUE-005", nombre: "Café tostado en grano", estatus: "Compra Recurrente", categoria: "Café", created_at: "2026-10-31T18:00:00+00:00", costo_unitario: null, saldo_cedis: -4, saldo_yulius: 3, zoho_sync_at: "2026-10-20T12:00:00Z", zoho_stock: 2, zoho_stock_fisico: null, cantidad_por_apertura: 3, minimo_compra_pzas: 0, multiplo_compra: 1, dias_seguridad: 5, proveedor_preferido: "Tostador", origen: null },
  { sku: "EMP-TAP-007", nombre: "Tapa", estatus: "Compra Unica", categoria: null, created_at: null, costo_unitario: 1, saldo_cedis: 0, saldo_yulius: 0, zoho_sync_at: null, cantidad_por_apertura: 0, minimo_compra_pzas: 0, multiplo_compra: 1, dias_seguridad: null, proveedor_preferido: "Tapas", origen: null },
  { sku: "INS-AGO-009", nombre: "Agotar", estatus: "Hasta Agotar Existencias", categoria: "X", created_at: "2025-01-01", costo_unitario: 3, saldo_cedis: 9, cantidad_por_apertura: 0, minimo_compra_pzas: 0, multiplo_compra: 1, proveedor_preferido: "X", origen: null },
];
export const MAPA = [{ shopify_nombre: "Vaso 12oz", sku: "ins-vas-001 " }, { shopify_nombre: "Mermelada", sku: "ALI-JAR-003" },
  { shopify_nombre: "Tapa", sku: "EMP-TAP-007" }, { shopify_nombre: "Fantasma", sku: "NO-EXISTE" }];
export const APERTURAS = [
  { id: "ap1", estatus: "en_proceso", fecha: "2026-10-25" }, { id: "ap2", estatus: "activa", fecha: "2026-09-01" },
  { id: "ap3", estatus: null, fecha: null }, { id: "ap4", estatus: "activa", fecha: "2026-10-28" },
  { id: "ap5", estatus: "activa", fecha: "2026-10-15" }, { id: "ap6", estatus: "por_abrir", fecha: "2026-11-20" },
];
/** Como _planDatCargar: los estatus fuera del pipeline se conservan; lo demás es 'en_proceso'. */
export const aperturasNorm = (ap: any[]) =>
  ap.map((a) => ({ ...a, estatusOrig: a.estatus, estatus: PLAN_AP_FUERA[a.estatus] ? a.estatus : "en_proceso" }));

/** Pedidos de 95 días (2 a futuro) con ítems sucios, editados, tipos y aperturas variadas. */
export function pedidos(n = 400): any[] {
  const r = rng(99), out: any[] = [];
  const nombres = ["Vaso 12oz", "Mermelada", "Tapa", "Fantasma", "Sin mapeo", "vaso 12oz"];
  for (let i = 0; i < n; i++) {
    const dias = Math.floor(r() * 95) - 2;
    const t = Date.UTC(2026, 10, 2, 0, 0) - dias * 864e5 + Math.floor(r() * 24) * 3600e3 + Math.floor(r() * 60) * 60e3;
    const items: any[] = [];
    for (let j = 0, nl = 1 + Math.floor(r() * 3); j < nl; j++) {
      const conSku = r() < 0.3 ? { sku: r() < 0.5 ? "INS-VAS-001" : "ins-nue-005" } : {};
      const q = r() < 0.05 ? (r() < 0.5 ? -2 : "x") : r() < 0.05 ? null : Math.round(r() * 20);
      items.push({ nombre: nombres[Math.floor(r() * nombres.length)], cantidad: q, ...conSku });
    }
    const v = r(), apSel = r();
    out.push({
      id: "p" + i, fecha_pedido: new Date(t).toISOString(), status: "enviado",
      apertura_id: apSel < 0.3 ? null : apSel < 0.35 ? "000" : apSel < 0.5 ? "ap1" : apSel < 0.6 ? "ap2" : apSel < 0.65 ? "ap3" : apSel < 0.75 ? "ap4" : "ap-x",
      franquiciatario_email: r() < 0.05 ? " WorkAt@mx.thecoffee.jp" : r() < 0.05 ? "marketingtc@mx.thecoffee.jp" : "f@x.com",
      notas_shopify: r() < 0.04 ? "Pedido de APERTURA sucursal" : null,
      es_llenado_canal: r() < 0.03, marketing_proyecto_id: r() < 0.03 ? "m1" : null,
      items: r() < 0.5 ? items : JSON.stringify(items),
      items_editados: v < 0.15 ? items.map((x) => ({ nombre: x.nombre, cantidad: 1 })) : v < 0.2 ? [] : null,
    });
  }
  return out;
}
export const COMP = [
  { id: "c1", sku: "INS-VAS-001", folio: "P-1", cantidad: 5, fecha: "2026-10-30" },
  { id: "c2", sku: "INS-VAS-001", folio: "P-2", cantidad: 7, fecha: "2026-09-15" },            // viejo (> 30 días)
  { id: "c3", sku: "ALI-JAR-003", folio: "P-2", cantidad: 2, fecha: null, fecha_envio: "2026-08-01" },
  { id: "c4", sku: "INS-NUE-005", folio: null, cantidad: "3", fecha: null, fecha_envio: null, created_at: "2026-11-01T10:00:00Z" },
];
export const OC = [
  { id: "o1", sku: "INS-VAS-001", folio: "COM-OC-01250", fecha: "2026-10-20", fecha_arribo: "2026-11-10", cantidad: 100, cantidad_recibida: 20, monto: 900, proveedor: "Vasos SA" },
  { id: "o2", sku: "INS-VAS-001", folio: "COM-OC-01100", fecha: "2026-08-01", fecha_arribo: "2026-08-20", cantidad: 50, cantidad_recibida: 0, monto: 400, proveedor: "Vasos SA" },  // vieja con arribo
  { id: "o3", sku: "ALI-JAR-003", folio: "COM-OC-01120", fecha: "2026-08-15", fecha_arribo: null, cantidad: 30, cantidad_recibida: 0, monto: 0, proveedor: null },          // vieja sin arribo
  { id: "o4", sku: "ALI-JAR-003", folio: "COM-OC-01255", fecha: "2026-10-28", fecha_arribo: "2026-11-05", cantidad: 12, cantidad_recibida: 0, monto: 480, proveedor: "Mermeladas" }, // borrador en la carga de Zoho
  { id: "o5", sku: "INS-NUE-005", folio: "DODO-OC-00070", fecha: "2026-10-30", fecha_arribo: "2026-11-03", cantidad: 10, cantidad_recibida: 10, monto: 50, proveedor: "Tostador" },  // recibida
  { id: "o6", sku: "INS-NUE-005", folio: "DODO-OC-00071", fecha: "2026-10-31", fecha_arribo: "2026-11-04", cantidad: 10, cantidad_recibida: 0, monto: 0, proveedor: "Tostador" },
];
export const ZOHO_OC = { cargado: "2026-10-29T10:00:00Z", conciliado: "2026-10-30T10:00:00Z", lineas: [
  { sku: "ali-jar-003", folio: "COM-OC-01255", prov: "Mermeladas", fecha: "2026-10-28", arribo: "2026-11-05", pend: 12, borrador: true },
  { sku: "INS-VAS-001", folio: "COM-OC-01250", prov: "Vasos SA", fecha: "2026-10-20", arribo: "2026-11-10", pend: 80.00004, monto: "900.456" },
  { sku: "INS-NUE-005", folio: "DODO-OC-00071", prov: "Tostador", fecha: "2026-10-31", arribo: "fecha mala", pend: 10 },
  { sku: "", folio: "X", pend: 3 }, { sku: "Y", folio: "X", pend: 0 },
] };

/** R como lo arma _planDatCargar (la app lo recibe con hoy = today(); el servidor, con el día de CDMX). */
export function datos(extra: Partial<DatosPlan> = {}): DatosPlan {
  return { hoy: HOY, hist: 90, histReal: 400, cat: CAT, pedidos: pedidos(), lt: [{ sku: "INS-VAS-001", dias: 9 }, { sku: "ALI-JAR-003", dias: 0 }],
    map: MAPA, oc: OC, comp: COMP, aperturas: aperturasNorm(APERTURAS), pedAper: [{ pedido_id: "p3" }, { pedido_id: "p10" }],
    kit: { ap1: true }, conteoUlt: { cedis: { "INS-VAS-001": "2026-10-01" }, yulius: {} }, ocZohoBorr: [], srv: null, avisos: [],
    cargadoEn: 1, ...extra };
}
