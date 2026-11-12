import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { ZohoError, type ZohoClient } from "../_shared/zoho.ts";
import { type FilaPago, proyectar } from "../_shared/proyeccion.ts";
import { aplicarMinimos } from "../_shared/minimos.ts";
import { sumarDias } from "../_shared/fechas.ts";
import type { Cierre } from "../_shared/cierres.ts";
import {
  ajusteDesdeProyeccion, ajusteMinimoDesdeProyeccion, correoHtml, cuerpoOc, enviarCorreo, type Fila, generar, MSG_MODO_SIMULACION, proponer, skusCerrados,
} from "./generar.ts";

const f = (o: Partial<Fila>): Fila => ({
  sku: "S", nombre: "N", zoho_item_id: "i", zoho_vendor_id: "v1", zoho_vendor_name: "SIMBS", costo: 10,
  fisico: 0, fisicoRespaldo: false, saldo_yulius: 0, enCamino: 0, enOcAbierta: false,
  minimo: 340, maximo: 640, venta_diaria: 20, kits_max: 0, multiplo: null, minimoPzas: null, lead_time: 7, ...o,
});

Deno.test("proponer agrupa por proveedor y calcula disponible como Zoho más Yulius", () => {
  const p = proponer([
    f({ sku: "A", fisico: 300, saldo_yulius: 40 }),                       // disp 340 → pide 300
    f({ sku: "B", fisico: 1000 }),                                        // arriba del mínimo
    f({ sku: "C", zoho_vendor_id: "v2", zoho_vendor_name: "ECOPLATE" }),      // pide 640
  ], true);
  assertEquals(p.porProveedor.map((x) => [x.vendor_id, x.lineas.map((l) => [l.sku, l.cantidad])]),
    [["v1", [["A", 300]]], ["v2", [["C", 640]]]]);
  assertEquals(p.porProveedor[0].monto, 3000);
  assertEquals(p.aCorregir, []);
});

Deno.test("proponer sin Yulius no lo suma", () => {
  const p = proponer([f({ sku: "A", fisico: 300, saldo_yulius: 40 })], false);
  assertEquals(p.porProveedor[0].lineas[0].cantidad, 340);
});

Deno.test("proponer manda a 'a corregir' sin proveedor, sin item o sin costo; respeta OC abierta", () => {
  const p = proponer([
    f({ sku: "A", zoho_vendor_id: null }),
    f({ sku: "B", zoho_item_id: null }),
    f({ sku: "C", costo: null }),
    f({ sku: "D", enOcAbierta: true }),
  ], true);
  assertEquals(p.porProveedor, []);
  assertEquals(p.aCorregir.map((x) => [x.sku, x.motivo]),
    [["A", "sin proveedor en Zoho"], ["B", "no está ligado a Zoho"], ["C", "sin costo"]]);
});

Deno.test("cuerpoOc arma borrador con referencia AUTO y nota de cálculo", () => {
  const p = proponer([f({ sku: "A" })], true).porProveedor[0];
  const b = cuerpoOc(p, "2026-10-30", "L1");
  assertEquals(b.vendor_id, "v1");
  assertEquals(b.reference_number, "AUTO-20261030");
  assertEquals(b.location_id, "L1");
  assertEquals(b.line_items, [{ item_id: "i", quantity: 640, rate: 10 }]);
  assertStringIncludes(String(b.notes), "A: disp 0, en camino 0, mín 340, máx 640, venta/día 20");
});

Deno.test("correoHtml muestra modo, OCs y pendientes", () => {
  const h = correoHtml({ fecha: "2026-10-30", modo: "simulacion",
    creadas: [{ vendor_name: "SIMBS", po_number: null, monto: 3500, lineas: 1 }],
    aCorregir: [{ sku: "X", nombre: "Vaso", cantidad: 5, motivo: "sin costo" }], errores: [] });
  assertStringIncludes(h, "SIMULACIÓN");
  assertStringIncludes(h, "SIMBS");
  assertStringIncludes(h, "$3,500.00");
  assertStringIncludes(h, "sin costo");
});

// Base falsa mínima: responde a las consultas que hace generar() antes de recalcular.
function dbFalsa(opts: { finSync: string | null; okSync?: boolean; creadasHoy: number; modo: "real" | "simulacion" }) {
  const cadena = (resultado: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit", "neq", "not", "in", "gte", "range"]) q[m] = () => q;
    q.maybeSingle = () => Promise.resolve(resultado);
    q.single = () => Promise.resolve(resultado);
    q.then = (r: (x: unknown) => unknown) => Promise.resolve(resultado).then(r);
    return q;
  };
  return {
    from(t: string) {
      if (t === "com_plan_config") return cadena({ data: { config: { auto: { modo: opts.modo, max_edad_sync_horas: 2, correos: [] } } }, error: null });
      if (t === "com_sync_log") return cadena({ data: opts.finSync ? { fin: opts.finSync, ok: opts.okSync ?? true } : null, error: null });
      if (t === "com_oc_auto") return cadena({ count: opts.creadasHoy, data: null, error: null });
      throw new Error("tabla inesperada " + t);
    },
  } as never;
}

