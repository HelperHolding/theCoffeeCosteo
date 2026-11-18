// deno-lint-ignore-file no-explicit-any
// Paridad de la configuración de Importaciones y Café: _impCfgDef/_impCfgNorm, _cafeCfgDef/_cafeCfgNorm y _impCafeEtq
// de la app contra impCafeCfg.ts, con secciones completas, vacías y con basura.
import { assert, assertEquals } from "@std/assert";
import { cafeCfgDef, cafeCfgNorm, impCafeEtq, impCfgDef, impCfgNorm, impMesTxt } from "./impCafeCfg.ts";
import { app, SIN_APP } from "./pruebas/appVieja.ts";
import { NOMBRES_IMP_CFG } from "./pruebas/fixturesImp.ts";

const A = SIN_APP ? null : app(NOMBRES_IMP_CFG, "var _planCfgDraft=null;", "2026-11-13");

const IMPS: any[] = [
  null, undefined, "x", 7, [], {},
  { escenario: "Manual", escenarios: { Base: { crec: "0.2", cumpl: 9, ajuste: null }, Raro: { crec: 1 }, Optimista: "no" } },
  { red: { suc_hoy_modo: "manual", suc_hoy: "120.6", meses_pipeline: 99, plan_def: -3, plan: { "2027-01": "12", "2027-13": 4, "1999-01": 2, "2027-02": "", "2027-03": null }, cierres: [1, 2] } },
  { politica: { meses_cobertura: 0, meses_respaldo: "2.5", dias_margen: "x", dias_juntar: 999 } },
  { prov: [{ clave: "Green.Packaging  ", nombre: "", lead: 0, cierres: 500, contenedor: false }, { clave: "green packaging" }, null, { clave: "", nombre: "sin clave" },
    { clave: "Otro", nombre: "Otro\u0007 proveedor", lead: "60", nota: "n".repeat(300), contenedor: true }] },
  { prov: Array.from({ length: 20 }, (_, i) => ({ clave: "P" + i, lead: i * 30 })) },
  { prov: [] },
  { contenedor: { tipo: "20' DV", cbm40: 0, cbm45: "500", llenado: 0.01, por_embarque: 2.4, dias_respaldo: -1 }, puente: { dias_colchon: "", multiplo: 0 } },
  { temporada: { "Vaso.frío": [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 20], Corta: [1, 2], "": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] } },
  { temporada: { General: Array(12).fill("x") } },
  { fuentes: { venta: "plataforma", kit: "otro" }, venta_ventana: 10, corregir_hoja: false, prorratear_mes1: "no" },
  { items: { "INS-DES-021": { venta: "0.9", activo: false, camino_qty: 50, camino_fecha: "2026-12-01" }, "SKU.CON.PUNTOS": { nombre: "Con puntos", familia: "Fam.X", prov: "P.1", empaque: 0 },
    "INS-DES-002": "no", "NUEVO-1": { camino_fecha: "2026-13-45", cbm: 500, costo: -1 } }, orden: ["NUEVO-1", "INS-DES-021", "NO-EXISTE"] },
  { items: Object.fromEntries(Array.from({ length: 320 }, (_, i) => ["SKU-" + i, { venta: i }])) },
];
const CAFES: any[] = [
  null, "x", {},
  { anio: "2031.6", escenario: "Manual", q4_modo: "manual", ajuste: 5, comprometer: -1, compra_ant: "abc" },
  { escenarios: { Base: { crec: 2, madura: "40", apertura: null, ini: 3000.7, a0: "x", aper: [1, 2, "3", null] }, Pesimista: 4 } },
  { cierres: [1, 2, 3], curva: ["40", 41], estacionalidad: Array(12).fill(20) },
  { prod: { white_1kg: { mezcla: 2, precio: "300", empaque: null, venta: "", nuevo_precio: "", nuevo_empaque: 9 }, raro: { mezcla: 1 }, black_250g: "no" } },
];

Deno.test({ name: "paridad: impCfgDef/impCfgNorm = _impCfgDef/_impCfgNorm (también con basura)", ignore: SIN_APP }, () => {
  assertEquals(impCfgDef(), A._impCfgDef());
  for (const x of IMPS) assertEquals(impCfgNorm(x), A._impCfgNorm(x), JSON.stringify(x)?.slice(0, 120));
});

Deno.test({ name: "paridad: cafeCfgDef/cafeCfgNorm = _cafeCfgDef/_cafeCfgNorm", ignore: SIN_APP }, () => {
  assertEquals(cafeCfgDef(), A._cafeCfgDef());
  for (const x of CAFES) assertEquals(cafeCfgNorm(x), A._cafeCfgNorm(x), JSON.stringify(x));
});

Deno.test({ name: "paridad: impCafeEtq = _impCafeEtq (el proveedor se nombra con la sección imp)", ignore: SIN_APP }, () => {
  const imp = impCfgNorm({});
  const claves = ["imp.escenario", "imp.items.INS-DES-021.venta", "imp.items.X", "imp.escenarios.Base.crec", "imp.red.plan.2027-03",
    "imp.red.cierres.2026-12", "imp.temporada.Termos.11", "imp.temporada.Termos", "imp.prov.0.lead", "imp.prov.9.nota", "imp.orden.3",
    "imp.otra", "cafe.anio", "cafe.escenarios.Base.aper.4", "cafe.escenarios.Optimista.madura", "cafe.cierres.0", "cafe.curva.2",
    "cafe.estacionalidad.11", "cafe.prod.white_250g.venta", "cafe.prod.zzz.precio", "cafe.otra"];
  const B = app(NOMBRES_IMP_CFG, "var _planCfgDraft={imp:" + JSON.stringify(imp) + "};", "2026-11-13");
  for (const k of claves) assertEquals(impCafeEtq(k, imp), B._impCafeEtq(k), k);
});

Deno.test("impCfgNorm: SKU con puntos y orden con claves repetidas; máximo 300 artículos y 12 proveedores", () => {
  const c = impCfgNorm(IMPS[16]);
  assertEquals(c.orden.slice(0, 2), ["NUEVO-1", "INS-DES-021"]);
  assert(c.items["SKU CON PUNTOS"] && c.items["SKU CON PUNTOS"].familia === "Fam X");
  assertEquals(c.items["NUEVO-1"].camino_fecha, "");
  assertEquals(impCfgNorm(IMPS[17]).orden.length, 300);
  assertEquals(impCfgNorm(IMPS[10]).prov.length, 12);
  assertEquals(impCfgNorm(IMPS[11]).prov.length, 4); // lista vacía: se quedan los de la hoja
  assertEquals(impMesTxt("2027-01"), "Ene 27");
  assertEquals(impMesTxt("2027-13"), "2027-13");
});
