// deno-lint-ignore-file no-explicit-any
// Paridad de Esta semana: el viernes de pago (_pagoFecha, _pagoPedidoFecha, _pagoPorFecha, _pagoTxt) en días de la semana y
// fines de mes, los proveedores de la semana (_hoyGrupos), los riesgos (_hoyRiesgos), los borradores (_borrAnalisis) y el
// contexto del detalle (_ctxFila) de la app contra planHoy.ts.
import { assert, assertEquals } from "@std/assert";
import { type DatosPlan, normalizarCfgMotor, zocFuenteBorr } from "./planDatos.ts";
import { planEngDia } from "./planEngine.ts";
import { planLocal } from "./planProv.ts";
import { cafeOrdenes } from "./planCafe.ts";
import { impCorrer } from "./planImp.ts";
import { planSemCalc } from "./planSem.ts";
import {
  borrAnalisis, borrFuenteZoho, ctxFila, hoyGrupos, hoyPedidoTexto, hoyRiesgos, pagoFecha, pagoPedidoFecha, pagoPorFecha, pagoTxt,
} from "./planHoy.ts";
import { app, SIN_APP } from "./pruebas/appVieja.ts";
import { NOMBRES_DATOS } from "./pruebas/fixturesPlan.ts";
import { HOY_IMP, NOMBRES_CAFE, NOMBRES_IMP, NOMBRES_IMP_CFG, STUBS_IMP } from "./pruebas/fixturesImp.ts";
import { datosSem, NOMBRES_HOY, NOMBRES_SEM, SRV_SEM, STUBS_SEM, ZOHO_OC_SEM } from "./pruebas/fixturesSem.ts";

const NOMBRES = [...new Set([...NOMBRES_DATOS, ...NOMBRES_IMP_CFG, ...NOMBRES_IMP, ...NOMBRES_CAFE, ...NOMBRES_SEM, ...NOMBRES_HOY])];
const A = SIN_APP ? null : app(NOMBRES, STUBS_IMP + "\n" + STUBS_SEM, HOY_IMP);
const g = globalThis as any;
const TODAS = { local: true, cafe: true, imp: true };
let carga = 9000;

function prepararApp(R: DatosPlan, c0: any, cafeErr?: string) {
  const cfgA = A._planCfgNormalizar(c0), Ra = { ...R, hoy: A.today(), cargadoEn: ++carga };
  g.__R = Ra;
  g.__UI = { esc: "" };
  g.__C = A._planBuild(Ra, cfgA);
  g.__CC = A._planBuild(Ra, cfgA, { cafe: true });
  g.__CC_ERR = cafeErr;
  A._planSemUI.inc = { ...TODAS };
  A._planSemUI.sem = 12;
}
const fuentes = (R: DatosPlan, cfg: any, cafeErr?: string) => ({
  cafe: () => { if (cafeErr) throw new Error(cafeErr); return cafeOrdenes(R, cfg); },
  imp: () => impCorrer(R, cfg),
});
/** Días de prueba: cada día de la semana, fines de mes, fin de año y febrero. */
const DIAS = ["2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-27", "2026-11-30",
  "2026-12-29", "2026-12-31", "2027-01-01", "2027-02-26", "2027-02-28", "2027-03-01"];
const NOMBRES_PAGO = ["today", "parseLocalDate", "_planIso", "_PLAN_MESES", "_PAGO_MARGEN", "_PAGO_DIAS", "_pagoViernesSig", "_pagoViernesAnt",
  "_pagoFecha", "_pagoTxt", "_pagoPedidoFecha", "_pagoPorFecha"];

Deno.test({ name: "paridad: pagoFecha y pagoTxt = _pagoFecha/_pagoTxt (150 días × 10 créditos, fines de mes y de año)", ignore: SIN_APP }, () => {
  let n = 0;
  for (let i = 0; i < 150; i++) {
    const p = planEngDia("2026-11-01", i);
    for (const dias of [0, 1, 3, 4, 7, 15, 30, 45, 60, "x"]) {
      const a = A._planIso(A._pagoFecha(A.parseLocalDate(p), dias)), s = pagoFecha(p, dias);
      assertEquals(s, a, `${p}/${dias}`);
      assertEquals(pagoTxt(s), A._pagoTxt(A.parseLocalDate(s)));
      n++;
    }
  }
  assertEquals(n, 1500);
});

