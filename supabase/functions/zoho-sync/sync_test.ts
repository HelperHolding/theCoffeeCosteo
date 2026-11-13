import { assertEquals, assertRejects, assertStringIncludes } from "@std/assert";
import { ZohoError } from "../_shared/zoho.ts";
import { avisarRachaFallas, filasCatalogo, resolverProveedores, filasOc, filasProveedor, ocAbierta, ocParaSincronizar, type OcZoho, SKU_MARCADOR, sincronizar, syncReciente } from "./sync.ts";

Deno.test("filasCatalogo liga por SKU, separa desconocidos y sin SKU", () => {
  const r = filasCatalogo([
    { item_id: "1", sku: "INS-DES-021", stock_on_hand: 36, actual_available_stock: 30, vendor_id: "v1", vendor_name: "SIMBS", cf_lead_time_proveedor: "60" },
    { item_id: "2", sku: "NUEVO-1", stock_on_hand: 5 },
    { item_id: "3", stock_on_hand: 1 },
    { item_id: "4", sku: "INS-CAF-003", stock_on_hand: -2, actual_available_stock: -3, cf_lead_time_proveedor: "" },
  ], new Set(["INS-DES-021", "INS-CAF-003"]), "2026-10-30T12:00:00Z");
  assertEquals(r.filas, [
    { sku: "INS-DES-021", zoho_item_id: "1", zoho_stock: 36, zoho_stock_fisico: 30, zoho_vendor_id: "v1", zoho_vendor_name: "SIMBS", zoho_lead_time: 60, zoho_sync_at: "2026-10-30T12:00:00Z" },
    { sku: "INS-CAF-003", zoho_item_id: "4", zoho_stock: -2, zoho_stock_fisico: -3, zoho_vendor_id: null, zoho_vendor_name: null, zoho_lead_time: null, zoho_sync_at: "2026-10-30T12:00:00Z" },
  ]);
  assertEquals(r.desconocidos, ["NUEVO-1"]);
  assertEquals(r.sinSku, 1);
});

Deno.test("filasCatalogo: físico ausente, vacío o no numérico se guarda como null (nunca 0)", () => {
  const r = filasCatalogo([
    { item_id: "1", sku: "A", stock_on_hand: 12 },
    { item_id: "2", sku: "B", stock_on_hand: 5, actual_available_stock: "" as unknown as number },
    { item_id: "3", sku: "C", stock_on_hand: 7, actual_available_stock: "x" as unknown as number },
    { item_id: "4", sku: "D", stock_on_hand: 9, actual_available_stock: 0 },
  ], new Set(["A", "B", "C", "D"]), "2026-11-07T12:00:00Z");
  assertEquals(r.filas.map((f) => [f.sku, f.zoho_stock, f.zoho_stock_fisico]), [["A", 12, null], ["B", 5, null], ["C", 7, null], ["D", 9, 0]]);
});

Deno.test("filasCatalogo: vendor_id directo, resolución por nombre, fallback de plataforma y sin resolver", () => {
  const resolver = resolverProveedores([
    { contact_id: "c-inactivo", contact_name: "Comercializadora Simbs (USD)", status: "inactive" },
    { contact_id: "c1", contact_name: "COMERCIALIZADORA SIMBS (USD)", status: "active" },
    { contact_id: "c2", contact_name: "Café Ñandú", company_name: "Tostadores S.A.", status: "active" },
  ]);
  const r = filasCatalogo([
    { item_id: "1", sku: "A", vendor_id: "directo", vendor_name: "X" },
    { item_id: "2", sku: "B", vendor_name: "Comercializadora  Simbs (usd) " },
    { item_id: "3", sku: "C" },
    { item_id: "4", sku: "D", vendor_name: "Proveedor Fantasma" },
    { item_id: "5", sku: "E", vendor_name: "cafe nandu" },
    { item_id: "6", sku: "F" },
  ], new Set("ABCDEF".split("")), "t", resolver, { C: "tostadores s.a.", D: "Otro", F: null });
  const por = Object.fromEntries(r.filas.map((f) => [f.sku, [f.zoho_vendor_id, f.zoho_vendor_name]]));
  assertEquals(por.A, ["directo", "X"]);
  assertEquals(por.B, ["c1", "Comercializadora  Simbs (usd) "]);
  assertEquals(por.C, ["c2", "tostadores s.a."]);
  assertEquals(por.D, [null, "Proveedor Fantasma"]);
  assertEquals(por.E, ["c2", "cafe nandu"]);
  assertEquals(por.F, [null, null]);
  assertEquals(r.proveedoresSinId, ["Proveedor Fantasma"]);
});

Deno.test("filasOc usa sku de la línea o el del item, suma líneas repetidas y marca AUTO", () => {
  const filas = filasOc({
    purchaseorder_id: "p1", purchaseorder_number: "OC-1", status: "draft", last_modified_time: "t",
    vendor_id: "v1", vendor_name: "SIMBS", delivery_date: "2026-11-10", reference_number: "AUTO-20261030",
    line_items: [
      { item_id: "1", quantity: 10, quantity_received: 2 },
      { item_id: "1", quantity: 5 },
      { item_id: "9", sku: "X-9", quantity: 1 },
    ],
  }, { "1": "INS-DES-021" }, "2026-10-30T12:00:00Z");
  assertEquals(filas.length, 2);
  assertEquals(filas[0], { zoho_po_id: "p1", po_number: "OC-1", status: "draft", po_modified: "t", vendor_id: "v1",
    vendor_name: "SIMBS", sku: "INS-DES-021", cantidad: 15, cantidad_recibida: 2, fecha_entrega: "2026-11-10",
    es_auto: true, synced_at: "2026-10-30T12:00:00Z", precio: null, fecha_oc: null });
  assertEquals(filas[1].sku, "X-9");
});

