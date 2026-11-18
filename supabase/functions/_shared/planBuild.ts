// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL del armado del Plan de abasto del sitio viejo (app/index.html a9e4a22): _planBuild (33364) sin la parte de
// proveedores (historial de 60 días, mínimos y _planAgruparProv llegan con el plan 3f), _planBacktestAgg (33444),
// _planAplicarServidor (33490), _planCalcMontos, _planSinSrv, _planEsCafe y _planKey. planBuild_parity_test.ts compara
// contra la app.
import { planEngDia, planEngDifDias } from "./planEngine.ts";
import { planEngine } from "./planMotor.ts";
import { borradoresPlan, type DatosPlan, planDatAMotor, zocKey } from "./planDatos.ts";

// Café tostado (INS-CAF-xxx y similares): se planea por kilos en la pestaña Café, no con el plan semanal.
export function planEsCafe(c: any): boolean { return /caf[eé]\s+tostado/i.test(String(c.nombre || "")) || /^INS-CAF-/i.test(String(c.sku || "")); }
export function planKey(n: any): string { return String(n || "").trim().toLowerCase() || "__sin__"; }
/** Datos crudos sin la simulación del servidor: el cálculo local puro (Indicadores y DOH). */
export function planSinSrv(R: DatosPlan): DatosPlan { return R ? Object.assign({}, R, { srv: null }) : R; }

/** Plan armado (el objeto `c` de _planBuild, sin `hoy` Date ni la parte de proveedores). */
export interface Plan {
  cfg: any; rows: any[]; soloCafe: boolean; nUnica: number; nCafe: number; ltExiste: Record<string, boolean>; sinMapear: number;
  ignoradas: number; compViejo: { uds: number; ln: number; folios: number; dias: number }; tipoUds: Record<string, number>;
  aperCuentan: number; avisos: string[]; nAperturas: number; lineasInvalidas: number; skuFuera: number; histMotor: number;
  histReal: number; lecturaVacia: boolean; nMetodoCae: number; nRecorteCae: number; nSegCae: number; nBloqueados: number;
  nCortos: number; nInvalidos: number; nPicos: number; fuenteCant: "local" | "servidor"; srvSinPlan: number; srvSinDatos: number;
  P: number; hoyIso: string; W: number; semIni: string[]; bt: any;
}

