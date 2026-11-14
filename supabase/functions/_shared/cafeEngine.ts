// @ts-nocheck
// deno-lint-ignore-file
// Copia EXACTA del motor de café (_cafeEngine) del sitio viejo: app/index.html a9e4a22, líneas 36931–37565, el cuerpo del IIFE
// (función pura, CommonJS, validada contra los valores de la Sheet). No se edita a mano: se vuelve a generar con
// scripts/comercializadora/portar-motores-hoja.mjs (plan 3e, Tarea 2). Solo cambia la última línea: `export` en lugar de `module.exports`.
/*
 * cafeEngine(P) -> R
 * Motor de "Calculadora de compra de cafe tostado 2027 (Proyeccion 2027)".
 * Funcion pura: sin DOM, sin red, sin Date.now()/Math.random(); no muta P; determinista. CommonJS, sin dependencias.
 * Exporta: module.exports = cafeEngine (tambien .cafeEngine / .default) + helpers (roundUp0, fmt0, num, esVacio, calcularBloque).
 *
 * Convenciones
 *  - Meses = arreglos de 12; indice 0 = enero del anio P.anio (el libro es un anio calendario; no hay fechas ni lead times).
 *  - Escenarios = 3 por posicion: 0 = Pesimista (= Min del Timeline), 1 = Base (= Esperado), 2 = Optimista (= Max).
 *    El activo se elige por nombre (MATCH exacto sin distinguir mayusculas); si no existe se lanza Error('escenarioActivo no existe').
 *    (Extension: si P.escenarios trae menos de 3 se completan con escenarios en cero; si trae mas, tambien se calculan.)
 *  - Fuente de verdad: las FORMULAS del libro (Calculadora, Calculo aperturas, Detalle mensual, Precios, Comparativa, Timeline 2027);
 *    se respeta incluso el orden de las operaciones de cada formula (el resultado coincide bit a bit con un recalculo de las formulas).
 *  - Ningun kg/MXN se redondea. Unicos redondeos: ROUNDUP(kg/kgPorBolsa,0) de bolsas y TEXT(x,"#,##0") del rangoTexto.
 *  - Entradas vacias/no numericas valen 0. Las divisiones SIN proteccion en el libro (#DIV/0!/#NUM!: media de estacionalidad 0,
 *    1+crecimiento <= 0, kgPorBolsa 0) devuelven 0 en vez de NaN/Infinity. La salida solo contiene numeros finitos (y ningun -0).
 */

const N_MESES = 12;
const MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MES_LARGO = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const ESC_DEFECTO = ['Pesimista', 'Base', 'Optimista'];
const COLORES_DEFECTO = ['White', 'Kraft', 'Black'];   // Timeline: White = filas 47+50, Kraft = 48+51, Black = 49+52
const COHORTES_EN_ARRANQUE = 3;                        // Calculadora!B28:E28 = B26-3*B27 (oct, nov, dic del anio previo)
const MES_APERTURA_MADURAS = -99;                      // centinela de la fila "Maduras" (columna C)
const EN_DASH = String.fromCharCode(0x2013);          // U+2013 EN DASH (rangoTexto)
const MENOS_UNICODE = String.fromCharCode(0x2212);    // U+2212 signo menos (rotulo 'Ajuste general (+/-)')

// ------------------------------------------------------------------ utilidades numericas

/** Celda vacia (null/undefined/''/solo espacios). Un 0 numerico NO es vacio. */
function esVacio(x) {
  return x === null || x === undefined || (typeof x === 'string' && x.trim() === '');
}

/** Coerciona una entrada a numero finito; vacio / no numerico -> 0 (una celda vacia vale 0 en las formulas). */
function num(x) {
  if (typeof x === 'number') return Number.isFinite(x) ? x : 0;
  if (typeof x === 'string') {
    const t = x.trim();
    if (t === '') return 0;
    const n = Number(t);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof x === 'boolean') return x ? 1 : 0;
  return 0;
}

/** Arreglo de 12 numeros (rellena con 0 / recorta). */
function arr12(a) {
  const out = new Array(N_MESES);
  for (let i = 0; i < N_MESES; i++) out[i] = Array.isArray(a) ? num(a[i]) : 0;
  return out;
}

