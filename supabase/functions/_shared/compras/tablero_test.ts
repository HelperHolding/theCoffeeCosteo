// supabase/functions/_shared/compras/tablero_test.ts
import { assertEquals } from "@std/assert";
import {
  type DatosCompras, type FiltrosCompras, type OcT, armarTablero, indicadores, periodoAnterior, periodoDe, periodos,
  porLlegar, proveedores, semaforo, serie, vencidas,
} from "./tablero.ts";
import { ocDesdeDetalle } from "./reglas.ts";

const oc = (o: Partial<OcT> = {}): OcT => ({
  zoho_po_id: "P1", folio: "COM-OC-1", proveedor: "Prov A", comprador: "CC", emision: "2026-11-17", arribo: "2026-11-19",
  estado: "open", received_status: "received", monto_ins: 1000, por_categoria: { CAF: 1000 }, es_registro: false, ...o,
});
const base = (): DatosCompras => ({
  ocs: [
    oc(),
    oc({ zoho_po_id: "P2", folio: "COM-OC-2", proveedor: "Prov B", comprador: "VP", emision: "2026-11-05", arribo: "2026-11-10", monto_ins: 500, por_categoria: { DES: 500 } }),
    oc({ zoho_po_id: "P3", folio: "COM-OC-3", emision: "2026-11-18", arribo: null, monto_ins: 200, por_categoria: { CAF: 200 } }),
    oc({ zoho_po_id: "P4", folio: "COM-OC-4", estado: "draft", emision: "2026-11-18" }),
    oc({ zoho_po_id: "P5", folio: "COM-OC-5", es_registro: true, emision: "2026-11-18" }),
    oc({ zoho_po_id: "P6", folio: "COM-OC-6", emision: "2026-11-19", arribo: "2026-11-20", received_status: "", monto_ins: 300, por_categoria: { CAF: 300 } }),
  ],
  recepciones: [
    { zoho_po_id: "P1", fecha: "2026-11-19", monto: 1160, por_categoria: { CAF: 1160 } },
    { zoho_po_id: "P2", fecha: "2026-11-17", monto: 580, por_categoria: { DES: 580 } },
    { zoho_po_id: "P3", fecha: "2026-11-20", monto: 232, por_categoria: { CAF: 232 } },
    { zoho_po_id: "P5", fecha: "2026-11-18", monto: 9999, por_categoria: { CAF: 9999 } },
  ],
  ventas: [
    { semana: "2026-11-09", venta_total_ci: 3000, por_categoria_ci: { CAF: 1000 } },
    { semana: "2026-11-16", venta_total_ci: 4000, por_categoria_ci: { CAF: 2000, DES: 1000 } },
  ],
  lineas: [{ zoho_po_id: "P6", sku: "INS-CAF-001", nombre: "Café", pendiente: 5 }, { zoho_po_id: "P6", sku: "INS-CAF-002", nombre: "Otro", pendiente: 0 }],
});
const f = (o: Partial<FiltrosCompras> = {}): FiltrosCompras => ({ periodo: "2026-11-16", categoria: null, proveedor: null, comprador: null, ...o });
const sem = periodoDe("2026-11-16", "2026-11-26");