Deno.test("generar aborta si el sync tiene más de 2 horas", async () => {
  const ahora = new Date("2026-10-30T13:00:00Z");
  await assertRejects(() => generar(dbFalsa({ finSync: "2026-10-30T10:00:00Z", creadasHoy: 0, modo: "real" }), null,
    { origen: "cron", ahora }), Error, "datos de Zoho viejos (3.0 h)");
  await assertRejects(() => generar(dbFalsa({ finSync: null, creadasHoy: 0, modo: "real" }), null,
    { origen: "cron", ahora }), Error, "sin sync");
  await assertRejects(() => generar(dbFalsa({ finSync: "2026-10-30T12:50:00Z", okSync: false, creadasHoy: 0, modo: "real" }), null,
    { origen: "cron", ahora }), Error, "el último sync con Zoho falló");
});

Deno.test("generar por cron en modo real no repite el mismo día", async () => {
  const r = await generar(dbFalsa({ finSync: "2026-10-30T12:45:00Z", creadasHoy: 2, modo: "real" }), null,
    { origen: "cron", ahora: new Date("2026-10-30T13:00:00Z") });
  assertEquals(r.omitida, "ya corrió hoy");
});

// ---- Base falsa completa: registra inserts y sirve filas para todas las tablas que lee generar() ----
type Datos = {
  modo: "real" | "simulacion"; guardError?: boolean; insertError?: (row: Record<string, unknown>) => boolean;
  minmax: Record<string, unknown>[]; catalogo: Record<string, unknown>[]; ocLineas?: Record<string, unknown>[];
  ocAuto?: Record<string, unknown>[]; creadasHoy?: number; correos?: string[];
  cierres?: Record<string, unknown>[]; pagos?: Record<string, unknown>[]; proveedores?: Record<string, unknown>[];
  sinMigracion?: boolean; // las columnas de mínimos no existen: las consultas que las piden devuelven 42703
};
const ERR_COLUMNA = { code: "42703", message: "column does not exist" };
function dbModelo(d: Datos) {
  const inserts: Record<string, unknown>[] = [];
  const filtrosOcAuto: string[][] = [];
  const filtrosPagos: string[] = [];
  const cadena = (resultado: unknown, filtros?: string[]) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit", "neq", "not", "in", "gte", "gt", "lte", "range"]) {
      q[m] = (...a: unknown[]) => { if (m === "eq" || m === "gt") filtros?.push(`${m}:${a.join("=")}`); return q; };
    }
    q.maybeSingle = () => Promise.resolve(resultado);
    q.single = () => Promise.resolve(resultado);
    q.then = (r: (x: unknown) => unknown) => Promise.resolve(resultado).then(r);
    return q;
  };
  const db = {
    from(t: string) {
      switch (t) {
        case "com_plan_config": return cadena({ data: { config: { auto: { modo: d.modo, max_edad_sync_horas: 2, correos: d.correos ?? [] } } }, error: null });
        case "com_sync_log": return cadena({ data: { inicio: "2026-10-30T12:45:00Z", fin: "2026-10-30T12:50:00Z", ok: true }, error: null });
        case "com_minmax": return cadena({ data: d.minmax, error: null });
        case "com_catalogo": return cadena({ data: d.catalogo, error: null });
        case "com_zoho_oc_lineas": return cadena({ data: d.ocLineas ?? [], error: null });
        case "com_zoho_proveedor": return cadena(d.sinMigracion ? { data: null, error: ERR_COLUMNA } : { data: d.proveedores ?? [], error: null });
        case "com_proveedor_cierre": return cadena({ data: d.cierres ?? [], error: null });
        case "com_pago_proyectado": {
          // maybeSingle() = la consulta del último calculado_at; la lista = las filas de cobertura de ese cálculo.
          let pideMinimos = false;
          const q = cadena({ data: d.pagos ?? [], error: null });
          for (const m of ["eq", "not", "lte", "or"]) {
            q[m] = (...a: unknown[]) => { filtrosPagos.push(`${m}:${a.join("=")}`); return q; };
          }
          const sel = q.select as (...a: unknown[]) => unknown;
          q.select = (...a: unknown[]) => { pideMinimos = String(a[0]).includes("adelanto_minimo"); return sel(...a); };
          q.then = (r: (x: unknown) => unknown) => Promise.resolve(d.sinMigracion && pideMinimos ? { data: null, error: ERR_COLUMNA } : { data: d.pagos ?? [], error: null }).then(r);
          q.maybeSingle = () => Promise.resolve({ data: d.pagos?.length ? { calculado_at: "2026-10-30T12:55:00Z" } : null, error: null });
          return q;
        }
        case "com_oc_auto": {
          const filtros: string[] = [];
          filtrosOcAuto.push(filtros);
          const q = cadena(d.guardError ? { count: null, data: null, error: new Error("falla guard") }
            : { count: d.creadasHoy ?? 0, data: d.ocAuto ?? [], error: null }, filtros);
          q.insert = (row: Record<string, unknown>) => {
            inserts.push(row);
            return Promise.resolve({ error: d.insertError?.(row) ? new Error("falla insert") : null });
          };
          return q;
        }
      }
      throw new Error("tabla inesperada " + t);
    },
  } as never;
  return { db, inserts, filtrosOcAuto, filtrosPagos };
}