// --- sincronizar con fakes ---
type Fila = Record<string, unknown>;
type OpDb = { tabla: string; accion: string; valor?: unknown; o?: unknown; filtros: unknown[][]; ret?: string; uno?: boolean };
type Escenario = {
  sinCoincidir?: boolean; // el update condicional de com_zoho_proveedor no encuentra la fila (cambió mientras tanto)
  proveedores?: Fila[]; catalogo?: Fila[]; leadTimes?: Fila[]; lineas?: Fila[]; movs?: Fila[]; config?: unknown; log?: Fila[]; cambios?: Fila[];
  falla?: Record<string, string>; // "tabla:accion" → mensaje de error
  sinFilas?: number[]; // ids cuyo update/delete condicional no afecta filas (cambiaron mientras tanto)
};
/** Base falsa encadenable: registra cada consulta al ejecutarse y responde según el escenario. */
function dbEscenario(e: Escenario) {
  const log: OpDb[] = [];
  let nuevoId = 1000;
  const responder = (op: OpDb): { data?: unknown; error: unknown } => {
    const m = e.falla?.[`${op.tabla}:${op.accion}`];
    if (m) return { data: null, error: { message: m } };
    if (op.accion === "select") {
      if (op.tabla === "com_plan_config") return { data: { config: e.config ?? {} }, error: null };
      if (op.tabla === "com_sync_log") return { data: op.uno ? (e.log ?? [])[0] ?? null : e.log ?? [], error: null };
      if (op.tabla === "com_sync_cambios") return { data: e.cambios ?? [], error: null };
      const enIds = op.filtros.find((f) => f[0] === "in" && f[1] === "id")?.[2] as unknown[] | undefined;
      const tablas: Record<string, Fila[] | undefined> = {
        com_zoho_proveedor: e.proveedores, com_catalogo: e.catalogo, com_lead_times: e.leadTimes, com_zoho_oc_lineas: e.lineas, com_movimientos: e.movs,
      };
      const datos = tablas[op.tabla] ?? [];
      return { data: enIds ? datos.filter((r) => enIds.includes(r.id)) : datos, error: null };
    }
    if (e.sinCoincidir && op.accion === "update" && op.tabla === "com_zoho_proveedor") return { data: [], error: null };
    if (!op.ret) return { error: null };
    if (op.accion === "insert") return { data: (op.valor as Fila[]).map((r) => ({ id: nuevoId++, ...r })), error: null };
    const clave = op.filtros.find((f) => f[0] === "eq" && (f[1] === "id" || f[1] === "sku"));
    if (clave?.[1] === "id" && e.sinFilas?.includes(clave[2] as number)) return { data: [], error: null };
    return { data: [{ [String(clave?.[1])]: clave?.[2] }], error: null };
  };
  const db = {
    from(tabla: string) {
      const op: OpDb = { tabla, accion: "", filtros: [] };
      const q: Record<string, unknown> = {};
      for (const m of ["eq", "is", "in", "not", "lt", "neq", "order", "range", "limit"]) {
        q[m] = (...a: unknown[]) => { op.filtros.push([m, ...a]); return q; };
      }
      q.select = (cols?: string) => { if (op.accion) op.ret = cols ?? "*"; else { op.accion = "select"; op.valor = cols; } return q; };
      for (const a of ["update", "insert", "upsert"]) q[a] = (v: unknown, o?: unknown) => { op.accion = a; op.valor = v; op.o = o; return q; };
      q.delete = () => { op.accion = "delete"; return q; };
      q.single = q.maybeSingle = () => { op.uno = true; return q; };
      q.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
        log.push(op);
        return Promise.resolve(responder(op)).then(ok, ko);
      };
      return q;
    },
  };
  return { db: db as never, log };
}
function fakeDb(prev: Record<string, unknown>[], fallaProveedor = false) {
  const f = dbEscenario({ catalogo: [{ sku: "A-1" }], lineas: prev,
    falla: fallaProveedor ? { "com_zoho_proveedor:upsert": "permiso denegado" } : {} });
  return {
    db: f.db,
    get ops() {
      return f.log.flatMap((op): string[] => {
        if (op.accion === "upsert") {
          return op.tabla === "com_zoho_proveedor" ? ["upsert:proveedor"] : ["upsert:" + JSON.stringify(op.o), "rows:" + JSON.stringify(op.valor)];
        }
        if (op.accion !== "delete") return [];
        const lt = op.filtros.find((x) => x[0] === "lt");
        return lt ? [`delete.lt:${lt[1]}:${lt[2]}`] : op.filtros.some((x) => x[0] === "neq") ? ["delete.neq"] : [];
      });
    },
    get upserts() {
      return f.log.filter((op) => op.accion === "upsert").map((op) => ({ tabla: op.tabla, rows: op.valor as Record<string, unknown>[], o: op.o }));
    },
  };
}
function fakeZoho() {
  return {
    llamadas: 0,
    listAll: (path: string) => Promise.resolve(path === "/contacts" ? [] : path === "/items"
      ? [{ item_id: "1", sku: "A-1", stock_on_hand: 3 }]
      : [{ purchaseorder_id: "p1", purchaseorder_number: "OC-1", status: "open", last_modified_time: "t1", vendor_id: "v", vendor_name: "V" }]),
    get: () => Promise.resolve({ purchaseorder: {
      purchaseorder_id: "p1", purchaseorder_number: "OC-1", status: "open", last_modified_time: "t1",
      vendor_id: "v", vendor_name: "V", line_items: [{ item_id: "99", quantity: 4 }] } }),
  } as never;
}

Deno.test("sincronizar: OC sin SKU de catálogo deja marcador y la segunda corrida usa caché", async () => {
  const ahora = "2026-10-30T12:00:00Z";
  const f1 = fakeDb([]);
  const r1 = await sincronizar(f1.db, fakeZoho(), ahora);
  assertEquals(r1.detallesPedidos, 1);
  assertEquals(r1.sinFisico, 1); // el único artículo no trae actual_available_stock
  const rows = JSON.parse(f1.ops.find((o) => o.startsWith("rows:"))!.slice(5));
  assertEquals(rows.length, 1);
  assertEquals(rows[0].sku, SKU_MARCADOR);
  assertEquals(rows[0].cantidad, 0);
  // orden y sin delete-all
  assertEquals(f1.ops.filter((o) => o.startsWith("upsert") || o.startsWith("delete")), [
    'upsert:{"onConflict":"zoho_po_id,sku"}', `delete.lt:synced_at:${ahora}`,
  ]);
  assertEquals(f1.ops.includes("delete.neq"), false);

  const f2 = fakeDb(rows);
  const r2 = await sincronizar(f2.db, fakeZoho(), "2026-10-30T12:30:00Z");
  assertEquals(r2.detallesPedidos, 0);
});

Deno.test("filasOc guarda fecha de la OC y precio ponderado por SKU", () => {
  const oc = { purchaseorder_id: "P1", purchaseorder_number: "PO-1", status: "open", last_modified_time: "t1",
    vendor_id: "V1", vendor_name: "Prov", date: "2026-11-01",
    line_items: [{ item_id: "1", sku: "A", quantity: 2, rate: 10 }, { item_id: "1", sku: "A", quantity: 6, rate: 20 },
      { item_id: "2", sku: "B", quantity: 1 }] };
  const f = filasOc(oc, {}, "ahora");
  assertEquals(f.find((x) => x.sku === "A")!.precio, 17.5);
  assertEquals(f.find((x) => x.sku === "A")!.fecha_oc, "2026-11-01");
  assertEquals(f.find((x) => x.sku === "B")!.precio, null);
});

Deno.test("filasOc: el precio ignora en el promedio las líneas sin rate", () => {
  const oc = { purchaseorder_id: "P1", purchaseorder_number: "PO-1", status: "open", last_modified_time: "t1",
    vendor_id: "V1", vendor_name: "Prov",
    line_items: [{ item_id: "1", sku: "A", quantity: 2, rate: 10 }, { item_id: "1", sku: "A", quantity: 50 }] };
  const f = filasOc(oc, {}, "ahora");
  assertEquals(f[0].cantidad, 52);
  assertEquals(f[0].precio, 10);
  assertEquals(f[0].fecha_oc, null);
});

Deno.test("filasProveedor toma días de crédito y usa 0 cuando no hay términos", () => {
  const r = filasProveedor([
    { contact_id: "V1", contact_name: "Uno", payment_terms: 30, payment_terms_label: "Net 30" },
    { contact_id: "V2", contact_name: "Dos", payment_terms: "15" },
    { contact_id: "V3", contact_name: "Tres" },
    { contact_id: "V4", contact_name: "Cuatro", payment_terms: -5 },
  ], "ahora");
  assertEquals(r.map((x) => [x.vendor_id, x.dias_credito, x.etiqueta]), [["V1", 30, "Net 30"], ["V2", 15, null], ["V3", 0, null], ["V4", 0, null]]);
});

