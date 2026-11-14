// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL del adaptador de Importaciones del sitio viejo (app/index.html a9e4a22, líneas 37584–37804): de los datos
// del plan (R de _planDatCargar, el mismo de planDatos.ts) a la entrada del motor de la Sheet (_impArmar) y la corrida
// (_impCorrer, con el ajuste del mes en curso). Mismos nombres sin el guion bajo. "Hoy" es 'YYYY-MM-DD' de CDMX; las
// fechas se cuentan por días como el navegador del equipo. API estable para el plan 3f (Plan de abastos y Esta semana):
// impCorrer, impAhoraDatos e impRed. planImp_parity_test.ts compara contra la app.
import { planEngDia, planEngDifDias } from "./planEngine.ts";
import { borradoresPlan, comSaldoCedis, type DatosPlan, diaLocal, planDatAMotor, planOcDeZoho, planOcFuente, zocKey } from "./planDatos.ts";
import { IMP_ESCS, impCfgNorm } from "./impCafeCfg.ts";
import { impEngine as impEngineJs } from "./impEngine.ts";

const impEngine = impEngineJs as (P: any, items: any[]) => any;

/** La configuración del motor (normalizarCfgMotor) con la sección imp normalizada como _impCfgNorm (el viejo siempre la normalizaba). */
export function cfgConImp(cfg: any): any { return Object.assign({}, cfg, { imp: impCfgNorm(cfg && cfg.imp) }); }

