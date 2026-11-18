// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL del motor de pronóstico del Plan de abasto de la app (app/index.html, funciones _planEng*, _planCfgDef,
// _planCfgNormalizar y la parte de _planDatAMotor/_planDatTipo que arma la serie diaria de ventas). Misma lógica, mismos
// nombres sin el guion bajo. planEngine_parity_test.ts compara este archivo contra el código de la app: si la app cambia
// su motor, la prueba falla y este archivo se debe volver a portar.
import { difDias } from "./fechas.ts";

// ═══ Motor (app: _planEngDia … _planEngTasaBase, y la proyección de _planEngSku) ═══════════════════════════════════

export function planEngDia(iso: string, n: number): string {
  var p = iso.split("-");
  var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]) + n * 864e5);
  return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
}
export function planEngDifDias(a: string, b: string): number { // a − b en días
  var pa = a.split("-"), pb = b.split("-");
  return Math.round((Date.UTC(+pa[0], +pa[1] - 1, +pa[2]) - Date.UTC(+pb[0], +pb[1] - 1, +pb[2])) / 864e5);
}
export function planEngCeil(x: number): number { return Math.ceil(Math.round(x * 1e6) / 1e6); }
export function planEngMediana(a: number[]): number {
  if (!a.length) return 0;
  var s = a.slice().sort(function (x, y) { return x - y; }), n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
export function planEngPercentil(a: number[], p: number): number {
  if (!a.length) return 0;
  p = Math.min(100, Math.max(0, p));
  var s = a.slice().sort(function (x, y) { return x - y; }), pos = (s.length - 1) * p / 100, i = Math.floor(pos), fr = pos - i;
  return i + 1 >= s.length ? s[i] : s[i] + fr * (s[i + 1] - s[i]);
}
export function planEngMAD(a: number[]): number {
  var m = planEngMediana(a);
  return planEngMediana(a.map(function (x) { return Math.abs(x - m); }));
}
export function planEngCoincide(sku: any, v: any): boolean { sku = String(sku); v = String(v); return sku === v || sku.indexOf(v + "-") === 0; }
export function planEngMasEspecifico(map: any, sku: string): string | null {
  var best: string | null = null;
  Object.keys(map || {}).forEach(function (k) {
    if (planEngCoincide(sku, k) && (best === null || k.length > best.length)) best = k;
  });
  return best;
}
export function planEngN(x: any, def: any): any {
  return ((typeof x === "number" || typeof x === "string") && x !== "" && isFinite(Number(x))) ? Number(x) : def;
}
export function planEngValido(x: any): boolean { return ((typeof x === "number" || typeof x === "string") && x !== "" && isFinite(Number(x))); }

// Factor de demanda de una fecha para un SKU: factor mensual (temporalidad) × factores de eventos, acotado a [0.1, 10].
export function planEngFactor(cfg: any, sku: string, iso: string): number {
  var fm = 1;
  if (cfg.temp && cfg.temp.activa) {
    var k = planEngMasEspecifico(cfg.temp.prefijo, sku);
    var arr = k ? cfg.temp.prefijo[k] : cfg.temp.mes;
    var m = +iso.slice(5, 7);
    if (arr && arr[m - 1] != null && isFinite(Number(arr[m - 1]))) fm = Number(arr[m - 1]);
  }
  var fe = 1;
  (cfg.eventos || []).forEach(function (e: any) {
    if (e.activo === false || !e.ini || !e.fin || iso < e.ini || iso > e.fin) return; // fechas vacías o ausentes: el evento no aplica
    var ap = false;
    if (e.alcance === "todos" || !e.alcance) ap = true;
    else if (e.alcance === "prefijo") ap = (e.valores || []).some(function (v: any) { return planEngCoincide(sku, v); });
    else if (e.alcance === "sku") ap = (e.valores || []).indexOf(sku) >= 0;
    if (ap) fe *= Number(e.factor);
  });
  return Math.min(10, Math.max(0.1, fm * fe));
}

// Tasa base (§4.1–§4.2) evaluada sobre una serie de ventas y una fecha base.
export function planEngTasaBase(cfg: any, sku: string, u: number[], hist: number, hoy: string, vida: number | null): any {
  var V = Number(cfg.consumo.ventana), Ve = V, i, k;
  if (cfg.consumo.divisor === "vida" && vida !== null) Ve = Math.max(1, Math.min(V, vida));
  if (cfg.consumo.alinear) Ve = Math.max(7, 7 * Math.floor(Ve / 7));
  Ve = Math.min(Ve, hist);
  var fPas: number[] = [], U = 0, F = 0;
  for (k = 0; k < Ve; k++) { var fk = planEngFactor(cfg, sku, planEngDia(hoy, -k)); fPas.push(fk); F += fk; U += u[k]; }
  var B = Math.floor(Ve / 7), q: number[] = [], w: number[] = [], phi: number[] = [];
  for (i = 0; i < B; i++) {
    var wi = 0, pi = 0;
    for (k = 7 * i; k < 7 * i + 7; k++) { wi += u[k]; pi += fPas[k]; }
    w.push(wi); phi.push(pi); q.push(7 * wi / pi);
  }
  var medq = planEngMediana(q), mad = planEngMAD(q);
  var positivos = q.filter(function (x) { return x > 0; }).length;
  var robusto = B >= 6 && positivos >= Math.floor(B / 2) + 1 && medq > 0;
  var escala = 1.4826 * mad;
  if (escala === 0) {
    var mean_ad = q.length ? q.reduce(function (a, x) { return a + Math.abs(x - medq); }, 0) / q.length : 0;
    escala = Math.max(1.2533 * mean_ad, Math.sqrt(medq));
  }
  var tope = medq + Number(cfg.picos.z) * escala;
  var esPico = q.map(function (x) {
    return robusto && x > tope && x >= Number(cfg.picos.ratio) * medq && (x - medq) >= Number(cfg.picos.min_uds);
  });
  var picosN = esPico.filter(Boolean).length;
  var picoReciente = !!(esPico[0] || esPico[1]);
  var tasa = F > 0 ? U / F : 0, metodoEf = "promedio";
  var metodo = cfg.consumo.metodo;
  if (metodo === "mediana" && robusto) { tasa = medq / 7; metodoEf = "mediana"; }
  else if (metodo === "percentil" && robusto) { tasa = planEngPercentil(q, Number(cfg.consumo.pctl)) / 7; metodoEf = "percentil"; }
  else if (metodo === "ponderado" && B >= 4) {
    var sw = 0, sx = 0;
    for (i = 0; i < B; i++) { var om = Math.pow(0.5, i / 2); sw += om; sx += om * (q[i] / 7); }
    tasa = sx / sw; metodoEf = "ponderado";
  } else if ((metodo === "promedio" || !metodo) && cfg.picos.manejo === "recortar" && robusto) {
    var sxw = 0, sphi = 0;
    for (i = 0; i < B; i++) {
      var qq = esPico[i] ? Math.min(q[i], tope) : q[i];
      sxw += qq * phi[i] / 7; sphi += phi[i];
    }
    for (k = 7 * B; k < Ve; k++) { sxw += u[k]; sphi += fPas[k]; }
    tasa = sphi > 0 ? sxw / sphi : 0;
    metodoEf = "promedio_recortado";
  }
  return { Ve: Ve, B: B, robusto: robusto, escala: escala, picosN: picosN, picoReciente: picoReciente, tasa: tasa, metodoEf: metodoEf, confianza: Ve < 14 ? "baja" : "normal" };
}

/**
 * Demanda pronosticada de los próximos h días, idéntica a demandaH de _planEngSku: tasa × Σ_{j=1..h} ff(j), con
 * ff(j) = factor(hoy+j) × (1+g/100)^((j+Ve/2)/30). `u`, `hist` y `vida` se sanean como en _planEngSku.
 * h debe ser entero (como H en la app).
 */
export function demandaPlan(cfg: any, sku: string, u0: number[], hist: number, hoy: string, vida0: any, h: number): { D: number; tasa: number } {
  var vida = (vida0 == null || !planEngValido(vida0)) ? null : Math.max(0, Number(vida0));
  var u: number[] = [], k;
  for (k = 0; k < hist; k++) { u.push(Math.max(0, planEngN(u0 && u0[k], 0))); }
  var tb = planEngTasaBase(cfg, sku, u, hist, hoy, vida);
  var Ve = tb.Ve, tasa = tb.tasa;
  var g = Number(cfg.consumo.crecimiento) || 0;
  var f = function (iso: string) { return planEngFactor(cfg, sku, iso); };
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
  return { D: tasa * SF1(h), tasa: tasa };
}

/**
 * Curva D(0..H) de demandaPlan en una sola pasada: la tasa y los factores por día se calculan una vez y se acumulan.
 * curva[h] === demandaPlan(..., h).D para todo h en 0..H (D(0) = 0). H debe ser entero.
 */
export function demandaPlanCurva(cfg: any, sku: string, u0: number[], hist: number, hoy: string, vida0: any, H: number): number[] {
  var vida = (vida0 == null || !planEngValido(vida0)) ? null : Math.max(0, Number(vida0));
  var u: number[] = [], k;
  for (k = 0; k < hist; k++) { u.push(Math.max(0, planEngN(u0 && u0[k], 0))); }
  var tb = planEngTasaBase(cfg, sku, u, hist, hoy, vida);
  var Ve = tb.Ve, tasa = tb.tasa;
  var g = Number(cfg.consumo.crecimiento) || 0;
  var out = [0], cum = 0;
  for (var j = 1; j <= H; j++) {
    cum += planEngFactor(cfg, sku, planEngDia(hoy, j)) * Math.pow(1 + g / 100, (j + Ve / 2) / 30);
    out.push(tasa * cum);
  }
  return out;
}

// ═══ Configuración (app: _planCfgDef, _planCfgNum, _planCfgNormalizar) ══════════════════════════════════════════════

// Las secciones imp/cafe/zoho_oc/kpi (importación, café, carga de Zoho, KPIs) no las usa el motor: se conservan tal cual.
export function planCfgDef(): any {
  return {
    inv: { base: "disponible", yulius: false, comp_dias: 30 },
    consumo: { ventana: 30, metodo: "promedio", pctl: 75, divisor: "ventana", alinear: false, crecimiento: 0, items: "editados",
      tipos: { resurtido: true, sin_vincular: true, apertura: false, marketing: false, corporativo: false, llenado: false } },
    picos: { manejo: "incluir", z: 3.5, ratio: 1.5, min_uds: 3 },
    temp: { activa: false, mes: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], prefijo: {} },
    eventos: [],
    seg: { dias: 10, metodo: "dias", servicio: 0.95, revision: 7, lt_cv: 0, prefijo: {} },
    aper: { incluir: true, modo: "calendario", por_mes: 6, horizonte: 15, horizonte_auto: false, antelacion: 30, peso_sin_fecha: 0.5, vencida_max: 45, gracia_dias: 7, ajustes: {} },
    compra: { lt_default: 7, entrega_max: 45, prox_dias: 7, oc_vencida: 0, min_prov: "consolidar", min_ventana_dias: 14, bloqueo_oc: "siempre", bloqueo_umbral: 0.1, h_max: 180,
      ciclo_nac: 7, semanas: 12, bt_semanas: 4, excluir_cafe: true, fuente_oc: "plataforma", borradores: "no" },
    imp: null, cafe: null, zoho_oc: null, kpi: null,
    auto: { modo: "simulacion", cobertura_dias: 15, max_edad_sync_horas: 2, yulius_alerta_dias: 15, correos: [], pagos_horizonte: 90, pagos_base: "llegada", sync_catalogo: "registrar" },
  };
}
const PLAN_CFG_RANGOS: Record<string, [number, number, number]> = {
  "inv.comp_dias": [0, 365, 1], "consumo.ventana": [7, 180, 1], "consumo.pctl": [50, 99, 1], "picos.z": [1.5, 6, 0], "picos.ratio": [1, 5, 0], "picos.min_uds": [0, 100, 0],
  "seg.dias": [0, 120, 0], "seg.revision": [1, 30, 1], "aper.por_mes": [0, 60, 0], "aper.horizonte": [1, 90, 1], "aper.antelacion": [0, 180, 1],
  "aper.peso_sin_fecha": [0, 1, 0], "aper.vencida_max": [0, 365, 1], "aper.gracia_dias": [0, 60, 1],
  "consumo.crecimiento": [0, 20, 0], "seg.lt_cv": [0, 1, 0], "compra.bloqueo_umbral": [0, 1, 0], "compra.h_max": [30, 365, 1], "compra.lt_default": [1, 365, 1], "compra.entrega_max": [1, 365, 1], "compra.prox_dias": [1, 30, 1], "compra.oc_vencida": [0, 365, 1],
  "compra.ciclo_nac": [1, 120, 1], "compra.semanas": [4, 26, 1], "compra.bt_semanas": [0, 12, 1], "compra.min_ventana_dias": [1, 60, 1],
  "auto.cobertura_dias": [0, 120, 0], "auto.pagos_horizonte": [30, 180, 0], "auto.yulius_alerta_dias": [1, 90, 0], "auto.max_edad_sync_horas": [1, 72, 0],
};
const PLAN_CFG_OPC: Record<string, string[]> = {
  "inv.base": ["disponible", "fisico"], "consumo.metodo": ["promedio", "mediana", "percentil", "ponderado"], "consumo.divisor": ["ventana", "vida"],
  "consumo.items": ["editados", "originales"], "picos.manejo": ["incluir", "recortar"], "seg.metodo": ["dias", "estadistico"],
  "aper.modo": ["tasa", "calendario", "mayor"], "compra.min_prov": ["avisar", "consolidar"], "compra.bloqueo_oc": ["siempre", "si_cubre", "nunca"], "compra.fuente_oc": ["plataforma", "zoho"], "compra.borradores": ["cuentan", "no"], "auto.modo": ["simulacion", "real"], "auto.pagos_base": ["llegada", "oc"], "auto.sync_catalogo": ["registrar", "aplicar"],
};
const PLAN_RE_CORREO = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
function planCorreosNorm(a: any): string[] { var s: any = {}, o: string[] = []; (Array.isArray(a) ? a : []).forEach(function (x: any) { x = String(x == null ? "" : x).trim().toLowerCase(); if (x && PLAN_RE_CORREO.test(x) && !s[x]) { s[x] = 1; o.push(x); } }); return o.slice(0, 20); }
const PLAN_SERVICIOS = [0.9, 0.95, 0.975, 0.99];
export const PLAN_TIPOS_DEM = ["resurtido", "sin_vincular", "apertura", "marketing", "corporativo", "llenado"];

