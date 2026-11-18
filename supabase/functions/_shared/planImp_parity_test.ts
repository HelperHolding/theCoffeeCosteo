// deno-lint-ignore-file no-explicit-any
// Paridad del adaptador de Importaciones: _impRed, _impArmar, _impCorrer y _impAhoraDatos de la app contra planImp.ts,
// con los mismos datos del plan (R) y la misma configuración.
import { assert, assertEquals } from "@std/assert";
import { type DatosPlan, normalizarCfgMotor } from "./planDatos.ts";
import { cfgConImp, impAhoraDatos, impCorrer, impFraccionMes, impMesClave, impOcLineas, impRed } from "./planImp.ts";
import { app, SIN_APP } from "./pruebas/appVieja.ts";
import { NOMBRES_DATOS } from "./pruebas/fixturesPlan.ts";
import { datosImp, HOY_IMP, NOMBRES_IMP, NOMBRES_IMP_CFG, STUBS_IMP, ZOHO_OC_IMP } from "./pruebas/fixturesImp.ts";

const NOMBRES = [...new Set([...NOMBRES_DATOS, ...NOMBRES_IMP_CFG, ...NOMBRES_IMP])];
const A = SIN_APP ? null : app(NOMBRES, STUBS_IMP, HOY_IMP);
const g = globalThis as any;
let carga = 1000;
/** Corre _impCorrer de la app con R (hoy = today() de la app) y el escenario de la vista; cada caso con su propia carga. */
function correrApp(R: DatosPlan, cfgApp: any, esc = "") {
  g.__R = { ...R, hoy: A.today(), cargadoEn: ++carga };
  g.__UI = { esc };
  return A._impCorrer(cfgApp);
}

const CFGS: Record<string, any> = {
  defecto: {},
  plataforma: { imp: { fuentes: { venta: "plataforma", kit: "plataforma" }, venta_ventana: 60, red: { meses_pipeline: 5, plan: { "2027-01": 3, "2027-06": 0 }, cierres: { "2027-02": 2 } } } },
  manual_sin_prorrateo: { imp: { red: { suc_hoy_modo: "manual", suc_hoy: 140 }, prorratear_mes1: false, corregir_hoja: false, escenario: "Optimista" },
    inv: { base: "fisico", yulius: true } },
  sin_aperturas: { aper: { incluir: false, vencida_max: 200 }, imp: { items: { "INS-DES-021": { nombre: "Vaso 12", familia: "Inventada", prov: "Nadie", venta: 1, camino_qty: 90, camino_fecha: "2026-12-10" },
    "INS-DES-012": { nombre: "Vaso 12", familia: "Tapa caliente", prov: "Green Packaging", venta: 0.4, activo: true }, "NO-EN-CATALOGO": { nombre: "Fantasma", venta: 0.2, prov: "LQC Printing" },
    "MER-TER-001": { nombre: "Termo", familia: "Termos", prov: "Easy Drinkware", venta: 0.7, activo: false } }, orden: ["INS-DES-021", "INS-DES-012", "NO-EN-CATALOGO", "MER-TER-001"] } },
  zoho_fuente: { zoho_oc: ZOHO_OC_IMP, compra: { fuente_oc: "zoho" } },
  zoho_borrador: { zoho_oc: ZOHO_OC_IMP, compra: { oc_vencida: 60, lt_default: 20 }, aper: { ajustes: { e6: { fecha: "2027-03-03" }, e2: { incluir: false } } } },
};

