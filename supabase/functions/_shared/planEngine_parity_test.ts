// deno-lint-ignore-file no-explicit-any
// Paridad con la app: extrae del app/index.html el código del motor del Plan (_planEng*, _planCfgDef/_planCfgNormalizar,
// _planDatTipo/_planDatAMotor), lo evalúa aislado y comprueba que planEngine.ts da EXACTAMENTE lo mismo.
import { assert, assertEquals } from "@std/assert";
import { CORP_EMAILS, demandaPlan, mergeCfg, planCfgDef, serieDiaria } from "./planEngine.ts";

// En el portal no está el HTML viejo: COM_APP_VIEJA apunta a su app/index.html (p. ej. git show a9e4a22:app/index.html).
// Sin ella, estas pruebas se omiten (ignore) en vez de fallar.
const RUTA_APP = Deno.env.get("COM_APP_VIEJA");
const SIN_APP = !RUTA_APP;
const APP = RUTA_APP ? await Deno.readTextFile(RUTA_APP) : "";

/** Código fuente de una declaración top-level de la app (function / var / const) por nombre, con balanceo de llaves. */
function fuente(nombre: string): string {
  const re = new RegExp(`(?:^|\\n)((?:async )?function ${nombre}\\(|(?:var|const) ${nombre}\\s*=)`);
  const m = re.exec(APP);
  if (!m) throw new Error("No encontré " + nombre + " en app/index.html");
  const ini = m.index + m[0].indexOf(m[1]);
  const esFn = m[1].includes("function");
  let depth = 0, vioCuerpo = false;
  for (let i = ini; i < APP.length; i++) {
    const c = APP[i];
    if (c === "'" || c === '"' || c === "`") { // salta cadenas
      for (i++; i < APP.length && APP[i] !== c; i++) if (APP[i] === "\\") i++;
      continue;
    }
    if (c === "/" && APP[i + 1] === "/") { while (APP[i] !== "\n") i++; continue; }
    if (c === "/" && APP[i + 1] === "*") { i = APP.indexOf("*/", i) + 1; continue; }
    if (c === "{" || c === "(" || c === "[") { depth++; if (c === "{") vioCuerpo = true; }
    else if (c === "}" || c === ")" || c === "]") {
      depth--;
      if (esFn && depth === 0 && c === "}" && vioCuerpo) return APP.slice(ini, i + 1);
    } else if (!esFn && depth === 0 && c === ";") return APP.slice(ini, i + 1);
  }
  throw new Error("Declaración sin cierre: " + nombre);
}

// Fecha con la hora local de Ciudad de México (UTC−6 fijo desde 2022) para que la app se evalúe como en el navegador del
// equipo, sin depender de la zona de la máquina que corre las pruebas.
const OFF = 6 * 3600e3;
function claseFecha(ahora: number) {
  return class DateCdmx extends Date {
    constructor(...a: any[]) {
      if (a.length === 0) super(ahora);
      else if (a.length === 1) super(a[0] instanceof Date ? a[0].getTime() : a[0]);
      else super(Date.UTC(a[0], a[1], a[2] ?? 1, a[3] ?? 0, a[4] ?? 0, a[5] ?? 0, a[6] ?? 0) + OFF);
    }
    private l() { return new Date(this.getTime() - OFF); }
    override getFullYear() { return this.l().getUTCFullYear(); }
    override getMonth() { return this.l().getUTCMonth(); }
    override getDate() { return this.l().getUTCDate(); }
    override getHours() { return this.l().getUTCHours(); }
    override setHours(h: number, m = 0, s = 0, ms = 0) {
      const l = this.l(); l.setUTCHours(h, m, s, ms); return this.setTime(l.getTime() + OFF);
    }
  };
}

