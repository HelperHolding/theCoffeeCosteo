// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL del Plan de abastos del sitio viejo (app/index.html a9e4a22, bloque "TODAS las compras … por categoría",
// 39802–40063, que sustituye al de la PARTE E): las tres categorías (_PSEM_CATS), los grupos por proveedor de lo local y el
// café (_psemGrupos) y de Importaciones (_psemGruposImp), las compras ya emitidas (_psemPasadas, _psemImpSet), los totales
// (_planSemCalc), la familia de cada artículo (_psemFamDe) y lo que ordena hoy la simulación (_psemHoyMonto), más
// _planSemW (35035) y _psemSum. Sin globales: el plan local, el de café y la corrida de Importaciones se reciben.
// planSem_parity_test.ts compara contra la app.
import { planEngDia, planEngDifDias } from "./planEngine.ts";
import { borradorFoliosPlan, type DatosPlan, zocKey } from "./planDatos.ts";
import { planEsCafe } from "./planBuild.ts";
import { cfgConImp, type CorridaImp, impDif } from "./planImp.ts";
import type { PlanProv } from "./planProv.ts";

export type CatId = "local" | "cafe" | "imp";
export interface CatDef { id: CatId; nombre: string; sub: string; color: string }
export const PSEM_CATS: CatDef[] = [
  { id: "local", nombre: "Todo lo demás", sub: "compras locales", color: "#374151" },
  { id: "cafe", nombre: "Café", sub: "café tostado", color: "#92400E" },
  { id: "imp", nombre: "Importaciones", sub: "exterior, por contenedor", color: "#7C3AED" },
];
/** Qué categorías entran al dinero a disponer (_psemUI().inc). */
export type Inc = Record<CatId, boolean>;

/** Grupo de un proveedor en una categoría, con piezas y dinero por semana. */
export interface GrupoSem {
  key: string; pk: string; cat: CatId; fuente: "" | "cafe" | "imp"; nombre: string; real: boolean; rows: any[];
  monto: number[]; n: number[]; uds: number[]; sinCosto: number[]; minimo: number; total?: number;
}
export interface CatSem { def: CatDef; provs: GrupoSem[]; monto: number[]; n: number[]; sinCosto: number[]; err: string; aviso: string; rot: number; arts: number }
export interface Sem { cat: Record<CatId, CatSem>; provs: GrupoSem[]; tot: { monto: number[]; n: number[]; sinCosto: number[] } }

export function psemZ(n: number): number[] { return new Array(n).fill(0); }
export function psemSum(a: number[], i: number, j: number): number { var t = 0; for (var x = i; x < j; x++) t += a[x] || 0; return t; }
/** Semanas que se ven: las elegidas (4/8/12) si caben en el plan; si no, hasta 12 (_planSemW con _planSemUI.sem). */
export function planSemW(c: { W: number } | null, sem: number): number { if (!c) return 0; var v = sem; return v > 0 && v <= c.W ? v : Math.min(c.W, 12); }