Deno.test("sincronizar: caché con precio null se refresca una vez y se escriben precio y proveedores", async () => {
  const previa = { zoho_po_id: "p1", po_number: "OC-1", status: "open", po_modified: "t1", vendor_id: "v", vendor_name: "V",
    sku: "A-1", cantidad: 4, cantidad_recibida: 0, fecha_entrega: null, es_auto: false, synced_at: "x", precio: null, fecha_oc: null };
  const f = fakeDb([previa]);
  let detalles = 0;
  const z = {
    llamadas: 0,
    listAll: (path: string) => Promise.resolve(path === "/contacts"
      ? [{ contact_id: "v", contact_name: "V", payment_terms: 30, payment_terms_label: "Net 30" }]
      : path === "/items" ? [{ item_id: "1", sku: "A-1", stock_on_hand: 3 }]
      : [{ purchaseorder_id: "p1", purchaseorder_number: "OC-1", status: "open", last_modified_time: "t1", vendor_id: "v", vendor_name: "V" }]),
    get: (p: string) => { if (p === "/settings/customfields") return Promise.resolve({}); detalles++; return Promise.resolve({ purchaseorder: {
      purchaseorder_id: "p1", purchaseorder_number: "OC-1", status: "open", last_modified_time: "t1",
      vendor_id: "v", vendor_name: "V", date: "2026-11-01", line_items: [{ item_id: "1", sku: "A-1", quantity: 4, rate: 12.5 }] } }); },
  } as never;
  const r = await sincronizar(f.db, z, "2026-11-06T12:00:00Z");
  assertEquals(detalles, 1);
  assertEquals(r.detallesPedidos, 1);
  const lineas = f.upserts.find((u) => u.tabla === "com_zoho_oc_lineas")!;
  assertEquals(lineas.rows[0].precio, 12.5);
  assertEquals(lineas.rows[0].fecha_oc, "2026-11-01");
  const prov = f.upserts.find((u) => u.tabla === "com_zoho_proveedor")!;
  assertEquals(prov.o, { onConflict: "vendor_id" });
  assertEquals(prov.rows, [{ vendor_id: "v", nombre: "V", dias_credito: 30, etiqueta: "Net 30", synced_at: "2026-11-06T12:00:00Z" }]);

  // con precio ya guardado, la caché se respeta
  const f2 = fakeDb([{ ...previa, precio: 12.5 }]);
  const r2 = await sincronizar(f2.db, z, "2026-11-06T12:30:00Z");
  assertEquals(r2.detallesPedidos, 0);
  assertEquals(detalles, 1);
});

Deno.test("sincronizar: si falla guardar los días de crédito igual escribe las OCs y lo reporta sin lanzar", async () => {
  const ahora = "2026-11-06T12:00:00Z";
  const f = fakeDb([], true);
  const z = {
    llamadas: 0,
    listAll: (path: string) => Promise.resolve(path === "/contacts"
      ? [{ contact_id: "v", contact_name: "V", payment_terms: 30 }]
      : path === "/items" ? [{ item_id: "1", sku: "A-1", stock_on_hand: 3 }]
      : [{ purchaseorder_id: "p1", purchaseorder_number: "OC-1", status: "open", last_modified_time: "t1", vendor_id: "v", vendor_name: "V" }]),
    get: () => Promise.resolve({ purchaseorder: {
      purchaseorder_id: "p1", purchaseorder_number: "OC-1", status: "open", last_modified_time: "t1",
      vendor_id: "v", vendor_name: "V", line_items: [{ item_id: "1", sku: "A-1", quantity: 4, rate: 12.5 }] } }),
  } as never;
  const r = await sincronizar(f.db, z, ahora);
  assertEquals(r.proveedoresError, "permiso denegado");
  assertEquals(f.upserts.find((u) => u.tabla === "com_zoho_oc_lineas")!.rows.length, 1);
  // los proveedores van al final: después del upsert de líneas y del borrado de las viejas
  assertEquals(f.ops.filter((o) => o.startsWith("upsert") || o.startsWith("delete")), [
    'upsert:{"onConflict":"zoho_po_id,sku"}', `delete.lt:synced_at:${ahora}`, "upsert:proveedor",
  ]);
  // sin error no aparece la clave
  const ok = await sincronizar(fakeDb([]).db, z, ahora);
  assertEquals("proveedoresError" in ok, false);
});

Deno.test("filasOc: OC en otra moneda no lleva precio (no se suma como pesos); MXN o sin moneda sí", () => {
  const oc = { purchaseorder_id: "P1", purchaseorder_number: "PO-1", status: "open", last_modified_time: "t1",
    vendor_id: "V1", vendor_name: "Prov", line_items: [{ item_id: "1", sku: "A", quantity: 2, rate: 10 }] };
  assertEquals(filasOc({ ...oc, currency_code: "USD" }, {}, "ahora")[0].precio, null);
  assertEquals(filasOc({ ...oc, currency_code: "MXN" }, {}, "ahora")[0].precio, 10);
  assertEquals(filasOc(oc, {}, "ahora")[0].precio, 10);
});

Deno.test("filasOc: el precio unitario no se redondea a centavos", () => {
  const oc = { purchaseorder_id: "P1", purchaseorder_number: "PO-1", status: "open", last_modified_time: "t1",
    vendor_id: "V1", vendor_name: "Prov", line_items: [{ item_id: "1", sku: "A", quantity: 1, rate: 1 },
      { item_id: "1", sku: "A", quantity: 2, rate: 1.5 }] };
  assertEquals(filasOc(oc, {}, "ahora")[0].precio, 4 / 3);
});

Deno.test("ocAbierta: todo cuenta salvo cerrada, cancelada o anulada (sin importar mayúsculas)", () => {
  for (const s of ["draft", "open", "billed", "partially_billed", "partially_received", "pending_approval", "approved", "issued"]) {
    assertEquals(ocAbierta(s), true, s);
  }
  for (const s of ["closed", "cancelled", "void", "Closed", "CANCELLED"]) assertEquals(ocAbierta(s), false, s);
});

function dbLog(fila: { fin: string } | null) {
  const filtros: string[] = [];
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "not", "order", "limit"]) q[m] = (...a: unknown[]) => { filtros.push(`${m}:${a.join(",")}`); return q; };
  q.maybeSingle = () => Promise.resolve({ data: fila, error: null });
  return { db: { from: () => q } as never, filtros };
}

Deno.test("syncReciente: true si el último sync exitoso terminó hace menos de 5 minutos", async () => {
  const ahora = new Date("2026-10-30T12:10:00Z");
  const a = dbLog({ fin: "2026-10-30T12:06:00Z" });
  assertEquals(await syncReciente(a.db, ahora), true);
  assertEquals(a.filtros.includes("eq:proceso,zoho-sync") && a.filtros.includes("eq:ok,true"), true);
  assertEquals(await syncReciente(dbLog({ fin: "2026-10-30T12:04:00Z" }).db, ahora), false);
  assertEquals(await syncReciente(dbLog(null).db, ahora), false);
});

const ocLista = (status: string, received_status?: string): OcZoho => ({ purchaseorder_id: "p1", purchaseorder_number: "OC-1",
  status, last_modified_time: "t1", vendor_id: "v", vendor_name: "V", ...(received_status ? { received_status } : {}) });

Deno.test("ocParaSincronizar: recibida completa se salta; parcial o sin dato sigue la regla de status", () => {
  assertEquals(ocParaSincronizar(ocLista("billed", "received")), false);
  assertEquals(ocParaSincronizar(ocLista("billed", "RECEIVED")), false);
  assertEquals(ocParaSincronizar(ocLista("billed", "partially_received")), true);
  assertEquals(ocParaSincronizar(ocLista("open", "to_be_received")), true);
  assertEquals(ocParaSincronizar(ocLista("billed")), true);
  assertEquals(ocParaSincronizar(ocLista("closed")), false);
});

