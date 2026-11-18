// deno-lint-ignore-file no-explicit-any
// Paridad de los Indicadores de abasto: _kpiAbCalc y _kpiAbEstados de la app contra planKpi.ts, más pruebas a mano de lo
// que la app no deja evaluar aislado (borradores, traza, ventanas) y del tamaño real del catálogo.
import { assert, assertEquals } from "@std/assert";
import { type DatosPlan, normalizarCfgMotor } from "./planDatos.ts";
import { kpiAbCalc, kpiAbEstados, kpiAbTraza, kpiAbVentanas, ocsBorradores } from "./planKpi.ts";
import { app, instanteCdmx, rng, SIN_APP, STUBS_MOTOR } from "./pruebas/appVieja.ts";
import { CAT, datos, HOY, NOMBRES_DATOS, ZOHO_OC } from "./pruebas/fixturesPlan.ts";

const NOMBRES_KPI = [...NOMBRES_DATOS, "_planBuild", "_planBacktestAgg", "_planAplicarServidor", "_planCalcMontos", "_planAgruparProv",
  "_planConsolidar", "_minVendorDeGrupo", "_planEsCafe", "_planKey", "_planDiaAtras", "_planSinSrv", "_planCafeFueraLocal",
  "_kpiAbMetas", "_kpiAbCalc", "_kpiAbEstados", "_planMoneyCorto"];
// _ocsContadas lee el estado global de la pantalla: aquí devuelve los mismos borradores que calcula el servidor.
const STUBS_KPI = STUBS_MOTOR + "function esc(s){return String(s);} function _ocsContadas(){return{borr:globalThis.__borrPrueba||[]};}";
const A = SIN_APP ? null : app(NOMBRES_KPI, STUBS_KPI, HOY);
const AHORA = instanteCdmx(HOY);
const paraApp = (R: DatosPlan) => ({ ...R, hoy: A.today(), zprov: [] });
/** Los textos de detalle y los enlaces son del portal (sin HTML, rutas nuevas): se comparan aparte. */
const sinTextos = (K: any) => ({ ...K, datos: { ...K.datos, checks: K.datos.checks.map(({ detalle: _d, acc: _a, lnk: _l, ...x }: any) => x) } });

const CFGS: Record<string, any> = {
  defecto: {},
  yulius: { inv: { yulius: true, comp_dias: 0 }, kpi: { exc_margen: 5, prec_min: 60 } },
  zoho: { zoho_oc: ZOHO_OC, compra: { fuente_oc: "zoho", bt_semanas: 10 } },
  sin_aper: { aper: { incluir: false }, consumo: { ventana: 14 } },
};

Deno.test({ name: "paridad: kpiAbCalc = _kpiAbCalc y kpiAbEstados = _kpiAbEstados", ignore: SIN_APP }, () => {
  for (const [n, c0] of Object.entries(CFGS)) {
    for (const srv of [null, { ok: true, motivo: null, calc: "x", compras: [{ sku: "INS-VAS-001", fecha_oc: HOY, cantidad: 999, monto: 1 }], pagos: [], sinCosto: [], sinProveedor: [] }]) {
      const R = datos({ srv: srv as any, ocZohoBorr: [] });
      (globalThis as any).__borrPrueba = ocsBorradores(R, normalizarCfgMotor(c0));
      const a = A._kpiAbCalc(paraApp(R), c0), s = kpiAbCalc(R, c0, AHORA);
      assertEquals(sinTextos(s), sinTextos(a), n);
      assertEquals(kpiAbEstados(s), A._kpiAbEstados(a), n + " estados");
    }
  }
});

Deno.test("Indicadores no usan la simulación del servidor (cálculo local, como la app)", () => {
  const srv = { ok: true, motivo: null, calc: "x", compras: [{ sku: "INS-VAS-001", fecha_oc: HOY, cantidad: 999, monto: 1 }], pagos: [], sinCosto: [], sinProveedor: [] };
  const a = kpiAbCalc(datos(), {}, AHORA), b = kpiAbCalc(datos({ srv: srv as any }), {}, AHORA);
  assertEquals(a.riesgo, b.riesgo);
});

