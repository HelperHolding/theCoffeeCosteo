import { assertAlmostEquals, assertEquals } from "@std/assert";
import { mergeCfg } from "../_shared/planEngine.ts";
import { calcular, curvasDemanda, type Entradas, escribir } from "./minmax.ts";

const cfg = {
  seg: { dias: 10 }, consumo: { ventana: 30 }, aper: { antelacion: 30, vencida_max: 45 },
  compra: { lt_default: 7, excluir_cafe: true, min_prov: "consolidar" as const, min_ventana_dias: 14 }, inv: { yulius: true },
  auto: { modo: "simulacion" as const, cobertura_dias: 15, max_edad_sync_horas: 2, yulius_alerta_dias: 15, correos: [], pagos_horizonte: 90, pagos_base: "llegada" as const, sync_catalogo: "registrar" as const, zoho_cf_minimo: "cf_minimo_de_compra_mxn" },
};
// Configuración de producción (2026-11): promedio 30 días, divisor por vida, sin crecimiento; el Plan cuenta aperturas.
const produccion = { consumo: { metodo: "promedio", ventana: 30, crecimiento: 0, divisor: "vida", items: "editados",
  tipos: { apertura: true, resurtido: true, sin_vincular: true } }, seg: { dias: 10, metodo: "dias" } };
const base: Entradas = {
  hoy: "2026-10-30", cfg, plan: mergeCfg({ consumo: { ventana: 30 } }),
  catalogo: [
    { sku: "V", estatus: "Compra Recurrente", created_at: "2025-01-01T12:00:00Z", zoho_lead_time: null },
    { sku: "INS-CAF-003", estatus: "Compra Recurrente", created_at: "2025-01-01T12:00:00Z", zoho_lead_time: 5 },
    { sku: "U", estatus: "Compra Unica", created_at: "2025-01-01T12:00:00Z", zoho_lead_time: 5 },
  ],
  leadTimes: { V: 9 },
  pedidos: [
    { id: "1", fecha_pedido: "2026-10-20T10:00:00Z", status: "enviado", items: [{ sku: "V", cantidad: 600 }], items_editados: null },
    { id: "A", fecha_pedido: "2026-10-21T10:00:00Z", status: "enviado", items: [{ sku: "V", cantidad: 4 }], items_editados: null },
  ],
  idsApertura: ["A"], mapa: {}, mapaPlan: [], primerPedido: "2024-01-01T12:00:00Z",
  aperturas: [{ id: "x", estatus: "en_proceso", fecha: "2026-11-20", conPedido: false }],
  kitManual: {},
};

Deno.test("calcular: venta sin aperturas, LT de com_lead_times, kit y exclusiones", () => {
  const r = calcular(base);
  assertEquals(r.kits, [{ sku: "V", promedio_calc: 4, aperturas_muestra: 1 }]);
  assertEquals(r.minmax.map((m) => m.sku), ["V"]);          // café y Compra Unica fuera
  const v = r.minmax[0];
  assertEquals(v.venta_diaria, 20);                          // 600/30, sin el pedido de apertura
  assertEquals(v.lead_time, 9);
  assertEquals(v.kits_min, 4);                               // kit 2026-10-21→hoy, dentro de 19 días
  assertEquals(v.minimo_calc, 20 * 19 + 4);
  assertEquals(v.maximo_calc, 20 * 34 + 4);
  assertEquals(r.aperturasProximas, 1);
});

Deno.test("calcular: con la configuración de producción los pedidos de apertura siguen fuera de la venta", () => {
  const r = calcular({ ...base, plan: mergeCfg(produccion) });
  assertEquals(r.minmax[0].venta_diaria, 20);                // tipos.apertura=true en el Plan, pero aquí entran como kit
  assertEquals(r.minmax[0].minimo_calc, 20 * 19 + 4);
});