function zohoConLista(oc: OcZoho) {
  let detalles = 0;
  const z = {
    llamadas: 0,
    listAll: (path: string) => Promise.resolve(path === "/contacts" ? [] : path === "/items" ? [{ item_id: "1", sku: "A-1", stock_on_hand: 3 }] : [oc]),
    get: (p: string) => { if (p === "/settings/customfields") return Promise.resolve({}); detalles++; return Promise.resolve({ purchaseorder: { ...oc, line_items: [{ item_id: "1", quantity: 4 }] } }); },
  } as never;
  return { z, detalles: () => detalles };
}

Deno.test("sincronizar: OC billed+received no pide detalle; billed+partially_received sí", async () => {
  const recibida = zohoConLista(ocLista("billed", "received"));
  const r1 = await sincronizar(fakeDb([]).db, recibida.z, "2026-10-30T12:00:00Z");
  assertEquals([r1.ocs, r1.detallesPedidos, recibida.detalles()], [0, 0, 0]);
  const parcial = zohoConLista(ocLista("billed", "partially_received"));
  const r2 = await sincronizar(fakeDb([]).db, parcial.z, "2026-10-30T12:00:00Z");
  assertEquals([r2.ocs, r2.detallesPedidos, parcial.detalles()], [1, 1, 1]);
  const sinDato = zohoConLista(ocLista("billed"));
  const r3 = await sincronizar(fakeDb([]).db, sinDato.z, "2026-10-30T12:00:00Z");
  assertEquals([r3.ocs, sinDato.detalles()], [1, 1]);
});

// --- artículos y lista de OCs de la plataforma al día con Zoho ---
function zohoItems(items: Record<string, unknown>[], ocs: Record<string, unknown>[] = []) {
  const params: Record<string, unknown> = {};
  const z = {
    llamadas: 0,
    listAll: (path: string, _k: string, p?: unknown) => { params[path] = p; return Promise.resolve(path === "/items" ? items : path === "/purchaseorders" ? ocs : []); },
    get: () => Promise.reject(new Error("sin detalle")),
  } as never;
  return { z, params };
}
const AHORA = "2026-11-09T18:00:00Z"; // hoy en CDMX: 2026-11-09
const item = { item_id: "1", sku: "A-1", stock_on_hand: 3, cf_estatus_operativo: "Prueba", cf_lead_time_proveedor: "20" };
const catA = { sku: "A-1", estatus: "Compra Recurrente", origen: null, costo_unitario: null, proveedor_preferido: null, modelo_negocio: null,
  clasificacion: null, clasificacion_detallada: null, exclusivo_gdl: null };
const de = (log: OpDb[], tabla: string, accion: string) => log.filter((o) => o.tabla === tabla && o.accion === accion);
const cambios = (log: OpDb[]) => de(log, "com_sync_cambios", "insert").flatMap((o) => o.valor as Fila[]);

Deno.test("sincronizar: el listado de artículos se pide con Status.All (incluye inactivos)", async () => {
  const { z, params } = zohoItems([item]);
  await sincronizar(dbEscenario({ catalogo: [catA] }).db, z, AHORA);
  assertEquals(params["/items"], { filter_by: "Status.All" });
});

Deno.test("sincronizar: modo registrar solo deja la bitácora (aplicado=false) y no toca catálogo ni lead time", async () => {
  const f = dbEscenario({ catalogo: [catA], leadTimes: [{ sku: "A-1", dias: 10 }] });
  const r = await sincronizar(f.db, zohoItems([item]).z, AHORA);
  assertEquals([r.articulosModo, r.articulosCambiados, r.articulosPropuestos, r.leadTimesCambiados], ["registrar", 0, 1, 1]);
  const c = cambios(f.log);
  assertEquals(c.map((x) => [x.tabla, x.clave, x.campo, x.antes, x.despues, x.aplicado, x.origen]), [
    ["com_catalogo", "A-1", "estatus", "Compra Recurrente", "Prueba", false, "zoho-sync"],
    ["com_lead_times", "A-1", "dias", 10, 20, false, "zoho-sync"],
  ]);
  assertEquals(new Set(c.map((x) => x.corrida)).size, 1);
  // la única escritura al catálogo es la de siempre (campos zoho_*)
  assertEquals(de(f.log, "com_catalogo", "update").some((o) => "estatus" in (o.valor as Fila)), false);
  assertEquals(f.log.filter((o) => o.tabla === "com_lead_times" && o.accion !== "select").length, 0);
});

Deno.test("sincronizar: modo aplicar actualiza solo los campos cambiados y el lead time, y registra aplicado=true", async () => {
  const f = dbEscenario({ catalogo: [catA], leadTimes: [{ sku: "A-1", dias: 10 }], config: { auto: { sync_catalogo: "aplicar" } } });
  const r = await sincronizar(f.db, zohoItems([item]).z, AHORA);
  assertEquals([r.articulosModo, r.articulosCambiados, r.articulosPropuestos, r.leadTimesCambiados], ["aplicar", 1, 0, 1]);
  const upd = de(f.log, "com_catalogo", "update").filter((o) => "estatus" in (o.valor as Fila));
  assertEquals(upd.map((o) => [o.valor, o.filtros]), [[{ estatus: "Prueba" }, [["eq", "sku", "A-1"]]]]);
  const lt = de(f.log, "com_lead_times", "update");
  assertEquals(lt.map((o) => [o.valor, o.filtros[0]]), [[{ dias: 20 }, ["eq", "sku", "A-1"]]]);
  assertEquals(de(f.log, "com_lead_times", "insert").length, 0);
  assertEquals(cambios(f.log).every((x) => x.aplicado === true), true);
  // sin fila previa de lead time se inserta
  const g = dbEscenario({ catalogo: [catA], config: { auto: { sync_catalogo: "aplicar" } } });
  await sincronizar(g.db, zohoItems([item]).z, AHORA);
  assertEquals(de(g.log, "com_lead_times", "insert").map((o) => o.valor), [{ sku: "A-1", dias: 20 }]);
});

Deno.test("sincronizar: si falla la bitácora el sync termina con articulosError y no aplica nada", async () => {
  const f = dbEscenario({ catalogo: [catA], config: { auto: { sync_catalogo: "aplicar" } },
    falla: { "com_sync_cambios:insert": "sin tabla" } });
  const r = await sincronizar(f.db, zohoItems([item]).z, AHORA);
  assertEquals(r.articulosError, "sin tabla");
  assertEquals(de(f.log, "com_catalogo", "update").some((o) => "estatus" in (o.valor as Fila)), false);
  assertEquals(de(f.log, "com_movimientos", "select").length > 0, true); // la conciliación sí corre
});

Deno.test("sincronizar: sin configuración legible usa modo registrar", async () => {
  const f = dbEscenario({ catalogo: [catA], falla: { "com_plan_config:select": "x" } });
  const r = await sincronizar(f.db, zohoItems([item]).z, AHORA);
  assertEquals(r.articulosModo, "registrar");
});

const lineaZ = (po: string, sku: string, cantidad: number, rec = 0, extra: Fila = {}) => ({
  po_number: po, sku, cantidad, cantidad_recibida: rec, fecha_entrega: null, fecha_oc: "2026-10-01", vendor_name: "Prov",
  precio: null, status: "open", ...extra,
});
const mov = (id: number, folio: string, cantidad: number | null, rec: number | null, extra: Fila = {}) => ({
  id, sku: "A-1", folio, fecha: "2026-01-01", fecha_arribo: null, cantidad, cantidad_recibida: rec, monto: null, proveedor: null, ...extra,
});