// Arma el plan (filas + avisos + seguimiento) a partir de datos crudos y configuración.
export function planBuild(R: DatosPlan, cfg: any, opt?: { cafe?: boolean }): Plan {
  var conv = planDatAMotor(R, cfg), res = planEngine(cfg, conv.raw), meta = conv.meta, soloCafe = !!(opt && opt.cafe);
  var hoyIso = conv.raw.hoy, P = Math.max(1, Math.floor(Number(cfg.compra.prox_dias) || 7));
  var rawBy: Record<string, any> = {}; conv.raw.skus.forEach(function (s: any) { rawBy[s.sku] = s; });
  var catBy: Record<string, any> = {}; R.cat.forEach(function (c) { catBy[c.sku] = c; });
  var V = cfg.consumo.ventana;
  // Compra Unica (equipo, compras que no se repiten): no entra al plan de compras recurrentes
  var nUnica = 0, nCafe = 0;
  var rows = res.rows.filter(function (e) { var c0 = catBy[e.sku]; if (c0 && c0.estatus === "Compra Unica") { nUnica++; return false; } if (soloCafe) return !!(c0 && planEsCafe(c0)); if (c0 && cfg.compra.excluir_cafe !== false && planEsCafe(c0)) { nCafe++; return false; } return true; }).map(function (e) {
    var s = rawBy[e.sku], c = catBy[e.sku];
    var venta = 0; for (var k = 0; k < Math.min(V, meta.histMotor); k++) venta += Number(s.u[k] || 0);
    var r: any = { sku: e.sku, nombre: c.nombre || e.sku, categoria: c.categoria || "", esCafe: planEsCafe(c),
      provNombre: c.proveedor_preferido || "Sin proveedor asignado", provKey: planKey(c.proveedor_preferido),
      costo: s.costo, ltDefault: !(s.lt > 0), stale: meta.staleUds[e.sku] || 0, staleLn: meta.staleLn[e.sku] || 0, borr: meta.borrUds[e.sku] || 0, llegaOC: meta.llegaMin[e.sku] || null,
      sinMov: venta <= 0 && s.porApertura <= 0, importacion: e.importacion || String(c.origen || "").toUpperCase() === "IMPORTADO",
      s: { venta: venta, inv: e.invBase, fisico: s.fisico, comp: s.comprometido, yulius: s.yulius, enOC: s.enOC, lt: e.lt, porApertura: s.porApertura,
        minPzas: s.minPzas, mult: s.multiplo > 1 ? s.multiplo : 1, diasSeg: s.diasSeg, dm: e.dm },
      calc: e };
    e.diasCubrir = e.H;
    // Sin venta ni piezas por apertura: no hay demanda que cubrir, aunque el inventario esté en negativo.
    if (r.sinMov) { e.pedirEsta = 0; e.pedirProx = 0; e.accion = "OK"; e.sem = e.sem.map(function () { return 0; }); e.kPrimera = null; }
    r.sem = e.sem;
    r.fechaLimite = e.kPrimera === null ? null : planEngDia(hoyIso, P * e.kPrimera);
    r.ultConteo = R.conteoUlt.cedis[e.sku] || null;
    return r;
  });
  var rango: Record<string, number> = { Urgente: 0, Pronto: 1, Normal: 2 };
  rows.sort(function (a, b) {
    return rango[a.calc.urgencia] - rango[b.calc.urgencia]
      || (a.calc.diasHoy === null ? 1e9 : a.calc.diasHoy) - (b.calc.diasHoy === null ? 1e9 : b.calc.diasHoy)
      || a.nombre.localeCompare(b.nombre);
  });
  var c: any = { cfg: cfg, rows: rows, soloCafe: soloCafe, nUnica: nUnica, nCafe: nCafe, ltExiste: meta.ltExiste, sinMapear: meta.sinMapear,
    ignoradas: meta.ignoradas, compViejo: meta.compViejo, tipoUds: meta.tipoUds, aperCuentan: res.aper.cuentan,
    avisos: R.avisos, nAperturas: R.aperturas.length, lineasInvalidas: meta.lineasInvalidas, skuFuera: meta.skuFuera, histMotor: meta.histMotor, histReal: R.histReal || R.hist,
    // Lecturas que en producción nunca deberían venir vacías: si alguna lo está (sin error) casi seguro es un permiso (RLS).
    lecturaVacia: R.cat.length === 0 || R.pedidos.length === 0 || R.oc.length === 0 };
  var act = rows.filter(function (r) { return !r.sinMov && !r.importacion; });
  c.nMetodoCae = cfg.consumo.metodo === "promedio" ? 0 : act.filter(function (r) { return r.calc.metodo_efectivo !== cfg.consumo.metodo; }).length;
  c.nRecorteCae = (cfg.consumo.metodo === "promedio" && cfg.picos.manejo === "recortar") ? act.filter(function (r) { return !r.calc.elegible; }).length : 0;
  c.nSegCae = cfg.seg.metodo === "estadistico" ? act.filter(function (r) { return r.calc.seg_efectiva !== "estadistico"; }).length : 0;
  c.nBloqueados = act.filter(function (r) { return r.calc.bloqueado; }).length;
  c.nCortos = act.filter(function (r) { return r.calc.confianza === "baja"; }).length;
  c.nInvalidos = act.filter(function (r) { return r.calc.datos_invalidos && r.calc.datos_invalidos.length; }).length;
  c.nPicos = act.filter(function (r) { return r.calc.pico_reciente; }).length;
  planAplicarServidor(c, R, P, hoyIso);
  planCalcMontos(c);
  // Calendario semana a semana: longitud de la semana, número de semanas y fecha de inicio de cada una (hoy + P·k).
  c.P = P; c.hoyIso = hoyIso; c.W = rows.length ? rows[0].sem.length : Math.max(2, Math.min(52, Math.floor(Number(cfg.compra.semanas) || 12)));
  if (c.fuenteCant === "servidor") c.W = Math.min(c.W, 12); // la primera fila puede ser de importación (no se recorta)
  c.semIni = []; for (var kk = 0; kk < c.W; kk++) c.semIni.push(planEngDia(hoyIso, P * kk));
  planBacktestAgg(c, R);
  return c as Plan;
}