Deno.test("calcular: SKU nuevo divide entre su vida (divisor 'vida') como el Plan", () => {
  // alta 25-oct 12:00 CDMX → vida = round(4.5) = 5 días hasta el 30-oct 00:00
  const r = calcular({ ...base, plan: mergeCfg(produccion),
    catalogo: [{ sku: "V", estatus: "Compra Recurrente", created_at: "2026-10-25T18:00:00Z", zoho_lead_time: null }],
    pedidos: [{ id: "1", fecha_pedido: "2026-10-28T18:00:00Z", status: "enviado", items: [{ sku: "V", cantidad: 10 }], items_editados: null }] });
  assertEquals(r.minmax[0].venta_diaria, 2);                 // 10 / 5
  assertEquals(r.minmax[0].minimo_calc, 2 * 19);              // sin pedido de apertura cargado no hay kit
});

Deno.test("calcular: crecimiento y temporalidad del Plan entran al mínimo y al máximo", () => {
  const plan = mergeCfg({ consumo: { ventana: 30, crecimiento: 5 },
    temp: { activa: true, mes: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 1], prefijo: {} } });
  const r = calcular({ ...base, plan });
  // hoy 30-oct: la tasa se mide con factor 1 (octubre) → 600/30 = 20; noviembre pesa ×2; crecimiento (1.05)^((j+15)/30)
  const ff = (j: number) => (j <= 1 || j >= 32 ? 1 : 2) * Math.pow(1.05, (j + 15) / 30); // j=1 → 31-oct, j=32 → 1-dic
  const D = (h: number) => { let s = 0; for (let j = 1; j <= h; j++) s += 20 * ff(j); return s; };
  const v = r.minmax[0];
  assertAlmostEquals(v.minimo_calc, D(19) + 4, 0.01);
  assertAlmostEquals(v.maximo_calc, D(34) + 4, 0.01);
  assertAlmostEquals(v.venta_diaria, D(19) / 19, 0.01);
});

Deno.test("calcular: lead time con decimales se redondea hacia arriba como en el Plan", () => {
  const r = calcular({ ...base, leadTimes: { V: 8.2 } });
  assertEquals(r.minmax[0].minimo_calc, 20 * 19 + 4);        // ⌈8.2⌉ + 10 = 19 días
  assertEquals(r.minmax[0].lead_time, 8.2);
});

Deno.test("calcular: sin ventas el mínimo es solo el kit", () => {
  const r = calcular({ ...base, pedidos: [] });
  assertEquals(r.minmax[0].venta_diaria, 0);
  assertEquals(r.minmax[0].minimo_calc, 0);                  // sin pedidos de apertura cargados tampoco hay kit
});

Deno.test("calcular: LT de Zoho manda sobre com_lead_times y el kit manual sobre el calculado", () => {
  const r = calcular({ ...base,
    catalogo: [{ sku: "V", estatus: "Compra Recurrente", created_at: "2025-01-01", zoho_lead_time: 3 }],
    kitManual: { V: 10 } });
  assertEquals(r.minmax[0].lead_time, 3);
  assertEquals(r.minmax[0].kits_min, 10);
});

Deno.test("calcular: sin LT en ningún lado usa lt_default y lo anota", () => {
  const r = calcular({ ...base, leadTimes: {} });
  assertEquals(r.minmax[0].lead_time, 7);
  assertEquals(r.minmax[0].nota, "lead time por defecto");
});

function dbEscritura() {
  const ops: string[] = [];
  const db = {
    from: (t: string) => ({
      upsert: () => { ops.push("upsert:" + t); return Promise.resolve({ error: null }); },
      delete: () => ({ not: () => { ops.push("delete:" + t); return Promise.resolve({ error: null }); } }),
    }),
  } as never;
  return { db, ops };
}

const sinSerie = { u: {}, hist: 30, vida: {}, sinMapa: 0 };

Deno.test("escribir: sin filas de mín/máx no borra la tabla", async () => {
  const { db, ops } = dbEscritura();
  await escribir(db, { kits: [], minmax: [], sinMapa: 0, aperturasProximas: 0, kitUsado: {}, fechasKit: [], serie: sinSerie }, "2026-10-30T12:30:00Z");
  assertEquals(ops, []);
});