Deno.test({ name: "paridad: pagoPedidoFecha y pagoPorFecha = _pagoPedidoFecha/_pagoPorFecha con hoy en cada día de prueba (semanas de 7 y 10 días)", ignore: SIN_APP }, () => {
  const R = datosSem(), cfg = normalizarCfgMotor({ zoho_oc: ZOHO_OC_SEM });
  prepararApp(R, { zoho_oc: ZOHO_OC_SEM });
  const S = planSemCalc(planLocal(R, cfg), TODAS, 12, fuentes(R, cfg));
  const CR: Record<string, number> = { "Vasos SA": 30, "Polvos y Bases": 7, "Green Packaging (vasos y tapas)": 60, "CAFICULTORES OMAC": 15 };
  g.__CR = CR;
  for (const hoy of DIAS) {
    const B = app(NOMBRES_PAGO, STUBS_SEM, hoy);
    for (const P of [7, 10]) {
      const c = { semIni: Array.from({ length: 12 }, (_, k) => planEngDia(hoy, P * k)) };
      g.__C = c;
      for (let k = 0; k < 13; k++) assertEquals(pagoPedidoFecha(c, k, hoy), B._planIso(B._pagoPedidoFecha(k)), `${hoy}/${P}/${k}`);
      for (const k of [0, 1, 4]) {
        const a = B._pagoPorFecha(S.provs, k).map((x: any) => ({ f: B._planIso(x.f), m: x.m }));
        assertEquals(pagoPorFecha(S.provs, k, c, hoy, (gr) => CR[gr.nombre] || 0), a, `${hoy}/${P}/semana ${k}`);
      }
    }
  }
});

Deno.test({ name: "paridad: hoyGrupos, hoyRiesgos, ctxFila y borrAnalisis = los de la app (con y sin servidor, café caído)", ignore: SIN_APP }, () => {
  let riesgos = 0, acciones = new Set<string>();
  for (const [nom, c0, cafeErr] of [["defecto", { zoho_oc: ZOHO_OC_SEM }, undefined], ["con_cafe", { zoho_oc: ZOHO_OC_SEM, compra: { excluir_cafe: false } }, undefined],
    ["cafe_caido", { zoho_oc: ZOHO_OC_SEM }, "sin café"]] as [string, any, string | undefined][]) {
    for (const srv of [null, SRV_SEM]) {
      const R = datosSem({ srv: srv as any }), cfg = normalizarCfgMotor(c0);
      prepararApp(R, c0, cafeErr);
      const c = planLocal(R, cfg), S = planSemCalc(c, TODAS, 12, fuentes(R, cfg, cafeErr)), Sa = A._planSemCalc();
      const k0 = `${nom}/${srv ? "srv" : "local"}`;
      for (const k of [0, 1]) {
        A._hoyUI.sem = k;
        assertEquals(hoyGrupos(S, k), A._hoyGrupos(Sa), `${k0} grupos ${k}`);
        S.provs.forEach((gr) => gr.rows.forEach((r) => assertEquals(ctxFila(r, k), A._ctxFila(r, k), `${k0} ctx ${r.sku}`)));
      }
      const rs = hoyRiesgos(c, fuentes(R, cfg, cafeErr));
      assertEquals(rs, A._hoyRiesgos(), `${k0} riesgos`);
      riesgos += rs.length;
      const f = zocFuenteBorr(cfg) as any;
      g.__F = f;
      const b = borrAnalisis(S, f, HOY_IMP);
      assertEquals(b, A._borrAnalisis(Sa), `${k0} borradores`);
      b!.lista.forEach((o) => acciones.add(o.accion));
    }
  }
  assert(riesgos > 0, "ningún riesgo");
  assertEquals([...acciones].sort(), ["ajustar", "borrar", "emitir"]);
});

