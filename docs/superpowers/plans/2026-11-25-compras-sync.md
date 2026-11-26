# Sincronización de compras desde Zoho — plan de implementación (fase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guardar en Supabase, de forma incremental y solo leyendo Zoho, las OCs con sus recepciones y la venta semanal por categoría, para que el tablero de compras (fase 3) lea todo de Supabase.

**Architecture:** Reglas puras en `supabase/functions/_shared/compras/` (categoría por SKU, montos con IVA, OC de registro, recepciones, venta semanal). Un lector de Zoho que trae solo lo modificado desde la última marca, con tope de detalles por corrida y pausas para respetar la cuota. Una Edge Function `zoho-compras-sync` que guarda filas, avanza marcas, recalcula las semanas tocadas y corre cada 15 minutos por cron.

**Tech Stack:** Deno (Edge Functions, `@std/assert`), Supabase Postgres + RLS + pg_cron, cliente Zoho de `_shared/zoho.ts`.

**Spec:** `docs/superpowers/specs/2026-11-25-compras-tablero-y-descargas-design.md` (§2, §5, §6).

**Carpeta de trabajo:** `C:\Users\sebcm\Projects\thecoffee-costeos-compras`, rama `feat/compras-sync` (sale de `main`). No usar la carpeta principal `thecoffee-costeos`.

## Global Constraints