Deno.test("riesgo de quiebre: sin venta, OC vieja sin fecha y el orden por estado", () => {
  const K = kpiAbCalc(datos(), {}, AHORA);
  const r = K.riesgo;
  assertEquals(r.pedir + r.confirmar + r.cubierto + r.pronto + r.ok + r.sinventa, r.filas.length);
  const orden = ["pedir", "confirmar", "cubierto", "pronto", "ok", "sinventa"];
  for (let i = 1; i < r.filas.length; i++) assert(orden.indexOf(r.filas[i - 1].estado) <= orden.indexOf(r.filas[i].estado));
  assertEquals(r.filas.find((f: any) => f.sku === "EMP-TAP-007"), undefined); // Compra Unica no entra
  assertEquals(K.datos.checks.map((c: any) => c.id), ["inv", "neg", "oc", "borr", "env", "lt", "prov", "costo", "map", "ap"]);
  assertEquals(K.datos.checks.find((c: any) => c.id === "ap").lnk, "/comercializadora/catalogo/piezas-apertura");
});

Deno.test("artículo nuevo sin historia ni venta: sin NaN y fuera del forecast", () => {
  const nuevo = { ...CAT[0], sku: "INS-NVO-100", nombre: "Nuevo", created_at: "2026-11-01T18:00:00Z", cantidad_por_apertura: 0 };
  const K = kpiAbCalc(datos({ cat: [...CAT, nuevo], pedidos: [] }), {}, AHORA);
  const f = K.riesgo.filas.find((x: any) => x.sku === "INS-NVO-100");
  assertEquals([f.estado, f.dias, f.cons], ["sinventa", null, 0]);
  assertEquals(K.fc.acc, null);
  for (const v of [K.inv.valor, K.inv.cogsDia, K.exc.valor]) assert(Number.isFinite(v));
});

Deno.test("borradores: los de la plataforma, los de la carga de Zoho y los reales de com_zoho_oc_lineas, sin repetir folio", () => {
  const cfg = normalizarCfgMotor({ zoho_oc: ZOHO_OC });
  const R = datos({ ocZohoBorr: [
    { po_number: "COM-OC-01255", sku: "ALI-JAR-003", vendor_name: "Mermeladas", fecha_oc: "2026-10-28", cantidad: 12, cantidad_recibida: 0, precio: 40 },
    { po_number: "COM-OC-01300", sku: "INS-VAS-001", vendor_name: "Vasos SA", fecha_oc: "2026-11-01", cantidad: 10, cantidad_recibida: 0, precio: 3 },
  ] });
  assertEquals(ocsBorradores(R, cfg).map((b) => [b.folio, b.lineas, b.monto]), [["COM-OC-01255", 1, 480], ["COM-OC-01300", 1, 30]]);
});

Deno.test("traza de un artículo: semana a semana, por tipo de pedido, contra lo proyectado", () => {
  const K = kpiAbCalc(datos(), {}, AHORA);
  const sku = Object.keys(K.fc.porSku)[0];
  const t = kpiAbTraza(datos(), K, sku)!;
  assertEquals(t.filas.length, K.NB);
  assertEquals(t.filas.map((f) => f.real), K.fc.porSku[sku].br);
  assert(t.filas.every((f) => f.tipos.every(([, q]) => q > 0)));
  assertEquals(kpiAbTraza(datos(), K, "NO-EXISTE"), null);
});

Deno.test("ventanas: 14, 21 y la actual, sin repetir y en orden", () => {
  const llamadas: number[] = [];
  const v = kpiAbVentanas(datos(), { consumo: { ventana: 21 } }, AHORA, (R, c, t) => { llamadas.push(c.consumo.ventana); return kpiAbCalc(R, c, t); });
  assertEquals(llamadas, [14, 21]);
  assertEquals(v.map((x) => [x.v, x.actual]), [[14, false], [21, true]]);
});

Deno.test("catálogo grande (1500 artículos, 90 días de pedidos): se calcula en segundos", () => {
  const r = rng(7), cat: any[] = [], ped: any[] = [];
  for (let i = 0; i < 1500; i++) cat.push({ ...CAT[0], sku: "GEN-" + i, nombre: "Artículo " + i, costo_unitario: 1 + (i % 50) });
  for (let i = 0; i < 6000; i++) {
    const items = [1, 2, 3].map(() => ({ sku: "GEN-" + Math.floor(r() * 1500), cantidad: 1 + Math.floor(r() * 5) }));
    ped.push({ id: "g" + i, fecha_pedido: new Date(Date.UTC(2026, 10, 2) - Math.floor(r() * 90) * 864e5).toISOString(), status: "enviado", apertura_id: null, items, items_editados: null });
  }
  const t0 = performance.now();
  const K = kpiAbCalc(datos({ cat, pedidos: ped }), {}, AHORA);
  const ms = performance.now() - t0;
  assertEquals(K.nRows, 1500);
  assert(ms < 10_000, `tardó ${Math.round(ms)} ms`);
});