const mm = (sku: string) => ({ sku, minimo: 340, maximo: 640, venta_diaria: 20, kits_max: 0 });
const cat = (sku: string, vendor: string) => ({ sku, nombre: sku, zoho_item_id: "item-" + sku, zoho_vendor_id: vendor, zoho_vendor_name: "P-" + vendor,
  costo_unitario: 10, zoho_stock: 0, zoho_stock_fisico: 0, saldo_yulius: 0, multiplo_compra: null, minimo_compra_pzas: null });
const ahora = new Date("2026-10-30T13:00:00Z");
const sinRecalcular = () => Promise.resolve(undefined as never);
const dosProveedores = (): Pick<Datos, "minmax" | "catalogo"> =>
  ({ minmax: [mm("A"), mm("B")], catalogo: [cat("A", "v1"), cat("B", "v2")] });

Deno.test("generar falla si la consulta del candado diario devuelve error", async () => {
  const { db } = dbModelo({ modo: "real", guardError: true, ...dosProveedores() });
  await assertRejects(() => generar(db, () => { throw new Error("no debe crear Zoho"); }, { origen: "cron", ahora, recalcular: sinRecalcular }),
    Error, "falla guard");
});

Deno.test("generar en simulación inserta filas simuladas y no crea cliente Zoho", async () => {
  const { db, inserts } = dbModelo({ modo: "simulacion", ...dosProveedores() });
  const r = await generar(db, () => { throw new Error("no debe crear Zoho"); }, { origen: "manual", ahora, recalcular: sinRecalcular });
  assertEquals(inserts.map((i) => [i.estado, i.vendor_id, i.monto]), [["simulada", "v1", 6400], ["simulada", "v2", 6400]]);
  assertEquals((inserts[0].lineas as { sku: string; cantidad: number }[]).map((l) => [l.sku, l.cantidad]), [["A", 640]]);
  assertEquals([r.ocs, r.lineas, r.modo], [2, 2, "simulacion"]);
});

const zohoStub = (falla?: (vendor: unknown) => boolean) => ({
  post: (_p: string, body: Record<string, unknown>) => {
    if (falla?.(body.vendor_id)) return Promise.reject(new ZohoError("Zoho 500", 500));
    return Promise.resolve({ purchaseorder: { purchaseorder_id: "id-" + body.vendor_id, purchaseorder_number: "PO-" + body.vendor_id } });
  },
}) as unknown as ZohoClient;

Deno.test("generar real: una OC creada y otra con error de Zoho", async () => {
  const { db, inserts } = dbModelo({ modo: "real", ...dosProveedores() });
  const r = await generar(db, () => zohoStub((v) => v === "v2"), { origen: "manual", ahora, recalcular: sinRecalcular });
  assertEquals(inserts.map((i) => [i.estado, i.vendor_id]), [["creada", "v1"], ["error", "v2"]]);
  assertEquals(inserts[0].po_number, "PO-v1");
  assertEquals(inserts[0].zoho_po_id, "id-v1");
  assertStringIncludes(String(inserts[1].error), "Zoho 500");
  assertEquals(r.ocs, 1);
  assertEquals(r.errores.length, 1);
});

Deno.test("generar real: si la OC se creó pero el registro falla, no lanza y reporta el número", async () => {
  const { db } = dbModelo({ modo: "real", insertError: (row) => row.estado === "creada", ...dosProveedores() });
  const r = await generar(db, () => zohoStub(), { origen: "manual", ahora, recalcular: sinRecalcular });
  assertEquals(r.ocs, 2);
  assertEquals(r.errores.length, 2);
  assertStringIncludes(r.errores[0], "OC PO-v1 creada en Zoho pero no se registró");
});

Deno.test("generar: OC abierta (draft) bloquea el pedido del SKU; una cerrada no", async () => {
  const { db, inserts } = dbModelo({ modo: "simulacion", ...dosProveedores(), ocLineas: [
    { sku: "A", status: "draft", cantidad: 100, cantidad_recibida: 0 },
    { sku: "B", status: "closed", cantidad: 100, cantidad_recibida: 0 },
  ] });
  await generar(db, null, { origen: "manual", ahora, recalcular: sinRecalcular });
  assertEquals(inserts.map((i) => i.vendor_id), ["v2"]);
});

Deno.test("generar: OC 'billed' con pendientes bloquea; línea ya recibida completa no", async () => {
  const { db, inserts } = dbModelo({ modo: "simulacion", ...dosProveedores(), ocLineas: [
    { sku: "A", status: "billed", cantidad: 100, cantidad_recibida: 40 },
    { sku: "B", status: "open", cantidad: 100, cantidad_recibida: 100 },
  ] });
  await generar(db, null, { origen: "manual", ahora, recalcular: sinRecalcular });
  assertEquals(inserts.map((i) => i.vendor_id), ["v2"]);
});

Deno.test("generar: OC real creada después del último sync bloquea volver a pedir su SKU", async () => {
  const { db, inserts, filtrosOcAuto } = dbModelo({ modo: "simulacion", ...dosProveedores(),
    ocAuto: [{ lineas: [{ sku: "A", cantidad: 640 }] }] });
  await generar(db, null, { origen: "manual", ahora, recalcular: sinRecalcular });
  assertEquals(inserts.map((i) => i.vendor_id), ["v2"]);
  assertEquals(filtrosOcAuto.some((f) => ["eq:modo=real", "eq:estado=creada", "gt:creada_at=2026-10-30T12:45:00Z"]
    .every((x) => f.includes(x))), true);
});

