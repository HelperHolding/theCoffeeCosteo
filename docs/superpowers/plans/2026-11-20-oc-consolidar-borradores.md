# OC automática: consolidar borradores y alertar OCs emitidas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que `zoho-generar-oc` junte en una sola OC lo nuevo de un proveedor con sus borradores (cancelando los viejos) y avise cuando el proveedor ya tiene una OC emitida, detrás de la bandera `auto.consolidar`.

**Architecture:** un módulo puro nuevo `zoho-generar-oc/consolidar.ts` decide por proveedor (consolidar / alertar / nada) a partir de la propuesta normal, las OCs abiertas y una segunda propuesta calculada "sin los borradores". `generar.ts` lo llama solo con `auto.consolidar = true`: verifica en vivo los borradores (modo Real), crea la OC nueva, cancela (o borra) los viejos y guarda `reemplaza` / `alerta_emitidas` en `com_oc_auto`. Un correo aparte resume consolidaciones y alertas. El mismo código se copia al sitio viejo.

**Tech Stack:** Deno (Edge Functions de Supabase), `@std/assert`, Vitest para la prueba de migración del portal, Zoho Books API v3.

**Spec:** `docs/superpowers/specs/2026-11-20-oc-consolidar-borradores-design.md`

## Global Constraints

- Solo se reemplazan OCs con status `draft`. Una OC emitida (`ocAbierta(status)` y no `draft`) nunca se cancela, borra ni edita.
- Cualquier borrador del proveedor cuenta (automático o manual).
- SKU manejado (tiene `Fila`, no es `SKU_MARCADOR` y su `zoho_vendor_id` es el del borrador) = cantidad recalculada; si da 0, sale de la OC. SKU no manejado = cantidad y precio del borrador.
- Orden en Zoho: verificar en vivo → crear la nueva → cancelar (`POST /purchaseorders/{id}/status/cancelled`; si Zoho responde 4xx, `DELETE /purchaseorders/{id}`). Si crear falla, no se cancela nada.
- Bandera `config.auto.consolidar`, default `false`. Con `false`, `generar` se comporta exactamente como hoy (las pruebas existentes no cambian).
- `com_oc_auto.reemplaza` y `com_oc_auto.alerta_emitidas` solo se escriben cuando hay algo (el viejo puede correr sin las columnas mientras la bandera esté apagada).
- Correo aparte a `cfg.auto.correos`, asunto `OC automática <fecha>: consolidaciones y alertas[ (simulación)]`, solo si hubo consolidaciones o alertas; HTML escapado.
- El código de `_shared/posicion.ts`, `_shared/db.ts`, `zoho-generar-oc/*.ts` debe quedar idéntico en los dos repos (salvo `_shared/zoho.ts`, que en el portal ya tiene `soloLectura`).
- Producción: merge a `main` del portal aplica migraciones solo; el viejo se publica a mano (`com-minmax` y `zoho-generar-oc` juntos) y su SQL lo corre el usuario. Nada de eso sin OK explícito. La bandera no se prende en ningún sitio en este plan.
- Nunca imprimir llaves, contraseñas ni cadenas de conexión.

## Review Focus

1. **Borrador que ya no es draft en vivo** (alguien lo emitió o canceló después del sync): emitido → alerta, cancelado/borrado (404) → se ignora. Prueba en Task 5.
2. **SKU del borrador cuyo proveedor de catálogo es otro**: no se desbloquea ni recalcula; viaja como `borrador` con su cantidad. Prueba en Task 3.
3. **Cancelación falla después de crear**: la OC nueva queda registrada y el correo dice "cancelar a mano COM-OC-xxxx". Prueba en Task 5.
4. **Bandera apagada**: ni llamadas extra a Zoho, ni columnas nuevas en el insert, ni correo extra. Prueba en Task 5.
5. **Línea `borrador` sin `item_id` en Real** (no debería pasar porque viene del GET en vivo): no se crea la OC de ese proveedor, error en el correo, no se cancela nada. Prueba en Task 5.

## Mapa de archivos (portal: `C:\Users\sebcm\Projects\thecoffee-costeos-inventario`, rama nueva desde `origin/main`)

| Archivo | Tarea | Qué |
|---|---|---|
| `supabase/functions/_shared/db.ts` | 1 | `auto.consolidar` |
| `supabase/functions/_shared/zoho.ts` | 1 | `del()` |
| `supabase/functions/_shared/posicion.ts` | 2 | `OcProveedor`, `cargarOcsProveedor`, `sinBorradores` |
| `supabase/functions/zoho-generar-oc/consolidar.ts` (nuevo) | 3 | `planConsolidar` |
| `supabase/functions/zoho-generar-oc/correoConsolidar.ts` (nuevo) | 4 | `correoConsolidarHtml` |
| `supabase/functions/zoho-generar-oc/generar.ts` | 5 | verificación en vivo, escritura, registro, correo |
| `supabase/migrations/2026112000007x_comercializadora_oc_consolidar.sql` | 6 | columnas en `com_oc_auto` |
| `tests/db/comercializadora-oc-consolidar.test.ts` | 6 | prueba de la migración |
| `docs/migracion/comercializadora.md` | 6 | sección nueva |
| Repo viejo `C:\Users\sebcm\Projects\thecoffee-comercializadora-consolidar` (worktree nuevo desde `origin/main`) | 7 | copia + SQL manual |

Pruebas de funciones del portal: `npm run test:funciones` (o un archivo: `deno test --config supabase/functions/deno.json --allow-env --allow-read <archivo>`). Del viejo: `deno task test` en su raíz.

---

### Task 1: bandera `auto.consolidar` y `ZohoClient.del`

**Files:**
- Modify: `supabase/functions/_shared/db.ts` (tipo `PlanConfig.auto` y `cargarConfig`)
- Modify: `supabase/functions/_shared/zoho.ts` (método `del`)
- Test: `supabase/functions/_shared/db_test.ts`, `supabase/functions/_shared/zoho_test.ts` (si no existe `zoho_test.ts`, crearlo)

**Interfaces:**
- Produces: `cfg.auto.consolidar: boolean`; `ZohoClient.del<T>(path: string): Promise<T>` (método `DELETE`, sin reintento de 5xx, bloqueado por `soloLectura` como `post`).

- [ ] **Step 1: pruebas que fallan**

En `db_test.ts` (seguir el estilo del archivo para construir un `db` falso de `com_plan_config`; si ya hay una prueba de `cargarConfig`, agregar al lado):

```ts
Deno.test("cargarConfig: auto.consolidar solo es true si la configuración lo dice explícitamente", async () => {
  const conf = (auto: Record<string, unknown>) => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { config: { auto } }, error: null }), single: () => Promise.resolve({ data: { config: { auto } }, error: null }) }) }) }),
  }) as never;
  assertEquals((await cargarConfig(conf({}))).auto.consolidar, false);
  assertEquals((await cargarConfig(conf({ consolidar: "si" }))).auto.consolidar, false);
  assertEquals((await cargarConfig(conf({ consolidar: true }))).auto.consolidar, true);
});
```

(Si `cargarConfig` encadena otros métodos, ajustar el falso para que regrese el mismo objeto en cada llamada, como `cadena()` de `generar_test.ts`.)

En `zoho_test.ts`:

```ts
import { assertEquals, assertRejects } from "@std/assert";
import { ZohoClient, ZohoError } from "./zoho.ts";

const cfg = { clientId: "c", clientSecret: "s", refreshToken: "r", orgId: "o" };
function cliente(respuestas: Response[], soloLectura = false) {
  const llamadas: { method: string; url: string }[] = [];
  const f = (url: string, init?: RequestInit) => {
    if (url.includes("oauth")) return Promise.resolve(new Response(JSON.stringify({ access_token: "t", expires_in: 3600 })));
    llamadas.push({ method: String(init?.method), url });
    return Promise.resolve(respuestas.shift()!);
  };
  return { z: new ZohoClient({ ...cfg, soloLectura } as never, f as never, () => Promise.resolve()), llamadas };
}

Deno.test("del manda DELETE y no reintenta un 5xx", async () => {
  const { z, llamadas } = cliente([new Response("{}", { status: 500 })]);
  await assertRejects(() => z.del("/purchaseorders/1"), ZohoError);
  assertEquals(llamadas.map((l) => l.method), ["DELETE"]);
});

Deno.test("del en solo lectura no llama a Zoho", async () => {
  const { z, llamadas } = cliente([], true);
  await assertRejects(() => z.del("/purchaseorders/1"), ZohoError, "sin efectos externos");
  assertEquals(llamadas.length, 0);
});
```