const NOMBRES = [
  "_PLAN_ENG_Z", "_planEngDia", "_planEngDifDias", "_planEngCeil", "_planEngMediana", "_planEngPercentil", "_planEngMAD",
  "_planEngCoincide", "_planEngMasEspecifico", "_planEngN", "_planEngValido", "_planEngFactor", "_planEngTasaBase",
  "_planEngNumDef", "_PLAN_ENG_BLOQ", "_planEngSku",
  "_planCfgDef", "_PLAN_CFG_RANGOS", "_PLAN_CFG_OPC", "_PLAN_RE_CORREO", "_planCorreosNorm", "_PLAN_SERVICIOS", "_PLAN_TIPOS_DEM",
  "_planCfgNum", "_planCfgNormalizar",
  "today", "_planIso", "_planParseItems", "parseLocalDate", "daysUntil", "_CORP_EMAILS", "_PLAN_AP_FUERA", "_PLAN_RE_NOTA_APERTURA",
  "_planDatTipo", "_planDatAMotor",
];
const STUBS = `

function _impCfgDef(){return null;} function _cafeCfgDef(){return null;} function _kpiAbCfgNorm(x){return x==null?null:x;}
function _impCfgNorm(x){return x==null?null:x;} function _cafeCfgNorm(x){return x==null?null:x;} function _zohoOcNorm(x){return x==null?null:x;}
function _comSaldoCedis(c){return 0;} function _planOcDeZoho(){return false;} function _zocBorradorSet(){return null;}
function _planOcFuente(){return [];} function _zocKey(x){return x;}
`;
/** La app evaluada aislada con "ahora" = hoy a las 10:00 de CDMX. */
function app(hoy: string): any {
  const ahora = Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10), 10) + OFF;
  const src = STUBS + NOMBRES.map(fuente).join("\n") + "\nreturn{" + NOMBRES.map((n) => n + ":" + n).join(",") + "};";
  return new Function("Date", src)(claseFecha(ahora));
}

const HOY = "2026-11-02";
const A = SIN_APP ? null : app(HOY);
const cerca = (a: number, b: number, msg: string) => assert(Math.abs(a - b) <= 1e-9, `${msg}: app ${a} ≠ servidor ${b}`);

// Generador determinista
function rng(seed: number) { return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }; }

/** Serie de 120 días con forma variada por SKU. */
function serie(tipo: string, seed: number): number[] {
  const r = rng(seed), u: number[] = [];
  for (let k = 0; k < 120; k++) {
    let x = 0;
    if (tipo === "regular") x = Math.round(5 + r() * 10);
    else if (tipo === "picos") x = Math.round(r() * 4) + (k % 7 === 3 && k < 30 ? 120 : 0) + (k === 1 ? 300 : 0);
    else if (tipo === "esporadico") x = r() < 0.15 ? Math.round(r() * 40) : 0;
    else if (tipo === "cero") x = 0;
    else if (tipo === "nuevo") x = k < 9 ? Math.round(3 + r() * 6) : 0;
    u.push(x);
  }
  return u;
}

const SKUS = [
  { sku: "INS-VAS-001", u: serie("regular", 1), vida: 400 },
  { sku: "INS-VAS-002-B", u: serie("picos", 2), vida: 400 },
  { sku: "ALI-JAR-003", u: serie("esporadico", 3), vida: 400 },
  { sku: "ALI-JAR-004", u: serie("cero", 4), vida: 400 },
  { sku: "INS-NUE-005", u: serie("nuevo", 5), vida: 9 },
  { sku: "INS-NUE-006", u: serie("nuevo", 6), vida: 0 },
  { sku: "EMP-TAP-007", u: serie("regular", 7), vida: null },
];

const CFGS: Record<string, any> = {
  produccion: { consumo: { metodo: "promedio", ventana: 30, crecimiento: 0, divisor: "vida", items: "editados",
    tipos: { apertura: true, resurtido: true, sin_vincular: true } }, seg: { dias: 10, metodo: "dias" } },
  mediana56: { consumo: { metodo: "mediana", ventana: 56 } },
  percentil84: { consumo: { metodo: "percentil", ventana: 84, pctl: 80, divisor: "vida" } },
  ponderado42: { consumo: { metodo: "ponderado", ventana: 42, alinear: true } },
  recortar: { consumo: { metodo: "promedio", ventana: 56 }, picos: { manejo: "recortar", z: 2, ratio: 1.2, min_uds: 1 } },
  incluir: { consumo: { metodo: "promedio", ventana: 56 }, picos: { manejo: "incluir" } },
  temporada_crec: { consumo: { ventana: 30, crecimiento: 5, divisor: "vida" },
    temp: { activa: true, mes: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1.2, 1.5, 2], prefijo: { "ins-vas": [2, 2, 2, 2, 2, 2, 2, 2, 2, 0.5, 0.8, 3] } },
    eventos: [{ id: "bf", ini: "2026-11-10", fin: "2026-11-20", factor: 1.8, alcance: "prefijo", valores: ["ALI"] },
      { id: "p", ini: "2026-10-01", fin: "2026-10-15", factor: 0.5, alcance: "todos" },
      { id: "s", ini: "2026-11-01", fin: "2026-12-31", factor: 3, alcance: "sku", valores: ["EMP-TAP-007"], activo: false }] },
  basura: { consumo: { ventana: "999", metodo: "otro", crecimiento: -3, tipos: { marketing: "si" } }, picos: { z: null }, seg: { prefijo: { "ins": 4 } },
    eventos: [{ ini: "2026-12-01", fin: "2026-11-01", factor: 2 }, { ini: "2026-11-01", fin: "2026-11-30", factor: 50, alcance: "x" }] },
};