Deno.test("generar: body modo real con configuración en simulación se rechaza", async () => {
  const { db, inserts } = dbModelo({ modo: "simulacion", ...dosProveedores() });
  await assertRejects(() => generar(db, () => zohoStub(), { origen: "manual", modo: "real", ahora, recalcular: sinRecalcular }),
    Error, MSG_MODO_SIMULACION);
  assertEquals(inserts, []);
});

Deno.test("generar: body modo simulación siempre se permite, aun con configuración real", async () => {
  const { db, inserts } = dbModelo({ modo: "real", ...dosProveedores() });
  const r = await generar(db, () => { throw new Error("no debe crear Zoho"); }, { origen: "manual", modo: "simulacion", ahora, recalcular: sinRecalcular });
  assertEquals(r.modo, "simulacion");
  assertEquals(inserts.map((i) => i.estado), ["simulada", "simulada"]);
});

Deno.test("generar: el cron sigue la configuración aunque el body pida real", async () => {
  const { db, inserts } = dbModelo({ modo: "simulacion", ...dosProveedores() });
  const r = await generar(db, () => { throw new Error("no debe crear Zoho"); }, { origen: "cron", modo: "real", ahora, recalcular: sinRecalcular });
  assertEquals(r.modo, "simulacion");
  assertEquals(inserts.map((i) => i.estado), ["simulada", "simulada"]);
});

Deno.test("generar: el candado diario del cron cuenta OCs reales de cualquier origen; manual sí puede seguir", async () => {
  const cron = dbModelo({ modo: "real", creadasHoy: 1, ...dosProveedores() });
  const r = await generar(cron.db, () => zohoStub(), { origen: "cron", ahora, recalcular: sinRecalcular });
  assertEquals(r.omitida, "ya corrió hoy");
  assertEquals(cron.filtrosOcAuto[0], ["eq:fecha=2026-10-30", "eq:modo=real", "eq:estado=creada"]);
  const manual = dbModelo({ modo: "real", creadasHoy: 1, ...dosProveedores() });
  const r2 = await generar(manual.db, () => zohoStub(), { origen: "manual", ahora, recalcular: sinRecalcular });
  assertEquals(r2.ocs, 2);
});

Deno.test("correoHtml enlaza la OC creada a Zoho cuando hay id", () => {
  const h = correoHtml({ fecha: "2026-10-30", modo: "real",
    creadas: [{ vendor_name: "SIMBS", po_number: "PO-1", zoho_po_id: "123", monto: 10, lineas: 1 }], aCorregir: [], errores: [] });
  assertStringIncludes(h, '<a href="https://books.zoho.com/app/891749429#/purchaseorders/123">PO-1</a>');
});

Deno.test("correoHtml con errores advierte revisar AUTO-fecha en Zoho", () => {
  const h = correoHtml({ fecha: "2026-10-30", modo: "real", creadas: [], aCorregir: [], errores: ["SIMBS: Zoho 500"] });
  assertStringIncludes(h, "Si un error fue 5xx de Zoho, la OC pudo haberse creado: revisa en Zoho las OCs con referencia AUTO-20261030 antes de volver a correr.");
  const sin = correoHtml({ fecha: "2026-10-30", modo: "real", creadas: [], aCorregir: [], errores: [] });
  assertEquals(sin.includes("5xx"), false);
});

// fetch y console.error falsos para probar el envío sin red ni ruido en la salida.
async function conFetch<T>(f: typeof fetch, fn: (logs: string[]) => Promise<T>): Promise<T> {
  const fetchOrig = globalThis.fetch, errOrig = console.error;
  const logs: string[] = [];
  globalThis.fetch = f;
  console.error = (...a: unknown[]) => { logs.push(a.join(" ")); };
  // Portal (plan 2): sin COM_EFECTOS_EXTERNOS=si no hay correos; estas pruebas ejercen el envío con efectos.
  Deno.env.set("COM_EFECTOS_EXTERNOS", "si");
  try { return await fn(logs); } finally { globalThis.fetch = fetchOrig; console.error = errOrig; Deno.env.delete("COM_EFECTOS_EXTERNOS"); }
}

Deno.test("enviarCorreo: respuesta no-ok o excepción registran el error y devuelven false sin lanzar", async () => {
  await conFetch(() => Promise.resolve(new Response("límite excedido", { status: 500 })), async (logs) => {
    assertEquals(await enviarCorreo(["a@x.com"], "s", "h"), false);
    assertStringIncludes(logs[0], "HTTP 500 límite excedido");
  });
  await conFetch(() => Promise.reject(new Error("sin red")), async (logs) => {
    assertEquals(await enviarCorreo(["a@x.com"], "s", "h"), false);
    assertStringIncludes(logs[0], "sin red");
  });
  await conFetch(() => Promise.resolve(new Response("{}", { status: 200 })), async (logs) => {
    assertEquals(await enviarCorreo(["a@x.com"], "s", "h"), true);
    assertEquals(logs, []);
  });
});

Deno.test("generar reporta 'no se pudo enviar el correo' si el envío falla", async () => {
  const { db } = dbModelo({ modo: "simulacion", correos: ["a@x.com"], ...dosProveedores() });
  const r = await conFetch(() => Promise.resolve(new Response("x", { status: 502 })),
    () => generar(db, null, { origen: "manual", ahora, recalcular: sinRecalcular }));
  assertEquals(r.errores, ["no se pudo enviar el correo"]);
});