Antes de escribirla, leer el constructor real de `ZohoClient` (`_shared/zoho.ts` líneas 15–30) y ajustar los argumentos (`cfg`, `fetch`, `sleep`) a su firma exacta. En el viejo no existe `soloLectura`: esa segunda prueba solo va en el portal.

- [ ] **Step 2: correr y ver que fallan**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/db_test.ts supabase/functions/_shared/zoho_test.ts`
Expected: FAIL (`consolidar` undefined; `z.del is not a function`).

- [ ] **Step 3: implementación**

`db.ts`, en el tipo `auto`:

```ts
    pagos_horizonte: number; pagos_base: "llegada" | "oc"; sync_catalogo: "aplicar" | "registrar"; zoho_cf_minimo: string;
    consolidar: boolean };
```

y en `cargarConfig`, después de `zoho_cf_minimo: …,`:

```ts
      consolidar: c.auto?.consolidar === true,
```

`zoho.ts`, después de `put`:

```ts
  /** DELETE: igual que post, no reintenta 5xx. */
  del<T>(path: string): Promise<T> {
    return this.pedir<T>("DELETE", path, {});
  }
```

- [ ] **Step 4: correr y ver que pasan; suite de funciones**

Run: el comando del Step 2, luego `npm run test:funciones`
Expected: PASS; la suite completa sin fallas nuevas.

- [ ] **Step 5: commit**

```bash
git add supabase/functions/_shared/db.ts supabase/functions/_shared/zoho.ts supabase/functions/_shared/db_test.ts supabase/functions/_shared/zoho_test.ts
git commit -m "feat(comercializadora): bandera auto.consolidar y DELETE en el cliente de Zoho"
```

---

### Task 2: OCs abiertas por proveedor y posición sin borradores

**Files:**
- Modify: `supabase/functions/_shared/posicion.ts`
- Test: `supabase/functions/_shared/posicion_test.ts` (crear si no existe)

**Interfaces:**
- Produces:

```ts
export type OcProveedor = {
  zoho_po_id: string; po_number: string; status: string; vendor_id: string; vendor_name: string | null;
  sku: string; item_id: string | null; cantidad: number; pendiente: number; precio: number | null; fecha_oc: string | null;
};
export const esBorrador: (status: string) => boolean;            // status.toLowerCase() === "draft"
export function cargarOcsProveedor(db: SupabaseClient): Promise<OcProveedor[]>; // abiertas, con vendor_id, sin filtrar marcador
export function sinBorradores(filas: Fila[], quitar: OcProveedor[]): Fila[];
```

`sinBorradores` resta de `enCamino` el `pendiente` de cada línea de `quitar` **solo si** la `Fila` de ese SKU tiene `zoho_vendor_id === linea.vendor_id`, y pone `enOcAbierta = enCamino > 0`. No muta `filas`.

- [ ] **Step 1: pruebas que fallan**

```ts
import { assertEquals } from "@std/assert";
import { esBorrador, type Fila, type OcProveedor, sinBorradores } from "./posicion.ts";

const fila = (o: Partial<Fila>): Fila => ({
  sku: "A", nombre: "A", zoho_item_id: "i", zoho_vendor_id: "v1", zoho_vendor_name: "P", costo: 10, fisico: 0, fisicoRespaldo: false,
  saldo_yulius: 0, enCamino: 0, enOcAbierta: false, minimo: 340, maximo: 640, venta_diaria: 20, kits_max: 0, multiplo: null,
  minimoPzas: null, lead_time: 7, ...o,
});
const oc = (o: Partial<OcProveedor>): OcProveedor => ({
  zoho_po_id: "po1", po_number: "COM-OC-1", status: "draft", vendor_id: "v1", vendor_name: "P", sku: "A", item_id: "i",
  cantidad: 100, pendiente: 100, precio: 10, fecha_oc: "2026-11-16", ...o,
});

Deno.test("esBorrador solo para draft", () => {
  assertEquals(["draft", "DRAFT", "open", "billed"].map(esBorrador), [true, true, false, false]);
});

Deno.test("sinBorradores quita el pendiente del borrador y desbloquea si no queda nada en camino", () => {
  const out = sinBorradores([fila({ enCamino: 100, enOcAbierta: true })], [oc({})]);
  assertEquals([out[0].enCamino, out[0].enOcAbierta], [0, false]);
});

Deno.test("sinBorradores deja bloqueado si además hay una OC emitida", () => {
  const out = sinBorradores([fila({ enCamino: 150, enOcAbierta: true })], [oc({ pendiente: 100 })]);
  assertEquals([out[0].enCamino, out[0].enOcAbierta], [50, true]);
});

Deno.test("sinBorradores no toca un SKU cuyo proveedor de catálogo es otro", () => {
  const filas = [fila({ zoho_vendor_id: "v2", enCamino: 100, enOcAbierta: true })];
  const out = sinBorradores(filas, [oc({})]);
  assertEquals([out[0].enCamino, out[0].enOcAbierta], [100, true]);
  assertEquals(filas[0].enCamino, 100); // no muta
});
```

- [ ] **Step 2: correr y ver que fallan**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/posicion_test.ts`
Expected: FAIL (exports inexistentes).

- [ ] **Step 3: implementación** (al final de `posicion.ts`)

```ts
export type OcProveedor = {
  zoho_po_id: string; po_number: string; status: string; vendor_id: string; vendor_name: string | null;
  sku: string; item_id: string | null; cantidad: number; pendiente: number; precio: number | null; fecha_oc: string | null;
};

export const esBorrador = (status: string) => String(status ?? "").toLowerCase() === "draft";

/** Líneas de OCs abiertas con proveedor, para consolidar borradores y alertar emitidas. Incluye marcadores (ENV…). */
export async function cargarOcsProveedor(db: SupabaseClient): Promise<OcProveedor[]> {
  const filas = await todo<Record<string, unknown>>((a, b) =>
    db.from("com_zoho_oc_lineas")
      .select("zoho_po_id,po_number,status,vendor_id,vendor_name,sku,cantidad,cantidad_recibida,precio,fecha_oc")
      .order("zoho_po_id").order("sku").range(a, b));
  const out: OcProveedor[] = [];
  for (const l of filas) {
    const status = String(l.status ?? "");
    if (!ocAbierta(status) || !l.vendor_id) continue;
    const cantidad = Number(l.cantidad);
    out.push({
      zoho_po_id: String(l.zoho_po_id), po_number: String(l.po_number ?? ""), status, vendor_id: String(l.vendor_id),
      vendor_name: (l.vendor_name as string) ?? null, sku: String(l.sku ?? ""), item_id: null, cantidad,
      pendiente: cantidad - Number(l.cantidad_recibida ?? 0), precio: l.precio == null ? null : Number(l.precio),
      fecha_oc: (l.fecha_oc as string) ?? null,
    });
  }
  return out;
}

/** Posición como si los borradores `quitar` no existieran (solo para SKUs de ese mismo proveedor). No muta. */
export function sinBorradores(filas: Fila[], quitar: OcProveedor[]): Fila[] {
  const menos = new Map<string, number>();
  const porSku = new Map(filas.map((f) => [f.sku, f]));
  for (const l of quitar) {
    const f = porSku.get(l.sku);
    if (!f || f.zoho_vendor_id !== l.vendor_id || !(l.pendiente > 0)) continue;
    menos.set(l.sku, (menos.get(l.sku) ?? 0) + l.pendiente);
  }
  return filas.map((f) => {
    const m = menos.get(f.sku);
    if (!m) return f;
    const enCamino = Math.max(0, f.enCamino - m);
    return { ...f, enCamino, enOcAbierta: enCamino > 0 };
  });
}
```

- [ ] **Step 4: correr y ver que pasan; suite**