Deno.test("sincronizar: si falla la parte de OCs lanza y no concilia la plataforma", async () => {
  const f = dbEscenario({ catalogo: [catA], movs: [mov(1, "OC-1", 5, 0)], falla: { "com_zoho_oc_lineas:upsert": "caída" } });
  const ocs = [{ purchaseorder_id: "p1", purchaseorder_number: "OC-1", status: "open", last_modified_time: "t", vendor_id: "v", vendor_name: "V" }];
  const z = { llamadas: 0, listAll: (p: string) => Promise.resolve(p === "/items" ? [item] : p === "/purchaseorders" ? ocs : []),
    get: () => Promise.resolve({ purchaseorder: { ...ocs[0], line_items: [{ item_id: "1", sku: "A-1", quantity: 1 }] } }) } as never;
  const e = await assertRejects(() => sincronizar(f.db, z, AHORA)); // error de la base tal cual (objeto, no Error)
  assertEquals((e as { message: string }).message, "caída");
  assertEquals(f.log.some((o) => o.tabla === "com_movimientos"), false);
});

Deno.test("sincronizar: concilia la plataforma como Poner al día (cerrar, ajustar, quitar borrador, agregar)", async () => {
  const f = dbEscenario({
    catalogo: [catA],
    movs: [
      mov(1, "OC-1", 10, 0), // Zoho: 4 de 10 recibidas → ajustar
      mov(2, "OC-4", 3, 0, { estado: "emitida", destino: "CEDIS" }), // borrador en Zoho → quitar
      mov(3, "OC-9", 5, null), // ya no está en Zoho → cerrar
      mov(5, "OC-5", 2, 0), // igual → mantener
      mov(6, "OC-7", 1, 1), // cerrada desde antes: solo cuenta el folio
    ],
    lineas: [
      lineaZ("OC-1", "A-1", 10, 4),
      lineaZ("OC-4", "A-1", 3, 0, { status: "draft" }),
      lineaZ("OC-5", "A-1", 2),
      lineaZ("OC-2", "a-1", 5, 1, { precio: 2, fecha_entrega: "2026-12-01" }), // folio nuevo, SKU en minúsculas
      lineaZ("OC-2", "ZZ-9", 1, 0, { precio: 100 }), // fuera del catálogo: no se agrega
      lineaZ("OC-7", "A-1", 4), // folio ya conocido: sin monto
    ],
  });
  const r = await sincronizar(f.db, zohoItems([item]).z, AHORA);
  assertEquals([r.ocCerradas, r.ocAjustadas, r.ocQuitadas, r.ocAgregadas, r.ocRetenidas, r.ocFallas], [1, 1, 1, 2, 0, 0]);
  assertEquals("conciliacionError" in r, false);
  const upd = de(f.log, "com_movimientos", "update");
  assertEquals(upd.map((o) => [o.valor, o.filtros]), [
    [{ cantidad_recibida: 5 }, [["eq", "id", 3], ["is", "cantidad_recibida", null], ["eq", "cantidad", 5]]],
    [{ cantidad_recibida: 4 }, [["eq", "id", 1], ["eq", "cantidad_recibida", 0], ["eq", "cantidad", 10]]],
  ]);
  const del = de(f.log, "com_movimientos", "delete");
  assertEquals(del.map((o) => o.filtros), [[["eq", "id", 2], ["eq", "cantidad_recibida", 0], ["eq", "cantidad", 3]]]);
  const ins = de(f.log, "com_movimientos", "insert").flatMap((o) => o.valor as Fila[]);
  assertEquals(ins, [
    { tipo: "compra", folio: "OC-2", sku: "A-1", cantidad: 5, cantidad_recibida: 1, fecha: "2026-10-01", fecha_arribo: "2026-12-01",
      destino: "CEDIS", estado: "emitida", monto: 110, proveedor: "Prov" },
    { tipo: "compra", folio: "OC-7", sku: "A-1", cantidad: 4, cantidad_recibida: 0, fecha: "2026-10-01", fecha_arribo: null,
      destino: "CEDIS", estado: "emitida", monto: null, proveedor: "Prov" },
  ]);
  const c = cambios(f.log).filter((x) => x.tabla === "com_movimientos");
  assertEquals(c.map((x) => [x.clave, x.campo, x.antes === null ? null : typeof x.antes === "object" ? "fila" : x.antes, x.aplicado]), [
    ["2", "quitada", "fila", true], // se registra antes de borrar
    ["3", "cantidad_recibida", null, true],
    ["1", "cantidad_recibida", 0, true],
    ["1000", "agregada", null, true],
    ["1001", "agregada", null, true],
  ]);
  assertEquals((c[0].antes as Fila).estado, "emitida");
  const iLog = f.log.findIndex((o) => o.tabla === "com_sync_cambios" && o.accion === "insert" && (o.valor as Fila[]).some((x) => x.campo === "quitada"));
  assertEquals(iLog >= 0 && iLog < f.log.findIndex((o) => o.tabla === "com_movimientos" && o.accion === "delete"), true);
  assertEquals(de(f.log, "com_sync_cambios", "update").length, 0);
});

Deno.test("sincronizar: borrador que cambió mientras tanto o que no se pudo borrar queda aplicado=false en la bitácora", async () => {
  const movs = [mov(1, "OC-1", 3, 0), mov(2, "OC-2", 3, 0), mov(3, "OC-3", 1, 0), mov(4, "OC-4", 1, 0), mov(5, "OC-5", 1, 0)];
  const lineas = [lineaZ("OC-1", "A-1", 3, 0, { status: "draft" }), lineaZ("OC-2", "A-1", 3, 0, { status: "draft" }),
    lineaZ("OC-3", "A-1", 1), lineaZ("OC-4", "A-1", 1), lineaZ("OC-5", "A-1", 1)];
  const f = dbEscenario({ catalogo: [catA], movs, lineas, sinFilas: [1] });
  const r = await sincronizar(f.db, zohoItems([item]).z, AHORA);
  assertEquals([r.ocQuitadas, r.ocFallas], [1, 0]);
  const marcar = de(f.log, "com_sync_cambios", "update");
  assertEquals(marcar.map((o) => o.valor), [{ aplicado: false }]);
  assertEquals(marcar[0].filtros.find((x) => x[0] === "in"), ["in", "clave", ["1"]]);
  assertEquals(marcar[0].filtros.some((x) => x[0] === "eq" && x[1] === "campo" && x[2] === "quitada"), true);
});

Deno.test("sincronizar: si no se puede escribir la bitácora de borradores no se borra nada", async () => {
  const movs = [mov(1, "OC-1", 3, 0), mov(3, "OC-3", 1, 0), mov(4, "OC-4", 1, 0)];
  const lineas = [lineaZ("OC-1", "A-1", 3, 0, { status: "draft" }), lineaZ("OC-3", "A-1", 1), lineaZ("OC-4", "A-1", 1)];
  const f = dbEscenario({ catalogo: [catA], movs, lineas, falla: { "com_sync_cambios:insert": "lleno" } });
  const r = await sincronizar(f.db, zohoItems([item]).z, AHORA);
  assertEquals(de(f.log, "com_movimientos", "delete").length, 0);
  assertEquals(r.ocQuitadas, 0);
});

