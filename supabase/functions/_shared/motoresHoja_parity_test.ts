// deno-lint-ignore-file no-explicit-any
// Paridad de los motores de las Sheets: impEngine.ts y cafeEngine.ts son copias del cuerpo de _impEngine y _cafeEngine
// de la app. Con las mismas entradas la salida debe ser IDÉNTICA, también los errores.
import { assert, assertEquals, assertThrows } from "@std/assert";
import { impEngine } from "./impEngine.ts";
import { cafeEngine } from "./cafeEngine.ts";
import { cafeCfgNorm, impCfgNorm } from "./impCafeCfg.ts";
import { app, SIN_APP } from "./pruebas/appVieja.ts";
import { entradaCafe, entradaImpHoja } from "./pruebas/fixturesImp.ts";

const A = SIN_APP ? null : app(["_impEngine", "_cafeEngine"], "", "2026-11-13");
const err = (f: () => unknown) => { try { f(); return null; } catch (e) { return (e as Error).message; } };

// Fechas de corte: mitad de mes, fin y principio de año (el horizonte de 15 meses cruza dos años) y un 29 de febrero.
const CORTES = ["2026-11-13", "2026-12-31", "2027-01-01", "2027-06-15", "2028-02-29"];
const IMPS: Record<string, any> = {
  defecto: {},
  hoja_tal_cual: { corregir_hoja: false },
  pesimista_45: { escenario: "Pesimista", contenedor: { tipo: "45' HQ", llenado: 0.85, por_embarque: 2, dias_respaldo: 30 } },
  politica: { politica: { meses_cobertura: 6, meses_respaldo: 2, dias_margen: 0, dias_juntar: 0 }, puente: { dias_colchon: 20, multiplo: 12 } },
  sin_contenedor: { prov: [{ clave: "Green Packaging", nombre: "GP", lead: 30, cierres: 0 }, { clave: "Easy Drinkware", lead: 400, cierres: 120, contenedor: true },
    { clave: "Proveedor actual (vía SIMBS)", lead: 1 }, { clave: "LQC Printing", lead: 60 }] },
};

Deno.test({ name: "paridad: impEngine = _impEngine (5 fechas de corte × 5 configuraciones × 4 escenarios)", ignore: SIN_APP }, () => {
  let n = 0;
  for (const [nom, x] of Object.entries(IMPS)) {
    const ci = impCfgNorm(x);
    for (const hoy of CORTES) {
      for (const esc of ["Pesimista", "Base", "Optimista", "Manual"]) {
        const { P, items } = entradaImpHoja(ci, hoy, { esc, seed: n + 3 });
        assertEquals(impEngine(P, items), A._impEngine(P, items), `${nom} ${hoy} ${esc}`);
        n++;
      }
    }
  }
  assertEquals(n, 100);
});

Deno.test({ name: "paridad: impEngine lanza los mismos errores que _impEngine", ignore: SIN_APP }, () => {
  const { P, items } = entradaImpHoja(impCfgNorm({}), "2026-11-13");
  const casos: [string, any, any][] = [
    ["sin items", P, []],
    ["escenario", { ...P, escenarioActivo: "Nada" }, items],
    ["contenedor", { ...P, contenedor: { ...P.contenedor, tipo: "20'" } }, items],
    ["fecha", { ...P, fechaCorte: "13/11/2026" }, items],
    ["cobertura", { ...P, politica: { ...P.politica, mesesCobertura: 15 } }, items],
    ["familia", P, [{ ...items[0], familia: "No existe" }]],
    ["proveedor", P, [{ ...items[0], proveedor: "Nadie" }]],
  ];
  for (const [nom, p, its] of casos) {
    const a = err(() => A._impEngine(p, its)), s = err(() => impEngine(p, its));
    assertEquals(s, a, nom);
  }
  assertEquals(err(() => impEngine({ ...P, escenarioActivo: "Nada" }, items))?.startsWith("#N/A"), true);
});

Deno.test({ name: "paridad: cafeEngine = _cafeEngine (años, escenarios, arranque automático y manual)", ignore: SIN_APP }, () => {
  const CAFES = [{}, { anio: 2026, ajuste: -0.2, comprometer: 1 }, { anio: 2031, q4_modo: "manual", curva: [0, 0, 0, 0, 0], estacionalidad: Array(12).fill(0) },
    { prod: { white_1kg: { mezcla: 0, nuevo_precio: null }, black_250g: { mezcla: 1, nuevo_empaque: null } }, cierres: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 40] }];
  let n = 0;
  for (const x of CAFES) {
    const cc = cafeCfgNorm(x);
    for (const esc of ["Pesimista", "Base", "Optimista"]) {
      for (const red of [null, { ini: 0, a0: 0 }, { ini: 140, a0: 7 }]) {
        const P = entradaCafe(cc, esc, red);
        assertEquals(cafeEngine(P), A._cafeEngine(P), `${JSON.stringify(x)} ${esc} ${JSON.stringify(red)}`);
        n++;
      }
    }
  }
  assertEquals(n, 36);
  const P = entradaCafe(cafeCfgNorm({}), "Manual", null);
  assertEquals(err(() => cafeEngine(P)), err(() => A._cafeEngine(P)));
});

Deno.test("impEngine: el horizonte de 15 meses cruza el año (de nov-26 a ene-28) y la salida es JSON puro", () => {
  const { P, items } = entradaImpHoja(impCfgNorm({}), "2026-11-13");
  const S = impEngine(P, items);
  assertEquals(S.meses.length, 15);
  assertEquals(S.meses[0].inicio, "2026-11-01");
  assertEquals(S.meses[14].inicio, "2028-01-01");
  assertEquals(JSON.parse(JSON.stringify(S)), S);
  assert(S.productos.every((p: any) => p.quiebre && p.compraPuente && p.mensual));
  assertThrows(() => impEngine(P, []), Error, "al menos 1 producto");
});

Deno.test("cafeEngine: año calendario de 12 meses y kilos a comprar del escenario", () => {
  const R = cafeEngine(entradaCafe(cafeCfgNorm({}), "Base", { ini: 100, a0: 5 }));
  assertEquals(R.etiquetasMes.length, 12);
  assert(R.calculadora.resumen.kgComprar > 0);
  assertEquals(R.detalleMensual.kgComprar.mes.length, 12);
});
