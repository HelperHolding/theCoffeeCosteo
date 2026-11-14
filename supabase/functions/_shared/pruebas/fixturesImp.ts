// deno-lint-ignore-file no-explicit-any
// Datos de prueba de Importaciones y Café (plan 3e): entradas de los motores de las Sheets y los nombres de la app vieja
// que hay que evaluar para la paridad. No importa appVieja.ts (que lee Deno.env): también lo usan las pruebas de Vitest.
import { CAFE_PROD, IMP_ESCS } from "../impCafeCfg.ts";
import { PLAN_AP_FUERA } from "../planEngine.ts";
import type { DatosPlan } from "../planDatos.ts";

/** Generador determinista (el mismo de appVieja.ts). */
function rng(seed: number) {
  return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
}
/** Como _planDatCargar: los estatus fuera del pipeline se conservan; lo demás es 'en_proceso'. */
const aperturasNorm = (ap: any[]) => ap.map((a) => ({ ...a, estatusOrig: a.estatus, estatus: PLAN_AP_FUERA[a.estatus] ? a.estatus : "en_proceso" }));

/** Configuración de Importaciones y Café (impCafeCfg.ts). */
export const NOMBRES_IMP_CFG = [
  "_planCfgNum", "_MESES_ABR", "_IMP_HOJA_ITEMS", "_IMP_HOJA_PROV", "_IMP_HOJA_TEMP", "_CAFE_PROD", "_CAFE_HOJA", "_IMP_ESCS",
  "_IMP_CONT_TIPOS", "_IMP_DEF_JSON", "_impTxt", "_impClave", "_impArr", "_impMapMes", "_impMesTxt", "_impFechaOk",
  "_impCfgDef", "_impCfgNorm", "_cafeCfgDef", "_cafeCfgNorm", "_IMP_ETQ", "_IMP_ETQ_CAMPO", "_impCafeEtq",
];

/**
 * Entrada del motor de importaciones armada a mano desde una sección imp normalizada (sin la plataforma): inventario y
 * en camino deterministas por artículo. Sirve para la paridad del motor, que no depende de la plataforma.
 */
export function entradaImpHoja(ci: any, hoy: string, o: { esc?: string; seed?: number; sucHoy?: number; corregir?: boolean } = {}) {
  const r = rng(o.seed ?? 7), items: any[] = [];
  ci.orden.forEach((sku: string, i: number) => {
    const it = ci.items[sku];
    if (!it || it.activo === false) return;
    const conCamino = r() < 0.4, local = r() < 0.2;
    items.push({ sku, producto: it.nombre, familia: it.familia, proveedor: it.prov, unidad: it.unidad,
      stockHoy: Math.round(r() * 400) - (i === 3 ? 500 : 0), ventaSucursalMes: it.venta, kitApertura: it.kit, empaque: it.empaque,
      minimoProveedor: it.minimo, costoUnitario: it.costo, yaComprado: conCamino ? Math.round(r() * 300) : 0,
      llega: conCamino ? hoyMas(hoy, Math.round(r() * 120) - 10) : null, compraLocal: local ? 40 : 0, llegaLocal: local ? hoyMas(hoy, 75) : null,
      origen: "", largoCm: null, anchoCm: null, altoCm: null, cbmDato: it.cbm, fuenteCbm: it.cbm_fuente, aliasPlan: it.alias });
  });
  const cons: any = { proveedorContenedor: (ci.prov.find((p: any) => p.contenedor) || ci.prov[0]).clave };
  if (o.corregir ?? ci.corregir_hoja) { cons.planDemandaCruzada = []; cons.ultimoContenedorSinChequeoHorizonte = false; cons.nContenedoresCalendario = 11; }
  const plan: number[] = [], cierres: number[] = [], ovr: number[] = [];
  for (let m = 0; m < 15; m++) { plan.push(ci.red.plan_def + (m % 4)); cierres.push(m === 6 ? 1 : 0); ovr.push(m < 3 ? m + 2 : ci.red.plan_def); }
  const P: any = { fechaCorte: hoy, escenarioActivo: o.esc ?? ci.escenario, escenarios: {},
    red: { sucursalesHoy: o.sucHoy ?? 80, aperturasPlan: plan, cierres, aperturasConsideradasOverride: ovr },
    politica: { mesesCobertura: ci.politica.meses_cobertura, mesesRespaldo: ci.politica.meses_respaldo, diasMargen: ci.politica.dias_margen, diasJuntarPedido: ci.politica.dias_juntar },
    proveedores: ci.prov.map((p: any) => ({ clave: p.clave, nombre: p.nombre, leadNormal: p.lead, leadCierres: p.cierres, fuente: p.nota })),
    contenedor: { tipo: ci.contenedor.tipo, opciones: [{ tipo: "40' HQ", cbm: ci.contenedor.cbm40 }, { tipo: "45' HQ", cbm: ci.contenedor.cbm45 }, { tipo: "Personalizado", cbm: ci.contenedor.cbmp }],
      llenadoReal: ci.contenedor.llenado, contenedoresPorEmbarque: ci.contenedor.por_embarque, diasRespaldoSiguiente: ci.contenedor.dias_respaldo },
    compraPuente: { diasColchon: ci.puente.dias_colchon, multiplo: ci.puente.multiplo },
    temporada: JSON.parse(JSON.stringify(ci.temporada)), constantes: cons };
  IMP_ESCS.forEach((k) => { const e = ci.escenarios[k]; P.escenarios[k] = { crecimientoAnual: e.crec, cumplimientoAperturas: e.cumpl, ajusteDemanda: e.ajuste }; });
  return { P, items };
}
export function hoyMas(iso: string, n: number): string {
  const p = iso.split("-");
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]) + n * 864e5).toISOString().slice(0, 10);
}