/** Arreglo de numeros de longitud libre. */
function arrNum(a) {
  if (!Array.isArray(a)) return [];
  return a.map(num);
}

/** SUM de izquierda a derecha. */
function suma(a) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return s;
}

/** Elimina -0. */
function nz(x) {
  return x === 0 ? 0 : x;
}

/**
 * Resta con el comportamiento de Excel/Sheets: si el resultado es solo ruido de redondeo respecto a los
 * operandos (|a-b| <= 1e-14 * max(|a|,|b|)) devuelve 0 exacto. Se usa en las formulas H8 y H9 de "De donde sale el volumen".
 */
function restaExcel(a, b) {
  const r = a - b;
  const escala = Math.max(Math.abs(a), Math.abs(b));
  return Math.abs(r) <= escala * 1e-14 ? 0 : r;
}

/** Recorre R: -0 -> 0 y cualquier numero no finito -> 0 (la salida es siempre JSON-limpia). Modifica solo R (objetos nuevos). */
function limpiar(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? (v === 0 ? 0 : v) : 0;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) v[i] = limpiar(v[i]);
    return v;
  }
  if (v && typeof v === 'object') {
    const ks = Object.keys(v);
    for (let i = 0; i < ks.length; i++) v[ks[i]] = limpiar(v[ks[i]]);
    return v;
  }
  return v;
}

/** Division protegida: denominador 0 -> 0 (el libro daria #DIV/0!; el motor no devuelve NaN/Infinity). */
function div(a, b) {
  return b === 0 ? 0 : a / b;
}

/** base^exp con el resultado siempre finito (base <= 0 con exponente fraccionario daria #NUM! en el libro). */
function potencia(base, exp) {
  if (exp === 0) return 1;
  if (!(base > 0)) return 0;
  const v = Math.pow(base, exp);
  return Number.isFinite(v) ? v : 0;
}

/** ROUNDUP(x,0) de Excel: hacia arriba (lejos de cero), con el recorte a 15 cifras significativas. */
function roundUp0(x) {
  if (!Number.isFinite(x) || x === 0) return 0;
  const ax = Math.abs(x);
  const r = Math.ceil(Number(ax.toPrecision(15)));
  return x < 0 ? -r : r;
}

/** TEXT(x,"#,##0"): redondeo a entero (mitad lejos de cero) y coma de miles; sin Intl/locale. */
function fmt0(x) {
  if (!Number.isFinite(x)) return '0';
  const r = x < 0 ? -Math.round(-x) : Math.round(x);
  const digitos = Math.abs(r).toFixed(0);
  const conComas = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (r < 0 ? '-' : '') + conComas;
}

function anioCorto(a) {
  return String(a).slice(-2);
}

// ------------------------------------------------------------------ normalizacion de entradas

function normalizarEscenario(e, i) {
  const o = e && typeof e === 'object' ? e : {};
  const nombre = esVacio(o.nombre) ? (i < ESC_DEFECTO.length ? ESC_DEFECTO[i] : 'Escenario ' + (i + 1)) : String(o.nombre);
  return {
    nombre,
    g: num(o.crecimientoAnual),              // Calculadora!B21:D21
    mad: num(o.compraMadura),                // B22:D22  (Mes 7+)
    ap1: num(o.compraMesApertura),           // B23:D23  (Mes 1)
    ini: num(o.sucursalesInicio),            // B26:D26
    a0: num(o.aperturasOctDic2026),          // B27:D27
    aper: arr12(o.aperturasPorMes),          // filas 31/32/33
  };
}

/** Ids de salida unicos (el orden de productos define las filas). */
function idsUnicos(productos) {
  const usados = new Set();
  return productos.map((p, i) => {
    let id = p && !esVacio(p.id) ? String(p.id) : 'producto_' + (i + 1);
    const base = id;
    let k = 2;
    while (usados.has(id)) id = base + '_' + k++;
    usados.add(id);
    return id;
  });
}