Deno.test("borrFuenteZoho: pendiente, monto en pesos, nombre del catálogo y el día de CDMX de la última sincronización", () => {
  const f = borrFuenteZoho(datosSem())!;
  assertEquals(f.fecha, "2026-11-13");
  assertEquals(f.ls.length, 5);
  const usd = f.ls.find((l) => l.folio === "COM-OC-03004")!;
  assertEquals([usd.pend, usd.monto, usd.nom], [400, null, "Servilleta"]);
  assertEquals(f.ls.find((l) => l.sku === "LOC-JAR-001")!.monto, 3800);
  assertEquals(borrFuenteZoho({ ocZohoBorr: [], cat: [] }), null);
  // Una sincronización a las 23:30 de CDMX es del mismo día aunque en UTC ya sea el siguiente.
  const tarde = borrFuenteZoho({ cat: [], ocZohoBorr: [{ po_number: "X", sku: "A", vendor_name: null, fecha_oc: null, cantidad: 2, cantidad_recibida: 0, precio: null, synced_at: "2026-11-14T05:30:00Z" }] })!;
  assertEquals(tarde.fecha, "2026-11-13");
});

Deno.test("borrAnalisis con zoho-sync: emitir lo que el plan pide, ajustar lo parcial y borrar lo viejo o lo que no pide", () => {
  const R = datosSem(), cfg = normalizarCfgMotor({}), c = planLocal(R, cfg);
  const S = planSemCalc(c, TODAS, 12, fuentes(R, cfg));
  const b = borrAnalisis(S, borrFuenteZoho(R), HOY_IMP)!;
  const por = Object.fromEntries(b.lista.map((o) => [o.folio, o]));
  assertEquals(por["COM-OC-03001"].accion, "emitir");
  assertEquals(por["COM-OC-03002"].accion, "ajustar");
  assertEquals([por["COM-OC-03003"].accion, por["COM-OC-03003"].dias], ["borrar", 73]);
  assertEquals(b.lista.map((o) => o.accion), [...b.lista.map((o) => o.accion)].sort((x, y) => ["emitir", "ajustar", "borrar"].indexOf(x) - ["emitir", "ajustar", "borrar"].indexOf(y)));
});

Deno.test("pagoFecha: contado los lunes y martes paga ese viernes; del miércoles en adelante, el siguiente; con crédito, el viernes en que vence", () => {
  assertEquals([pagoFecha("2026-11-16", 0), pagoFecha("2026-11-17", 0), pagoFecha("2026-11-18", 0)], ["2026-11-20", "2026-11-20", "2026-11-27"]);
  assertEquals(pagoFecha("2026-11-16", 30), "2026-12-11"); // vence el miércoles 16-dic: el viernes anterior
  assertEquals(pagoFecha("2026-12-28", 4), "2027-01-01"); // el crédito no adelanta el pago antes del mínimo
  assertEquals(pagoFecha("2027-02-24", 0), "2027-03-05"); // cruza fin de febrero
  assertEquals(pagoTxt("2027-01-01"), "vie 1 ene");
  // Sin calendario (plan vacío) el pedido es hoy.
  assertEquals(pagoPedidoFecha({ semIni: [] }, 0, "2026-11-18"), "2026-11-18");
});

Deno.test("hoyPedidoTexto: líneas con SKU, piezas y monto, la semana y el total; contenedores como tales", () => {
  const g0 = { key: "local|vasos sa", pk: "vasos sa", cat: "local", fuente: "", nombre: "Vasos SA", real: true, minimo: 0,
    monto: [0, 0], n: [0, 0], uds: [0, 0], sinCosto: [0, 0],
    rows: [{ sku: "LOC-VAS-001", nombre: "Vaso papel 8 oz", costo: 1.2, sem: [1500, 0] }, { sku: "LOC-TIS-001", nombre: "Tisana", costo: 0, sem: [12, 3] },
      { sku: "CONT-2", nombre: "Contenedor 2 (68 CBM)", costo: 650000, contenedor: true, sem: [0, 1] }] } as any;
  assertEquals(hoyPedidoTexto(g0, 0, "2026-11-13"), "Pedido a Vasos SA — 13 nov\n- LOC-VAS-001 · Vaso papel 8 oz: 1,500 ($1,800)\n- LOC-TIS-001 · Tisana: 12\nTotal estimado: $1,800");
  assertEquals(hoyPedidoTexto(g0, 1, "2026-11-13"), "Pedido a Vasos SA — 13 nov (próxima semana)\n- LOC-TIS-001 · Tisana: 3\n- CONT-2 · Contenedor 2 (68 CBM): 1 contenedor ($650,000)\nTotal estimado: $650,000");
});
