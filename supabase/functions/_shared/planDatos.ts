// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL de la preparación de datos del Plan de abasto del sitio viejo (app/index.html a9e4a22): _planDatAMotor
// (33278), _planHistNecesaria (33133), _planOcFuente/_planOcDeZoho (38548), _zohoOcNorm (38509), _zocKey (38805),
// _zocBorradorSet (38532), _comSaldoCedis/_planInvUltSync (27514), _kpiAbCfgNorm (40998) y _impTxt/_impFechaOk.
// La app corre en el navegador con la hora de CDMX; aquí "hoy" es 'YYYY-MM-DD' de CDMX y los días se cuentan igual.
// planDatos_parity_test.ts compara contra la app.
import {
  fechaLocal, medianocheCdmx, mergeCfg, parseItems, planCfgNum, planDatTipo, planEngDifDias, type PedidoPlan,
} from "./planEngine.ts";

// ═══ Configuración ═══════════════════════════════════════════════════════════════════════════════════════════════

export const KPI_AB_DEF: Record<string, number> = { prec_min: 70, sesgo_max: 10, cv_min: 0.9, cv_max: 1.15, dias_min: 30, dias_max: 60, exc_margen: 30, exc_max: 10, disp_min: 95 };
/** [clave, etiqueta, unidad, ayuda, mín, máx, entero] (_KPI_AB_CAMPOS). */
export const KPI_AB_CAMPOS: [string, string, string, string, number, number, number][] = [
  ["prec_min", "Precisión del forecast mínima", "%", "Mínimo aceptable de acierto del pronóstico por artículo (4 semanas, ponderado a costo).", 0, 100, 1],
  ["sesgo_max", "Venta vs proyección: desviación máxima (±)", "%", "Cuánto puede alejarse la venta real de lo proyectado sin que sea problema.", 1, 100, 1],
  ["cv_min", "Compras vs venta: mínimo", "×", "Abajo de esto se compra menos de lo que se vende (el inventario se consume). 1 = compras igual a venta.", 0, 5, 0],
  ["cv_max", "Compras vs venta: máximo", "×", "Arriba de esto se compra más de lo que se vende (el inventario se acumula).", 0, 5, 0],
  ["dias_min", "Cobertura de inventario: mínimo", "días", "Menos que esto es riesgo de quedarse sin producto.", 1, 365, 1],
  ["dias_max", "Cobertura de inventario: máximo", "días", "Más que esto es capital parado.", 1, 730, 1],
  ["exc_margen", "Exceso: días sobre la cobertura objetivo", "días", "Un artículo tiene exceso cuando su inventario rebasa lo que pide el plan (lead time + seguridad + ciclo) más estos días.", 0, 365, 1],
  ["exc_max", "Exceso: máximo del inventario", "%", "Máximo aceptable de inventario (a costo) en exceso o sin venta.", 0, 100, 1],
  ["disp_min", "Disponibilidad mínima", "%", "Mínimo de artículos con venta que deben tener inventario disponible hoy.", 0, 100, 1],
];
export function kpiAbCfgNorm(x: any): Record<string, number> {
  var o: Record<string, number> = {};
  KPI_AB_CAMPOS.forEach(function (f) {
    var v = x && typeof x === "object" ? x[f[0]] : undefined, n = Number(v);
    if (v === undefined || v === null || v === "" || !isFinite(n)) { o[f[0]] = KPI_AB_DEF[f[0]]; return; }
    n = Math.min(f[5], Math.max(f[4], n)); o[f[0]] = f[6] ? Math.round(n) : n;
  });
  // un documento editado a mano con el mínimo igual o mayor que el máximo vuelve a los valores sugeridos de ese par
  if (o.cv_min >= o.cv_max) { o.cv_min = KPI_AB_DEF.cv_min; o.cv_max = KPI_AB_DEF.cv_max; }
  if (o.dias_min >= o.dias_max) { o.dias_min = KPI_AB_DEF.dias_min; o.dias_max = KPI_AB_DEF.dias_max; }
  return o;
}

export function impTxt(v: any, max?: number): string { return String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max || 80); }
export function impFechaOk(s: any): boolean { return /^20\d\d-\d{2}-\d{2}$/.test(String(s || "")) && !isNaN(new Date(s + "T00:00:00") as any); }

