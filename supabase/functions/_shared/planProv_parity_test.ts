// deno-lint-ignore-file no-explicit-any
// Paridad del plan local completo (plan 3f): _planBuild(R, cfg) de la app, con la simulación del servidor y la agrupación
// por proveedor, contra planLocal (planBuild del 3d + planProvs del 3e).
import { assert, assertEquals } from "@std/assert";
import { type DatosPlan, normalizarCfgMotor } from "./planDatos.ts";
import { planLocal } from "./planProv.ts";
import { app, SIN_APP } from "./pruebas/appVieja.ts";
import { NOMBRES_DATOS } from "./pruebas/fixturesPlan.ts";
import { HOY_IMP, NOMBRES_CAFE, NOMBRES_IMP_CFG, STUBS_IMP } from "./pruebas/fixturesImp.ts";
import { datosSem, SRV_SEM, ZOHO_OC_SEM } from "./pruebas/fixturesSem.ts";

const NOMBRES = [...new Set([...NOMBRES_DATOS, ...NOMBRES_IMP_CFG, ...NOMBRES_CAFE])];
const A = SIN_APP ? null : app(NOMBRES, STUBS_IMP, HOY_IMP);
const paraApp = (R: DatosPlan) => ({ ...R, hoy: A.today() });
const sinHist = (provs: any[]) => provs.map(({ hist: _h, ...x }) => x);

/** La simulación de hace 40 h: servidorPlan la entrega con ok=false y su motivo. */
const VIEJA = { ...SRV_SEM, ok: false, motivo: "corrida de hace 40 h", compras: [] };
// La app solo conoce los borradores de la carga de Zoho de la configuración: se le dan los mismos que trae zoho-sync.
const CFGS: Record<string, any> = {
  defecto: { zoho_oc: ZOHO_OC_SEM },
  avisar: { zoho_oc: ZOHO_OC_SEM, compra: { min_prov: "avisar" } },
  con_cafe: { zoho_oc: ZOHO_OC_SEM, compra: { excluir_cafe: false, prox_dias: 14 } },
  sin_seguimiento: { zoho_oc: ZOHO_OC_SEM, compra: { bt_semanas: 0, semanas: 8 }, seg: { dias: 20 } },
};

Deno.test({ name: "paridad: planLocal = _planBuild(R, cfg) con provs, mínimos y la simulación (vigente, vieja o ninguna)", ignore: SIN_APP }, () => {
  let n = 0, servidor = 0, adelantos = 0;
  for (const [nom, c0] of Object.entries(CFGS)) {
    for (const [ns, srv] of [["local", null], ["srv", SRV_SEM], ["vieja", VIEJA]] as [string, any][]) {
      const R = datosSem({ srv });
      const a = A._planBuild(paraApp(R), A._planCfgNormalizar(c0)), s = planLocal(R, normalizarCfgMotor(c0));
      const k = `${nom}/${ns}`;
      assertEquals(s.rows, a.rows, k + " rows");
      assertEquals(sinHist(s.provs), sinHist(a.provs), k + " provs");
      assertEquals([s.minManual, s.vendorDe], [a.minManual, a.vendorDe], k + " mínimos");
      assertEquals([s.fuenteCant, s.srvSinPlan, s.srvSinDatos, s.W, s.semIni, s.P], [a.fuenteCant, a.srvSinPlan, a.srvSinDatos, a.W, a.semIni, a.P], k + " calendario");
      assertEquals(s.bt, a.bt, k + " seguimiento");
      if (s.fuenteCant === "servidor") servidor++;
      adelantos += s.provs.reduce((t, p) => t + p.adelantados, 0);
      n++;
    }
  }
  assertEquals(n, 12);
  assertEquals(servidor, 4, "la simulación vigente se usa en las cuatro configuraciones");
  assert(adelantos > 0, "ningún caso consolidó por mínimo");
});

Deno.test("planLocal: con la simulación vigente las cantidades salen del servidor; vieja o ausente, del cálculo local", () => {
  const cfg = normalizarCfgMotor({});
  const srv = planLocal(datosSem({ srv: SRV_SEM }), cfg);
  const jar = srv.rows.find((r) => r.sku === "LOC-JAR-001");
  assertEquals([srv.fuenteCant, jar.calc.fuente, jar.calc.pedirHoy, jar.sem[0], jar.sem[2]], ["servidor", "servidor", 36, 36, 12]);
  assertEquals(srv.srvSinPlan, 1); // NO-EN-PLAN no está en el catálogo
  assertEquals(srv.W, 12);
  for (const s of [null, VIEJA]) {
    const c = planLocal(datosSem({ srv: s as any }), cfg);
    assertEquals(c.fuenteCant, "local");
    assert(c.rows.every((r) => r.calc.fuente !== "servidor"));
  }
});

Deno.test("planLocal: el café queda fuera del plan local y cada proveedor toma su vendor de Zoho (o el de mismo nombre)", () => {
  const c = planLocal(datosSem(), normalizarCfgMotor({}));
  assert(c.rows.every((r) => !r.esCafe));
  assertEquals(c.vendorDe["jarabes mx"], "v4");
  assertEquals(c.minManual["jarabes mx"], 5000);
  assertEquals(c.vendorDe["polvos y bases"], "v5"); // sin zoho_vendor_id: por nombre
  assertEquals(c.vendorDe["lácteos (refrigerados)"], undefined); // el nombre de Zoho no trae el paréntesis
  assert(c.provs.some((p) => p.key === "__sin__" && !p.real));
});