Deno.test("periodoDe: semana, mes y omisión (semana cerrada anterior)", () => {
  assertEquals([sem.tipo, sem.ini, sem.fin, sem.lunes], ["semana", "2026-11-16", "2026-11-22", ["2026-11-16"]]);
  const mes = periodoDe("2026-11", "2026-11-26");
  assertEquals([mes.tipo, mes.lunes, mes.ini, mes.fin], ["mes", ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23", "2026-11-30"], "2026-11-02", "2026-12-06"]);
  assertEquals(periodoDe(undefined, "2026-11-26").clave, "2026-11-16");
  assertEquals(periodoDe("basura", "2026-11-26").clave, "2026-11-16");
  assertEquals(periodoDe("2026-11-18", "2026-11-26").clave, "2026-11-16"); // un día que no es lunes cae en su semana
  assertEquals(periodoAnterior(sem).clave, "2026-11-09");
  assertEquals(periodoAnterior(mes).clave, "2026-10");
});

Deno.test("periodos: semanas guardadas y sus meses, lo más reciente primero", () => {
  assertEquals(periodos(["2026-11-09", "2026-11-16", "2026-10-26"]).map((p) => p.clave), ["2026-11-16", "2026-11-09", "2026-10-26", "2026-11", "2026-10"]);
});

Deno.test("semaforo: meta 45–55%, ±5 pp ámbar, null sin venta", () => {
  assertEquals([0.45, 0.55, 0.42, 0.6, 0.39, 0.61, null].map(semaforo), ["ok", "ok", "cerca", "cerca", "fuera", "fuera", null]);
});

Deno.test("indicadores: compras sin registro, llegadas, a tiempo con sin fecha, lead y mayor compra", () => {
  const k = indicadores(base(), f(), sem);
  assertEquals(k.venta, 4000);
  assertEquals(k.compras, 1160 + 580 + 232);
  assertEquals(k.ratio, (1160 + 580 + 232) / 4000);
  assertEquals(k.semaforo, "ok");
  assertEquals(k.llegaron, { n: 3, mismas: 2, antes: 1 });
  assertEquals(k.entregas, { aTiempo: 1, tarde: 1, sinFecha: 1, pct: 0.5 });
  assertEquals(k.lead, Math.round(((2 + 12 + 2) / 3) * 10) / 10);
  assertEquals(k.mayor, { proveedor: "Prov A", monto: 1392 });
});

Deno.test("indicadores: categoría usa sus montos; proveedor y comprador no tocan la venta", () => {
  const k = indicadores(base(), f({ categoria: "CAF", proveedor: "Prov A" }), sem);
  assertEquals([k.venta, k.compras, k.llegaron.n], [2000, 1392, 2]);
  const v = indicadores(base(), f({ comprador: "Nadie" }), sem);
  assertEquals([v.venta, v.compras, v.ratio, v.llegaron.n, v.lead, v.mayor], [4000, 0, 0, 0, null, null]);
});

Deno.test("indicadores: periodo sin venta guardada da ratio null y sin semáforo", () => {
  const k = indicadores(base(), f(), periodoDe("2026-08-03", "2026-11-26"));
  assertEquals([k.venta, k.ratio, k.semaforo, k.entregas.pct], [0, null, null, null]);
});

Deno.test("vencidas y por llegar: abiertas, con artículos pendientes", () => {
  assertEquals(vencidas(base(), f(), "2026-11-26"), { n: 1, monto: 300 });
  const pl = porLlegar(base(), f(), "2026-11-26");
  assertEquals(pl.map((x) => [x.folio, x.estado, x.articulos.length]), [["COM-OC-6", "Vencida", 1]]);
  assertEquals(porLlegar(base(), f(), "2026-11-19")[0].estado, "En plazo");
});

Deno.test("proveedores: OCs emitidas en el periodo; borradores fuera; registro aparte", () => {
  const p = proveedores(base(), f(), sem, "2026-11-26");
  assertEquals(p[0], { proveedor: "Prov A", ocs: 3, monto: 1500, registro: 1, recibidas: 2, aTiempo: 1, atrasadas: 0, pendVencidas: 1, pendEnPlazo: 0, lead: 2 });
  assertEquals(p.length, 1);
});

Deno.test("serie: 16 semanas que terminan en el periodo, presupuesto 50%", () => {
  const s = serie(base(), f(), sem);
  assertEquals(s.length, 16);
  assertEquals(s[15], { semana: "2026-11-16", venta: 4000, compras: 1972, presupuesto: 2000 });
  assertEquals(s[14].semana, "2026-11-09");
});

Deno.test("armarTablero: opciones con los valores de OCs válidas, ordenados", () => {
  const t = armarTablero(base(), f(), "2026-11-26");
  assertEquals(t.opciones.proveedores, ["Prov A", "Prov B"]);
  assertEquals(t.opciones.compradores, ["CC", "VP"]);
  assertEquals(t.anterior.clave, "2026-11-09");
  assertEquals(t.kAnt.venta, 3000);
});

// Paridad con Gestion_Compras_Comercializadora_41.html (__DATA__.entregas_oc y ocs_proveedor, semana 16–22 nov).
const fx = JSON.parse(await Deno.readTextFile(new URL("../pruebas/compras-2026-11.json", import.meta.url)));
const filas = fx.ocs.map((po: unknown) => ocDesdeDetalle(po, fx.recepciones ?? {}));
const dFx: DatosCompras = {
  ocs: filas.map((x: { oc: OcT }) => x.oc),
  recepciones: filas.flatMap((x: { recepciones: { zoho_po_id: string; fecha: string; monto: number; por_categoria: Record<string, number> }[] }) => x.recepciones),
  ventas: [], lineas: [],
};

Deno.test("paridad: entregas 16–22 nov (13 llegaron, 8 a tiempo, 5 tarde, lead 9.1, 3 emitidas en la semana)", () => {
  const k = indicadores(dFx, f(), sem);
  assertEquals(k.llegaron, { n: 13, mismas: 3, antes: 10 });
  assertEquals([k.entregas.aTiempo, k.entregas.tarde], [8, 5]);
  assertEquals(k.lead, 9.1);
  assertEquals(Math.round(k.compras), 477634);
});

// El tablero original suma las OCs elaboradas SIN IVA (1,599,653, verificado exacto con rate × cantidad); aquí van con IVA como el resto (spec §7).
Deno.test("paridad: OCs por proveedor 16–22 nov suman 20 OCs y 2 de registro; monto con IVA 1,643,942 (el tablero, sin IVA: 1,599,653)", () => {
  const p = proveedores(dFx, f(), sem, "2026-11-23");
  assertEquals(p.reduce((a, x) => a + x.ocs, 0), 20);
  assertEquals(Math.round(p.reduce((a, x) => a + x.monto, 0)), 1643942);
  assertEquals(p.reduce((a, x) => a + x.registro, 0), 2);
});