export function zohoOcNorm(z: any): any {
  if (!z || typeof z !== "object" || !Array.isArray(z.lineas)) return null;
  var ls: any[] = [];
  z.lineas.slice(0, 3000).forEach(function (l: any) {
    if (!l || typeof l !== "object") return;
    var sku = impTxt(l.sku, 60), pend = Number(l.pend);
    if (!sku || !isFinite(pend) || pend <= 0) return;
    ls.push({ sku: sku, nom: impTxt(l.nom, 80), folio: impTxt(l.folio, 40), prov: impTxt(l.prov, 80), pend: Math.round(pend * 1e4) / 1e4, arribo: impFechaOk(l.arribo) ? l.arribo : "", fecha: impFechaOk(l.fecha) ? l.fecha : "", creada: impFechaOk(l.creada) ? l.creada : "", monto: isFinite(Number(l.monto)) && Number(l.monto) > 0 ? Math.round(Number(l.monto) * 100) / 100 : null, borrador: !!l.borrador });
  });
  if (!ls.length) return null;
  var folios: Record<string, 1> = {}, bor: Record<string, 1> = {}; ls.forEach(function (l) { if (l.folio) { folios[l.folio] = 1; if (l.borrador) bor[l.folio] = 1; } });
  return { cargado: impTxt(z.cargado, 40), por: impTxt(z.por, 80), archivo: impTxt(z.archivo, 120), conciliado: impTxt(z.conciliado, 40), ocs: Object.keys(folios).length, borradores: Object.keys(bor).length, lineas: ls };
}

/**
 * _planCfgNormalizar completo para el motor: mergeCfg (planEngine.ts, ya con paridad) más las dos secciones que mergeCfg
 * deja tal cual y que el plan sí usa: zoho_oc (OCs cargadas de Zoho) y kpi (metas de Indicadores).
 */
export function normalizarCfgMotor(x: any): any {
  var c = mergeCfg(x);
  c.zoho_oc = zohoOcNorm(x && typeof x === "object" ? x.zoho_oc : null);
  c.kpi = kpiAbCfgNorm(x && typeof x === "object" ? x.kpi : null);
  return c;
}

/** Ventana de venta de Importaciones: _impCfgNorm la deja en [30, 365] y en 90 si falta (también sin sección imp). */
function ventanaImp(imp: any): number {
  if (!imp || typeof imp !== "object") return 90;
  return planCfgNum(imp.venta_ventana, [30, 365, 1], 90);
}
/** Días de pedidos que hay que leer (_planHistNecesaria). Al menos 84; con la ventana de Importaciones (90 por defecto). */
export function planHistNecesaria(cfg: any): number {
  return Math.max(cfg.consumo.ventana, 84, Math.min(365, Number(cfg.compra.prox_dias || 7) * Number(cfg.compra.bt_semanas || 0) + cfg.consumo.ventana), ventanaImp(cfg.imp));
}

// ═══ OCs ═════════════════════════════════════════════════════════════════════════════════════════════════════════

// Llave de folio: solo los dígitos sin ceros a la izquierda ("COM-OC-01258" = "OC 1258"); las OCs de DODO llevan su propia serie.
export function zocKey(folio: any): string {
  var s = String(folio || "").toUpperCase(), d = s.replace(/\D/g, "").replace(/^0+/, "");
  return d ? (/DODO/.test(s) ? "D" : "") + d : "";
}
/** Líneas de la carga de Zoho guardada en la configuración. Decisión 6: sin la copia fija _ZOC_INCLUIDA del 13-oct. */
export function zocFuenteBorr(cfg: any): { ls: any[]; fecha: string; ref: any } | null {
  var z = cfg && cfg.zoho_oc, ok = !!(z && z.lineas && z.lineas.length);
  if (ok) return { ls: z.lineas, fecha: String(z.cargado || "").slice(0, 10), ref: z };
  return null;
}
// Líneas en BORRADOR (OC creada pero aún no enviada), por folio y SKU: nunca cuentan como en camino
export function zocBorradorSet(cfg: any): Record<string, 1> | null {
  var f = zocFuenteBorr(cfg); if (!f) return null;
  var s: Record<string, 1> = {}, n = 0; f.ls.forEach(function (l: any) { if (l.borrador) { var k = zocKey(l.folio); if (k) { s[k + "|" + String(l.sku).trim().toUpperCase()] = 1; n++; } } });
  return n ? s : null;
}