Deno.test({ name: "paridad: configuración por defecto y normalización (mergeCfg = _planCfgNormalizar)", ignore: SIN_APP }, () => {
  const sinExtras = (c: any) => { const o = { ...c }; delete o.imp; delete o.cafe; delete o.zoho_oc; delete o.kpi; return o; };
  assertEquals(sinExtras(planCfgDef()), sinExtras(A._planCfgDef()));
  for (const [n, c] of Object.entries(CFGS)) assertEquals(sinExtras(mergeCfg(c)), sinExtras(A._planCfgNormalizar(c)), n);
  assertEquals(sinExtras(mergeCfg(null)), sinExtras(A._planCfgNormalizar(null)));
  assertEquals(CORP_EMAILS, A._CORP_EMAILS);
});

Deno.test({ name: "paridad: tasa y demanda D(h) = demandaH de _planEngSku", ignore: SIN_APP }, () => {
  let casos = 0;
  for (const [n, c0] of Object.entries(CFGS)) {
    const cfg = A._planCfgNormalizar(c0);
    for (const hist of [120, 20, 5]) {
      for (const s of SKUS) {
        for (const [lt, dias] of [[7, 10], [9, 25], [45, 10], [1, 0]]) {
          const s0 = { sku: s.sku, u: s.u, vida: s.vida, lt, diasSeg: dias };
          const e = A._planEngSku(cfg, { hoy: HOY, hist, skus: [s0] }, s0, { con: [], sinSuma: 0, n: 0 });
          const r = demandaPlan(mergeCfg(c0), s.sku, s.u, hist, HOY, s.vida, e.H);
          const tag = `${n} hist=${hist} ${s.sku} H=${e.H}`;
          cerca(e.tasa, r.tasa, tag + " tasa");
          cerca(e.demandaH, r.D, tag + " D");
          casos++;
        }
      }
    }
  }
  assert(casos >= 600);
});

Deno.test({ name: "paridad: los métodos sí se ejercitan (no todo cae en promedio)", ignore: SIN_APP }, () => {
  const vistos = new Set<string>();
  for (const c0 of Object.values(CFGS)) {
    const cfg = A._planCfgNormalizar(c0);
    for (const s of SKUS) {
      const s0 = { sku: s.sku, u: s.u, vida: s.vida, lt: 7, diasSeg: 10 };
      vistos.add(A._planEngSku(cfg, { hoy: HOY, hist: 120, skus: [s0] }, s0, { con: [], sinSuma: 0 }).metodo_efectivo);
    }
  }
  assertEquals([...vistos].sort(), ["mediana", "percentil", "ponderado", "promedio", "promedio_recortado"]);
});

// ── Serie diaria: _planDatAMotor de la app vs serieDiaria ──────────────────────────────────────────────────────────
const CAT = [
  { sku: "INS-VAS-001", created_at: "2024-01-10T15:00:00+00:00", estatus: "Compra Recurrente" },
  { sku: "ALI-JAR-003", created_at: "2026-10-20T05:59:00+00:00", estatus: "Compra Recurrente" },  // 19-oct 23:59 CDMX
  { sku: "INS-NUE-005", created_at: "2026-10-31T18:00:00+00:00", estatus: "Compra Recurrente" },
  { sku: "EMP-TAP-007", created_at: null, estatus: "Compra Recurrente" },
];
const MAPA = [{ shopify_nombre: "Vaso 12oz", sku: "ins-vas-001 " }, { shopify_nombre: "Mermelada", sku: "ALI-JAR-003" },
  { shopify_nombre: "Tapa", sku: "EMP-TAP-007" }, { shopify_nombre: "Fantasma", sku: "NO-EXISTE" }];