Deno.test({ name: "paridad: impCorrer = _impCorrer (S, entrada, meta y escenario) en 6 configuraciones × 3 escenarios de vista", ignore: SIN_APP }, () => {
  let n = 0;
  for (const [nom, c0] of Object.entries(CFGS)) {
    for (const esc of ["", "Pesimista", "Inventado"]) {
      const R = datosImp();
      const a = correrApp(R, A._planCfgNormalizar(c0), esc), s = impCorrer(R, normalizarCfgMotor(c0), esc);
      assertEquals(s.err, a.err, `${nom}/${esc} err`);
      assertEquals(s.esc, a.esc, `${nom}/${esc} esc`);
      assertEquals(s.ent, a.ent, `${nom}/${esc} ent`);
      assertEquals(s.S, a.S, `${nom}/${esc} S`);
      assertEquals(s.cfg.imp, a.cfg.imp, `${nom}/${esc} cfg.imp`);
      assertEquals(impAhoraDatos(s), A._impAhoraDatos(a), `${nom}/${esc} ahora`);
      n++;
    }
  }
  assertEquals(n, 18);
});

Deno.test({ name: "paridad: el día 1 del mes no prorratea y fin de año cruza a 2028 (impRed = _impRed)", ignore: SIN_APP }, () => {
  for (const hoy of ["2026-12-01", "2026-12-31", "2027-01-01"]) {
    const B = app(NOMBRES, STUBS_IMP, hoy);
    const R = datosImp({ hoy });
    const cfg = cfgConImp(normalizarCfgMotor({}));
    g.__R = { ...R, hoy: B.today(), cargadoEn: ++carga };
    g.__UI = { esc: "" };
    assertEquals(impRed(R, cfg, "Base"), B._impRed(g.__R, B._planCfgNormalizar({}), "Base"), hoy);
    const a = B._impCorrer(B._planCfgNormalizar({})), s = impCorrer(R, normalizarCfgMotor({}));
    assertEquals(s.S, a.S, hoy + " S");
    assertEquals(s.ent.meta, a.ent.meta, hoy + " meta");
  }
  assertEquals(impFraccionMes("2026-12-01"), 0);
  assertEquals(impMesClave("2026-12-31", 1), "2027-01");
  assertEquals(impMesClave("2026-11-13", 14), "2028-01");
});

Deno.test("impCorrer: sin artículos activos avisa sin correr el motor; 14 meses de cobertura (el máximo) sí calcula", () => {
  const vacio = impCorrer(datosImp(), normalizarCfgMotor({ imp: { items: { X: { activo: false } } } }));
  assertEquals([vacio.S, vacio.err], [null, "No hay artículos activos en el plan de importaciones."]);
  const largo = impCorrer(datosImp(), normalizarCfgMotor({ imp: { politica: { meses_cobertura: 99 } } }));
  assertEquals([largo.err, largo.cfg.imp.politica.meses_cobertura], [null, 14]);
  assert(largo.S.productos.length > 0);
});

Deno.test("impOcLineas: un borrador real de Zoho (com_zoho_oc_lineas 'draft') no cuenta como en camino (decisión 6 del plan 3d)", () => {
  const cfg = cfgConImp(normalizarCfgMotor({}));
  const R = datosImp({ ocZohoBorr: [{ po_number: "COM-OC-02001", sku: "ins-des-021", vendor_name: "GP", fecha_oc: "2026-10-01", cantidad: 300, cantidad_recibida: 0, precio: 600 }] });
  assertEquals(impOcLineas(datosImp(), cfg)["INS-DES-021"].length, 2);
  assertEquals(impOcLineas(R, cfg)["INS-DES-021"].map((l) => l.folio), ["COM-OC-02002"]);
  // La OC vieja (arribo hace más de 14 días) cuenta, marcada como vieja; la recibida no aparece.
  assertEquals(impOcLineas(datosImp(), cfg)["MER-TER-001"][0].vieja, true);
  assertEquals(impOcLineas(datosImp(), cfg)["INS-DES-012"], undefined);
});

Deno.test("impCorrer: el pipeline cuenta vencidas, sin fecha y después del horizonte; las sucursales de hoy son las activas", () => {
  const c = impCorrer(datosImp(), normalizarCfgMotor({}));
  const pl = c.ent.meta.red.pl;
  assertEquals([pl.vencidas, pl.vencidasFuera, pl.sinFecha, pl.despues], [1, 1, 1, 1]);
  assertEquals(c.ent.meta.red.sucHoy, 7);
  assertEquals(c.S.meses.length, 15);
});
