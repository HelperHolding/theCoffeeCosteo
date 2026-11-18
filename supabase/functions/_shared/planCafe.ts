// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL del adaptador de Café del sitio viejo (app/index.html a9e4a22): _cafeRed (39249), _cafeArmar (39269),
// _cafeCorrer (39282), y el "Qué pedir" de café (_cafeOrdenes 39298 = el MISMO plan de abasto del motor 3d filtrado a
// café tostado, con su agrupación por proveedor), _planResumen (33696), _planCantOC (34008) y _cafeKgDe (39309).
// planCafe_parity_test.ts compara contra la app.
import { diaLocal, type DatosPlan } from "./planDatos.ts";
import { type Plan, planBuild } from "./planBuild.ts";
import { type GrupoProv, planProvs } from "./planProv.ts";
import { CAFE_ESCS, CAFE_HOJA, CAFE_PROD, cafeCfgNorm } from "./impCafeCfg.ts";
import { cafeEngine as cafeEngineJs } from "./cafeEngine.ts";

const cafeEngine = cafeEngineJs as (P: any) => any;

/** La configuración del motor con la sección cafe normalizada como _cafeCfgNorm. */
export function cfgConCafe(cfg: any): any { return Object.assign({}, cfg, { cafe: cafeCfgNorm(cfg && cfg.cafe) }); }

// Sucursales al arranque del año y aperturas de oct-dic del año anterior, con lo que hay en la plataforma:
// operando (o por abrir con fecha anterior al 1 de enero) y aperturas por mes de apertura (abiertas o en pipeline).
export function cafeRed(R: DatosPlan, cfg: any): any {
  var anio = cfg.cafe.anio, ini = anio + "-01-01", out: any = { ini: 0, q4: [0, 0, 0], activas: 0, pipeAnio: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], pipeDespues: 0, sinFecha: 0 };
  R.aperturas.forEach(function (a) {
    var act = a.estatus === "activa", pen = a.estatus === "en_proceso";
    if (!act && !pen) return;
    var aj = pen ? ((cfg.aper.ajustes || {})[a.id] || {}) : {};
    if (aj.incluir === false) return;
    var fch = aj.fecha || (a.fecha ? String(a.fecha).slice(0, 10) : null), f = fch ? diaLocal(fch) : null;
    if (act) out.activas++;
    if (!f) { if (act) out.ini++; else out.sinFecha++; return; }
    if (f < ini) out.ini++;
    var y = +f.slice(0, 4), m = +f.slice(5, 7) - 1;
    if (y === anio - 1 && m >= 9) out.q4[m - 9]++;
    if (pen && y === anio) out.pipeAnio[m]++;
    if (pen && y > anio) out.pipeDespues++;
  });
  out.a0 = Math.round((out.q4[0] + out.q4[1] + out.q4[2]) / 3);
  return out;
}
export function cafeArmar(R: DatosPlan, cfg: any): { P: any; red: any } {
  var cc = cfg.cafe, red = cafeRed(R, cfg), auto = cc.q4_modo === "auto";
  var P: any = { anio: cc.anio, escenarioActivo: cc.escenario, escenarios: [], cierresPorMes: cc.cierres.slice(), ajusteGeneral: cc.ajuste, pctComprometer: cc.comprometer, curva2a6: cc.curva.slice(), estacionalidad: cc.estacionalidad.slice(), compra2026Kg: cc.compra_ant, productos: [] };
  ["Pesimista", "Base", "Optimista"].forEach(function (k) {
    var e = cc.escenarios[k];
    P.escenarios.push({ nombre: k, crecimientoAnual: e.crec, compraMadura: e.madura, compraMesApertura: e.apertura, sucursalesInicio: auto ? red.ini : e.ini, aperturasOctDic2026: auto ? red.a0 : e.a0, aperturasPorMes: e.aper.slice() });
  });
  CAFE_PROD.forEach(function (p) {
    var a = cc.prod[p.id];
    P.productos.push({ id: p.id, nombre: p.nombre, colorGrupo: p.color, presentacion: p.pres, mezclaPct: a.mezcla, kgPorBolsa: p.kg, vigente: { precioKg: a.precio, empaque: a.empaque, precioVentaBolsa: a.venta }, nuevo: { precioKg: a.nuevo_precio, empaque: a.nuevo_empaque }, notaVigente: a.empaque > 0 ? CAFE_HOJA.nota_empaque : null });
  });
  return { P: P, red: red };
}

