// @ts-nocheck
// deno-lint-ignore-file
// Copia EXACTA del motor de importaciones (_impEngine) del sitio viejo: app/index.html a9e4a22, líneas 36043–36920, el cuerpo del IIFE
// (función pura, CommonJS, validada contra los valores de la Sheet). No se edita a mano: se vuelve a generar con
// scripts/comercializadora/portar-motores-hoja.mjs (plan 3e, Tarea 2). Solo cambia la última línea: `export` en lugar de `module.exports`.
/*
 * impEngine(P, items) -> S
 * Reimplementacion pura (sin DOM, red, Date.now ni Math.random) del Google Sheet
 * "Calculadora de abasto de importados". "Hoy" = P.fechaCorte. Fechas = 'YYYY-MM-DD'.
 * Internamente las fechas son seriales de hoja (dias desde 1899-12-30), a veces fraccionarios.
 * Las FORMULAS del volcado mandan; la especificacion es solo guia.
 *
 * Contrato: no muta P ni items, es determinista y no depende de nada externo (CommonJS, sin dependencias).
 * La salida S es JSON puro: todo numero no finito (#DIV/0! del Sheet, Infinity, NaN) sale como null.
 *
 * Convenciones donde el Sheet produce un ERROR (el motor sigue calculando y lo registra en S.advertencias):
 *  - Plan!O31:O38 = ROUND("",0) (producto GP sin pedido): se usa 0.
 *  - Quiebre con demanda 0 y stock negativo (H = #DIV/0!): seAcaba = null, J = "" => producto sin pedido; primerQuiebre = "Sin quiebre".
 *  - Compra puente con llegada posterior al horizonte (INDEX fuera de rango): se extrapola con la demanda del ultimo mes.
 *  - Compra puente con stock negativo y nada en camino (INDEX con mes vacio): colchon calculado con el mes 1.
 *  - Texto con un componente no calculable: el texto completo sale null.
 *  - Contenedores!C6 = "" (sin pedido GP): el texto sugerido usa 0.0.
 *  - MINIFS sin coincidencias = 0 (fechas de 1899 en Plan!C12/D12, sin soporte en el Sheet).
 * Lanzan Error (equivalente a #N/A / #VALOR! del Sheet): escenario o tipo de contenedor inexistente, familia sin indice de
 *  temporada, proveedor sin lead time, fecha de corte invalida, mesesCobertura no entero o fuera de 1..(horizonte-1).
 * Quirks del Sheet reproducidos por omision (apagables con P.constantes): Q1 (override = 10 aperturas), Q3 (planDemandaCruzada),
 *  Q4 (ultimoContenedorSinChequeoHorizonte), Q5 (nContenedoresCalendario = 9). Ver spec_imp.md seccion 6.
 */

// ---------------------------------------------------------------------------
// Constantes por omision (literales embebidos en las formulas del Sheet)
// ---------------------------------------------------------------------------
const DEF = {
  horizonteMeses: 15,
  ventana2027: { desde: 4, hasta: 15 },
  diaCorteLlegada: 15,
  diasPorMes: 30,
  diasPorMesSiguientePedido: 30.4,
  semanasPorMes: 4.33,
  umbralMesAlto: 1.1,
  umbralMesBajo: 0.9,
  mesesParaPrimerPromedio: 3,
  diasVentanaPedidoUrgente: 30,
  proveedorContenedor: 'Green Packaging',
  nContenedoresPlan: 11,
  nContenedoresCalendario: 9,
  ultimoContenedorSinChequeoHorizonte: true,
  claveTermos: 'Easy Drinkware',
  claveTazasParaguas: 'Proveedor actual (vía SIMBS)',
  claveBolsas: 'LQC Printing',
  familiaTermos: 'Termos',
  planDemandaCruzada: [{ contenedor: 10, sku: 'INS-DES-012', usaDemandaDeSku: 'INS-DES-005' }],
  centinelaSinQuiebre: 99,
};

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const EPOCH_MS = Date.UTC(1899, 11, 30);
const DAY_MS = 86400000;

// ---------------------------------------------------------------------------
// Fechas (seriales)
// ---------------------------------------------------------------------------
function serFromYMD(y, m, d) { // m 1..12
  return Math.round((Date.UTC(y, m - 1, d) - EPOCH_MS) / DAY_MS);
}
function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (v instanceof Date) return serFromYMD(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  const s = String(v).trim();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return serFromYMD(+m[1], +m[2], +m[3]);
  const n = Number(s);
  return isFinite(n) ? n : null;
}
function ymd(s) { // sobre floor(s)
  const dt = new Date(EPOCH_MS + Math.floor(s) * DAY_MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}
function YEAR(s) { return ymd(s).y; }
function MONTH(s) { return ymd(s).m; }
function DAY(s) { return ymd(s).d; }
function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function EDATE(s, n) {
  if (!isFinite(s) || !isFinite(n)) return NaN;
  const p = ymd(s);
  const tot = p.y * 12 + (p.m - 1) + Math.trunc(n);
  const ny = Math.floor(tot / 12);
  const nm = tot - ny * 12; // 0..11
  const dd = Math.min(p.d, daysInMonth(ny, nm + 1));
  return serFromYMD(ny, nm + 1, dd);
}
function ISO(s) { // serial -> 'YYYY-MM-DD' (floor) o null
  if (s === null || s === undefined || typeof s !== 'number' || !isFinite(s)) return null;
  const f = Math.floor(s);
  if (Math.abs(f) > 2958465) return null;
  const dt = new Date(EPOCH_MS + f * DAY_MS);
  const y = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return String(y).padStart(4, '0') + '-' + mm + '-' + dd;
}

// ---------------------------------------------------------------------------
// Funciones de hoja
// ---------------------------------------------------------------------------
function ROUND(x, d) {
  if (typeof x !== 'number' || !isFinite(x)) return x;
  const f = Math.pow(10, d);
  const a = parseFloat((Math.abs(x) * f).toPrecision(15));
  const r = Math.round(a) / f;
  const out = x < 0 ? -r : r;
  return out === 0 ? 0 : out;
}
function CEILING(x, s) {
  if (!isFinite(x) || !isFinite(s)) return NaN;
  if (s === 0) return 0;
  return Math.ceil(parseFloat((x / s).toPrecision(15))) * s;
}
function num(x) {
  if (typeof x === 'number') return isFinite(x) ? x : 0;
  if (x === null || x === undefined || x === '') return 0;
  const n = Number(x);
  return isFinite(n) ? n : 0;
}
function isNum(x) { return typeof x === 'number' && isFinite(x); }
function sumArr(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s; }
function avgArr(a) { return a.length ? sumArr(a) / a.length : NaN; }
function minArr(a) { let m = Infinity; for (const v of a) if (isNum(v) && v < m) m = v; return m === Infinity ? 0 : m; }
function maxArr(a) { let m = -Infinity; for (const v of a) if (isNum(v) && v > m) m = v; return m === -Infinity ? 0 : m; }
function firstIdx(a, v) { for (let i = 0; i < a.length; i++) if (a[i] === v) return i; return -1; }
function eqText(a, b) { return String(a === null || a === undefined ? '' : a).toLowerCase() === String(b === null || b === undefined ? '' : b).toLowerCase(); }

// TEXT(valor, formato) es-MX. Un valor no finito produce la marca 'NaN' (el Sheet mostraria un error);
// okTxt() (dentro de impEngine) convierte cualquier texto con esa marca en null y avisa.
function tNum(x) { return typeof x === 'number' ? x : ((x === null || x === undefined || x === '') ? 0 : Number(x)); }
// numero concatenado con & (formato General: hasta 15 cifras significativas)
function NT(x) {
  if (typeof x !== 'number') return String(x === null || x === undefined ? '' : x);
  if (!isFinite(x)) return 'NaN';
  return Number.isInteger(x) ? String(x) : String(parseFloat(x.toPrecision(15)));
}
function T0(x) { const v = tNum(x); return isFinite(v) ? String(ROUND(v, 0)) : 'NaN'; }
function T1(x) { const v = tNum(x); return isFinite(v) ? ROUND(v, 1).toFixed(1) : 'NaN'; }
function TPCT(x) { const v = tNum(x); return isFinite(v) ? String(ROUND(v * 100, 0)) + '%' : 'NaN'; }
function TMIL(x) {
  const v = tNum(x);
  if (!isFinite(v)) return 'NaN';
  const r = ROUND(v, 0);
  const neg = r < 0;
  const s = String(Math.abs(r)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + s;
}
function dOk(s) { return typeof s === 'number' && isFinite(s) && Math.abs(Math.floor(s)) <= 2958465; }
function DDMMMYY(s) { if (!dOk(s)) return 'NaN'; const p = ymd(s); return String(p.d).padStart(2, '0') + '-' + MESES[p.m - 1] + '-' + String(p.y % 100).padStart(2, '0'); }
function DDMMM(s) { if (!dOk(s)) return 'NaN'; const p = ymd(s); return String(p.d).padStart(2, '0') + '-' + MESES[p.m - 1]; }
function MMMYY(s) { if (!dOk(s)) return 'NaN'; const p = ymd(s); return MESES[p.m - 1] + '-' + String(p.y % 100).padStart(2, '0'); }
function MMM(s) { if (!dOk(s)) return 'NaN'; return MESES[ymd(s).m - 1]; }

function mergeConst(c) {
  const o = Object.assign({}, DEF);
  o.ventana2027 = Object.assign({}, DEF.ventana2027);
  o.planDemandaCruzada = DEF.planDemandaCruzada.map((x) => Object.assign({}, x));
  if (c && typeof c === 'object') {
    for (const k of Object.keys(c)) {
      if (c[k] === undefined) continue;
      if (k === 'ventana2027' && c[k] && typeof c[k] === 'object') o.ventana2027 = Object.assign({}, DEF.ventana2027, c[k]);
      else if (k === 'planDemandaCruzada') o.planDemandaCruzada = Array.isArray(c[k]) ? c[k].map((x) => Object.assign({}, x)) : [];
      else o[k] = c[k];
    }
  }
  return o;
}

function cleanOut(v) {
  if (typeof v === 'number') return isFinite(v) ? (v === 0 ? 0 : v) : null;
  if (Array.isArray(v)) return v.map(cleanOut);
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) o[k] = cleanOut(v[k]);
    return o;
  }
  return v === undefined ? null : v;
}