Deno.test("proponer: el disponible es el físico; el contable no entra", () => {
  // Físico 5 + en camino 10 = 15 ≤ mínimo 340 → pide. Con el contable (12) + 10 = 22 también pediría; lo que fija la prueba es la cantidad.
  const p = proponer([f({ sku: "A", fisico: 5, enCamino: 10 })], false);
  assertEquals(p.porProveedor[0].lineas[0].disponible, 5);
});

// ---- Proveedores sin stock ----
const cierreV = (o: Partial<Cierre> = {}): Cierre =>
  ({ id: 7, vendor_id: "v1", ini: "2026-11-05", fin: "2026-11-20", skus: null, cancelado: false, ...o });

Deno.test("proponer: un SKU cerrado no se pide aunque esté bajo el mínimo", () => {
  const p = proponer([f({ sku: "A" }), f({ sku: "B", zoho_vendor_id: "v2" })], true,
    { cerrados: new Set(["A"]), cobertura: new Map() });
  assertEquals(p.porProveedor.map((x) => [x.vendor_id, x.lineas.map((l) => l.sku)]), [["v2", ["B"]]]);
});

Deno.test("proponer: con cobertura usa su cantidad aunque cantidadAPedir diera 0, y marca la línea", () => {
  const filas = [f({ sku: "A", fisico: 1000 })];
  assertEquals(proponer(filas, true).porProveedor, []);
  const p = proponer(filas, true, { cerrados: new Set(), cobertura: new Map([["A", { cantidad: 90, cierre_id: 7, adelanto: true, tarde: true }]]) });
  assertEquals(p.porProveedor[0].lineas.map((l) => [l.sku, l.cantidad, l.adelanto_cierre, l.cierre_tarde]), [["A", 90, true, true]]);
  assertEquals(p.porProveedor[0].monto, 900);
});

Deno.test("proponer: la cobertura sin costo va a 'a corregir'", () => {
  const p = proponer([f({ sku: "A", costo: null })], true,
    { cerrados: new Set(), cobertura: new Map([["A", { cantidad: 5, cierre_id: 7, adelanto: true, tarde: false }]]) });
  assertEquals(p.aCorregir.map((x) => [x.sku, x.cantidad, x.motivo]), [["A", 5, "sin costo"]]);
});

Deno.test("cuadre: el día 0 de proyectar es igual a la línea de proponer con cierre activo", () => {
  const hoy = "2026-10-30";
  const filas = [
    f({ sku: "A", fisico: 400 }),                                               // cierre próximo, U ya pasó → cobertura tarde hoy
    f({ sku: "B", fisico: 100, zoho_vendor_id: "v2", zoho_vendor_name: "P2" }),  // sin cierre → compra normal
    f({ sku: "C", fisico: 0, zoho_vendor_id: "v3", zoho_vendor_name: "P3" }),    // cerrado hoy
  ];
  const cierres = [cierreV(), cierreV({ id: 8, vendor_id: "v3", ini: "2026-10-25", fin: "2026-11-02" })];
  const lineal = (v: number) => Array.from({ length: 41 }, (_, j) => v * j);
  const proy = proyectar({ hoy, horizonte: 40, base: "llegada", sumarYulius: true, filas, curvas: { A: lineal(20), B: lineal(20), C: lineal(20) },
    kit: {}, fechasKit: [], credito: {}, abiertas: [], ltDefault: 7, cierres });
  const dia0 = new Map<string, number>();
  for (const p of proy.filas) if (p.tipo === "proyectado" && p.fecha_oc === hoy) dia0.set(p.sku, (dia0.get(p.sku) ?? 0) + p.cantidad);
  const ajuste = ajusteDesdeProyeccion(proy.filas, hoy, skusCerrados(filas, cierres, hoy));
  const prop = proponer(filas, true, ajuste);
  const oc = new Map(prop.porProveedor.flatMap((g) => g.lineas.map((l) => [l.sku, l.cantidad] as const)));
  assertEquals(oc, dia0);
  assertEquals([...oc.keys()].sort(), ["A", "B"]);
  assertEquals(oc.get("A")! > 0, true);
});

Deno.test("cierre: hoy dentro del cierre → proponer no incluye el SKU", () => {
  const filas = [f({ sku: "A" })];
  const cierres = [cierreV({ ini: "2026-10-28", fin: "2026-11-03" })];
  const cerrados = skusCerrados(filas, cierres, "2026-10-30");
  assertEquals([...cerrados], ["A"]);
  assertEquals(proponer(filas, true, ajusteDesdeProyeccion([], "2026-10-30", cerrados)).porProveedor, []);
  assertEquals([...skusCerrados(filas, [cierreV({ ini: "2026-10-28", fin: "2026-11-03", cancelado: true })], "2026-10-30")], []);
});