Deno.test("escribir: con filas hace upsert y limpia las no vigentes", async () => {
  const { db, ops } = dbEscritura();
  await escribir(db, { kits: [], sinMapa: 0, aperturasProximas: 0, kitUsado: {}, fechasKit: [], serie: sinSerie, minmax: [{ sku: "V", venta_diaria: 1, lead_time: 7,
    kits_min: 0, kits_max: 0, minimo_calc: 17, maximo_calc: 32, nota: null }] }, "2026-10-30T12:30:00Z");
  assertEquals(ops, ["upsert:com_minmax", "delete:com_minmax"]);
});

const cat1 = (x: Record<string, unknown>) => [{ sku: "V", estatus: "Compra Recurrente", created_at: "2025-01-01T12:00:00Z", zoho_lead_time: null, ...x }];
Deno.test("calcular: cantidad_por_apertura del catálogo fija el kit sin kit manual", () => {
  const r = calcular({ ...base, catalogo: cat1({ cantidad_por_apertura: 5 }) });
  assertEquals(r.kitUsado, { V: 5 });
  assertEquals(r.minmax[0].kits_min, 5);
});
Deno.test("calcular: el kit manual de com_kit_apertura gana a cantidad_por_apertura", () => {
  const r = calcular({ ...base, catalogo: cat1({ cantidad_por_apertura: 5 }), kitManual: { V: 2 } });
  assertEquals(r.kitUsado, { V: 2 });
});
Deno.test("calcular: dias_seguridad del artículo sustituye al global y alarga el horizonte", () => {
  const g = calcular({ ...base, catalogo: cat1({ dias_seguridad: null }) }).minmax[0];
  const s = calcular({ ...base, catalogo: cat1({ dias_seguridad: 20 }) }).minmax[0];
  assertEquals(s.minimo_calc > g.minimo_calc, true);
  assertEquals(s.minimo_calc, 20 * 29 + 4);                  // ⌈9⌉ + 20 = 29 días
});
Deno.test("calcular: sin cantidad_por_apertura ni dias_seguridad queda igual que antes", () => {
  const r = calcular({ ...base, catalogo: cat1({ cantidad_por_apertura: null, dias_seguridad: null }) });
  assertEquals(r.minmax[0].minimo_calc, 20 * 19 + 4);
  assertEquals(r.kitUsado, { V: 4 });
});

Deno.test("calcular: cantidad_por_apertura en 0 cuenta como no capturado y usa el promedio calculado", () => {
  const r = calcular({ ...base, catalogo: cat1({ cantidad_por_apertura: 0 }) });
  assertEquals(r.kitUsado, { V: 4 });
  assertEquals(r.minmax[0], calcular({ ...base, catalogo: cat1({ cantidad_por_apertura: null }) }).minmax[0]);
});
Deno.test("calcular: dias_seguridad negativo o NaN usa el global", () => {
  const g = calcular(base).minmax[0].minimo_calc;
  assertEquals(calcular({ ...base, catalogo: cat1({ dias_seguridad: -1 }) }).minmax[0].minimo_calc, g);
  assertEquals(calcular({ ...base, catalogo: cat1({ dias_seguridad: NaN }) }).minmax[0].minimo_calc, g);
});

Deno.test("calcular: kitUsado (manual o promedio) y fechasKit para la proyección de pagos", () => {
  const r = calcular(base);
  assertEquals(r.kitUsado, { V: 4 });
  assertEquals(r.fechasKit.length, r.aperturasProximas);
  assertEquals(calcular({ ...base, kitManual: { V: 7 } }).kitUsado, { V: 7 });
});

Deno.test("curvasDemanda: D(0)=0, no decrece y coincide con la demanda del mínimo", () => {
  const c = curvasDemanda(base, calcular(base).serie, 20, ["V"])["V"];
  assertEquals(c.length, 21);
  assertEquals(c[0], 0);
  for (let h = 1; h < c.length; h++) assertEquals(c[h] >= c[h - 1], true);
  const v = calcular(base).minmax[0];
  const hMin = Math.ceil(v.lead_time) + base.cfg.seg.dias; // 9 + 10
  assertAlmostEquals(c[hMin], v.minimo_calc - v.kits_min, 0.01); // el mínimo se guarda redondeado a 2 decimales
});