Run: el comando del Step 2, luego `npm run test:funciones`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add supabase/functions/_shared/posicion.ts supabase/functions/_shared/posicion_test.ts
git commit -m "feat(comercializadora): OCs abiertas por proveedor y posición sin borradores"
```

---

### Task 3: `planConsolidar` (puro)

**Files:**
- Create: `supabase/functions/zoho-generar-oc/consolidar.ts`
- Modify: `supabase/functions/zoho-generar-oc/generar.ts` (solo el tipo `Linea`: campos opcionales `antes?: number; origen?: "nuevo" | "recalculado" | "borrador"`, y `item_id: string | null` sigue siendo `string` para las líneas normales — ver abajo)
- Test: `supabase/functions/zoho-generar-oc/consolidar_test.ts`

**Interfaces:**
- Consumes: `Fila`, `OcProveedor`, `esBorrador`, `sinBorradores` (Task 2); `Propuesta`, `Linea` de `generar.ts`.
- Produces:

```ts
export type Grupo = Propuesta["porProveedor"][number];
export type Consolidada = {
  vendor_id: string; vendor_name: string;
  borradores: { zoho_po_id: string; po_number: string }[];
  monto_antes: number;
  quitados: { sku: string; nombre: string; antes: number }[];
};
export type Alerta = {
  vendor_id: string; vendor_name: string;
  emitidas: { zoho_po_id: string; po_number: string; fecha_oc: string | null }[];
  skus: { sku: string; nombre: string; cantidad: number }[];
};
export type PlanConsolidar = { porProveedor: Grupo[]; consolidadas: Consolidada[]; alertas: Alerta[] };
export function vendoresConBorrador(prop: Propuesta, ocs: OcProveedor[]): Set<string>;
export function planConsolidar(a: {
  filas: Fila[]; ocs: OcProveedor[]; prop: Propuesta; proponerCon: (filas: Fila[]) => Propuesta;
}): PlanConsolidar;
```

Reglas (spec §3–§4):
- `nuevo` de un proveedor = sus líneas en `prop` (los SKUs de borradores ya vienen bloqueados en `prop`).
- Consolidar si el proveedor tiene líneas en `prop` y al menos un borrador en `ocs` (`esBorrador`).
- `prop2 = proponerCon(sinBorradores(filas, borradoresDeEsos))`. Grupo consolidado = grupo de `prop2` de ese proveedor, con `origen: "nuevo"` para SKUs que estaban en `prop` y `origen: "recalculado"` + `antes` para SKUs de sus borradores.
- Líneas de borrador **no manejadas** (sin `Fila`, `SKU_MARCADOR`, o `Fila` de otro proveedor): se agregan con `cantidad` = suma de `cantidad` del borrador, `costo` = `precio ?? 0`, `item_id` = el de la línea (puede ser null en simulación), `origen: "borrador"`, `antes` = la misma cantidad, y ceros en `disponible/enCamino/minimo/maximo/venta_diaria/kits`.
- SKUs manejados del borrador que no aparecen en el grupo de `prop2` → `quitados` con su `antes`.
- `monto_antes` = Σ `cantidad × (precio ?? 0)` de todos sus borradores. `monto` del grupo se recalcula con `r2`.
- Alertas: para cada proveedor del resultado final con líneas `nuevo` y alguna OC no borrador en `ocs`: `emitidas` (una por `zoho_po_id`) y `skus` = sus líneas con `origen` `nuevo` (o todas las de `prop` si no consolida).
- Proveedores sin borradores: su grupo de `prop` sin cambios. El orden final por `vendor_id` como `proponer`.
- `bajo_minimo` / `minimo` del grupo de `prop2` se conservan (el mínimo se evalúa sobre la OC consolidada).

- [ ] **Step 1: pruebas que fallan** (`consolidar_test.ts`)

```ts
import { assertEquals } from "@std/assert";
import type { Fila, OcProveedor } from "../_shared/posicion.ts";
import { proponer } from "./generar.ts";
import { planConsolidar, vendoresConBorrador } from "./consolidar.ts";

const f = (o: Partial<Fila>): Fila => ({
  sku: "S", nombre: "N", zoho_item_id: "i", zoho_vendor_id: "v1", zoho_vendor_name: "P1", costo: 10, fisico: 0, fisicoRespaldo: false,
  saldo_yulius: 0, enCamino: 0, enOcAbierta: false, minimo: 340, maximo: 640, venta_diaria: 20, kits_max: 0, multiplo: null,
  minimoPzas: null, lead_time: 7, ...o,
});
const oc = (o: Partial<OcProveedor>): OcProveedor => ({
  zoho_po_id: "po1", po_number: "COM-OC-1", status: "draft", vendor_id: "v1", vendor_name: "P1", sku: "A", item_id: null,
  cantidad: 100, pendiente: 100, precio: 10, fecha_oc: "2026-11-16", ...o,
});
const correr = (filas: Fila[], ocs: OcProveedor[]) =>
  planConsolidar({ filas, ocs, prop: proponer(filas, true), proponerCon: (x) => proponer(x, true) });
const lineas = (g: { lineas: { sku: string; cantidad: number; origen?: string; antes?: number }[] }) =>
  g.lineas.map((l) => [l.sku, l.cantidad, l.origen ?? null, l.antes ?? null]);

Deno.test("borrador + algo nuevo → una OC con lo nuevo y el SKU del borrador recalculado", () => {
  // A está en borrador (100 en camino, bloqueado); B es nuevo. Sin el borrador, A pide 640.
  const p = correr([f({ sku: "A", enCamino: 100, enOcAbierta: true }), f({ sku: "B" })], [oc({ sku: "A" })]);
  assertEquals(p.porProveedor.length, 1);
  assertEquals(lineas(p.porProveedor[0]), [["A", 640, "recalculado", 100], ["B", 640, "nuevo", null]]);
  assertEquals(p.porProveedor[0].monto, 12800);
  assertEquals(p.consolidadas, [{ vendor_id: "v1", vendor_name: "P1", borradores: [{ zoho_po_id: "po1", po_number: "COM-OC-1" }], monto_antes: 1000, quitados: [] }]);
  assertEquals(p.alertas, []);
});

Deno.test("borrador sin nada nuevo → no se toca", () => {
  const filas = [f({ sku: "A", enCamino: 100, enOcAbierta: true })];
  const p = correr(filas, [oc({ sku: "A" })]);
  assertEquals([p.porProveedor, p.consolidadas, p.alertas], [[], [], []]);
});

Deno.test("varios borradores del mismo proveedor → una sola OC y los dos en reemplaza", () => {
  const p = correr(
    [f({ sku: "A", enCamino: 100, enOcAbierta: true }), f({ sku: "C", enCamino: 50, enOcAbierta: true }), f({ sku: "B" })],
    [oc({ sku: "A" }), oc({ zoho_po_id: "po2", po_number: "COM-OC-2", sku: "C", cantidad: 50, pendiente: 50 })],
  );
  assertEquals(p.consolidadas[0].borradores.map((b) => b.po_number), ["COM-OC-1", "COM-OC-2"]);
  assertEquals(p.porProveedor[0].lineas.map((l) => l.sku), ["A", "B", "C"]);
});

Deno.test("SKU manejado que recalcula a 0 sale y va a quitados", () => {
  // A tiene 1000 físico: sin el borrador ya no hace falta.
  const p = correr([f({ sku: "A", fisico: 1000, enCamino: 100, enOcAbierta: true }), f({ sku: "B" })], [oc({ sku: "A" })]);
  assertEquals(lineas(p.porProveedor[0]), [["B", 640, "nuevo", null]]);
  assertEquals(p.consolidadas[0].quitados, [{ sku: "A", nombre: "N", antes: 100 }]);
});

Deno.test("SKU no manejado (sin fila o marcador) pasa con cantidad y precio del borrador", () => {
  const p = correr([f({ sku: "B" })], [oc({ sku: "ENV", cantidad: 1, pendiente: 1, precio: 250, item_id: "it-env" }), oc({ sku: "X9", cantidad: 3, pendiente: 3, precio: 7 })]);
  assertEquals(lineas(p.porProveedor[0]), [["B", 640, "nuevo", null], ["ENV", 1, "borrador", 1], ["X9", 3, "borrador", 3]]);
  assertEquals(p.porProveedor[0].lineas.find((l) => l.sku === "ENV")!.item_id, "it-env");
  assertEquals(p.porProveedor[0].monto, 6400 + 250 + 21);
});

Deno.test("SKU del borrador cuyo proveedor de catálogo es otro: no se recalcula, viaja como borrador", () => {
  const p = correr([f({ sku: "A", zoho_vendor_id: "v2", enCamino: 100, enOcAbierta: true }), f({ sku: "B" })], [oc({ sku: "A" })]);
  assertEquals(lineas(p.porProveedor.find((g) => g.vendor_id === "v1")!), [["A", 100, "borrador", 100], ["B", 640, "nuevo", null]]);
  assertEquals(p.porProveedor.some((g) => g.vendor_id === "v2"), false);
});

Deno.test("OC emitida + algo nuevo → OC aparte (sin cambios) y alerta", () => {
  const p = correr([f({ sku: "A", enCamino: 100, enOcAbierta: true }), f({ sku: "B" })], [oc({ sku: "A", status: "open", po_number: "COM-OC-9" })]);
  assertEquals(lineas(p.porProveedor[0]), [["B", 640, null, null]]);
  assertEquals(p.consolidadas, []);
  assertEquals(p.alertas, [{ vendor_id: "v1", vendor_name: "P1", emitidas: [{ zoho_po_id: "po1", po_number: "COM-OC-9", fecha_oc: "2026-11-16" }],
    skus: [{ sku: "B", nombre: "N", cantidad: 640 }] }]);
});