// ── Datos por categoría ──
// Local y café: el plan (filas con piezas por semana × costo) agrupado por proveedor.
// El café se cuenta solo en su categoría: con compra.excluir_cafe=false el plan local también trae sus filas.
export function psemGrupos(plan: { rows: any[] } | null, catId: CatId, fuente: "" | "cafe", c: { minManual: Record<string, number> }, W: number): GrupoSem[] {
  var map: Record<string, GrupoSem> = {}, provs: GrupoSem[] = [];
  (plan && plan.rows || []).forEach(function (r) {
    if (r.sinMov || r.importacion || (catId === "local" && r.esCafe)) return;
    var key = catId + "|" + r.provKey, g = map[key];
    if (!g) { g = map[key] = { key: key, pk: r.provKey, cat: catId, fuente: fuente, nombre: r.provNombre, real: r.provKey !== "__sin__", rows: [], monto: psemZ(W), n: psemZ(W), uds: psemZ(W), sinCosto: psemZ(W), minimo: c.minManual[r.provKey] || 0 }; provs.push(g); }
    g.rows.push(r);
    for (var k = 0; k < W; k++) { var q = r.sem[k]; if (q > 0) { g.n[k]++; g.uds[k] += q; if (r.costo > 0) g.monto[k] += q * r.costo; else g.sinCosto[k]++; } }
  });
  return provs;
}
// Importaciones: primer pedido de cada producto (en su semana) y los contenedores del proveedor de contenedores (plan de embarques).
// `ic` es la corrida de Importaciones (el viejo llamaba _impCorrer(c.cfg)); la lista de artículos del plan sale de su
// configuración normalizada (ic.cfg.imp), que es la c.cfg.imp del viejo.
export function psemGruposImp(c: PlanProv, W: number, ic: CorridaImp | null): { provs: GrupoSem[]; err: string; urg?: number; sinPlan?: number } {
  if (!ic) return { provs: [], err: "Todavía no hay datos de importaciones." };
  if (!ic.S) return { provs: [], err: ic.err || "No se pudo calcular el plan de importaciones." };
  var S = ic.S, items = ic.ent.items, P = c.P, hoy = c.hoyIso, gp = ic.ent.P.constantes.proveedorContenedor, prov: Record<string, any> = {};
  ic.cfg.imp.prov.forEach(function (p: any) { prov[p.clave] = p; });
  var map: Record<string, GrupoSem> = {}, provs: GrupoSem[] = [], urg = 0;
  var gr = function (clave: string) {
    var key = "imp|" + clave, g = map[key];
    if (!g) { var pv = prov[clave]; g = map[key] = { key: key, pk: clave, cat: "imp", fuente: "imp", nombre: pv ? pv.nombre : clave, real: true, rows: [], monto: psemZ(W), n: psemZ(W), uds: psemZ(W), sinCosto: psemZ(W), minimo: 0 }; provs.push(g); }
    return g;
  };
  var sem = function (iso: any) { var d = impDif(hoy, iso); if (d === null) return -1; if (d < 0) d = 0; var k = Math.floor(d / P); return k < W ? k : -1; };
  S.productos.forEach(function (p: any, i: number) {
    var it = items[i], q = p.quiebre;
    if (/^URGENTE/.test(q.estado)) urg++;
    if (!it || it.proveedor === gp) return; // los del proveedor de contenedores se toman del plan de contenedores
    if (!(q.cantidadPedir > 0 && q.colocarPedido)) return;
    var k = sem(q.colocarPedido); if (k < 0) return;
    var g = gr(it.proveedor), row: any = { sku: it.sku, nombre: q.producto, provKey: it.proveedor, provNombre: g.nombre, costo: it.costoUnitario, sem: psemZ(W), s: { lt: q.leadTime }, fechaLimite: q.colocarPedido, llega: q.llegaCedis, imp: true, unidad: q.unidad, ventaMes: q.ventaMes3, calc: {} };
    row.sem[k] = q.cantidadPedir; row.ctx = (function () { var cons = isFinite(q.ventaMes3) && q.ventaMes3 > 0 ? q.ventaMes3 / 30 : 0, aft = Math.max(0, q.stockAlLlegar || 0) + Math.max(0, q.llegadasCobertura || 0) + q.cantidadPedir; return { tienes: q.stockHoy, enOC: q.yaComprado || 0, consumo: cons, diasHoy: cons > 0 ? Math.max(0, q.stockHoy) / cons : null, quedas: aft, diasQuedas: cons > 0 ? aft / cons : null }; })(); row.urg = /^(URGENTE|PEDIR YA)/.test(q.estado || ""); row.m = psemZ(W); g.rows.push(row); g.n[k]++; g.uds[k] += q.cantidadPedir;
    if (it.costoUnitario > 0) { var mm = q.inversion || q.cantidadPedir * it.costoUnitario; g.monto[k] += mm; row.m[k] = mm; } else g.sinCosto[k]++;
  });
  ((S.plan && S.plan.contenedores) || []).forEach(function (ct: any) {
    if (!(ct.inversion > 0) || !ct.colocar || !(ct.cbm > 0) || /^Fuera del horizonte/.test(ct.estado || "")) return;
    var k = sem(ct.colocar); if (k < 0) return;
    var g = gr(gp), row: any = { sku: "CONT-" + ct.n, nombre: "Contenedor " + ct.n + " (" + nf0(ct.cbm) + " CBM)", provKey: gp, provNombre: g.nombre, costo: ct.inversion, sem: psemZ(W), s: { lt: (prov[gp] && (prov[gp].lead + (prov[gp].cierres || 0))) || 0 }, fechaLimite: ct.colocar, llega: ct.llega, imp: true, contenedor: true, unidad: "contenedor", calc: {} };
    row.sem[k] = 1; row.urg = /^PEDIR YA/.test(ct.estado || ""); row.m = psemZ(W); row.m[k] = ct.inversion; g.rows.push(row); g.n[k]++; g.uds[k]++; g.monto[k] += ct.inversion;
  });
  // Artículos de importación del plan local que todavía no están en el plan de Importaciones (no se les calculó compra)
  var enModulo: Record<string, 1> = {}; (ic.cfg.imp.orden || []).forEach(function (s: string) { enModulo[s] = 1; });
  var sinPlan = c.rows.filter(function (r) { return !r.sinMov && r.importacion && !enModulo[r.sku]; }).length;
  return { provs: provs, err: "", urg: urg, sinPlan: sinPlan };
}
// _planN(x, 0) del viejo (es-MX, sin decimales) para el nombre del contenedor.
var NF0 = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
function nf0(x: any): string { return NF0.format(Number(x)); }