Deno.test("sincronizar: sin tabla de bitácora no concilia nada", async () => {
  const f = dbEscenario({ catalogo: [catA], movs: [mov(1, "OC-9", 5, 0)], falla: { "com_sync_cambios:select": "no existe la tabla" } });
  const r = await sincronizar(f.db, zohoItems([item]).z, AHORA);
  assertEquals(r.conciliacionError, "no existe la tabla");
  assertEquals(f.log.some((o) => o.tabla === "com_movimientos"), false);
});

Deno.test("sincronizar: una línea que cambió mientras tanto no es falla; un error de la base sí", async () => {
  const f = dbEscenario({ catalogo: [catA], movs: [mov(1, "OC-1", 10, 0), mov(2, "OC-2", 1, 0), mov(3, "OC-3", 1, 0), mov(4, "OC-4", 1, 0)],
    lineas: [lineaZ("OC-1", "A-1", 10, 4), lineaZ("OC-2", "A-1", 1), lineaZ("OC-3", "A-1", 1), lineaZ("OC-4", "A-1", 1)],
    falla: { "com_movimientos:update": "permiso" } });
  const r = await sincronizar(f.db, zohoItems([item]).z, AHORA);
  assertEquals([r.ocAjustadas, r.ocFallas], [0, 1]);
  // 0 filas afectadas (la línea cambió mientras tanto): ni falla ni bitácora
  const g = dbEscenario({ catalogo: [catA], movs: [mov(1, "OC-1", 10, 0), mov(2, "OC-2", 1, 0), mov(3, "OC-3", 1, 0), mov(4, "OC-4", 1, 0)],
    lineas: [lineaZ("OC-1", "A-1", 10, 4), lineaZ("OC-2", "A-1", 1), lineaZ("OC-3", "A-1", 1), lineaZ("OC-4", "A-1", 1)],
    sinFilas: [1] });
  const r2 = await sincronizar(g.db, zohoItems([item]).z, AHORA);
  assertEquals(de(g.log, "com_movimientos", "update").length, 1);
  assertEquals([r2.ocAjustadas, r2.ocFallas], [0, 0]);
  assertEquals(cambios(g.log).some((x) => x.tabla === "com_movimientos" && x.clave === "1"), false);
});

// 16 líneas abiertas sin pareja en Zoho: pasan el piso de 15 y el 30 %.
const movsTope = () => Array.from({ length: 16 }, (_, i) => mov(i + 1, `OC-${i + 1}`, 5, 0));

Deno.test("sincronizar: tope con el mismo conjunto retenido que la corrida anterior no repite aviso ni bitácora", async () => {
  const movs = movsTope();
  const enviados: unknown[] = [];
  const fetchOrig = globalThis.fetch;
  globalThis.fetch = (_u: unknown, i?: RequestInit) => { enviados.push(JSON.parse(String(i?.body))); return Promise.resolve(new Response("{}")); };
  Deno.env.set("COM_EFECTOS_EXTERNOS", "si"); // portal (plan 2): el aviso por correo requiere efectos externos
  try {
    const f1 = dbEscenario({ catalogo: [catA], movs, config: { auto: { correos: ["a@x.com"] } } });
    const r1 = await sincronizar(f1.db, zohoItems([item]).z, AHORA);
    assertEquals(typeof r1.ocRetenidasFirma, "string");
    const f2 = dbEscenario({ catalogo: [catA], movs, config: { auto: { correos: ["a@x.com"] } }, log: [{ resumen: r1 }] });
    const r2 = await sincronizar(f2.db, zohoItems([item]).z, AHORA);
    assertEquals([r2.ocRetenidas, r2.ocRetenidasFirma], [16, r1.ocRetenidasFirma]);
    assertEquals(enviados.length, 1);
    assertEquals(cambios(f1.log).filter((x) => x.tabla === "com_movimientos").length, 16);
    assertEquals(cambios(f2.log).filter((x) => x.tabla === "com_movimientos").length, 0);
    // otro conjunto retenido: vuelve a avisar
    const f3 = dbEscenario({ catalogo: [catA], movs: [...movs, mov(7, "OC-7", 5, 0)], config: { auto: { correos: ["a@x.com"] } }, log: [{ resumen: r1 }] });
    await sincronizar(f3.db, zohoItems([item]).z, AHORA);
    assertEquals(enviados.length, 2);
  } finally { globalThis.fetch = fetchOrig; Deno.env.delete("COM_EFECTOS_EXTERNOS"); }
});

Deno.test("sincronizar: en modo registrar una propuesta ya registrada no se vuelve a registrar", async () => {
  const f1 = dbEscenario({ catalogo: [catA], leadTimes: [{ sku: "A-1", dias: 10 }] });
  await sincronizar(f1.db, zohoItems([item]).z, AHORA);
  const previas = cambios(f1.log).map((x, i) => ({ id: i + 1, ...x }));
  assertEquals(previas.length, 2);
  const f2 = dbEscenario({ catalogo: [catA], leadTimes: [{ sku: "A-1", dias: 10 }], cambios: previas });
  const r2 = await sincronizar(f2.db, zohoItems([item]).z, AHORA);
  assertEquals(cambios(f2.log).length, 0);
  assertEquals([r2.articulosCambiados, r2.articulosPropuestos], [0, 1]);
  // si la propuesta cambia, sí se registra
  const f3 = dbEscenario({ catalogo: [catA], leadTimes: [{ sku: "A-1", dias: 10 }], cambios: previas });
  await sincronizar(f3.db, zohoItems([{ ...item, cf_lead_time_proveedor: "25" }]).z, AHORA);
  assertEquals(cambios(f3.log).map((x) => [x.campo, x.despues]), [["dias", 25]]);
  // en modo aplicar no se filtra
  const f4 = dbEscenario({ catalogo: [catA], leadTimes: [{ sku: "A-1", dias: 10 }], cambios: previas, config: { auto: { sync_catalogo: "aplicar" } } });
  await sincronizar(f4.db, zohoItems([item]).z, AHORA);
  assertEquals(cambios(f4.log).length, 2);
});

Deno.test("SKU repetido (activo e inactivo): gana el activo en filasCatalogo y en la bitácora del catálogo", async () => {
  const items = [
    { item_id: "viejo", sku: "A-1", status: "inactive", stock_on_hand: 0, cf_estatus_operativo: "Inactivo" },
    { item_id: "nuevo", sku: "A-1", status: "active", stock_on_hand: 7, cf_estatus_operativo: "Prueba" },
    { item_id: "otro", sku: "A-1", status: "active", stock_on_hand: 9, cf_estatus_operativo: "Compra Unica" },
  ];
  const r = filasCatalogo(items, new Set(["A-1"]), "t");
  assertEquals(r.filas.map((x) => [x.zoho_item_id, x.zoho_stock]), [["nuevo", 7]]);
  const f = dbEscenario({ catalogo: [catA] });
  await sincronizar(f.db, zohoItems(items).z, AHORA);
  assertEquals(cambios(f.log).map((x) => [x.campo, x.despues]), [["estatus", "Prueba"]]);
});