- Zoho solo lectura: `zohoDesdeEnv({ soloLectura: true, tokenVar: "ZOHO_REPORTE_REFRESH_TOKEN" })`; solo `get`/`listAll`.
- Autenticación de la función con `x-com-secreto` (`autorizado`), `verify_jwt = false` en `supabase/config.toml`.
- Categoría por SKU: `INS-CAF` CAF, `INS-BEB` BEB, `INS-DES` DES, `INS-DEL` DEL, `INS-BA` BA, `INS-LIM` LIM, `INS-FOD` FOD, `RTD-` RTD; cualquier otro → `otros`.
- Montos con IVA por línea: `base × (1 + tax_percentage/100)`. OCs en moneda distinta de MXN: montos 0 (se cuentan como OC).
- OC de registro: arribo esperado más de 7 días antes de la fecha de la OC, o una factura (bill) con fecha anterior a la OC.
- Venta semanal: facturas no `void`/`draft`, sin clientes de `excluir_ventas` (de `com_reporte_config`, `normalizarConfigReporte`); total = suma de `total` de factura; categorías = líneas con IVA.
- Cuota de Zoho (~100 llamadas/min, compartida con `zoho-sync`): como máximo **60 detalles por corrida**, en lotes de 4 con **4 s** de pausa; enfriamiento de **10 min** entre corridas salvo `forzar`.
- Primera carga: OCs con fecha desde **2026-07-01**; facturas desde el lunes de hace **16 semanas**.
- Cada corrida se registra en `com_sync_log` con `proceso = 'zoho-compras-sync'` (`registrar()` de `_shared/db.ts`).
- Pruebas: `deno test --config supabase/functions/deno.json --allow-env --allow-read <ruta>`; todas: `npm run test:funciones`.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **OC con varias recepciones** y precios distintos por línea: cada recepción suma lo suyo, con el `rate` de su línea; el total recibido no se duplica. → prueba en Task 1.
2. **OC sin arribo esperado** (`delivery_date` vacío): no es de registro por esa regla y no rompe. → prueba en Task 1.
3. **Factura anulada después de sincronizada** (cambia a `void`): al releerla por `last_modified_time` sale de la venta de su semana. → prueba en Task 1 (`ventaSemana`) y Task 3 (recalcular semana).
4. **Corte a la mitad** (Zoho falla en el detalle 30 de 60): lo procesado se guarda y la marca avanza solo hasta el último guardado; la siguiente corrida retoma. → prueba en Task 2/3.
5. **Primera carga más grande que el tope**: la corrida informa `pendientes: true` y la siguiente continúa sin repetir. → prueba en Task 2.

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20261125000098_comercializadora_compras_sync.sql` | Tablas, RLS y cron |
| `supabase/functions/_shared/compras/reglas.ts` | Reglas puras (sin Deno ni Zoho) |
| `supabase/functions/_shared/compras/zohoCompras.ts` | Lectura incremental de Zoho |
| `supabase/functions/zoho-compras-sync/servicio.ts` | Guardar, marcas, semanas, enfriamiento |
| `supabase/functions/zoho-compras-sync/index.ts` | Entrada HTTP |
| `supabase/functions/_shared/pruebas/compras-2026-11.json` | Fixture para paridad (Task 4) |

---

### Task 1: Reglas puras

**Files:**
- Create: `supabase/functions/_shared/compras/reglas.ts`
- Test: `supabase/functions/_shared/compras/reglas_test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Categoria = "CAF" | "BEB" | "DES" | "DEL" | "BA" | "LIM" | "FOD" | "RTD" | "otros";
  export const CATEGORIAS: Exclude<Categoria, "otros">[];
  export type PorCategoria = Partial<Record<Categoria, number>>;
  export function categoriaSku(sku: string): Categoria;
  export function sumar(lineas: { sku: string; monto: number }[]): PorCategoria;          // redondeo a centavos
  export const insumos: (p: PorCategoria) => number;                                         // suma sin "otros"
  export type FilaOc = { zoho_po_id: string; folio: string; proveedor: string; vendor_id: string; comprador: string; emision: string;
    arribo: string | null; estado: string; received_status: string; moneda: string; total: number; monto_ins: number;
    por_categoria: PorCategoria; es_registro: boolean; factura_previa: string | null; zoho_modificado: string };
  export type FilaRecepcion = { zoho_receive_id: string; zoho_po_id: string; folio_oc: string; fecha: string; monto: number; por_categoria: PorCategoria };
  export function ocDesdeDetalle(po: J, recepciones: Record<string, J>): { oc: FilaOc; recepciones: FilaRecepcion[] };
  export type FilaFactura = { zoho_invoice_id: string; fecha: string; cliente: string; estado: string; total: number; por_categoria_ci: PorCategoria; zoho_modificado: string };
  export function facturaDesdeDetalle(inv: J): FilaFactura;
  export type VentaSemana = { semana: string; venta_total_ci: number; facturas: number; por_categoria_ci: PorCategoria };
  export function ventaSemana(fs: FilaFactura[], lunes: string, excluir: string[]): VentaSemana;
  ```
  (`J` = objeto JSON de Zoho, `any`.)

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/compras/reglas_test.ts
import { assertEquals } from "@std/assert";
import { categoriaSku, facturaDesdeDetalle, insumos, ocDesdeDetalle, sumar, ventaSemana } from "./reglas.ts";

Deno.test("categoriaSku: familias de insumo y RTD; lo demás es otros", () => {
  assertEquals(["INS-CAF-001", "INS-BEB-2", "INS-DES-019", "INS-DEL-1", "INS-BA-075", "INS-LIM-3", "INS-FOD-9", "RTD-ZOÉ-1", "RTD-PER-2", "ENV-1", "INS-PUB-1", ""].map(categoriaSku),
    ["CAF", "BEB", "DES", "DEL", "BA", "LIM", "FOD", "RTD", "RTD", "otros", "otros", "otros"]);
});

Deno.test("sumar redondea a centavos e insumos excluye otros", () => {
  const p = sumar([{ sku: "INS-CAF-1", monto: 10.006 }, { sku: "INS-CAF-2", monto: 1 }, { sku: "ENV-1", monto: 5 }]);
  assertEquals(p, { CAF: 11.01, otros: 5 });
  assertEquals(insumos(p), 11.01);
});

const po = (o: Record<string, unknown> = {}) => ({
  purchaseorder_id: "P1", purchaseorder_number: "COM-OC-1", vendor_name: "Prov", vendor_id: "V1", created_by_name: "Victor",
  date: "2026-11-18", delivery_date: "2026-11-20", status: "open", received_status: "partially_received", currency_code: "MXN",
  total: 0, last_modified_time: "2026-11-24T10:00:00-0600", bills: [], purchasereceives: [],
  line_items: [
    { sku: "INS-DES-001", rate: 100, quantity: 10, quantity_received: 6, tax_percentage: 16 },
    { sku: "ENV-001", rate: 50, quantity: 2, quantity_received: 2, tax_percentage: 0 },
  ],
  ...o,
});

Deno.test("ocDesdeDetalle: montos con IVA, una recepción toma quantity_received", () => {
  const { oc, recepciones } = ocDesdeDetalle(po({ purchasereceives: [{ receive_id: "R1", date: "2026-11-19" }] }), {});
  assertEquals(oc.por_categoria, { DES: 1160, otros: 100 });
  assertEquals(oc.monto_ins, 1160);
  assertEquals(oc.es_registro, false);
  assertEquals(oc.comprador, "Victor");
  assertEquals(recepciones, [{ zoho_receive_id: "R1", zoho_po_id: "P1", folio_oc: "COM-OC-1", fecha: "2026-11-19", monto: 796, por_categoria: { DES: 696, otros: 100 } }]);
});

Deno.test("ocDesdeDetalle: varias recepciones usan su detalle con el rate de la línea", () => {
  const { recepciones } = ocDesdeDetalle(po({ purchasereceives: [{ receive_id: "R1", date: "2026-11-19" }, { receive_id: "R2", date: "2026-11-21" }] }), {
    R1: { line_items: [{ sku: "INS-DES-001", quantity: 4 }] },
    R2: { line_items: [{ sku: "INS-DES-001", quantity: 2 }, { sku: "ENV-001", quantity: 2 }] },
  });
  assertEquals(recepciones.map((r) => [r.zoho_receive_id, r.monto]), [["R1", 464], ["R2", 332]]);
});

Deno.test("ocDesdeDetalle: OC de registro por arribo muy anterior o factura previa; sin arribo no rompe", () => {
  assertEquals(ocDesdeDetalle(po({ delivery_date: "2026-11-05" }), {}).oc.es_registro, true);
  assertEquals(ocDesdeDetalle(po({ delivery_date: "2026-11-12" }), {}).oc.es_registro, false);
  const conFactura = ocDesdeDetalle(po({ bills: [{ date: "2026-11-10" }] }), {}).oc;
  assertEquals([conFactura.es_registro, conFactura.factura_previa], [true, "2026-11-10"]);
  const sinArribo = ocDesdeDetalle(po({ delivery_date: "" }), {}).oc;
  assertEquals([sinArribo.arribo, sinArribo.es_registro], [null, false]);
});

Deno.test("ocDesdeDetalle: moneda distinta de MXN no suma montos", () => {
  const { oc, recepciones } = ocDesdeDetalle(po({ currency_code: "USD", purchasereceives: [{ receive_id: "R1", date: "2026-11-19" }] }), {});
  assertEquals([oc.monto_ins, oc.por_categoria, recepciones[0].monto], [0, {}, 0]);
});

const inv = (o: Record<string, unknown> = {}) => ({
  invoice_id: "F1", date: "2026-11-17", customer_name: "MAGNOLIA GC", status: "paid", total: 1116,
  last_modified_time: "2026-11-24T10:00:00-0600",
  line_items: [{ sku: "INS-CAF-1", item_total: 500, tax_percentage: 0 }, { sku: "INS-DES-1", item_total: 500, tax_percentage: 16 }, { sku: "ENV-1", item_total: 36, tax_percentage: 0 }],
  ...o,
});

Deno.test("facturaDesdeDetalle y ventaSemana: categorías con IVA por línea; sin excluidas ni anuladas", () => {
  const f = facturaDesdeDetalle(inv());
  assertEquals(f.por_categoria_ci, { CAF: 500, DES: 580, otros: 36 });
  const v = ventaSemana([
    f,
    facturaDesdeDetalle(inv({ invoice_id: "F2", customer_name: "DODO PIZZA", total: 99 })),
    facturaDesdeDetalle(inv({ invoice_id: "F3", status: "void", total: 77 })),
    facturaDesdeDetalle(inv({ invoice_id: "F4", date: "2026-11-23", total: 55 })),
  ], "2026-11-16", ["DODO PIZZA", "Compras The Coffee"]);
  assertEquals(v, { semana: "2026-11-16", venta_total_ci: 1116, facturas: 1, por_categoria_ci: { CAF: 500, DES: 580, otros: 36 } });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/compras/reglas_test.ts`
