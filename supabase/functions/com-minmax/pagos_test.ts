import { assertEquals, assertRejects } from "@std/assert";
import type { SupabaseClient } from "../_shared/db.ts";
import type { FilaPago } from "../_shared/proyeccion.ts";
import { mergeCfg } from "../_shared/planEngine.ts";
import { calcular, type Entradas } from "./minmax.ts";
import { guardarProyeccion, proyectarYGuardar } from "./pagos.ts";

const fila = (n: number): FilaPago => ({
  tipo: "proyectado", sku: `S${n}`, nombre: "N", vendor_id: "V", vendor_name: "P", fecha_oc: "2026-11-06", fecha_llegada: "2026-11-11",
  fecha_pago: "2026-11-11", cantidad: 1, costo: 10, monto: 10, zoho_po_id: null,
  adelanto_cierre: false, cierre_tarde: false, cierre_id: null, adelanto_minimo: false, bajo_minimo: false,
});
const filas = (n: number) => Array.from({ length: n }, (_, i) => fila(i));

// Doble de db: registra cada llamada; `falla` hace que el insert número N (1-based) devuelva error.
function doble(falla = 0) {
  const llamadas: string[] = [];
  let inserts = 0;
  const db = { from: (t: string) => ({
    insert: (rows: { calculado_at: string }[]) => {
      llamadas.push(`insert ${t} ${rows.length} ${rows[0].calculado_at}`);
      return Promise.resolve({ error: ++inserts === falla ? new Error("insert falló") : null });
    },
    delete: () => ({
      lt: (c: string, v: string) => { llamadas.push(`delete ${c} < ${v}`); return Promise.resolve({ error: null }); },
      eq: (c: string, v: string) => { llamadas.push(`delete ${c} = ${v}`); return Promise.resolve({ error: null }); },
    }),
  }) } as unknown as SupabaseClient;
  return { db, llamadas };
}

Deno.test("guardarProyeccion inserta en lotes de 500 con el mismo calculado_at y luego borra las corridas anteriores", async () => {
  const { db, llamadas } = doble();
  await guardarProyeccion(db, filas(1200), "T1");
  assertEquals(llamadas, [
    "insert com_pago_proyectado 500 T1", "insert com_pago_proyectado 500 T1", "insert com_pago_proyectado 200 T1",
    "delete calculado_at < T1",
  ]);
});

Deno.test("guardarProyeccion con lista vacía no inserta ni borra", async () => {
  const { db, llamadas } = doble();
  await guardarProyeccion(db, [], "T1");
  assertEquals(llamadas, []);
});

Deno.test("guardarProyeccion: si un insert falla borra su propia corrida, lanza el error y no toca las anteriores", async () => {
  const { db, llamadas } = doble(2);
  await assertRejects(() => guardarProyeccion(db, filas(700), "T1"), Error, "insert falló");
  assertEquals(llamadas, ["insert com_pago_proyectado 500 T1", "insert com_pago_proyectado 200 T1", "delete calculado_at = T1"]);
});

// --- proyectarYGuardar con cierres ---------------------------------------------------------------------------
// Base falsa por tabla: cualquier cadena de filtros termina en las filas de la tabla (los filtros no se aplican).
function dbTablas(tablas: Record<string, unknown[]>) {
  const insertados: Record<string, unknown[]> = {};
  const cadena = (t: string) => {
    // deno-lint-ignore no-explicit-any
    const c: any = new Proxy({}, { get: (_o, k) => {
      if (k === "then") return (ok: (v: unknown) => unknown) => ok({ data: tablas[t] ?? [], error: null });
      if (k === "maybeSingle" || k === "single") return () => Promise.resolve({ data: null, error: null });
      return () => c;
    } });
    return c;
  };
  const db = { from: (t: string) => ({
    select: () => cadena(t),
    insert: (rows: unknown[]) => { (insertados[t] ??= []).push(...rows); return Promise.resolve({ error: null }); },
    delete: () => cadena(t),
  }) } as unknown as SupabaseClient;
  return { db, insertados };
}

