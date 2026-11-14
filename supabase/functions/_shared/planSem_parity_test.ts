// deno-lint-ignore-file no-explicit-any
// Paridad del Plan de abastos: _planSemCalc (con _psemGrupos, _psemGruposImp y las categorías), _psemPasadas, _psemFamDe y
// _psemHoyMonto de la app contra planSem.ts, con el plan local, el de café y la corrida de Importaciones de cada lado.
import { assert, assertEquals } from "@std/assert";
import { type DatosPlan, normalizarCfgMotor } from "./planDatos.ts";
import { planLocal } from "./planProv.ts";
import { cafeOrdenes } from "./planCafe.ts";
import { impCorrer } from "./planImp.ts";
import { type Inc, planSemCalc, planSemW, psemFamDe, psemHoyMonto, psemPasadas } from "./planSem.ts";
import { app, SIN_APP } from "./pruebas/appVieja.ts";
import { NOMBRES_DATOS } from "./pruebas/fixturesPlan.ts";
import { HOY_IMP, NOMBRES_CAFE, NOMBRES_IMP, NOMBRES_IMP_CFG, STUBS_IMP } from "./pruebas/fixturesImp.ts";
import { datosSem, NOMBRES_SEM, SRV_SEM, STUBS_SEM, ZOHO_OC_SEM } from "./pruebas/fixturesSem.ts";

const NOMBRES = [...new Set([...NOMBRES_DATOS, ...NOMBRES_IMP_CFG, ...NOMBRES_IMP, ...NOMBRES_CAFE, ...NOMBRES_SEM])];
const A = SIN_APP ? null : app(NOMBRES, STUBS_IMP + "\n" + STUBS_SEM, HOY_IMP);
const g = globalThis as any;
let carga = 7000;

/** Pone los globales de la app (datos, plan local, plan de café) y devuelve su configuración normalizada. */
function prepararApp(R: DatosPlan, c0: any, cafeErr?: string) {
  const cfgA = A._planCfgNormalizar(c0), Ra = { ...R, hoy: A.today(), cargadoEn: ++carga };
  g.__R = Ra;
  g.__UI = { esc: "" };
  g.__C = A._planBuild(Ra, cfgA);
  g.__CC = A._planBuild(Ra, cfgA, { cafe: true });
  g.__CC_ERR = cafeErr;
  return cfgA;
}
const fuentes = (R: DatosPlan, cfg: any, cafeErr?: string) => ({
  cafe: () => { if (cafeErr) throw new Error(cafeErr); return cafeOrdenes(R, cfg); },
  imp: () => impCorrer(R, cfg),
});

// Todas con la carga de borradores de la configuración (la app no conoce com_zoho_oc_lineas; ver planProv_parity_test).
const CFGS: Record<string, any> = {
  defecto: { zoho_oc: ZOHO_OC_SEM },
  con_cafe: { zoho_oc: ZOHO_OC_SEM, compra: { excluir_cafe: false } },
  semanas_8: { zoho_oc: ZOHO_OC_SEM, compra: { semanas: 8, prox_dias: 10 } },
  imp_vacio: { zoho_oc: ZOHO_OC_SEM, imp: { orden: [], items: {} } },
};
const INCS: Inc[] = [
  { local: true, cafe: true, imp: true }, { local: true, cafe: false, imp: true }, { local: false, cafe: false, imp: false },
];

Deno.test({ name: "paridad: planSemCalc = _planSemCalc (4 configuraciones × con/sin servidor × 3 inclusiones × 4/8/12 semanas)", ignore: SIN_APP }, () => {
  let n = 0, conImp = 0, conCafe = 0, errImp = 0;
  for (const [nom, c0] of Object.entries(CFGS)) {
    for (const srv of [null, SRV_SEM]) {
      const R = datosSem({ srv: srv as any });
      prepararApp(R, c0);
      const cfg = normalizarCfgMotor(c0), c = planLocal(R, cfg);
      for (const inc of INCS) {
        for (const sem of [4, 8, 12]) {
          A._planSemUI.inc = { ...inc };
          A._planSemUI.sem = sem;
          const Wv = planSemW(c, sem);
          assertEquals(Wv, A._planSemW(), `${nom} Wv`);
          const a = A._planSemCalc(), s = planSemCalc(c, inc, Wv, fuentes(R, cfg));
          const k = `${nom}/${srv ? "srv" : "local"}/${JSON.stringify(inc)}/${sem}`;
          for (const id of ["local", "cafe", "imp"] as const) assertEquals(s.cat[id], a.cat[id], `${k} ${id}`);
          assertEquals(s.provs, a.provs, k + " provs");
          assertEquals(s.tot, a.tot, k + " tot");
          assertEquals(psemHoyMonto(s.provs), A._psemHoyMonto(a.provs), k + " hoy");
          if (s.cat.imp.provs.length) conImp++;
          if (s.cat.cafe.provs.length) conCafe++;
          if (s.cat.imp.err) errImp++;
          n++;
        }
      }
    }
  }
  assertEquals(n, 72);
  assert(conImp > 0 && conCafe > 0 && errImp > 0, "faltan casos con importaciones, café o error de importaciones");
});