/** Artículos de importación: los del plan local, los del plan de Importaciones y los IMPORTADO del catálogo. */
export function psemImpSet(c: PlanProv, R: DatosPlan | null): Record<string, 1> {
  var s: Record<string, 1> = {}, ci = cfgConImp(c.cfg).imp;
  (c.rows || []).forEach(function (r) { if (r.importacion) s[r.sku] = 1; });
  ((ci && ci.orden) || []).forEach(function (k: string) { s[k] = 1; });
  if (R) R.cat.forEach(function (r) { if (String(r.origen || "").toUpperCase() === "IMPORTADO") s[r.sku] = 1; });
  return s;
}
export interface Pasadas { local: number[]; cafe: number[]; imp: number[]; ini: string[]; sinMonto: number; np: number }
// Compras ya emitidas (OCs con monto) de las últimas 6 semanas, separadas por categoría según los artículos de cada OC.
// Un folio en borrador (de la carga de Zoho o de zoho-sync, decisión 6 del 3d) todavía no es una compra.
export function psemPasadas(c: PlanProv, R: DatosPlan | null): Pasadas {
  var np = 6, P = c.P, out: Pasadas = { local: psemZ(np), cafe: psemZ(np), imp: psemZ(np), ini: [], sinMonto: 0, np: np };
  for (var j = 0; j < np; j++) out.ini.push(planEngDia(c.hoyIso, -(P * (j + 1) - 1)));
  if (!R || !R.oc) return out;
  var cat: Record<string, any> = {}; R.cat.forEach(function (r) { cat[r.sku] = r; });
  var impSet = psemImpSet(c, R), folios: Record<string, any> = {}, bor = borradorFoliosPlan(R, c.cfg);
  R.oc.forEach(function (r: any) {
    if (!r.folio || !r.fecha) return;
    if (bor && bor[zocKey(r.folio)]) return; // OC en borrador en Zoho: todavía no es una compra
    var f = folios[r.folio] || (folios[r.folio] = { fecha: String(r.fecha).slice(0, 10), monto: 0, imp: false, cafe: false });
    f.monto += Number(r.monto || 0);
    if (impSet[r.sku]) f.imp = true; else { var cr = cat[r.sku]; if (cr && planEsCafe(cr)) f.cafe = true; }
  });
  Object.keys(folios).forEach(function (fo) {
    var f = folios[fo], d = planEngDifDias(c.hoyIso, f.fecha);
    if (d < 0 || d >= P * np) return;
    if (!(f.monto > 0)) { out.sinMonto++; return; }
    (out as any)[f.imp ? "imp" : f.cafe ? "cafe" : "local"][Math.floor(d / P)] += f.monto;
  });
  return out;
}

/** Fuentes de las otras dos categorías: el plan de café y la corrida de Importaciones (pueden lanzar o venir vacías). */
export interface FuentesSem { cafe: () => PlanProv | null; imp: () => CorridaImp | null }