const cfgP = {
  seg: { dias: 10 }, consumo: { ventana: 30 }, aper: { antelacion: 30, vencida_max: 45 },
  compra: { lt_default: 7, excluir_cafe: true, min_prov: "consolidar" as const, min_ventana_dias: 14 }, inv: { yulius: true },
  auto: { modo: "simulacion" as const, cobertura_dias: 15, max_edad_sync_horas: 2, yulius_alerta_dias: 15, correos: [], pagos_horizonte: 30,
    pagos_base: "llegada" as const, sync_catalogo: "registrar" as const, zoho_cf_minimo: "cf_minimo_de_compra_mxn" },
};
const entradasP: Entradas = {
  hoy: "2026-10-30", cfg: cfgP, plan: mergeCfg({ consumo: { ventana: 30 } }),
  catalogo: [{ sku: "V", estatus: "Compra Recurrente", created_at: "2025-01-01T12:00:00Z", zoho_lead_time: null }],
  leadTimes: { V: 9 },
  pedidos: [{ id: "1", fecha_pedido: "2026-10-20T10:00:00Z", status: "enviado", items: [{ sku: "V", cantidad: 600 }], items_editados: null }],
  idsApertura: [], mapa: {}, mapaPlan: [], primerPedido: "2024-01-01T12:00:00Z", aperturas: [], kitManual: {},
};
// V: 20 pzas/día, LT 9, mín 100, máx 200, 800 en mano → sin compra normal antes del día 35.
const tablasBase = {
  com_minmax: [{ sku: "V", minimo: 100, maximo: 200, venta_diaria: 20, kits_max: 0, lead_time: 9 }],
  com_catalogo: [{ sku: "V", nombre: "Vaso", zoho_item_id: "I1", zoho_vendor_id: "P1", zoho_vendor_name: "Prov 1", costo_unitario: 10,
    zoho_stock: 800, zoho_stock_fisico: 800, saldo_yulius: 0 }],
  com_zoho_proveedor: [{ vendor_id: "P1", dias_credito: 0 }],
};
// Cierre de P1 del día 35 (2026-12-04) al 60 (2026-12-29): U = día 25, R = día 70.
const cierreP1 = { id: 7, vendor_id: "P1", vendor_name: "Prov 1", ini: "2026-12-04", fin: "2026-12-29", skus: null, cancelado: false,
  aviso7_at: null, aviso0_at: "2026-11-01T00:00:00Z" };
const cierreOtro = { id: 3, vendor_id: "P9", vendor_name: "Otro", ini: "2026-11-20", fin: "2026-11-25", skus: null, cancelado: false,
  aviso7_at: null, aviso0_at: null };

Deno.test("proyectarYGuardar resume cada cierre: artículos afectados, U y monto adelantado (ordenados por ini; sin efecto = 0 y null)", async () => {
  const { db } = dbTablas({ ...tablasBase, com_proveedor_cierre: [cierreP1, cierreOtro] });
  const res = await proyectarYGuardar(db, entradasP, calcular(entradasP));
  assertEquals(res.cierres.map((c) => c.id), [3, 7]);
  assertEquals(res.cierres[0], { id: 3, vendor_id: "P9", vendor_name: "Otro", ini: "2026-11-20", fin: "2026-11-25", u: null,
    skus_afectados: 0, monto_adelanto: 0, aviso7_at: null, aviso0_at: null });
  assertEquals(res.cierres[1], { id: 7, vendor_id: "P1", vendor_name: "Prov 1", ini: "2026-12-04", fin: "2026-12-29", u: "2026-11-24",
    skus_afectados: 1, monto_adelanto: 7000, aviso7_at: null, aviso0_at: "2026-11-01T00:00:00Z" });
});

Deno.test("proyectarYGuardar: con horizonte 30 y cierre hasta el día 60, la cobertura ve la demanda hasta R (día 70)", async () => {
  const { db, insertados } = dbTablas({ ...tablasBase, com_proveedor_cierre: [cierreP1] });
  await proyectarYGuardar(db, entradasP, calcular(entradasP));
  const filasIns = (insertados["com_pago_proyectado"] ?? []) as FilaPago[];
  const cob = filasIns.filter((f) => f.adelanto_cierre);
  assertEquals(cob.length, 1);
  // día 25: pos = 800 - 20·25 = 300; necesidad = mín 100 + (D(70) - D(25)) = 20·45 = 900 - 300 = 700.
  // Con la curva cortada en H = 30 habría D(70) = D(30) y no compraría nada.
  assertEquals(cob[0].fecha_oc, "2026-11-24");
  assertEquals(cob[0].cantidad, 700);
  assertEquals(cob[0].cierre_id, 7);
});