Deno.test({ name: "paridad: si el café falla, su error queda en la categoría y lo demás se calcula igual", ignore: SIN_APP }, () => {
  const R = datosSem(), c0 = { zoho_oc: ZOHO_OC_SEM }, cfg = normalizarCfgMotor(c0);
  prepararApp(R, c0, "sin datos de café");
  A._planSemUI.inc = { local: true, cafe: true, imp: true };
  A._planSemUI.sem = 12;
  const a = A._planSemCalc(), s = planSemCalc(planLocal(R, cfg), { local: true, cafe: true, imp: true }, 12, fuentes(R, cfg, "sin datos de café"));
  assertEquals(s.cat, a.cat);
  assertEquals([s.cat.cafe.err, s.cat.cafe.provs.length, s.cat.cafe.rot], ["sin datos de café", 0, 0]);
});

Deno.test({ name: "paridad: psemPasadas = _psemPasadas (borradores fuera, por categoría, sin monto aparte)", ignore: SIN_APP }, () => {
  for (const [nom, c0] of Object.entries(CFGS)) {
    const R = datosSem();
    prepararApp(R, c0);
    const s = psemPasadas(planLocal(R, normalizarCfgMotor(c0)), R), a = A._psemPasadas(g.__C);
    assertEquals(s, a, nom);
  }
});

Deno.test({ name: "paridad: psemFamDe = _psemFamDe", ignore: SIN_APP }, () => {
  const casos: [string, string, string | null, string][] = [
    ["INS-DES-021", "VASO KRAFT", null, "local"], ["X", "Jarabe de vainilla", "Bebidas > Jarabes", "local"], ["X", "Té earl grey", "", "local"],
    ["X", "Fuze tea 600 ml", null, "local"], ["X", "Polvo para frappé", "Barra", "local"], ["X", "Leche deslactosada", "Bebidas", "local"],
    ["X", "Cloro", "Limpieza", "local"], ["INS-CAF-001", "Café", null, "local"], ["X", "Lo que sea", null, "cafe"], ["X", "Servilleta", "Bebidas", "local"],
    ["X", "Tisana de jamaica", "Bebidas", "local"], ["X", "Chocolate abuelita", null, "imp"], ["X", "Termo", "Mercancía", "imp"], ["", "", null, "local"],
    ["X", "Café molido", "Café", "local"], ["INS-DEL-002", "Bolsa", "Desechables", "local"],
  ];
  for (const [sku, nom, det, cat] of casos) assertEquals(psemFamDe(sku, nom, det, cat), A._psemFamDe(sku, nom, det, cat), nom);
});

Deno.test("planSemCalc: tres categorías con su dinero; lo no incluido no suma al total; Importaciones vacía avisa", () => {
  const R = datosSem(), cfg = normalizarCfgMotor({}), c = planLocal(R, cfg);
  const todo = planSemCalc(c, { local: true, cafe: true, imp: true }, 12, fuentes(R, cfg));
  const sinImp = planSemCalc(c, { local: true, cafe: true, imp: false }, 12, fuentes(R, cfg));
  const sumaCat = (id: "local" | "cafe" | "imp") => todo.cat[id].monto.reduce((a, b) => a + b, 0);
  const sumaTot = (S: typeof todo) => S.tot.monto.reduce((a, b) => a + b, 0);
  assert(sumaCat("local") > 0 && sumaCat("cafe") > 0 && sumaCat("imp") > 0);
  assertEquals(Math.round(sumaTot(todo) - sumaTot(sinImp)), Math.round(sumaCat("imp")));
  assert(sinImp.provs.every((p) => p.cat !== "imp"));
  const vacio = normalizarCfgMotor({ imp: { orden: [], items: {} } });
  const S = planSemCalc(planLocal(R, vacio), { local: true, cafe: true, imp: true }, 12, fuentes(R, vacio));
  assertEquals([S.cat.imp.err, S.cat.imp.provs.length], ["No hay artículos activos en el plan de importaciones.", 0]);
  assert(S.cat.local.provs.length > 0);
});

Deno.test("psemPasadas: un borrador de zoho-sync no es una compra emitida aunque la configuración no lo tenga", () => {
  const R = datosSem(), c = planLocal(R, normalizarCfgMotor({}));
  const con = psemPasadas(c, R), sin = psemPasadas(c, { ...R, ocZohoBorr: [] });
  // COM-OC-03001 (3,800 del 12-nov) es borrador en zoho-sync: solo cuenta si no se sabe que es borrador.
  assertEquals(Math.round(sin.local[0] - con.local[0]), 3800);
  assertEquals(con.sinMonto, 1); // COM-OC-03012 sin monto
});