Deno.test("generar con cierre: salta el SKU cerrado y usa la cobertura de la proyección guardada", async () => {
  const { db, inserts, filtrosPagos } = dbModelo({ modo: "simulacion", ...dosProveedores(),
    cierres: [{ id: 7, vendor_id: "v1", ini: "2026-10-28", fin: "2026-11-03", skus: null, cancelado: false }],
    pagos: [{ tipo: "proyectado", sku: "B", fecha_oc: "2026-10-30", cantidad: 55, cierre_id: 9, adelanto_cierre: true, cierre_tarde: false }] });
  const r = await generar(db, null, { origen: "manual", ahora, recalcular: () => Promise.resolve({ proyeccion: { ok: true, calculado_at: "2026-10-30T12:54:00Z" } } as never) });
  assertEquals(inserts.map((i) => [i.vendor_id, (i.lineas as { sku: string; cantidad: number }[]).map((l) => [l.sku, l.cantidad])]), [["v2", [["B", 55]]]]);
  assertEquals(r.errores, []);
  // Lee la corrida que recalcular devolvió (no la más reciente) y aplica los filtros de cobertura por cierre.
  assertEquals(filtrosPagos, ["eq:calculado_at=2026-10-30T12:54:00Z", "eq:tipo=proyectado",
    "or:cierre_id.not.is.null,adelanto_minimo.eq.true,bajo_minimo.eq.true", "lte:fecha_oc=2026-10-30"]);
});

Deno.test("generar: si la proyección falló avisa en errores y solo respeta los SKUs cerrados", async () => {
  const { db, inserts } = dbModelo({ modo: "simulacion", ...dosProveedores(),
    cierres: [{ id: 7, vendor_id: "v1", ini: "2026-10-28", fin: "2026-11-03", skus: null, cancelado: false }] });
  const r = await generar(db, null, { origen: "manual", ahora, recalcular: () => Promise.resolve({ proyeccion: { error: "boom" } } as never) });
  assertEquals(r.errores, ["la simulación falló: las compras de cobertura por cierre no se incluyeron"]);
  assertEquals(inserts.map((i) => i.vendor_id), ["v2"]);
});

Deno.test("correoHtml marca adelantos y cierres tardíos", () => {
  const h = correoHtml({ fecha: "2026-10-30", modo: "simulacion", aCorregir: [], errores: [],
    creadas: [{ vendor_name: "SIMBS", po_number: null, monto: 1, lineas: 2,
      marcadas: [{ sku: "A", adelanto_cierre: true }, { sku: "B", adelanto_cierre: true, cierre_tarde: true }] }] });
  assertStringIncludes(h, "A (adelanto por cierre)");
  assertStringIncludes(h, "B (adelanto por cierre) (cierre: ya no llega antes)");
});

// ---- Mínimos de compra por proveedor ----
const pago = (o: Partial<FilaPago>): FilaPago => ({ tipo: "proyectado", sku: "S", nombre: "S", vendor_id: "v1", vendor_name: "P1",
  fecha_oc: "2026-10-30", fecha_llegada: "2026-11-06", fecha_pago: "2026-11-06", cantidad: 10, costo: 10, monto: 100, zoho_po_id: null,
  adelanto_cierre: false, cierre_tarde: false, cierre_id: null, adelanto_minimo: false, bajo_minimo: false, ...o });

Deno.test("ajusteMinimoDesdeProyeccion: suma por SKU lo adelantado a hoy y junta los proveedores bajo el mínimo", () => {
  const hoy = "2026-10-30";
  const m = ajusteMinimoDesdeProyeccion([
    pago({ sku: "A", cantidad: 5, adelanto_minimo: true }),
    pago({ sku: "A", cantidad: 7, adelanto_minimo: true }),
    pago({ sku: "B", cantidad: 9 }),                                              // no adelantada
    pago({ sku: "C", cantidad: 3, adelanto_minimo: true, fecha_oc: "2026-11-02" }), // futura
    pago({ sku: "D", vendor_id: "v2", bajo_minimo: true }),
    pago({ sku: "E", vendor_id: "v3", bajo_minimo: true, fecha_oc: "2026-11-02" }), // futura
    pago({ sku: "F", vendor_id: "v4", tipo: "comprometido", bajo_minimo: true, adelanto_minimo: true }),
  ], hoy);
  assertEquals([...m.extra], [["A", 12]]);
  assertEquals([...m.bajo], ["v2"]);
});

Deno.test("proponer: suma el extra por mínimo, incluye líneas de base 0 y marca grupo bajo mínimo", () => {
  const filas = [f({ sku: "A", fisico: 300 }), f({ sku: "B", fisico: 1000 }), f({ sku: "C", fisico: 0, zoho_vendor_id: "v2", zoho_vendor_name: "P2" })];
  const p = proponer(filas, true, undefined, { extra: new Map([["A", 50], ["B", 20]]), bajo: new Set(["v2"]) });
  assertEquals(p.porProveedor.map((g) => [g.vendor_id, g.bajo_minimo, g.lineas.map((l) => [l.sku, l.cantidad, l.adelanto_minimo])]),
    [["v1", undefined, [["A", 390, true], ["B", 20, true]]], ["v2", true, [["C", 640, undefined]]]]);
  assertEquals(p.porProveedor[0].monto, 4100);
});

Deno.test("proponer: un SKU cerrado sigue saltado aunque tenga extra; el extra sin costo va a 'a corregir'", () => {
  const m = { extra: new Map([["A", 50], ["B", 8]]), bajo: new Set<string>() };
  const p = proponer([f({ sku: "A" }), f({ sku: "B", fisico: 1000, costo: null })], true,
    { cerrados: new Set(["A"]), cobertura: new Map() }, m);
  assertEquals(p.porProveedor, []);
  assertEquals(p.aCorregir.map((x) => [x.sku, x.cantidad]), [["B", 8]]);
});