/** Entrada del motor de café desde una sección cafe normalizada con un arranque dado (como _cafeArmar). */
export function entradaCafe(cc: any, esc: string, red: { ini: number; a0: number } | null) {
  const P: any = { anio: cc.anio, escenarioActivo: esc, escenarios: [], cierresPorMes: cc.cierres.slice(), ajusteGeneral: cc.ajuste,
    pctComprometer: cc.comprometer, curva2a6: cc.curva.slice(), estacionalidad: cc.estacionalidad.slice(), compra2026Kg: cc.compra_ant, productos: [] };
  ["Pesimista", "Base", "Optimista"].forEach((k) => {
    const e = cc.escenarios[k];
    P.escenarios.push({ nombre: k, crecimientoAnual: e.crec, compraMadura: e.madura, compraMesApertura: e.apertura,
      sucursalesInicio: red ? red.ini : e.ini, aperturasOctDic2026: red ? red.a0 : e.a0, aperturasPorMes: e.aper.slice() });
  });
  CAFE_PROD.forEach((p) => {
    const a = cc.prod[p.id];
    P.productos.push({ id: p.id, nombre: p.nombre, colorGrupo: p.color, presentacion: p.pres, mezclaPct: a.mezcla, kgPorBolsa: p.kg,
      vigente: { precioKg: a.precio, empaque: a.empaque, precioVentaBolsa: a.venta }, nuevo: { precioKg: a.nuevo_precio, empaque: a.nuevo_empaque },
      notaVigente: a.empaque > 0 ? "Empaque fijo $7.57 (precio actual). Revisar precio de venta." : null });
  });
  return P;
}

// ═══ Datos de la plataforma para Importaciones y Café (R de _planDatCargar) ═══════════════════════════════════════

export const HOY_IMP = "2026-11-13";
/** Lo que porta planImp.ts, además de los datos del plan y la configuración. */
export const NOMBRES_IMP = [
  "_impSkuKey", "_impDiaNum", "_impNumDia", "_impFraccionMes", "_impSucPromedio", "_impIdxProm", "_impVentasPlat", "_impVentasMemo",
  "_impOcLineas", "_impCatalogo", "_impPipelineMes", "_impRed", "_impArmar", "_impSigLocal", "_impSumaInv", "_impCorrer",
  "_impMemo", "_impEngine", "_impAhoraDatos",
];
/** _impCorrer y _cafeCorrer leen globales del navegador: se leen de globalThis para poder cambiarlos entre casos. */
export const STUBS_IMP = [
  "var _planRaw=new Proxy({},{get:function(t,k){return globalThis.__R?globalThis.__R[k]:undefined;}});",
  "var _impUI=new Proxy({},{get:function(t,k){return (globalThis.__UI||{})[k];}});",
  "var _cafeUI=new Proxy({},{get:function(t,k){return (globalThis.__UI||{})[k];}});",
].join("\n");

const art = (o: Record<string, unknown>) => ({ estatus: "Compra Recurrente", categoria: "Desechables", zoho_sync_at: null, saldo_yulius: 0,
  cantidad_por_apertura: 0, minimo_compra_pzas: 0, multiplo_compra: 1, dias_seguridad: null, created_at: "2024-01-10T15:00:00+00:00", origen: "IMPORTADO", ...o });
