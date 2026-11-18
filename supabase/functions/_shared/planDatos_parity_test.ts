// deno-lint-ignore-file no-explicit-any
// Paridad de la preparación de datos: _planDatAMotor, _planCfgNormalizar (zoho_oc y kpi incluidos), _planOcFuente,
// _zocBorradorSet y _planHistNecesaria de la app contra planDatos.ts.
import { assert, assertEquals } from "@std/assert";
import {
  borradoresPlan, type DatosPlan, normalizarCfgMotor, planDatAMotor, planHistNecesaria, planInvUltSync, zocBorradorSet, zocKey,
} from "./planDatos.ts";
import { app, SIN_APP, STUBS_MOTOR } from "./pruebas/appVieja.ts";
import { datos, HOY, NOMBRES_DATOS, ZOHO_OC } from "./pruebas/fixturesPlan.ts";

const A = SIN_APP ? null : app(NOMBRES_DATOS, STUBS_MOTOR, HOY);
const paraApp = (R: DatosPlan) => ({ ...R, hoy: A.today() });

const CFGS: Record<string, any> = {
  defecto: {},
  sin_comp_viejo: { inv: { comp_dias: 0 } },
  oc_vencida: { compra: { oc_vencida: 20, lt_default: 10 } },
  originales: { consumo: { items: "originales", ventana: 56, tipos: { marketing: true, corporativo: true, llenado: true } } },
  zoho_plataforma: { zoho_oc: ZOHO_OC },
  zoho_fuente: { zoho_oc: ZOHO_OC, compra: { fuente_oc: "zoho" } },
};

Deno.test({ name: "paridad: normalizarCfgMotor = _planCfgNormalizar (con zoho_oc y kpi)", ignore: SIN_APP }, () => {
  const casos = [null, {}, ...Object.values(CFGS), { kpi: { prec_min: "80", cv_min: 2, cv_max: 1, dias_min: 5000, exc_margen: 12.6 } },
    { kpi: "x", zoho_oc: { lineas: "no" } }];
  for (const c of casos) assertEquals(normalizarCfgMotor(c), A._planCfgNormalizar(c), JSON.stringify(c));
});

Deno.test({ name: "paridad: planDatAMotor = _planDatAMotor (serie, inventario, comprometido, OCs, aperturas)", ignore: SIN_APP }, () => {
  for (const [n, c0] of Object.entries(CFGS)) {
    for (const histReal of [400, 40]) {
      const cfg = A._planCfgNormalizar(c0);
      const R = datos({ histReal });
      const a = A._planDatAMotor(paraApp(R), cfg), s = planDatAMotor(R, cfg);
      assertEquals(s.raw, a.raw, `${n}/${histReal} raw`);
      assertEquals(s.meta, a.meta, `${n}/${histReal} meta`);
    }
  }
});

Deno.test("el fixture ejercita OCs viejas, ignoradas, borradores y comprometido viejo", () => {
  const s = planDatAMotor(datos(), normalizarCfgMotor({ compra: { oc_vencida: 20, lt_default: 10 } }));
  assertEquals(s.meta.staleLn, { "INS-VAS-001": 1, "ALI-JAR-003": 1 });
  assertEquals(s.meta.ignoradas, 2);
  assertEquals(s.meta.compViejo, { uds: 9, ln: 2, folios: 1, dias: 30 });
  assert(s.meta.sinMapear > 0 && s.meta.lineasInvalidas > 0 && s.meta.skuFuera > 0);
  const z = planDatAMotor(datos(), normalizarCfgMotor({ zoho_oc: ZOHO_OC }));
  assertEquals(z.raw.skus.find((x: any) => x.sku === "ALI-JAR-003").enOC, 30); // o4 es borrador en la carga: no cuenta
});

Deno.test({ name: "paridad: _planHistNecesaria con la ventana de Importaciones dentro de rango", ignore: SIN_APP }, () => {
  for (const c of [{ imp: { venta_ventana: 120 } }, { compra: { bt_semanas: 12, prox_dias: 14 }, imp: { venta_ventana: 30 } }, { consumo: { ventana: 180 }, imp: { venta_ventana: 90 } }]) {
    assertEquals(planHistNecesaria(normalizarCfgMotor(c)), A._planHistNecesaria(A._planCfgNormalizar(c)), JSON.stringify(c));
  }
});

Deno.test("planHistNecesaria: sin sección imp usa la ventana por defecto de Importaciones (90) y la acota a [30, 365]", () => {
  assertEquals(planHistNecesaria(normalizarCfgMotor({})), 90);
  assertEquals(planHistNecesaria(normalizarCfgMotor({ imp: { venta_ventana: 20 } })), 84);
  assertEquals(planHistNecesaria(normalizarCfgMotor({ imp: { venta_ventana: 999 } })), 365);
  assertEquals(planHistNecesaria(normalizarCfgMotor({ compra: { bt_semanas: 12, prox_dias: 14 } })), 198);
});

Deno.test("decisión 6: un borrador real de Zoho (com_zoho_oc_lineas) no cuenta como en camino; sin la copia fija del 13-oct", () => {
  const cfg = normalizarCfgMotor({});
  assertEquals(zocBorradorSet(cfg), null);
  const R = datos({ ocZohoBorr: [{ po_number: "OC-1250", sku: "ins-vas-001", vendor_name: "Vasos SA", fecha_oc: "2026-10-20", cantidad: 100, cantidad_recibida: 0, precio: 9 }] });
  assertEquals(borradoresPlan(R, cfg), { "1250|INS-VAS-001": 1 });
  assertEquals(planDatAMotor(R, cfg).raw.skus.find((x: any) => x.sku === "INS-VAS-001").enOC, 50); // solo queda la o2 (vieja)
  assertEquals(zocKey("DODO-OC-00070"), "D70");
});

Deno.test("planInvUltSync toma la sincronización más reciente de zoho_sync_at o zoho_actualizado", () => {
  assertEquals(planInvUltSync([{ zoho_sync_at: "2026-10-01T00:00:00Z" }, { zoho_actualizado: "2026-10-03T00:00:00Z" }, {}]), "2026-10-03T00:00:00Z");
  assertEquals(planInvUltSync([]), null);
});