function planCfgNum(v: any, rango: [number, number, number], def: any): any {
  var n = Number(v);
  if (v === null || v === "" || !isFinite(n)) return def;
  n = Math.min(rango[1], Math.max(rango[0], n));
  return rango[2] ? Math.round(n) : n;
}

/** Configuración guardada (com_plan_config.config) completada con los valores por defecto y saneada como en la app. */
export function mergeCfg(x: any): any {
  var c = planCfgDef();
  if (!x || typeof x !== "object") return c;
  var g = function (sec: string, k: string) { return x[sec] && typeof x[sec] === "object" ? x[sec][k] : undefined; };
  Object.keys(PLAN_CFG_RANGOS).forEach(function (path) {
    var p = path.split("."), v = g(p[0], p[1]);
    if (v !== undefined) c[p[0]][p[1]] = planCfgNum(v, PLAN_CFG_RANGOS[path], c[p[0]][p[1]]);
  });
  Object.keys(PLAN_CFG_OPC).forEach(function (path) {
    var p = path.split("."), v = g(p[0], p[1]);
    if (PLAN_CFG_OPC[path].indexOf(v) >= 0) c[p[0]][p[1]] = v;
  });
  [["inv", "yulius"], ["temp", "activa"], ["consumo", "alinear"], ["aper", "horizonte_auto"], ["aper", "incluir"], ["compra", "excluir_cafe"]].forEach(function (b) { if (typeof g(b[0], b[1]) === "boolean") c[b[0]][b[1]] = g(b[0], b[1]); });
  var sv = Number(g("seg", "servicio")); if (PLAN_SERVICIOS.indexOf(sv) >= 0) c.seg.servicio = sv;
  var tp = g("consumo", "tipos");
  if (tp && typeof tp === "object") PLAN_TIPOS_DEM.forEach(function (t) { if (typeof tp[t] === "boolean") c.consumo.tipos[t] = tp[t]; });
  var fm = function (arr: any) {
    if (!Array.isArray(arr) || arr.length !== 12) return null;
    return arr.map(function (n) { return planCfgNum(n, [0.1, 5, 0], 1); });
  };
  var mes = fm(g("temp", "mes")); if (mes) c.temp.mes = mes;
  var pre = g("temp", "prefijo");
  if (pre && typeof pre === "object") Object.keys(pre).forEach(function (k) { var a = fm(pre[k]); if (a && k) c.temp.prefijo[String(k).toUpperCase()] = a; });
  var sp = g("seg", "prefijo");
  if (sp && typeof sp === "object") Object.keys(sp).forEach(function (k) { if (k) c.seg.prefijo[String(k).toUpperCase()] = planCfgNum(sp[k], [0, 120, 0], 10); });
  var aj = g("aper", "ajustes");
  if (aj && typeof aj === "object") Object.keys(aj).forEach(function (id) {
    var a = aj[id]; if (!a || typeof a !== "object") return;
    var o: any = {};
    if (typeof a.incluir === "boolean") o.incluir = a.incluir;
    if (typeof a.fecha === "string" && /^20\d\d-\d{2}-\d{2}$/.test(a.fecha)) o.fecha = a.fecha;
    if (a.peso != null && isFinite(Number(a.peso))) o.peso = planCfgNum(a.peso, [0, 5, 0], 1);
    if (Object.keys(o).length) c.aper.ajustes[id] = o;
  });
  if (Array.isArray(x.eventos)) x.eventos.forEach(function (e: any, i: number) {
    if (!e || typeof e !== "object") return;
    var ini = /^20\d\d-\d{2}-\d{2}$/.test(e.ini || "") ? e.ini : null, fin = /^20\d\d-\d{2}-\d{2}$/.test(e.fin || "") ? e.fin : null;
    if (!ini || !fin || fin < ini) return;
    var al = ["todos", "prefijo", "sku"].indexOf(e.alcance) >= 0 ? e.alcance : "todos";
    c.eventos.push({ id: String(e.id || ("ev" + i)), nombre: String(e.nombre || "Evento").slice(0, 80), ini: ini, fin: fin,
      factor: planCfgNum(e.factor, [0.1, 10, 0], 1), alcance: al,
      valores: Array.isArray(e.valores) ? e.valores.map(function (v: any) { return String(v).trim(); }).filter(Boolean).slice(0, 200) : [],
      activo: e.activo !== false });
  });
  c.imp = x.imp ?? null; c.cafe = x.cafe ?? null; c.zoho_oc = x.zoho_oc ?? null; c.kpi = x.kpi ?? null;
  if (Array.isArray(g("auto", "correos"))) c.auto.correos = planCorreosNorm(g("auto", "correos"));
  return c;
}