Expected: FAIL — `Module not found "./reglas.ts"`.

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/compras/reglas.ts
// Reglas puras de la sincronización de compras (spec compras §2). Sin Deno ni Zoho: el portal también las importa.
import { en } from "../reporte/config.ts";
import { dif, enRango, finSemana } from "../reporte/fechas.ts";

// deno-lint-ignore no-explicit-any
type J = any;
export type Categoria = "CAF" | "BEB" | "DES" | "DEL" | "BA" | "LIM" | "FOD" | "RTD" | "otros";
export const CATEGORIAS: Exclude<Categoria, "otros">[] = ["CAF", "BEB", "DES", "DEL", "BA", "LIM", "FOD", "RTD"];
export type PorCategoria = Partial<Record<Categoria, number>>;

export function categoriaSku(sku: string): Categoria {
  const s = String(sku ?? "").toUpperCase();
  if (s.startsWith("RTD-")) return "RTD";
  const m = s.match(/^INS-([A-Z]+)-/);
  return m && (CATEGORIAS as string[]).includes(m[1]) ? (m[1] as Categoria) : "otros";
}

const cent = (x: number) => Math.round(x * 100) / 100;
export function sumar(lineas: { sku: string; monto: number }[]): PorCategoria {
  const p: PorCategoria = {};
  for (const l of lineas) { const c = categoriaSku(l.sku); p[c] = (p[c] ?? 0) + l.monto; }
  for (const k of Object.keys(p) as Categoria[]) p[k] = cent(p[k]!);
  return p;
}
export const insumos = (p: PorCategoria) => cent(CATEGORIAS.reduce((a, c) => a + (p[c] ?? 0), 0));

const s = (x: unknown) => String(x ?? "").trim();
const n = (x: unknown) => Number(x) || 0;
const iva = (base: number, tasa: unknown) => base * (1 + n(tasa) / 100);

export type FilaOc = {
  zoho_po_id: string; folio: string; proveedor: string; vendor_id: string; comprador: string; emision: string;
  arribo: string | null; estado: string; received_status: string; moneda: string; total: number; monto_ins: number;
  por_categoria: PorCategoria; es_registro: boolean; factura_previa: string | null; zoho_modificado: string;
};
export type FilaRecepcion = { zoho_receive_id: string; zoho_po_id: string; folio_oc: string; fecha: string; monto: number; por_categoria: PorCategoria };

export function ocDesdeDetalle(po: J, recepciones: Record<string, J>): { oc: FilaOc; recepciones: FilaRecepcion[] } {
  const mxn = s(po.currency_code || "MXN") === "MXN";
  const lineas: J[] = po.line_items ?? [];
  const porSku = new Map<string, J>(lineas.map((l) => [s(l.sku), l]));
  const por_categoria = mxn ? sumar(lineas.map((l) => ({ sku: s(l.sku), monto: iva(n(l.rate) * n(l.quantity), l.tax_percentage) }))) : {};
  const emision = s(po.date);
  const arribo = s(po.delivery_date) || null;
  const facturas = (po.bills ?? []).map((b: J) => s(b.date)).filter(Boolean).sort();
  const factura_previa = facturas.find((f: string) => f < emision) ?? null;
  const es_registro = (arribo != null && dif(arribo, emision) > 7) || factura_previa != null;
  const oc: FilaOc = {
    zoho_po_id: s(po.purchaseorder_id), folio: s(po.purchaseorder_number), proveedor: s(po.vendor_name), vendor_id: s(po.vendor_id),
    comprador: s(po.created_by_name) || "Sin comprador", emision, arribo, estado: s(po.status), received_status: s(po.received_status),
    moneda: s(po.currency_code || "MXN"), total: n(po.total), monto_ins: insumos(por_categoria), por_categoria, es_registro, factura_previa,
    zoho_modificado: s(po.last_modified_time),
  };
  const prs: J[] = po.purchasereceives ?? [];
  const recibido = (ls: { sku: string; q: number }[]) => (mxn
    ? sumar(ls.map((l) => { const pl = porSku.get(l.sku); return { sku: l.sku, monto: pl ? iva(n(pl.rate) * l.q, pl.tax_percentage) : 0 }; }))
    : {});
  const filas = prs.map((r) => {
    const ls = prs.length === 1
      ? lineas.map((l) => ({ sku: s(l.sku), q: n(l.quantity_received) }))
      : (recepciones[s(r.receive_id)]?.line_items ?? []).map((l: J) => ({ sku: s(l.sku), q: n(l.quantity) }));
    const pc = recibido(ls);
    const monto = cent(Object.values(pc).reduce((a, x) => a + (x ?? 0), 0));
    return { zoho_receive_id: s(r.receive_id), zoho_po_id: oc.zoho_po_id, folio_oc: oc.folio, fecha: s(r.date), monto, por_categoria: pc };
  });
  return { oc, recepciones: filas };
}