const APERTURAS = [
  { id: "ap1", estatus: "en_proceso", fecha: "2026-10-25" },      // aún abriendo: sus pedidos son kit hasta 45 días
  { id: "ap2", estatus: "activa", fecha: "2026-09-01" },          // operando
  { id: "ap3", estatus: null, fecha: null },                      // sin fecha → en proceso
  { id: "ap4", estatus: "activa", fecha: "2026-10-28" },          // operando, pero pedido dentro de la gracia
  { id: "ap5", estatus: "activa", fecha: "2026-10-15" },
  { id: "ap6", estatus: "por_abrir", fecha: "2026-09-10" },       // cualquier estatus fuera de la lista → en proceso
];

function pedidos(): any[] {
  const r = rng(99), out: any[] = [];
  const nombres = ["Vaso 12oz", "Mermelada", "Tapa", "Fantasma", "Sin mapeo", "vaso 12oz"];
  for (let i = 0; i < 400; i++) {
    const dias = Math.floor(r() * 75) - 2;                         // incluye 2 días a futuro
    const hora = Math.floor(r() * 24), min = Math.floor(r() * 60);
    const t = Date.UTC(2026, 10, 2, 0, 0) - dias * 864e5 + hora * 3600e3 + min * 60e3;
    const nl = 1 + Math.floor(r() * 3), items: any[] = [];
    for (let j = 0; j < nl; j++) {
      const nom = nombres[Math.floor(r() * nombres.length)];
      const conSku = r() < 0.3 ? { sku: r() < 0.5 ? "INS-VAS-001" : "ins-nue-005" } : {};
      const q = r() < 0.05 ? (r() < 0.5 ? -2 : "x") : r() < 0.05 ? null : Math.round(r() * 20);
      items.push({ nombre: nom, cantidad: q, ...conSku });
    }
    const v = r();
    const ed = v < 0.15 ? items.map((x) => ({ nombre: x.nombre, cantidad: 1 })) : v < 0.2 ? [] : v < 0.25 ? JSON.stringify(items.slice(0, 1)) : null;
    const apSel = r();
    out.push({
      id: "p" + i, fecha_pedido: new Date(t).toISOString(),
      status: r() < 0.05 ? "cancelado" : r() < 0.05 ? "cancelacion_pendiente" : "enviado",
      apertura_id: apSel < 0.3 ? null : apSel < 0.35 ? "000" : apSel < 0.5 ? "ap1" : apSel < 0.6 ? "ap2" : apSel < 0.65 ? "ap3" : apSel < 0.75 ? "ap4" : "ap-x",
      franquiciatario_email: r() < 0.05 ? " WorkAt@mx.thecoffee.jp" : r() < 0.05 ? "marketingtc@mx.thecoffee.jp" : "f@x.com",
      notas_shopify: r() < 0.04 ? "Pedido de APERTURA sucursal" : null,
      es_llenado_canal: r() < 0.03, marketing_proyecto_id: r() < 0.03 ? "m1" : null,
      items: r() < 0.5 ? items : JSON.stringify(items), items_editados: ed,
    });
  }
  // Pedidos cada 3 h alrededor de los cortes de gracia (ap5: fecha + gracia + 1) y de vencida_max (ap6: en proceso).
  const borde = (ap: string, desde: number) => {
    for (let h = 0; h < 4 * 24; h += 3) {
      out.push({ id: `b-${ap}-${h}`, fecha_pedido: new Date(desde + h * 3600e3).toISOString(), status: "enviado", apertura_id: ap,
        franquiciatario_email: "f@x.com", items: [{ sku: "INS-VAS-001", cantidad: 1 }], items_editados: null });
    }
  };
  borde("ap5", Date.UTC(2026, 9, 21, 6));   // ap5 abrió 15-oct: corte (gracia 7) el 23-oct 00:00 CDMX
  borde("ap6", Date.UTC(2026, 9, 24, 6));   // ap6 en proceso desde 10-sep: corte (vencida_max 45) el 26-oct 00:00 CDMX
  return out;
}