Deno.test("borrador + emitida + nuevo → consolida el borrador y alerta por la emitida", () => {
  const p = correr(
    [f({ sku: "A", enCamino: 100, enOcAbierta: true }), f({ sku: "C", enCamino: 30, enOcAbierta: true }), f({ sku: "B" })],
    [oc({ sku: "A" }), oc({ zoho_po_id: "po9", po_number: "COM-OC-9", status: "open", sku: "C", cantidad: 30, pendiente: 30 })],
  );
  assertEquals(p.porProveedor[0].lineas.map((l) => l.sku), ["A", "B"]); // C sigue bloqueado por la emitida
  assertEquals(p.consolidadas.length, 1);
  assertEquals(p.alertas[0].emitidas.map((e) => e.po_number), ["COM-OC-9"]);
  assertEquals(p.alertas[0].skus.map((s) => s.sku), ["B"]);
});

Deno.test("vendoresConBorrador: solo proveedores con líneas propuestas y algún borrador", () => {
  const filas = [f({ sku: "B" }), f({ sku: "D", zoho_vendor_id: "v3" })];
  const v = vendoresConBorrador(proponer(filas, true), [oc({ sku: "A" }), oc({ vendor_id: "v2", sku: "Z" }), oc({ vendor_id: "v3", sku: "Q", status: "open" })]);
  assertEquals([...v], ["v1"]);
});
```

- [ ] **Step 2: correr y ver que fallan**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/zoho-generar-oc/consolidar_test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: implementación**

En `generar.ts`, tipo `Linea`:

```ts
export type Linea = {
  sku: string; nombre: string; item_id: string; cantidad: number; costo: number; disponible: number; enCamino: number;
  minimo: number; maximo: number; venta_diaria: number; kits: number;
  adelanto_cierre?: boolean; cierre_tarde?: boolean; adelanto_minimo?: boolean;
  /** Consolidación de borradores: cantidad que tenía el borrador viejo y de dónde sale la línea. */
  antes?: number; origen?: "nuevo" | "recalculado" | "borrador";
};
```

(`item_id` queda `string`; las líneas `borrador` usan `""` cuando no hay id — Task 5 lo valida antes de escribir en Zoho.)

`consolidar.ts`:

```ts
import { SKU_MARCADOR } from "../zoho-sync/sync.ts";
import { esBorrador, type Fila, type OcProveedor, sinBorradores } from "../_shared/posicion.ts";
import type { Linea, Propuesta } from "./generar.ts";

export type Grupo = Propuesta["porProveedor"][number];
export type Consolidada = {
  vendor_id: string; vendor_name: string;
  borradores: { zoho_po_id: string; po_number: string }[];
  monto_antes: number;
  quitados: { sku: string; nombre: string; antes: number }[];
};
export type Alerta = {
  vendor_id: string; vendor_name: string;
  emitidas: { zoho_po_id: string; po_number: string; fecha_oc: string | null }[];
  skus: { sku: string; nombre: string; cantidad: number }[];
};
export type PlanConsolidar = { porProveedor: Grupo[]; consolidadas: Consolidada[]; alertas: Alerta[] };

const r2 = (x: number) => Math.round(x * 100) / 100;

/** Proveedores con algo nuevo que pedir hoy y al menos un borrador abierto. */
export function vendoresConBorrador(prop: Propuesta, ocs: OcProveedor[]): Set<string> {
  const conLineas = new Set(prop.porProveedor.filter((g) => g.lineas.length).map((g) => g.vendor_id));
  const out = new Set<string>();
  for (const o of ocs) if (esBorrador(o.status) && conLineas.has(o.vendor_id)) out.add(o.vendor_id);
  return out;
}

export function planConsolidar(a: {
  filas: Fila[]; ocs: OcProveedor[]; prop: Propuesta; proponerCon: (filas: Fila[]) => Propuesta;
}): PlanConsolidar {
  const vendores = vendoresConBorrador(a.prop, a.ocs);
  const borradores = a.ocs.filter((o) => esBorrador(o.status) && vendores.has(o.vendor_id));
  const filaDe = new Map(a.filas.map((x) => [x.sku, x]));
  const manejado = (o: OcProveedor) => o.sku !== SKU_MARCADOR && filaDe.get(o.sku)?.zoho_vendor_id === o.vendor_id;
  const prop2 = vendores.size ? a.proponerCon(sinBorradores(a.filas, borradores)) : a.prop;
  const grupo2 = new Map(prop2.porProveedor.map((g) => [g.vendor_id, g]));

  const consolidadas: Consolidada[] = [];
  const porProveedor: Grupo[] = [];
  for (const g of a.prop.porProveedor) {
    if (!vendores.has(g.vendor_id)) { porProveedor.push(g); continue; }
    const suyos = borradores.filter((o) => o.vendor_id === g.vendor_id);
    const nuevos = new Set(g.lineas.map((l) => l.sku));
    const antes = new Map<string, number>();
    for (const o of suyos) antes.set(o.sku, (antes.get(o.sku) ?? 0) + o.cantidad);
    const base = grupo2.get(g.vendor_id) ?? g;
    const lineas: Linea[] = base.lineas
      .filter((l) => nuevos.has(l.sku) || antes.has(l.sku))
      .map((l) => nuevos.has(l.sku) ? { ...l, origen: "nuevo" as const } : { ...l, origen: "recalculado" as const, antes: antes.get(l.sku)! });
    const vistos = new Set(lineas.map((l) => l.sku));
    const quitados: Consolidada["quitados"] = [];
    const sueltos = new Map<string, OcProveedor[]>();
    for (const o of suyos) {
      if (manejado(o)) {
        if (!vistos.has(o.sku) && !quitados.some((q) => q.sku === o.sku)) {
          quitados.push({ sku: o.sku, nombre: filaDe.get(o.sku)!.nombre, antes: antes.get(o.sku)! });
        }
        continue;
      }
      sueltos.set(o.sku, [...(sueltos.get(o.sku) ?? []), o]);
    }
    for (const [sku, ls] of sueltos) {
      const cantidad = ls.reduce((s, o) => s + o.cantidad, 0);
      lineas.push({
        sku, nombre: filaDe.get(sku)?.nombre ?? sku, item_id: ls.find((o) => o.item_id)?.item_id ?? "", cantidad,
        costo: ls[0].precio ?? 0, disponible: 0, enCamino: 0, minimo: 0, maximo: 0, venta_diaria: 0, kits: 0,
        origen: "borrador", antes: cantidad,
      });
    }
    lineas.sort((x, y) => x.sku.localeCompare(y.sku));
    const monto = r2(lineas.reduce((s, l) => s + l.cantidad * l.costo, 0));
    porProveedor.push({ ...base, vendor_name: base.vendor_name || g.vendor_name, lineas, monto });
    const unicos = new Map(suyos.map((o) => [o.zoho_po_id, o.po_number]));
    consolidadas.push({
      vendor_id: g.vendor_id, vendor_name: g.vendor_name,
      borradores: [...unicos].map(([zoho_po_id, po_number]) => ({ zoho_po_id, po_number })).sort((x, y) => x.po_number.localeCompare(y.po_number)),
      monto_antes: r2(suyos.reduce((s, o) => s + o.cantidad * (o.precio ?? 0), 0)),
      quitados: quitados.sort((x, y) => x.sku.localeCompare(y.sku)),
    });
  }
  porProveedor.sort((x, y) => x.vendor_id.localeCompare(y.vendor_id));

  const alertas: Alerta[] = [];
  for (const g of porProveedor) {
    const emitidas = new Map<string, OcProveedor>();
    for (const o of a.ocs) if (o.vendor_id === g.vendor_id && !esBorrador(o.status)) emitidas.set(o.zoho_po_id, o);
    if (!emitidas.size) continue;
    const pedidas = g.lineas.filter((l) => l.origen === undefined || l.origen === "nuevo");
    if (!pedidas.length) continue;
    alertas.push({
      vendor_id: g.vendor_id, vendor_name: g.vendor_name,
      emitidas: [...emitidas.values()].map((o) => ({ zoho_po_id: o.zoho_po_id, po_number: o.po_number, fecha_oc: o.fecha_oc })),
      skus: pedidas.map((l) => ({ sku: l.sku, nombre: l.nombre, cantidad: l.cantidad })),
    });
  }
  return { porProveedor, consolidadas, alertas };
}
```

- [ ] **Step 4: correr y ver que pasan; suite**

Run: el comando del Step 2, luego `npm run test:funciones`
Expected: PASS. Si una prueba de Step 1 contradice la spec, se corrige la prueba solo con un `Ruling:` en el ledger.

- [ ] **Step 5: commit**

```bash
git add supabase/functions/zoho-generar-oc/consolidar.ts supabase/functions/zoho-generar-oc/consolidar_test.ts supabase/functions/zoho-generar-oc/generar.ts
git commit -m "feat(comercializadora): plan para consolidar borradores y alertar OCs emitidas"
```

---

### Task 4: correo de consolidaciones y alertas

**Files:**
- Create: `supabase/functions/zoho-generar-oc/correoConsolidar.ts`
- Test: `supabase/functions/zoho-generar-oc/correoConsolidar_test.ts`

**Interfaces:**
- Produces:

```ts
export type ResultadoConsolidada = {
  vendor_name: string; nueva: string | null; // po_number de la OC nueva (null en simulación o si falló)
  borradores: { po_number: string; cancelada: boolean; error?: string }[];
  lineas: { sku: string; nombre: string; antes: number | null; ahora: number; origen: "nuevo" | "recalculado" | "borrador" }[];
  quitados: { sku: string; nombre: string; antes: number }[];
  monto_antes: number; monto: number; error?: string;
};
export function asuntoConsolidar(fecha: string, modo: "simulacion" | "real"): string;
export function correoConsolidarHtml(a: { fecha: string; modo: "simulacion" | "real"; consolidadas: ResultadoConsolidada[]; alertas: Alerta[] }): string;
```

- [ ] **Step 1: pruebas que fallan**

```ts
import { assertEquals, assertStringIncludes } from "@std/assert";
import { asuntoConsolidar, correoConsolidarHtml } from "./correoConsolidar.ts";