// ═══ Serie diaria de ventas (app: _planDatCargar → histReal, _planDatTipo, _planDatAMotor) ════════════════════════
// La app corre en el navegador (hora de Ciudad de México): "hoy", el día de cada pedido y la vida de cada SKU se cuentan
// en días locales. Aquí se reproduce con la zona America/Mexico_City explícita.

const ZONA = "America/Mexico_City";
const fmtZona = new Intl.DateTimeFormat("en-US", { timeZone: ZONA, hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
/** Desfase (ms) de la hora local de CDMX respecto a UTC en el instante t (negativo: CDMX va atrás). */
function desfase(t: number): number {
  const p: Record<string, number> = {};
  for (const x of fmtZona.formatToParts(new Date(t))) if (x.type !== "literal") p[x.type] = Number(x.value);
  const seg = Math.floor(t / 1000) * 1000;
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - seg;
}
/** Instante de la medianoche local de CDMX del día (y, m0, d) — equivale a `new Date(y, m0, d)` en el navegador. */
function medianocheLocal(y: number, m0: number, d: number): number {
  const u = Date.UTC(y, m0, d);
  const t = u - desfase(u);
  return u - desfase(t);
}
/** Fecha local (CDMX) 'YYYY-MM-DD' de un instante. */
function fechaLocal(t: number): string {
  const x = new Date(t + desfase(t));
  return x.toISOString().slice(0, 10);
}
/** Port de parseLocalDate: 'YYYY-MM-DD[T…]' → instante de su medianoche local, o null. */
function parseLocalDate(f: any): number | null {
  if (!f) return null;
  const s = (f.includes ? f.includes("T") : false) ? f.split("T")[0] : f;
  const [y, m, d] = (s + "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return medianocheLocal(y, m - 1, d);
}
export function medianocheCdmx(iso: string): number { return medianocheLocal(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)); }
function parseItems(x: any): any[] { if (typeof x === "string") { try { x = JSON.parse(x); } catch { x = []; } } return Array.isArray(x) ? x : []; }

export const CORP_EMAILS: Record<string, string> = { "workat@mx.thecoffee.jp": "Oficina Corporativa", "marketingtc@mx.thecoffee.jp": "Marketing" };
const PLAN_AP_FUERA: Record<string, number> = { activa: 1, cancelada: 1, cancelacion_pendiente: 1, corporativo: 1 };
const PLAN_RE_NOTA_APERTURA = /pedido de apertura|kit de apertura/i;
const CANCELADOS = new Set(["cancelado", "cancelacion_pendiente"]);

export type PedidoPlan = {
  id: any; apertura_id?: any; franquiciatario_email?: string | null; fecha_pedido: string; status?: string;
  items: any; items_editados: any; notas_shopify?: string | null; es_llenado_canal?: any; marketing_proyecto_id?: any;
};

// Clasifica un pedido (port de _planDatTipo). ap.estatus ya viene normalizado ('en_proceso' si no está fuera del pipeline).
export function planDatTipo(p: PedidoPlan, apById: Record<string, any>, pedEnAper: Record<string, boolean>, gracia: number, maxVenc: number): string {
  if (p.es_llenado_canal) return "llenado";
  if (p.marketing_proyecto_id) return "marketing";
  var em = String(p.franquiciatario_email || "").toLowerCase().trim();
  var sinSuc = !p.apertura_id || p.apertura_id === "000";
  if (sinSuc && CORP_EMAILS[em]) return em === "marketingtc@mx.thecoffee.jp" ? "marketing" : "corporativo";
  if (pedEnAper[p.id]) return "apertura";
  if (PLAN_RE_NOTA_APERTURA.test(p.notas_shopify || "")) return "apertura";
  if (sinSuc) return "sin_vincular";
  var ap = apById[p.apertura_id];
  if (ap) {
    var f = new Date(p.fecha_pedido).getTime(), fa = ap.fecha ? parseLocalDate(ap.fecha) : null;
    if (fa !== null) {
      if (f <= fa + (gracia + 1) * 864e5) return "apertura";
      if ((ap.estatus === "en_proceso" || !ap.estatus) && f <= fa + (maxVenc + 1) * 864e5) return "apertura";
    } else if (ap.estatus === "en_proceso" || !ap.estatus) return "apertura";
  }
  return "resurtido";
}

/**
 * Serie diaria de unidades por SKU como la arma la app (u[k] = unidades de hace k días, en días locales de CDMX), con
 * las mismas reglas de ítems (consumo.items), mapeo de SKU, SKU canónico del catálogo y filtro de tipos (consumo.tipos),
 * SALVO que los pedidos de apertura nunca cuentan (entran aparte como kits). Devuelve también `hist` (la historia que
 * recibe el motor: min(hist pedida, historia real desde el primer pedido de la base)) y la `vida` de cada SKU.
 */
export function serieDiaria(a: {
  cfg: any; hoy: string; hist: number; primerPedido: string | null; pedidos: PedidoPlan[];
  catalogo: { sku: string; created_at?: string | null }[]; mapa: { shopify_nombre: string; sku: string }[];
  pedidosApertura: any[]; aperturas: { id: any; estatus: string | null; fecha: string | null }[];
}): { u: Record<string, number[]>; hist: number; vida: Record<string, number | null>; sinMapa: number } {
  const cfg = a.cfg, hist = a.hist, hoyT = medianocheCdmx(a.hoy);
  // Objetos simples (no Map) a propósito: mismo comportamiento que la app, incluso ante claves raras.
  const skuMap: Record<string, string> = {}; a.mapa.forEach((m) => { skuMap[m.shopify_nombre] = m.sku; });
  const apById: Record<string, any> = {};
  a.aperturas.forEach((x) => { apById[x.id] = { ...x, estatus: PLAN_AP_FUERA[x.estatus as string] ? x.estatus : "en_proceso" }; });
  const pedEnAper: Record<string, boolean> = {}; a.pedidosApertura.forEach((id) => { pedEnAper[id] = true; });
  const ton = cfg.consumo.tipos;
  const catSku: Record<string, string> = {}; a.catalogo.forEach((c) => { catSku[String(c.sku).trim().toUpperCase()] = c.sku; });
  const u: Record<string, number[]> = {};
  let sinMapa = 0;
  a.pedidos.forEach((ped) => {
    if (ped.status && CANCELADOS.has(ped.status)) return;
    const ft = new Date(ped.fecha_pedido).getTime(); if (isNaN(ft)) return;
    let k = difDias(fechaLocal(ft), a.hoy);
    if (k < 0) k = 0;
    if (k >= hist) return;
    const tipo = planDatTipo(ped, apById, pedEnAper, cfg.aper.gracia_dias, cfg.aper.vencida_max);
    const cuenta = tipo !== "apertura" && !!ton[tipo];
    const orig = parseItems(ped.items);
    const its = cfg.consumo.items === "editados" && ped.items_editados ? parseItems(ped.items_editados) : orig;
    let idxNom: Record<string, string> | null = null;
    its.forEach((it: any) => {
      if (!it) return;
      let sku = it.sku || skuMap[it.nombre];
      // items_editados pierde el sku de sus líneas: se recupera de la línea original con el mismo nombre.
      if (!sku && it.nombre) {
        if (!idxNom) { idxNom = {}; orig.forEach((o: any) => { if (o && o.sku && o.nombre) idxNom![o.nombre] = o.sku; }); }
        sku = idxNom![it.nombre];
      }
      const qty = Number(it.cantidad == null ? 0 : it.cantidad);
      if (!isFinite(qty) || qty < 0) return;
      if (!sku) { if (it.nombre && cuenta && k < cfg.consumo.ventana) sinMapa++; return; }
      const real = catSku[String(sku).trim().toUpperCase()];
      if (!real || !cuenta) return;
      const arr = u[real] || (u[real] = new Array(hist).fill(0));
      arr[k] += qty;
    });
  });
  const vida: Record<string, number | null> = {};
  a.catalogo.forEach((c) => {
    let v: number | null = null;
    if (c.created_at) { const fc = new Date(c.created_at).getTime(); if (!isNaN(fc)) v = Math.max(0, Math.round((hoyT - fc) / 864e5)); }
    vida[c.sku] = v;
  });
  // Historia real: días desde el primer pedido de la base (la app nunca le da al motor más historia que la que existe).
  let histReal = hist;
  if (a.primerPedido) { const fp = new Date(a.primerPedido).getTime(); if (!isNaN(fp)) histReal = Math.max(1, difDias(fechaLocal(fp), a.hoy) + 1); }
  return { u, hist: Math.max(1, Math.min(hist, histReal)), vida, sinMapa };
}
