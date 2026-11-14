// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL de la agrupación por proveedor del Plan de abasto del sitio viejo (app/index.html a9e4a22): el mínimo de
// Zoho de cada grupo (_minVendorDeGrupo 27586 y el bloque de _planBuild 33413–33416), _planConsolidar (32957) y
// _planAgruparProv (33529) sin el historial de 60 días (`hist`: solo lo pinta el panel de proveedores de "Todo lo demás",
// que no se porta). Lo usan el "Qué pedir" de Café (plan 3e) y el plan local completo del Plan de abastos y Esta semana
// (planLocal, plan 3f). planCafe_parity_test.ts y planProv_parity_test.ts comparan contra la app.
import type { DatosPlan } from "./planDatos.ts";
import { type Plan, planBuild } from "./planBuild.ts";

/** Fila de com_zoho_proveedor que lee el plan (R.zprov). */
export type ZohoProveedor = NonNullable<DatosPlan["zprov"]>[number];

// Proveedor de Zoho de un grupo del Plan: el vendor_id que más se repite entre sus artículos (los que existen en zprov);
// sin ninguno, el de mismo nombre normalizado. Devuelve la fila de zprov o null.
export function minVendorDeGrupo(ids: any[], nombre: any, zprov: ZohoProveedor[] | null | undefined): ZohoProveedor | null {
  var lista = zprov || [], por: Record<string, ZohoProveedor> = {}, cnt: Record<string, number> = {}, orden: string[] = [], mejor: string | null = null, i;
  for (i = 0; i < lista.length; i++) por[String(lista[i].vendor_id)] = lista[i];
  (ids || []).forEach(function (v) {
    if (v == null || v === "") return;
    var k = String(v); if (!por[k]) return;
    if (!cnt[k]) { cnt[k] = 0; orden.push(k); }
    cnt[k]++;
  });
  orden.forEach(function (k) { if (mejor === null || cnt[k] > cnt[mejor]) mejor = k; });
  if (mejor !== null) return por[mejor];
  var n = String(nombre || "").trim().toLowerCase();
  if (!n || n === "__sin__") return null;
  for (i = 0; i < lista.length; i++) if (String(lista[i].nombre || "").trim().toLowerCase() === n) return lista[i];
  return null;
}

export function planConsolidar(rows: any[], prov: { minimo: any; modo: string }): { montoEsta: number; alcanza: boolean | null; adelantados: string[]; faltante: number } {
  var act = rows.filter(function (r) { return !r.importacion; });
  var cent = function (x: number) { return Math.round(x * 100) / 100; };
  var monto = function () { return cent(act.reduce(function (s, r) { return s + (r.costo > 0 ? r.pedirEsta * r.costo : 0); }, 0)); };
  var m = monto(), adelantados: string[] = [], minimo = Number(prov.minimo) || 0;
  if (prov.modo === "consolidar" && minimo > 0 && m > 0 && m < minimo) {
    var cand = act.filter(function (r) { return r.pedirEsta === 0 && r.pedirProx > 0 && r.costo > 0; }).sort(function (a, b) {
      var da = a.diasAlcanza === null ? Infinity : a.diasAlcanza, db = b.diasAlcanza === null ? Infinity : b.diasAlcanza;
      if (da !== db) return da - db;
      return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
    });
    var total = cent(cand.reduce(function (s, r) { return s + r.pedirProx * r.costo; }, 0));
    if (cent(m + total) >= minimo) {
      for (var i = 0; i < cand.length && m < minimo; i++) {
        cand[i].pedirEsta = cand[i].pedirProx; cand[i].pedirProx = 0; cand[i].adelantado = true;
        adelantados.push(cand[i].sku);
        m = monto();
      }
    }
  }
  return { montoEsta: m, alcanza: minimo > 0 ? m >= minimo : null, adelantados: adelantados, faltante: minimo > 0 ? Math.max(0, cent(minimo - m)) : 0 };
}

/** Grupo de un proveedor en el Plan (el `x` de _planAgruparProv, sin `hist`). */
export interface GrupoProv {
  key: string; nombre: string; real: boolean; rows: any[]; nEsta: number; pzasEsta: number; montoEsta: number; sinCostoEsta: number;
  nProx: number; pzasProx: number; montoProx: number; sinCostoProx: number; adelantados: number; alcanza: boolean | null; minimoManual: number;
}

function planCafeFueraLocal(c: any, r: any): boolean { return !!(r && r.esCafe && c && !c.soloCafe && c.cfg && c.cfg.compra && c.cfg.compra.excluir_cafe === false); }

/**
 * c.minManual/c.vendorDe de _planBuild y c.provs = _planAgruparProv(c). Puede adelantar pedidos de la próxima semana
 * (consolidación por mínimo): modifica las filas de `c`, como el viejo.
 */
