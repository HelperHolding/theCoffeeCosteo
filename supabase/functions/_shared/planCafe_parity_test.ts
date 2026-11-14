// deno-lint-ignore-file no-explicit-any
// Paridad de Café: _cafeRed/_cafeArmar/_cafeCorrer y el "Qué pedir" de café (_planBuild solo café con c.provs, como
// _cafeOrdenes sin borrador) de la app contra planCafe.ts y planProv.ts.
import { assert, assertEquals } from "@std/assert";
import { type DatosPlan, normalizarCfgMotor } from "./planDatos.ts";
import { cafeCorrer, cafeKgDe, cafeOrdenes, cafeRed, cfgConCafe, planCantOC, planResumen } from "./planCafe.ts";
import { minVendorDeGrupo, planConsolidar } from "./planProv.ts";
import { app, SIN_APP } from "./pruebas/appVieja.ts";
import { NOMBRES_DATOS } from "./pruebas/fixturesPlan.ts";
import { datosImp, HOY_IMP, NOMBRES_CAFE, NOMBRES_IMP_CFG, STUBS_IMP, ZPROV } from "./pruebas/fixturesImp.ts";

const NOMBRES = [...new Set([...NOMBRES_DATOS, ...NOMBRES_IMP_CFG, ...NOMBRES_CAFE])];
const A = SIN_APP ? null : app(NOMBRES, STUBS_IMP, HOY_IMP);
const g = globalThis as any;
const paraApp = (R: DatosPlan) => ({ ...R, hoy: A.today() });
const sinHist = (provs: any[]) => provs.map(({ hist: _h, ...x }) => x);

const SRV = { ok: true, motivo: null, calc: "2026-11-13T12:30:00Z", pagos: [], sinCosto: ["INS-NUE-777"], sinProveedor: [],
  compras: [{ sku: "INS-CAF-001", fecha_oc: "2026-11-13", cantidad: 30, monto: 14850 }, { sku: "INS-CAF-003", fecha_oc: "2026-11-25", cantidad: 12, monto: 5928 }] };
const CFGS: Record<string, any> = {
  defecto: {},
  avisar: { compra: { min_prov: "avisar" } },
  seguridad: { seg: { dias: 20 }, consumo: { ventana: 60 }, compra: { prox_dias: 14 } },
  bloqueo: { compra: { bloqueo_oc: "nunca" }, inv: { base: "fisico" } },
};

Deno.test({ name: "paridad: cafeOrdenes = _planBuild(R, cfg, {cafe:true}) con provs (local y servidor, con y sin mínimos)", ignore: SIN_APP }, () => {
  let adelantos = 0, n = 0;
  for (const [nom, c0] of Object.entries(CFGS)) {
    for (const srv of [null, SRV]) {
      for (const zprov of [ZPROV, []]) {
        const R = datosImp({ srv: srv as any, zprov });
        const a = A._planBuild(paraApp(R), A._planCfgNormalizar(c0), { cafe: true }), s = cafeOrdenes(R, normalizarCfgMotor(c0));
        const k = `${nom}/${srv ? "srv" : "local"}/${zprov.length ? "min" : "sinmin"}`;
        assertEquals(s.rows, a.rows, k + " rows");
        assertEquals(sinHist(s.provs), sinHist(a.provs), k + " provs");
        assertEquals([s.minManual, s.vendorDe, s.fuenteCant], [a.minManual, a.vendorDe, a.fuenteCant], k + " mínimos");
        assertEquals(planResumen(s), A._planResumen(a), k + " resumen");
        s.rows.forEach((r) => assertEquals(planCantOC(r), A._planCantOC(r)));
        adelantos += s.provs.reduce((t, p) => t + p.adelantados, 0);
        n++;
      }
    }
  }
  assertEquals(n, 16);
  assert(adelantos > 0, "ningún caso consolidó por mínimo");
});