export function impSkuKey(s: any): string { return String(s || "").trim().toUpperCase(); }
export function impDiaNum(iso: string): number { var p = String(iso).split("-"); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5); }
export function impNumDia(n: number): string { var d = new Date(n * 864e5); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"); }
/** Días de la fecha a a la fecha b (b − a), null si alguna no es fecha (_impDif). */
export function impDif(a: any, b: any): number | null {
  var x = Date.parse(String(a || "").slice(0, 10) + "T00:00:00Z"), y = Date.parse(String(b || "").slice(0, 10) + "T00:00:00Z");
  return isFinite(x) && isFinite(y) ? Math.round((y - x) / 864e5) : null;
}

// Fracción del mes en curso que ya pasó (el modelo cuenta el mes completo; con esto se regresa el inventario a como estaba el día 1).
export function impFraccionMes(hoy: string): number {
  var y = +hoy.slice(0, 4), m = +hoy.slice(5, 7), d = +hoy.slice(8, 10);
  var dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return (d - 1) / dim;
}
// Sucursales activas promedio en los últimos W días (una apertura cuenta desde su fecha de apertura; sin fecha, siempre).
export function impSucPromedio(R: DatosPlan, W: number): number {
  var hoy = impDiaNum(R.hoy), fechas = R.aperturas.filter(function (a) { return a.estatus === "activa"; }).map(function (a) { var f = a.fecha ? diaLocal(String(a.fecha).slice(0, 10)) : null; return f ? impDiaNum(f) : null; });
  var tot = 0, k, i;
  for (k = 0; k < W; k++) {
    var d = hoy - k, n = 0;
    for (i = 0; i < fechas.length; i++) if (fechas[i] === null || (fechas[i] as number) <= d) n++;
    tot += n;
  }
  return W > 0 ? tot / W : 0;
}
// Índice de temporada promedio de los últimos W días (para quitarle la estacionalidad a lo que se vendió).
export function impIdxProm(arr: any, hoy: string, W: number): number {
  var t = 0, k;
  for (k = 0; k < W; k++) { var mes = +planEngDia(hoy, -k).slice(5, 7) - 1; t += Number(arr && arr[mes] || 1); }
  return W > 0 ? t / W : 1;
}
// Unidades vendidas por artículo en la ventana (con los mismos criterios de venta del Plan: qué tipos de pedido cuentan, pedidos editados...).
export function impVentasPlat(R: DatosPlan, cfg: any): { W: number; por: Record<string, number>; suc: number; histReal: number } {
  var conv = planDatAMotor(R, cfg);
  var W = Math.max(1, Math.min(cfg.imp.venta_ventana, conv.raw.hist)), por: Record<string, number> = {};
  conv.raw.skus.forEach(function (s: any) { var t = 0, k; for (k = 0; k < W && k < s.u.length; k++) t += s.u[k]; if (t > 0) por[s.sku] = t; });
  return { W: W, por: por, suc: impSucPromedio(R, W), histReal: conv.raw.hist };
}
// Líneas de OC abiertas por artículo (misma regla de "vieja" y de OC vencidas que el Plan). Borradores: decisión 6 del plan 3d.
export function impOcLineas(R: DatosPlan, cfg: any): Record<string, any[]> {
  var hoy = R.hoy, lt: Record<string, number> = {}, out: Record<string, any[]> = {};
  R.lt.forEach(function (l) { lt[l.sku] = Number(l.dias || 0); });
  var zsrc = planOcDeZoho(cfg), dset = borradoresPlan(R, cfg);
  planOcFuente(R, cfg).forEach(function (r) {
    var pend = Math.max(0, Number(r.cantidad || 0) - Number(r.cantidad_recibida || 0)); if (pend <= 0) return;
    var esB = !!(dset && dset[zocKey(r.folio) + "|" + String(r.sku).trim().toUpperCase()]);
    if (esB) return; // borrador de Zoho (sin enviar al proveedor): no es una compra, nunca cuenta como en camino
    var fecha = r.fecha ? String(r.fecha).slice(0, 10) : null, arribo = r.fecha_arribo ? String(r.fecha_arribo).slice(0, 10) : null, vieja = false, edad: number | null = null;
    if (fecha) { var fo = diaLocal(fecha); edad = fo ? planEngDifDias(hoy, fo) : null; }
    if (arribo) { var fa = diaLocal(arribo), du = fa ? planEngDifDias(fa, hoy) : null; vieja = du !== null && du < -14; }
    else if (edad !== null) vieja = edad > Math.max(30, (lt[r.sku] > 0 ? lt[r.sku] : cfg.compra.lt_default) + 14);
    if (zsrc) vieja = false;
    if (vieja && cfg.compra.oc_vencida > 0 && edad !== null && edad > cfg.compra.oc_vencida) return;
    var k = impSkuKey(r.sku);
    (out[k] = out[k] || []).push({ pend: pend, fecha: fecha, arribo: arribo, vieja: vieja, folio: r.folio || "", borrador: esB });
  });
  return out;
}
// Datos del catálogo por SKU (inventario, costo, estatus, origen, lead time de Zoho...).
export function impCatalogo(R: DatosPlan, _cfg?: any): Record<string, any> {
  var lt: Record<string, number> = {}, out: Record<string, any> = {};
  R.lt.forEach(function (l) { lt[l.sku] = Number(l.dias || 0); });
  var comp: Record<string, number> = {}; R.comp.forEach(function (m) { comp[m.sku] = (comp[m.sku] || 0) + Number(m.cantidad || 0); });
  R.cat.forEach(function (c) {
    out[impSkuKey(c.sku)] = { sku: c.sku, nombre: c.nombre || c.sku, estatus: c.estatus || "", origen: String(c.origen || "").toUpperCase(), lt: lt[c.sku] > 0 ? lt[c.sku] : null,
      costo: Number(c.costo_unitario || 0), fisico: comSaldoCedis(c), yulius: Number(c.saldo_yulius || 0), comprometido: comp[c.sku] || 0,
      kit: Number(c.cantidad_por_apertura || 0), minPzas: Number(c.minimo_compra_pzas || 0), multiplo: Number(c.multiplo_compra || 1), proveedor: c.proveedor_preferido || "" };
  });
  return out;
}
// Pipeline de aperturas por Mes # (1 = mes en curso): MISMA lista que Inicio (todo lo que no está operando, cancelado ni es corporativo),
// con los ajustes que ya haces en el Plan (forzar incluir, fecha propia). Las vencidas que siguen en proceso cuentan en el mes en curso
// mientras no pasen del plazo de "vencida máxima" del Plan.
export function impPipelineMes(R: DatosPlan, cfg: any, n: number): any {
  var hoy = R.hoy, iy = +hoy.slice(0, 4), im = +hoy.slice(5, 7) - 1, out: any = { real: [], vencidas: 0, vencidasFuera: 0, sinFecha: 0, despues: 0, total: 0 }, i;
  for (i = 0; i < n; i++) out.real.push(0);
  R.aperturas.forEach(function (a) {
    if (a.estatus !== "en_proceso") return;
    var aj = (cfg.aper.ajustes || {})[a.id] || {};
    if (aj.incluir === false) return;
    out.total++;
    var fch = aj.fecha || (a.fecha ? String(a.fecha).slice(0, 10) : null);
    if (!fch) { out.sinFecha++; return; }
    var f = diaLocal(fch);
    if (!f) { out.sinFecha++; return; }
    var k = (+f.slice(0, 4) - iy) * 12 + (+f.slice(5, 7) - 1) - im;
    if (k < 0) {
      var dias = planEngDifDias(hoy, f);
      if (dias <= cfg.aper.vencida_max) { k = 0; out.vencidas++; } else { out.vencidasFuera++; return; }
    }
    if (k >= n) { out.despues++; return; }
    out.real[k]++;
  });
  return out;
}
/** 'AAAA-MM' del mes m a partir del mes de hoy (m = 0 es el mes en curso). */
export function impMesClave(hoy: string, m: number): string {
  var t = +hoy.slice(0, 4) * 12 + (+hoy.slice(5, 7) - 1) + m;
  return Math.floor(t / 12) + "-" + String(t % 12 + 1).padStart(2, "0");
}
// Red de sucursales para el escenario: el pipeline manda los primeros meses; después, el plan de Dirección (si el pipeline ya trae más, manda el pipeline).
export function impRed(R: DatosPlan, cfg: any, esc: string): any {
  var ci = cfg.imp, E = ci.escenarios[esc], pl = impPipelineMes(R, cfg, 15), filas: any[] = [], m;
  var sucHoy = ci.red.suc_hoy_modo === "manual" ? ci.red.suc_hoy : R.aperturas.filter(function (a) { return a.estatus === "activa"; }).length;
  for (m = 0; m < 15; m++) {
    var key = impMesClave(R.hoy, m);
    var plan = ci.red.plan[key] !== undefined ? ci.red.plan[key] : ci.red.plan_def, cierres = ci.red.cierres[key] || 0;
    var pr = pl.real[m] * Math.min(1, E.cumpl), pn = plan * E.cumpl, ruta = m < ci.red.meses_pipeline, cons, fuente;
    if (ruta) { cons = Math.round(pr); fuente = "pipeline"; }
    else if (pr >= pn) { cons = Math.round(pr); fuente = "pipeline"; }
    else { cons = Math.round(pn); fuente = "plan"; }
    if (cfg.aper && cfg.aper.incluir === false) { cons = 0; fuente = "sin aperturas"; } // decisión: no contemplar aperturas en las compras
    filas.push({ m: m, key: key, pipeline: pl.real[m], plan: plan, cierres: cierres, considerada: cons, fuente: fuente });
  }
  return { sucHoy: sucHoy, filas: filas, pl: pl, esc: esc, cumpl: E.cumpl };
}

// Arma la entrada del motor (P, items) y deja por artículo los datos que se muestran en pantalla.
export function impArmar(R: DatosPlan, cfg: any, esc: string): { P: any; items: any[]; meta: any } {
  var ci = cfg.imp, hoy = R.hoy, hoyIso = R.hoy;
  var meta: any = { items: {}, avisos: [], esc: esc };
  var cat = impCatalogo(R, cfg), ocs = impOcLineas(R, cfg), vp = impVentasPlat(R, cfg), red = impRed(R, cfg, esc);
  meta.vp = vp; meta.cat = cat; meta.red = red;
  var provMap: Record<string, any> = {}; ci.prov.forEach(function (p: any) { provMap[p.clave.toLowerCase()] = p; });
  var provCont = ci.prov.find(function (p: any) { return p.contenedor; }) || ci.prov[0];
  var temporada: Record<string, number[]> = {}; Object.keys(ci.temporada).forEach(function (f) { temporada[f] = ci.temporada[f].slice(); });
  var items: any[] = [], nombres: Record<string, 1> = {};
  ci.orden.forEach(function (sku: string) {
    var it = ci.items[sku]; if (!it) return;
    var m: any = meta.items[sku] = { activo: it.activo !== false, aviso: [] };
    var pd = cat[impSkuKey(sku)] || null;
    m.cat = pd;
    var pv = provMap[String(it.prov || "").toLowerCase()];
    if (!pv) { m.aviso.push('El proveedor "' + it.prov + '" ya no existe: se usó ' + ci.prov[0].nombre); pv = ci.prov[0]; }
    var fam = it.familia;
    if (!temporada[fam]) { m.aviso.push('La familia "' + fam + '" no tiene estacionalidad: se usó 1.0 todo el año'); fam = "General"; }
    // Venta por sucursal al mes que dice la plataforma (sin estacionalidad), para compararla con la de la hoja
    var vPlat: number | null = null;
    if (pd && vp.por[pd.sku] > 0 && vp.suc > 0) vPlat = (vp.por[pd.sku] / vp.W * 30) / vp.suc / (impIdxProm(temporada[fam], hoy, vp.W) || 1);
    var kPlat = pd && pd.kit > 0 ? pd.kit : null;
    m.vHoja = it.venta; m.vPlat = vPlat; m.kHoja = it.kit; m.kPlat = kPlat;
    var venta = it.venta, fv = "hoja", kit = it.kit, fk = "hoja";
    if (ci.fuentes.venta === "plataforma") { if (vPlat !== null) { venta = vPlat; fv = "plataforma"; } else fv = "hoja (sin ventas en la plataforma)"; }
    if (ci.fuentes.kit === "plataforma") { if (kPlat !== null) { kit = kPlat; fk = "plataforma"; } else fk = "hoja (sin kit en la plataforma)"; }
    m.fuenteVenta = fv; m.fuenteKit = fk; m.venta = venta; m.kit = kit;
    var costo = pd && pd.costo > 0 ? pd.costo : it.costo; m.costo = costo; m.costoCat = pd ? pd.costo : null;
    var stock = 0;
    if (pd) stock = (cfg.inv.base === "disponible" ? pd.fisico - pd.comprometido : pd.fisico) + (cfg.inv.yulius ? pd.yulius : 0);
    else m.aviso.push("El SKU no está en el catálogo: se usó inventario 0");
    m.stockReal = stock;
    var leadTot = pv.lead + pv.cierres;
    var lines: any[] = (ocs[impSkuKey(sku)] || []).map(function (l) {
      var d = l.arribo, est = false;
      if (!d && l.fecha) { d = planEngDia(l.fecha, leadTot); est = true; }
      return { q: l.pend, d: d || hoyIso, est: est, vieja: l.vieja, folio: l.folio, borrador: l.borrador };
    });
    m.ocN = lines.length; m.ocQ = lines.reduce(function (s, l) { return s + l.q; }, 0); m.ocBorr = lines.reduce(function (s, l) { return s + (l.borrador ? l.q : 0); }, 0);
    m.ocEst = lines.some(function (l) { return l.est; }); m.ocVieja = lines.some(function (l) { return l.vieja; });
    if (it.camino_qty > 0 && it.camino_fecha) { lines.push({ q: it.camino_qty, d: it.camino_fecha, manual: true }); m.manualQ = it.camino_qty; }
    lines.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
    var yc = 0, yl: string | null = null, cl = 0, cll: string | null = null;
    if (lines.length) {
      var d1 = lines[0].d, sw = 0, sd = 0;
      lines.forEach(function (l) { if (l.d === d1) yc += l.q; else { cl += l.q; sw += l.q; sd += l.q * impDiaNum(l.d); } });
      yl = d1; if (cl > 0) cll = impNumDia(Math.round(sd / sw));
    }
    m.camino = yc + cl; m.llegaPrimera = yl;
    if (it.activo === false) { m.excluido = true; return; }
    var nom = it.nombre || (pd && pd.nombre) || sku;
    if (nombres[nom.toLowerCase()]) nom = nom + " (" + sku + ")";
    nombres[nom.toLowerCase()] = 1;
    items.push({ sku: sku, producto: nom, familia: fam, proveedor: pv.clave, unidad: it.unidad, stockHoy: stock, ventaSucursalMes: venta, kitApertura: kit, empaque: it.empaque, minimoProveedor: it.minimo,
      costoUnitario: costo, yaComprado: yc, llega: yl, compraLocal: cl, llegaLocal: cll, origen: "", largoCm: null, anchoCm: null, altoCm: null, cbmDato: it.cbm, fuenteCbm: it.cbm_fuente, aliasPlan: it.alias });
  });
  var cons: any = { proveedorContenedor: provCont.clave };
  if (ci.corregir_hoja) { cons.planDemandaCruzada = []; cons.ultimoContenedorSinChequeoHorizonte = false; cons.nContenedoresCalendario = 11; }
  else {
    var tiene = function (s: string) { return items.some(function (x) { return x.sku === s; }); };
    if (!(tiene("INS-DES-012") && tiene("INS-DES-005"))) cons.planDemandaCruzada = [];
  }
  var P: any = { fechaCorte: hoyIso, escenarioActivo: esc, escenarios: {},
    red: { sucursalesHoy: red.sucHoy, aperturasPlan: red.filas.map(function (f: any) { return f.plan; }), cierres: red.filas.map(function (f: any) { return f.cierres; }), aperturasConsideradasOverride: red.filas.map(function (f: any) { return f.considerada; }) },
    politica: { mesesCobertura: ci.politica.meses_cobertura, mesesRespaldo: ci.politica.meses_respaldo, diasMargen: ci.politica.dias_margen, diasJuntarPedido: ci.politica.dias_juntar },
    proveedores: ci.prov.map(function (p: any) { return { clave: p.clave, nombre: p.nombre, leadNormal: p.lead, leadCierres: p.cierres, fuente: p.nota }; }),
    contenedor: { tipo: ci.contenedor.tipo, opciones: [{ tipo: "40' HQ", cbm: ci.contenedor.cbm40 }, { tipo: "45' HQ", cbm: ci.contenedor.cbm45 }, { tipo: "Personalizado", cbm: ci.contenedor.cbmp }],
      llenadoReal: ci.contenedor.llenado, contenedoresPorEmbarque: ci.contenedor.por_embarque, diasRespaldoSiguiente: ci.contenedor.dias_respaldo },
    compraPuente: { diasColchon: ci.puente.dias_colchon, multiplo: ci.puente.multiplo },
    temporada: temporada, constantes: cons };
  IMP_ESCS.forEach(function (k) { var e = ci.escenarios[k]; P.escenarios[k] = { crecimientoAnual: e.crec, cumplimientoAperturas: e.cumpl, ajusteDemanda: e.ajuste }; });
  return { P: P, items: items, meta: meta };
}

/** Resultado de una corrida de Importaciones (el `out` de _impCorrer, sin R ni la caché del navegador). */
export interface CorridaImp { S: any | null; err: string | null; ent: { P: any; items: any[]; meta: any }; cfg: any; esc: string }

/**
 * _impCorrer sin la caché del navegador: `cfg` es la configuración del motor (normalizarCfgMotor); su sección imp se
 * normaliza aquí. `esc` es el escenario que se ve (el selector de la pantalla); si no es válido, el guardado.
 */
export function impCorrer(R: DatosPlan, cfgMotor: any, escVista?: string | null): CorridaImp {
  var cfg = cfgConImp(cfgMotor);
  var esc = IMP_ESCS.indexOf(escVista as string) >= 0 ? (escVista as string) : cfg.imp.escenario;
  var ent = impArmar(R, cfg, esc), S: any = null, err: string | null = null, ci = cfg.imp;
  if (!ent.items.length) err = "No hay artículos activos en el plan de importaciones.";
  else {
    try {
      S = impEngine(ent.P, ent.items);
      // El modelo cuenta el mes en curso completo: se le regresa al inventario lo que ya se vendió este mes para que "hoy" sea consistente.
      var fr = impFraccionMes(R.hoy);
      if (ci.prorratear_mes1 && fr > 0) {
        var ajustado = false;
        ent.items.forEach(function (it, j) {
          var d0 = S.productos[j].mensual.demanda[0], add = Number(d0) > 0 ? fr * d0 : 0;
          if (add > 0) { it.stockHoy += add; ent.meta.items[it.sku].stockAjuste = add; ajustado = true; }
        });
        if (ajustado) S = impEngine(ent.P, ent.items);
      }
    } catch (e) { err = e && (e as Error).message ? (e as Error).message : String(e); S = null; }
  }
  return { S: S, err: err, ent: ent, cfg: cfg, esc: esc };
}

/** _impAhoraDatos: productos por proveedor y los que hay que colocar esta semana (≤ 7 días) y la próxima (8 a 14). */
export function impAhoraDatos(c: CorridaImp): { g: Record<string, any>; orden: string[] } {
  var S = c.S, hoyIso = c.ent.P.fechaCorte, l7 = planEngDia(hoyIso, 7), l14 = planEngDia(hoyIso, 14), g: Record<string, any> = {}, orden: string[] = [];
  c.cfg.imp.prov.forEach(function (p: any) { g[p.clave] = { prov: p, rows: [], esta: [], prox: [] }; orden.push(p.clave); });
  S.productos.forEach(function (p: any, i: number) {
    var it = c.ent.items[i], q = p.quiebre, gr = g[it.proveedor];
    if (!gr) return;
    var o: any = { p: p, q: q, it: it, tipo: null };
    if (q.cantidadPedir > 0 && q.colocarPedido) {
      if (q.colocarPedido <= l7) { o.tipo = "esta"; gr.esta.push(o); }
      else if (q.colocarPedido <= l14) { o.tipo = "prox"; gr.prox.push(o); }
    }
    gr.rows.push(o);
  });
  return { g: g, orden: orden };
}
