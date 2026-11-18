// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL de "Sugerir piezas por apertura" del sitio viejo (app/index.html a9e4a22, _planPzasApCalc 35334): para cada
// artículo, cuántas piezas pidió en promedio cada apertura reciente en su(s) pedido(s) de kit. planPiezas_parity_test.ts
// compara contra la app.
import { parseItems, planDatTipo, planEngMediana, type PedidoPlan } from "./planEngine.ts";

export interface FilaPiezas { sku: string; nombre: string; actual: number; n: number; N: number; mediana: number; prom: number; sug: number; min: number; max: number }
export interface ResultadoPiezas { filas: FilaPiezas[]; N: number; sinAtribuir: number; totalAperturas: number }

export function planPzasApCalc(
  pedidos: PedidoPlan[],
  R: { aperturas: { id: any; fecha: string | null; estatus: string | null }[]; pedAper: { pedido_id: any }[]; map: { shopify_nombre: string; sku: string }[]; cat: any[] },
  cfg: any,
  muestraN: number,
): ResultadoPiezas {
  var apById: Record<string, any> = {}; R.aperturas.forEach(function (a) { apById[a.id] = a; });
  var pedEnAper: Record<string, boolean> = {}; R.pedAper.forEach(function (p) { pedEnAper[p.pedido_id] = true; });
  var skuMap: Record<string, string> = {}; R.map.forEach(function (m) { skuMap[m.shopify_nombre] = m.sku; });
  var catSku: Record<string, string> = {}, catBy: Record<string, any> = {}; R.cat.forEach(function (c) { catSku[String(c.sku).trim().toUpperCase()] = c.sku; catBy[c.sku] = c; });
  var porAp: Record<string, any> = {}, sinAtribuir = 0;
  pedidos.forEach(function (ped) {
    if (planDatTipo(ped, apById, pedEnAper, cfg.aper.gracia_dias, cfg.aper.vencida_max) !== "apertura") return;
    var id = ped.apertura_id;
    if (!id || id === "000") { sinAtribuir++; return; } // pedido de kit sin sucursal vinculada: no se sabe de qué apertura es
    var f = String(ped.fecha_pedido || "").slice(0, 10);
    var ap = porAp[id] || (porAp[id] = { id: id, fecha: null, primera: f, uds: {} });
    if (f && (!ap.primera || f < ap.primera)) ap.primera = f;
    var orig = parseItems(ped.items);
    var its = cfg.consumo.items === "editados" && ped.items_editados ? parseItems(ped.items_editados) : orig, idxNom: Record<string, string> | null = null;
    its.forEach(function (it: any) {
      if (!it) return;
      var sku = it.sku || skuMap[it.nombre];
      if (!sku && it.nombre) {
        if (!idxNom) { idxNom = {}; orig.forEach(function (o: any) { if (o && o.sku && o.nombre) idxNom![o.nombre] = o.sku; }); }
        sku = idxNom![it.nombre];
      }
      var qty = Number(it.cantidad == null ? 0 : it.cantidad);
      if (!sku || !isFinite(qty) || qty <= 0) return;
      var real = catSku[String(sku).trim().toUpperCase()];
      if (!real) return;
      ap.uds[real] = (ap.uds[real] || 0) + qty;
    });
  });
  // Muestra: las N aperturas más recientes (por su fecha de apertura; si no tiene, por su primer pedido de kit)
  var lista = Object.keys(porAp).map(function (id) { var a = porAp[id], x = apById[id]; a.fecha = x && x.fecha ? String(x.fecha).slice(0, 10) : a.primera; return a; }).filter(function (a) { return Object.keys(a.uds).length > 0; });
  lista.sort(function (x, y) { return String(y.fecha || "").localeCompare(String(x.fecha || "")) || String(x.id).localeCompare(String(y.id)); });
  var muestra = lista.slice(0, Math.max(1, muestraN || 20)), N = muestra.length, porSku: Record<string, number[]> = {};
  muestra.forEach(function (a) { Object.keys(a.uds).forEach(function (s) { (porSku[s] || (porSku[s] = [])).push(a.uds[s]); }); });
  var filas = Object.keys(porSku).map(function (s) {
    var v = porSku[s], n = v.length, sum = v.reduce(function (t, x) { return t + x; }, 0), med = planEngMediana(v);
    // Esperado por apertura = promedio sobre TODAS las aperturas de la muestra (las que no lo piden cuentan como 0), con tope de
    // 3 veces la mediana de las que sí lo piden para que una apertura atípica no infle el kit.
    var prom = N > 0 ? sum / N : 0, sug = Math.min(prom, 3 * med), c = catBy[s];
    return { sku: s, nombre: c ? c.nombre : s, actual: c ? Number(c.cantidad_por_apertura || 0) : 0, n: n, N: N, mediana: med, prom: prom, sug: Math.round(sug * 100) / 100,
      min: Math.min.apply(null, v), max: Math.max.apply(null, v) };
  });
  var prio = function (f: FilaPiezas) { return (f.n >= 3 ? 0 : 1000) + (f.actual === 0 ? 0 : 500) - f.n; };
  filas.sort(function (a, b) { return prio(a) - prio(b) || a.nombre.localeCompare(b.nombre); });
  return { filas: filas, N: N, sinAtribuir: sinAtribuir, totalAperturas: lista.length };
}

/** Se marcan las que tienen al menos 3 aperturas y cambian más de 15% frente a lo capturado (o no hay nada capturado). */
export function preseleccionar(f: FilaPiezas): boolean {
  return f.n >= 3 && (f.actual === 0 || Math.abs(f.sug - f.actual) / Math.max(f.actual, 1e-9) > 0.15);
}