Deno.test({ name: "paridad: cafeCorrer = _cafeCorrer y cafeRed = _cafeRed (año en curso, siguiente y arranque manual)", ignore: SIN_APP }, () => {
  const CAFES: Record<string, any> = {
    defecto: {}, anio_2026: { cafe: { anio: 2026 } }, manual: { cafe: { q4_modo: "manual", escenario: "Optimista" } },
    ajustes: { cafe: { anio: 2028 }, aper: { ajustes: { e6: { fecha: "2027-10-15" }, e1: { incluir: false }, e9: { fecha: "2027-11-30" } } } },
  };
  let carga = 5000;
  for (const [nom, c0] of Object.entries(CAFES)) {
    for (const esc of ["", "Pesimista", "Optimista"]) {
      const R = datosImp();
      g.__R = { ...paraApp(R), cargadoEn: ++carga };
      g.__UI = { esc: "" };
      const cfgA = A._planCfgNormalizar(c0);
      const a = A._cafeCorrer(cfgA, esc || undefined), s = cafeCorrer(R, normalizarCfgMotor(c0), esc);
      assertEquals([s.err, s.esc], [a.err, a.esc], `${nom}/${esc}`);
      assertEquals(s.ent, a.ent, `${nom}/${esc} ent`);
      assertEquals(s.R, a.R, `${nom}/${esc} R`);
      assertEquals(cafeRed(R, cfgConCafe(normalizarCfgMotor(c0))), A._cafeRed(g.__R, cfgA), `${nom} red`);
    }
  }
});

Deno.test({ name: "paridad: cafeKgDe, minVendorDeGrupo y planConsolidar", ignore: SIN_APP }, () => {
  for (const t of ["CAFE TOSTADO (1.5 KG)", "Café 250 gramos", "1 KILOGRAMO", "2,5 kilos", "500 gr", "Sin peso", "", null]) assertEquals(cafeKgDe(t), A._cafeKgDe(t), String(t));
  const zp = [{ vendor_id: 5, nombre: "Uno", minimo_compra: 10 }, { vendor_id: "6", nombre: " dos ", minimo_compra: null }];
  for (const [ids, nom] of [[[5, 6, "6", null], "x"], [[], "DOS"], [[9], "__sin__"], [[""], ""]] as [any[], string][]) {
    assertEquals(minVendorDeGrupo(ids, nom, zp), A._minVendorDeGrupo(ids, nom, zp));
  }
  const filas = () => [{ sku: "B", costo: 10, pedirEsta: 2, pedirProx: 0, diasAlcanza: 3 }, { sku: "A", costo: 10, pedirEsta: 0, pedirProx: 50, diasAlcanza: 9 },
    { sku: "C", costo: 5, pedirEsta: 0, pedirProx: 40, diasAlcanza: null }, { sku: "D", costo: 0, pedirEsta: 0, pedirProx: 9, diasAlcanza: 1 }];
  for (const minimo of [0, 100, 600, 5000]) {
    const a = filas(), s = filas();
    assertEquals(planConsolidar(s, { minimo, modo: "consolidar" }), A._planConsolidar(a, { minimo, modo: "consolidar" }), String(minimo));
    assertEquals(s, a);
  }
});

Deno.test("cafeOrdenes: solo café tostado (por nombre o INS-CAF-), con el mínimo del proveedor y sin tocar el plan local", () => {
  const c = cafeOrdenes(datosImp({ zprov: ZPROV }), normalizarCfgMotor({}));
  assertEquals(c.rows.map((r) => r.sku).sort(), ["INS-CAF-001", "INS-CAF-002", "INS-CAF-003", "INS-NUE-777"]);
  assertEquals(c.soloCafe, true);
  assertEquals(c.minManual[c.rows.find((r) => r.sku === "INS-CAF-001").provKey], 40000);
  assert(c.provs.every((p) => p.rows.every((r: any) => r.esCafe)));
});

Deno.test("cafeCorrer: un escenario de vista que no existe usa el guardado; año sin aperturas da arranque 0 sin NaN", () => {
  const c = cafeCorrer(datosImp(), normalizarCfgMotor({ cafe: { escenario: "Pesimista" } }), "Manual");
  assertEquals([c.err, c.esc], [null, "Pesimista"]);
  const vacio = cafeCorrer(datosImp({ aperturas: [] }), normalizarCfgMotor({}));
  assertEquals([vacio.ent.red.ini, vacio.ent.red.a0], [0, 0]);
  assert(Number.isFinite(vacio.R.calculadora.resumen.kgComprar));
});
