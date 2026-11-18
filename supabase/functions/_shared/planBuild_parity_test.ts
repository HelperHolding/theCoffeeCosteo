// deno-lint-ignore-file no-explicit-any
// Paridad del armado del plan: _planBuild (sin proveedores), _planBacktestAgg y _planAplicarServidor contra planBuild.ts.
import { assert, assertEquals } from "@std/assert";
import { type DatosPlan, normalizarCfgMotor } from "./planDatos.ts";
import { type Plan, planBuild, planSinSrv } from "./planBuild.ts";
import { app, SIN_APP, STUBS_MOTOR } from "./pruebas/appVieja.ts";
import { datos, HOY, NOMBRES_DATOS, ZOHO_OC } from "./pruebas/fixturesPlan.ts";

const NOMBRES_BUILD = [...NOMBRES_DATOS, "_planBuild", "_planBacktestAgg", "_planAplicarServidor", "_planCalcMontos", "_planAgruparProv",
  "_planConsolidar", "_minVendorDeGrupo", "_planEsCafe", "_planKey", "_planDiaAtras", "_planSinSrv", "_planCafeFueraLocal"];
const A = SIN_APP ? null : app(NOMBRES_BUILD, STUBS_MOTOR, HOY);
// zprov vacío: sin mínimos de proveedor, _planAgruparProv no consolida (eso es del plan 3f) y no toca las filas.
const paraApp = (R: DatosPlan) => ({ ...R, hoy: A.today(), zprov: [] });
const CLAVES: (keyof Plan)[] = ["rows", "soloCafe", "nUnica", "nCafe", "ltExiste", "sinMapear", "ignoradas", "compViejo", "tipoUds",
  "aperCuentan", "avisos", "nAperturas", "lineasInvalidas", "skuFuera", "histMotor", "histReal", "lecturaVacia", "nMetodoCae",
  "nRecorteCae", "nSegCae", "nBloqueados", "nCortos", "nInvalidos", "nPicos", "fuenteCant", "srvSinPlan", "srvSinDatos", "P",
  "hoyIso", "W", "semIni", "bt"];

const SRV = { ok: true, motivo: null, calc: "2026-11-02T12:30:00Z", pagos: [], sinCosto: ["INS-NUE-005", "EMP-TAP-007"], sinProveedor: [],
  compras: [{ sku: "INS-VAS-001", fecha_oc: "2026-11-02", cantidad: 40, monto: 100 }, { sku: "INS-VAS-001", fecha_oc: "2026-11-20", cantidad: 12, monto: 30 },
    { sku: "ALI-JAR-003", fecha_oc: "2026-10-30", cantidad: 6, monto: 240 }, { sku: "NO-ESTA", fecha_oc: "2026-11-09", cantidad: 1, monto: 1 }] };

const CFGS: Record<string, any> = {
  defecto: {},
  con_cafe: { compra: { excluir_cafe: false, bt_semanas: 8 } },
  estadistico: { seg: { metodo: "estadistico" }, consumo: { metodo: "mediana", ventana: 56 }, picos: { manejo: "recortar" } },
  zoho: { zoho_oc: ZOHO_OC, compra: { fuente_oc: "zoho", semanas: 20, prox_dias: 5 } },
};

Deno.test({ name: "paridad: planBuild = _planBuild (local, servidor y solo café)", ignore: SIN_APP }, () => {
  let casos = 0;
  for (const [n, c0] of Object.entries(CFGS)) {
    for (const srv of [null, SRV]) {
      for (const opt of [undefined, { cafe: true }]) {
        const cfg = A._planCfgNormalizar(c0), R = datos({ srv: srv as any });
        const a = A._planBuild(paraApp(R), A._planCfgClon(cfg), opt), s = planBuild(R, normalizarCfgMotor(c0), opt);
        for (const k of CLAVES) assertEquals(s[k], a[k], `${n}/${srv ? "srv" : "local"}/${opt ? "cafe" : "todo"} ${k}`);
        casos++;
      }
    }
  }
  assertEquals(casos, 16);
});

Deno.test("planBuild ejercita el seguimiento, la simulación del servidor y Compra Unica", () => {
  const cfg = normalizarCfgMotor({ compra: { excluir_cafe: false, bt_semanas: 8 } });
  const local = planBuild(planSinSrv(datos({ srv: SRV as any })), cfg);
  assertEquals(local.fuenteCant, "local");
  assertEquals(local.nUnica, 1);
  assertEquals(local.bt.n, 8);
  assert(local.bt.semanas.some((s: any) => s.n > 0));
  assert(local.bt.compras.some((x: number) => x > 0));
  const srv = planBuild(datos({ srv: SRV as any }), cfg);
  assertEquals(srv.fuenteCant, "servidor");
  assertEquals(srv.srvSinPlan, 1); // NO-ESTA
  const vaso = srv.rows.find((r) => r.sku === "INS-VAS-001");
  assertEquals([vaso.calc.pedirEsta, vaso.calc.pedirHoy, vaso.calc.fuente], [40, 40, "servidor"]);
  assertEquals(srv.rows.find((r) => r.sku === "INS-NUE-005").calc.fuente, "local-sin-datos");
});