Deno.test("sincronizar: si la conciliación excede el tope no cierra nada, registra los cierres retenidos y avisa", async () => {
  const f = dbEscenario({ catalogo: [catA], movs: movsTope(), config: { auto: { correos: ["a@x.com"] } } });
  const enviados: { subject: string; body_html: string }[] = [];
  const fetchOrig = globalThis.fetch;
  globalThis.fetch = (_u: unknown, i?: RequestInit) => { enviados.push(JSON.parse(String(i?.body))); return Promise.resolve(new Response("{}")); };
  let r;
  Deno.env.set("COM_EFECTOS_EXTERNOS", "si"); // portal (plan 2): el aviso por correo requiere efectos externos
  try { r = await sincronizar(f.db, zohoItems([item]).z, AHORA); } finally { globalThis.fetch = fetchOrig; Deno.env.delete("COM_EFECTOS_EXTERNOS"); }
  assertEquals([r.ocRetenidas, r.ocCerradas, r.ocAgregadas], [16, 0, 0]);
  assertEquals(f.log.some((o) => o.tabla === "com_movimientos" && o.accion !== "select"), false);
  const c = cambios(f.log).filter((x) => x.tabla === "com_movimientos");
  assertEquals(c.map((x) => [x.clave, x.campo, x.antes, x.despues, x.aplicado]),
    Array.from({ length: 16 }, (_, i) => [String(i + 1), "cantidad_recibida", 0, 5, false]));
  assertEquals(enviados.length, 1);
  assertEquals(enviados[0].subject, "⚠ Sincronización con Zoho: conciliación retenida");
  assertStringIncludes(enviados[0].body_html, "OC-3");
});

Deno.test("sincronizar: con el tope retenido igual aplica ajustes, quita borradores y agrega faltantes; solo los cierres esperan", async () => {
  const movs = [
    ...movsTope(),
    mov(20, "OC-20", 10, 0), // Zoho: 4 de 10 recibidas → ajustar
    mov(21, "OC-21", 3, 0), // borrador en Zoho → quitar
  ];
  const lineas = [
    lineaZ("OC-20", "A-1", 10, 4),
    lineaZ("OC-21", "A-1", 3, 0, { status: "draft" }),
    lineaZ("OC-22", "A-1", 5), // falta en la plataforma → agregar
  ];
  const f = dbEscenario({ catalogo: [catA], movs, lineas });
  const r = await sincronizar(f.db, zohoItems([item]).z, AHORA);
  assertEquals([r.ocRetenidas, r.ocCerradas, r.ocAjustadas, r.ocQuitadas, r.ocAgregadas, r.ocFallas], [16, 0, 1, 1, 1, 0]);
  // el único update es el ajuste: ningún cierre
  assertEquals(de(f.log, "com_movimientos", "update").map((o) => [o.valor, o.filtros[0]]), [[{ cantidad_recibida: 4 }, ["eq", "id", 20]]]);
  assertEquals(de(f.log, "com_movimientos", "delete").map((o) => o.filtros[0]), [["eq", "id", 21]]);
  assertEquals(de(f.log, "com_movimientos", "insert").flatMap((o) => (o.valor as Fila[]).map((x) => x.folio)), ["OC-22"]);
  const c = cambios(f.log).filter((x) => x.tabla === "com_movimientos");
  assertEquals(c.filter((x) => x.aplicado === false).map((x) => x.clave), Array.from({ length: 16 }, (_, i) => String(i + 1)));
  assertEquals(c.filter((x) => x.aplicado === true).map((x) => [x.clave, x.campo]), [
    ["21", "quitada"], ["20", "cantidad_recibida"], ["1000", "agregada"],
  ]);
});

Deno.test("sincronizar: si la conciliación truena queda en conciliacionError y no lanza", async () => {
  const f = dbEscenario({ catalogo: [catA], falla: { "com_movimientos:select": "timeout" } });
  const r = await sincronizar(f.db, zohoItems([item]).z, AHORA);
  assertEquals(r.conciliacionError, "timeout");
});

Deno.test("avisarRachaFallas: avisa solo cuando la racha de fallas acaba de llegar a 2", async () => {
  const caso = async (oks: (boolean | null)[]) => {
    const f = dbEscenario({ log: oks.map((ok) => ({ ok })), config: { auto: { correos: ["a@x.com"] } } });
    const llamadas: unknown[][] = [];
    await avisarRachaFallas(f.db, "boom", (...a: unknown[]) => { llamadas.push(a); return Promise.resolve(true); });
    return llamadas;
  };
  const si = await caso([false, false, true]);
  assertEquals(si.length, 1);
  assertEquals(si[0][1], "⚠ Sincronización con Zoho falló 2 veces seguidas");
  assertStringIncludes(String(si[0][2]), "boom");
  assertEquals((await caso([false, false, false])).length, 0);
  assertEquals((await caso([false, true, false])).length, 0);
  assertEquals((await caso([false])).length, 0);
  // nunca lanza aunque la base falle
  await avisarRachaFallas(dbEscenario({ falla: { "com_sync_log:select": "x" } }).db, "boom", () => Promise.reject(new Error("y")));
});

// --- Mínimo de compra del proveedor (Zoho <-> plataforma) ---
const API_MIN = "cf_minimo_de_compra_mxn";
type ContactoMin = { contact_id: string; contact_name: string; custom_field_hash?: Record<string, unknown>; last_modified_time?: string };
function zohoMin(contactos: ContactoMin[], opt: { campos?: unknown; putFalla?: Error } = {}) {
  const puts: { path: string; body: unknown }[] = [];
  const gets: string[] = [];
  const z = {
    llamadas: 0,
    listAll: (path: string) => Promise.resolve(path === "/contacts" ? contactos : []),
    get: (path: string) => {
      gets.push(path);
      return Promise.resolve(path === "/settings/customfields"
        ? (opt.campos ?? { customfields: { contact: [{ api_name: API_MIN }], vendor: [{ api_name: API_MIN }] } })
        : {});
    },
    put: (path: string, body: unknown) => {
      puts.push({ path, body });
      const v = (body as { custom_fields?: { value?: unknown }[] }).custom_fields?.[0]?.value;
      return opt.putFalla ? Promise.reject(opt.putFalla) : Promise.resolve({ contact: { custom_field_hash: { [API_MIN]: v } } });
    },
  } as never;
  return { z, puts, gets };
}
const provFila = (o: Fila = {}): Fila => ({ vendor_id: "V1", minimo_compra: 100, minimo_zoho_visto: 100, minimo_pendiente: false, minimo_editado_at: null, ...o });
const updatesProv = (log: OpDb[]) => de(log, "com_zoho_proveedor", "update").map((o) => ({ v: o.valor as Fila, f: o.filtros }));
const hashMin = (v: unknown) => ({ [API_MIN]: v });

Deno.test("mínimos: si el campo no existe en Zoho no concilia nada y avisa 'falta'", async () => {
  const f = dbEscenario({ proveedores: [provFila({ minimo_pendiente: true })] });
  const zz = zohoMin([{ contact_id: "V1", contact_name: "Uno", custom_field_hash: {} }], { campos: { customfields: { contact: [{ api_name: "otro" }], vendor: [] } } });
  const r = await sincronizar(f.db, zz.z, AHORA);
  assertEquals(r.minimoCampo, "falta");
  assertEquals(zz.puts, []);
  assertEquals(updatesProv(f.log), []);
});

Deno.test("mínimos: Zoho cambió y no hay pendiente: se aplica con bitácora zoho-sync", async () => {
  const f = dbEscenario({ proveedores: [provFila()] });
  const zz = zohoMin([{ contact_id: "V1", contact_name: "Uno", custom_field_hash: hashMin("450.5"), last_modified_time: "2026-11-10T10:00:00-0600" }]);
  const r = await sincronizar(f.db, zz.z, AHORA);
  assertEquals(r.minimoCampo, "ok");
  assertEquals(r.minimos, { aplicados_zoho: 1, enviados: 0, errores: 0 });
  assertEquals(zz.puts, []);
  const u = updatesProv(f.log).find((x) => x.v.minimo_compra !== undefined)!;
  assertEquals(u.v, { minimo_compra: 450.5, minimo_origen: "zoho", minimo_editado_at: "2026-11-10T10:00:00-0600", minimo_editado_por: "zoho",
    minimo_zoho_visto: 450.5, minimo_pendiente: false, minimo_error: null });
  const c = cambios(f.log).find((x) => x.tabla === "com_zoho_proveedor")!;
  assertEquals([c.clave, c.campo, c.antes, c.despues, c.origen, c.aplicado], ["V1", "minimo_compra", 100, 450.5, "zoho-sync", true]);
});

