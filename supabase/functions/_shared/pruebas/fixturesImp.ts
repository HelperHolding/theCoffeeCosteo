// deno-lint-ignore-file no-explicit-any
// Datos de prueba de Importaciones y Café (plan 3e): entradas de los motores de las Sheets y los nombres de la app vieja
// que hay que evaluar para la paridad. No importa appVieja.ts (que lee Deno.env): también lo usan las pruebas de Vitest.
import { CAFE_PROD, IMP_ESCS } from "../impCafeCfg.ts";

/** Generador determinista (el mismo de appVieja.ts). */
function rng(seed: number) {
  return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
}

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
