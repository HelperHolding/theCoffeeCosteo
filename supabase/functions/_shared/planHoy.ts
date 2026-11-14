// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL de "Esta semana" del sitio viejo (app/index.html a9e4a22, 40261–40440 y 40615–40886): los proveedores de la
// semana (_hoyGrupos 40360), lo que se quedaría sin producto (_hoyRiesgos 40368), los borradores de Zoho por resolver
// (_borrAnalisis 40288), el contexto de cada fila del detalle (_ctxFila 40866), el texto de "Copiar pedido" (_hoyCopiar
// 40433) y el viernes de pago (_PAGO_MARGEN, _pagoViernesSig/_pagoViernesAnt, _pagoFecha 40624, _pagoTxt,
// _pagoPedidoFecha 40662, _pagoPorFecha 40672). El viejo usaba Date locales del navegador; aquí los días son
// 'YYYY-MM-DD' de CDMX y se cuentan en UTC (mismo resultado). Sin globales: lo que el viejo leía de _planCache,
// _cafeOrdenes, _impCorrer, _borrFuente y _pagoCredito se recibe. planHoy_parity_test.ts compara contra la app.
import { fechaLocal, planEngDia, planEngDifDias } from "./planEngine.ts";
import { diaLocal, type DatosPlan, impFechaOk } from "./planDatos.ts";
import { type CorridaImp, impDif } from "./planImp.ts";
import type { PlanProv } from "./planProv.ts";
import { type CatId, type GrupoSem, PSEM_CATS, type Sem } from "./planSem.ts";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** _planFechaCorta: '2026-11-13' → '13 nov'. */
export function fechaCorta(iso: any): string { var p = String(iso || "").split("-"); return p.length < 3 || !(+p[1] >= 1 && +p[1] <= 12) ? String(iso || "") : (+p[2]) + " " + MESES[+p[1] - 1]; }
var NF = [0, 1, 2].map(function (n) { return new Intl.NumberFormat("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: n }); });
function planN(x: any, dec?: number): string { return NF[dec || 0].format(Number(x)); }
function planMoney(x: any): string { x = Number(x || 0); return (x < 0 ? "-" : "") + "$" + NF[0].format(Math.abs(x)); }
const diaSem = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay();

// ═══ Pagos ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// Cadencia de compra: se pide el lunes (máximo el martes) y se paga el viernes de esa semana; si el proveedor da crédito, se
// paga el viernes de la semana en que vence (días de crédito contados desde el pedido).
export const PAGO_MARGEN = 3; // días mínimos entre pedir y el viernes de pago: pedido el lunes o martes -> viernes de esa semana; miércoles en adelante -> el siguiente
export const PAGO_DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export function pagoViernesSig(iso: string): string { return planEngDia(iso, (5 - diaSem(iso) + 7) % 7); }
export function pagoViernesAnt(iso: string): string { return planEngDia(iso, -((diaSem(iso) - 5 + 7) % 7)); }
// Fecha (viernes) en que se paga un pedido hecho en la fecha "pedido" a un proveedor con "dias" de crédito
export function pagoFecha(pedido: string, dias: any): string {
  var p = pedido;
  var min = pagoViernesSig(planEngDia(p, PAGO_MARGEN));
  dias = Number(dias) || 0; if (!(dias > 0)) return min;
  var f = pagoViernesAnt(planEngDia(p, dias));
  return f < min ? min : f;
}
export function pagoTxt(iso: string): string { return PAGO_DIAS[diaSem(iso)] + " " + (+iso.slice(8, 10)) + " " + MESES[+iso.slice(5, 7) - 1]; }
// Fecha en que se hace el pedido de la semana k del plan: el lunes de esa semana (o hoy si ese lunes ya pasó)
export function pagoPedidoFecha(c: { semIni?: string[] } | null, k: number, hoyIso: string): string {
  var ini = (c && c.semIni && diaLocal(c.semIni[k])) || hoyIso;
  var lun = planEngDia(ini, -((diaSem(ini) + 6) % 7));
  return lun < hoyIso ? hoyIso : lun;
}
// Suma por fecha de pago de los proveedores (grupos de planSemCalc) para la semana k. `credito` = días de crédito del grupo.
export function pagoPorFecha(grupos: GrupoSem[], k: number, c: { semIni?: string[] } | null, hoyIso: string, credito: (g: GrupoSem) => number): { f: string; m: number }[] {
  var m: Record<string, { f: string; m: number }> = {};
  grupos.forEach(function (g) { var v = g.monto[k] || 0; if (!(v > 0)) return; var f = pagoFecha(pagoPedidoFecha(c, k, hoyIso), credito(g)), iso = f; (m[iso] = m[iso] || { f: f, m: 0 }).m += v; });
  return Object.keys(m).sort().map(function (i) { return m[i]; });
}

// ═══ Proveedores de la semana y detalle ══════════════════════════════════════════════════════════════════════════
export function hoyGrupos(S: Sem, k: number): GrupoSem[] {
  var filas: GrupoSem[] = [];
  PSEM_CATS.forEach(function (d) { S.cat[d.id].provs.forEach(function (g) { if (g.n[k] > 0 || g.sinCosto[k] > 0) filas.push(g); }); });
  filas.sort(function (a, b) { return b.monto[k] - a.monto[k] || a.nombre.localeCompare(b.nombre); });
  return filas;
}
/** Contexto del día del pedido de una fila (local/café: calc; importación: ctx). Con pedidos de varias semanas, "quedas con" suma lo pedido hasta la semana k. */
export interface CtxFila { tienes: number; enOC: number; consumo: number; diasHoy: number | null; quedas: number; diasQuedas: number | null }
export function ctxFila(r: any, k: number): CtxFila | null {
  if (r.ctx) return r.ctx;
  var c = r.calc; if (!c || c.consumo === undefined || c.invBase === undefined || c.disponible === undefined) return null;
  var cum = 0, j; for (j = 0; j <= (k || 0) && j < r.sem.length; j++) cum += r.sem[j] || 0;
  var q = c.disponible + cum;
  return { tienes: c.invBase, enOC: (r.s && r.s.enOC) || 0, consumo: c.consumo, diasHoy: c.diasHoy, quedas: q, diasQuedas: c.consumo > 0 ? Math.max(0, q) / c.consumo : null };
}
/** "Copiar pedido": la lista de lo que hay que pedirle al proveedor en la semana k, para pegarla en un correo o WhatsApp. */
export function hoyPedidoTexto(g: GrupoSem, k: number, hoyIso: string): string {
  var lineas: string[] = [], tot = 0;
  g.rows.filter(function (r) { return r.sem[k] > 0; }).forEach(function (r) { var q = r.sem[k], m = r.costo > 0 ? (r.contenedor ? r.costo : q * r.costo) : 0; tot += m; lineas.push("- " + r.sku + " · " + r.nombre + ": " + planN(q) + (r.contenedor ? " contenedor" : "") + (m > 0 ? " (" + planMoney(m) + ")" : "")); });
  return "Pedido a " + g.nombre + " — " + fechaCorta(hoyIso) + (k === 1 ? " (próxima semana)" : "") + "\n" + lineas.join("\n") + "\nTotal estimado: " + planMoney(tot);
}

// ═══ Se quedarían sin producto ═══════════════════════════════════════════════════════════════════════════════════
export interface Riesgo { nombre: string; sku: string; cat: CatId; alcanza: number; lt: number; gap: number; prov: string; llega: string | null; tab: "plan" | "cafe" | "imp" }
// Artículos que se quedarían sin producto antes de que pueda llegar un pedido de hoy (de las tres categorías)
export function hoyRiesgos(c: PlanProv, f: { cafe: () => PlanProv | null; imp: () => CorridaImp | null }): Riesgo[] {
  var out: Riesgo[] = [];
  var plan = function (p: PlanProv | null, cat: CatId) {
    if (!p) return;
    p.rows.forEach(function (r) {
      if (r.sinMov || r.importacion || (cat === "local" && r.esCafe) || r.calc.diasAlcanza === null) return;
      var lt = r.s.lt || 0; if (!(r.calc.diasAlcanza < lt)) return;
      out.push({ nombre: r.nombre, sku: r.sku, cat: cat, alcanza: Math.max(0, r.calc.diasAlcanza), lt: lt, gap: lt - Math.max(0, r.calc.diasAlcanza), prov: r.provNombre, llega: r.llegaOC, tab: cat === "cafe" ? "cafe" : "plan" });
    });
  };
  plan(c, "local");
  try { plan(f.cafe(), "cafe"); } catch { /* sin café: solo lo demás */ }
  try {
    var ic = f.imp();
    if (ic && ic.S) {
      var prov: Record<string, any> = {}; ic.cfg.imp.prov.forEach(function (p: any) { prov[p.clave] = p; });
      ic.S.productos.forEach(function (p: any, i: number) {
        var q = p.quiebre, it = ic!.ent.items[i];
        if (!/^URGENTE/.test(q.estado) || !(q.diasSinProducto > 0)) return;
        var d = q.seAcaba ? impDif(c.hoyIso, q.seAcaba) : 0;
        out.push({ nombre: q.producto, sku: it.sku, cat: "imp", alcanza: Math.max(0, d || 0), lt: q.leadTime, gap: q.diasSinProducto, prov: (prov[it.proveedor] || {}).nombre || it.proveedor, llega: null, tab: "imp" });
      });
    }
  } catch { /* sin importaciones: solo lo demás */ }
  out.sort(function (a, b) { return b.gap - a.gap || a.nombre.localeCompare(b.nombre); });
  return out;
}

// ═══ Borradores de Zoho por resolver ═════════════════════════════════════════════════════════════════════════════
// Un borrador no es una compra: se emite o se borra el mismo día. Cada uno se compara con lo que hoy pide el plan (esta semana y la próxima).
export interface LineaBorr { sku: string; nom: string; folio: string; prov: string; fecha: string; creada: string; pend: number; monto: number | null; borrador: boolean }
export interface FuenteBorr { ls: LineaBorr[]; fecha: string }
export interface Borrador { folio: string; prov: string; fecha: string; creada: string; monto: number; pend: number; cub: number; lineas: { sku: string; nom: string; q: number; plan: number; viene: number }[]; dias: number | null; nPlan: number; accion: "emitir" | "ajustar" | "borrar"; motivo: string }

/**
 * Decisión 3 del 3f: la fuente son los borradores de zoho-sync (com_zoho_oc_lineas con status 'draft', R.ocZohoBorr) con la
 * forma de las líneas de la carga de Zoho del viejo: pendiente = pedida − recibida, monto = pendiente × precio (null si la OC
 * no es en pesos: zoho-sync no guarda su precio) y "creada" vacía (Zoho no la trae: cuenta la fecha de la OC). La fecha es el
 * día de CDMX de la última sincronización. Sin líneas, null (no hay panel).
 */
export function borrFuenteZoho(R: Pick<DatosPlan, "ocZohoBorr" | "cat">): FuenteBorr | null {
  var nom: Record<string, string> = {}, ls: LineaBorr[] = [], ult = "";
  (R.cat || []).forEach(function (c) { nom[String(c.sku).trim().toUpperCase()] = c.nombre || ""; });
  (R.ocZohoBorr || []).forEach(function (l) {
    var pend = Math.round((Number(l.cantidad) - Number(l.cantidad_recibida || 0)) * 1e4) / 1e4;
    if (!l.sku || !(pend > 0)) return;
    var precio = l.precio == null ? NaN : Number(l.precio);
    ls.push({ sku: l.sku, nom: nom[String(l.sku).trim().toUpperCase()] || "", folio: l.po_number, prov: l.vendor_name || "", fecha: impFechaOk(l.fecha_oc) ? (l.fecha_oc as string) : "", creada: "",
      pend: pend, monto: isFinite(precio) && precio > 0 ? Math.round(pend * precio * 100) / 100 : null, borrador: true });
    var t = l.synced_at ? Date.parse(l.synced_at) : NaN, s = isFinite(t) ? fechaLocal(t) : ""; if (s > ult) ult = s;
  });
  return ls.length ? { ls: ls, fecha: ult } : null;
}

export function borrAnalisis(S: Sem, f: FuenteBorr | null, hoyIso: string): { fecha: string; lista: Borrador[] } | null {
  if (!f) return null;
  var need: Record<string, number> = {}, viene: Record<string, number> = {}, por: Record<string, Borrador> = {}, lista: Borrador[] = [];
  PSEM_CATS.forEach(function (d) { S.cat[d.id].provs.forEach(function (g) { g.rows.forEach(function (r) {
    var q = (r.sem[0] || 0) + (r.sem[1] || 0); if (q > 0) need[r.sku] = (need[r.sku] || 0) + q;
    if (r.s && r.s.enOC > 0) viene[r.sku] = r.s.enOC;
  }); }); });
  f.ls.forEach(function (l) {
    if (!l.borrador) return;
    var o = por[l.folio]; if (!o) { o = por[l.folio] = { folio: l.folio, prov: l.prov, fecha: l.fecha, creada: l.creada || "", monto: 0, pend: 0, cub: 0, lineas: [] } as any; lista.push(o); }
    var n = need[l.sku] || 0;
    o.lineas.push({ sku: l.sku, nom: l.nom, q: l.pend, plan: n, viene: viene[l.sku] || 0 });
    o.monto += Number(l.monto || 0); o.pend += l.pend; o.cub += Math.min(l.pend, n);
  });
  lista.forEach(function (o) {
    var cub = o.pend > 0 ? o.cub / o.pend : 0, d0 = diaLocal(o.creada || o.fecha);
    o.dias = d0 ? Math.max(0, planEngDifDias(hoyIso, d0)) : null;
    o.nPlan = o.lineas.filter(function (x) { return x.plan > 0; }).length;
    o.accion = (o.dias !== null && o.dias > 30) ? "borrar" : cub >= 0.8 ? "emitir" : cub > 0 ? "ajustar" : "borrar";
    o.motivo = (o.dias !== null && o.dias > 30) ? "más de 30 días en borrador" : cub >= 0.8 ? "el plan pide casi todo lo que trae" : cub > 0 ? "el plan pide solo una parte" : "el plan no pide nada de esto";
  });
  var rango: Record<string, number> = { emitir: 0, ajustar: 1, borrar: 2 };
  lista.sort(function (a, b) { return rango[a.accion] - rango[b.accion] || b.monto - a.monto; });
  return { fecha: f.fecha, lista: lista };
}
