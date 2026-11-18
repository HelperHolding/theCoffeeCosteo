// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL de los Indicadores de abasto del sitio viejo (app/index.html a9e4a22): _kpiAbCalc (41012), _kpiAbEstados
// (41151), _kpiAbMetas (40993), _kpiAbVentanas (41243), el cálculo de _kpiAbTraza (41563), la parte de borradores de
// _ocsContadas (38649) y _planMoneyCorto. Sin HTML: los textos de cada revisión de datos van planos y sus enlaces apuntan
// a las pantallas del portal. planKpi_parity_test.ts compara contra la app.
import { parseItems, planDatTipo, planEngDifDias, fechaLocal } from "./planEngine.ts";
import {
  borradoresPlan, comSaldoCedis, type DatosPlan, KPI_AB_DEF, normalizarCfgMotor, planInvUltSync, planOcDeZoho, planOcFuente,
  zocFuenteBorr, zocKey,
} from "./planDatos.ts";
import { planBuild, planSinSrv } from "./planBuild.ts";

export function planMoneyCorto(x: any): string { x = Number(x || 0); return x >= 1e6 ? "$" + (Math.round(x / 1e5) / 10) + " M" : x >= 1e3 ? "$" + Math.round(x / 1e3) + " k" : "$" + Math.round(x); }

export function kpiAbMetas(cfg: any): Record<string, number> {
  var k = (cfg && cfg.kpi) || {}, o: Record<string, number> = {};
  Object.keys(KPI_AB_DEF).forEach(function (x) { var v = k[x], n = Number(v); o[x] = (v === null || v === undefined || v === "" || !isFinite(n)) ? KPI_AB_DEF[x] : n; });
  return o;
}

export interface Borrador { folio: string; prov: string; fecha: string; lineas: number; uds: number; monto: number }
/**
 * Borradores de OC pendientes de resolver (la mitad "borr" de _ocsContadas): líneas abiertas de la plataforma que son
 * borrador, más los borradores de la carga de Zoho de la configuración que no están en la plataforma y (decisión 6) los
 * borradores reales de com_zoho_oc_lineas que no se vieron antes. Ordenados por monto.
 */
export function ocsBorradores(R: DatosPlan, cfg: any): Borrador[] {
  var dset = borradoresPlan(R, cfg), f: Record<string, Borrador> = {}, borr: Borrador[] = [], vistosB: Record<string, 1> = {};
  planOcFuente(R, cfg).forEach(function (r: any) {
    var pend = Math.max(0, Number(r.cantidad || 0) - Number(r.cantidad_recibida || 0)); if (pend <= 0) return;
    var esB = !!(dset && dset[zocKey(r.folio) + "|" + String(r.sku).trim().toUpperCase()]);
    if (!esB) return;
    var k = (r.folio || "(sin folio)") + "|b", o = f[k];
    if (!o) { o = f[k] = { folio: r.folio || "(sin folio)", prov: r.proveedor || "", fecha: r.fecha ? String(r.fecha).slice(0, 10) : "", lineas: 0, uds: 0, monto: 0 }; borr.push(o); }
    o.lineas++; o.uds += pend; o.monto += Number(r.monto || 0);
  });
  borr.forEach(function (o) { vistosB[zocKey(o.folio)] = 1; });
  var fz = zocFuenteBorr(cfg);
  if (fz) fz.ls.forEach(function (l: any) {
    if (!l.borrador) return; var kz = zocKey(l.folio); if (vistosB[kz]) return;
    var o = f["z|" + kz]; if (!o) { o = f["z|" + kz] = { folio: l.folio, prov: l.prov || "", fecha: l.fecha || "", lineas: 0, uds: 0, monto: 0 }; borr.push(o); }
    o.lineas++; o.uds += Number(l.pend || 0); o.monto += Number(l.monto || 0);
  });
  borr.forEach(function (o) { vistosB[zocKey(o.folio)] = 1; });
  (R.ocZohoBorr || []).forEach(function (l) {
    var kz = zocKey(l.po_number); if (!kz || vistosB[kz]) return;
    var o = f["d|" + kz]; if (!o) { o = f["d|" + kz] = { folio: l.po_number, prov: l.vendor_name || "", fecha: l.fecha_oc ? String(l.fecha_oc).slice(0, 10) : "", lineas: 0, uds: 0, monto: 0 }; borr.push(o); }
    o.lineas++; o.uds += Math.max(0, Number(l.cantidad || 0) - Number(l.cantidad_recibida || 0)); o.monto += Number(l.cantidad || 0) * Number(l.precio || 0);
  });
  borr.sort(function (a, b) { return b.monto - a.monto; });
  return borr;
}

