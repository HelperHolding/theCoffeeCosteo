// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL del resto del motor del Plan de abasto del sitio viejo (app/index.html a9e4a22, líneas 32728–32954):
// _planEngAperturasDetalle, _planEngSku completo (cobertura, aperturas, pedido por semana, urgencia y seguimiento de
// ventas) y _planEngine. Misma lógica y mismos nombres sin el guion bajo; los helpers vienen de planEngine.ts.
// planMotor_parity_test.ts compara este archivo contra la app: si la app cambia su motor, la prueba falla.
import {
  planEngCeil, planEngDia, planEngDifDias, planEngFactor, planEngMasEspecifico, planEngN, planEngTasaBase, planEngValido,
} from "./planEngine.ts";

export const PLAN_ENG_Z: Record<string, number> = { "0.9": 1.2816, "0.95": 1.6449, "0.975": 1.96, "0.99": 2.3263 };

/** Número de la configuración o su valor por defecto cuando falta o no es válido (texto, null, NaN...). */
export function planEngNumDef(x: any, def: number): number { return planEngValido(x) ? Number(x) : def; }
const PLAN_ENG_BLOQ = ["siempre", "si_cubre", "nunca"];

export interface AperturaDetalle { id: any; cuenta: boolean; peso: number; fe: string | null; sinFecha: boolean; motivo: string }
export interface AperturasMotor { con: { dias: number; peso: number }[]; sinSuma: number; n?: number }

// Detalle de cada apertura: ¿pasa los filtros globales y con qué peso?
export function planEngAperturasDetalle(cfg: any, raw: any): AperturaDetalle[] {
  return (raw.aperturas || []).map(function (a: any) {
    var aj = (cfg.aper.ajustes || {})[a.id] || {};
    var d: AperturaDetalle = { id: a.id, cuenta: false, peso: 0, fe: null, sinFecha: false, motivo: "" };
    var estOk = (a.estatus === "en_proceso" || !a.estatus || aj.incluir === true);
    if (!estOk) { d.motivo = "estatus " + a.estatus; return d; }
    if (aj.incluir === false) { d.motivo = "excluida"; return d; }
    if (a.kit === true && aj.incluir !== true) { d.motivo = "ya hizo su pedido de kit"; return d; }
    var fe = aj.fecha || a.fecha || null;
    d.fe = fe;
    if (fe === null) { d.cuenta = true; d.sinFecha = true; d.peso = aj.peso != null ? Number(aj.peso) : Number(cfg.aper.peso_sin_fecha); d.motivo = "sin fecha"; return d; }
    if (planEngDifDias(raw.hoy, fe) > Number(cfg.aper.vencida_max)) { d.motivo = "fecha vencida"; return d; }
    d.cuenta = true; d.peso = aj.peso != null ? Number(aj.peso) : 1;
    return d;
  });
}