Deno.test("cuadre: con mínimos activos, proponer = día 0 de la proyección ajustada, por SKU y por proveedor", () => {
  const hoy = "2026-10-30";
  const filas = [
    f({ sku: "A", fisico: 300 }),                                                   // v1 pide hoy
    f({ sku: "B", fisico: 450 }),                                                   // v1 pide en unos días → se adelanta
    f({ sku: "C", fisico: 450, zoho_vendor_id: "v2", zoho_vendor_name: "P2" }),
    f({ sku: "D", fisico: 100, zoho_vendor_id: "v3", zoho_vendor_name: "P3" }),     // v3: no alcanza el mínimo
  ];
  const lineal = (v: number) => Array.from({ length: 41 }, (_, j) => v * j);
  const proy = proyectar({ hoy, horizonte: 40, base: "llegada", sumarYulius: true, filas, curvas: { A: lineal(20), B: lineal(20), C: lineal(20), D: lineal(20) },
    kit: {}, fechasKit: [], credito: {}, abiertas: [], ltDefault: 7, cierres: [] });
  const ajustadas = aplicarMinimos(proy.filas, { minimos: { v1: 9000, v3: 999999 }, hoy, ventana: 14, modo: "consolidar",
    reprogramar: (_f, nueva) => ({ fecha_llegada: sumarDias(nueva, 7), fecha_pago: sumarDias(nueva, 7) }), cerradoPara: () => false });
  assertEquals(ajustadas.some((x) => x.adelanto_minimo), true);
  assertEquals(ajustadas.some((x) => x.bajo_minimo && x.vendor_id === "v3"), true);
  const dia0 = new Map<string, number>(); const dia0V = new Map<string, number>();
  for (const p of ajustadas) if (p.tipo === "proyectado" && p.fecha_oc === hoy) {
    dia0.set(p.sku, (dia0.get(p.sku) ?? 0) + p.cantidad); dia0V.set(p.vendor_id, (dia0V.get(p.vendor_id) ?? 0) + p.monto);
  }
  const prop = proponer(filas, true, undefined, ajusteMinimoDesdeProyeccion(ajustadas, hoy));
  const oc = new Map(prop.porProveedor.flatMap((g) => g.lineas.map((l) => [l.sku, l.cantidad] as const)));
  assertEquals(oc, dia0);
  assertEquals(new Map(prop.porProveedor.map((g) => [g.vendor_id, g.monto])), dia0V);
  assertEquals(prop.porProveedor.find((g) => g.vendor_id === "v3")?.bajo_minimo, true);
  assertEquals(prop.porProveedor.find((g) => g.vendor_id === "v1")?.lineas.some((l) => l.adelanto_minimo), true);
});

Deno.test("generar con mínimos: aplica lo adelantado y muestra el mínimo en el correo", async () => {
  const { db, inserts, filtrosPagos } = dbModelo({ modo: "simulacion", correos: ["a@x.com"], ...dosProveedores(),
    proveedores: [{ vendor_id: "v2", minimo_compra: 5000 }],
    pagos: [{ tipo: "proyectado", sku: "B", vendor_id: "v2", fecha_oc: "2026-10-30", cantidad: 55, cierre_id: null, adelanto_cierre: false, cierre_tarde: false,
      adelanto_minimo: true, bajo_minimo: true }] });
  let cuerpo = "";
  const r = await conFetch((_u, init) => { cuerpo = String(init?.body ?? ""); return Promise.resolve(new Response("{}", { status: 200 })); },
    () => generar(db, null, { origen: "manual", ahora, recalcular: () => Promise.resolve({ proyeccion: { ok: true, calculado_at: "2026-10-30T12:54:00Z" } } as never) }));
  const v2 = inserts.find((i) => i.vendor_id === "v2")!;
  assertEquals((v2.lineas as { sku: string; cantidad: number; adelanto_minimo?: boolean }[]).map((l) => [l.sku, l.cantidad, l.adelanto_minimo]), [["B", 55 + 640, true]]);
  assertEquals(r.errores, []);
  assertEquals(filtrosPagos.includes("or:cierre_id.not.is.null,adelanto_minimo.eq.true,bajo_minimo.eq.true"), true);
  assertStringIncludes(cuerpo, "Mínimo $5,000.00");
  assertStringIncludes(cuerpo, "no llega al mínimo");
  assertStringIncludes(cuerpo, "adelantado por mínimo");
});

Deno.test("generar: si la proyección falló avisa que no se adelantaron compras por mínimo", async () => {
  const { db } = dbModelo({ modo: "simulacion", ...dosProveedores(), proveedores: [{ vendor_id: "v2", minimo_compra: 5000 }] });
  const r = await generar(db, null, { origen: "manual", ahora, recalcular: () => Promise.resolve({ proyeccion: { error: "boom" } } as never) });
  assertEquals(r.errores, ["la simulación falló: no se adelantaron compras por mínimo de proveedor"]);
});

Deno.test("correoHtml muestra mínimo, OC y 'no llega al mínimo'", () => {
  const h = correoHtml({ fecha: "2026-10-30", modo: "simulacion", aCorregir: [], errores: [],
    creadas: [{ vendor_name: "SIMBS", po_number: null, monto: 3500, lineas: 2, minimo: 5000, bajo_minimo: true,
      marcadas: [{ sku: "A", adelanto_minimo: true }] }] });
  assertStringIncludes(h, "Mínimo $5,000.00 · OC $3,500.00");
  assertStringIncludes(h, "no llega al mínimo");
  assertStringIncludes(h, "A (adelantado por mínimo)");
});