export const CAT_IMP = [
  art({ sku: "INS-DES-021", nombre: "VASO KRAFT 12 OZ", costo_unitario: 600, saldo_cedis: 120, saldo_yulius: 30, proveedor_preferido: "GREEN PACKAGING SA", cantidad_por_apertura: 2 }),
  art({ sku: "ins-des-005", nombre: "VASO PET 14 OZ", costo_unitario: 0, saldo_cedis: 40, zoho_sync_at: "2026-11-12T12:00:00Z", zoho_stock_fisico: 55, zoho_stock: 50, proveedor_preferido: "GREEN PACKAGING SA" }),
  art({ sku: "INS-DES-012", nombre: "TAPA 80 MM", costo_unitario: 350, saldo_cedis: -20, proveedor_preferido: "GREEN PACKAGING SA", estatus: "Hasta Agotar Existencias" }),
  art({ sku: "MER-TER-001", nombre: "TERMO 240 ML BLANCO", costo_unitario: 125, saldo_cedis: 900, proveedor_preferido: "Easy Drinkware", origen: "LOCAL" }),
  art({ sku: "MER-TAZ-001", nombre: "TAZA 300 ML NEGRA", costo_unitario: 80, saldo_cedis: 15, proveedor_preferido: null, estatus: "Prueba" }),
  art({ sku: "INS-BA-063", nombre: "BOLSA CAFE 250 G NEGRA", costo_unitario: 190, saldo_cedis: 0, proveedor_preferido: "LQC" }),
  art({ sku: "INS-CAF-001", nombre: "CAFE TOSTADO EN GRANO BLACK (1.5 KG)", categoria: "Café", costo_unitario: 495, saldo_cedis: 80, proveedor_preferido: "CAFICULTORES OMAC", origen: null, cantidad_por_apertura: 4 }),
  art({ sku: "INS-CAF-002", nombre: "CAFE TOSTADO EN GRANO KRAFT (1.5 KG)", categoria: "Café", costo_unitario: 494, saldo_cedis: 0, proveedor_preferido: "CAFICULTORES OMAC", origen: null }),
  art({ sku: "INS-CAF-003", nombre: "CAFE TOSTADO EN GRANO WHITE (1.5 KG)", categoria: "Café", costo_unitario: 494, saldo_cedis: 400, proveedor_preferido: "CAFICULTORES OMAC", origen: null, cantidad_por_apertura: 10 }),
  art({ sku: "INS-NUE-777", nombre: "Café tostado molido 250 gramos", categoria: "Café", costo_unitario: 0, saldo_cedis: 3, proveedor_preferido: "Tostador Local", origen: null }),
  art({ sku: "IMP-NUE-900", nombre: "CUCHARA DE MADERA", costo_unitario: 1, saldo_cedis: 500, proveedor_preferido: "Maderas", origen: "IMPORTADO" }),
  art({ sku: "ALI-JAR-001", nombre: "Mermelada", categoria: "Alimentos", costo_unitario: 40, saldo_cedis: 12, proveedor_preferido: "Mermeladas", origen: null }),
];
const SKUS_VENTA = ["INS-DES-021", "INS-DES-005", "INS-DES-012", "MER-TER-001", "INS-BA-063", "INS-CAF-001", "INS-CAF-002", "INS-CAF-003", "INS-NUE-777", "ALI-JAR-001"];
/** 130 días de pedidos (dos a futuro) de los artículos de importación y café, de sucursales activas y en proceso. */
export function pedidosImp(n = 500): any[] {
  const r = rng(41), out: any[] = [];
  for (let i = 0; i < n; i++) {
    const dias = Math.floor(r() * 130) - 2;
    const t = Date.UTC(2026, 10, 13, 6) - dias * 864e5 + Math.floor(r() * 24) * 3600e3;
    const items: any[] = [];
    for (let j = 0, nl = 1 + Math.floor(r() * 3); j < nl; j++) items.push({ sku: SKUS_VENTA[Math.floor(r() * SKUS_VENTA.length)], nombre: "x", cantidad: Math.round(r() * 12) });
    const a = r();
    out.push({ id: "q" + i, fecha_pedido: new Date(t).toISOString(), status: "enviado", apertura_id: a < 0.6 ? "s" + (i % 7) : a < 0.7 ? "e1" : null,
      franquiciatario_email: "f@x.com", items, items_editados: null });
  }
  return out;
}
export const APERTURAS_IMP = [
  { id: "s0", estatus: "activa", fecha: "2024-03-01" }, { id: "s1", estatus: "activa", fecha: "2025-07-15" }, { id: "s2", estatus: "activa", fecha: null },
  { id: "s3", estatus: "activa", fecha: "2026-10-01" }, { id: "s4", estatus: "activa", fecha: "2026-11-02" }, { id: "s5", estatus: "activa", fecha: "2026-12-20" },
  { id: "s6", estatus: "activa", fecha: "fecha mala" },
  { id: "e1", estatus: "en_proceso", fecha: "2026-11-25" }, { id: "e2", estatus: "en_proceso", fecha: "2026-12-05" }, { id: "e3", estatus: "por_abrir", fecha: "2027-02-10" },
  { id: "e4", estatus: "en_proceso", fecha: "2026-10-20" }, // vencida dentro de vencida_max (45 días)
  { id: "e5", estatus: "en_proceso", fecha: "2026-06-01" }, // vencida hace más de 45 días
  { id: "e6", estatus: "en_proceso", fecha: null }, // sin fecha
  { id: "e7", estatus: "en_proceso", fecha: "2028-06-01" }, // después del horizonte de 15 meses
  { id: "e8", estatus: "en_proceso", fecha: "2027-01-31" }, { id: "e9", estatus: "en_proceso", fecha: "2027-12-15" },
  { id: "x1", estatus: "cancelada", fecha: "2027-01-10" },
];
export const OC_IMP = [
  { id: "i1", sku: "INS-DES-021", folio: "COM-OC-02001", fecha: "2026-10-01", fecha_arribo: "2026-12-28", cantidad: 300, cantidad_recibida: 0, monto: 180000, proveedor: "GREEN PACKAGING SA" },
  { id: "i2", sku: "INS-DES-021", folio: "COM-OC-02002", fecha: "2026-10-20", fecha_arribo: "2027-01-20", cantidad: 100, cantidad_recibida: 0, monto: 60000, proveedor: "GREEN PACKAGING SA" },
  { id: "i3", sku: "ins-des-005", folio: "COM-OC-02003", fecha: "2026-09-10", fecha_arribo: null, cantidad: 80, cantidad_recibida: 20, monto: 50000, proveedor: "GREEN PACKAGING SA" }, // sin arribo: se estima
  { id: "i4", sku: "MER-TER-001", folio: "COM-OC-02004", fecha: "2026-06-01", fecha_arribo: "2026-08-01", cantidad: 500, cantidad_recibida: 0, monto: 62000, proveedor: "Easy Drinkware" }, // vieja
  { id: "i5", sku: "INS-BA-063", folio: "COM-OC-02005", fecha: "2026-11-10", fecha_arribo: "2027-02-01", cantidad: 40, cantidad_recibida: 0, monto: 7600, proveedor: "LQC" }, // borrador en la carga de Zoho
  { id: "i6", sku: "INS-CAF-003", folio: "COM-OC-02006", fecha: "2026-11-11", fecha_arribo: "2026-11-15", cantidad: 200, cantidad_recibida: 0, monto: 98800, proveedor: "CAFICULTORES OMAC" },
  { id: "i7", sku: "INS-DES-012", folio: "COM-OC-02007", fecha: "2026-11-01", fecha_arribo: "2027-01-20", cantidad: 60, cantidad_recibida: 60, monto: 21000, proveedor: "GREEN PACKAGING SA" }, // recibida
];
export const ZOHO_OC_IMP = { cargado: "2026-11-12T10:00:00Z", lineas: [
  { sku: "INS-BA-063", folio: "COM-OC-02005", prov: "LQC", fecha: "2026-11-10", arribo: "2027-02-01", pend: 40, borrador: true },
] };
/** R como lo arma _planDatCargar, con los artículos de importación y café. */
export function datosImp(extra: Partial<DatosPlan> = {}): DatosPlan {
  return { hoy: HOY_IMP, hist: 120, histReal: 400, cat: CAT_IMP, pedidos: pedidosImp(),
    lt: [{ sku: "INS-DES-021", dias: 95 }, { sku: "MER-TER-001", dias: 60 }, { sku: "INS-CAF-001", dias: 3 }],
    map: [], oc: OC_IMP, comp: [{ id: "c1", sku: "INS-DES-021", folio: "P-9", cantidad: 10, fecha: "2026-11-12" }],
    aperturas: aperturasNorm(APERTURAS_IMP), pedAper: [], kit: { e1: true }, conteoUlt: { cedis: {}, yulius: {} }, ocZohoBorr: [],
    srv: null, avisos: [], cargadoEn: 1, ...extra };
}