Deno.test({ name: "paridad: serie diaria, vida e historia = _planDatAMotor (apertura siempre fuera)", ignore: SIN_APP }, () => {
  const ped = pedidos();
  const pedAper = ["p3", "p10", "p11", "p50"];
  for (const [n, c0] of Object.entries(CFGS)) {
    for (const items of ["editados", "originales"]) {
      for (const primer of [null, "2026-10-05T03:00:00+00:00", "2020-01-01T12:00:00+00:00"]) {
        const cfgApp = A._planCfgNormalizar({ ...c0, consumo: { ...(c0.consumo ?? {}), items } });
        cfgApp.consumo.tipos.apertura = false; // el servidor nunca cuenta aperturas
        const cfgSrv = mergeCfg({ ...c0, consumo: { ...(c0.consumo ?? {}), items, tipos: { ...(c0.consumo?.tipos ?? {}), apertura: true } } });
        const hist = cfgApp.consumo.ventana;
        // historia real como la calcula _planDatCargar (no es una función aparte en la app: misma fórmula)
        let histReal = hist;
        if (primer) {
          const D = claseFecha(Date.UTC(2026, 10, 2, 16));
          const fp = new D(primer), hoy = A.today();
          histReal = Math.max(1, Math.round((hoy.getTime() - new D(fp.getFullYear(), fp.getMonth(), fp.getDate()).getTime()) / 864e5) + 1);
        }
        const R = { hist, hoy: A.today(), histReal, cat: CAT, pedidos: ped.filter((p) => p.status !== "cancelado" && p.status !== "cancelacion_pendiente"),
          lt: [], map: MAPA, comp: [], oc: [], kit: {}, pedAper: pedAper.map((id) => ({ pedido_id: id })),
          aperturas: APERTURAS.map((a) => ({ ...a, estatus: A._PLAN_AP_FUERA[a.estatus as string] ? a.estatus : "en_proceso" })) };
        const conv = A._planDatAMotor(R, cfgApp);
        const s = serieDiaria({ cfg: cfgSrv, hoy: HOY, hist, primerPedido: primer, pedidos: ped, catalogo: CAT, mapa: MAPA,
          pedidosApertura: pedAper, aperturas: APERTURAS });
        const tag = `${n}/${items}/${primer}`;
        assertEquals(s.hist, conv.raw.hist, tag + " hist");
        assertEquals(s.sinMapa, conv.meta.sinMapear, tag + " sinMapa");
        for (const sk of conv.raw.skus) {
          assertEquals(s.vida[sk.sku], sk.vida, tag + " vida " + sk.sku);
          assertEquals(s.u[sk.sku] ?? new Array(hist).fill(0), sk.u, tag + " u " + sk.sku);
          const app = A._planEngSku(cfgApp, conv.raw, { ...sk, lt: 7, diasSeg: 10 }, { con: [], sinSuma: 0 });
          const srv = demandaPlan(cfgSrv, sk.sku, s.u[sk.sku] ?? [], s.hist, HOY, s.vida[sk.sku], app.H);
          cerca(app.demandaH, srv.D, tag + " D " + sk.sku);
        }
      }
    }
  }
});

Deno.test({ name: "paridad: la serie sí distingue tipos, ventana y días locales (fixture a mano)", ignore: SIN_APP }, () => {
  const cfg = mergeCfg(CFGS.produccion);
  const p = (id: string, f: string, extra: any = {}) => ({ id, fecha_pedido: f, status: "enviado", apertura_id: "ap2",
    items: [{ sku: "INS-VAS-001", cantidad: 1 }], items_editados: null, ...extra });
  const s = serieDiaria({ cfg, hoy: HOY, hist: 30, primerPedido: null, catalogo: CAT, mapa: MAPA, aperturas: APERTURAS,
    pedidosApertura: ["k"], pedidos: [
      p("a", "2026-11-02T05:30:00Z"),                       // 1-nov 23:30 CDMX → k=1
      p("b", "2026-11-02T06:30:00Z"),                       // 2-nov 00:30 CDMX → k=0
      p("k", "2026-11-01T12:00:00Z"),                       // ligado a apertura: fuera aunque tipos.apertura=true
      p("n", "2026-11-01T12:00:00Z", { notas_shopify: "kit de apertura" }),
      p("c", "2026-10-03T12:00:00Z"),                       // k=30 → fuera de la ventana
      p("e", "2026-10-31T12:00:00Z", { items_editados: [] }), // editados vacío pero presente: 0 piezas, como la app
      p("x", "2026-10-31T12:00:00Z", { status: "cancelado" }),
    ] });
  const u = s.u["INS-VAS-001"];
  assertEquals(u.slice(0, 3), [1, 1, 0]);
  assertEquals(u.reduce((a, b) => a + b, 0), 2);
  assertEquals(s.vida["INS-NUE-005"], 2);                    // 2-nov 00:00 − 31-oct 12:00 CDMX = 1.5 días → round = 2
  assertEquals(s.vida["EMP-TAP-007"], null);
});