function normalizarProducto(p, i) {
  const o = p && typeof p === 'object' ? p : {};
  const v = o.vigente && typeof o.vigente === 'object' ? o.vigente : {};
  const nv = o.nuevo && typeof o.nuevo === 'object' ? o.nuevo : {};
  const kgPorBolsa = num(o.kgPorBolsa);
  const precioKg = num(v.precioKg);
  const empaque = num(v.empaque);
  // Precios!D15 = IF(C15="",C6,C15)*B15 ; F15 = D15+IF(E15="",E6,E15)  (un 0 numerico NO es vacio)
  const precioKgNuevo = esVacio(nv.precioKg) ? precioKg : num(nv.precioKg);
  const empaqueNuevo = esVacio(nv.empaque) ? empaque : num(nv.empaque);
  return {
    colorGrupo: esVacio(o.colorGrupo) ? COLORES_DEFECTO[i % 3] : String(o.colorGrupo),
    mezcla: num(o.mezclaPct),
    kgPorBolsa,
    precioKg,
    empaque,
    venta: num(v.precioVentaBolsa),
    precioKgNuevo,
    empaqueNuevo,
  };
}

// ------------------------------------------------------------------ motor por escenario ("Calculo aperturas")

/**
 * Un bloque de "Calculo aperturas" (filas r0..r0+19): 16 cohortes + cierres + total + factor + sucursales activas.
 * ctx = { idxAj[12], cie[12], curva[], mesMaduro, etiquetasMes[12], etqPrev:{oct,nov,dic} }
 */
function calcularBloque(esc, ctx) {
  const { idxAj, cie, curva, mesMaduro, etiquetasMes, etqPrev } = ctx;

  // fila r0+18: (1+g)^((m-1)/12)
  const factor = new Array(N_MESES);
  for (let i = 0; i < N_MESES; i++) factor[i] = potencia(1 + esc.g, i / 12);

  // definicion de las 16 cohortes (B = sucursales, C = mes de apertura)
  const defs = [
    { grupo: 'Maduras', suc: esc.ini - COHORTES_EN_ARRANQUE * esc.a0, mes: MES_APERTURA_MADURAS },   // Calculadora!B28
    { grupo: etqPrev.oct, suc: esc.a0, mes: -2 },
    { grupo: etqPrev.nov, suc: esc.a0, mes: -1 },
    { grupo: etqPrev.dic, suc: esc.a0, mes: 0 },
  ];
  for (let j = 1; j <= N_MESES; j++) defs.push({ grupo: etiquetasMes[j - 1], suc: esc.aper[j - 1], mes: j });

  const cohortes = defs.map((d) => {
    const kgMes = new Array(N_MESES);
    for (let i = 0; i < N_MESES; i++) {
      const m = i + 1;
      const n = m - d.mes + 1;                       // "Mes #" desde la apertura (1 = mes de apertura completo)
      if (n >= 1) {
        const k = Math.min(n, mesMaduro);
        let kgSuc;
        if (k === 1) kgSuc = esc.ap1;                          // Mes 1
        else if (k >= mesMaduro) kgSuc = esc.mad;              // Mes 7+
        else kgSuc = curva[k - 2];                             // INDEX(C38:G38, k-1)
        kgMes[i] = nz(d.suc * kgSuc * idxAj[i] * factor[i]);
      } else {
        kgMes[i] = 0;
      }
    }
    return { grupo: d.grupo, sucursales: d.suc, mesApertura: d.mes, kgMes };
  });

  // cierres: -SUM(cierres acumulados) * compraMadura * estacionalidad * crecimiento
  const cumCie = new Array(N_MESES);
  const cumAper = new Array(N_MESES);
  let acC = 0;
  let acA = 0;
  for (let i = 0; i < N_MESES; i++) {
    acC += cie[i];
    acA += esc.aper[i];
    cumCie[i] = acC;
    cumAper[i] = acA;
  }
  const kgCierre = new Array(N_MESES);
  for (let i = 0; i < N_MESES; i++) kgCierre[i] = nz(-cumCie[i] * esc.mad * idxAj[i] * factor[i]);

  // total kg (fila r0+17) = SUM(cohortes + cierres) por mes; NO incluye el ajuste general
  const totalKgMes = new Array(N_MESES);
  for (let i = 0; i < N_MESES; i++) {
    let s = 0;
    for (let k = 0; k < cohortes.length; k++) s += cohortes[k].kgMes[i];
    s += kgCierre[i];
    totalKgMes[i] = s;
  }

  // columnas P (SUM) y Q (SUMPRODUCT(D:O / factor): quita solo el crecimiento, conserva la estacionalidad)
  const colP = (a) => suma(a);
  const colQ = (a) => {
    let s = 0;
    for (let i = 0; i < N_MESES; i++) s += div(a[i], factor[i]);
    return s;
  };
  cohortes.forEach((c) => {
    c.total = colP(c.kgMes);
    c.totalSinCrecimiento = colQ(c.kgMes);
  });
  const cierres = {
    grupo: 'Cierres',
    sucursales: suma(cie),                           // Calculadora!N34
    kgMes: kgCierre,
    total: colP(kgCierre),
    totalSinCrecimiento: colQ(kgCierre),
  };
  // P(total) = SUM(P5:P21) ; Q(total) = SUMPRODUCT(D22:O22/factor)
  let pTot = 0;
  for (let k = 0; k < cohortes.length; k++) pTot += cohortes[k].total;
  pTot += cierres.total;
  const qTot = colQ(totalKgMes);

  // sucursales activas al cierre del mes: ini + SUM(aperturas 1..m) - SUM(cierres 1..m)
  const activas = new Array(N_MESES);
  for (let i = 0; i < N_MESES; i++) activas[i] = esc.ini + cumAper[i] - cumCie[i];

  return {
    cohortes,
    cierres,
    totalKgMes,
    total: pTot,
    totalSinCrecimiento: qTot,
    factorCrecimiento: factor,
    sucursalesActivas: activas,
  };
}