/** Línea de una OC de Zoho en borrador (com_zoho_oc_lineas con status 'draft'). */
export interface LineaBorrador { po_number: string; sku: string; vendor_name: string | null; fecha_oc: string | null; cantidad: number | null; cantidad_recibida: number | null; precio: number | null }

/** Decisión 6: los borradores de la configuración más los borradores reales de Zoho que trae zoho-sync. */
export function borradoresPlan(R: { ocZohoBorr?: LineaBorrador[] | null }, cfg: any): Record<string, 1> | null {
  var s: Record<string, 1> = {}, n = 0, base = zocBorradorSet(cfg);
  if (base) Object.keys(base).forEach(function (k) { s[k] = 1; n++; });
  (R.ocZohoBorr || []).forEach(function (l) { var k = zocKey(l.po_number); if (k) { s[k + "|" + String(l.sku).trim().toUpperCase()] = 1; n++; } });
  return n ? s : null;
}

export function planOcDeZoho(cfg: any): boolean { return !!(cfg && cfg.compra && cfg.compra.fuente_oc === "zoho" && cfg.zoho_oc && cfg.zoho_oc.lineas && cfg.zoho_oc.lineas.length); }
// Líneas de OC que cuentan como "en camino": las pendientes de Zoho (si se eligió usar solo el archivo) o las abiertas de la plataforma.
export function planOcFuente(R: { oc: any[]; cat: any[] }, cfg: any): any[] {
  if (!planOcDeZoho(cfg)) return R.oc;
  var m: Record<string, string> = {}; R.cat.forEach(function (c) { m[String(c.sku).trim().toUpperCase()] = c.sku; });
  return cfg.zoho_oc.lineas.map(function (l: any) {
    return { sku: m[String(l.sku).trim().toUpperCase()] || l.sku, folio: l.folio, fecha: l.fecha || null, fecha_arribo: l.arribo || null, cantidad: l.pend, cantidad_recibida: 0, monto: null, proveedor: l.prov };
  });
}

// ═══ Inventario ══════════════════════════════════════════════════════════════════════════════════════════════════

export function planInvUltSync(cat: any[]): string | null { var ult: string | null = null; (cat || []).forEach(function (x) { [x && x.zoho_sync_at, x && x.zoho_actualizado].forEach(function (v) { if (v && (!ult || new Date(v) > new Date(ult))) ult = v; }); }); return ult; }
export function comSaldoCedis(cat: any): number { if (!cat) return 0; if (cat.zoho_sync_at == null) return Number(cat.saldo_cedis || 0); return cat.zoho_stock_fisico != null ? Number(cat.zoho_stock_fisico) : Number(cat.zoho_stock || 0); }

// ═══ Datos crudos → entrada del motor (_planDatAMotor) ═══════════════════════════════════════════════════════════

export interface Servidor {
  ok: boolean; motivo: string | null; calc: string | null;
  compras: { sku: string; fecha_oc: string; cantidad: number; monto: number }[];
  pagos: { sku: string; tipo: string; fecha_pago: string; monto: number }[];
  sinCosto: string[]; sinProveedor: string[];
}
/** Datos crudos del plan (R de _planDatCargar) con "hoy" como día de CDMX. */
export interface DatosPlan {
  hoy: string; hist: number; histReal: number;
  cat: any[]; pedidos: PedidoPlan[]; lt: { sku: string; dias: number | null }[];
  map: { shopify_nombre: string; sku: string }[]; oc: any[]; comp: any[];
  aperturas: { id: any; estatus: string | null; fecha: string | null; estatusOrig?: string | null }[];
  pedAper: { pedido_id: any }[]; kit: Record<string, boolean>;
  conteoUlt: { cedis: Record<string, string>; yulius: Record<string, string> };
  ocZohoBorr?: LineaBorrador[] | null;
  srv: Servidor | null; avisos: string[]; cargadoEn: number;
}