const base = {
  vendor_name: "ODISA <b>", nueva: "COM-OC-20", borradores: [{ po_number: "COM-OC-1", cancelada: true }],
  lineas: [{ sku: "A", nombre: "Vaso", antes: 100, ahora: 640, origen: "recalculado" as const }, { sku: "B", nombre: "Tapa", antes: null, ahora: 50, origen: "nuevo" as const }],
  quitados: [{ sku: "C", nombre: "Popote", antes: 10 }], monto_antes: 1000, monto: 6900,
};

Deno.test("asunto con y sin simulación", () => {
  assertEquals(asuntoConsolidar("2026-11-26", "real"), "OC automática 2026-11-26: consolidaciones y alertas");
  assertEquals(asuntoConsolidar("2026-11-26", "simulacion"), "OC automática 2026-11-26: consolidaciones y alertas (simulación)");
});

Deno.test("consolidada: viejas → nueva, antes → ahora, quitados, totales y escape", () => {
  const h = correoConsolidarHtml({ fecha: "2026-11-26", modo: "real", consolidadas: [base], alertas: [] });
  assertStringIncludes(h, "ODISA &lt;b&gt;");
  assertStringIncludes(h, "COM-OC-1");
  assertStringIncludes(h, "COM-OC-20");
  assertStringIncludes(h, "100 → 640");
  assertStringIncludes(h, "nuevo");
  assertStringIncludes(h, "quitado: ya no hace falta");
  assertStringIncludes(h, "$1,000.00");
  assertStringIncludes(h, "$6,900.00");
});

Deno.test("cancelación fallida pide cancelar a mano", () => {
  const h = correoConsolidarHtml({ fecha: "2026-11-26", modo: "real", alertas: [],
    consolidadas: [{ ...base, borradores: [{ po_number: "COM-OC-1", cancelada: false, error: "Zoho 400" }] }] });
  assertStringIncludes(h, "cancelar a mano COM-OC-1");
});

Deno.test("alerta: OC emitida y lo pedido aparte", () => {
  const h = correoConsolidarHtml({ fecha: "2026-11-26", modo: "simulacion", consolidadas: [],
    alertas: [{ vendor_id: "v1", vendor_name: "MAHA", emitidas: [{ zoho_po_id: "p", po_number: "COM-OC-9", fecha_oc: "2026-11-16" }],
      skus: [{ sku: "B", nombre: "Tapa", cantidad: 50 }] }] });
  assertStringIncludes(h, "SIMULACIÓN");
  assertStringIncludes(h, "ya tiene la OC emitida COM-OC-9 del 2026-11-16");
  assertStringIncludes(h, "B Tapa (50)");
});
```

- [ ] **Step 2: correr y ver que fallan**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/zoho-generar-oc/correoConsolidar_test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: implementación**

```ts
import type { Alerta } from "./consolidar.ts";

export type ResultadoConsolidada = {
  vendor_name: string; nueva: string | null;
  borradores: { po_number: string; cancelada: boolean; error?: string }[];
  lineas: { sku: string; nombre: string; antes: number | null; ahora: number; origen: "nuevo" | "recalculado" | "borrador" }[];
  quitados: { sku: string; nombre: string; antes: number }[];
  monto_antes: number; monto: number; error?: string;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const pesos = (x: number) => "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function asuntoConsolidar(fecha: string, modo: "simulacion" | "real"): string {
  return `OC automática ${fecha}: consolidaciones y alertas${modo === "simulacion" ? " (simulación)" : ""}`;
}

export function correoConsolidarHtml(a: { fecha: string; modo: "simulacion" | "real"; consolidadas: ResultadoConsolidada[]; alertas: Alerta[] }): string {
  const cons = a.consolidadas.map((c) => {
    const viejas = c.borradores.map((b) => esc(b.po_number)).join(", ");
    const manos = c.borradores.filter((b) => !b.cancelada).map((b) => `<li><b>cancelar a mano ${esc(b.po_number)}</b>${b.error ? ` (${esc(b.error)})` : ""}</li>`).join("");
    const filas = c.lineas.map((l) =>
      `<tr><td>${esc(l.sku)} ${esc(l.nombre)}</td><td>${l.antes == null ? "—" : l.antes} → ${l.ahora}</td><td>${l.origen === "nuevo" ? "nuevo" : l.origen === "recalculado" ? (l.antes === l.ahora ? "sin cambio" : "recalculado") : "del borrador"}</td></tr>`)
      .concat(c.quitados.map((q) => `<tr><td>${esc(q.sku)} ${esc(q.nombre)}</td><td>${q.antes} → 0</td><td>quitado: ya no hace falta</td></tr>`)).join("");
    return `<h3>${esc(c.vendor_name)}</h3>
<p>${viejas} → ${c.nueva ? esc(c.nueva) : a.modo === "simulacion" ? "(simulación)" : "<b>no se creó</b>"} · total ${pesos(c.monto_antes)} → ${pesos(c.monto)}</p>
${c.error ? `<p><b>Error:</b> ${esc(c.error)}. No se canceló nada.</p>` : ""}
${manos ? `<ul>${manos}</ul>` : ""}
<table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>SKU</th><th>Antes → ahora</th><th>Motivo</th></tr>${filas}</table>`;
  }).join("");
  const alertas = a.alertas.map((x) => {
    const emi = x.emitidas.map((e) => `${esc(e.po_number)}${e.fecha_oc ? ` del ${esc(e.fecha_oc)}` : ""}`).join(", ");
    const skus = x.skus.map((s) => `<li>${esc(s.sku)} ${esc(s.nombre)} (${s.cantidad})</li>`).join("");
    return `<p><b>${esc(x.vendor_name)}</b> ya tiene la OC emitida ${emi}; se pidió aparte:</p><ul>${skus}</ul>`;
  }).join("");
  return `<div style="font-family:sans-serif;font-size:14px">
<h2>${esc(asuntoConsolidar(a.fecha, a.modo))}</h2>
${a.modo === "simulacion" ? "<p><b>SIMULACIÓN — no se creó ni canceló nada en Zoho</b></p>" : ""}
${cons ? `<h2>Consolidadas (se cancelaron los borradores viejos)</h2>${cons}` : ""}
${alertas ? `<h2>Alertas: proveedor con OC emitida</h2>${alertas}` : ""}
</div>`;
}
```

- [ ] **Step 4: correr y ver que pasan; suite**

Run: el comando del Step 2, luego `npm run test:funciones`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add supabase/functions/zoho-generar-oc/correoConsolidar.ts supabase/functions/zoho-generar-oc/correoConsolidar_test.ts
git commit -m "feat(comercializadora): correo de consolidaciones y alertas de OC"
```