// ------------------------------------------------------------------ funcion principal

function cafeEngine(P) {
  if (!P || typeof P !== 'object') P = {};   // sin entradas: no hay escenario activo -> error 'escenarioActivo no existe'

  // ---- anio / etiquetas
  const anioNum = esVacio(P.anio) ? NaN : Number(P.anio);
  const anio = Number.isFinite(anioNum) ? Math.trunc(anioNum) : 2027;
  const etiquetasMes = MES_CORTO.map((m) => m + '-' + anioCorto(anio));
  const etqPrev = {
    oct: 'Oct-' + anioCorto(anio - 1),
    nov: 'Nov-' + anioCorto(anio - 1),
    dic: 'Dic-' + anioCorto(anio - 1),
  };

  // ---- escenarios (exactamente 3, por posicion) y escenario activo (MATCH exacto, sin distinguir mayusculas)
  // El libro tiene EXACTAMENTE 3 (Pesimista/Base/Optimista = Min/Esperado/Max del Timeline). Si faltan se completan con
  // escenarios en cero; si sobran se calculan tambien (el Timeline solo usa los 3 primeros, por posicion).
  const escIn = Array.isArray(P.escenarios) ? P.escenarios : [];
  const nEsc = Math.max(3, escIn.length);
  const escs = [];
  for (let i = 0; i < nEsc; i++) escs.push(normalizarEscenario(i < escIn.length ? escIn[i] : {}, i));
  const objetivo = typeof P.escenarioActivo === 'string' ? P.escenarioActivo.toLowerCase() : null;
  const iAct = objetivo === null ? -1 : escs.findIndex((e) => e.nombre.toLowerCase() === objetivo);
  if (iAct < 0) throw new Error('escenarioActivo no existe');
  const indiceEscenario = iAct + 1;                  // Calculadora!F19 (1-based)

  // ---- parametros comunes
  const aj = num(P.ajusteGeneral);                   // Calculadora!B24 (fraccion)
  const pctComprometer = num(P.pctComprometer);      // B25
  const compra2026 = num(P.compra2026Kg);            // B44
  const cie = arr12(P.cierresPorMes);                // fila 34
  const curva = arrNum(P.curva2a6);                  // C38:G38 (Mes 2..Mes 6)
  const mesMaduro = curva.length + 2;                // 7 en el libro

  // estacionalidad ajustada: idx / AVERAGE(idx)  (AVERAGE ignora celdas vacias)
  const estCruda = Array.isArray(P.estacionalidad) ? P.estacionalidad.slice(0, N_MESES) : [];
  let sumaEst = 0;
  let cuentaEst = 0;
  for (let i = 0; i < N_MESES; i++) {
    const x = estCruda[i];
    if (!esVacio(x) && Number.isFinite(Number(x))) {
      sumaEst += Number(x);
      cuentaEst += 1;
    }
  }
  const mediaEst = cuentaEst > 0 ? sumaEst / cuentaEst : 0;
  const idxAj = new Array(N_MESES);
  for (let i = 0; i < N_MESES; i++) idxAj[i] = div(num(estCruda[i]), mediaEst);

  // ---- productos
  const prodsIn = Array.isArray(P.productos) ? P.productos : [];
  const prods = prodsIn.map(normalizarProducto);
  const ids = idsUnicos(prodsIn);
  const nP = prods.length;

  // ---- los 3 bloques de "Calculo aperturas"
  const ctx = { idxAj, cie, curva, mesMaduro, etiquetasMes, etqPrev };
  const bloques = escs.map((e) => calcularBloque(e, ctx));
  const bAct = bloques[iAct];
  const eAct = escs[iAct];

  // nombres unicos para las llaves de R.aperturas
  const llaves = [];
  escs.forEach((e) => {
    let k = e.nombre;
    let j = 2;
    while (llaves.includes(k)) k = e.nombre + '#' + j++;
    llaves.push(k);
  });

  // ---- Calculadora!B35:M35 : sucursales activas del escenario activo
  const sucActivas = bAct.sucursalesActivas.slice();

  // ---- Detalle mensual
  // fila 4: kg a comprar = Total kg (Calculo aperturas) * (1 + ajuste)
  const kgComprarMes = bAct.totalKgMes.map((x) => x * (1 + aj));
  const kgComprarTotal = suma(kgComprarMes);

  // Precios (vigentes y nuevos)
  const preciosVig = prods.map((p, i) => {
    const cafe = p.precioKg * p.kgPorBolsa;                     // D = C*B
    const costo = cafe + p.empaque;                             // F = D+E
    return {
      id: ids[i],
      kgPorBolsa: p.kgPorBolsa,
      precioKg: p.precioKg,
      cafeEnBolsa: cafe,
      empaque: p.empaque,
      costoBolsa: costo,
      precioVentaBolsa: p.venta,
      margen: p.venta > 0 ? (p.venta - costo) / p.venta : 0,    // H = IF(G>0,(G-F)/G,0)
    };
  });
  const preciosNue = prods.map((p, i) => {
    const cafe = p.precioKgNuevo * p.kgPorBolsa;                // D15
    const costo = cafe + p.empaqueNuevo;                        // F15
    const ahorroBolsa = preciosVig[i].costoBolsa - costo;       // G15 = F6-F15
    return {
      id: ids[i],
      kgPorBolsa: p.kgPorBolsa,
      precioKgEfectivo: p.precioKgNuevo,
      cafeEnBolsa: cafe,
      empaqueEfectivo: p.empaqueNuevo,
      costoBolsa: costo,
      ahorroBolsa,
      ahorroPct: preciosVig[i].costoBolsa > 0 ? ahorroBolsa / preciosVig[i].costoBolsa : 0,   // H15 = IF(F6>0,G15/F6,0)
    };
  });

  // serie {mes[12], total}
  const serie = (mes, total) => ({ mes, total: total === undefined ? suma(mes) : total });

  const kgPres = prods.map((p) => kgComprarMes.map((x) => x * p.mezcla));            // filas 6-11
  const bolsas = prods.map((p, i) => kgPres[i].map((x) => roundUp0(div(x, p.kgPorBolsa))));   // filas 13-18
  const costoV = prods.map((p, i) => bolsas[i].map((b) => b * preciosVig[i].costoBolsa));     // filas 20-25
  const costoN = prods.map((p, i) => bolsas[i].map((b) => b * preciosNue[i].costoBolsa));     // filas 28-33
  const ventaP = prods.map((p, i) => bolsas[i].map((b) => b * p.venta));                      // filas 38-43

  const totalesPorMes = (m2d) => {                       // SUM(B20:B25) por mes (hacia abajo)
    const out = new Array(N_MESES);
    for (let i = 0; i < N_MESES; i++) {
      let s = 0;
      for (let p = 0; p < nP; p++) s += m2d[p][i];
      out[i] = s;
    }
    return out;
  };
  const costoVTotMes = totalesPorMes(costoV);            // fila 26
  const costoNTotMes = totalesPorMes(costoN);            // fila 34
  const ventaTotMes = totalesPorMes(ventaP);             // fila 44

  const totProd = (m2d) => m2d.map((fila) => suma(fila));     // N de cada fila de producto = SUM(B:M)
  const kgPresTot = totProd(kgPres);
  const bolsasTot = totProd(bolsas);
  const costoVTot = totProd(costoV);
  const costoNTot = totProd(costoN);
  const ventaTot = totProd(ventaP);
  const costoVTotTot = suma(costoVTot);                  // N26 = SUM(N20:N25)
  const costoNTotTot = suma(costoNTot);                  // N34 = SUM(N28:N33)
  const ventaTotTot = suma(ventaTot);                    // N44 = SUM(N38:N43)

  const ahorroMes = costoVTotMes.map((x, i) => x - costoNTotMes[i]);          // fila 36
  const ahorroTot = costoVTotTot - costoNTotTot;                              // N36 = N26-N34
  const margenVMes = ventaTotMes.map((x, i) => x - costoVTotMes[i]);          // fila 46
  const margenNMes = ventaTotMes.map((x, i) => x - costoNTotMes[i]);          // fila 47
  const margenVTot = ventaTotTot - costoVTotTot;                              // N46
  const margenNTot = ventaTotTot - costoNTotTot;                              // N47

  const crecimiento = [null];                                                 // fila 49 (C..M)
  for (let i = 1; i < N_MESES; i++) {
    crecimiento.push(kgComprarMes[i - 1] > 0 ? kgComprarMes[i] / kgComprarMes[i - 1] - 1 : 0);
  }
  const kgPorSucursal = kgComprarMes.map((x, i) => (sucActivas[i] > 0 ? x / sucActivas[i] : 0));   // fila 50

  const mapaPorId = (m2d, tot) => {
    const o = {};
    ids.forEach((id, i) => { o[id] = serie(m2d[i], tot[i]); });
    return o;
  };

  const detalleMensual = {
    etiquetasMes: etiquetasMes.slice(),
    kgComprar: serie(kgComprarMes, kgComprarTotal),
    kgPorPresentacion: mapaPorId(kgPres, kgPresTot),
    bolsas: mapaPorId(bolsas, bolsasTot),
    costoVigente: mapaPorId(costoV, costoVTot),
    costoVigenteTotal: serie(costoVTotMes, costoVTotTot),
    costoNuevo: mapaPorId(costoN, costoNTot),
    costoNuevoTotal: serie(costoNTotMes, costoNTotTot),
    ahorro: serie(ahorroMes, ahorroTot),
    ventas: mapaPorId(ventaP, ventaTot),
    ventasTotal: serie(ventaTotMes, ventaTotTot),
    margenBrutoVigente: serie(margenVMes, margenVTot),
    margenBrutoNuevo: serie(margenNMes, margenNTot),
    crecimientoVsMesAnterior: crecimiento,
    kgPorSucursal,
    sucursalesActivas: sucActivas.slice(),
  };

  // ---- Comparativa
  const porPresentacion = ids.map((id, i) => {
    const d = costoVTot[i];
    const e = costoNTot[i];
    const f = d - e;
    return { id, bolsas: bolsasTot[i], kg: kgPresTot[i], costoVigente: d, costoNuevo: e, ahorro: f, ahorroPct: d > 0 ? f / d : 0 };
  });
  const cmpTot = {
    bolsas: suma(porPresentacion.map((x) => x.bolsas)),
    kg: suma(porPresentacion.map((x) => x.kg)),
    costoVigente: suma(porPresentacion.map((x) => x.costoVigente)),
    costoNuevo: suma(porPresentacion.map((x) => x.costoNuevo)),
    ahorro: suma(porPresentacion.map((x) => x.ahorro)),
  };
  cmpTot.ahorroPct = cmpTot.costoVigente > 0 ? cmpTot.ahorro / cmpTot.costoVigente : 0;

  const ventaV = ventaTotTot;            // D13 = N44
  const ventaN = ventaTotTot;            // E13 = N44
  const costoCV = cmpTot.costoVigente;   // D14 = D10
  const costoCN = cmpTot.costoNuevo;     // E14 = E10
  const margV = ventaV - costoCV;        // D15
  const margN = ventaN - costoCN;        // E15
  const pctV = ventaV > 0 ? margV / ventaV : 0;   // D16
  const pctN = ventaN > 0 ? margN / ventaN : 0;   // E16
  const margenBruto = {
    ventaSucursales: { vigente: ventaV, nuevo: ventaN, diferencia: ventaN - ventaV },
    costoCompra: { vigente: costoCV, nuevo: costoCN, diferencia: costoCN - costoCV },
    margenBruto: { vigente: margV, nuevo: margN, diferencia: margN - margV },
    margenPct: { vigente: pctV, nuevo: pctN, diferencia: pctN - pctV },
  };

  let acumulado = 0;
  const mensual = etiquetasMes.map((etiqueta, i) => {
    const cv = costoVTotMes[i];
    const cn = costoNTotMes[i];
    const a = cv - cn;
    acumulado += a;                       // E = SUM($D$19:D19)
    return { etiqueta, costoVigente: cv, costoNuevo: cn, ahorro: a, ahorroAcumulado: acumulado };
  });
  const mensualTotal = {
    costoVigente: suma(mensual.map((x) => x.costoVigente)),
    costoNuevo: suma(mensual.map((x) => x.costoNuevo)),
    ahorro: suma(mensual.map((x) => x.ahorro)),
  };

  // ---- Calculadora: RESULTADO 2027 (B4:C16)
  const resumen = {
    escenarioActivo: P.escenarioActivo,
    sucursalesCierre: sucActivas[N_MESES - 1],                                  // B5 = M35
    kgComprar: kgComprarTotal,                                                  // B6 = N4
    crecimientoVs2026: compra2026 > 0 ? kgComprarTotal / compra2026 - 1 : 0,    // B7
    promedioMensualKg: kgComprarTotal / 12,                                     // B8
    mesMasAltoKg: Math.max.apply(null, kgComprarMes),                           // B9
    kgPromedioSucursalMes: suma(kgPorSucursal) / N_MESES,                       // B10 = AVERAGE(B50:M50)
    volumenComprometerKg: kgComprarTotal * pctComprometer,                      // B11
    costoVigente: costoVTotTot,                                                 // B12
    costoNuevo: costoNTotTot,                                                   // B13
    ahorro: ahorroTot,                                                          // B14
    ahorroPct: costoVTotTot > 0 ? ahorroTot / costoVTotTot : 0,                 // C14
    ventaSucursales: ventaTotTot,                                               // B15
    margenBrutoVigentePct: ventaTotTot > 0 ? margenVTot / ventaTotTot : 0,      // B16
    margenBrutoNuevoPct: ventaTotTot > 0 ? margenNTot / ventaTotTot : 0,        // C16
  };

  // ---- Calculadora: "De donde sale el volumen" (E5:I10), con el bloque del escenario activo
  const sumaQ = (desde, hasta) => {
    let s = 0;
    for (let k = desde; k <= hasta; k++) s += bAct.cohortes[k].totalSinCrecimiento;
    return s;
  };
  const h5 = sumaQ(0, 3);                                   // Maduras + oct/nov/dic del anio previo, sin crecimiento
  const h6 = sumaQ(4, 15);                                  // aperturas de los 12 meses, sin crecimiento
  const h7 = bAct.cierres.totalSinCrecimiento;              // cierres (<= 0), sin crecimiento
  const h8 = restaExcel(bAct.total, bAct.totalSinCrecimiento);   // crecimiento por posicionamiento = P - Q
  const h9 = restaExcel(kgComprarTotal, bAct.total);             // ajuste general en kg = N4 - P
  const h10 = h5 + h6 + h7 + h8 + h9;
  const pct = (x) => (h10 !== 0 ? x / h10 : 0);
  const conceptos = [
    'Sucursales operando al 1-ene',
    'Aperturas ' + anio,
    'Cierres',
    'Crecimiento por posicionamiento',
    'Ajuste general (+/' + MENOS_UNICODE + ')',
  ];
  const kgFilas = [h5, h6, h7, h8, h9];
  const origenVolumen = {
    filas: conceptos.map((concepto, i) => ({ concepto, kg: kgFilas[i], pct: pct(kgFilas[i]) })),
    total: { kg: h10, pct: pct(h10) },
  };

  const calculadora = {
    resumen,
    origenVolumen,
    sucursalesActivasCierreMes: sucActivas.slice(),
    parametrosActivos: {
      crecimientoAnual: eAct.g,
      compraMadura: eAct.mad,
      compraMesApertura: eAct.ap1,
      sucursalesInicio: eAct.ini,
      aperturasOctDic2026: eAct.a0,
      sucursalesMaduras: eAct.ini - COHORTES_EN_ARRANQUE * eAct.a0,
    },
    sucursalesMadurasPorEscenario: escs.map((e) => e.ini - COHORTES_EN_ARRANQUE * e.a0),
    totalAperturasPorEscenario: escs.map((e) => suma(e.aper)),
    totalCierres: suma(cie),
    curvaCompraPorSucursal: [eAct.ap1].concat(curva, [eAct.mad]),
    indiceEstacionalAjustado: idxAj.slice(),
    mezclaTotalPct: suma(prods.map((p) => p.mezcla)),
    indiceEscenario,
  };

  // ---- aperturas por escenario
  const aperturas = {};
  bloques.forEach((b, i) => { aperturas[llaves[i]] = b; });

  // ---- precios
  const precios = { vigentes: preciosVig, nuevos: preciosNue };

  // ---- Timeline 2027: Min / Esperado / Max por color y mes (mapeo POSICIONAL de escenarios 0 / 1 / 2)
  const nombresGrupos = COLORES_DEFECTO.slice();
  prods.forEach((p) => { if (!nombresGrupos.includes(p.colorGrupo)) nombresGrupos.push(p.colorGrupo); });
  const variantes = ['min', 'esperado', 'max'];
  const grupos = {};
  nombresGrupos.forEach((g) => {
    // (mezcla 1 kg + mezcla 250 g) del color: suma en el orden de los productos
    let share = 0;
    prods.forEach((p) => { if (p.colorGrupo === g) share += p.mezcla; });
    const o = {};
    variantes.forEach((v, s) => {
      const mes = bloques[s].totalKgMes.map((x) => x * (1 + aj) * share);
      o[v] = serie(mes);
    });
    grupos[g] = o;
  });
  const totalTl = {};
  variantes.forEach((v) => {
    const mes = new Array(N_MESES);
    for (let i = 0; i < N_MESES; i++) {
      let s = 0;
      for (let k = 0; k < nombresGrupos.length; k++) s += grupos[nombresGrupos[k]][v].mes[i];
      mes[i] = s;
    }
    totalTl[v] = serie(mes);
  });
  const timeline = {
    nombresMes: MES_LARGO.slice(),
    grupos,
    total: totalTl,
    sucursalesCierreMes: {
      min: bloques[0].sucursalesActivas.slice(),
      esperado: bloques[1].sucursalesActivas.slice(),
      max: bloques[2].sucursalesActivas.slice(),
    },
    totalEsperadoKg: totalTl.esperado.total,
    rangoTexto: fmt0(totalTl.min.total) + ' ' + EN_DASH + ' ' + fmt0(totalTl.max.total) + ' kg',
  };

  return limpiar({
    etiquetasMes,
    indiceEscenario,
    calculadora,
    aperturas,
    detalleMensual,
    precios,
    comparativa: { porPresentacion, total: cmpTot, margenBruto, mensual, mensualTotal },
    timeline,
  });
}

export { cafeEngine, roundUp0, fmt0, num, esVacio, calcularBloque };