export interface CheckDatos { id: string; corto: string; titulo: string; valor: string; est: "ok" | "aviso" | "mal"; detalle: string; acc: string; lnk: string }
export type EstadoRiesgo = "pedir" | "confirmar" | "cubierto" | "pronto" | "ok" | "sinventa";
export interface FilaRiesgo {
  sku: string; nombre: string; cat: string; prov: string; fisico: number; yulius: number; comp: number; inv: number; cons: number; lt: number;
  oc: number; llega: string | null; dias: number | null; dLlega: number | null; estado: EstadoRiesgo; motivo: string; neg: boolean; vieja: boolean;
  esta: number; costo: number;
}

const RUTA = "/comercializadora";

// Cálculo (sin DOM): recibe los datos crudos del Plan y una configuración; devuelve todo lo que muestran las tarjetas.
export function kpiAbCalc(R: DatosPlan, cfgIn: any, ahora: number): any {
  var cfg = normalizarCfgMotor(cfgIn), metas = kpiAbMetas(cfg), cfgK = JSON.parse(JSON.stringify(cfg)), j: number;
  // El café también cuenta para medir y se miran 8 semanas hacia atrás.
  cfgK.compra.excluir_cafe = false;
  cfgK.compra.bt_semanas = Math.max(8, Number(cfgK.compra.bt_semanas) || 0);
  var c = planBuild(planSinSrv(R), cfgK), rows = c.rows; // Indicadores siguen con el cálculo local
  var bt = c.bt || { n: 0, semanas: [], compras: [], comprasImp: [], comprasSinMonto: 0 }, NB = bt.n, nw = Math.min(4, NB);
  var K: any = { metas: metas, cfg: cfg, hoy: c.hoyIso, NB: NB, nw: nw, nRows: rows.length };
  var num = function (x: any) { x = Number(x); return isFinite(x) ? x : 0; };

  // 1) Forecast: lo que el modelo habría proyectado cada semana pasada contra lo realmente pedido (a costo)
  var fcRows: any[] = [], wErr = 0, wReal = 0, wProy = 0, sinCostoFc = 0;
  rows.forEach(function (r) {
    if (r.sinMov) return;
    if (!(r.costo > 0)) { sinCostoFc++; return; }
    var p = 0, re = 0, n = 0, i: number;
    for (i = 0; i < nw; i++) { var a = r.calc.btProy[i], b = r.calc.btReal[i]; if (a == null || b == null) continue; p += a; re += b; n++; }
    if (!nw || n < nw) return;
    var err = Math.abs(p - re) * r.costo;
    var desvS = p > 0 ? (re - p) / p : null, pw = p / nw, rec = (num(r.calc.btReal[0]) + num(r.calc.btReal[1])) / 2, motivo = "";
    if (desvS !== null && desvS <= -0.2) motivo = rec < 0.7 * pw ? "La venta bajó: " + Math.round(rec) + " por semana las últimas 2 semanas contra " + Math.round(pw) + " proyectadas" : "Venta irregular: semanas con pocos pedidos";
    else if (desvS !== null && desvS >= 0.2) motivo = rec > 1.3 * pw ? "La venta subió: " + Math.round(rec) + " por semana las últimas 2 semanas contra " + Math.round(pw) + " proyectadas" : "Venta irregular: semanas con pedidos grandes";
    fcRows.push({ sku: r.sku, nombre: r.nombre, costo: r.costo, proy: p, real: re, err: err, desv: desvS, motivo: motivo, bp: r.calc.btProy.slice(0, NB), br: r.calc.btReal.slice(0, NB), tasa: num(r.calc.tasa), venta30: num(r.s.venta) });
    wErr += err; wReal += re * r.costo; wProy += p * r.costo;
  });
  fcRows.sort(function (a, b) { return b.err - a.err; });
  var sem: any[] = [];
  for (j = 0; j < NB; j++) {
    var wp = 0, wr = 0, we = 0, nn = 0;
    rows.forEach(function (r) {
      if (r.sinMov || !(r.costo > 0)) return;
      var a = r.calc.btProy[j], b = r.calc.btReal[j]; if (a == null || b == null) return;
      wp += a * r.costo; wr += b * r.costo; we += Math.abs(a - b) * r.costo; nn++;
    });
    var sj = bt.semanas[j] || {};
    sem.push({ ini: sj.ini || null, fin: sj.fin || null, proy: wp, real: wr, err: we, n: nn, desv: wp > 0 ? (wr - wp) / wp * 100 : null, acc: wr > 0 ? Math.max(0, 1 - we / wr) * 100 : null });
  }
  var fcMap: Record<string, any> = {}; fcRows.forEach(function (x) { fcMap[x.sku] = x; });
  K.P = c.P;
  K.fc = { porSku: fcMap, acc: wReal > 0 ? Math.max(0, 1 - wErr / wReal) * 100 : null, desv: wProy > 0 ? (wReal - wProy) / wProy * 100 : null, n: fcRows.length, proy: wProy, real: wReal, err: wErr, top: fcRows.filter(function (x) { return x.desv !== null && Math.abs(x.desv) >= 0.2; }).slice(0, 6), sem: sem, sinCosto: sinCostoFc };

  // 2) Compras vs venta: OCs emitidas en cada semana pasada contra la venta a costo de esa misma semana
  var cv: any[] = [], c4 = 0, v4 = 0, c8 = 0, v8 = 0;
  for (j = 0; j < NB; j++) {
    var sj2 = bt.semanas[j] || {}, co = num(bt.compras[j]), ci = num(bt.comprasImp[j]), vt = sem[j] ? sem[j].real : 0;
    cv.push({ ini: sj2.ini || null, fin: sj2.fin || null, n: num(bt.comprasN && bt.comprasN[j]), comp: co, compImp: ci, vta: vt, ratio: vt > 0 ? (co + ci) / vt : null });
    c8 += co + ci; v8 += vt; if (j < nw) { c4 += co + ci; v4 += vt; }
  }
  K.cv = { ratio: v4 > 0 ? c4 / v4 : null, comp: c4, vta: v4, ratio8: v8 > 0 ? c8 / v8 : null, comp8: c8, vta8: v8, sem: cv, sinMonto: num(bt.comprasSinMonto) };

  // 3) Inventario a costo, cobertura, exceso y disponibilidad (por artículo, con la misma base de inventario que el plan)
  var cats: Record<string, any> = {}, valor = 0, cogs = 0, sinCosto = 0, exc: any[] = [], sinVenta: any[] = [], excVal = 0, sinVentaVal = 0, conVenta = 0, agot: any[] = [], top: any[] = [];
  rows.forEach(function (r) {
    var fis = Math.max(0, num(r.s.fisico) + (cfg.inv.yulius ? num(r.s.yulius) : 0)), v = r.costo > 0 ? fis * r.costo : 0;
    if (!(r.costo > 0) && fis > 0) sinCosto++;
    var cons = Math.max(0, num(r.calc.consumo)), cd = (!r.sinMov && r.costo > 0) ? cons * r.costo : 0, ct = r.categoria || "Sin categoría";
    valor += v; cogs += cd;
    var g = cats[ct] || (cats[ct] = { nombre: ct, valor: 0, cogs: 0, n: 0 }); g.valor += v; g.cogs += cd; if (fis > 0) g.n++;
    if (v > 0) top.push({ sku: r.sku, nombre: r.nombre, valor: v, uds: fis, dias: cd > 0 ? v / cd : null });
    var inv = num(r.s.inv);
    if (r.sinMov) { if (inv > 0 && r.costo > 0) { var vs = inv * r.costo; sinVentaVal += vs; sinVenta.push({ sku: r.sku, nombre: r.nombre, uds: inv, valor: vs }); } }
    else if (cons > 0 && r.costo > 0) {
      var obj = num(r.calc.Heff) + metas.exc_margen, ex = Math.max(0, inv - cons * obj);
      if (ex > 0) { excVal += ex * r.costo; exc.push({ sku: r.sku, nombre: r.nombre, uds: inv, dias: inv / cons, obj: obj, exUds: ex, exVal: ex * r.costo }); }
    }
    if (!r.sinMov && num(r.s.venta) > 0) {
      conVenta++;
      if (inv <= 0) agot.push({ sku: r.sku, nombre: r.nombre, prov: r.provNombre, cons: cons, vtaDia$: cons * (r.costo > 0 ? r.costo : 0), enOC: num(r.s.enOC), lt: num(r.s.lt), llega: r.llegaOC || null, inv: inv });
    }
  });
  exc.sort(function (a, b) { return b.exVal - a.exVal; }); sinVenta.sort(function (a, b) { return b.valor - a.valor; });
  agot.sort(function (a, b) { return b["vtaDia$"] - a["vtaDia$"]; }); top.sort(function (a, b) { return b.valor - a.valor; });
  var catArr = Object.keys(cats).map(function (k) { var g = cats[k]; g.dias = g.cogs > 0 ? g.valor / g.cogs : null; g.pct = valor > 0 ? g.valor / valor * 100 : 0; return g; }).sort(function (a, b) { return b.valor - a.valor; });
  K.inv = { valor: valor, cogsDia: cogs, dias: cogs > 0 ? valor / cogs : null, cats: catArr, top: top.slice(0, 12), sinCosto: sinCosto };
  K.exc = { valor: excVal + sinVentaVal, exceso: excVal, sinVentaVal: sinVentaVal, pct: valor > 0 ? (excVal + sinVentaVal) / valor * 100 : null, filas: exc, sinVenta: sinVenta };
  K.disp = { pct: conVenta > 0 ? (1 - agot.length / conVenta) * 100 : null, conVenta: conVenta, agot: agot };

  // 4) ¿Los datos del plan están al día? (lo que hace confiable o no a todo lo anterior)
  var CORTO: Record<string, string> = { inv: "inventario sin sincronizar", neg: "inventario negativo", oc: "OCs sin poner al día", borr: "borradores de OC", env: "pedidos por enviar viejos", lt: "lead times", prov: "proveedores", costo: "costos", map: "SKU sin mapear", ap: "piezas por apertura" };
  var checks: CheckDatos[] = [], ok = function (id: string, tit: string, val: string, est: any, det: string, acc?: string, lnk?: string) { checks.push({ id: id, corto: CORTO[id] || tit, titulo: tit, valor: val, est: est, detalle: det, acc: acc || "", lnk: lnk || "" }); };
  var dias = function (iso: any): any { return iso ? Math.round((ahora - new Date(iso).getTime()) / 864e5) : null; };
  var ult = planInvUltSync(R.cat);
  var dI = dias(ult);
  ok("inv", "Inventario sincronizado con Zoho", ult ? "hace " + dI + " día" + (dI === 1 ? "" : "s") : "sin sincronizar", (!ult || dI > 7) ? "mal" : dI > 3 ? "aviso" : "ok", "Se actualiza desde Zoho; si está viejo, el plan decide con existencias que ya no son.", "Ver inventario", RUTA + "/inventario");
  var neg = R.cat.filter(function (x) { return comSaldoCedis(x) < 0; });
  ok("neg", "Artículos con inventario negativo", String(neg.length), neg.length > 0 ? "mal" : "ok", neg.length ? "Existencias negativas en CEDIS (salieron más piezas de las que se registraron como recibidas): " + neg.slice(0, 8).map(function (x) { return x.sku; }).join(", ") + (neg.length > 8 ? " y " + (neg.length - 8) + " más" : "") + ". Revisa que las compras recibidas estén registradas en Zoho y corrige el inventario; mientras tanto el plan trata esos artículos como agotados." : "Ninguno.", "Ver inventario", RUTA + "/inventario");
  var z = cfg.zoho_oc, usaZ = false; try { usaZ = planOcDeZoho(cfg); } catch { usaZ = false; }
  var viejas = rows.reduce(function (s, r) { return s + (r.staleLn || 0); }, 0), dC = z && z.conciliado ? dias(z.conciliado) : (z && z.cargado ? dias(z.cargado) : null);
  var estOC = usaZ ? (dC > 3 ? "aviso" : "ok") : (z && z.conciliado ? ((viejas > 0 || dC > 7) ? "aviso" : "ok") : "mal");
  ok("oc", "OCs en camino al día con Zoho", usaZ ? "solo las de Zoho" + (dC !== null ? " · cargadas hace " + dC + " d" : "") : (z && z.conciliado ? "puestas al día hace " + dC + " d" + (viejas ? " · " + viejas + " líneas viejas" : "") : "sin poner al día"), estOC, 'Lo que está "en camino" reduce lo que hay que pedir: si no coincide con Zoho, el plan pide de menos o de más.', "Ver órdenes de compra", RUTA + "/ordenes");
  var nb = 0, mb = 0; try { var bo = ocsBorradores(R, cfg); nb = bo.length; bo.forEach(function (o) { mb += o.monto || 0; }); } catch { nb = 0; }
  ok("borr", "Borradores de OC pendientes de resolver", String(nb) + (nb ? " (" + planMoneyCorto(mb) + ")" : ""), nb > 0 ? "aviso" : "ok", "Un borrador no es una compra: no cuenta como en camino. Hay que emitirlo o borrarlo en Zoho.", "Ver órdenes de compra", RUTA + "/ordenes");
  var cvj = c.compViejo && c.compViejo.ln > 0 ? c.compViejo : null;
  ok("env", 'Pedidos "por enviar" muy viejos', cvj ? cvj.folios + " pedido" + (cvj.folios === 1 ? "" : "s") + " (+" + cvj.dias + " d)" : "0", cvj ? "aviso" : "ok", "Casi seguro ya se enviaron y nadie los marcó; si cuentan como comprometidos, restan inventario que sí está en el almacén.", "Revisar envíos", RUTA + "/envios");
  var act = rows.filter(function (r) { return !r.sinMov; });
  var sinLt = act.filter(function (r) { return r.ltDefault; }).length, sinProv = act.filter(function (r) { return r.provKey === "__sin__"; }).length, sinCost = act.filter(function (r) { return !(r.costo > 0); }).length;
  ok("lt", "Artículos con lead time capturado", (act.length - sinLt) + " de " + act.length, sinLt > 0 ? "aviso" : "ok", sinLt ? sinLt + " usan el lead time por defecto (" + cfg.compra.lt_default + " días): el plan puede pedir tarde o temprano." : "Todos tienen su lead time.", "Abrir el catálogo", RUTA + "/catalogo");
  ok("prov", "Artículos con proveedor asignado", (act.length - sinProv) + " de " + act.length, sinProv > 0 ? "aviso" : "ok", sinProv ? sinProv + " sin proveedor: no se pueden agrupar en una OC." : "Todos tienen proveedor.", "Abrir el catálogo", RUTA + "/catalogo");
  ok("costo", "Artículos con costo", (act.length - sinCost) + " de " + act.length, sinCost > 0 ? "aviso" : "ok", sinCost ? sinCost + " sin costo: no entran en los montos ni en los indicadores en $." : "Todos tienen costo.", "Abrir el catálogo", RUTA + "/catalogo");
  ok("map", "Líneas de pedido con SKU asignado", c.sinMapear ? c.sinMapear + " sin SKU" : "todas", c.sinMapear > 0 ? "aviso" : "ok", c.sinMapear ? "Líneas de pedido de la ventana que no se pudieron ligar a un artículo: su venta no entra al forecast." : "Toda la venta se pudo ligar a un artículo.", "Mapeo SKU", RUTA + "/mapeo");
  var conKit = R.cat.filter(function (x) { return Number(x.cantidad_por_apertura || 0) > 0; }).length, usaAp = cfg.aper.incluir !== false && c.nAperturas > 0;
  ok("ap", "Piezas por apertura capturadas", usaAp ? conKit + " de " + R.cat.length + " artículos" : (cfg.aper.incluir === false ? "aperturas no contempladas" : "sin aperturas en el calendario"), usaAp && conKit === 0 ? "mal" : "ok", usaAp && conKit === 0 ? "Sin piezas por apertura, las aperturas del calendario no suman al pedido." : "Con esto el plan reserva producto para las aperturas del calendario.", "Sugerir piezas", RUTA + "/catalogo/piezas-apertura");
  var nOk = checks.filter(function (x) { return x.est === "ok"; }).length;
  K.datos = { checks: checks, ok: nOk, total: checks.length };

  // 4b) Riesgo de quiebre: ¿el inventario alcanza hasta que llegue una compra nueva? Con las OCs en cuenta (misma definición en KPIs, DOH y Compras)
  var fil: FilaRiesgo[] = [], rq: Record<string, number> = { pedir: 0, confirmar: 0, cubierto: 0, pronto: 0, ok: 0, sinventa: 0, negativos: 0 }, ord: Record<string, number> = { pedir: 0, confirmar: 1, cubierto: 2, pronto: 3, ok: 4, sinventa: 5 };
  rows.forEach(function (r) {
    var cons = Math.max(0, num(r.calc.consumo)), lt = num(r.s.lt) || num(cfg.compra.lt_default) || 7, inv = num(r.s.inv), oc = num(r.s.enOC);
    var it: FilaRiesgo = { sku: r.sku, nombre: r.nombre, cat: r.categoria || "Sin categoría", prov: r.provNombre, fisico: num(r.s.fisico), yulius: num(r.s.yulius), comp: num(r.s.comp), inv: inv, cons: cons, lt: lt, oc: oc, llega: r.llegaOC || null, dias: null, dLlega: null, estado: "sinventa", motivo: "", neg: num(r.s.fisico) < 0, vieja: (r.staleLn || 0) > 0, esta: num(r.calc.pedirEsta), costo: num(r.costo) };
    if (r.sinMov || !(cons > 0)) { fil.push(it); rq.sinventa++; return; }
    var dias = r.calc.diasHoy === null ? Math.max(0, inv) / cons : r.calc.diasHoy; it.dias = dias;
    if (it.neg) rq.negativos++;
    var dLl = it.llega ? planEngDifDias(it.llega, c.hoyIso) : null; it.dLlega = dLl;
    if (dias <= lt) {
      if (!(oc > 0)) { it.estado = "pedir"; it.motivo = "Sin OC"; }
      else if (dLl === null) { it.estado = "confirmar"; it.motivo = it.vieja ? "OC vieja, sin fecha confiable" : "OC sin fecha de llegada"; }
      else if (dLl < 0) { it.estado = "confirmar"; it.motivo = "OC vencida hace " + Math.abs(Math.round(dLl)) + " d"; }
      else if (dLl > dias + 0.5) { it.estado = "confirmar"; it.motivo = "Llega en " + Math.round(dLl) + " d y se acaba en " + Math.round(dias) + " d"; }
      else if ((Math.max(0, inv) + oc) / cons < lt) { it.estado = "confirmar"; it.motivo = "La OC no alcanza para cubrir el lead time"; }
      else { it.estado = "cubierto"; it.motivo = "Llega en " + Math.round(dLl) + " d, se acaba en " + Math.round(dias) + " d"; }
    } else if (dias <= Math.max(lt * 2, 14) && !(oc > 0)) { it.estado = "pronto"; it.motivo = "Alcanza " + Math.round(dias) + " d"; }
    else it.estado = "ok";
    rq[it.estado]++; fil.push(it);
  });
  fil.sort(function (a, b) { return ord[a.estado] - ord[b.estado] || (a.dias === null ? 1e9 : a.dias) - (b.dias === null ? 1e9 : b.dias); });
  K.riesgo = { pedir: rq.pedir, confirmar: rq.confirmar, cubierto: rq.cubierto, pronto: rq.pronto, ok: rq.ok, sinventa: rq.sinventa, negativos: rq.negativos, conVenta: fil.length - rq.sinventa, filas: fil };

  // 5) Parámetros vigentes (lo que mueve a los indicadores de arriba)
  var metodo = ({ promedio: "promedio", mediana: "mediana", percentil: "percentil " + cfg.consumo.pctl, ponderado: "ponderado" } as Record<string, string>)[cfg.consumo.metodo] || cfg.consumo.metodo;
  K.params = [
    ["Ventana de venta", cfg.consumo.ventana + " días"], ["Método", metodo], ["Días de seguridad", cfg.seg.dias + (cfg.seg.metodo === "estadistico" ? " (estadística)" : "")], ["Lead time base", cfg.compra.lt_default + " días"],
    ["Aperturas", cfg.aper.incluir === false ? "no se contemplan" : "se contemplan"], ["Inventario base", cfg.inv.base === "disponible" ? "disponible (físico − comprometido)" : "físico"], ["3PL", cfg.inv.yulius ? "se suma" : "no se suma"],
    ["Pedidos por enviar", cfg.inv.comp_dias > 0 ? "ignora los de más de " + cfg.inv.comp_dias + " días" : (cfg.inv.comp_dias === 0 ? "cuenta todos" : "cuenta todos")], ["OCs en camino", usaZ ? "de Zoho" : "de la plataforma"], ["Borradores de OC", cfg.compra.borradores === "cuentan" ? "cuentan" : "no cuentan"],
  ];
  return K;
}