export function planProvs(c: Plan, R: DatosPlan): { provs: GrupoProv[]; minManual: Record<string, number>; vendorDe: Record<string, string> } {
  var catBy: Record<string, any> = {}; R.cat.forEach(function (x) { catBy[x.sku] = x; });
  // Mínimo por proveedor de Zoho: cada grupo del Plan (por nombre) toma el vendor_id mayoritario de sus artículos; sin él, el de mismo nombre.
  var minManual: Record<string, number> = {}, vendorDe: Record<string, string> = {}, idsPor: Record<string, any[]> = {}, nomPor: Record<string, string> = {};
  c.rows.forEach(function (r) { var cc = catBy[r.sku]; (idsPor[r.provKey] || (idsPor[r.provKey] = [])).push(cc ? cc.zoho_vendor_id : null); nomPor[r.provKey] = r.provNombre; });
  Object.keys(idsPor).forEach(function (k) { var z = minVendorDeGrupo(idsPor[k], nomPor[k], R.zprov || []); if (z) { vendorDe[k] = String(z.vendor_id); minManual[k] = Number(z.minimo_compra || 0); } });
  var g: Record<string, any> = {};
  c.rows.forEach(function (r) {
    if (r.sinMov || r.importacion) return; // sin demanda e importación (va en su propio apartado): fuera del plan
    if (planCafeFueraLocal(c, r)) return;
    var x = g[r.provKey] || (g[r.provKey] = { key: r.provKey, nombre: r.provNombre, real: r.provKey !== "__sin__", rows: [],
      nEsta: 0, pzasEsta: 0, montoEsta: 0, sinCostoEsta: 0, nProx: 0, pzasProx: 0, montoProx: 0, sinCostoProx: 0, adelantados: 0, alcanza: null });
    x.rows.push(r);
  });
  var provs = Object.keys(g).map(function (k) {
    var x = g[k];
    x.minimoManual = minManual[k] || 0;
    // Consolidación (solo artículos nacionales): con el modo "consolidar" y un mínimo capturado, se adelantan necesidades de la próxima semana.
    // Con la simulación del servidor (fuenteCant 'servidor') el ajuste por mínimo ya viene hecho en sus cantidades: aquí no se repite.
    if (c.fuenteCant !== "servidor" && c.cfg.compra.min_prov === "consolidar" && x.minimoManual > 0) {
      // Los artículos bloqueados por una OC abierta no se adelantan (la regla de Configuración dice esperar): para la consolidación
      // su pedirProx cuenta como 0; los demás se mueven con normalidad.
      var ad = x.rows.map(function (r: any) { return { sku: r.sku, costo: r.costo, diasAlcanza: r.calc.diasAlcanza, pedirEsta: r.calc.pedirEsta, pedirProx: r.calc.bloqueado ? 0 : r.calc.pedirProx, importacion: false, _r: r } as any; });
      var rs = planConsolidar(ad, { minimo: x.minimoManual, modo: "consolidar" });
      ad.forEach(function (a: any) {
        if (a.adelantado) {
          a._r.calc.pedirEsta = a.pedirEsta; a._r.calc.pedirProx = a.pedirProx; a._r.adelantado = true; a._r.calc.accion = "PEDIR";
          a._r.montoEsta = a._r.costo > 0 ? a.pedirEsta * a._r.costo : null; a._r.montoProx = a._r.costo > 0 ? 0 : null;
          // el calendario semanal refleja lo adelantado (lo pedido en la semana siguiente pasó a esta semana)
          a._r.sem[0] = a.pedirEsta; a._r.sem[1] = 0; a._r.calc.kPrimera = 0; a._r.fechaLimite = c.hoyIso;
        }
      });
      x.adelantados = rs.adelantados.length; x.alcanza = rs.alcanza;
    }
    x.rows.forEach(function (r: any) {
      if (r.calc.pedirEsta > 0) { x.nEsta++; x.pzasEsta += r.calc.pedirEsta; if (r.montoEsta !== null) x.montoEsta += r.montoEsta; else x.sinCostoEsta++; }
      if (r.calc.pedirProx > 0) { x.nProx++; x.pzasProx += r.calc.pedirProx; if (r.montoProx !== null) x.montoProx += r.montoProx; else x.sinCostoProx++; }
    });
    return x as GrupoProv;
  }).sort(function (a, b) { return b.montoEsta - a.montoEsta || b.nEsta - a.nEsta || a.nombre.localeCompare(b.nombre); });
  return { provs: provs, minManual: minManual, vendorDe: vendorDe };
}

/** Plan con sus proveedores (c.provs, c.minManual y c.vendorDe de _planBuild). */
export type PlanProv = Plan & { provs: GrupoProv[]; minManual: Record<string, number>; vendorDe: Record<string, string> };

/**
 * _planBuild(R, cfg) completo para el plan local (plan 3f): el armado del 3d, con la simulación del servidor si está
 * vigente (planAplicarServidor), más la agrupación por proveedor con sus mínimos, que puede adelantar pedidos.
 */
export function planLocal(R: DatosPlan, cfg: any): PlanProv {
  var c = planBuild(R, cfg) as PlanProv;
  var pv = planProvs(c, R);
  c.provs = pv.provs; c.minManual = pv.minManual; c.vendorDe = pv.vendorDe;
  return c;
}