Deno.test("proyectarYGuardar: con un cierre anterior a menos de un LT, u reporta el día efectivo (el de A) en los dos cierres", async () => {
  // A = 11-20..11-28 (U_A = 11-10). U de 7 = 11-24 cae dentro de A → la cobertura de 7 se compra el 11-10.
  const cierreA = { ...cierreP1, id: 5, ini: "2026-11-20", fin: "2026-11-28", aviso0_at: null };
  const { db, insertados } = dbTablas({ ...tablasBase, com_proveedor_cierre: [cierreP1, cierreA] });
  const res = await proyectarYGuardar(db, entradasP, calcular(entradasP));
  assertEquals(res.cierres.map((c) => [c.id, c.u]), [[5, "2026-11-10"], [7, "2026-11-10"]]);
  const cob = ((insertados["com_pago_proyectado"] ?? []) as FilaPago[]).filter((f) => f.cierre_id != null && f.tipo === "proyectado");
  assertEquals(cob.map((f) => [f.fecha_oc, f.cierre_id]), [["2026-11-10", 7]]);
});

// --- mínimos de compra por proveedor -----------------------------------------------------------------------------
const entradasM: Entradas = entradasP;
const tablasM = { ...tablasBase, com_catalogo: [{ ...tablasBase.com_catalogo[0], zoho_stock: 300, zoho_stock_fisico: 300 }] };
const guardadas = (ins: Record<string, unknown[]>) => ((ins["com_pago_proyectado"] ?? []) as FilaPago[]).filter((f) => f.tipo === "proyectado");

Deno.test("proyectarYGuardar sin mínimos: las filas guardadas son las de proyectar, con las marcas en false", async () => {
  const { db, insertados } = dbTablas({ ...tablasM, com_proveedor_cierre: [] });
  const res = await proyectarYGuardar(db, entradasM, calcular(entradasM));
  const f = guardadas(insertados);
  if (f.length < 2) throw new Error("el escenario debe tener al menos dos compras");
  assertEquals(f.every((x) => x.adelanto_minimo === false && x.bajo_minimo === false), true);
  assertEquals(res.minimos, []);
});

Deno.test("proyectarYGuardar con mínimo: la compra del primer día adelanta la siguiente y el resumen lo cuenta", async () => {
  const base = dbTablas({ ...tablasM, com_proveedor_cierre: [] });
  await proyectarYGuardar(base.db, entradasM, calcular(entradasM));
  const sin = guardadas(base.insertados).sort((a, b) => a.fecha_oc.localeCompare(b.fecha_oc));
  const dia0 = sin[0].fecha_oc, monto0 = sin.filter((f) => f.fecha_oc === dia0).reduce((s, f) => s + f.monto, 0);
  const minimo = monto0 + 1; // la compra del día 0 no alcanza solita
  const { db, insertados } = dbTablas({ ...tablasM, com_zoho_proveedor: [{ vendor_id: "P1", nombre: "Prov 1", dias_credito: 0, minimo_compra: minimo }], com_proveedor_cierre: [] });
  const res = await proyectarYGuardar(db, entradasM, calcular(entradasM));
  const f = guardadas(insertados);
  const ade = f.filter((x) => x.adelanto_minimo);
  assertEquals(ade.length >= 1, true);
  assertEquals(ade.every((x) => x.fecha_oc === dia0), true);
  assertEquals(res.minimos.length, 1);
  assertEquals(res.minimos[0].vendor_id, "P1");
  assertEquals(res.minimos[0].vendor_name, "Prov 1");
  assertEquals(res.minimos[0].minimo, minimo);
  assertEquals(res.minimos[0].monto_adelantado > 0, true);
  assertEquals(res.minimos[0].monto_adelantado, Math.round(ade.reduce((s, x) => s + x.monto, 0) * 100) / 100);
});

Deno.test("guardarProyeccion sin las columnas de mínimos: reintenta sin adelanto_minimo/bajo_minimo y guarda todos los lotes", async () => {
  const enviados: Record<string, unknown>[][] = [];
  const db = { from: () => ({
    insert: (rows: Record<string, unknown>[]) => {
      enviados.push(rows);
      return Promise.resolve({ error: "adelanto_minimo" in rows[0] ? { code: "PGRST204", message: "Could not find the 'adelanto_minimo' column" } : null });
    },
    delete: () => ({ lt: () => Promise.resolve({ error: null }), eq: () => Promise.resolve({ error: null }) }),
  }) } as unknown as SupabaseClient;
  await guardarProyeccion(db, filas(700), "T1");
  // 1.er lote: intento con marcas (falla) + reintento sin ellas; 2.º lote: directo sin marcas.
  assertEquals(enviados.map((l) => [l.length, "adelanto_minimo" in l[0], "bajo_minimo" in l[0]]), [[500, true, true], [500, false, false], [200, false, false]]);
});