/** Estado de cada indicador contra su meta: true cumple, null cerca, false no cumple, undefined sin datos. */
export function kpiAbEstados(K: any): Record<string, boolean | null | undefined> {
  var m = K.metas, e: Record<string, boolean | null | undefined> = {};
  var f = K.fc.acc; e.fc = f === null ? undefined : (f >= m.prec_min ? true : f >= m.prec_min - 10 ? null : false);
  var d = K.fc.desv; e.sesgo = d === null ? undefined : (Math.abs(d) <= m.sesgo_max ? true : Math.abs(d) <= 2 * m.sesgo_max ? null : false);
  var r = K.cv.ratio; e.cv = r === null ? undefined : ((r >= m.cv_min && r <= m.cv_max) ? true : (r >= m.cv_min - 0.15 && r <= m.cv_max + 0.15) ? null : false);
  var di = K.inv.dias; e.inv = di === null ? undefined : ((di >= m.dias_min && di <= m.dias_max) ? true : (di >= m.dias_min - 10 && di <= m.dias_max + 15) ? null : false);
  var x = K.exc.pct; e.exc = x === null ? undefined : (x <= m.exc_max ? true : x <= 2 * m.exc_max ? null : false);
  var p = K.disp.pct; e.disp = p === null ? undefined : (p >= m.disp_min ? true : p >= m.disp_min - 5 ? null : false);
  var t = K.datos; e.datos = t.ok === t.total ? true : (t.checks.some(function (c: CheckDatos) { return c.est === "mal"; }) ? false : (t.ok / t.total >= 0.7 ? null : false));
  return e;
}