---

### Task 5: `generar` consolida (bandera, verificación en vivo, Zoho, registro, correo)

**Files:**
- Modify: `supabase/functions/zoho-generar-oc/generar.ts`
- Test: `supabase/functions/zoho-generar-oc/generar_test.ts`

**Interfaces:**
- Consumes: `cfg.auto.consolidar`, `ZohoClient.get/post/del` (Task 1); `cargarOcsProveedor`, `esBorrador` (Task 2); `planConsolidar`, `vendoresConBorrador`, tipos (Task 3); `correoConsolidarHtml`, `asuntoConsolidar`, `ResultadoConsolidada` (Task 4).
- Produces: `generar(...)` devuelve además `consolidadas: number` y `alertas: number` (0 con la bandera apagada). Exporta `verificarBorradores(z, ocs, vendores): Promise<{ ocs: OcProveedor[]; avisos: string[] }>` y `cancelarBorrador(z, zoho_po_id): Promise<void>`.

Flujo nuevo en `generar`, justo después de `const prop = proponer(...)` y del ajuste de `g.minimo`:

```ts
  let plan: PlanConsolidar | null = null;
  const avisosVivo: string[] = [];
  if (cfg.auto.consolidar) {
    let ocs = await cargarOcsProveedor(db);
    const candidatos = vendoresConBorrador(prop, ocs);
    if (modo === "real" && candidatos.size) {
      if (!crearZoho) throw new Error("modo real sin cliente de Zoho");
      const v = await verificarBorradores(zCons ??= crearZoho(), ocs, candidatos);
      ocs = v.ocs; avisosVivo.push(...v.avisos);
    }
    // Las OCs abiertas de cualquier proveedor sirven para las alertas aunque no haya borradores.
    plan = planConsolidar({ filas, ocs, prop, proponerCon: (x) => proponer(x, cfg.inv.yulius, ajuste, ajusteMin) });
    for (const g of plan.porProveedor) { const m = minimoDe.get(g.vendor_id); if (m) g.minimo = m; }
  }
  const grupos = plan?.porProveedor ?? prop.porProveedor;
```

y el bucle de creación recorre `grupos` en lugar de `prop.porProveedor`. Reutilizar un solo cliente: declarar `let zCons: ZohoClient | null = null;` antes y en la creación usar `const z = modo === "real" ? (zCons ??= crearZoho!()) : null;`.

`verificarBorradores`:

```ts
/** GET en vivo de cada borrador de los proveedores a consolidar: toma estado, cantidades, precios e item_id de Zoho. */
export async function verificarBorradores(z: ZohoClient, ocs: OcProveedor[], vendores: Set<string>): Promise<{ ocs: OcProveedor[]; avisos: string[] }> {
  const ids = [...new Set(ocs.filter((o) => esBorrador(o.status) && vendores.has(o.vendor_id)).map((o) => o.zoho_po_id))];
  const avisos: string[] = [];
  let out = ocs;
  for (const id of ids) {
    const viejas = out.filter((o) => o.zoho_po_id === id);
    const po0 = viejas[0];
    let po: { status: string; purchaseorder_number: string; line_items: { item_id: string; sku?: string; quantity: number; quantity_received?: number; rate: number }[] } | null = null;
    try {
      po = (await z.get<{ purchaseorder: typeof po }>(`/purchaseorders/${id}`)).purchaseorder;
    } catch (e) {
      if ((e as ZohoError).status === 404) { out = out.filter((o) => o.zoho_po_id !== id); avisos.push(`${po0.po_number}: ya no existe en Zoho`); continue; }
      throw e;
    }
    const status = String(po!.status ?? "").toLowerCase();
    if (!ocAbierta(status)) { out = out.filter((o) => o.zoho_po_id !== id); avisos.push(`${po0.po_number}: ya está ${status} en Zoho`); continue; }
    const vivas: OcProveedor[] = po!.line_items.map((l) => ({
      ...po0, status, sku: String(l.sku ?? ""), item_id: l.item_id, cantidad: Number(l.quantity),
      pendiente: Number(l.quantity) - Number(l.quantity_received ?? 0), precio: Number(l.rate),
    }));
    if (status !== "draft") avisos.push(`${po0.po_number}: ya no es borrador (${status}); no se reemplaza`);
    out = [...out.filter((o) => o.zoho_po_id !== id), ...vivas];
  }
  return { ocs: out, avisos };
}

/** Cancela un borrador; si Zoho no permite cancelar (4xx), lo borra: nunca se envió al proveedor. */
export async function cancelarBorrador(z: ZohoClient, id: string): Promise<void> {
  try {
    await z.post(`/purchaseorders/${id}/status/cancelled`, {});
  } catch (e) {
    const s = (e as ZohoError).status;
    if (!(s >= 400 && s < 500)) throw e;
    await z.del(`/purchaseorders/${id}`);
  }
}
```

Importar `ocAbierta` de `../zoho-sync/sync.ts` y `ZohoError` como valor (no solo tipo) de `../_shared/zoho.ts`.

Dentro del bucle por grupo (modo Real), si `plan` consolidó a ese proveedor (`const c = plan?.consolidadas.find((x) => x.vendor_id === g.vendor_id)`):
1. Si alguna línea tiene `item_id === ""` → no crear: `errores.push(\`${g.vendor_name}: línea sin artículo de Zoho; no se consolidó\`)`, insertar `estado: "error"` y seguir (no se cancela nada).
2. Crear como hoy con `cuerpoOc(g, fecha, locationId, c?.borradores.map((b) => b.po_number))` — `cuerpoOc` gana un 4º parámetro opcional `reemplaza?: string[]` que agrega `Reemplaza a COM-OC-1, COM-OC-2` como primera línea de `notes`.
3. Si crear falla → como hoy (error), **no** cancelar.
4. Si se creó → por cada borrador `cancelarBorrador`; registrar `{ zoho_po_id, po_number, cancelada: true }` o `{ …, cancelada: false, error: mensaje }`.
5. El insert a `com_oc_auto` agrega `reemplaza` (solo si `c`) y `alerta_emitidas` (solo si hay alerta para ese proveedor, con `emitidas`).

En simulación: `reemplaza` con `cancelada: false` y sin llamadas a Zoho; `alerta_emitidas` igual.

Correo: después del correo actual, si `plan && (plan.consolidadas.length || plan.alertas.length)`:

```ts
    const res: ResultadoConsolidada[] = plan.consolidadas.map((c) => { /* armar desde el grupo final, la OC creada y el resultado de cancelar */ });
    const ok2 = await enviarCorreo(cfg.auto.correos, asuntoConsolidar(fecha, modo), correoConsolidarHtml({ fecha, modo, consolidadas: res, alertas: plan.alertas }));
    if (!ok2) errores.push("no se pudo enviar el correo de consolidaciones");
```

Para `res`: `lineas` = las del grupo con `antes ?? null`, `ahora = cantidad`, `origen ?? "nuevo"`; `nueva` = `po_number` creado o `null`; `error` = el mensaje si la creación falló. `avisosVivo` se agregan a `errores` (salen en el correo normal).

Devolver `consolidadas: plan?.consolidadas.length ?? 0, alertas: plan?.alertas.length ?? 0`.

- [ ] **Step 1: pruebas que fallan** (agregar a `generar_test.ts`)

Extender `dbModelo`: `com_plan_config` acepta `consolidar?: boolean` en `Datos` y lo pone en `config.auto`; `com_zoho_oc_lineas` devuelve filas con `zoho_po_id, po_number, vendor_id, vendor_name, precio, fecha_oc` cuando se dan (las pruebas existentes siguen dando solo `sku,status,cantidad,cantidad_recibida`). Agregar `correosEnviados` capturando `enviarCorreo`: como `enviarCorreo` usa `fetch` vía `_shared/correo.ts`, seguir el patrón de la prueba existente "generar reporta 'no se pudo enviar el correo'…" (línea ~311) para interceptarlo, o inyectar `CORREO_URL` vacío y verificar solo inserts/llamadas a Zoho.

Stub de Zoho con registro de llamadas:

```ts
function zohoGrabador(o: { pos?: Record<string, unknown>; fallaCrear?: boolean; fallaCancelar?: number } = {}) {
  const llamadas: string[] = [];
  const z = {
    get: (p: string) => {
      llamadas.push("GET " + p);
      const id = p.split("/").pop()!;
      const po = o.pos?.[id];
      return po ? Promise.resolve({ purchaseorder: po }) : Promise.reject(new ZohoError("no existe", 404));
    },
    post: (p: string, body: Record<string, unknown>) => {
      llamadas.push("POST " + p);
      if (p === "/purchaseorders") {
        if (o.fallaCrear) return Promise.reject(new ZohoError("Zoho 500", 500));
        return Promise.resolve({ purchaseorder: { purchaseorder_id: "nueva-" + body.vendor_id, purchaseorder_number: "COM-OC-NUEVA" } });
      }
      if (o.fallaCancelar) return Promise.reject(new ZohoError("no se puede", o.fallaCancelar));
      return Promise.resolve({});
    },
    del: (p: string) => { llamadas.push("DELETE " + p); return Promise.resolve({}); },
  } as unknown as ZohoClient;
  return { z, llamadas };
}
const borradorA = { zoho_po_id: "po1", po_number: "COM-OC-1", status: "draft", vendor_id: "v1", vendor_name: "P-v1", sku: "A",
  cantidad: 100, cantidad_recibida: 0, precio: 10, fecha_oc: "2026-10-28" };
const vivoA = { status: "draft", purchaseorder_number: "COM-OC-1", line_items: [{ item_id: "item-A", sku: "A", quantity: 100, rate: 10 }] };
// A (v1) en borrador; C (v1) nuevo; B (v2) nuevo.
const conBorrador = (): Pick<Datos, "minmax" | "catalogo"> =>
  ({ minmax: [mm("A"), mm("B"), mm("C")], catalogo: [cat("A", "v1"), cat("B", "v2"), cat("C", "v1")] });
```

Pruebas:

```ts
Deno.test("consolidar apagado: igual que hoy, sin GET a Zoho ni columnas nuevas", async () => {
  const { db, inserts } = dbModelo({ modo: "real", ...conBorrador(), ocLineas: [borradorA] });
  const { z, llamadas } = zohoGrabador({ pos: { po1: vivoA } });
  const r = await generar(db, () => z, { origen: "manual", ahora, recalcular: sinRecalcular });
  assertEquals(llamadas, ["POST /purchaseorders", "POST /purchaseorders"]);
  assertEquals(inserts.every((i) => !("reemplaza" in i) && !("alerta_emitidas" in i)), true);
  assertEquals([r.consolidadas, r.alertas], [0, 0]);
});

Deno.test("consolidar real: verifica, crea una OC con A recalculado y C, y cancela el borrador", async () => {
  const { db, inserts } = dbModelo({ modo: "real", consolidar: true, ...conBorrador(), ocLineas: [borradorA] });
  const { z, llamadas } = zohoGrabador({ pos: { po1: vivoA } });
  const r = await generar(db, () => z, { origen: "manual", ahora, recalcular: sinRecalcular });
  assertEquals(llamadas, ["GET /purchaseorders/po1", "POST /purchaseorders", "POST /purchaseorders/po1/status/cancelled", "POST /purchaseorders"]);
  const v1 = inserts.find((i) => i.vendor_id === "v1")!;
  assertEquals((v1.lineas as { sku: string; cantidad: number; origen: string }[]).map((l) => [l.sku, l.cantidad, l.origen]), [["A", 640, "recalculado"], ["C", 640, "nuevo"]]);
  assertEquals(v1.reemplaza, [{ zoho_po_id: "po1", po_number: "COM-OC-1", cancelada: true }]);
  assertEquals(r.consolidadas, 1);
});

Deno.test("consolidar real: si Zoho no deja cancelar (4xx) se borra el borrador", async () => {
  const { db } = dbModelo({ modo: "real", consolidar: true, ...conBorrador(), ocLineas: [borradorA] });
  const { z, llamadas } = zohoGrabador({ pos: { po1: vivoA }, fallaCancelar: 400 });
  await generar(db, () => z, { origen: "manual", ahora, recalcular: sinRecalcular });
  assertEquals(llamadas.includes("DELETE /purchaseorders/po1"), true);
});

Deno.test("consolidar real: si cancelar falla con 5xx queda 'cancelar a mano' y la OC nueva registrada", async () => {
  const { db, inserts } = dbModelo({ modo: "real", consolidar: true, ...conBorrador(), ocLineas: [borradorA] });
  const { z, llamadas } = zohoGrabador({ pos: { po1: vivoA }, fallaCancelar: 500 });
  await generar(db, () => z, { origen: "manual", ahora, recalcular: sinRecalcular });
  assertEquals(llamadas.includes("DELETE /purchaseorders/po1"), false);
  const v1 = inserts.find((i) => i.vendor_id === "v1")!;
  assertEquals(v1.estado, "creada");
  assertEquals((v1.reemplaza as { cancelada: boolean }[])[0].cancelada, false);
});

Deno.test("consolidar real: si crear falla no se cancela nada", async () => {
  const { db, inserts } = dbModelo({ modo: "real", consolidar: true, ...conBorrador(), ocLineas: [borradorA] });
  const { z, llamadas } = zohoGrabador({ pos: { po1: vivoA }, fallaCrear: true });
  await generar(db, () => z, { origen: "manual", ahora, recalcular: sinRecalcular });
  assertEquals(llamadas.some((l) => l.includes("cancelled") || l.startsWith("DELETE")), false);
  assertEquals(inserts.find((i) => i.vendor_id === "v1")!.estado, "error");
});

Deno.test("consolidar real: borrador que en vivo ya está open → no se reemplaza y hay alerta", async () => {
  const { db, inserts } = dbModelo({ modo: "real", consolidar: true, ...conBorrador(), ocLineas: [borradorA] });
  const { z, llamadas } = zohoGrabador({ pos: { po1: { ...vivoA, status: "open" } } });
  const r = await generar(db, () => z, { origen: "manual", ahora, recalcular: sinRecalcular });
  assertEquals(llamadas.some((l) => l.includes("cancelled")), false);
  const v1 = inserts.find((i) => i.vendor_id === "v1")!;
  assertEquals((v1.lineas as { sku: string }[]).map((l) => l.sku), ["C"]);
  assertEquals((v1.alerta_emitidas as { po_number: string }[])[0].po_number, "COM-OC-1");
  assertEquals(r.alertas, 1);
});

Deno.test("consolidar real: borrador borrado en Zoho (404) se ignora", async () => {
  const { db, inserts } = dbModelo({ modo: "real", consolidar: true, ...conBorrador(), ocLineas: [borradorA] });
  const { z } = zohoGrabador({ pos: {} });
  await generar(db, () => z, { origen: "manual", ahora, recalcular: sinRecalcular });
  const v1 = inserts.find((i) => i.vendor_id === "v1")!;
  // A sigue bloqueado por com_zoho_oc_lineas hasta el siguiente sync; se pide en la próxima corrida.
  assertEquals((v1.lineas as { sku: string }[]).map((l) => l.sku), ["C"]);
  assertEquals("reemplaza" in v1, false);
});

Deno.test("consolidar real: línea de borrador sin item_id no crea ni cancela", async () => {
  const sinItem = { ...borradorA, sku: "ENV" };
  const { db, inserts } = dbModelo({ modo: "real", consolidar: true, ...conBorrador(), ocLineas: [sinItem] });
  const { z, llamadas } = zohoGrabador({ pos: { po1: { ...vivoA, line_items: [{ item_id: "", sku: "ENV", quantity: 1, rate: 250 }] } } });
  const r = await generar(db, () => z, { origen: "manual", ahora, recalcular: sinRecalcular });
  assertEquals(llamadas.some((l) => l.includes("cancelled")), false);
  assertEquals(inserts.find((i) => i.vendor_id === "v1")!.estado, "error");
  assertStringIncludes(r.errores.join(" "), "línea sin artículo de Zoho");
});

Deno.test("consolidar en simulación: no llama a Zoho y guarda reemplaza con cancelada=false", async () => {
  const { db, inserts } = dbModelo({ modo: "simulacion", consolidar: true, ...conBorrador(), ocLineas: [borradorA] });
  await generar(db, () => { throw new Error("no debe crear Zoho"); }, { origen: "manual", ahora, recalcular: sinRecalcular });
  const v1 = inserts.find((i) => i.vendor_id === "v1")!;
  assertEquals(v1.estado, "simulada");
  assertEquals(v1.reemplaza, [{ zoho_po_id: "po1", po_number: "COM-OC-1", cancelada: false }]);
});
```

Y en `cuerpoOc`:

```ts
Deno.test("cuerpoOc con reemplazo lo dice en las notas", () => {
  const p = proponer([f({ sku: "A" })], true).porProveedor[0];
  assertStringIncludes(String(cuerpoOc(p, "2026-10-30", null, ["COM-OC-1", "COM-OC-2"]).notes), "Reemplaza a COM-OC-1, COM-OC-2");
});
```