export type FilaFactura = { zoho_invoice_id: string; fecha: string; cliente: string; estado: string; total: number; por_categoria_ci: PorCategoria; zoho_modificado: string };
export const facturaDesdeDetalle = (inv: J): FilaFactura => ({
  zoho_invoice_id: s(inv.invoice_id), fecha: s(inv.date), cliente: s(inv.customer_name), estado: s(inv.status), total: n(inv.total),
  por_categoria_ci: sumar((inv.line_items ?? []).map((l: J) => ({ sku: s(l.sku), monto: iva(n(l.item_total), l.tax_percentage) }))),
  zoho_modificado: s(inv.last_modified_time),
});

export type VentaSemana = { semana: string; venta_total_ci: number; facturas: number; por_categoria_ci: PorCategoria };
export function ventaSemana(fs: FilaFactura[], lunes: string, excluir: string[]): VentaSemana {
  const fin = finSemana(lunes);
  const v = fs.filter((f) => f.estado !== "void" && f.estado !== "draft" && !en(excluir, f.cliente) && enRango(f.fecha, lunes, fin));
  const pc: PorCategoria = {};
  for (const f of v) for (const [k, x] of Object.entries(f.por_categoria_ci) as [Categoria, number][]) pc[k] = (pc[k] ?? 0) + x;
  for (const k of Object.keys(pc) as Categoria[]) pc[k] = cent(pc[k]!);
  return { semana: lunes, venta_total_ci: cent(v.reduce((a, f) => a + f.total, 0)), facturas: v.length, por_categoria_ci: pc };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/compras/reglas_test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/compras/reglas.ts supabase/functions/_shared/compras/reglas_test.ts
git commit -m "feat(compras): reglas puras de OCs, recepciones y venta por categoría"
```

---

### Task 2: Lectura incremental de Zoho

**Files:**
- Create: `supabase/functions/_shared/compras/zohoCompras.ts`
- Test: `supabase/functions/_shared/compras/zohoCompras_test.ts`

**Interfaces:**
- Consumes: `ZohoClient` (`get`, `listAll`) de `../zoho.ts`.
- Produces:
  ```ts
  export const LIMITE_DETALLES = 60;
  export function pendientesDesde(lista: J[], desde: string | null): J[];            // modificados después de la marca, del más viejo al más nuevo
  export async function leerModificados(z: ZohoClient, path: "/purchaseorders" | "/invoices", key: "purchaseorders" | "invoices",
    desde: string | null, inicio: string): Promise<J[]>;                                // lista ya filtrada y ordenada (viejo → nuevo)
  export type Lote<T> = { filas: T[]; marca: string | null; pendientes: boolean; error: string | null };
  export async function detallar<T>(xs: J[], cupo: number, leer: (x: J) => Promise<T>, pausa?: (ms: number) => Promise<void>): Promise<Lote<T>>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/compras/zohoCompras_test.ts
import { assertEquals } from "@std/assert";
import { detallar, pendientesDesde } from "./zohoCompras.ts";

const x = (id: string, mod: string) => ({ id, last_modified_time: mod });

Deno.test("pendientesDesde: solo posteriores a la marca, del más viejo al más nuevo", () => {
  const l = [x("c", "2026-11-25T10:00:00-0600"), x("b", "2026-11-24T10:00:00-0600"), x("a", "2026-11-20T10:00:00-0600")];
  assertEquals(pendientesDesde(l, "2026-11-21T00:00:00-0600").map((y) => y.id), ["b", "c"]);
  assertEquals(pendientesDesde(l, null).map((y) => y.id), ["a", "b", "c"]);
});

Deno.test("detallar: respeta el cupo, avanza la marca y avisa pendientes", async () => {
  const xs = ["1", "2", "3", "4", "5"].map((i) => x(i, `2026-11-2${i}T10:00:00-0600`));
  const pausas: number[] = [];
  const r = await detallar(xs, 3, async (y) => y.id, async (ms) => { pausas.push(ms); });
  assertEquals([r.filas, r.marca, r.pendientes, r.error], [["1", "2", "3"], "2026-11-23T10:00:00-0600", true, null]);
});

Deno.test("detallar: si un detalle falla, guarda lo anterior y la marca se queda en el último bueno", async () => {
  const xs = ["1", "2", "3"].map((i) => x(i, `2026-11-2${i}T10:00:00-0600`));
  const r = await detallar(xs, 60, async (y) => { if (y.id === "2") throw new Error("429"); return y.id; }, async () => {});
  assertEquals([r.filas, r.marca, r.pendientes], [["1"], "2026-11-21T10:00:00-0600", true]);
  assertEquals(r.error?.includes("429"), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/compras/zohoCompras_test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/compras/zohoCompras.ts
// Solo Edge: lectura incremental de Zoho por last_modified_time, con tope de detalles por corrida (cuota compartida).
import type { ZohoClient } from "../zoho.ts";

// deno-lint-ignore no-explicit-any
type J = any;
export const LIMITE_DETALLES = 60;
const LOTE = 4;
const PAUSA_MS = 4000;
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const t = (x: J) => Date.parse(String(x?.last_modified_time ?? "")) || 0;

export function pendientesDesde(lista: J[], desde: string | null): J[] {
  const corte = desde ? Date.parse(desde) : -Infinity;
  return lista.filter((x) => t(x) > corte).sort((a, b) => t(a) - t(b));
}

export async function leerModificados(z: ZohoClient, path: "/purchaseorders" | "/invoices", key: "purchaseorders" | "invoices",
  desde: string | null, inicio: string): Promise<J[]> {
  // Sin marca: todo desde la fecha de inicio. Con marca: lo más reciente primero hasta cruzar la marca.
  const params: Record<string, string> = desde
    ? { sort_column: "last_modified_time", sort_order: "D" }
    : { date_start: inicio, sort_column: "last_modified_time", sort_order: "D" };
  if (!desde) return pendientesDesde(await z.listAll<J>(path, key, params), null);
  const out: J[] = [];
  for (let page = 1; ; page++) {
    const j = await z.get<Record<string, unknown>>(path, { ...params, page: String(page), per_page: "200" });
    const filas = (j[key] as J[]) ?? [];
    out.push(...filas);
    const cruzo = filas.some((x) => t(x) <= Date.parse(desde));
    if (cruzo || !(j.page_context as { has_more_page?: boolean } | undefined)?.has_more_page) break;
  }
  return pendientesDesde(out, desde);
}

export type Lote<T> = { filas: T[]; marca: string | null; pendientes: boolean; error: string | null };

export async function detallar<T>(xs: J[], cupo: number, leer: (x: J) => Promise<T>, pausa: (ms: number) => Promise<void> = dormir): Promise<Lote<T>> {
  const toma = xs.slice(0, cupo);
  const filas: T[] = [];
  let marca: string | null = null;
  for (let i = 0; i < toma.length; i += LOTE) {
    if (i > 0) await pausa(PAUSA_MS);
    for (const x of toma.slice(i, i + LOTE)) {
      try {
        filas.push(await leer(x));
        marca = String(x.last_modified_time);
      } catch (e) {
        return { filas, marca, pendientes: true, error: String((e as Error)?.message ?? e) };
      }
    }
  }
  return { filas, marca, pendientes: xs.length > toma.length, error: null };
}
```

Nota: `detallar` lee en serie dentro de cada lote (no en paralelo) para que la marca avance en orden estricto; con 4 s de pausa cada 4 detalles quedan unas 50–60 llamadas por minuto.

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/compras/zohoCompras_test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/compras/zohoCompras.ts supabase/functions/_shared/compras/zohoCompras_test.ts
git commit -m "feat(compras): lectura incremental de Zoho con tope por corrida"
```

---

### Task 3: Migración y Edge Function `zoho-compras-sync`

**Files:**
- Create: `supabase/migrations/20261125000098_comercializadora_compras_sync.sql`
- Create: `supabase/functions/zoho-compras-sync/servicio.ts`
- Test: `supabase/functions/zoho-compras-sync/servicio_test.ts`
- Create: `supabase/functions/zoho-compras-sync/index.ts`
- Modify: `supabase/config.toml` (después de `[functions.zoho-reporte-semanal]`)

**Interfaces:**
- Consumes: Task 1 y 2; `admin`, `lanzar`, `responder`, `registrar` de `_shared/db.ts`; `autorizado`; `zohoDesdeEnv`; `normalizarConfigReporte`; `lunesDe`, `sumar` (fechas) de `_shared/reporte/fechas.ts`; `hoyCdmx` de `_shared/fechas.ts`.
- Produces:
  ```ts
  export const ENFRIAMIENTO_MS = 10 * 60_000;
  export function enfriando(ultimaOk: string | null, ahora: Date, forzar: boolean): boolean;
  export function semanasTocadas(fechas: string[]): string[];                          // lunes únicos, ordenados
  export type Resumen = { omitida?: string; ocs: number; recepciones: number; facturas: number; semanas: string[]; pendientes: boolean; avisos: string[] };
  export async function sincronizar(db: SupabaseClient, z: ZohoClient, ahora: Date, forzar: boolean, pausa?: (ms: number) => Promise<void>): Promise<Resumen>;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/zoho-compras-sync/servicio_test.ts
import { assertEquals } from "@std/assert";
import { enfriando, semanasTocadas } from "./servicio.ts";

Deno.test("enfriando: 10 minutos desde la última corrida buena, salvo forzar", () => {
  const ahora = new Date("2026-11-25T12:00:00Z");
  assertEquals(enfriando("2026-11-25T11:55:00Z", ahora, false), true);
  assertEquals(enfriando("2026-11-25T11:45:00Z", ahora, false), false);
  assertEquals(enfriando("2026-11-25T11:55:00Z", ahora, true), false);
  assertEquals(enfriando(null, ahora, false), false);
});

Deno.test("semanasTocadas: lunes únicos ordenados; ignora fechas vacías", () => {
  assertEquals(semanasTocadas(["2026-11-22", "2026-11-17", "", "2026-11-24"]), ["2026-11-16", "2026-11-23"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/zoho-compras-sync/servicio_test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20261125000098_comercializadora_compras_sync.sql
-- Sincronización de compras desde Zoho (spec 2026-11-25-compras-tablero-y-descargas-design.md §2).
-- Solo la Edge Function zoho-compras-sync (service role) escribe; Comercializadora lee.

create table public.com_compras_oc (
  zoho_po_id text primary key,
  folio text not null,
  proveedor text not null default '',
  vendor_id text not null default '',
  comprador text not null default 'Sin comprador',
  emision date not null,
  arribo date,
  estado text not null default '',
  received_status text not null default '',
  moneda text not null default 'MXN',
  total numeric not null default 0,
  monto_ins numeric not null default 0,
  por_categoria jsonb not null default '{}'::jsonb,
  es_registro boolean not null default false,
  factura_previa date,
  zoho_modificado timestamptz,
  actualizado_at timestamptz not null default now()
);
create index com_compras_oc_emision on public.com_compras_oc (emision);

create table public.com_compras_recepcion (
  zoho_receive_id text primary key,
  zoho_po_id text not null references public.com_compras_oc (zoho_po_id) on delete cascade,
  folio_oc text not null,
  fecha date not null,
  monto numeric not null default 0,
  por_categoria jsonb not null default '{}'::jsonb
);
create index com_compras_recepcion_fecha on public.com_compras_recepcion (fecha);
create index com_compras_recepcion_po on public.com_compras_recepcion (zoho_po_id);

create table public.com_compras_factura (
  zoho_invoice_id text primary key,
  fecha date not null,
  cliente text not null default '',
  estado text not null default '',
  total numeric not null default 0,
  por_categoria_ci jsonb not null default '{}'::jsonb,
  zoho_modificado timestamptz
);
create index com_compras_factura_fecha on public.com_compras_factura (fecha);

create table public.com_compras_venta_semana (
  semana date primary key,
  venta_total_ci numeric not null default 0,
  facturas int not null default 0,
  por_categoria_ci jsonb not null default '{}'::jsonb,
  calculado_at timestamptz not null default now()
);

create table public.com_compras_sync_estado (
  id int primary key default 1 check (id = 1),
  oc_modificado_hasta timestamptz,
  factura_modificado_hasta timestamptz
);
insert into public.com_compras_sync_estado (id) values (1);

alter table public.com_compras_oc enable row level security;
alter table public.com_compras_recepcion enable row level security;
alter table public.com_compras_factura enable row level security;
alter table public.com_compras_venta_semana enable row level security;
alter table public.com_compras_sync_estado enable row level security;
revoke all on public.com_compras_oc, public.com_compras_recepcion, public.com_compras_factura,
  public.com_compras_venta_semana, public.com_compras_sync_estado from anon, authenticated;
grant all on public.com_compras_oc, public.com_compras_recepcion, public.com_compras_factura,
  public.com_compras_venta_semana, public.com_compras_sync_estado to service_role;
grant select on public.com_compras_oc, public.com_compras_recepcion, public.com_compras_factura,
  public.com_compras_venta_semana, public.com_compras_sync_estado to authenticated;
create policy lectura on public.com_compras_oc for select to authenticated using ((select public.com_puede_leer()));
create policy lectura on public.com_compras_recepcion for select to authenticated using ((select public.com_puede_leer()));
create policy lectura on public.com_compras_factura for select to authenticated using ((select public.com_puede_leer()));
create policy lectura on public.com_compras_venta_semana for select to authenticated using ((select public.com_puede_leer()));
create policy lectura on public.com_compras_sync_estado for select to authenticated using ((select public.com_puede_leer()));

-- Cada 15 minutos: solo lee Zoho y escribe estas tablas, así que se crea activo (a diferencia de zoho-sync).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    perform cron.schedule('zoho-compras-sync', '7,22,37,52 * * * *', $c$ select public.com_invocar('zoho-compras-sync') $c$);
  end if;
end $$;
```

- [ ] **Step 4: Write `servicio.ts` and `index.ts`**

```ts
// supabase/functions/zoho-compras-sync/servicio.ts
import type { SupabaseClient } from "../_shared/db.ts";
import type { ZohoClient } from "../_shared/zoho.ts";
import { normalizarConfigReporte } from "../_shared/reporte/config.ts";
import { lunesDe, sumar as sumarDias } from "../_shared/reporte/fechas.ts";
import { hoyCdmx } from "../_shared/fechas.ts";
import { type FilaFactura, facturaDesdeDetalle, ocDesdeDetalle, ventaSemana } from "../_shared/compras/reglas.ts";
import { detallar, LIMITE_DETALLES, leerModificados } from "../_shared/compras/zohoCompras.ts";

// deno-lint-ignore no-explicit-any
type J = any;
export const ENFRIAMIENTO_MS = 10 * 60_000;
const INICIO_OCS = "2026-07-01";

export const enfriando = (ultimaOk: string | null, ahora: Date, forzar: boolean) =>
  !forzar && !!ultimaOk && ahora.getTime() - Date.parse(ultimaOk) < ENFRIAMIENTO_MS;

export const semanasTocadas = (fechas: string[]) => [...new Set(fechas.filter(Boolean).map(lunesDe))].sort();

export type Resumen = { omitida?: string; ocs: number; recepciones: number; facturas: number; semanas: string[]; pendientes: boolean; avisos: string[] };

async function ok<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const r = await p;
  if (r.error) throw r.error;
  return r.data;
}

export async function sincronizar(db: SupabaseClient, z: ZohoClient, ahora: Date, forzar: boolean, pausa?: (ms: number) => Promise<void>): Promise<Resumen> {
  const ultima = await ok(db.from("com_sync_log").select("fin").eq("proceso", "zoho-compras-sync").eq("ok", true)
    .not("fin", "is", null).order("fin", { ascending: false }).limit(1).maybeSingle()) as { fin: string } | null;
  if (enfriando(ultima?.fin ?? null, ahora, forzar)) return { omitida: "sincronización reciente", ocs: 0, recepciones: 0, facturas: 0, semanas: [], pendientes: false, avisos: [] };

  const estado = await ok(db.from("com_compras_sync_estado").select("oc_modificado_hasta,factura_modificado_hasta").eq("id", 1).single()) as
    { oc_modificado_hasta: string | null; factura_modificado_hasta: string | null };
  const cfgR = await ok(db.from("com_reporte_config").select("config").eq("id", 1).maybeSingle()) as { config: unknown } | null;
  const excluir = normalizarConfigReporte(cfgR?.config).excluir_ventas;
  const avisos: string[] = [];

  // OCs: detalle de cada OC modificada; detalle de recepciones solo si tiene más de una.
  const ocsLista = await leerModificados(z, "/purchaseorders", "purchaseorders", estado.oc_modificado_hasta, INICIO_OCS);
  const ocs = await detallar(ocsLista, Math.floor(LIMITE_DETALLES / 2), async (x: J) => {
    const po = (await z.get<J>(`/purchaseorders/${x.purchaseorder_id}`)).purchaseorder;
    const recs: Record<string, J> = {};
    if ((po.purchasereceives ?? []).length > 1)
      for (const r of po.purchasereceives) recs[r.receive_id] = (await z.get<J>(`/purchasereceives/${r.receive_id}`)).purchasereceive;
    return ocDesdeDetalle(po, recs);
  }, pausa);
  let nRec = 0;
  for (const { oc, recepciones } of ocs.filas) {
    await ok(db.from("com_compras_oc").upsert({ ...oc, actualizado_at: ahora.toISOString() }, { onConflict: "zoho_po_id" }));
    await ok(db.from("com_compras_recepcion").delete().eq("zoho_po_id", oc.zoho_po_id));
    if (recepciones.length) await ok(db.from("com_compras_recepcion").insert(recepciones));
    nRec += recepciones.length;
  }
  if (ocs.error) avisos.push(`OCs: ${ocs.error}`);

  // Facturas: detalle con líneas; luego se recalculan las semanas tocadas.
  const inicioFact = sumarDias(lunesDe(hoyCdmx(ahora)), -7 * 16);
  const factLista = await leerModificados(z, "/invoices", "invoices", estado.factura_modificado_hasta, inicioFact);
  const facts = await detallar(factLista, LIMITE_DETALLES - ocs.filas.length, async (x: J) =>
    facturaDesdeDetalle((await z.get<J>(`/invoices/${x.invoice_id}`)).invoice), pausa);
  if (facts.filas.length) await ok(db.from("com_compras_factura").upsert(facts.filas, { onConflict: "zoho_invoice_id" }));
  if (facts.error) avisos.push(`Facturas: ${facts.error}`);
  const semanas = semanasTocadas(facts.filas.map((f) => f.fecha));
  for (const lunes of semanas) {
    const fs = await ok(db.from("com_compras_factura").select("zoho_invoice_id,fecha,cliente,estado,total,por_categoria_ci,zoho_modificado")
      .gte("fecha", lunes).lte("fecha", sumarDias(lunes, 6))) as FilaFactura[];
    await ok(db.from("com_compras_venta_semana").upsert({ ...ventaSemana(fs, lunes, excluir), calculado_at: ahora.toISOString() }, { onConflict: "semana" }));
  }

  await ok(db.from("com_compras_sync_estado").update({
    oc_modificado_hasta: ocs.marca ?? estado.oc_modificado_hasta,
    factura_modificado_hasta: facts.marca ?? estado.factura_modificado_hasta,
  }).eq("id", 1));
  if (ocs.error && facts.error && !ocs.filas.length && !facts.filas.length) throw new Error(avisos.join(" · "));
  return { ocs: ocs.filas.length, recepciones: nRec, facturas: facts.filas.length, semanas, pendientes: ocs.pendientes || facts.pendientes, avisos };
}
```

```ts
// supabase/functions/zoho-compras-sync/index.ts
import { autorizado } from "../_shared/acceso.ts";
import { admin, lanzar, registrar, responder } from "../_shared/db.ts";
import { zohoDesdeEnv } from "../_shared/zoho.ts";
import { sincronizar } from "./servicio.ts";

// Solo lectura de Zoho: OCs, recepciones y facturas para el tablero de compras (spec compras §2).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return responder(null);
  if (!autorizado(req)) return responder({ ok: false, error: "No autorizado" }, 401);
  const body = await req.json().catch(() => ({}));
  const db = admin();
  return lanzar(() => registrar(db, "zoho-compras-sync", () =>
    sincronizar(db, zohoDesdeEnv({ soloLectura: true, tokenVar: "ZOHO_REPORTE_REFRESH_TOKEN" }), new Date(), body?.forzar === true)));
});
```

En `supabase/config.toml`, después de `[functions.zoho-reporte-semanal]` / `verify_jwt = false`:

```toml
[functions.zoho-compras-sync]
verify_jwt = false
```

Nota: una corrida omitida por enfriamiento también queda en `com_sync_log` como ok; eso es aceptable (el enfriamiento mira la última `ok`, y una omitida no adelanta datos, solo vuelve a esperar 10 min).

- [ ] **Step 5: Run tests and type check**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/compras/ supabase/functions/zoho-compras-sync/`
Expected: PASS.
Run: `deno check --config supabase/functions/deno.json supabase/functions/zoho-compras-sync/index.ts`
Expected: sin errores (si los tipos de supabase-js piden ajustes en `ok()`, corrige solo los tipos).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261125000098_comercializadora_compras_sync.sql supabase/functions/zoho-compras-sync/ supabase/config.toml
git commit -m "feat(compras): Edge Function zoho-compras-sync con tablas, marcas y cron"
```

---

### Task 4: Paridad con el tablero de compras

**Files:**
- Create: `supabase/functions/_shared/pruebas/compras-2026-11.json`
- Test: `supabase/functions/_shared/compras/paridad_test.ts`
- Modify: spec §7 con las diferencias encontradas

- [ ] **Step 1: Capturar el fixture (lo hace el controlador con la sesión de Zoho del navegador)**

Detalles de las facturas de las semanas 2026-11-09 y 2026-11-16 (`/invoices/{id}`: `invoice_id`, `date`, `customer_name`, `status`, `total`, `last_modified_time`, `line_items[{sku,item_total,tax_percentage}]`) y de las OCs con `date` desde 2026-10-01 (`/purchaseorders/{id}`: los campos de `ocDesdeDetalle`, más `/purchasereceives/{id}` cuando haya más de una recepción). Guardar comprimido y reducido a esos campos.

- [ ] **Step 2: Write the parity test**

```ts
// supabase/functions/_shared/compras/paridad_test.ts
import { assertEquals } from "@std/assert";
import { facturaDesdeDetalle, ocDesdeDetalle, ventaSemana } from "./reglas.ts";

const d = JSON.parse(await Deno.readTextFile(new URL("../pruebas/compras-2026-11.json", import.meta.url)));
const excluir = ["DODO PIZZA", "Compras The Coffee"];
const facturas = d.facturas.map(facturaDesdeDetalle);
// Valores de __DATA__.semanas del tablero Gestion_Compras_Comercializadora_41.html (datos al 23 nov).
const TABLERO: Record<string, { vc: Record<string, number>; vt: number }> = {
  "2026-11-16": { vt: 1193333.39, vc: { CAF: 399850, BEB: 213405, DES: 279340, DEL: 43885, BA: 86757, LIM: 22101, FOD: 17622, RTD: 16633 } },
};

Deno.test("paridad: venta por categoría de la semana 16–22 nov igual al tablero", () => {
  const v = ventaSemana(facturas, "2026-11-16", excluir);
  assertEquals(Math.round(v.venta_total_ci * 100) / 100, TABLERO["2026-11-16"].vt);
  for (const [c, x] of Object.entries(TABLERO["2026-11-16"].vc)) assertEquals(Math.round(v.por_categoria_ci[c as "CAF"] ?? 0), x, c);
});

Deno.test("paridad: compras recibidas de la semana 16–22 nov contra el tablero (rx_tc_ci)", () => {
  const recs = d.ocs.flatMap((po: unknown) => ocDesdeDetalle(po, d.recepciones ?? {}).recepciones
    .map((r) => ({ ...r, registro: ocDesdeDetalle(po, d.recepciones ?? {}).oc.es_registro })));
  const semana = recs.filter((r: { fecha: string; registro: boolean }) => r.fecha >= "2026-11-16" && r.fecha <= "2026-11-22" && !r.registro);
  const total = Math.round(semana.reduce((a: number, r: { monto: number }) => a + r.monto, 0));
  assertEquals(total, d.tablero_rx_tc_ci_2026_11_16);
});
```

(El controlador agrega `tablero_rx_tc_ci_2026_11_16` y los demás valores de referencia leídos del HTML al fixture; si no cuadran, se investiga por folio como en la fase anterior y se documenta en spec §7 antes de aceptar un valor distinto.)

- [ ] **Step 3: Run it**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/compras/paridad_test.ts`
Expected: PASS, o diferencias explicadas por folio en spec §7.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/pruebas/compras-2026-11.json supabase/functions/_shared/compras/paridad_test.ts docs/superpowers/specs/2026-11-25-compras-tablero-y-descargas-design.md
git commit -m "test(compras): paridad con el tablero de compras"
```

---

### Task 5: Despliegue y primera carga (con confirmación del usuario)

- [ ] **Step 1:** El usuario regenera `ZOHO_REPORTE_REFRESH_TOKEN` con `ZohoBooks.invoices.READ,ZohoBooks.salesorders.READ,ZohoBooks.creditnotes.READ,ZohoBooks.packages.READ,ZohoBooks.purchaseorders.READ` y lo guarda con `npx.cmd supabase secrets set`.
- [ ] **Step 2:** `npx supabase db push --remote --yes` (solo la migración 098) y `npx supabase functions deploy zoho-compras-sync --project-ref jpqkmnfjwzniptszjuli --yes`.
- [ ] **Step 3:** Lanzar una corrida con `forzar: true` y revisar el resumen; dejar que el cron complete la primera carga (≈ 1,900 detalles a 60 por corrida cada 15 min ≈ 8 h).
- [ ] **Step 4:** Verificar en Supabase: semanas con venta, OCs con recepciones, y que `com_compras_venta_semana` del 2026-11-16 coincide con el tablero.