/** Resultado de una corrida de Café (el `out` de _cafeCorrer). `R` es la salida del motor de la Sheet. */
export interface CorridaCafe { R: any | null; err: string | null; ent: { P: any; red: any }; cfg: any; esc: string }

/** _cafeCorrer sin la caché del navegador. Un escenario de vista que no existe usa el guardado (el viejo lo dejaba fallar). */
export function cafeCorrer(R: DatosPlan, cfgMotor: any, escVista?: string | null): CorridaCafe {
  var cfg = cfgConCafe(cfgMotor);
  var e = CAFE_ESCS.indexOf(escVista as string) >= 0 ? (escVista as string) : cfg.cafe.escenario;
  var ent = cafeArmar(R, cfg), res: any = null, err: string | null = null;
  ent.P.escenarioActivo = e;
  try { res = cafeEngine(ent.P); } catch (x) { err = x && (x as Error).message ? (x as Error).message : String(x); }
  return { R: res, err: err, ent: ent, cfg: cfg, esc: e };
}

/** Plan de café: el plan de abasto solo con café tostado, con sus proveedores (c.provs del viejo). */
export type PlanCafe = Plan & { provs: GrupoProv[]; minManual: Record<string, number>; vendorDe: Record<string, string> };

/** _cafeOrdenes: el MISMO cálculo del plan de abasto local (consumo, inventario, OCs, lead time, seguridad), solo con café tostado. */
export function cafeOrdenes(R: DatosPlan, cfg: any): PlanCafe {
  var c = planBuild(R, cfg, { cafe: true }) as PlanCafe;
  var pv = planProvs(c, R);
  c.provs = pv.provs; c.minManual = pv.minManual; c.vendorDe = pv.vendorDe;
  return c;
}

export function planResumen(c: { rows: any[] }): any {
  var act = c.rows.filter(function (r) { return !r.importacion && !r.sinMov; });
  var esta = act.filter(function (r) { return r.calc.pedirEsta > 0; });
  var prox = act.filter(function (r) { return r.calc.pedirProx > 0; });
  var sum = function (a: any[], f: string) { return a.reduce(function (s, r) { return s + (r[f] || 0); }, 0); };
  return { act: act, esta: esta, prox: prox, montoEsta: sum(esta, "montoEsta"), montoProx: sum(prox, "montoProx"),
    sinCostoE: esta.filter(function (r) { return r.montoEsta === null; }).length,
    sinCostoP: prox.filter(function (r) { return r.montoProx === null; }).length,
    urg: act.filter(function (r) { return r.calc.urgencia === "Urgente"; }).length,
    imp: c.rows.filter(function (r) { return r.importacion && !r.sinMov; }).length,
    nSinMov: c.rows.filter(function (r) { return r.sinMov; }).length,
    picos: act.filter(function (r) { return r.calc.pico_reciente; }).length };
}
/** Cantidad que va a la OC: la del servidor (pedirHoy) o la de esta semana del cálculo local. */
export function planCantOC(r: any): number { var k = r.calc || {}; return k.fuente === "servidor" ? (Number(k.pedirHoy) || 0) : (Number(k.pedirEsta) || 0); }

// Kilos por unidad según el nombre ("1.5 KG", "250 GRAMOS", "1 KILOGRAMO"); null si no se puede saber.
export function cafeKgDe(nombre: any): number | null {
  var t = String(nombre || ""), m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?|kilogramos?)\b/i);
  if (m) return parseFloat(m[1].replace(",", "."));
  m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramos?)\b/i);
  return m ? parseFloat(m[1].replace(",", ".")) / 1000 : null;
}