- [ ] **Step 2: correr y ver que fallan**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/zoho-generar-oc/generar_test.ts`
Expected: FAIL en las pruebas nuevas; las existentes siguen pasando.

- [ ] **Step 3: implementación** — lo descrito arriba en "Flujo nuevo", `verificarBorradores`, `cancelarBorrador`, el 4º parámetro de `cuerpoOc`:

```ts
export function cuerpoOc(p: Propuesta["porProveedor"][number], fecha: string, locationId: string | null, reemplaza?: string[]): Record<string, unknown> {
  // … igual que hoy …
  const cabeza = reemplaza?.length ? `Reemplaza a ${reemplaza.join(", ")}\n` : "";
  // notes: `${cabeza}OC generada automáticamente por thecoffeemexico.com (borrador).\n${notas}`.slice(0, 5000)
```

- [ ] **Step 4: correr y ver que pasan; suite completa de funciones**

Run: el comando del Step 2, luego `npm run test:funciones`
Expected: PASS, sin fallas nuevas.

- [ ] **Step 5: commit**

```bash
git add supabase/functions/zoho-generar-oc/generar.ts supabase/functions/zoho-generar-oc/generar_test.ts
git commit -m "feat(comercializadora): la OC automática consolida borradores y alerta OCs emitidas (bandera auto.consolidar)"
```

---

### Task 6: migración del portal, prueba y guía

**Files:**
- Create: `supabase/migrations/<siguiente número libre>_comercializadora_oc_consolidar.sql` (el 2026-11-20 el último era `20261120000076`; usar el siguiente libre al momento, p. ej. `20261120000077`)
- Create: `tests/db/comercializadora-oc-consolidar.test.ts`
- Modify: `docs/migracion/comercializadora.md` (sección nueva al final)

- [ ] **Step 1: prueba que falla**

```ts
// Spec 2026-11-20: OC automática consolida borradores y alerta OCs emitidas.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20261120000077_comercializadora_oc_consolidar.sql', 'utf8');

describe('migración: columnas de consolidación en com_oc_auto', () => {
  it('agrega reemplaza y alerta_emitidas como jsonb opcionales', () => {
    expect(sql).toMatch(/alter table public\.com_oc_auto\s+add column if not exists reemplaza jsonb/i);
    expect(sql).toMatch(/add column if not exists alerta_emitidas jsonb/i);
  });
  it('no prende la bandera auto.consolidar', () => {
    expect(sql).not.toMatch(/\{auto,consolidar\}/);
    expect(sql).not.toMatch(/jsonb_set\(config/);
  });
});
```

(Ajustar el nombre del archivo al número usado.)

- [ ] **Step 2: correr y ver que falla**

Run: `npx vitest run tests/db/comercializadora-oc-consolidar.test.ts`
Expected: FAIL (archivo inexistente).

- [ ] **Step 3: migración**

```sql
-- Spec 2026-11-20 (OC automática: consolidar borradores y alertar OCs emitidas).
-- reemplaza: borradores que la OC nueva sustituyó [{zoho_po_id, po_number, cancelada, error?}].
-- alerta_emitidas: OCs ya emitidas del proveedor al pedir aparte [{zoho_po_id, po_number, fecha_oc}].
-- La función solo las escribe con la bandera config.auto.consolidar = true, que esta migración NO prende.
alter table public.com_oc_auto
  add column if not exists reemplaza jsonb,
  add column if not exists alerta_emitidas jsonb;
```

Guía (`docs/migracion/comercializadora.md`), sección nueva: qué hace, bandera `auto.consolidar` (apagada; cómo prenderla con `jsonb_set(config, '{auto,consolidar}', 'true'::jsonb)` + `version + 1` y su historial), que en la ventana de paridad debe valer igual en los dos sitios, y que en el viejo hace falta su SQL antes de prenderla.

- [ ] **Step 4: correr y ver que pasa; suites**

Run: `npx vitest run tests/db/comercializadora-oc-consolidar.test.ts tests/db/guardia-lectura.test.ts` y `npm run test:funciones`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add supabase/migrations/*_comercializadora_oc_consolidar.sql tests/db/comercializadora-oc-consolidar.test.ts docs/migracion/comercializadora.md
git commit -m "feat(comercializadora): columnas de consolidación en com_oc_auto y guía"
```

---

### Task 7: copia al sitio viejo

**Files (repo viejo, worktree nuevo `C:\Users\sebcm\Projects\thecoffee-comercializadora-consolidar`, rama `feat/oc-consolidar` desde `origin/main`):**
- Modify: `supabase/functions/_shared/db.ts`, `_shared/posicion.ts`, `zoho-generar-oc/generar.ts` — copiar **byte a byte** del portal (eran idénticos antes de este plan).
- Modify: `supabase/functions/_shared/zoho.ts` — solo agregar `del` (sin `soloLectura`).
- Create: `zoho-generar-oc/consolidar.ts`, `zoho-generar-oc/correoConsolidar.ts` y sus `_test.ts` (copias); copiar también las pruebas nuevas de `generar_test.ts`, `posicion_test.ts`, `db_test.ts` y la de `del` sin la de solo lectura.
- Create: `supabase/migrations/20261120000001_oc_consolidar.sql` — el mismo `alter table` con encabezado "Se corre a mano en el SQL Editor de este proyecto".

- [ ] **Step 1:** crear el worktree y la rama:

```bash
git -C /c/Users/sebcm/OneDrive/Documents/thecoffee-comercializadora fetch origin
git -C /c/Users/sebcm/OneDrive/Documents/thecoffee-comercializadora worktree add -b feat/oc-consolidar /c/Users/sebcm/Projects/thecoffee-comercializadora-consolidar origin/main
```

- [ ] **Step 2:** comprobar que los archivos compartidos del viejo siguen iguales al portal **antes** de este plan (`diff --strip-trailing-cr` contra `git show origin/main:<archivo>` del portal). Si difieren, parar y ledgerear un Ruling.
- [ ] **Step 3:** copiar los archivos y correr `deno task test` en la raíz del worktree.
Expected: PASS (las mismas pruebas nuevas que en el portal, menos la de `soloLectura`).
- [ ] **Step 4:** `diff --strip-trailing-cr` de cada archivo copiado contra el portal: 0 diferencias (salvo `zoho.ts`).
- [ ] **Step 5: commit** (en el worktree viejo)

```bash
git add supabase/functions supabase/migrations/20261120000001_oc_consolidar.sql
git commit -m "feat(oc): consolidar borradores y alertar OCs emitidas (bandera auto.consolidar, apagada)"
```

---

### Task 8: suite, build y PRs (última tarea de código)

- [ ] Portal: `npm run test:funciones`, `npm test`, `npm run build`, `npx prettier --check --end-of-line auto` sobre los archivos tocados. Expected: verde (fallas conocidas ajenas, como `tests/migracion/paridad.test.ts` por el Excel, se reportan por nombre).
- [ ] Viejo: `deno task test`.
- [ ] Revisión final de toda la rama (skill de ejecución) antes de abrir PRs.
- [ ] **[OK del usuario]** push y PR en los dos repos. El PR del portal aplica la migración al mergear (solo columnas, sin efecto). El del viejo **no** se publica solo: después del merge, con OK, se publican `com-minmax` y `zoho-generar-oc` juntos y el usuario corre `20261120000001_oc_consolidar.sql` en su SQL Editor **antes** de que la bandera pueda prenderse.
- [ ] Activación (fuera de este plan, con OK): en el T-0 del cutover, junto con `auto.modo = real` del portal, `auto.consolidar = true`. Durante la racha de paridad la bandera queda apagada en los dos.

## Self-review (hecho al escribir)

- Spec §3 casos 1–4 → Task 3 (pruebas 1–8) y Task 5. §4 → Task 2 + Task 3. §5 → Task 5 (`verificarBorradores`, `cancelarBorrador`, orden crear→cancelar, fallas). §6 → Task 5 (inserts) + Task 6/7 (columnas). §7 → Task 4 + Task 5 + Task 6 (bandera). §8 → Task 5 (fallas por proveedor; candado diario intacto). §9 → todas.
- Fuera del plan, a propósito: pantalla de OC automáticas mostrando `reemplaza` (spec §10).
- Nombres: `OcProveedor`, `esBorrador`, `sinBorradores`, `cargarOcsProveedor`, `planConsolidar`, `vendoresConBorrador`, `correoConsolidarHtml`, `asuntoConsolidar`, `verificarBorradores`, `cancelarBorrador` usados igual en todas las tareas.