export function planEngSku(cfg: any, raw: any, s0: any, aper: AperturasMotor): any {
  var hoy = raw.hoy, inval: string[] = [];
  var num = function (nombre: string, x: any, def: number, min?: number) {
    if (!planEngValido(x)) { inval.push(nombre); return def; }
    var v = Number(x); return min != null ? Math.max(min, v) : v;
  };
  var s: any = { sku: s0.sku,
    fisico: num("fisico", s0.fisico, 0), yulius: num("yulius", s0.yulius, 0), comprometido: num("comprometido", s0.comprometido, 0),
    costo: num("costo", s0.costo, 0, 0), enOC: num("enOC", s0.enOC, 0, 0), porApertura: num("porApertura", s0.porApertura, 0, 0), minPzas: num("minPzas", s0.minPzas, 0, 0) };
  var mul = num("multiplo", s0.multiplo, 1); s.multiplo = mul > 1 ? mul : 1;
  var ltc = planEngN(s0.lt, 0);
  var lt = ltc > 0 ? Math.ceil(ltc) : Number(cfg.compra.lt_default);
  var diasSeg = (s0.diasSeg == null || !planEngValido(s0.diasSeg)) ? null : Math.max(0, Number(s0.diasSeg));
  var vida = (s0.vida == null || !planEngValido(s0.vida)) ? null : Math.max(0, Number(s0.vida));
  var u: number[] = [], k: number;
  for (k = 0; k < raw.hist; k++) { u.push(Math.max(0, planEngN(s0.u && s0.u[k], 0))); }

  // 4.0 Importación, ciclo de compra y regla de bloqueo por OC propios de su clase
  var imp = lt > Number(cfg.compra.entrega_max);
  var ciclo = planEngNumDef(imp ? cfg.compra.ciclo_imp : cfg.compra.ciclo_nac, imp ? 30 : 7);
  if (ciclo < 1) ciclo = imp ? 30 : 7;
  var bloq = imp ? cfg.compra.bloqueo_oc_imp : cfg.compra.bloqueo_oc;
  if (PLAN_ENG_BLOQ.indexOf(bloq) < 0) bloq = imp ? "si_cubre" : "siempre";
  var P = Math.max(1, Math.floor(planEngNumDef(cfg.compra.prox_dias, 7)));
  var W = Math.max(2, Math.min(52, Math.floor(planEngNumDef(cfg.compra.semanas, 12))));
  var NB = Math.max(0, Math.min(12, Math.floor(planEngNumDef(cfg.compra.bt_semanas, 4))));

  // 4.1–4.2 Ventana efectiva y tasa base
  var tb = planEngTasaBase(cfg, s.sku, u, raw.hist, hoy, vida);
  var Ve = tb.Ve, B = tb.B, robusto = tb.robusto, escala = tb.escala, tasa = tb.tasa;
  var g = Number(cfg.consumo.crecimiento) || 0;
  var f = function (iso: string) { return planEngFactor(cfg, s.sku, iso); };
  // factor futuro (con crecimiento) y suma acumulada SF(1,h)
  var ffc: Record<number, number> = {};
  var ff = function (j: number) {
    if (ffc[j] === undefined) ffc[j] = f(planEngDia(hoy, j)) * Math.pow(1 + g / 100, (j + Ve / 2) / 30);
    return ffc[j];
  };
  var cum = [0];
  var SF1 = function (h: number) {
    while (cum.length <= h) { var j = cum.length; cum.push(cum[j - 1] + ff(j)); }
    return h <= 0 ? 0 : cum[h];
  };

  // 4.3 Cobertura y seguridad
  var dm: number, override = false;
  if (diasSeg !== null) { dm = diasSeg; override = true; }
  else {
    var kp = planEngMasEspecifico(cfg.seg.prefijo, s.sku);
    if (kp !== null) { dm = Number(cfg.seg.prefijo[kp]); override = true; } else dm = Number(cfg.seg.dias);
  }
  var estad = cfg.seg.metodo === "estadistico" && B >= 8 && robusto;
  var H: number, demandaH: number, seguridad = 0;
  if (!estad) {
    H = Math.min(Number(cfg.compra.h_max), Math.ceil(lt + dm));
    demandaH = tasa * SF1(H);
  } else {
    var R = Number(cfg.seg.revision);
    H = Math.min(Number(cfg.compra.h_max), Math.ceil(lt + R));
    demandaH = tasa * SF1(H);
    var fbar = H > 0 ? SF1(H) / H : 1;
    var sigL = lt * (Number(cfg.seg.lt_cv) || 0);
    var z = PLAN_ENG_Z[cfg.seg.servicio]; if (z == null) z = 1.6449;
    seguridad = z * Math.sqrt(Math.pow(escala * fbar, 2) * (H / 7) + Math.pow(tasa * fbar * sigL, 2));
    if (override) { seguridad = Math.max(seguridad, tasa * fbar * Math.max(0, dm - R)); }
  }
  // 4.3b Cobertura extra por ciclo de compra
  var Heff = H + Math.max(0, Math.ceil(ciclo) - P);

  // 4.4 Aperturas
  var nAper = function (Hh: number) {
    if (cfg.aper.incluir === false) return 0; // decisión: no contemplar aperturas en las compras
    var tasaN = Number(cfg.aper.por_mes) * (cfg.aper.horizonte_auto ? Hh : Number(cfg.aper.horizonte)) / 30;
    var calN = 0;
    aper.con.forEach(function (a) { if (a.dias - Number(cfg.aper.antelacion) <= Hh) calN += a.peso; });
    calN += Math.min(aper.sinSuma, Number(cfg.aper.por_mes) * Hh / 30);
    return cfg.aper.modo === "calendario" ? calN : cfg.aper.modo === "mayor" ? Math.max(tasaN, calN) : tasaN;
  };
  var paraAper = s.porApertura * nAper(H);

  // 4.5 Disponible y necesito
  var invBase = (cfg.inv.base === "disponible" ? s.fisico - s.comprometido : s.fisico) + (cfg.inv.yulius ? s.yulius : 0);
  var disponible = invBase + s.enOC;
  var necesito = demandaH + seguridad + paraAper;
  var consumo = tasa * SF1(7) / 7;
  var diasAlcanza = consumo > 0 ? disponible / consumo : null;
  var hayOC = s.enOC > 0;

  // 4.6 Pedido por semana (esta semana, próxima y el calendario completo)
  var redondeo = function (x: number) {
    if (x <= 0) return 0;
    var y = Math.max(x, s.minPzas);
    if (s.multiplo > 1) y = planEngCeil(y / s.multiplo) * s.multiplo;
    return y;
  };
  var Req = function (h: number) { return (tasa * SF1(h) + seguridad) + s.porApertura * nAper(h); };
  var faltaHoy = necesito - disponible;
  var bloqueaPorOC = hayOC && (bloq === "siempre" || (bloq === "si_cubre" && faltaHoy <= Number(cfg.compra.bloqueo_umbral) * necesito));
  var bloqueado = faltaHoy > 1e-9 && bloqueaPorOC;
  var sem: number[] = [], oferta = disponible, kPrimera: number | null = null, kk: number, Q: number;
  for (kk = 0; kk < W; kk++) {
    Q = 0;
    if (kk === 0) {
      if (faltaHoy > 1e-9 && !bloqueaPorOC) Q = redondeo(planEngCeil((Heff === H ? necesito : Req(Heff)) - oferta));
    } else {
      var falta = Req(P * kk + H) - oferta;
      if (falta > 1e-9) Q = redondeo(planEngCeil((Heff === H ? Req(P * kk + H) : Req(P * kk + Heff)) - oferta));
    }
    sem.push(Q); oferta += Q;
    if (Q > 0 && kPrimera === null) kPrimera = kk;
  }
  var pedirEsta = sem[0], pedirProx = sem[1];
  var accion = pedirEsta > 0 ? "PEDIR" : pedirProx > 0 ? (hayOC ? "PRÓXIMA (OC emitida)" : "PRÓXIMA") : "OK";

  // 4.7 Urgencia
  var diasHoy = consumo > 0 ? Math.max(0, invBase) / consumo : null;
  var urgencia = "Normal";
  if (diasHoy !== null) { if (diasHoy < 5) urgencia = "Urgente"; else if (diasHoy < dm) urgencia = "Pronto"; }

  // 4.10 Seguimiento de ventas: lo que el modelo habría proyectado para cada bloque pasado frente a lo realmente vendido
  var btProy: (number | null)[] = [], btReal: (number | null)[] = [], j: number, sh: number, real: number | null, proy: number | null;
  for (j = 1; j <= NB; j++) {
    sh = P * j; real = null; proy = null;
    if (sh <= raw.hist) { real = 0; for (k = P * (j - 1); k < sh; k++) real += u[k]; }
    if (real !== null && raw.hist - sh >= 14) {
      var tbs = planEngTasaBase(cfg, s.sku, u.slice(sh), raw.hist - sh, planEngDia(hoy, -sh), vida === null ? null : Math.max(0, vida - sh));
      var acc = 0, t: number;
      for (t = 1; t <= P; t++) acc += planEngFactor(cfg, s.sku, planEngDia(hoy, -sh + t)) * Math.pow(1 + g / 100, (t + tbs.Ve / 2) / 30);
      proy = tbs.tasa * acc;
    }
    btProy.push(proy); btReal.push(real);
  }

  return { sku: s.sku, tasa: tasa, consumo: consumo, disponible: disponible, invBase: invBase, necesito: necesito, demandaH: demandaH,
    seguridad: seguridad, paraAper: paraAper, H: H, pedirEsta: pedirEsta, pedirProx: pedirProx, accion: accion, urgencia: urgencia,
    diasAlcanza: diasAlcanza, diasHoy: diasHoy, importacion: imp, picos_n: tb.picosN,
    pico_reciente: tb.picoReciente, elegible: robusto, metodo_efectivo: tb.metodoEf, seg_efectiva: estad ? "estadistico" : "dias", Ve: Ve, B: B,
    bloqueado: bloqueado, confianza: tb.confianza, datos_invalidos: inval, lt: lt, dm: dm,
    Heff: Heff, ciclo: ciclo, sem: sem, kPrimera: kPrimera, btProy: btProy, btReal: btReal };
}

export function planEngine(cfg: any, raw: any): { rows: any[]; aper: { cuentan: number } } {
  var det = planEngAperturasDetalle(cfg, raw).filter(function (d) { return d.cuenta; });
  var aper: AperturasMotor = { con: [], sinSuma: 0, n: det.length };
  det.forEach(function (d) {
    if (d.sinFecha) aper.sinSuma += d.peso;
    else aper.con.push({ dias: planEngDifDias(d.fe as string, raw.hoy), peso: d.peso });
  });
  var rows: any[] = [];
  raw.skus.forEach(function (s: any) {
    if (s.estatus === "Hasta Agotar Existencias" || s.estatus === "Inactivo") return;
    rows.push(planEngSku(cfg, raw, s, aper));
  });
  return { rows: rows, aper: { cuentan: aper.n as number } };
}