// Seguimiento de ventas: lo que el modelo habría proyectado para cada semana pasada frente a lo realmente vendido, valuado a
// costo, y las compras (OC emitidas) de esas mismas semanas. Semana pasada j = días [P·(j−1), P·j−1] atrás (j=1 incluye hoy).
export function planBacktestAgg(c: any, R: DatosPlan): void {
  var P = c.P, rows = c.rows, NB = rows.length ? rows[0].calc.btProy.length : 0, semanas: any[] = [], j: number, i: number;
  for (j = 0; j < NB; j++) {
    var s: any = { j: j + 1, ini: planEngDia(c.hoyIso, -(P * (j + 1) - 1)), fin: planEngDia(c.hoyIso, -P * j), proy: 0, real: 0, proyUds: 0, realUds: 0, n: 0, completa: true };
    rows.forEach(function (r: any) {
      var p = r.calc.btProy[j], re = r.calc.btReal[j];
      if (r.sinMov) return;
      if (p == null || re == null) return;
      s.n++; s.proyUds += p; s.realUds += re;
      if (r.costo > 0) { s.proy += p * r.costo; s.real += re * r.costo; }
    });
    s.desv = s.proy > 0 ? (s.real - s.proy) / s.proy : null;
    semanas.push(s);
  }
  // Por artículo, sobre las semanas con proyección (las más recientes primero): ¿se vende más o menos de lo proyectado?
  var arts: any[] = [];
  rows.forEach(function (r: any) {
    if (r.sinMov) return;
    var p = 0, re = 0, n = 0;
    for (i = 0; i < NB; i++) { var a = r.calc.btProy[i], b = r.calc.btReal[i]; if (a == null || b == null) continue; p += a; re += b; n++; }
    if (!n) return;
    arts.push({ sku: r.sku, nombre: r.nombre, n: n, proy: p, real: re, dif: re - p, desv: p > 0 ? (re - p) / p : null, valor: r.costo > 0 ? (re - p) * r.costo : null, costo: r.costo });
  });
  // Compras emitidas por semana (folios con monto). El monto de una OC vive en su primera línea (no se puede repartir por SKU):
  // un folio con algún artículo de importación se cuenta aparte.
  var impBy: Record<string, boolean> = {}; rows.forEach(function (r: any) { if (r.importacion) impBy[r.sku] = true; });
  var comp = new Array(NB).fill(0), compImp = new Array(NB).fill(0), compN = new Array(NB).fill(0), sinMonto = 0, folios: Record<string, any> = {}, dsetBt: Record<string, 1> | null = null;
  try { dsetBt = borradoresPlan(R, c.cfg); } catch { /* un borrador de OC de Zoho no es una compra: no cuenta */ }
  (R.oc || []).forEach(function (r: any) {
    if (!r.folio || !r.fecha) return;
    if (dsetBt && dsetBt[zocKey(r.folio) + "|" + String(r.sku).trim().toUpperCase()]) return;
    var f = folios[r.folio] || (folios[r.folio] = { fecha: String(r.fecha).slice(0, 10), monto: 0, imp: false });
    f.monto += Number(r.monto || 0);
    if (impBy[r.sku]) f.imp = true;
  });
  Object.keys(folios).forEach(function (fo) {
    var f = folios[fo], k = planEngDifDias(c.hoyIso, f.fecha);
    if (k < 0 || k >= P * NB) return;
    compN[Math.floor(k / P)]++;
    if (!(f.monto > 0)) { if (!f.imp) sinMonto++; return; }
    (f.imp ? compImp : comp)[Math.floor(k / P)] += f.monto;
  });
  c.bt = { n: NB, semanas: semanas, arts: arts, compras: comp, comprasImp: compImp, comprasN: compN, comprasSinMonto: sinMonto };
}