/** Precisión del forecast con otras ventanas de venta (14, 21 y la actual), misma cuenta y mismos datos (_kpiAbVentanas). */
export function kpiAbVentanas(R: DatosPlan, cfgBase: any, ahora: number, calc: (R: DatosPlan, cfg: any, ahora: number) => any = kpiAbCalc): { v: number; acc: number; desv: number | null; actual: boolean }[] {
  var out: { v: number; acc: number; desv: number | null; actual: boolean }[] = [];
  try {
    var base = normalizarCfgMotor(cfgBase), act = base.consumo.ventana;
    [14, 21, act].forEach(function (v) {
      if (out.some(function (o) { return o.v === v; })) return;
      var c = JSON.parse(JSON.stringify(base)); c.consumo.ventana = v;
      var K = calc(R, c, ahora);
      if (K && K.fc.acc !== null) out.push({ v: v, acc: K.fc.acc, desv: K.fc.desv, actual: v === act });
    });
  } catch { /* igual que la app: si algo falla, no se muestra la comparación */ }
  return out.sort(function (a, b) { return a.v - b.v; });
}

export interface Traza { sku: string; nombre: string; tasa: number; venta30: number; motivo: string; filas: { ini: string | null; fin: string | null; real: number | null; tipos: [string, number][]; proy: number | null; dif: number | null }[] }
const NOM_TIPO: Record<string, string> = { resurtido: "resurtido", sin_vincular: "sin vincular", apertura: "kits de apertura", marketing: "marketing", corporativo: "oficina corporativa", llenado: "llenado de canal" };
/** De dónde sale la proyección de un artículo: semana a semana, lo pedido por tipo de pedido contra lo proyectado (_kpiAbTraza). */
export function kpiAbTraza(R: DatosPlan, K: any, sku: string): Traza | null {
  var f = K && K.fc && K.fc.porSku && K.fc.porSku[sku]; if (!f || !R) return null;
  var cfg = K.cfg, NB = K.NB;
  var skuMap: Record<string, string> = {}; R.map.forEach(function (m) { skuMap[m.shopify_nombre] = m.sku; });
  var apById: Record<string, any> = {}; R.aperturas.forEach(function (a) { apById[a.id] = a; });
  var pedEnAper: Record<string, boolean> = {}; R.pedAper.forEach(function (p) { pedEnAper[p.pedido_id] = true; });
  var sem: Record<string, number>[] = []; for (var j = 0; j < NB; j++) sem.push({});
  R.pedidos.forEach(function (p) {
    var fe = new Date(p.fecha_pedido).getTime(); if (isNaN(fe)) return;
    var k = planEngDifDias(R.hoy, fechaLocal(fe)); if (k < 0) k = 0;
    var w = Math.floor(k / (K.P || 7)); if (w >= NB) return;
    var its = (cfg.consumo.items === "editados" && p.items_editados) ? parseItems(p.items_editados) : parseItems(p.items), orig = parseItems(p.items);
    its.forEach(function (it: any) {
      if (!it) return; var s = it.sku || skuMap[it.nombre];
      if (!s && it.nombre) { var o = orig.filter(function (x: any) { return x && x.nombre === it.nombre && x.sku; })[0]; s = o && o.sku; }
      if (s !== sku) return;
      var tipo = planDatTipo(p, apById, pedEnAper, cfg.aper.gracia_dias, cfg.aper.vencida_max), q = Number(it.cantidad || 0);
      if (q > 0) sem[w][tipo] = (sem[w][tipo] || 0) + q;
    });
  });
  var filas: Traza["filas"] = [];
  for (var i = 0; i < NB; i++) {
    var s2 = K.fc.sem[i] || {}, py = f.bp[i], rl = f.br[i];
    var tip = Object.keys(sem[i]).filter(function (t) { return cfg.consumo.tipos[t]; }).map(function (t): [string, number] { return [NOM_TIPO[t] || t, sem[i][t]]; });
    filas.push({ ini: s2.ini || null, fin: s2.fin || null, real: rl == null ? null : rl, tipos: tip, proy: py == null ? null : py, dif: py > 0 && rl != null ? (rl - py) / py * 100 : null });
  }
  return { sku: sku, nombre: f.nombre, tasa: f.tasa, venta30: f.venta30, motivo: f.motivo, filas: filas };
}