Deno.test("ajusteDesdeProyeccion ignora las filas adelantadas por mínimo (no son cobertura de hoy)", () => {
  const base = { tipo: "proyectado" as const, fecha_oc: "2026-10-30", cierre_id: 7, adelanto_cierre: false, cierre_tarde: false };
  const a = ajusteDesdeProyeccion([
    { ...base, sku: "A", cantidad: 100, adelanto_minimo: false },
    { ...base, sku: "A", cantidad: 300, adelanto_minimo: true },
    { ...base, sku: "B", cantidad: 50, adelanto_minimo: true },
  ], "2026-10-30", new Set());
  assertEquals([...a.cobertura].map(([k, v]) => [k, v.cantidad]), [["A", 100]]);
});

Deno.test("cuadre: cierre y mínimo en el mismo SKU, cobertura movida a hoy, no se cuenta dos veces", () => {
  const hoy = "2026-10-30";
  const filas = [f({ sku: "A", fisico: 100 }), f({ sku: "B", fisico: 450 })];
  const cierres = [cierreV({ ini: "2026-11-12", fin: "2026-11-25" })];
  const lineal = (v: number) => Array.from({ length: 41 }, (_, j) => v * j);
  const proy = proyectar({ hoy, horizonte: 40, base: "llegada", sumarYulius: true, filas, curvas: { A: lineal(20), B: lineal(20) },
    kit: {}, fechasKit: [], credito: {}, abiertas: [], ltDefault: 7, cierres });
  const ajustadas = aplicarMinimos(proy.filas, { minimos: { v1: 20000 }, hoy, ventana: 14, modo: "consolidar",
    reprogramar: (_f, nueva) => ({ fecha_llegada: sumarDias(nueva, 7), fecha_pago: sumarDias(nueva, 7) }), cerradoPara: () => false });
  assertEquals(ajustadas.some((x) => x.adelanto_minimo && x.cierre_id != null && x.fecha_oc === hoy), true);
  const dia0 = new Map<string, number>(); const dia0V = new Map<string, number>();
  for (const p of ajustadas) if (p.tipo === "proyectado" && p.fecha_oc === hoy) {
    dia0.set(p.sku, (dia0.get(p.sku) ?? 0) + p.cantidad); dia0V.set(p.vendor_id, (dia0V.get(p.vendor_id) ?? 0) + p.monto);
  }
  const prop = proponer(filas, true, ajusteDesdeProyeccion(ajustadas, hoy, skusCerrados(filas, cierres, hoy)), ajusteMinimoDesdeProyeccion(ajustadas, hoy));
  const oc = new Map(prop.porProveedor.flatMap((g) => g.lineas.map((l) => [l.sku, l.cantidad] as const)));
  assertEquals(oc, dia0);
  assertEquals(new Map(prop.porProveedor.map((g) => [g.vendor_id, g.monto])), dia0V);
});

Deno.test("generar sin la migración de mínimos: la OC sale igual, sin ajuste, y avisa en errores", async () => {
  const { db, inserts, filtrosPagos } = dbModelo({ modo: "simulacion", sinMigracion: true, ...dosProveedores(),
    cierres: [{ id: 7, vendor_id: "v1", ini: "2026-10-28", fin: "2026-11-03", skus: null, cancelado: false }],
    pagos: [{ tipo: "proyectado", sku: "B", vendor_id: "v2", fecha_oc: "2026-10-30", cantidad: 55, cierre_id: 9, adelanto_cierre: true, cierre_tarde: false }] });
  const r = await generar(db, null, { origen: "manual", ahora, recalcular: () => Promise.resolve({ proyeccion: { ok: true, calculado_at: "2026-10-30T12:54:00Z" } } as never) });
  // v1 cerrado por el cierre; v2 sale con la cobertura del cierre (la consulta vieja, sin marcas de mínimo).
  assertEquals(inserts.map((i) => [i.vendor_id, (i.lineas as { sku: string; cantidad: number }[]).map((l) => [l.sku, l.cantidad])]), [["v2", [["B", 55]]]]);
  assertEquals(r.errores, ["mínimos de proveedor: falta aplicar la migración"]);
  assertEquals(filtrosPagos.some((x) => x.startsWith("not:cierre_id=is")), true);
  assertEquals(filtrosPagos.some((x) => x.startsWith("or:")), true); // el primer intento pedía las marcas
});

Deno.test("generar sin la migración y sin cierres: genera las OCs normales con un solo aviso", async () => {
  const { db, inserts } = dbModelo({ modo: "simulacion", sinMigracion: true, ...dosProveedores(), pagos: [] });
  const r = await generar(db, null, { origen: "manual", ahora, recalcular: () => Promise.resolve({ proyeccion: { ok: true, calculado_at: "2026-10-30T12:54:00Z" } } as never) });
  assertEquals(inserts.map((i) => [i.vendor_id, i.monto]), [["v1", 6400], ["v2", 6400]]);
  assertEquals(r.errores, ["mínimos de proveedor: falta aplicar la migración"]);
});