Deno.test("mínimos: campo vacío en Zoho cuenta como 0 (el campo existe)", async () => {
  const f = dbEscenario({ proveedores: [provFila()] });
  const zz = zohoMin([{ contact_id: "V1", contact_name: "Uno", custom_field_hash: hashMin("") }]);
  const r = await sincronizar(f.db, zz.z, AHORA);
  assertEquals(r.minimos, { aplicados_zoho: 1, enviados: 0, errores: 0 });
  assertEquals(updatesProv(f.log).find((x) => x.v.minimo_compra !== undefined)!.v.minimo_compra, 0);
});

Deno.test("mínimos: pendiente y Zoho sin cambio: se reenvía a Zoho (una vez)", async () => {
  const f = dbEscenario({ proveedores: [provFila({ minimo_compra: 300, minimo_pendiente: true })] });
  const zz = zohoMin([{ contact_id: "V1", contact_name: "Uno", custom_field_hash: hashMin(100) }]);
  const r = await sincronizar(f.db, zz.z, AHORA);
  assertEquals(zz.puts, [{ path: "/contacts/V1", body: { custom_fields: [{ api_name: API_MIN, value: 300 }] } }]);
  assertEquals(r.minimos, { aplicados_zoho: 0, enviados: 1, errores: 0 });
  assertEquals(updatesProv(f.log).some((x) => x.v.minimo_pendiente === false && x.v.minimo_zoho_visto === 300), true);
});

Deno.test("mínimos: ambos cambiaron: gana el más reciente", async () => {
  const pend = { minimo_compra: 300, minimo_pendiente: true, minimo_editado_at: "2026-11-10T12:00:00Z" };
  const f1 = dbEscenario({ proveedores: [provFila(pend)] });
  const z1 = zohoMin([{ contact_id: "V1", contact_name: "U", custom_field_hash: hashMin(777), last_modified_time: "2026-11-10T13:00:00Z" }]);
  const r1 = await sincronizar(f1.db, z1.z, AHORA);
  assertEquals([r1.minimos, z1.puts.length], [{ aplicados_zoho: 1, enviados: 0, errores: 0 }, 0]);
  const f2 = dbEscenario({ proveedores: [provFila(pend)] });
  const z2 = zohoMin([{ contact_id: "V1", contact_name: "U", custom_field_hash: hashMin(777), last_modified_time: "2026-11-10T11:00:00Z" }]);
  const r2 = await sincronizar(f2.db, z2.z, AHORA);
  assertEquals([r2.minimos, z2.puts.length], [{ aplicados_zoho: 0, enviados: 1, errores: 0 }, 1]);
});

Deno.test("mínimos: error de permiso: un solo intento por corrida; los demás quedan pendientes", async () => {
  const pend = (id: string) => provFila({ vendor_id: id, minimo_compra: 300, minimo_pendiente: true });
  const f = dbEscenario({ proveedores: [pend("V1"), pend("V2"), pend("V3")] });
  const cs = ["V1", "V2", "V3"].map((id) => ({ contact_id: id, contact_name: id, custom_field_hash: hashMin(100) }));
  const zz = zohoMin(cs, { putFalla: new ZohoError("no", 403) });
  const r = await sincronizar(f.db, zz.z, AHORA);
  assertEquals(zz.puts.length, 1);
  assertEquals(r.minimos, { aplicados_zoho: 0, enviados: 0, errores: 1 });
});

Deno.test("mínimos: otro error de Zoho no frena a los demás y cada proveedor se intenta una vez", async () => {
  const pend = (id: string) => provFila({ vendor_id: id, minimo_compra: 300, minimo_pendiente: true });
  const f = dbEscenario({ proveedores: [pend("V1"), pend("V2")] });
  const cs = ["V1", "V2"].map((id) => ({ contact_id: id, contact_name: id, custom_field_hash: hashMin(100) }));
  const zz = zohoMin(cs, { putFalla: new ZohoError("Valor inválido", 400, 4) });
  const r = await sincronizar(f.db, zz.z, AHORA);
  assertEquals(zz.puts.length, 2);
  assertEquals(r.minimos, { aplicados_zoho: 0, enviados: 0, errores: 2 });
});

Deno.test("mínimos: zoho_visto nulo con mismo valor solo se rellena; el upsert de proveedores no toca minimo_*", async () => {
  const f = dbEscenario({ proveedores: [provFila({ minimo_compra: 100, minimo_zoho_visto: null })] });
  const zz = zohoMin([{ contact_id: "V1", contact_name: "Uno", custom_field_hash: hashMin(100) }]);
  const r = await sincronizar(f.db, zz.z, AHORA);
  assertEquals(r.minimos, { aplicados_zoho: 0, enviados: 0, errores: 0 });
  assertEquals(updatesProv(f.log).map((x) => x.v), [{ minimo_zoho_visto: 100, minimo_pendiente: false, minimo_error: null }]);
  const up = de(f.log, "com_zoho_proveedor", "upsert")[0].valor as Fila[];
  assertEquals(Object.keys(up[0]).some((k) => k.startsWith("minimo")), false);
  assertEquals(cambios(f.log).filter((x) => x.tabla === "com_zoho_proveedor"), []);
});

Deno.test("mínimos: el campo se reconoce por placeholder cuando api_name no viene", async () => {
  const f = dbEscenario({ proveedores: [provFila()] });
  const zz = zohoMin([{ contact_id: "V1", contact_name: "U", custom_field_hash: hashMin(9) }],
    { campos: { customfields: [{ placeholder: API_MIN, entity: "contact" }] } });
  assertEquals((await sincronizar(f.db, zz.z, AHORA)).minimoCampo, "ok");
  const z2 = zohoMin([], { campos: { customfields: { vendor: [{ placeholder: API_MIN }] } } });
  assertEquals((await sincronizar(dbEscenario({}).db, z2.z, AHORA)).minimoCampo, "ok");
});

Deno.test("mínimos: aplicar_zoho es compare-and-set; si la fila cambió no se pisa ni se registra historia", async () => {
  const f = dbEscenario({ proveedores: [provFila({ minimo_editado_at: "2026-11-01T00:00:00Z" })], sinCoincidir: true });
  const zz = zohoMin([{ contact_id: "V1", contact_name: "U", custom_field_hash: hashMin(777), last_modified_time: "2026-11-10T10:00:00Z" }]);
  const r = await sincronizar(f.db, zz.z, AHORA);
  assertEquals(r.minimos, { aplicados_zoho: 0, enviados: 0, errores: 0 });
  assertEquals(cambios(f.log).filter((x) => x.tabla === "com_zoho_proveedor"), []);
  const u = de(f.log, "com_zoho_proveedor", "update")[0];
  assertEquals(u.filtros.some((x) => x[0] === "eq" && x[1] === "minimo_pendiente" && x[2] === false), true);
  assertEquals(u.filtros.some((x) => x[0] === "eq" && x[1] === "minimo_editado_at"), true);
});