/** parseLocalDate del viejo como día 'YYYY-MM-DD' (o null). `new Date(y, m-1, d)` normaliza desbordes igual que Date.UTC. */
export function diaLocal(f: any): string | null {
  if (!f) return null;
  const s = (f.includes ? f.includes("T") : false) ? f.split("T")[0] : f;
  const [y, m, d] = (s + "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

export function planDatAMotor(R: DatosPlan, cfg: any): { raw: any; meta: any } {
  var hoyIso = R.hoy, hoyT = medianocheCdmx(R.hoy), hist = R.hist;
  var skuMap: Record<string, string> = {}; R.map.forEach(function (m) { skuMap[m.shopify_nombre] = m.sku; });
  var apById: Record<string, any> = {}; R.aperturas.forEach(function (a) { apById[a.id] = a; });
  var pedEnAper: Record<string, boolean> = {}; R.pedAper.forEach(function (p) { pedEnAper[p.pedido_id] = true; });
  var u: Record<string, number[]> = {}, sinMapear = 0, tipoUds: Record<string, number> = {}, lineasInvalidas = 0, skuFuera = 0;
  var ton = cfg.consumo.tipos;
  // SKU canónico del catálogo (sin distinguir mayúsculas ni espacios): una línea con un SKU escrito distinto se recupera.
  var catSku: Record<string, string> = {}; R.cat.forEach(function (c) { catSku[String(c.sku).trim().toUpperCase()] = c.sku; });
  R.pedidos.forEach(function (ped) {
    var ft = new Date(ped.fecha_pedido).getTime(); if (isNaN(ft)) return;
    var k = planEngDifDias(hoyIso, fechaLocal(ft));
    if (k < 0) k = 0;
    if (k >= hist) return;
    var tipo = planDatTipo(ped, apById, pedEnAper, cfg.aper.gracia_dias, cfg.aper.vencida_max);
    var orig = parseItems(ped.items);
    var its = cfg.consumo.items === "editados" && ped.items_editados ? parseItems(ped.items_editados) : orig;
    var idxNom: Record<string, string> | null = null;
    its.forEach(function (it: any) {
      if (!it) return;
      var sku = it.sku || skuMap[it.nombre];
      // items_editados pierde el sku de sus líneas: se recupera de la línea original con el mismo nombre.
      if (!sku && it.nombre) {
        if (!idxNom) { idxNom = {}; orig.forEach(function (o: any) { if (o && o.sku && o.nombre) idxNom![o.nombre] = o.sku; }); }
        sku = idxNom![it.nombre];
      }
      var qty = Number(it.cantidad == null ? 0 : it.cantidad);
      var enVentana = k < cfg.consumo.ventana; // los avisos hablan de la ventana, no de todo el historial cargado
      if (!isFinite(qty) || qty < 0) { if (ton[tipo] && enVentana) lineasInvalidas++; return; }
      if (!sku) { if (it.nombre && ton[tipo] && enVentana) sinMapear++; return; }
      var real = catSku[String(sku).trim().toUpperCase()];
      if (!real) { if (ton[tipo] && enVentana) skuFuera++; return; }
      sku = real;
      if (k < cfg.consumo.ventana) tipoUds[tipo] = (tipoUds[tipo] || 0) + qty;
      if (!ton[tipo]) return;
      var arr = u[sku] || (u[sku] = new Array(hist).fill(0));
      arr[k] += qty;
    });
  });
  var ltMap: Record<string, number> = {}, ltExiste: Record<string, boolean> = {}; R.lt.forEach(function (l) { ltMap[l.sku] = Number(l.dias || 0); ltExiste[l.sku] = true; });
  // Comprometido = pedidos "por enviar". Los que llevan muchos días así casi siempre ya se enviaron y nadie los marcó.
  var compMap: Record<string, number> = {}, compViejoUds = 0, compViejoLn = 0, compViejoFol: Record<string, 1> = {}, compMax = cfg.inv.comp_dias;
  R.comp.forEach(function (m) {
    var q = Number(m.cantidad || 0), fd = m.fecha || m.fecha_envio || m.created_at, fo = fd ? diaLocal(String(fd).slice(0, 10)) : null;
    if (compMax > 0 && fo && planEngDifDias(hoyIso, fo) > compMax) { compViejoUds += q; compViejoLn++; compViejoFol[m.folio || "?"] = 1; return; }
    compMap[m.sku] = (compMap[m.sku] || 0) + q;
  });
  // OCs abiertas: pendiente por línea (cantidad − recibido). "Vieja": con fecha de arribo vencida hace más de 14 días,
  // o sin fecha de arribo y emitida hace más de max(30, lead time + 14) días.
  var enOC: Record<string, number> = {}, staleUds: Record<string, number> = {}, staleLn: Record<string, number> = {}, borrUds: Record<string, number> = {}, llegaMin: Record<string, string> = {}, ignoradas = 0, zsrc = planOcDeZoho(cfg), dset = borradoresPlan(R, cfg);
  planOcFuente(R, cfg).forEach(function (r) {
    var pend = Math.max(0, Number(r.cantidad || 0) - Number(r.cantidad_recibida || 0));
    if (pend <= 0) return;
    var esB = !!(dset && dset[zocKey(r.folio) + "|" + String(r.sku).trim().toUpperCase()]);
    if (esB) return; // OC en borrador en Zoho (creada, aún sin enviar al proveedor): nunca cuenta como en camino
    var vieja = false, edad: number | null = null;
    if (r.fecha) { var fo = diaLocal(r.fecha); edad = fo ? planEngDifDias(hoyIso, fo) : null; }
    if (r.fecha_arribo) { var fa0 = diaLocal(r.fecha_arribo), du = fa0 ? planEngDifDias(fa0, hoyIso) : null; vieja = du !== null && du < -14; }
    else if (edad !== null) vieja = edad > Math.max(30, (ltMap[r.sku] > 0 ? ltMap[r.sku] : cfg.compra.lt_default) + 14);
    if (zsrc) vieja = false; // con OCs de Zoho no hay "viejas": lo que sigue pendiente en Zoho cuenta como en camino
    if (vieja) { staleUds[r.sku] = (staleUds[r.sku] || 0) + pend; staleLn[r.sku] = (staleLn[r.sku] || 0) + 1; }
    if (vieja && cfg.compra.oc_vencida > 0 && edad !== null && edad > cfg.compra.oc_vencida) { ignoradas++; return; }
    enOC[r.sku] = (enOC[r.sku] || 0) + pend;
    if (esB) borrUds[r.sku] = (borrUds[r.sku] || 0) + pend; // inalcanzable (igual que en la app): los borradores ya salieron arriba
    if (!vieja && r.fecha_arribo) { var fa = String(r.fecha_arribo).slice(0, 10); if (!llegaMin[r.sku] || fa < llegaMin[r.sku]) llegaMin[r.sku] = fa; }
  });
  var vacio = new Array(hist).fill(0);
  var skus = R.cat.map(function (c) {
    var vida: number | null = null;
    if (c.created_at) { var fc = new Date(c.created_at).getTime(); if (!isNaN(fc)) vida = Math.max(0, Math.round((hoyT - fc) / 864e5)); }
    return { sku: c.sku, nombre: c.nombre, estatus: c.estatus, costo: Number(c.costo_unitario || 0),
      fisico: comSaldoCedis(c), yulius: Number(c.saldo_yulius || 0), comprometido: compMap[c.sku] || 0,
      lt: ltMap[c.sku] > 0 ? ltMap[c.sku] : null, enOC: enOC[c.sku] || 0, porApertura: Number(c.cantidad_por_apertura || 0),
      minPzas: Number(c.minimo_compra_pzas || 0), multiplo: Number(c.multiplo_compra || 1),
      diasSeg: c.dias_seguridad == null || c.dias_seguridad === "" ? null : Number(c.dias_seguridad), vida: vida, u: u[c.sku] || vacio };
  });
  var aperturas = R.aperturas.map(function (a) { return { id: a.id, fecha: a.fecha ? String(a.fecha).slice(0, 10) : null, estatus: a.estatus, kit: !!R.kit[a.id] }; });
  // La historia que se le da al motor nunca pasa de lo que realmente existe en la base (días sin pedidos no son días en cero).
  var histMotor = Math.max(1, Math.min(hist, R.histReal || hist));
  return { raw: { hoy: hoyIso, hist: histMotor, skus: skus, aperturas: aperturas },
    meta: { compViejo: { uds: compViejoUds, ln: compViejoLn, folios: Object.keys(compViejoFol).length, dias: compMax }, sinMapear: sinMapear, tipoUds: tipoUds, staleUds: staleUds, staleLn: staleLn, borrUds: borrUds, llegaMin: llegaMin, ignoradas: ignoradas, ltExiste: ltExiste, lineasInvalidas: lineasInvalidas, skuFuera: skuFuera, histMotor: histMotor } };
}