// Totales por categoría, por proveedor y por semana (el filtro de proveedor de la pantalla no se toca aquí).
export function planSemCalc(c: PlanProv, inc: Inc, Wv: number, f: FuentesSem): Sem {
  var W = c.W, cat = {} as Record<CatId, CatSem>, k: number, cc: PlanProv | null = null;
  PSEM_CATS.forEach(function (d) { cat[d.id] = { def: d, provs: [], monto: psemZ(W), n: psemZ(W), sinCosto: psemZ(W), err: "", aviso: "", rot: 0, arts: 0 }; });
  cat.local.provs = psemGrupos(c, "local", "", c, W);
  try { cc = f.cafe(); if (cc) cat.cafe.provs = psemGrupos(cc, "cafe", "cafe", c, W); } catch (e: any) { cat.cafe.err = e && e.message || String(e); }
  try { var gi = psemGruposImp(c, W, f.imp()); cat.imp.provs = gi.provs; cat.imp.err = gi.err || ""; cat.imp.rot = gi.urg || 0; if (gi.sinPlan) cat.imp.aviso = gi.sinPlan + " artículo" + (gi.sinPlan === 1 ? "" : "s") + " de importación del catálogo no está" + (gi.sinPlan === 1 ? "" : "n") + " en el plan de Importaciones (agrégalos en Importaciones > Parámetros): su compra no está contada aquí."; } catch (e: any) { cat.imp.err = e && e.message || String(e); }
  PSEM_CATS.forEach(function (d) {
    var C = cat[d.id], skus: Record<string, 1> = {};
    C.provs.forEach(function (g) {
      for (k = 0; k < W; k++) { C.monto[k] += g.monto[k]; C.n[k] += g.n[k]; C.sinCosto[k] += g.sinCosto[k]; }
      g.total = 0; for (k = 0; k < Wv; k++) g.total += g.monto[k];
      g.rows.forEach(function (r) { if (r.sem.slice(0, Wv).some(function (x: number) { return x > 0; })) skus[r.sku] = 1; });
    });
    C.provs.sort(function (a, b) { return (b.total as number) - (a.total as number) || a.nombre.localeCompare(b.nombre); });
    C.arts = Object.keys(skus).length;
    if (d.id !== "imp") {
      var plan = d.id === "local" ? c : cc;
      C.rot = plan ? plan.rows.filter(function (r) { return !r.sinMov && !r.importacion && !(d.id === "local" && r.esCafe) && r.calc.diasAlcanza !== null && r.calc.diasAlcanza < r.s.lt; }).length : 0;
    }
  });
  var provs: GrupoSem[] = [], tot = { monto: psemZ(W), n: psemZ(W), sinCosto: psemZ(W) };
  PSEM_CATS.forEach(function (d) {
    if (!inc[d.id]) return;
    cat[d.id].provs.forEach(function (g) { provs.push(g); });
    for (k = 0; k < W; k++) { tot.monto[k] += cat[d.id].monto[k]; tot.n[k] += cat[d.id].n[k]; tot.sinCosto[k] += cat[d.id].sinCosto[k]; }
  });
  return { cat: cat, provs: provs, tot: tot };
}

// Dónde se va el dinero: por familia (jarabes, polvos, tisanas, desechables, café) y sus proveedores principales
export function psemFamDe(sku: any, nombre: any, det: any, cat: string): string {
  if (cat === "cafe") return "Café";
  var q = function (x: any) { return String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); };
  var d = q(det), n = q(nombre), s = String(sku || "").toUpperCase();
  if (/desechable/.test(d) || /^INS-DES|^INS-DEL/.test(s)) return "Desechables";
  if (/^cafe\b/.test(d) || /^INS-CAF/.test(s)) return "Café";
  // Con clasificación de Zoho solo las bebidas y la barra se reparten en estas familias; limpieza, foods, señalización, uniformes... son Otros
  if (d && !/bebida|barra/.test(d)) return "Otros";
  if ((!d || /bebida/.test(d)) && /vaso|tapa\b|tapas|popote|servilleta\b|bolsa|desechable|envase|charola|domo|kraft|agitador|\bcup\b|\blid\b/.test(n)) return "Desechables";
  if (/jarabe|salsa|syrup|sirope/.test(n)) return "Jarabes";
  if (/tisana|infusion|jamaica|manzanilla|terneatea|\bte\b|earl grey|hierbabuena|flor de/.test(n) && !/fuze|600 ml|2 lts/.test(n)) return "Tisanas";
  if (/polvo|powder|matcha|chai|cocoa|cacao|frapp|\bbase\b|horchata|chocolate|\bchip\b|creamer|leche|isopure|costal|proteina/.test(n)) return "Polvos";
  return "Otros";
}
// Lo que la simulación del servidor ordena HOY (lo mismo que la OC automática): Σ pedirHoy × costo de las filas que vienen del servidor.
export function psemHoyMonto(provs: GrupoSem[]): number {
  var t = 0; (provs || []).forEach(function (g) { g.rows.forEach(function (r) { var k = r.calc || {}; if (k.fuente === "servidor" && k.pedirHoy > 0 && r.costo > 0) t += k.pedirHoy * r.costo; }); });
  return t;
}