// La simulación del servidor (la misma de la OC automática, Qué pedir y Pagos) decide cuánto y cuándo comprar.
// Se conservan del Plan el contexto (disponible, consumo, días que alcanza, urgencia) y sus avisos.
export function planAplicarServidor(c: any, R: DatosPlan, P: number, hoyIso: string): void {
  var S = R && R.srv;
  if (!S || !S.ok) { c.fuenteCant = "local"; c.srvSinPlan = 0; c.srvSinDatos = 0; return; }
  c.fuenteCant = "servidor";
  var dia = function (iso: any) { return Date.parse(String(iso).slice(0, 10) + "T00:00:00Z"); }, h = dia(hoyIso), por: Record<string, any[]> = {};
  var fecha = function (k: number) { return new Date(h + P * k * 864e5).toISOString().slice(0, 10); };
  // d <= 0: la compra toca hoy (o ya debió hacerse): es lo que ordena la OC automática.
  (S.compras || []).forEach(function (x) { var d = Math.floor((dia(x.fecha_oc) - h) / 864e5), k = d < 0 ? 0 : Math.floor(d / P); (por[x.sku] = por[x.sku] || []).push({ k: k, q: Number(x.cantidad) || 0, hoy: d <= 0 }); });
  // Sin costo o sin proveedor en Zoho la simulación no los compra: conservan el cálculo local.
  var sinDatos: Record<string, 1> = {}; (S.sinCosto || []).concat(S.sinProveedor || []).forEach(function (s) { sinDatos[s] = 1; });
  var vistos: Record<string, 1> = {}, cafeSrv = !!(c.cfg && c.cfg.compra && c.cfg.compra.excluir_cafe === false);
  c.srvSinDatos = 0;
  c.rows.forEach(function (r: any) {
    vistos[r.sku] = 1;
    if (r.importacion || r.sinMov) return;
    if (r.esCafe && !cafeSrv) return; // la corrida solo trae café con compra.excluir_cafe=false
    // Solo si la simulación no le proyecta ninguna compra: sinCosto también lista SKUs cuya OC abierta no tiene precio.
    if (sinDatos[r.sku] && !por[r.sku]) { r.calc.fuente = "local-sin-datos"; c.srvSinDatos++; return; }
    // El calendario se limita a 12 semanas: la simulación del servidor no ve más lejos.
    var W = Math.min(r.sem.length, 12), sem: number[] = [], i: number, hoyQ = 0; for (i = 0; i < W; i++) sem.push(0);
    (por[r.sku] || []).forEach(function (x) { if (x.k < W) sem[x.k] += x.q; if (x.hoy) hoyQ += x.q; });
    r.sem = sem; r.calc.sem = sem; r.calc.pedirEsta = sem[0]; r.calc.pedirProx = W > 1 ? sem[1] : 0; r.calc.pedirHoy = hoyQ;
    var kP: number | null = null; for (i = 0; i < W; i++) if (sem[i] > 0) { kP = i; break; }
    r.calc.kPrimera = kP; r.fechaLimite = kP === null ? null : fecha(kP);
    var prev = r.calc.accion, oc = !!(r.s && r.s.enOC > 0);
    r.calc.accion = sem[0] > 0 ? "PEDIR" : (W > 1 && sem[1] > 0) ? (oc ? "PRÓXIMA (OC emitida)" : "PRÓXIMA") : (prev === "pico" ? "pico" : "OK");
    r.calc.fuente = "servidor";
  });
  c.srvSinPlan = Object.keys(por).filter(function (s) { return !vistos[s]; }).length;
}

export function planCalcMontos(c: any): void {
  c.rows.forEach(function (r: any) {
    r.montoEsta = r.sinMov ? null : (r.costo > 0 ? r.calc.pedirEsta * r.costo : null);
    r.montoProx = r.sinMov ? null : (r.costo > 0 ? r.calc.pedirProx * r.costo : null);
  });
}