// ---------------------------------------------------------------------------
// Motor
// ---------------------------------------------------------------------------
function impEngine(P, items) {
  if (!P || typeof P !== 'object') throw new Error('impEngine: P es obligatorio');
  if (!Array.isArray(items) || items.length < 1) throw new Error('impEngine: items debe traer al menos 1 producto');
  const adv = [];
  const warn = (t) => { if (adv.indexOf(t) < 0) adv.push(t); };
  // Texto generado con un componente no calculable (el Sheet mostraria #DIV/0! / #VALOR!): se devuelve null y se avisa.
  const BADTXT = new RegExp("(^|[^A-Za-z])(NaN|undefined|Infinity)([^A-Za-z]|$)");
  const okTxt = (label, t) => {
    if (typeof t === 'string' && BADTXT.test(t)) { warn('Texto "' + label + '" no calculable (error #DIV/0! / #VALOR! en el Sheet): se devuelve null.'); return null; }
    return t;
  };

  const C = mergeConst(P.constantes);
  const NM = Math.trunc(num(C.horizonteMeses)) || 15;
  const DPM = num(C.diasPorMes) || 30;
  const DIA_LLEGA = num(C.diaCorteLlegada);
  const N_PROM = Math.max(1, Math.trunc(num(C.mesesParaPrimerPromedio)) || 3);
  const VENT_URG = num(C.diasVentanaPedidoUrgente);
  const SIN_Q = C.centinelaSinQuiebre;
  const W0 = Math.max(0, Math.trunc(num(C.ventana2027.desde)) - 1);
  const W1 = Math.min(NM - 1, Math.trunc(num(C.ventana2027.hasta)) - 1);
  if (W1 < W0) throw new Error('constantes.ventana2027 invalida');

  // ---- Fecha de corte ----
  const corte = parseDate(P.fechaCorte);
  if (corte === null) throw new Error('P.fechaCorte invalida (se espera YYYY-MM-DD)');
  const cY = YEAR(corte), cM = MONTH(corte);
  const M1 = serFromYMD(cY, cM, 1);
  const FIN = EDATE(M1, NM) - 1;
  const inicio = [];
  for (let m = 0; m < NM; m++) inicio.push(EDATE(M1, m));
  const MIDX = (s) => (YEAR(s) - cY) * 12 + MONTH(s) - cM + 1;
  const MIDXC = (s) => Math.min(NM, Math.max(1, MIDX(s)));

  // ---- P1: escenario ----
  if (!P.escenarios || typeof P.escenarios !== 'object') throw new Error('P.escenarios es obligatorio');
  let scKey = null;
  for (const k of Object.keys(P.escenarios)) if (k === P.escenarioActivo) { scKey = k; break; }
  if (scKey === null) for (const k of Object.keys(P.escenarios)) if (eqText(k, P.escenarioActivo)) { scKey = k; break; }
  if (scKey === null) throw new Error('#N/A: escenarioActivo "' + P.escenarioActivo + '" no existe en P.escenarios');
  const sc = P.escenarios[scKey];
  const g = num(sc.crecimientoAnual);
  const cumpl = num(sc.cumplimientoAperturas);
  const ajuste = num(sc.ajusteDemanda);
  const gMes = Math.pow(1 + g, 1 / 12) - 1;

  // ---- contenedor ----
  const cont = P.contenedor || {};
  const opciones = Array.isArray(cont.opciones) ? cont.opciones : [];
  let opt = opciones.find((o) => o && o.tipo === cont.tipo);
  if (!opt) opt = opciones.find((o) => o && eqText(o.tipo, cont.tipo));
  if (!opt) throw new Error('#N/A: tipo de contenedor "' + cont.tipo + '" no existe en contenedor.opciones');
  const llenado = (cont.llenadoReal === undefined || cont.llenadoReal === null) ? 1 : num(cont.llenadoReal);
  const cbmUtil = num(opt.cbm) * llenado;
  const nPorEmb = (cont.contenedoresPorEmbarque === undefined || cont.contenedoresPorEmbarque === null) ? 1 : num(cont.contenedoresPorEmbarque);
  const D4 = nPorEmb * cbmUtil;
  const D5 = num(cont.diasRespaldoSiguiente);
  if (cbmUtil === 0) warn('CBM utiles del contenedor = 0: Contenedores!E, Quiebres!G (contenedores) y la capacidad no son calculables.');

  // ---- politica ----
  const pol = P.politica || {};
  const Nn = num(pol.mesesCobertura);
  if (!(Nn >= 1 && Nn <= NM - 1)) {
    throw new Error('politica.mesesCobertura debe estar entre 1 y ' + (NM - 1) + ' (el Sheet produce #VALOR! / rangos invalidos fuera de ese rango)');
  }
  const N = Nn;
  if (Math.floor(N) !== N) warn('politica.mesesCobertura fraccionario (' + N + '): las formulas INDEX del Sheet truncan la posicion; el motor replica ese truncamiento.');
  const respaldoM = num(pol.mesesRespaldo);
  const margen = num(pol.diasMargen);
  const juntar = num(pol.diasJuntarPedido);

  // ---- proveedores ----
  const provs = Array.isArray(P.proveedores) ? P.proveedores : [];
  if (!provs.length) throw new Error('P.proveedores es obligatorio');
  const provInfo = provs.map((pv) => ({
    clave: pv.clave, nombre: pv.nombre, total: num(pv.leadNormal) + num(pv.leadCierres),
  }));
  const provIdxByClave = (clave) => {
    for (let i = 0; i < provs.length; i++) if (provs[i].clave === clave) return i;
    for (let i = 0; i < provs.length; i++) if (eqText(provs[i].clave, clave)) return i;
    return -1;
  };
  let gpProv = provIdxByClave(C.proveedorContenedor);
  if (gpProv < 0) {
    warn('El proveedor de contenedores "' + C.proveedorContenedor + '" no esta en P.proveedores: se usa el primero de la tabla (como Calculadora!A30/E30).');
    gpProv = 0;
  }
  const D6 = provInfo[gpProv].total;
  const gpNombre = provInfo[gpProv].nombre;

  // ---- red de sucursales ----
  const red = P.red || {};
  const padN = (a) => { const o = []; for (let m = 0; m < NM; m++) o.push(Array.isArray(a) ? num(a[m]) : 0); return o; };
  const aperPlan = padN(red.aperturasPlan);
  const cierres = padN(red.cierres);
  const ovr = Array.isArray(red.aperturasConsideradasOverride) ? red.aperturasConsideradasOverride : [];
  const sucHoy = num(red.sucursalesHoy);
  const aper = [];
  let overrideDifiere = false;
  for (let m = 0; m < NM; m++) {
    const f = ROUND(aperPlan[m] * cumpl, 0);
    if (ovr[m] !== null && ovr[m] !== undefined && ovr[m] !== '' && isFinite(Number(ovr[m]))) {
      aper.push(Number(ovr[m]));
      if (Number(ovr[m]) !== f) overrideDifiere = true;
    } else aper.push(f);
  }
  if (overrideDifiere) warn('Aperturas consideradas con valores fijos que pisan ROUND(plan x cumplimiento) (Q1: Calculadora!F18:Q18 = 10 en el Sheet).');
  const sucCierre = [], sucInicio = [], factor = [];
  for (let m = 0; m < NM; m++) {
    sucCierre.push((m === 0 ? sucHoy : sucCierre[m - 1]) + aper[m] - cierres[m]);
    sucInicio.push(m === 0 ? sucHoy : sucInicio[m - 1] + aper[m - 1] - cierres[m - 1]);
    factor.push(Math.pow(1 + gMes, m));
  }

  // ---- temporada ----
  const temporada = P.temporada || {};
  const tempFor = (fam) => {
    let key = null;
    for (const k of Object.keys(temporada)) if (k === fam) { key = k; break; }
    if (key === null) for (const k of Object.keys(temporada)) if (eqText(k, fam)) { key = k; break; }
    if (key === null) throw new Error('#N/A: la familia "' + fam + '" no tiene indice de temporada en P.temporada');
    const a = temporada[key];
    if (!Array.isArray(a) || a.length < 12) throw new Error('P.temporada["' + key + '"] debe tener 12 valores');
    return a;
  };

  // ---------------------------------------------------------------------
  // P2: demanda, llegadas, stock (bloques de Proyeccion)
  // ---------------------------------------------------------------------
  const nP = items.length;
  const it = items.map((x) => {
    const pi = provIdxByClave(x.proveedor);
    if (pi < 0) throw new Error('#N/A: el proveedor "' + x.proveedor + '" del producto "' + x.producto + '" no esta en P.proveedores');
    const triple = isNum(x.largoCm) && isNum(x.anchoCm) && isNum(x.altoCm);
    const cbm = triple ? x.largoCm * x.anchoCm * x.altoCm / 1000000 : num(x.cbmDato);
    return {
      raw: x,
      sku: x.sku, producto: x.producto, familia: x.familia, unidad: x.unidad,
      provIdx: pi, provNombre: provInfo[pi].nombre, lead: provInfo[pi].total,
      esGP: eqText(x.proveedor, C.proveedorContenedor),
      stock: num(x.stockHoy), venta: num(x.ventaSucursalMes), kit: num(x.kitApertura),
      empaque: num(x.empaque), minimo: num(x.minimoProveedor), costo: num(x.costoUnitario),
      yc: num(x.yaComprado), llega: parseDate(x.llega), cl: num(x.compraLocal), llegaL: parseDate(x.llegaLocal),
      cbm,
    };
  });

  const mesCal = inicio.map((s) => MONTH(s));
  const pr = []; // bloque por producto
  for (let p = 0; p < nP; p++) {
    const x = it[p];
    const temp = tempFor(x.familia);
    const dem = [], arr = [], stockFin = [], quiebreApoyo = [], ventaPerdida = [], cbmCons = [], acum = [], invRec = [], cbmArr = [];
    const idxM = x.yc > 0 ? Math.max(1, MIDX((x.llega === null ? 0 : x.llega) + DIA_LLEGA)) : null;
    const idxO = x.cl > 0 ? Math.max(1, MIDX((x.llegaL === null ? 0 : x.llegaL) + DIA_LLEGA)) : null;
    const Smes = Math.max(1, idxM !== null ? idxM : 1, idxO !== null ? idxO : 1);
    for (let m = 0; m < NM; m++) {
      dem.push((x.venta * temp[mesCal[m] - 1] * sucInicio[m] * factor[m] + x.kit * aper[m]) * (1 + ajuste));
      arr.push((idxM === m + 1 ? x.yc : 0) + (idxO === m + 1 ? x.cl : 0));
    }
    for (let m = 0; m < NM; m++) {
      const prev = m === 0 ? x.stock : stockFin[m - 1];
      stockFin.push(Math.max(0, prev + arr[m] - dem[m]));
      quiebreApoyo.push(((m + 1) >= Smes && prev + arr[m] < dem[m]) ? (m + 1) : SIN_Q);
      ventaPerdida.push(Math.max(0, dem[m] - prev - arr[m]));
      cbmCons.push(dem[m] * x.cbm);
      acum.push(m === 0 ? 0 : acum[m - 1] + dem[m - 1]);
      invRec.push(ROUND(dem[m] * (1 + D5 / DPM), 0));
      cbmArr.push(arr[m] * x.cbm);
    }
    const win = dem.slice(W0, W1 + 1);
    const min27 = minArr(win), max27 = maxArr(win), prom27 = avgArr(win), tot27 = sumArr(win);
    const iMin = firstIdx(win, min27), iMax = firstIdx(win, max27);
    const mesMin27 = inicio[W0 + Math.max(0, iMin)], mesMax27 = inicio[W0 + Math.max(0, iMax)];
    const peso = [], tipo = [];
    for (let m = 0; m < NM; m++) {
      if (m >= W0 && m <= W1) {
        peso.push(dem[m] / tot27);
        tipo.push(dem[m] >= C.umbralMesAlto * prom27 ? 'Alto' : (dem[m] <= C.umbralMesBajo * prom27 ? 'Bajo' : 'Normal'));
      } else { peso.push(null); tipo.push(null); }
    }
    if (!(tot27 > 0)) warn('Producto "' + x.producto + '" sin demanda en la ventana 2027: peso del mes = #DIV/0! en el Sheet (se devuelve null).');
    pr.push({ dem, arr, stockFin, quiebreApoyo, ventaPerdida, cbmCons, acum, invRec, cbmArr, Smes, min27, max27, prom27, tot27, mesMin27, mesMax27, peso, tipo });
  }

  // ---------------------------------------------------------------------
  // P3: agregados de vasos y tapas (productos del proveedor de contenedores)
  // ---------------------------------------------------------------------
  const gpIdx = [];
  for (let p = 0; p < nP; p++) if (it[p].esGP) gpIdx.push(p);
  const cbmVT = [];
  for (let m = 0; m < NM; m++) { let s = 0; for (const p of gpIdx) s += pr[p].cbmCons[m]; cbmVT.push(s); }
  const wVT = cbmVT.slice(W0, W1 + 1);
  const aggMin = minArr(wVT), aggMax = maxArr(wVT), aggProm = avgArr(wVT), aggTot = sumArr(wVT);
  const aggMesMin = inicio[W0 + Math.max(0, firstIdx(wVT, aggMin))];
  const aggMesMax = inicio[W0 + Math.max(0, firstIdx(wVT, aggMax))];
  const pesoVT = [], tipoVT = [];
  for (let m = 0; m < NM; m++) {
    if (m >= W0 && m <= W1) {
      pesoVT.push(cbmVT[m] / aggTot);
      tipoVT.push(cbmVT[m] >= C.umbralMesAlto * aggProm ? 'Alto' : (cbmVT[m] <= C.umbralMesBajo * aggProm ? 'Bajo' : 'Normal'));
    } else { pesoVT.push(null); tipoVT.push(null); }
  }
  let sumaPesosVT = 0; for (let m = W0; m <= W1; m++) sumaPesosVT += pesoVT[m];
  for (let m = 0; m < NM; m++) if (!(cbmVT[m] > 0)) { warn('CBM de vasos y tapas = 0 en algun mes: Contenedores!F/G (meses que cubre) y Plan!F dividen entre 0 (#DIV/0! en el Sheet; se devuelve null).'); break; }

  // ---------------------------------------------------------------------
  // P5 (parte 1): quiebre y fecha de pedido
  // ---------------------------------------------------------------------
  const q = [];
  for (let p = 0; p < nP; p++) {
    const x = it[p], b = pr[p];
    const o = {};
    o.D = x.stock;
    o.E = x.yc + x.cl;
    o.F = avgArr(b.dem.slice(0, N_PROM));
    o.G = (o.F === 0 || !isFinite(o.F)) ? null : (o.D + o.E) / o.F;
    o.V = minArr(b.quiebreApoyo);
    if (b.quiebreApoyo.length === 0) o.V = SIN_Q;
    o.hErr = false;
    if (o.V === SIN_Q) {
      o.W = null; o.H = null;
    } else {
      o.W = (o.V === 1 ? o.D : b.stockFin[o.V - 2]) + b.arr[o.V - 1];
      const h = EDATE(M1, o.V - 1) + ROUND(DPM * o.W / b.dem[o.V - 1], 0);
      if (isFinite(h)) o.H = h;
      else {
        // Sheet: 30*W/demanda con demanda 0 (stock negativo) => #DIV/0! en H; J = "" porque ISNUMBER(H) es FALSO
        warn('Quiebres!H: "' + x.producto + '" tiene quiebre en el mes ' + o.V + ' con demanda 0 (stock negativo): #DIV/0! en el Sheet; se deja SE ACABA en null y el producto queda sin pedido (como J = "").');
        o.H = null; o.hErr = true;
      }
    }
    o.I = x.lead;
    o.J = o.H === null ? null : o.H - o.I - margen;
    o.AD = o.J === null ? null : Math.max(corte, o.J);
    q.push(o);
  }
  // AE = MINIFS(AD, nombreProveedor == nombre fila)
  for (let p = 0; p < nP; p++) {
    const o = q[p];
    if (o.AD === null) { o.AE = null; o.K = null; o.L = null; o.M = null; continue; }
    let mn = Infinity;
    for (let r = 0; r < nP; r++) if (q[r].AD !== null && eqText(it[r].provNombre, it[p].provNombre) && q[r].AD < mn) mn = q[r].AD;
    o.AE = mn === Infinity ? 0 : mn;
    o.K = (o.AD <= o.AE + juntar) ? o.AE : o.AD;
    o.L = o.K + o.I;
    o.M = Math.max(0, o.L - o.H);
  }

  // ---------------------------------------------------------------------
  // P6: cobertura del pedido
  // ---------------------------------------------------------------------
  for (let p = 0; p < nP; p++) {
    const o = q[p], b = pr[p], x = it[p];
    if (o.K === null) {
      o.X = null; o.AF = null; o.Y = null; o.Z = null; o.AA = null; o.AB = null; o.AC = 0;
      continue;
    }
    const mi = MIDX(o.L);
    o.X = Math.min(NM - N, Math.max(1, mi));
    o.AF = mi < 1 ? 0 : Math.min(1, (DAY(o.L) - 1) / DPM);
    const X = o.X;
    // Posiciones 1-based de INDEX(...): el Sheet trunca los indices fraccionarios (X y N pueden serlo);
    // con X y N enteros esto es identico a la formula directa.
    const Xi = Math.trunc(X);
    let prevStock;
    if (X === 1) prevStock = x.stock;
    else {
      const pos = Math.trunc(X - 1);
      if (pos >= 1) prevStock = b.stockFin[pos - 1];
      else { warn('Quiebres!Y: "' + x.producto + '" con mes de llegada fraccionario < 2 (INDEX con posicion 0, #VALOR! en el Sheet): se usa el stock de hoy.'); prevStock = x.stock; }
    }
    o.Y = Math.max(0, prevStock + b.arr[Xi - 1] - o.AF * b.dem[Xi - 1]);
    // SUM(INDEX(r, a):INDEX(r, c)): un rango con los extremos al reves se normaliza (se suman ambos extremos)
    const sumPos = (arr, a, c) => { const lo = Math.min(a, c), hi = Math.max(a, c); let s = 0; for (let j = lo; j <= hi; j++) s += arr[j - 1]; return s; };
    const mid = N > 1 ? sumPos(b.dem, Math.trunc(X + 1), Math.trunc(X + N - 1)) : 0;
    o.Z = (1 - o.AF) * b.dem[Xi - 1] + mid + o.AF * b.dem[Math.trunc(X + N) - 1];
    o.AA = sumPos(b.arr, Math.trunc(X + 1), Math.trunc(X + N));
    o.AB = respaldoM * o.Z / N;
    o.AC = o.Z + o.AB - o.Y - o.AA;
  }

  // ---------------------------------------------------------------------
  // P4: compra puente
  // ---------------------------------------------------------------------
  let cp = P.compraPuente;
  if (!cp || typeof cp !== 'object') {
    warn('P.compraPuente ausente: se usan los valores del Sheet (Compra puente!C3 = 7 dias de colchon, C4 = multiplo 5).');
    cp = { diasColchon: 7, multiplo: 5 };
  }
  const diasColchon = num(cp.diasColchon);
  const multiplo = num(cp.multiplo);
  const cpr = [];
  for (let p = 0; p < nP; p++) {
    const x = it[p], b = pr[p];
    const o = {};
    o.stockHoy = x.stock;
    o.yaComprado = x.yc + x.cl;
    if (o.yaComprado === 0) {
      o.llegaS = null; o.F = null; o.G = 0;
    } else {
      o.llegaS = Math.max(x.llega === null ? 0 : x.llega, x.llegaL === null ? 0 : x.llegaL);
      o.F = Math.max(1, MIDX(o.llegaS));
      let pre = 0;
      if (o.F > 1) for (let j = 0; j <= o.F - 2; j++) pre += b.dem[Math.min(j, NM - 1)];
      if (o.F > NM) warn('Compra puente: "' + x.producto + '" llega despues del horizonte (mes ' + o.F + ' > ' + NM + '): INDEX fuera de rango (#REF!) en el Sheet; se usa el ultimo mes.');
      const frac = o.llegaS < corte ? 0 : Math.min(1, DAY(o.llegaS) / DPM);
      o.G = pre + frac * b.dem[Math.min(o.F, NM) - 1];
    }
    o.H = Math.max(0, o.G - o.stockHoy);
    if (o.H > 0 && o.F === null) warn('Compra puente: "' + x.producto + '" tiene stock negativo y nada en camino: INDEX con mes vacio (#VALOR! en el Sheet); se usa el mes 1 para el colchon.');
    o.I = o.H > 0 ? b.dem[(o.F === null ? 1 : Math.min(o.F, NM)) - 1] / DPM * diasColchon : 0;
    o.J = o.H > 0 ? CEILING(ROUND(o.H + o.I, 4), multiplo) : 0;
    o.K = o.J === 0 ? (o.yaComprado === 0 ? 'No hay nada en camino' : 'No hace falta')
      : (eqText(x.familia, C.familiaTermos) ? 'Aéreo (no hay proveedor local)' : 'Proveedor local');
    const M = q[p].M;
    o.L = (isNum(M) && M > 0) ? ROUND(M * q[p].F / DPM, 0) : 0;
    cpr.push(o);
  }

  // ---------------------------------------------------------------------
  // P7: Plan de embarques (contenedores de GP)
  // ---------------------------------------------------------------------
  const nPlan = Math.max(2, Math.trunc(num(C.nContenedoresPlan)) || 11);
  const nGP = gpIdx.length;
  const planNames = gpIdx.map((p) => it[p].producto);
  // Plan!O = ROUND(Y,0)
  const O1 = gpIdx.map((p) => {
    const y = q[p].Y;
    if (y === null) { warn('Plan!O: "' + it[p].producto + '" no tiene pedido en el horizonte (Y vacio): #VALOR! en el Sheet; se usa 0.'); return 0; }
    return ROUND(y, 0);
  });
  const cbmG = gpIdx.map((p) => it[p].cbm);
  const costoG = gpIdx.map((p) => it[p].costo);
  // C12/D12: MINIFS de K / L de productos del proveedor GP
  let C0 = 0, D0 = 0, haveGP = false;
  {
    let mk = Infinity, ml = Infinity;
    for (let p = 0; p < nP; p++) {
      if (eqText(it[p].provNombre, gpNombre)) {
        if (q[p].K !== null && q[p].K < mk) mk = q[p].K;
        if (q[p].L !== null && q[p].L < ml) ml = q[p].L;
      }
    }
    haveGP = mk !== Infinity;
    C0 = mk === Infinity ? 0 : mk;
    D0 = ml === Infinity ? 0 : ml;
  }
  if (!haveGP) warn('Plan: ningun producto del proveedor de contenedores tiene pedido en el horizonte (MINIFS vacio = 0): fechas de 1899 sin soporte en el Sheet.');
  const PC = []; // contenedores: {C,D,E,F,G,H}
  for (let k = 0; k < nPlan; k++) {
    const o = {};
    if (k === 0) {
      o.C = C0; o.D = D0;
      const mi = MIDXC(o.D);
      o.G = cbmVT[mi - 1] / DPM;
      o.H = sucInicio[mi - 1];
      let sp = 0; for (let i = 0; i < nGP; i++) sp += O1[i] * cbmG[i];
      o.F = (D4 + sp) / o.G;
      o.E = o.D + o.F;
    } else {
      o.D = PC[k - 1].E - D5;
      o.C = Math.max(corte, o.D - D6 - margen);
      const mi = MIDXC(o.D);
      o.G = cbmVT[mi - 1] / DPM;
      o.H = sucInicio[mi - 1];
      o.F = D4 / o.G + D5;
      o.E = o.D + o.F;
    }
    PC.push(o);
  }
  // cantidades
  const cruz = Array.isArray(C.planDemandaCruzada) ? C.planDemandaCruzada : [];
  const findItemBySku = (sku) => { for (let p = 0; p < nP; p++) if (it[p].sku === sku) return p; return -1; };
  const qty = []; // [i][k]
  // cantidad del producto GP i en el contenedor k usando la demanda del producto srcP
  const calcQty = (i, k, srcP) => {
    const D = PC[k].D;
    const mi = MIDXC(D);
    const base = pr[srcP].dem[mi - 1] / DPM;
    if (k === 0) return D > FIN ? 0 : Math.max(0, ROUND(base * PC[0].F - O1[i], 0));
    if (k === nPlan - 1 && C.ultimoContenedorSinChequeoHorizonte) return ROUND(base * (PC[k].F - D5), 0);
    return D > FIN ? 0 : ROUND(base * (PC[k].F - D5), 0);
  };
  for (let i = 0; i < nGP; i++) {
    const row = [];
    const p = gpIdx[i];
    for (let k = 0; k < nPlan; k++) {
      let srcP = p;
      for (const c of cruz) {
        if (c && Number(c.contenedor) === k + 1 && c.sku === it[p].sku) {
          const alt = findItemBySku(c.usaDemandaDeSku);
          if (alt >= 0) srcP = alt;
        }
      }
      const v = calcQty(i, k, srcP);
      if (srcP !== p) {
        const own = calcQty(i, k, p);
        if (isFinite(v) && isFinite(own) && v !== own) {
          warn('Quirk del Sheet reproducido (Q3): Plan de embarques, contenedor ' + (k + 1) + ', "' + it[p].producto + '" usa la demanda de "' + it[srcP].producto + '" (con la demanda propia seria ' + own + ' en vez de ' + v + ').');
        }
      }
      row.push(v);
    }
    qty.push(row);
  }
  if (C.ultimoContenedorSinChequeoHorizonte && nPlan > 0 && PC[nPlan - 1].D > FIN && qty.some((r) => r[nPlan - 1] > 0)) {
    warn('Quirk del Sheet reproducido (Q4): el contenedor ' + nPlan + ' llega despues del horizonte pero conserva cantidades (Plan de embarques!N31:N38 sin el IF de horizonte).');
  }
  const cbmCont = [], invCont = [], estadoCont = [];
  for (let k = 0; k < nPlan; k++) {
    let a = 0, b2 = 0;
    for (let i = 0; i < nGP; i++) { a += qty[i][k] * cbmG[i]; b2 += qty[i][k] * costoG[i]; }
    cbmCont.push(a); invCont.push(b2);
    estadoCont.push(PC[k].D > FIN ? 'Fuera del horizonte (dic-27)'
      : (PC[k].C <= corte ? 'PEDIR YA' : (PC[k].C <= corte + VENT_URG ? 'Pedir este mes' : 'Programado')));
  }
  if (nGP > 0 && !(PC[0].G > 0)) warn('Plan: CBM vendidos al dia = 0 en el mes de llegada del contenedor 1: Plan!F divide entre 0 (#DIV/0! en el Sheet).');

  // ---------------------------------------------------------------------
  // P8: cantidad a pedir, estado, notas
  // ---------------------------------------------------------------------
  for (let p = 0; p < nP; p++) {
    const o = q[p], x = it[p];
    if (o.AC <= 0) o.O = 0;
    else if (x.esGP) {
      let ii = -1;
      for (let i = 0; i < nGP; i++) if (eqText(planNames[i], x.producto)) { ii = i; break; }
      if (ii < 0) { warn('Quiebres!O: "' + x.producto + '" no esta en el plan de embarques (MATCH #N/A).'); o.O = 0; }
      else o.O = qty[ii][0];
    } else {
      if (x.empaque === 0) warn('Quiebres!O: "' + x.producto + '" tiene empaque 0: CEILING(AC,0) = 0, cantidad a pedir 0.');
      o.O = CEILING(o.AC, x.empaque);
    }
    o.P = o.O * x.costo;
    o.Q = o.O * x.cbm;
    if (o.K === null || o.O === 0) o.R = null;
    else if (x.esGP) o.R = nPlan >= 2 ? PC[1].C : null;
    else o.R = o.L + ROUND(N * num(C.diasPorMesSiguientePedido), 0) - o.I - margen;
    if (o.O > 0 && x.minimo > 0 && o.O < x.minimo) o.S = 'Debajo del mínimo del proveedor (' + TMIL(x.minimo) + '): negociar o juntar colores';
    else if (o.O > 0 && x.esGP && o.O === x.minimo && o.AC < x.minimo) o.S = 'Subido al mínimo del proveedor';
    else o.S = '';
    o.T = cpr[p].J;
    o.N = (o.K === null ? 'Sin pedido en el horizonte'
      : (o.M > 0 ? 'URGENTE: sin producto ' + NT(o.M) + ' días'
        : (o.K <= corte + VENT_URG ? 'Pedir este mes' : 'Programado')))
      + (o.T > 0 ? ' + compra puente' : '');
  }

  // ---------------------------------------------------------------------
  // P9: resumen por proveedor y KPIs
  // ---------------------------------------------------------------------
  const provRes = provInfo.map((pv) => {
    const rows = [];
    for (let p = 0; p < nP; p++) if (eqText(it[p].provNombre, pv.nombre)) rows.push(p);
    const conPedido = rows.filter((p) => q[p].O > 0);
    const r = { proveedorNombre: pv.nombre };
    if (conPedido.length === 0) {
      r.colocarS = null; r.colocarTexto = 'Sin pedido'; r.llegaS = null; r.productos = 0; r.inversion = 0; r.cbm = 0; r.contenedores = null;
    } else {
      let mk = Infinity, ml = Infinity;
      for (const p of conPedido) { if (q[p].K !== null && q[p].K < mk) mk = q[p].K; if (q[p].L !== null && q[p].L < ml) ml = q[p].L; }
      r.colocarS = mk === Infinity ? 0 : mk;
      r.colocarTexto = null;
      r.llegaS = ml === Infinity ? 0 : ml;
      r.productos = conPedido.filter((p) => q[p].K === r.colocarS).length;
      let inv = 0, cb = 0;
      for (const p of rows) if (q[p].K !== null && q[p].K === r.colocarS) { inv += q[p].P; cb += q[p].Q; }
      r.inversion = inv; r.cbm = cb;
      r.contenedores = cb === 0 ? null : cb / cbmUtil;
    }
    return r;
  });
  let prod30 = 0, inv30 = 0, riesgo = 0;
  for (let p = 0; p < nP; p++) {
    const o = q[p];
    if (o.K !== null && o.K <= corte + VENT_URG) { if (o.O > 0) prod30++; inv30 += o.P; }
    if ((isNum(o.M) && o.M > 0) || o.T > 0) riesgo++;
  }
  let minH = Infinity, minHIdx = -1;
  for (let p = 0; p < nP; p++) if (q[p].H !== null && q[p].H < minH) { minH = q[p].H; minHIdx = p; }
  // MIN($H$5:$H$23) con una celda de error => error => IFERROR(..., "Sin quiebre")
  const hayHError = q.some((o) => o.hErr);
  const primerQuiebre = (minHIdx >= 0 && !hayHError) ? it[minHIdx].producto + ' — ' + DDMMMYY(minH) : 'Sin quiebre';
  const kpiTitulo = 'Escenario ' + P.escenarioActivo + ' · corte ' + DDMMMYY(corte) + ' · cada pedido cubre ' + NT(N) + ' meses + ' + NT(respaldoM) + ' de respaldo';

  // ---------------------------------------------------------------------
  // P10: calendario y stock de vasos y tapas
  // ---------------------------------------------------------------------
  const nCal = Math.min(nPlan, Math.max(0, Math.trunc(num(C.nContenedoresCalendario))));
  for (let k = nCal; k < nPlan; k++) {
    if (PC[k].D >= inicio[0] && PC[k].D < FIN + 1 && qty.some((r) => r[k] > 0)) {
      warn('Quirk del Sheet reproducido (Q5): el contenedor ' + (k + 1) + ' llega dentro del horizonte (' + DDMMMYY(PC[k].D) + ') pero no entra al calendario ni al stock de vasos y tapas (Proyeccion mensual!C13:Q15 solo leen los primeros ' + nCal + ' contenedores).');
    }
  }
  const colocarCont = [], llegaCont = [], cbmQueLlega = [], stockVT = [];
  let stock0 = 0; for (const p of gpIdx) stock0 += it[p].stock * it[p].cbm;
  for (let m = 0; m < NM; m++) {
    const lo = inicio[m], hi = EDATE(lo, 1);
    let cntC = 0, minC = Infinity, cntD = 0, minD = Infinity, sumCbm = 0;
    for (let k = 0; k < nCal; k++) {
      if (PC[k].C >= lo && PC[k].C < hi) { cntC++; if (k + 1 < minC) minC = k + 1; }
      if (PC[k].D >= lo && PC[k].D < hi) { cntD++; if (k + 1 < minD) minD = k + 1; sumCbm += cbmCont[k]; }
    }
    colocarCont.push(cntC === 0 ? '' : 'C' + minC + (cntC > 1 ? ' +1' : ''));
    llegaCont.push(cntD === 0 ? '' : 'C' + minD + (cntD > 1 ? ' +1' : ''));
    let ya = 0; for (const p of gpIdx) ya += pr[p].cbmArr[m];
    cbmQueLlega.push(sumCbm + ya);
    stockVT.push(Math.max(0, (m === 0 ? stock0 : stockVT[m - 1]) + cbmQueLlega[m] - cbmVT[m]));
  }
  const etiquetaProv = (clave) => {
    const pi = provIdxByClave(clave);
    if (pi < 0) { warn('Proyeccion!B16:B18: la clave de proveedor "' + clave + '" no esta en P.proveedores (#N/A en el Sheet); se devuelven etiquetas vacias.'); return inicio.map(() => ''); }
    const nombre = provInfo[pi].nombre;
    return inicio.map((lo) => {
      const hi = EDATE(lo, 1);
      let c1 = 0, c2 = 0;
      for (let p = 0; p < nP; p++) {
        if (!eqText(it[p].provNombre, nombre)) continue;
        const o = q[p];
        if (o.K !== null && o.K >= lo && o.K < hi && o.O > 0) c1++;
        if (o.R !== null && o.R >= lo && o.R < hi) c2++;
      }
      return c1 > 0 ? 'Pedir' : (c2 > 0 ? 'Pedir (2º)' : '');
    });
  };
  const colTermos = etiquetaProv(C.claveTermos);
  const colTazas = etiquetaProv(C.claveTazasParaguas);
  const colBolsas = etiquetaProv(C.claveBolsas);
  const invDias = [];
  for (let m = 0; m < NM; m++) {
    const v = stockVT[m] / (cbmVT[m] / DPM);
    invDias.push(isFinite(v) ? v : 0);
  }

  // ---------------------------------------------------------------------
  // P11: hoja Contenedores
  // ---------------------------------------------------------------------
  const cm = [];
  for (let m = 0; m < NM; m++) {
    const hiPos = Math.trunc(Math.min(NM, m + N)); // INDEX(..., MIN(15, m+N)) (1-based, truncado si N es fraccionario)
    const d = avgArr(cbmVT.slice(m, hiPos)) * N;
    let e = d / cbmUtil;
    if (!isFinite(e)) e = null;
    const f = cbmUtil / cbmVT[m];
    const gg = 2 * cbmUtil / cbmVT[m];
    const h = e === null ? '' : (e <= 1 ? '1 contenedor por pedido' : (e <= 2 ? '2 contenedores juntos' : '3 o más: escalonar embarques'));
    cm.push({
      mes: inicio[m], sucursales: sucInicio[m], cbmConsumidos: cbmVT[m], cbmPedido: d, contenedoresNecesarios: e,
      mesesCubre1: f, mesesCubre2: gg, queConviene: h, cap1: cbmUtil, cap2: 2 * cbmUtil,
      apoyo1: (e !== null && e > 1) ? inicio[m] : null, apoyo2: (e !== null && e > 2) ? inicio[m] : null,
    });
  }
  const l1 = cm.filter((r) => r.apoyo1 !== null).map((r) => r.apoyo1);
  const l2 = cm.filter((r) => r.apoyo2 !== null).map((r) => r.apoyo2);
  const C6 = provRes[gpProv].contenedores;
  let c7S = null, c7T = null;
  if (l1.length === 0) c7T = 'No pasa en el horizonte';
  else if (minArr(l1) === inicio[0]) c7T = 'Ya desde hoy';
  else c7S = minArr(l1);
  let c8S = null, c8T = null;
  if (l2.length === 0) c8T = 'No pasa en el horizonte'; else c8S = minArr(l2);
  if (C6 === null) warn('Contenedores!C6 vacio (el proveedor de contenedores no tiene pedido con CBM): TEXT("","0.0") en C9; se usa 0.0.');
  const c6v = C6 === null ? 0 : C6;
  let sugerido = 'El próximo pedido de vasos y tapas necesita ' + T1(c6v) + ' contenedores ' + cont.tipo + '. '
    + (c6v <= 1 ? 'Con uno alcanza.' : (c6v <= 2 ? 'Pedir 2 contenedores juntos en el mismo embarque.'
      : 'Pedir ' + Math.ceil(c6v) + ' contenedores o dividir en 2 embarques.'))
    + ' Alternativa: un 40\' cada ' + T0(cm[0].mesesCubre1 * num(C.semanasPorMes)) + ' semanas.';
  if (c8S !== null) {
    let ix = -1;
    for (let m = 0; m < NM; m++) if (cm[m].mes === c8S) { ix = m; break; }
    sugerido += ' Desde ' + MMMYY(c8S) + ' ni 2 contenedores cubren un trimestre: pasar a embarques programados, un contenedor cada '
      + T0((ix >= 0 ? cm[ix].mesesCubre1 : NaN) * num(C.semanasPorMes)) + ' semanas.';
  }

  // ---------------------------------------------------------------------
  // P12 / P13: textos
  // ---------------------------------------------------------------------
  const cntHor = PC.filter((c) => c.D <= FIN).length;
  const resumenTexto = 'Hoy un contenedor alcanza para ' + T0(PC[1].F) + ' días de venta; en dic-27 para '
    + T0(cm[NM - 1].mesesCubre1 * DPM) + ' días. Se necesitan ' + cntHor + ' contenedores entre ene-27 y dic-27 (uno cada '
    + T0(avgArr(PC.slice(1, 5).map((c) => c.F)) - D5) + ' días en promedio).';
  const textoContenedores = NT(nPorEmb) + ' × ' + cont.tipo + ' (se cambia en Calculadora, sección 5)';
  const subtitulo = 'Escenario ' + P.escenarioActivo + ' · crecimiento por sucursal ' + TPCT(g) + ' anual · cumplimiento de aperturas ' + TPCT(cumpl) + ' · corte ' + DDMMMYY(corte);
  const resTextoCont = 'Pedido de hoy: 1 contenedor lleno (' + T0(cbmCont[0]) + ' CBM), colocar ' + DDMMM(PC[0].C) + ', llega ' + DDMMM(PC[0].D)
    + ' y alcanza hasta ' + DDMMM(PC[0].E) + '. 2º contenedor: colocar ' + DDMMMYY(PC[1].C) + ' (llega ' + DDMMM(PC[1].D) + '). 3º: colocar '
    + DDMMMYY(PC[Math.min(2, nPlan - 1)].C) + '. 4º: colocar ' + DDMMMYY(PC[Math.min(3, nPlan - 1)].C) + '.';
  const resTextoVol = 'Volumen de vasos y tapas: ' + T0(cbmVT[0]) + ' CBM al mes hoy → ' + T0(cbmVT[NM - 1]) + ' CBM al mes en dic-27. Un '
    + cont.tipo + ' alcanza para ' + T1(cm[0].mesesCubre1) + ' meses hoy y para ' + T1(cm[NM - 1].mesesCubre1) + ' meses en dic-27.';
  const decidir1 = '1. Siguiente contenedor de vasos y tapas: colocar a más tardar el ' + DDMMMYY(PC[1].C) + ' (llega ' + DDMMMYY(PC[1].D) + ').';
  const wInv = invDias.slice(W0, W1 + 1);
  const minInv = minArr(wInv);
  const posMin = Math.max(0, firstIdx(wInv, minInv));
  const decidir2 = '2. Mes más justo: ' + MMMYY(inicio[Math.min(NM - 1, W0 + posMin)]) + ', con ' + T0(minInv)
    + ' días de inventario. Si se quiere más margen, adelantar el contenedor que llega antes de ese mes.';
  const largeK = (k) => {
    const s = wVT.filter(isNum).slice().sort((a, b2) => b2 - a);
    const v = s[k - 1];
    const ix = Math.max(0, firstIdx(wVT, v));
    return MMM(inicio[W0 + ix]);
  };
  const decidir3 = '3. Meses de mayor consumo en 2027: ' + largeK(1) + ', ' + largeK(2) + ' y ' + largeK(3) + '. Consumo promedio '
    + T0(aggProm) + ' CBM/mes (mín ' + T0(aggMin) + ', máx ' + T0(aggMax) + ').';

  const ej = cpr[0];
  const compraPuenteEjemplo = 'Venta de oct (' + T1(pr[0].dem[0]) + ') + venta del 1 al 15 de nov (' + T1(pr[0].dem[1] * 0.5) + ') = ' + T1(ej.G)
    + ' cajas. Tenemos ' + T0(it[0].stock) + ' → faltan ' + T1(ej.H) + '. + colchón 7 días (' + T1(ej.I) + ') = ' + T1(ej.H + ej.I)
    + ' → compra puente ' + NT(ej.J) + ' cajas.';

  // ---------------------------------------------------------------------
  // Armado de la salida S
  // ---------------------------------------------------------------------
  const S = {};
  S.escenario = { nombre: P.escenarioActivo, crecimientoAnual: g, cumplimientoAperturas: cumpl, ajusteDemanda: ajuste, crecimientoMensual: gMes };
  S.leadTimes = provInfo.map((pv) => ({ clave: pv.clave, nombre: pv.nombre, total: pv.total }));
  S.cbmUtilContenedor = cbmUtil;
  S.meses = [];
  for (let m = 0; m < NM; m++) {
    S.meses.push({
      mes: m + 1, inicio: ISO(inicio[m]), sucursalesInicio: sucInicio[m], aperturas: aper[m], cierres: cierres[m],
      sucursalesCierre: sucCierre[m], factorCrecimiento: factor[m], cbmVasosTapas: cbmVT[m],
      pesoMes2027: pesoVT[m], tipoMes2027: tipoVT[m],
      colocarContenedor: colocarCont[m], llegaContenedor: llegaCont[m], cbmQueLlega: cbmQueLlega[m],
      colocarTermos: colTermos[m], colocarTazasParaguas: colTazas[m], colocarBolsas: colBolsas[m],
      stockVasosTapasCbm: stockVT[m], inventarioDiasCierre: invDias[m],
    });
  }
  S.agregado2027 = { min: aggMin, max: aggMax, prom: aggProm, total: aggTot, mesMin: ISO(aggMesMin), mesMax: ISO(aggMesMax), sumaPesos: sumaPesosVT };
  S.productos = [];
  for (let p = 0; p < nP; p++) {
    const x = it[p], b = pr[p], o = q[p], c = cpr[p];
    S.productos.push({
      sku: x.sku, producto: x.producto, cbmCaja: x.cbm,
      mensual: {
        demanda: b.dem, llegadasYaCompradas: b.arr, stockFin: b.stockFin, quiebreApoyo: b.quiebreApoyo, ventaPerdida: b.ventaPerdida,
        cbmConsumido: b.cbmCons, ventaAcumuladaInicio: b.acum, pesoMes2027: b.peso, tipoMes2027: b.tipo,
        inventarioRecomendado: b.invRec, cbmYaCompradoLlega: b.cbmArr,
      },
      mesUltLlegada: b.Smes, min2027: b.min27, max2027: b.max27, prom2027: b.prom27, total2027: b.tot27,
      mesMin2027: ISO(b.mesMin27), mesMax2027: ISO(b.mesMax27),
      sumaPesos2027: (() => { let s = 0; for (let m = W0; m <= W1; m++) s += b.peso[m]; return s; })(),
      quiebre: {
        proveedorNombre: x.provNombre, producto: x.producto, unidad: x.unidad, stockHoy: o.D, yaComprado: o.E, ventaMes3: o.F,
        mesesAlcanza: o.G, seAcaba: ISO(o.H), sinQuiebre: o.V === SIN_Q,
        seAcabaTexto: o.V === SIN_Q ? 'No se acaba antes de dic-27' : null,
        leadTime: o.I, pedirATardar: ISO(o.J), colocarPedido: ISO(o.K), llegaCedis: ISO(o.L),
        diasSinProducto: o.M, estado: okTxt('Quiebres!N estado', o.N), cantidadPedir: o.O, inversion: o.P, cbm: o.Q,
        siguientePedido: ISO(o.R), siguientePedidoSerial: o.R, nota: okTxt('Quiebres!S nota', o.S), compraPuente: o.T,
        mesQuiebre: o.V, disponibleMes: o.W, mesLlegada: o.X, stockAlLlegar: o.Y, ventaCobertura: o.Z, llegadasCobertura: o.AA,
        respaldo: o.AB, necesidad: o.AC, fechaPropia: ISO(o.AD), fechaProveedor: ISO(o.AE), parteMesVendida: o.AF,
      },
      compraPuente: {
        stockHoy: c.stockHoy, yaComprado: c.yaComprado, llega: ISO(c.llegaS), mesLlegada: c.F, ventaHastaLlegar: c.G,
        faltante: c.H, colchon: c.I, compraPuente: c.J, comoCubrir: c.K, faltanteNuevoPedido: c.L,
      },
    });
  }
  S.compraPuenteEjemplo = okTxt('Compra puente!A29', compraPuenteEjemplo);
  S.proveedoresResumen = provRes.map((r) => ({
    proveedorNombre: r.proveedorNombre, colocar: ISO(r.colocarS), colocarTexto: r.colocarTexto, llega: ISO(r.llegaS),
    productos: r.productos, inversion: r.inversion, cbm: r.cbm, contenedores: r.contenedores,
  }));
  S.kpis = { titulo: okTxt('Quiebres!A2', kpiTitulo), productosAPedir30d: prod30, inversion30d: inv30, productosRiesgo: riesgo, primerQuiebre: okTxt('Quiebres!B34', primerQuiebre) };
  S.plan = {
    cbmPorEmbarque: D4, textoContenedores: okTxt('Plan!E4', textoContenedores), diasRespaldo: D5, leadTime: D6, resumenTexto: okTxt('Plan!D7', resumenTexto),
    contenedores: PC.map((c, k) => ({
      n: k + 1, colocar: ISO(c.C), colocarSerial: c.C, llega: ISO(c.D), llegaSerial: c.D, alcanzaHasta: ISO(c.E), alcanzaHastaSerial: c.E,
      diasAlcanza: c.F, cbmDia: c.G, sucursales: c.H, cbm: cbmCont[k], inversion: invCont[k], estado: estadoCont[k],
    })),
    cantidades: gpIdx.map((p, i) => ({
      producto: it[p].producto, alias: (it[p].raw.aliasPlan === undefined || it[p].raw.aliasPlan === null) ? '' : it[p].raw.aliasPlan,
      cbmCaja: cbmG[i], porContenedor: qty[i], stockAlLlegar1: O1[i], minimoProveedor: it[p].minimo, costo: costoG[i],
    })),
    totalCbm: cbmCont.slice(),
  };
  S.contenedores = {
    cbmUtil, contenedoresProximoPedido: C6,
    mesNoCabeEn1: ISO(c7S), mesNoCabeEn1Texto: c7T, mesNoCabeEn2: ISO(c8S), mesNoCabeEn2Texto: c8T, sugerido: okTxt('Contenedores!C9', sugerido),
    meses: cm.map((r) => ({
      mes: ISO(r.mes), sucursales: r.sucursales, cbmConsumidos: r.cbmConsumidos, cbmPedido: r.cbmPedido,
      contenedoresNecesarios: r.contenedoresNecesarios, mesesCubre1: r.mesesCubre1, mesesCubre2: r.mesesCubre2,
      queConviene: r.queConviene, cap1: r.cap1, cap2: r.cap2, apoyo1: ISO(r.apoyo1), apoyo2: ISO(r.apoyo2),
    })),
  };
  let invTotalProv = 0; for (const r of provRes) invTotalProv += r.inversion;
  S.resumen = {
    subtitulo: okTxt('Resumen!A2', subtitulo), sucursalesDic26: sucCierre[Math.min(2, NM - 1)], sucursalesDic27: sucCierre[NM - 1],
    productosAPedir30d: prod30, inversion30d: inv30, productosRiesgo: riesgo, contenedoresProximoPedido: C6,
    inversionTotalProveedores: invTotalProv, textoContenedores: okTxt('Resumen!A16', resTextoCont), textoVolumen: okTxt('Resumen!A18', resTextoVol), textoDiasContenedor: okTxt('Resumen!A19', resumenTexto),
  };
  S.consumo2027 = { decidir1: okTxt('Consumo 2027!A5', decidir1), decidir2: okTxt('Consumo 2027!A6', decidir2), decidir3: okTxt('Consumo 2027!A7', decidir3), inventarioDias: invDias.slice() };
  S.advertencias = adv;
  return cleanOut(S);
}

export { impEngine };
export const helpers = { ROUND, CEILING, EDATE, ISO, parseDate, serFromYMD, T0, T1, TPCT, TMIL, DDMMMYY, DDMMM, MMMYY, MMM, DEF };
