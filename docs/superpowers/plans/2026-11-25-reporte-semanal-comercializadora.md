# Reporte semanal de la Comercializadora — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una pantalla `/comercializadora/reporte-semanal` que genera en vivo desde Zoho Books el reporte semanal de ventas y supply chain para cualquier semana.

**Architecture:** Cálculo puro en `supabase/functions/_shared/reporte/` (probado en Deno y reutilizado por el portal para tipos y fechas). Una Edge Function de solo lectura `zoho-reporte-semanal` lee Zoho, calcula, guarda caché de 15 min y una foto semanal de saldos. El portal la invoca con `invocarFuncion` y pinta las secciones con las piezas existentes.

**Tech Stack:** Deno (Edge Functions, `@std/assert`), Supabase Postgres + RLS, Next.js (App Router, server components), Tailwind, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-25-reporte-semanal-comercializadora-design.md`

## Global Constraints

- Zoho solo lectura: la función usa `zohoDesdeEnv()` y únicamente `get`/`listAll`. Nunca `post`/`put`/`del`.
- Autenticación de la función: `autorizado(req)` con `x-com-secreto`; `verify_jwt = false` en `supabase/config.toml`.
- Caché: 15 minutos por semana; se ignora si `forzar` o si la configuración cambió después de `leido_en`.
- Semana = lunes a domingo; el parámetro `semana` es la fecha ISO de un lunes.
- Días hábiles = lunes a viernes, sin feriados.
- Nombres de cliente se comparan con `norm()` (sin acentos, mayúsculas, espacios colapsados).
- Sucursal propia = cliente cuyo `norm()` empieza con `SUCURSALES THE COFFEE`.
- Valores no reconocidos → «Sin clasificar», nunca se descartan.
- Archivos de `_shared/reporte/` que importa el portal (`tipos.ts`, `config.ts`, `fechas.ts`, `ventas.ts`, `surtido.ts`, `atencion.ts`, `saldos.ts`, `reporte.ts`) no usan APIs de Deno ni importan `../zoho.ts`.
- Antes de escribir la página, lee la guía de Next en `node_modules/next/dist/docs/` sobre páginas, `searchParams` y Server Actions (AGENTS.md: esta versión cambia APIs).
- Textos de UI en español de México. Formato de dinero con `pesos()` de `lib/comercializadora/formato.ts`.
- Pruebas Deno de un archivo: `deno test --config supabase/functions/deno.json --allow-env --allow-read <archivo>`; todas: `npm run test:funciones`.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Semana sin ventas o sin envíos** (p. ej. semana futura o festiva): los porcentajes no deben dar `NaN`/`Infinity`; se muestran como «—». → prueba en Task 2 (`calcularVentas` con lista vacía) y Task 3 (`calcularSurtido` sin OVs).
2. **OV con varios paquetes** (reenvío de faltantes): solo cuenta el primer envío; un paquete de reposición en la semana de una OV vieja no la mete al universo. → prueba en Task 3.
3. **Factura sin `due_date` o sin Sucursal**: no rompe saldos; sin vencimiento usa la fecha de la factura y la sucursal propia sale del nombre del cliente. → prueba en Task 5.
4. **Zoho falla en una sola lectura** (p. ej. notas de crédito): las demás secciones salen y esa sección muestra el error. → prueba en Task 6 (`calcularReporte` con una `Seccion` fallida).
5. **Semana inválida en la URL** (`?semana=hola` o un miércoles): la página usa la semana cerrada anterior; la función rechaza con error claro. → prueba en Task 1 (`esLunes`) y Task 7 (`validarSemana`).

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/functions/_shared/reporte/tipos.ts` | Tipos de datos leídos (`Factura`, `Paquete`, `Ov`, `NotaCredito`), `Seccion<T>` |
| `supabase/functions/_shared/reporte/config.ts` | `ConfigReporte`, valores por defecto, `normalizarConfigReporte`, `norm`, `en`, `esPropia`, `titulo` |
| `supabase/functions/_shared/reporte/fechas.ts` | `esLunes`, `lunesDe`, `finSemana`, `enRango`, `diasHabiles` |
| `supabase/functions/_shared/reporte/ventas.ts` | Sección 1 |
| `supabase/functions/_shared/reporte/surtido.ts` | Sección 2 (+ `primerEnvio`, `origenIncidencia`) |
| `supabase/functions/_shared/reporte/atencion.ts` | Secciones 3, 4 y 7 (atención, notas de crédito, aperturas) |
| `supabase/functions/_shared/reporte/saldos.ts` | Secciones 5 y 6 |
| `supabase/functions/_shared/reporte/reporte.ts` | `calcularReporte`: une todo, maneja secciones fallidas |
| `supabase/functions/_shared/reporte/zohoReporte.ts` | Mapeo JSON de Zoho → tipos y `leerZoho` (solo Edge) |
| `supabase/functions/zoho-reporte-semanal/index.ts` + `servicio.ts` | Edge Function: caché, foto, config |
| `supabase/migrations/20261125000097_comercializadora_reporte_semanal.sql` | Tablas de config, caché y foto |
| `lib/comercializadora/reporteSemanal.ts` | Invocación desde el portal |
| `app/(comercializadora)/comercializadora/reporte-semanal/page.tsx` | Página |
| `app/(comercializadora)/comercializadora/acciones.ts` | Acciones `actualizarReporte`, `guardarConfigReporte` |
| `components/comercializadora/reporte-semanal/*.tsx` | Una vista por sección + config + piezas |

---

### Task 1: Base — tipos, configuración y fechas

**Files:**
- Create: `supabase/functions/_shared/reporte/tipos.ts`
- Create: `supabase/functions/_shared/reporte/config.ts`
- Create: `supabase/functions/_shared/reporte/fechas.ts`
- Test: `supabase/functions/_shared/reporte/base_test.ts`

**Interfaces:**
- Produces: tipos `Factura`, `Paquete`, `Ov`, `NotaCredito`, `Seccion<T>`, `ConfigReporte`, `CreditoActivo`; funciones `configReporteDef()`, `normalizarConfigReporte(x: unknown): ConfigReporte`, `norm(s: string): string`, `en(lista: string[], nombre: string): boolean`, `esPropia(cliente: string): boolean`, `sucursalPropia(f: { cliente: string; sucursal: string }): string`, `titulo(s: string): string`, `TIPOS_ENVIO`, `tipoEnvio(t: string): string`, `esLunes(x: unknown): x is string`, `lunesDe(iso: string): string`, `finSemana(lunes: string): string`, `enRango(iso: string, ini: string, fin: string): boolean`, `diasHabiles(desde: string, hasta: string): number`, `pct(a: number, b: number): number | null`.

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/reporte/base_test.ts
import { assertEquals } from "@std/assert";
import { configReporteDef, en, esPropia, norm, normalizarConfigReporte, pct, sucursalPropia, tipoEnvio, titulo } from "./config.ts";
import { diasHabiles, enRango, esLunes, finSemana, lunesDe } from "./fechas.ts";

Deno.test("norm: sin acentos, mayúsculas y espacios colapsados", () => {
  assertEquals(norm("  Ávila   Camacho "), "AVILA CAMACHO");
  assertEquals(en(["Compras The Coffee"], "COMPRAS  THE COFFEE"), true);
  assertEquals(en(["DODO PIZZA"], "Dodo"), false);
});

Deno.test("esPropia y sucursalPropia: Sucursal de Zoho o el nombre del cliente", () => {
  assertEquals(esPropia("SUCURSALES THE COFFEE-ALEDEN"), true);
  assertEquals(esPropia("SUCURSALES THE COFFEE - GRAN PLAZA"), true);
  assertEquals(esPropia("OPERADORA DE FRANQUICIAS MJA"), false);
  assertEquals(sucursalPropia({ cliente: "SUCURSALES THE COFFEE-ALEDEN", sucursal: "Aleden " }), "Aleden");
  assertEquals(sucursalPropia({ cliente: "SUCURSALES THE COFFEE - GRAN PLAZA", sucursal: "" }), "Gran Plaza");
});

Deno.test("titulo: palabras capitalizadas, conectores en minúscula, siglas sin vocal en mayúscula", () => {
  assertEquals(titulo("VIRTUO MARKETING INTEGRAL"), "Virtuo Marketing Integral");
  assertEquals(titulo("MAGNOLIA GC"), "Magnolia GC");
  assertEquals(titulo("ALIMENTOS, REPOSTERIA Y CAFFE GOURMET"), "Alimentos, Reposteria y Caffe Gourmet");
});

Deno.test("tipoEnvio: los tres valores de Zoho; lo demás es Sin clasificar", () => {
  assertEquals(tipoEnvio("Llenado de canal "), "Llenado de canal");
  assertEquals(tipoEnvio(""), "Sin clasificar");
});

Deno.test("normalizarConfigReporte: defaults, listas limpias y metas acotadas", () => {
  const d = configReporteDef();
  assertEquals(normalizarConfigReporte(null), d);
  const c = normalizarConfigReporte({ excluir_ventas: [" A ", "", 3, "A"], metas: { fill: 150, stock: "2" }, creditos_activos: [{ cliente: "X", nota: "n" }, { nota: "sin cliente" }] });
  assertEquals(c.excluir_ventas, ["A"]);
  assertEquals(c.metas.fill, 100);
  assertEquals(c.metas.stock, 2);
  assertEquals(c.creditos_activos, [{ cliente: "X", sucursal: "", nota: "n" }]);
  assertEquals(c.deuda_interna, d.deuda_interna);
});

Deno.test("pct: null cuando el divisor es 0", () => {
  assertEquals(pct(1, 4), 0.25);
  assertEquals(pct(1, 0), null);
});

Deno.test("fechas de semana", () => {
  assertEquals(esLunes("2026-11-16"), true);
  assertEquals(esLunes("2026-11-18"), false);
  assertEquals(esLunes("hola"), false);
  assertEquals(esLunes(undefined), false);
  assertEquals(lunesDe("2026-11-22"), "2026-11-16");
  assertEquals(lunesDe("2026-11-16"), "2026-11-16");
  assertEquals(finSemana("2026-11-16"), "2026-11-22");
  assertEquals(enRango("2026-11-22", "2026-11-16", "2026-11-22"), true);
  assertEquals(enRango("2026-11-23", "2026-11-16", "2026-11-22"), false);
});

Deno.test("diasHabiles: cuenta lunes a viernes después de la fecha de la OV", () => {
  assertEquals(diasHabiles("2026-11-12", "2026-11-18"), 4); // jue → mié (Durango Centro)
  assertEquals(diasHabiles("2026-11-17", "2026-11-17"), 0);
  assertEquals(diasHabiles("2026-11-20", "2026-11-23"), 1); // vie → lun
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/reporte/base_test.ts`
Expected: FAIL — `Module not found "./config.ts"`.

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/reporte/tipos.ts
/** Datos leídos de Zoho Books ya mapeados (spec §3). Fechas en ISO YYYY-MM-DD; '' si Zoho no la trae. */
export type Factura = {
  numero: string; ov: string; fecha: string; vence: string; cliente: string;
  sucursal: string; tipoEnvio: string; total: number; saldo: number; estado: string;
};
/** Un paquete de una OV; `envio` = shipment_date o '' si no ha salido. */
export type Paquete = { ov: string; fecha: string; envio: string };
export type Ov = {
  id: string; numero: string; fecha: string; cliente: string; sucursal: string; tipoEnvio: string;
  incidencia: string; resolucion: string; estado: string; estadoEnvio: string;
};
export type NotaCredito = {
  numero: string; fecha: string; cliente: string; sucursal: string; total: number; estado: string; descripcion: string;
};
export type Seccion<T> = { ok: true; datos: T } | { ok: false; error: string };
```

```ts
// supabase/functions/_shared/reporte/config.ts
export type CreditoActivo = { cliente: string; sucursal: string; nota: string };
export type ConfigReporte = {
  excluir_ventas: string[]; corporativo_ap: string[]; excluir_saldos: string[];
  excluir_saldos_sucursales: string[]; deuda_interna: string[]; creditos_activos: CreditoActivo[];
  metas: { fill: number; stock: number; pickeo: number; fisica: number; envio: number; dias_envio: number };
  dias_incidencias: number;
};

export const configReporteDef = (): ConfigReporte => ({
  excluir_ventas: ["DODO PIZZA", "Compras The Coffee"],
  corporativo_ap: ["OPERADORA DE FRANQUICIAS MJA", "OPERADORA DE CAFETERIAS SEJ"],
  excluir_saldos: ["SEINOMARIN PROJECTS", "DODO PIZZA"],
  excluir_saldos_sucursales: ["Polanco"],
  deuda_interna: ["MARKETING", "OFICINA PRINCIPAL", "Compras The Coffee"],
  creditos_activos: [],
  metas: { fill: 98, stock: 1, pickeo: 98, fisica: 1, envio: 100, dias_envio: 2 },
  dias_incidencias: 60,
});

export const norm = (s: string) =>
  String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/\s+/g, " ").trim();
export const en = (lista: string[], nombre: string) => { const n = norm(nombre); return lista.some((l) => norm(l) === n); };

const PREFIJO_PROPIA = "SUCURSALES THE COFFEE";
export const esPropia = (cliente: string) => norm(cliente).startsWith(PREFIJO_PROPIA);
/** Nombre de la sucursal propia: el campo Sucursal de Zoho o, si viene vacío, lo que sigue al prefijo del cliente. */
export function sucursalPropia(f: { cliente: string; sucursal: string }): string {
  if (f.sucursal.trim()) return f.sucursal.trim();
  return titulo(f.cliente.trim().slice(PREFIJO_PROPIA.length).replace(/^[\s-]+/, ""));
}

const CONECTORES = new Set(["de", "del", "la", "las", "los", "y", "e"]);
export function titulo(s: string): string {
  return String(s ?? "").trim().toLowerCase().split(/\s+/).map((p, i) => {
    if (i > 0 && CONECTORES.has(p)) return p;
    if (!/[aeiouáéíóú]/.test(p)) return p.toUpperCase();
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(" ");
}

export const TIPOS_ENVIO = ["Ordinario", "Llenado de canal", "Apertura"] as const;
export const SIN_CLASIFICAR = "Sin clasificar";
export function tipoEnvio(t: string): string {
  const n = norm(t);
  return TIPOS_ENVIO.find((x) => norm(x) === n) ?? SIN_CLASIFICAR;
}

export const pct = (a: number, b: number): number | null => (b ? a / b : null);

const lista = (x: unknown, def: string[]): string[] =>
  Array.isArray(x) ? [...new Set(x.filter((v) => typeof v === "string").map((v) => v.trim()).filter(Boolean))] : def;
const num = (x: unknown, def: number, min: number, max: number) => {
  const n = Number(x);
  return Number.isFinite(n) && x !== null && x !== "" ? Math.min(max, Math.max(min, n)) : def;
};

// deno-lint-ignore no-explicit-any
export function normalizarConfigReporte(x: any): ConfigReporte {
  const d = configReporteDef();
  if (!x || typeof x !== "object") return d;
  const m = x.metas ?? {};
  return {
    excluir_ventas: lista(x.excluir_ventas, d.excluir_ventas),
    corporativo_ap: lista(x.corporativo_ap, d.corporativo_ap),
    excluir_saldos: lista(x.excluir_saldos, d.excluir_saldos),
    excluir_saldos_sucursales: lista(x.excluir_saldos_sucursales, d.excluir_saldos_sucursales),
    deuda_interna: lista(x.deuda_interna, d.deuda_interna),
    creditos_activos: Array.isArray(x.creditos_activos)
      ? x.creditos_activos
        // deno-lint-ignore no-explicit-any
        .filter((c: any) => c && typeof c.cliente === "string" && c.cliente.trim())
        // deno-lint-ignore no-explicit-any
        .map((c: any) => ({ cliente: c.cliente.trim(), sucursal: String(c.sucursal ?? "").trim(), nota: String(c.nota ?? "").trim() }))
      : d.creditos_activos,
    metas: {
      fill: num(m.fill, d.metas.fill, 0, 100), stock: num(m.stock, d.metas.stock, 0, 100),
      pickeo: num(m.pickeo, d.metas.pickeo, 0, 100), fisica: num(m.fisica, d.metas.fisica, 0, 100),
      envio: num(m.envio, d.metas.envio, 0, 100), dias_envio: Math.round(num(m.dias_envio, d.metas.dias_envio, 0, 15)),
    },
    dias_incidencias: Math.round(num(x.dias_incidencias, d.dias_incidencias, 14, 180)),
  };
}
```

```ts
// supabase/functions/_shared/reporte/fechas.ts
// Sin APIs de Deno: el portal también lo importa.
const DIA = 86_400_000;
const aUtc = (f: string) => Date.UTC(+f.slice(0, 4), +f.slice(5, 7) - 1, +f.slice(8, 10));
const aIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const sumar = (f: string, n: number) => aIso(aUtc(f) + n * DIA);
export const dif = (desde: string, hasta: string) => Math.round((aUtc(hasta) - aUtc(desde)) / DIA);
const diaSemana = (f: string) => new Date(aUtc(f)).getUTCDay(); // 0 domingo … 6 sábado

export function esLunes(x: unknown): x is string {
  return typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(aUtc(x)) && aIso(aUtc(x)) === x && diaSemana(x) === 1;
}
export const lunesDe = (iso: string) => sumar(iso, -((diaSemana(iso) + 6) % 7));
export const finSemana = (lunes: string) => sumar(lunes, 6);
export const enRango = (iso: string, ini: string, fin: string) => !!iso && iso >= ini && iso <= fin;

/** Días hábiles (lun–vie) en (desde, hasta]. 0 si sale el mismo día o antes. */
export function diasHabiles(desde: string, hasta: string): number {
  let n = 0;
  for (let f = sumar(desde, 1); f <= hasta; f = sumar(f, 1)) { const d = diaSemana(f); if (d !== 0 && d !== 6) n++; }
  return n;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/reporte/base_test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/reporte/
git commit -m "feat(reporte-semanal): tipos, configuración y fechas del cálculo"
```

---

### Task 2: Sección de ventas

**Files:**
- Create: `supabase/functions/_shared/reporte/ventas.ts`
- Test: `supabase/functions/_shared/reporte/ventas_test.ts`

**Interfaces:**
- Consumes: `Factura`, `ConfigReporte`, `en`, `esPropia`, `titulo`, `tipoEnvio`, `TIPOS_ENVIO`, `pct`, `sumar`, `finSemana`, `enRango`.
- Produces:
  ```ts
  export type SemanaVentas = { lunes: string; total: number; porTipo: Record<string, number> };
  export type ClienteTop = { nombre: string; sucursales: string[]; total: number };
  export type Ventas = { total: number; sinIva: number; pedidos: number; top: ClienteTop[]; semanas: SemanaVentas[];
    vsAnterior: number | null; difAnterior: number; vsAnteriorOrdinario: number | null; difAnteriorOrdinario: number;
    promedio: number; vsPromedio: number | null };
  export function facturaVendida(f: Factura, cfg: ConfigReporte): boolean;
  export function calcularVentas(facturas: Factura[], cfg: ConfigReporte, lunes: string): Ventas;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/reporte/ventas_test.ts
import { assertEquals, assertAlmostEquals } from "@std/assert";
import { calcularVentas } from "./ventas.ts";
import { configReporteDef } from "./config.ts";
import type { Factura } from "./tipos.ts";

const f = (o: Partial<Factura>): Factura => ({ numero: "F", ov: "", fecha: "2026-11-17", vence: "", cliente: "CLIENTE X", sucursal: "", tipoEnvio: "Ordinario", total: 100, saldo: 0, estado: "paid", ...o });
const cfg = configReporteDef();

Deno.test("ventas: suma la semana sin excluidos ni anuladas", () => {
  const v = calcularVentas([
    f({ total: 116 }), f({ total: 50, cliente: "DODO PIZZA" }), f({ total: 70, estado: "void" }), f({ total: 10, fecha: "2026-11-23" }),
  ], cfg, "2026-11-16");
  assertEquals(v.total, 116);
  assertEquals(v.pedidos, 1);
  assertAlmostEquals(v.sinIva, 100, 1e-9);
});

Deno.test("ventas: top agrupa Corporativo AP y sucursales propias, con sus sucursales por monto", () => {
  const v = calcularVentas([
    f({ cliente: "OPERADORA DE FRANQUICIAS MJA", sucursal: "Santa Fe", total: 300 }),
    f({ cliente: "OPERADORA DE CAFETERIAS SEJ", sucursal: "Avándaro", total: 100 }),
    f({ cliente: "SUCURSALES THE COFFEE-VENTURA", sucursal: "Ventura", total: 200 }),
    f({ cliente: "MAGNOLIA GC", sucursal: "Puerta Paraíso", total: 50 }),
  ], cfg, "2026-11-16");
  assertEquals(v.top.map((t) => [t.nombre, t.total]), [["Corporativo AP (MJA + SEJ)", 400], ["The Coffee Sucursales", 200], ["Magnolia GC", 50]]);
  assertEquals(v.top[0].sucursales, ["Santa Fe", "Avándaro"]);
});

Deno.test("ventas: 5 semanas por tipo y variaciones", () => {
  const v = calcularVentas([
    f({ fecha: "2026-11-10", total: 200, tipoEnvio: "Ordinario" }),
    f({ fecha: "2026-11-10", total: 100, tipoEnvio: "Apertura" }),
    f({ fecha: "2026-11-17", total: 150, tipoEnvio: "Ordinario" }),
    f({ fecha: "2026-11-18", total: 30, tipoEnvio: "Raro" }),
  ], cfg, "2026-11-16");
  assertEquals(v.semanas.map((s) => s.lunes), ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"]);
  assertEquals(v.semanas[3].porTipo, { Ordinario: 200, "Llenado de canal": 0, Apertura: 100 });
  assertEquals(v.semanas[4].porTipo, { Ordinario: 150, "Llenado de canal": 0, Apertura: 0, "Sin clasificar": 30 });
  assertEquals(v.difAnterior, -120);
  assertAlmostEquals(v.vsAnterior!, -0.4, 1e-9);
  assertEquals(v.difAnteriorOrdinario, -50);
  assertEquals(v.promedio, 96);
});

Deno.test("ventas: semana vacía no da NaN", () => {
  const v = calcularVentas([], cfg, "2026-11-16");
  assertEquals(v.total, 0);
  assertEquals(v.vsAnterior, null);
  assertEquals(v.vsPromedio, null);
  assertEquals(v.top, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/reporte/ventas_test.ts`
Expected: FAIL — `Module not found "./ventas.ts"`.

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/reporte/ventas.ts
import { type ConfigReporte, en, esPropia, pct, TIPOS_ENVIO, tipoEnvio, titulo } from "./config.ts";
import { enRango, finSemana, sumar } from "./fechas.ts";
import type { Factura } from "./tipos.ts";

export type SemanaVentas = { lunes: string; total: number; porTipo: Record<string, number> };
export type ClienteTop = { nombre: string; sucursales: string[]; total: number };
export type Ventas = {
  total: number; sinIva: number; pedidos: number; top: ClienteTop[]; semanas: SemanaVentas[];
  vsAnterior: number | null; difAnterior: number; vsAnteriorOrdinario: number | null; difAnteriorOrdinario: number;
  promedio: number; vsPromedio: number | null;
};

const IVA = 1.16;
const TOP = 9;

export const facturaVendida = (f: Factura, cfg: ConfigReporte) =>
  f.estado !== "void" && f.estado !== "draft" && !en(cfg.excluir_ventas, f.cliente);

function grupo(cliente: string, cfg: ConfigReporte): string {
  if (en(cfg.corporativo_ap, cliente)) return "Corporativo AP (MJA + SEJ)";
  if (esPropia(cliente)) return "The Coffee Sucursales";
  return titulo(cliente);
}

function semana(fs: Factura[], lunes: string): SemanaVentas {
  const fin = finSemana(lunes);
  const porTipo: Record<string, number> = Object.fromEntries(TIPOS_ENVIO.map((t) => [t, 0]));
  let total = 0;
  for (const f of fs) {
    if (!enRango(f.fecha, lunes, fin)) continue;
    total += f.total;
    const t = tipoEnvio(f.tipoEnvio);
    porTipo[t] = (porTipo[t] ?? 0) + f.total;
  }
  return { lunes, total, porTipo };
}

export function calcularVentas(facturas: Factura[], cfg: ConfigReporte, lunes: string): Ventas {
  const fs = facturas.filter((f) => facturaVendida(f, cfg));
  const semanas = [28, 21, 14, 7, 0].map((d) => semana(fs, sumar(lunes, -d)));
  const actual = semanas[4], anterior = semanas[3];
  const fin = finSemana(lunes);
  const deLaSemana = fs.filter((f) => enRango(f.fecha, lunes, fin));

  const grupos = new Map<string, { total: number; suc: Map<string, number> }>();
  for (const f of deLaSemana) {
    const g = grupo(f.cliente, cfg);
    const x = grupos.get(g) ?? { total: 0, suc: new Map() };
    x.total += f.total;
    if (f.sucursal.trim()) x.suc.set(f.sucursal.trim(), (x.suc.get(f.sucursal.trim()) ?? 0) + f.total);
    grupos.set(g, x);
  }
  const top = [...grupos].map(([nombre, x]) => ({
    nombre, total: x.total, sucursales: [...x.suc].sort((a, b) => b[1] - a[1]).map(([s]) => s),
  })).sort((a, b) => b.total - a.total).slice(0, TOP);

  const promedio = semanas.reduce((a, s) => a + s.total, 0) / semanas.length;
  const ord = (s: SemanaVentas) => s.porTipo["Ordinario"] ?? 0;
  return {
    total: actual.total, sinIva: actual.total / IVA, pedidos: deLaSemana.length, top, semanas,
    difAnterior: actual.total - anterior.total, vsAnterior: pct(actual.total - anterior.total, anterior.total),
    difAnteriorOrdinario: ord(actual) - ord(anterior), vsAnteriorOrdinario: pct(ord(actual) - ord(anterior), ord(anterior)),
    promedio, vsPromedio: pct(actual.total - promedio, promedio),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/reporte/ventas_test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/reporte/ventas.ts supabase/functions/_shared/reporte/ventas_test.ts
git commit -m "feat(reporte-semanal): sección de ventas"
```

---

### Task 3: Sección de calidad de surtido

**Files:**
- Create: `supabase/functions/_shared/reporte/surtido.ts`
- Test: `supabase/functions/_shared/reporte/surtido_test.ts`

**Interfaces:**
- Consumes: `Ov`, `Paquete`, `ConfigReporte`, `en`, `esPropia`, `norm`, `pct`, `tipoEnvio`, `diasHabiles`, `enRango`, `finSemana`.
- Produces:
  ```ts
  export type Origen = "stock" | "pickeo" | "paqueteria" | "otro";
  export function origenIncidencia(t: string): Origen | null;
  export function primerEnvio(paquetes: Paquete[]): Map<string, string>;
  export function ovValida(o: Ov, cfg: ConfigReporte): boolean;
  export type FilaIncidencia = { ov: string; sucursal: string; cliente: string; origen: Origen; tipo: string; resolucion: string };
  export type Indicador = { valor: number | null; meta: number; cumple: boolean | null };
  export type Surtido = { enviados: number; conFaltante: number; incidenciasTotal: number;
    fill: Indicador; stock: Indicador; pickeo: Indicador; fisica: Indicador;
    casos: Record<Origen, number>;
    envio: Indicador & { universo: number; enMeta: number; buckets: [number, number, number, number];
      fuera: { ov: string; sucursal: string; fecha: string; envio: string; dias: number }[] };
    incidencias: FilaIncidencia[] };
  export function calcularSurtido(ovs: Ov[], paquetes: Paquete[], cfg: ConfigReporte, lunes: string): Surtido;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/reporte/surtido_test.ts
import { assertEquals, assertAlmostEquals } from "@std/assert";
import { calcularSurtido, origenIncidencia, primerEnvio } from "./surtido.ts";
import { configReporteDef } from "./config.ts";
import type { Ov, Paquete } from "./tipos.ts";

const ov = (o: Partial<Ov>): Ov => ({ id: "1", numero: "OV-1", fecha: "2026-11-16", cliente: "CLIENTE X", sucursal: "S", tipoEnvio: "Ordinario", incidencia: "", resolucion: "", estado: "invoiced", estadoEnvio: "fulfilled", ...o });
const pk = (ovn: string, envio: string): Paquete => ({ ov: ovn, fecha: envio || "2026-11-16", envio });
const cfg = configReporteDef();

Deno.test("origenIncidencia: valores de Zoho", () => {
  assertEquals(origenIncidencia("Sin stock - Pedido incompleto"), "stock");
  assertEquals(origenIncidencia("Pedido Incompleto"), "pickeo");
  assertEquals(origenIncidencia("Derrame de Produto"), "paqueteria");
  assertEquals(origenIncidencia("Extravío"), "paqueteria");
  assertEquals(origenIncidencia(""), null);
  assertEquals(origenIncidencia("Otra cosa"), "otro");
});

Deno.test("primerEnvio: el menor shipment_date por OV, ignora los no enviados", () => {
  const m = primerEnvio([pk("A", "2026-11-20"), pk("A", "2026-11-17"), pk("B", "")]);
  assertEquals(m.get("A"), "2026-11-17");
  assertEquals(m.has("B"), false);
});

Deno.test("surtido: universo por primer envío; reposición de OV vieja no cuenta", () => {
  const s = calcularSurtido(
    [ov({ numero: "A" }), ov({ numero: "B", incidencia: "Sin stock - Pedido incompleto" }), ov({ numero: "C", fecha: "2026-11-02" }),
     ov({ numero: "D", incidencia: "Pedido Incompleto" }), ov({ numero: "E", incidencia: "Derrame de Produto" })],
    [pk("A", "2026-11-17"), pk("B", "2026-11-18"), pk("C", "2026-11-04"), pk("C", "2026-11-19"), pk("E", "2026-11-18")],
    cfg, "2026-11-16");
  // A, B, E por envío; D por incidencia sin enviar; C excluida (su primer envío fue antes).
  assertEquals(s.enviados, 4);
  assertEquals(s.casos, { stock: 1, pickeo: 1, paqueteria: 1, otro: 0 });
  assertEquals(s.conFaltante, 2);
  assertEquals(s.incidenciasTotal, 3);
  assertAlmostEquals(s.fill.valor!, 0.5, 1e-9);
  assertEquals(s.fill.cumple, false);
  assertAlmostEquals(s.pickeo.valor!, 0.75, 1e-9);
  assertEquals(s.incidencias.map((i) => i.ov), ["E", "D", "B"]);
});

Deno.test("surtido: envío ≤2 días hábiles solo externos sin aperturas", () => {
  const s = calcularSurtido(
    [ov({ numero: "A", fecha: "2026-11-12" }), ov({ numero: "B" }), ov({ numero: "C", cliente: "SUCURSALES THE COFFEE-VENTURA", fecha: "2026-11-02" }),
     ov({ numero: "D", tipoEnvio: "Apertura", fecha: "2026-11-02" })],
    [pk("A", "2026-11-18"), pk("B", "2026-11-17"), pk("C", "2026-11-17"), pk("D", "2026-11-17")],
    cfg, "2026-11-16");
  assertEquals(s.envio.universo, 2);
  assertEquals(s.envio.enMeta, 1);
  assertEquals(s.envio.buckets, [0, 1, 0, 1]);
  assertEquals(s.envio.fuera, [{ ov: "A", sucursal: "S", fecha: "2026-11-12", envio: "2026-11-18", dias: 4 }]);
});

Deno.test("surtido: sin OVs no da NaN", () => {
  const s = calcularSurtido([], [], cfg, "2026-11-16");
  assertEquals(s.fill.valor, null);
  assertEquals(s.fill.cumple, null);
  assertEquals(s.envio.valor, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/reporte/surtido_test.ts`
Expected: FAIL — `Module not found "./surtido.ts"`.

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/reporte/surtido.ts
import { type ConfigReporte, en, esPropia, norm, pct, tipoEnvio } from "./config.ts";
import { diasHabiles, enRango, finSemana } from "./fechas.ts";
import type { Ov, Paquete } from "./tipos.ts";

export type Origen = "stock" | "pickeo" | "paqueteria" | "otro";
export type FilaIncidencia = { ov: string; sucursal: string; cliente: string; origen: Origen; tipo: string; resolucion: string };
export type Indicador = { valor: number | null; meta: number; cumple: boolean | null };
export type Surtido = {
  enviados: number; conFaltante: number; incidenciasTotal: number;
  fill: Indicador; stock: Indicador; pickeo: Indicador; fisica: Indicador;
  casos: Record<Origen, number>;
  envio: Indicador & {
    universo: number; enMeta: number; buckets: [number, number, number, number];
    fuera: { ov: string; sucursal: string; fecha: string; envio: string; dias: number }[];
  };
  incidencias: FilaIncidencia[];
};

export function origenIncidencia(t: string): Origen | null {
  const n = norm(t);
  if (!n) return null;
  if (n.includes("SIN STOCK")) return "stock";
  if (n === "PEDIDO INCOMPLETO") return "pickeo";
  if (/DERRAME|EXTRAV|DANO|DANAD|PAQUETER/.test(n)) return "paqueteria";
  return "otro";
}

export function primerEnvio(paquetes: Paquete[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of paquetes) {
    if (!p.envio) continue;
    const a = m.get(p.ov);
    if (!a || p.envio < a) m.set(p.ov, p.envio);
  }
  return m;
}

export const ovValida = (o: Ov, cfg: ConfigReporte) => o.estado !== "void" && !en(cfg.excluir_ventas, o.cliente);

const ORDEN: Origen[] = ["paqueteria", "pickeo", "stock", "otro"];
const ind = (valor: number | null, meta: number, mayor: boolean): Indicador =>
  ({ valor, meta, cumple: valor === null ? null : mayor ? valor * 100 >= meta : valor * 100 <= meta });

export function calcularSurtido(ovs: Ov[], paquetes: Paquete[], cfg: ConfigReporte, lunes: string): Surtido {
  const fin = finSemana(lunes);
  const pe = primerEnvio(paquetes);
  const universo = ovs.filter((o) => {
    if (!ovValida(o, cfg)) return false;
    const e = pe.get(o.numero);
    return e ? enRango(e, lunes, fin) : enRango(o.fecha, lunes, fin) && !!origenIncidencia(o.incidencia);
  });
  const n = universo.length;
  const casos: Record<Origen, number> = { stock: 0, pickeo: 0, paqueteria: 0, otro: 0 };
  const incidencias: FilaIncidencia[] = [];
  for (const o of universo) {
    const org = origenIncidencia(o.incidencia);
    if (!org) continue;
    casos[org]++;
    incidencias.push({ ov: o.numero, sucursal: o.sucursal.trim(), cliente: o.cliente, origen: org, tipo: o.incidencia, resolucion: o.resolucion });
  }
  incidencias.sort((a, b) => ORDEN.indexOf(a.origen) - ORDEN.indexOf(b.origen) || a.ov.localeCompare(b.ov));
  const conFaltante = casos.stock + casos.pickeo;

  const externos = universo.filter((o) => pe.has(o.numero) && !esPropia(o.cliente) && tipoEnvio(o.tipoEnvio) !== "Apertura");
  const buckets: [number, number, number, number] = [0, 0, 0, 0];
  const fuera: Surtido["envio"]["fuera"] = [];
  let enMeta = 0;
  for (const o of externos) {
    const envio = pe.get(o.numero)!;
    const dias = diasHabiles(o.fecha, envio);
    buckets[Math.min(dias, 3)]++;
    if (dias <= cfg.metas.dias_envio) enMeta++;
    else fuera.push({ ov: o.numero, sucursal: o.sucursal.trim(), fecha: o.fecha, envio, dias });
  }
  const m = cfg.metas;
  return {
    enviados: n, conFaltante, incidenciasTotal: incidencias.length, casos, incidencias,
    fill: ind(pct(n - conFaltante, n), m.fill, true),
    stock: ind(pct(casos.stock, n), m.stock, false),
    pickeo: ind(n ? 1 - casos.pickeo / n : null, m.pickeo, true),
    fisica: ind(pct(casos.paqueteria, n), m.fisica, false),
    envio: { ...ind(pct(enMeta, externos.length), m.envio, true), universo: externos.length, enMeta, buckets, fuera },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/reporte/surtido_test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/reporte/surtido.ts supabase/functions/_shared/reporte/surtido_test.ts
git commit -m "feat(reporte-semanal): calidad de surtido"
```

---

### Task 4: Atención al cliente, notas de crédito y aperturas

**Files:**
- Create: `supabase/functions/_shared/reporte/atencion.ts`
- Test: `supabase/functions/_shared/reporte/atencion_test.ts`

**Interfaces:**
- Consumes: `Ov`, `Paquete`, `NotaCredito`, `ConfigReporte`, `esPropia`, `norm`, `titulo`, `tipoEnvio`, `origenIncidencia`, `ovValida`, `primerEnvio`, `lunesDe`, `enRango`, `finSemana`.
- Produces:
  ```ts
  export type Caso = { ov: string; fecha: string; sucursal: string; cliente: string; tipo: string; resolucion: string; resuelto: boolean; descripcion: string };
  export type GrupoAtencion = { abiertas: number; resueltasSemana: number; semanas: { lunes: string; casos: Caso[] }[] };
  export type Atencion = { propias: GrupoAtencion; externos: GrupoAtencion };
  export function casosAtencion(ovs: Ov[], cfg: ConfigReporte, lunes: string): Ov[];
  export function calcularAtencion(ovs: Ov[], descripciones: Record<string, string>, cfg: ConfigReporte, lunes: string): Atencion;
  export type Notas = { filas: NotaCredito[]; total: number };
  export function calcularNotas(notas: NotaCredito[], lunes: string): Notas;
  export type Apertura = { ov: string; fecha: string; sucursal: string; cliente: string; envio: string | null; estadoEnvio: string };
  export function calcularAperturas(ovs: Ov[], paquetes: Paquete[], cfg: ConfigReporte, lunes: string): Apertura[];
  ```
  `descripciones` está indexado por `Ov.id`.

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/reporte/atencion_test.ts
import { assertEquals } from "@std/assert";
import { calcularAperturas, calcularAtencion, calcularNotas, casosAtencion } from "./atencion.ts";
import { configReporteDef } from "./config.ts";
import type { NotaCredito, Ov } from "./tipos.ts";

const ov = (o: Partial<Ov>): Ov => ({ id: o.numero ?? "1", numero: "OV-1", fecha: "2026-11-17", cliente: "MAGNOLIA GC", sucursal: "Puerta Paraíso", tipoEnvio: "Ordinario", incidencia: "Sin stock - Pedido incompleto", resolucion: "En Proceso", estado: "invoiced", estadoEnvio: "fulfilled", ...o });
const cfg = configReporteDef();
const L = "2026-11-16";

Deno.test("casosAtencion: abiertas de cualquier semana + resueltas de esta semana", () => {
  const c = casosAtencion([
    ov({ numero: "A" }), ov({ numero: "B", fecha: "2026-11-03" }), ov({ numero: "C", resolucion: "Resuelto" }),
    ov({ numero: "D", fecha: "2026-11-03", resolucion: "Resuelto" }), ov({ numero: "E", incidencia: "" }),
    ov({ numero: "F", cliente: "DODO PIZZA" }),
  ], cfg, L);
  assertEquals(c.map((o) => o.numero), ["A", "B", "C"]);
});

Deno.test("calcularAtencion: separa propias/externos y agrupa por semana, más reciente primero", () => {
  const a = calcularAtencion([
    ov({ numero: "A" }), ov({ numero: "B", fecha: "2026-11-10" }),
    ov({ numero: "C", cliente: "SUCURSALES THE COFFEE-NAMORA", sucursal: "Namora", resolucion: "Resuelto", incidencia: "Pedido Incompleto" }),
  ], { A: "Faltó vaso 8 oz", C: "Se corrigió" }, cfg, L);
  assertEquals(a.externos.abiertas, 2);
  assertEquals(a.externos.semanas.map((s) => [s.lunes, s.casos.map((c) => c.ov)]), [["2026-11-16", ["A"]], ["2026-11-09", ["B"]]]);
  assertEquals(a.externos.semanas[0].casos[0].descripcion, "Faltó vaso 8 oz");
  assertEquals(a.externos.semanas[0].casos[0].cliente, "Magnolia GC");
  assertEquals(a.propias.resueltasSemana, 1);
  assertEquals(a.propias.abiertas, 0);
});

Deno.test("calcularNotas: las de la semana sin anuladas", () => {
  const n = (o: Partial<NotaCredito>): NotaCredito => ({ numero: "CN", fecha: "2026-11-18", cliente: "X", sucursal: "", total: 10, estado: "open", descripcion: "", ...o });
  const r = calcularNotas([n({ total: 196.04 }), n({ total: 1, estado: "void" }), n({ total: 5, fecha: "2026-11-23" })], L);
  assertEquals(r.filas.length, 1);
  assertEquals(r.total, 196.04);
});

Deno.test("calcularAperturas: sin enviar o de la semana", () => {
  const r = calcularAperturas([
    ov({ numero: "A", tipoEnvio: "Apertura", fecha: "2026-11-24", incidencia: "" }),
    ov({ numero: "B", tipoEnvio: "Apertura", fecha: "2026-10-01", incidencia: "" }),
    ov({ numero: "C", tipoEnvio: "Apertura", fecha: "2026-11-10", incidencia: "" }),
    ov({ numero: "D", incidencia: "" }),
  ], [{ ov: "B", fecha: "2026-10-03", envio: "2026-10-03" }, { ov: "C", fecha: "2026-11-17", envio: "2026-11-17" }], cfg, L);
  assertEquals(r.map((a) => [a.ov, a.envio]), [["A", null], ["C", "2026-11-17"]]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/reporte/atencion_test.ts`
Expected: FAIL — `Module not found "./atencion.ts"`.

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/reporte/atencion.ts
import { type ConfigReporte, esPropia, norm, titulo, tipoEnvio } from "./config.ts";
import { enRango, finSemana, lunesDe } from "./fechas.ts";
import { origenIncidencia, ovValida, primerEnvio } from "./surtido.ts";
import type { NotaCredito, Ov, Paquete } from "./tipos.ts";

export type Caso = { ov: string; fecha: string; sucursal: string; cliente: string; tipo: string; resolucion: string; resuelto: boolean; descripcion: string };
export type GrupoAtencion = { abiertas: number; resueltasSemana: number; semanas: { lunes: string; casos: Caso[] }[] };
export type Atencion = { propias: GrupoAtencion; externos: GrupoAtencion };
export type Notas = { filas: NotaCredito[]; total: number };
export type Apertura = { ov: string; fecha: string; sucursal: string; cliente: string; envio: string | null; estadoEnvio: string };

const resuelto = (o: Ov) => norm(o.resolucion) === "RESUELTO";

/** OVs que aparecen en Atención: también decide qué detalles de OV se leen de Zoho (descripción). */
export function casosAtencion(ovs: Ov[], cfg: ConfigReporte, lunes: string): Ov[] {
  const fin = finSemana(lunes);
  return ovs.filter((o) => ovValida(o, cfg) && origenIncidencia(o.incidencia) && (!resuelto(o) || enRango(o.fecha, lunes, fin)));
}

function grupo(ovs: Ov[], desc: Record<string, string>): GrupoAtencion {
  const porSemana = new Map<string, Caso[]>();
  for (const o of ovs) {
    const l = lunesDe(o.fecha);
    const c: Caso = { ov: o.numero, fecha: o.fecha, sucursal: o.sucursal.trim(), cliente: titulo(o.cliente), tipo: o.incidencia,
      resolucion: o.resolucion || "Sin estatus", resuelto: resuelto(o), descripcion: (desc[o.id] ?? "").trim() };
    porSemana.set(l, [...(porSemana.get(l) ?? []), c]);
  }
  const semanas = [...porSemana].sort((a, b) => b[0].localeCompare(a[0]))
    .map(([lunes, casos]) => ({ lunes, casos: casos.sort((a, b) => a.ov.localeCompare(b.ov)) }));
  return { abiertas: ovs.filter((o) => !resuelto(o)).length, resueltasSemana: ovs.filter(resuelto).length, semanas };
}

export function calcularAtencion(ovs: Ov[], descripciones: Record<string, string>, cfg: ConfigReporte, lunes: string): Atencion {
  const casos = casosAtencion(ovs, cfg, lunes);
  return {
    propias: grupo(casos.filter((o) => esPropia(o.cliente)), descripciones),
    externos: grupo(casos.filter((o) => !esPropia(o.cliente)), descripciones),
  };
}

export function calcularNotas(notas: NotaCredito[], lunes: string): Notas {
  const fin = finSemana(lunes);
  const filas = notas.filter((n) => n.estado !== "void" && enRango(n.fecha, lunes, fin))
    .sort((a, b) => b.numero.localeCompare(a.numero));
  return { filas, total: filas.reduce((a, n) => a + n.total, 0) };
}

export function calcularAperturas(ovs: Ov[], paquetes: Paquete[], cfg: ConfigReporte, lunes: string): Apertura[] {
  const fin = finSemana(lunes);
  const pe = primerEnvio(paquetes);
  return ovs.filter((o) => ovValida(o, cfg) && tipoEnvio(o.tipoEnvio) === "Apertura")
    .filter((o) => { const e = pe.get(o.numero); return !e || enRango(e, lunes, fin) || enRango(o.fecha, lunes, fin) || o.fecha > fin; })
    .filter((o) => pe.has(o.numero) || o.fecha >= lunes)
    .map((o) => ({ ov: o.numero, fecha: o.fecha, sucursal: o.sucursal.trim(), cliente: titulo(o.cliente), envio: pe.get(o.numero) ?? null, estadoEnvio: o.estadoEnvio }))
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
}
```

Nota sobre `calcularAperturas`: «sin enviar» se limita a OVs con fecha desde el lunes de la semana para no arrastrar aperturas viejas nunca marcadas como enviadas (caso B del test).

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/reporte/atencion_test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/reporte/atencion.ts supabase/functions/_shared/reporte/atencion_test.ts
git commit -m "feat(reporte-semanal): atención, notas de crédito y aperturas"
```

---

### Task 5: Saldos de sucursales propias y clientes externos

**Files:**
- Create: `supabase/functions/_shared/reporte/saldos.ts`
- Test: `supabase/functions/_shared/reporte/saldos_test.ts`

**Interfaces:**
- Consumes: `Factura`, `ConfigReporte`, `en`, `esPropia`, `norm`, `sucursalPropia`, `titulo`, `tipoEnvio`, `dif`.
- Produces:
  ```ts
  export type SaldoSucursal = { sucursal: string; dentro: number; fueraAnio: number; anteriores: number; facturas: number };
  export type SaldosSucursales = { anio: number; total: number; dentro: number; fueraAnio: number; anteriores: number; facturas: number; filas: SaldoSucursal[] };
  export type SaldoCliente = { cliente: string; nota: string; masAntigua: string; dias: number; saldo: number; llenado: number };
  export type SaldosExternos = { filas: SaldoCliente[]; subtotal: number; creditos: SaldoCliente[]; subtotalCreditos: number; total: number;
    interna: SaldoCliente[]; totalInterna: number; excluidos: { cliente: string; saldo: number }[] };
  export type Foto = { externos: number; creditos: number; interna: number };
  export function calcularSaldosSucursales(pendientes: Factura[], cfg: ConfigReporte, corte: string): SaldosSucursales;
  export function calcularSaldosExternos(pendientes: Factura[], cfg: ConfigReporte, corte: string): SaldosExternos;
  export function fotoDe(s: SaldosExternos): Foto;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/reporte/saldos_test.ts
import { assertEquals } from "@std/assert";
import { calcularSaldosExternos, calcularSaldosSucursales, fotoDe } from "./saldos.ts";
import { configReporteDef } from "./config.ts";
import type { Factura } from "./tipos.ts";

const f = (o: Partial<Factura>): Factura => ({ numero: "F", ov: "", fecha: "2026-11-10", vence: "2026-11-25", cliente: "X", sucursal: "", tipoEnvio: "Ordinario", total: 100, saldo: 100, estado: "sent", ...o });
const C = "2026-11-23";

Deno.test("sucursales: dentro de crédito, fuera del año y anteriores; excluye Polanco", () => {
  const cfg = configReporteDef();
  const s = calcularSaldosSucursales([
    f({ cliente: "SUCURSALES THE COFFEE-VENTURA", sucursal: "Ventura", saldo: 10 }),
    f({ cliente: "SUCURSALES THE COFFEE-VENTURA", sucursal: "Ventura", vence: "2026-11-01", saldo: 20 }),
    f({ cliente: "SUCURSALES THE COFFEE-VENTURA", sucursal: "", fecha: "2025-12-01", vence: "", saldo: 5 }),
    f({ cliente: "SUCURSALES THE COFFEE-POLANCO", sucursal: "Polanco", saldo: 999 }),
    f({ cliente: "MAGNOLIA GC", saldo: 50 }),
    f({ cliente: "SUCURSALES THE COFFEE-OTTAWA", sucursal: "Ottawa", saldo: 0 }),
  ], cfg, C);
  assertEquals(s.anio, 2026);
  assertEquals(s.filas, [{ sucursal: "Ventura", dentro: 10, fueraAnio: 20, anteriores: 5, facturas: 3 }]);
  assertEquals([s.total, s.facturas], [35, 3]);
});

Deno.test("externos: por cliente, más antigua, llenado, créditos, interna y excluidos", () => {
  const cfg = { ...configReporteDef(), creditos_activos: [{ cliente: "TANDEM CORPORATIVO EMPRESARIAL", sucursal: "Patio Santa Fe", nota: "apertura · crédito 6×6" }] };
  const s = calcularSaldosExternos([
    f({ cliente: "TANDEM CORPORATIVO EMPRESARIAL", fecha: "2026-10-13", saldo: 30, tipoEnvio: "Llenado de canal" }),
    f({ cliente: "TANDEM CORPORATIVO EMPRESARIAL", fecha: "2026-11-01", saldo: 5 }),
    f({ cliente: "TANDEM CORPORATIVO EMPRESARIAL", sucursal: "Patio Santa Fe", fecha: "2026-06-29", saldo: 500 }),
    f({ cliente: "MARKETING", fecha: "2026-04-21", saldo: 70 }),
    f({ cliente: "DODO PIZZA", saldo: 22 }),
    f({ cliente: "SUCURSALES THE COFFEE-VENTURA", saldo: 1000 }),
  ], cfg, C);
  assertEquals(s.filas, [{ cliente: "Tandem Corporativo Empresarial", nota: "", masAntigua: "2026-10-13", dias: 41, saldo: 35, llenado: 30 }]);
  assertEquals(s.creditos.map((c) => [c.cliente, c.nota, c.saldo, c.dias]), [["Tandem Corporativo Empresarial", "Patio Santa Fe · apertura · crédito 6×6", 500, 147]]);
  assertEquals([s.subtotal, s.subtotalCreditos, s.total, s.totalInterna], [35, 500, 535, 70]);
  assertEquals(s.excluidos, [{ cliente: "Dodo Pizza", saldo: 22 }]);
  assertEquals(fotoDe(s), { externos: 535, creditos: 500, interna: 70 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/reporte/saldos_test.ts`
Expected: FAIL — `Module not found "./saldos.ts"`.

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/reporte/saldos.ts
import { type ConfigReporte, en, esPropia, norm, sucursalPropia, titulo, tipoEnvio } from "./config.ts";
import { dif } from "./fechas.ts";
import type { Factura } from "./tipos.ts";

export type SaldoSucursal = { sucursal: string; dentro: number; fueraAnio: number; anteriores: number; facturas: number };
export type SaldosSucursales = { anio: number; total: number; dentro: number; fueraAnio: number; anteriores: number; facturas: number; filas: SaldoSucursal[] };
export type SaldoCliente = { cliente: string; nota: string; masAntigua: string; dias: number; saldo: number; llenado: number };
export type SaldosExternos = {
  filas: SaldoCliente[]; subtotal: number; creditos: SaldoCliente[]; subtotalCreditos: number; total: number;
  interna: SaldoCliente[]; totalInterna: number; excluidos: { cliente: string; saldo: number }[];
};
export type Foto = { externos: number; creditos: number; interna: number };

const pendiente = (f: Factura) => f.saldo > 0 && f.estado !== "void" && f.estado !== "draft";
const suma = (xs: { saldo: number }[]) => xs.reduce((a, x) => a + x.saldo, 0);

export function calcularSaldosSucursales(pendientes: Factura[], cfg: ConfigReporte, corte: string): SaldosSucursales {
  const anio = Number(corte.slice(0, 4));
  const m = new Map<string, SaldoSucursal>();
  for (const f of pendientes) {
    if (!pendiente(f) || !esPropia(f.cliente)) continue;
    const suc = sucursalPropia(f);
    if (en(cfg.excluir_saldos_sucursales, suc) || cfg.excluir_saldos_sucursales.some((x) => norm(f.cliente).endsWith(norm(x)))) continue;
    const r = m.get(norm(suc)) ?? { sucursal: suc, dentro: 0, fueraAnio: 0, anteriores: 0, facturas: 0 };
    const vence = f.vence || f.fecha;
    if (vence >= corte) r.dentro += f.saldo;
    else if (Number(f.fecha.slice(0, 4)) >= anio) r.fueraAnio += f.saldo;
    else r.anteriores += f.saldo;
    r.facturas++;
    m.set(norm(suc), r);
  }
  const filas = [...m.values()].sort((a, b) => b.dentro + b.fueraAnio + b.anteriores - (a.dentro + a.fueraAnio + a.anteriores));
  const dentro = filas.reduce((a, r) => a + r.dentro, 0), fueraAnio = filas.reduce((a, r) => a + r.fueraAnio, 0);
  const anteriores = filas.reduce((a, r) => a + r.anteriores, 0);
  return { anio, total: dentro + fueraAnio + anteriores, dentro, fueraAnio, anteriores, facturas: filas.reduce((a, r) => a + r.facturas, 0), filas };
}

function agrupar(fs: { f: Factura; clave: string; nota: string }[], corte: string): SaldoCliente[] {
  const m = new Map<string, SaldoCliente>();
  for (const { f, clave, nota } of fs) {
    const r = m.get(clave) ?? { cliente: titulo(f.cliente), nota, masAntigua: f.fecha, dias: 0, saldo: 0, llenado: 0 };
    if (f.fecha < r.masAntigua) r.masAntigua = f.fecha;
    r.saldo += f.saldo;
    if (tipoEnvio(f.tipoEnvio) === "Llenado de canal") r.llenado += f.saldo;
    m.set(clave, r);
  }
  return [...m.values()].map((r) => ({ ...r, dias: dif(r.masAntigua, corte) })).sort((a, b) => b.saldo - a.saldo);
}

export function calcularSaldosExternos(pendientes: Factura[], cfg: ConfigReporte, corte: string): SaldosExternos {
  const normales: { f: Factura; clave: string; nota: string }[] = [];
  const creditos: typeof normales = [], interna: typeof normales = [];
  const excl = new Map<string, number>();
  for (const f of pendientes) {
    if (!pendiente(f) || esPropia(f.cliente)) continue;
    if (en(cfg.excluir_saldos, f.cliente)) { excl.set(titulo(f.cliente), (excl.get(titulo(f.cliente)) ?? 0) + f.saldo); continue; }
    if (en(cfg.deuda_interna, f.cliente)) { interna.push({ f, clave: norm(f.cliente), nota: "" }); continue; }
    const c = cfg.creditos_activos.find((c) => norm(c.cliente) === norm(f.cliente) && (!c.sucursal || norm(c.sucursal) === norm(f.sucursal)));
    if (c) creditos.push({ f, clave: `${norm(c.cliente)}|${norm(c.sucursal)}`, nota: [c.sucursal, c.nota].filter(Boolean).join(" · ") });
    else normales.push({ f, clave: norm(f.cliente), nota: "" });
  }
  const filas = agrupar(normales, corte), cr = agrupar(creditos, corte), int = agrupar(interna, corte);
  const subtotal = suma(filas), subtotalCreditos = suma(cr);
  return {
    filas, subtotal, creditos: cr, subtotalCreditos, total: subtotal + subtotalCreditos, interna: int, totalInterna: suma(int),
    excluidos: [...excl].map(([cliente, saldo]) => ({ cliente, saldo })),
  };
}

export const fotoDe = (s: SaldosExternos): Foto => ({ externos: s.total, creditos: s.subtotalCreditos, interna: s.totalInterna });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/reporte/saldos_test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/reporte/saldos.ts supabase/functions/_shared/reporte/saldos_test.ts
git commit -m "feat(reporte-semanal): saldos de sucursales y clientes externos"
```

---

### Task 6: `calcularReporte` — une las secciones y aísla fallas

**Files:**
- Create: `supabase/functions/_shared/reporte/reporte.ts`
- Test: `supabase/functions/_shared/reporte/reporte_test.ts`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces:
  ```ts
  export type Lectura = { facturas: Seccion<Factura[]>; paquetes: Seccion<Paquete[]>; ovs: Seccion<Ov[]>;
    descripciones: Seccion<Record<string, string>>; notas: Seccion<NotaCredito[]>; pendientes: Seccion<Factura[]> };
  export type Reporte = { lunes: string; fin: string; corte: string; leidoEn: string;
    ventas: Seccion<Ventas>; surtido: Seccion<Surtido>; atencion: Seccion<Atencion>; notas: Seccion<Notas>;
    sucursales: Seccion<SaldosSucursales>; externos: Seccion<SaldosExternos & { anterior: number | null }>;
    aperturas: Seccion<Apertura[]>; sinClasificar: string[] };
  export function calcularReporte(l: Lectura, cfg: ConfigReporte, lunes: string, corte: string, leidoEn: string, fotoAnterior: Foto | null): Reporte;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// supabase/functions/_shared/reporte/reporte_test.ts
import { assertEquals } from "@std/assert";
import { calcularReporte, type Lectura } from "./reporte.ts";
import { configReporteDef } from "./config.ts";

const ok = <T>(datos: T) => ({ ok: true as const, datos });
const base: Lectura = { facturas: ok([]), paquetes: ok([]), ovs: ok([]), descripciones: ok({}), notas: ok([]), pendientes: ok([]) };

Deno.test("calcularReporte: una lectura fallida solo apaga sus secciones", () => {
  const r = calcularReporte({ ...base, notas: { ok: false, error: "Zoho 429" } }, configReporteDef(), "2026-11-16", "2026-11-23", "2026-11-23T10:00:00Z", null);
  assertEquals(r.notas, { ok: false, error: "Zoho 429" });
  assertEquals(r.ventas.ok, true);
  assertEquals(r.fin, "2026-11-22");
});

Deno.test("calcularReporte: paquetes fallidos apagan surtido y aperturas pero no atención", () => {
  const r = calcularReporte({ ...base, paquetes: { ok: false, error: "x" } }, configReporteDef(), "2026-11-16", "2026-11-23", "t", null);
  assertEquals([r.surtido.ok, r.aperturas.ok, r.atencion.ok], [false, false, true]);
});

Deno.test("calcularReporte: anterior de la foto y valores sin clasificar", () => {
  const r = calcularReporte({
    ...base,
    facturas: ok([{ numero: "F", ov: "", fecha: "2026-11-17", vence: "", cliente: "X", sucursal: "", tipoEnvio: "Nuevo tipo", total: 1, saldo: 0, estado: "paid" }]),
    ovs: ok([{ id: "1", numero: "A", fecha: "2026-11-17", cliente: "X", sucursal: "", tipoEnvio: "Ordinario", incidencia: "Raro", resolucion: "", estado: "open", estadoEnvio: "" }]),
  }, configReporteDef(), "2026-11-16", "2026-11-23", "t", { externos: 266433.05, creditos: 0, interna: 0 });
  assertEquals(r.externos.ok && r.externos.datos.anterior, 266433.05);
  assertEquals(r.sinClasificar, ["Tipo de envío: Nuevo tipo", "Tipo de incidencia: Raro"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/reporte/reporte_test.ts`
Expected: FAIL — `Module not found "./reporte.ts"`.

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/reporte/reporte.ts
import { type ConfigReporte, SIN_CLASIFICAR, tipoEnvio } from "./config.ts";
import { finSemana } from "./fechas.ts";
import { type Apertura, type Atencion, calcularAperturas, calcularAtencion, calcularNotas, type Notas } from "./atencion.ts";
import { calcularSaldosExternos, calcularSaldosSucursales, type Foto, type SaldosExternos, type SaldosSucursales } from "./saldos.ts";
import { calcularSurtido, origenIncidencia, type Surtido } from "./surtido.ts";
import type { Factura, NotaCredito, Ov, Paquete, Seccion } from "./tipos.ts";
import { calcularVentas, type Ventas } from "./ventas.ts";

export type Lectura = {
  facturas: Seccion<Factura[]>; paquetes: Seccion<Paquete[]>; ovs: Seccion<Ov[]>;
  descripciones: Seccion<Record<string, string>>; notas: Seccion<NotaCredito[]>; pendientes: Seccion<Factura[]>;
};
export type Reporte = {
  lunes: string; fin: string; corte: string; leidoEn: string;
  ventas: Seccion<Ventas>; surtido: Seccion<Surtido>; atencion: Seccion<Atencion>; notas: Seccion<Notas>;
  sucursales: Seccion<SaldosSucursales>; externos: Seccion<SaldosExternos & { anterior: number | null }>;
  aperturas: Seccion<Apertura[]>; sinClasificar: string[];
};

// deno-lint-ignore no-explicit-any
function con<T>(fuentes: Seccion<any>[], fn: () => T): Seccion<T> {
  const mal = fuentes.find((s) => !s.ok);
  if (mal && !mal.ok) return { ok: false, error: mal.error };
  try { return { ok: true, datos: fn() }; }
  catch (e) { return { ok: false, error: `No se pudo calcular: ${String((e as Error)?.message ?? e)}` }; }
}

export function calcularReporte(l: Lectura, cfg: ConfigReporte, lunes: string, corte: string, leidoEn: string, fotoAnterior: Foto | null): Reporte {
  const d = <T>(s: Seccion<T>) => (s.ok ? s.datos : ([] as unknown as T));
  const sin = new Set<string>();
  for (const f of d(l.facturas)) if (tipoEnvio(f.tipoEnvio) === SIN_CLASIFICAR) sin.add(`Tipo de envío: ${f.tipoEnvio.trim() || "(vacío)"}`);
  for (const o of d(l.ovs)) if (origenIncidencia(o.incidencia) === "otro") sin.add(`Tipo de incidencia: ${o.incidencia.trim()}`);
  return {
    lunes, fin: finSemana(lunes), corte, leidoEn,
    ventas: con([l.facturas], () => calcularVentas(d(l.facturas), cfg, lunes)),
    surtido: con([l.ovs, l.paquetes], () => calcularSurtido(d(l.ovs), d(l.paquetes), cfg, lunes)),
    atencion: con([l.ovs, l.descripciones], () => calcularAtencion(d(l.ovs), d(l.descripciones), cfg, lunes)),
    notas: con([l.notas], () => calcularNotas(d(l.notas), lunes)),
    sucursales: con([l.pendientes], () => calcularSaldosSucursales(d(l.pendientes), cfg, corte)),
    externos: con([l.pendientes], () => ({ ...calcularSaldosExternos(d(l.pendientes), cfg, corte), anterior: fotoAnterior?.externos ?? null })),
    aperturas: con([l.ovs, l.paquetes], () => calcularAperturas(d(l.ovs), d(l.paquetes), cfg, lunes)),
    sinClasificar: [...sin].sort(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/reporte/reporte_test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/reporte/reporte.ts supabase/functions/_shared/reporte/reporte_test.ts
git commit -m "feat(reporte-semanal): reporte completo con secciones independientes"
```

---

### Task 7: Lectura de Zoho, migración y Edge Function

**Files:**
- Create: `supabase/functions/_shared/reporte/zohoReporte.ts`
- Test: `supabase/functions/_shared/reporte/zohoReporte_test.ts`
- Create: `supabase/migrations/20261125000097_comercializadora_reporte_semanal.sql`
- Create: `supabase/functions/zoho-reporte-semanal/servicio.ts`
- Create: `supabase/functions/zoho-reporte-semanal/servicio_test.ts`
- Create: `supabase/functions/zoho-reporte-semanal/index.ts`
- Modify: `supabase/config.toml` (después de `[functions.zoho-proveedor-minimo]`)

**Interfaces:**
- Consumes: `ZohoClient` de `../zoho.ts` (`get`, `listAll`), `admin`, `lanzar`, `responder` de `../db.ts`, `autorizado` de `../acceso.ts`, `hoyCdmx` de `../fechas.ts`, `calcularReporte`, `casosAtencion`, `normalizarConfigReporte`, `fotoDe`.
- Produces:
  ```ts
  // zohoReporte.ts
  export function aFactura(x: any): Factura; export function aPaquete(x: any): Paquete; export function aOv(x: any): Ov;
  export function aNota(x: any): NotaCredito; export function descripcionDe(detalle: any): string;
  export async function leerZoho(z: ZohoClient, cfg: ConfigReporte, lunes: string): Promise<Lectura>;
  // servicio.ts
  export function validarSemana(x: unknown): string;          // lanza Error("Semana no válida…")
  export function usarCache(c: { leido_en: string } | null, cfgActualizado: string | null, ahora: Date, forzar: boolean): boolean;
  export type Respuesta = { reporte: Reporte; cache: boolean; aviso: string | null };
  export async function generar(db: SupabaseClient, zoho: () => ZohoClient, ahora: Date, body: { semana?: unknown; forzar?: unknown }): Promise<Respuesta>;
  ```
  Respuesta HTTP: `{ ok: true, reporte, cache, aviso }` o `{ ok: false, error }`.

- [ ] **Step 1: Write the failing tests**

```ts
// supabase/functions/_shared/reporte/zohoReporte_test.ts
import { assertEquals } from "@std/assert";
import { ZohoClient } from "../zoho.ts";
import { aFactura, aNota, aOv, aPaquete, descripcionDe, leerZoho } from "./zohoReporte.ts";
import { configReporteDef } from "./config.ts";

Deno.test("mapeos desde el JSON de Zoho Books", () => {
  assertEquals(aFactura({ invoice_number: "COM-FAC-1", reference_number: "COM-OV-1", date: "2026-11-20", due_date: "2026-12-05",
    customer_name: "SUCURSALES THE COFFEE-ALEDEN", cf_sucursal: "Aleden ", cf_tipo_de_envio: "Ordinario", total: 760, balance: 760, status: "sent" }),
    { numero: "COM-FAC-1", ov: "COM-OV-1", fecha: "2026-11-20", vence: "2026-12-05", cliente: "SUCURSALES THE COFFEE-ALEDEN", sucursal: "Aleden", tipoEnvio: "Ordinario", total: 760, saldo: 760, estado: "sent" });
  assertEquals(aPaquete({ salesorder_number: "COM-OV-1", date: "2026-11-20", shipment_date: "" }), { ov: "COM-OV-1", fecha: "2026-11-20", envio: "" });
  assertEquals(aOv({ salesorder_id: "9", salesorder_number: "COM-OV-4883", date: "2026-11-17", customer_name: "VIRTUO", cf_sucursal: "Ávila Camacho ",
    cf_tipo_de_envio: "Ordinario", cf_tipo_de_incidencia: "Pedido Incompleto", cf_resoluci_n: "En Proceso", status: "invoiced", shipped_status: "partially_shipped" }).incidencia, "Pedido Incompleto");
  assertEquals(descripcionDe({ custom_fields: [{ api_name: "cf_descripci_n_incidencia", value: " Falta vaso " }] }), "Falta vaso");
  assertEquals(aNota({ creditnote_number: "CN-1", date: "2026-11-20", customer_name: "MOP", total: 196.04, status: "open",
    custom_fields: [{ api_name: "cf_sucursal", value: "Marina Vallarta" }], line_items: [{ description: "" }, { description: "Base neutra rota" }] }),
    { numero: "CN-1", fecha: "2026-11-20", cliente: "MOP", sucursal: "Marina Vallarta", total: 196.04, estado: "open", descripcion: "Base neutra rota" });
});

Deno.test("leerZoho: rangos de fechas, detalles solo de OVs de atención y fallas por fuente", async () => {
  const llamadas: string[] = [];
  const fetchFn = (url: string | URL | Request) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/token")) return Promise.resolve(new Response(JSON.stringify({ access_token: "t", expires_in: 3600 })));
    llamadas.push(`${u.pathname.replace("/books/v3", "")}?${u.searchParams.get("date_start") ?? ""}`);
    const j = (b: unknown) => Promise.resolve(new Response(JSON.stringify({ code: 0, ...b as object, page_context: { has_more_page: false } })));
    if (u.pathname.endsWith("/creditnotes")) return Promise.resolve(new Response(JSON.stringify({ code: 57, message: "falla" }), { status: 400 }));
    if (u.pathname.endsWith("/salesorders")) return j({ salesorders: [
      { salesorder_id: "1", salesorder_number: "A", date: "2026-11-17", customer_name: "X", cf_tipo_de_incidencia: "Pedido Incompleto", cf_resoluci_n: "En Proceso", status: "open" },
      { salesorder_id: "2", salesorder_number: "B", date: "2026-11-17", customer_name: "X", status: "open" }] });
    if (u.pathname.endsWith("/salesorders/1")) return j({ salesorder: { custom_fields: [{ api_name: "cf_descripci_n_incidencia", value: "falta" }] } });
    return j({ invoices: [], packages: [] });
  };
  const z = new ZohoClient({ clientId: "c", clientSecret: "s", refreshToken: "r", orgId: "o", fetchFn: fetchFn as typeof fetch, sleep: () => Promise.resolve(), soloLectura: true });
  const l = await leerZoho(z, configReporteDef(), "2026-11-16");
  assertEquals(l.descripciones, { ok: true, datos: { "1": "falta" } });
  assertEquals(l.notas.ok, false);
  assertEquals(l.facturas.ok, true);
  assertEquals(llamadas.includes("/invoices?2026-10-19"), true);
  assertEquals(llamadas.includes("/salesorders?2026-09-17"), true);
  assertEquals(llamadas.filter((c) => c.startsWith("/salesorders/")), ["/salesorders/1?"]);
});
```

```ts
// supabase/functions/zoho-reporte-semanal/servicio_test.ts
import { assertEquals, assertThrows } from "@std/assert";
import { usarCache, validarSemana } from "./servicio.ts";

Deno.test("validarSemana: solo lunes ISO", () => {
  assertEquals(validarSemana("2026-11-16"), "2026-11-16");
  assertThrows(() => validarSemana("2026-11-18"), Error, "Semana no válida");
  assertThrows(() => validarSemana(undefined), Error, "Semana no válida");
});

Deno.test("usarCache: 15 minutos, sin forzar y posterior al último cambio de configuración", () => {
  const ahora = new Date("2026-11-24T12:00:00Z");
  const c = { leido_en: "2026-11-24T11:50:00Z" };
  assertEquals(usarCache(c, null, ahora, false), true);
  assertEquals(usarCache(c, null, ahora, true), false);
  assertEquals(usarCache({ leido_en: "2026-11-24T11:40:00Z" }, null, ahora, false), false);
  assertEquals(usarCache(c, "2026-11-24T11:55:00Z", ahora, false), false);
  assertEquals(usarCache(null, null, ahora, false), false);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/reporte/zohoReporte_test.ts supabase/functions/zoho-reporte-semanal/servicio_test.ts`
Expected: FAIL — módulos no encontrados.

- [ ] **Step 3: Write `zohoReporte.ts`**

```ts
// supabase/functions/_shared/reporte/zohoReporte.ts
// Solo Edge: importa el cliente de Zoho. El portal NO importa este archivo.
import type { ZohoClient } from "../zoho.ts";
import { casosAtencion } from "./atencion.ts";
import type { ConfigReporte } from "./config.ts";
import { finSemana, sumar } from "./fechas.ts";
import type { Lectura } from "./reporte.ts";
import type { Factura, NotaCredito, Ov, Paquete, Seccion } from "./tipos.ts";

// deno-lint-ignore no-explicit-any
type J = any;
const s = (x: unknown) => String(x ?? "").trim();
const n = (x: unknown) => Number(x) || 0;
const cf = (d: J, api: string) => s((d?.custom_fields ?? []).find((c: J) => c?.api_name === api)?.value);

export const aFactura = (x: J): Factura => ({
  numero: s(x.invoice_number), ov: s(x.reference_number), fecha: s(x.date), vence: s(x.due_date), cliente: s(x.customer_name),
  sucursal: s(x.cf_sucursal), tipoEnvio: s(x.cf_tipo_de_envio), total: n(x.total), saldo: n(x.balance), estado: s(x.status),
});
export const aPaquete = (x: J): Paquete => ({ ov: s(x.salesorder_number), fecha: s(x.date), envio: s(x.shipment_date) });
export const aOv = (x: J): Ov => ({
  id: s(x.salesorder_id), numero: s(x.salesorder_number), fecha: s(x.date), cliente: s(x.customer_name), sucursal: s(x.cf_sucursal),
  tipoEnvio: s(x.cf_tipo_de_envio), incidencia: s(x.cf_tipo_de_incidencia), resolucion: s(x.cf_resoluci_n),
  estado: s(x.status), estadoEnvio: s(x.shipped_status),
});
export const descripcionDe = (d: J) => cf(d, "cf_descripci_n_incidencia");
export const aNota = (x: J): NotaCredito => ({
  numero: s(x.creditnote_number), fecha: s(x.date), cliente: s(x.customer_name), sucursal: s(x.cf_sucursal) || cf(x, "cf_sucursal"),
  total: n(x.total), estado: s(x.status), descripcion: s((x.line_items ?? []).find((l: J) => s(l?.description))?.description),
});

async function intentar<T>(fn: () => Promise<T>): Promise<Seccion<T>> {
  try { return { ok: true, datos: await fn() }; }
  catch (e) { return { ok: false, error: `Zoho no respondió: ${String((e as Error)?.message ?? e)}` }; }
}

/** De a pocos para no gastar la cuota de Zoho (100/min, compartida con zoho-sync). */
async function enLotes<T, R>(xs: T[], tam: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < xs.length; i += tam) out.push(...await Promise.all(xs.slice(i, i + tam).map(fn)));
  return out;
}

export async function leerZoho(z: ZohoClient, cfg: ConfigReporte, lunes: string): Promise<Lectura> {
  const fin = finSemana(lunes);
  const desdeOvs = sumar(lunes, -cfg.dias_incidencias);
  const facturas = await intentar(async () =>
    (await z.listAll<J>("/invoices", "invoices", { date_start: sumar(lunes, -28), date_end: fin })).map(aFactura));
  const paquetes = await intentar(async () =>
    (await z.listAll<J>("/packages", "packages", { date_start: desdeOvs, date_end: fin })).map(aPaquete));
  const ovs = await intentar(async () =>
    (await z.listAll<J>("/salesorders", "salesorders", { date_start: desdeOvs, date_end: fin })).map(aOv));
  const descripciones: Seccion<Record<string, string>> = ovs.ok
    ? await intentar(async () => {
      const casos = casosAtencion(ovs.datos, cfg, lunes);
      const pares = await enLotes(casos, 4, async (o) =>
        [o.id, descripcionDe((await z.get<J>(`/salesorders/${o.id}`)).salesorder)] as const);
      return Object.fromEntries(pares);
    })
    : { ok: false, error: ovs.error };
  const notas = await intentar(async () => {
    const lista = await z.listAll<J>("/creditnotes", "creditnotes", { date_start: lunes, date_end: fin });
    return enLotes(lista, 4, async (x) => aNota({ ...x, ...(await z.get<J>(`/creditnotes/${x.creditnote_id}`)).creditnote }));
  });
  const pendientes = await intentar(async () =>
    (await z.listAll<J>("/invoices", "invoices", { filter_by: "Status.Unpaid" })).map(aFactura));
  return { facturas, paquetes, ovs, descripciones, notas, pendientes };
}
```

- [ ] **Step 4: Write the migration**

```sql
-- supabase/migrations/20261125000097_comercializadora_reporte_semanal.sql
-- Reporte semanal en vivo desde Zoho (spec 2026-11-25-reporte-semanal-comercializadora-design.md §2 y §5).
-- Solo la Edge Function zoho-reporte-semanal (service role) escribe caché y fotos; la configuración la editan los editores.

create table public.com_reporte_config (
  id int primary key default 1 check (id = 1),
  config jsonb not null default '{}'::jsonb,
  actualizado_por uuid,
  actualizado_at timestamptz not null default now()
);
insert into public.com_reporte_config (id) values (1);

create function public.com_reporte_config_sello() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.actualizado_por := auth.uid();
  new.actualizado_at := now();
  return new;
end $$;
create trigger com_reporte_config_sello before update on public.com_reporte_config
  for each row execute function public.com_reporte_config_sello();

create table public.com_reporte_semanal_cache (
  semana date primary key,
  datos jsonb not null,
  leido_en timestamptz not null default now()
);

-- Foto de saldos tomada la primera vez que se lee el reporte en cada semana (semana = lunes del día de lectura).
create table public.com_reporte_saldos (
  semana date primary key,
  externos numeric not null,
  creditos numeric not null,
  interna numeric not null,
  guardado_en timestamptz not null default now()
);

alter table public.com_reporte_config enable row level security;
alter table public.com_reporte_semanal_cache enable row level security;
alter table public.com_reporte_saldos enable row level security;
revoke all on public.com_reporte_config, public.com_reporte_semanal_cache, public.com_reporte_saldos from anon, authenticated;
grant all on public.com_reporte_config, public.com_reporte_semanal_cache, public.com_reporte_saldos to service_role;
grant select on public.com_reporte_config, public.com_reporte_semanal_cache, public.com_reporte_saldos to authenticated;
grant update (config) on public.com_reporte_config to authenticated;
create policy lectura on public.com_reporte_config for select to authenticated using ((select public.com_puede_leer()));
create policy edicion on public.com_reporte_config for update to authenticated
  using ((select public.com_puede_editar())) with check ((select public.com_puede_editar()));
create policy lectura on public.com_reporte_semanal_cache for select to authenticated using ((select public.com_puede_leer()));
create policy lectura on public.com_reporte_saldos for select to authenticated using ((select public.com_puede_leer()));
```

- [ ] **Step 5: Write `servicio.ts` and `index.ts`**

```ts
// supabase/functions/zoho-reporte-semanal/servicio.ts
import type { SupabaseClient } from "../_shared/db.ts";
import { hoyCdmx } from "../_shared/fechas.ts";
import type { ZohoClient } from "../_shared/zoho.ts";
import { normalizarConfigReporte } from "../_shared/reporte/config.ts";
import { esLunes, lunesDe, sumar } from "../_shared/reporte/fechas.ts";
import { calcularReporte, type Reporte } from "../_shared/reporte/reporte.ts";
import { type Foto, fotoDe } from "../_shared/reporte/saldos.ts";
import { leerZoho } from "../_shared/reporte/zohoReporte.ts";

const VIGENCIA_MS = 15 * 60_000;
export type Respuesta = { reporte: Reporte; cache: boolean; aviso: string | null };

export function validarSemana(x: unknown): string {
  if (!esLunes(x)) throw new Error("Semana no válida: manda la fecha del lunes (YYYY-MM-DD).");
  return x;
}

export function usarCache(c: { leido_en: string } | null, cfgActualizado: string | null, ahora: Date, forzar: boolean): boolean {
  if (!c || forzar) return false;
  const t = Date.parse(c.leido_en);
  if (ahora.getTime() - t >= VIGENCIA_MS) return false;
  return !cfgActualizado || t > Date.parse(cfgActualizado);
}

const minutos = (desde: string, ahora: Date) => Math.max(0, Math.round((ahora.getTime() - Date.parse(desde)) / 60_000));

export async function generar(db: SupabaseClient, zoho: () => ZohoClient, ahora: Date, body: { semana?: unknown; forzar?: unknown }): Promise<Respuesta> {
  const lunes = validarSemana(body.semana);
  const [cfgR, cacheR] = await Promise.all([
    db.from("com_reporte_config").select("config,actualizado_at").eq("id", 1).maybeSingle(),
    db.from("com_reporte_semanal_cache").select("datos,leido_en").eq("semana", lunes).maybeSingle(),
  ]);
  if (cfgR.error) throw cfgR.error;
  const cfg = normalizarConfigReporte(cfgR.data?.config);
  const cache = cacheR.data as { datos: Reporte; leido_en: string } | null;
  if (usarCache(cache, cfgR.data?.actualizado_at ?? null, ahora, body.forzar === true)) return { reporte: cache!.datos, cache: true, aviso: null };

  const corte = hoyCdmx(ahora);
  const lectura = await leerZoho(zoho(), cfg, lunes);
  const fuentes = Object.values(lectura);
  if (fuentes.every((f) => !f.ok)) {
    const f0 = fuentes[0];
    const error = f0.ok ? "" : f0.error;
    if (cache) return { reporte: cache.datos, cache: true, aviso: `Datos de hace ${minutos(cache.leido_en, ahora)} min; ${error}` };
    throw new Error(error);
  }

  const semanaFoto = lunesDe(corte);
  const anterior = await db.from("com_reporte_saldos").select("externos,creditos,interna").eq("semana", sumar(semanaFoto, -7)).maybeSingle();
  const reporte = calcularReporte(lectura, cfg, lunes, corte, ahora.toISOString(), (anterior.data as Foto | null) ?? null);
  if (reporte.externos.ok) {
    await db.from("com_reporte_saldos").upsert({ semana: semanaFoto, ...fotoDe(reporte.externos.datos) }, { onConflict: "semana", ignoreDuplicates: true });
  }
  await db.from("com_reporte_semanal_cache").upsert({ semana: lunes, datos: reporte, leido_en: ahora.toISOString() }, { onConflict: "semana" });
  return { reporte, cache: false, aviso: null };
}
```

```ts
// supabase/functions/zoho-reporte-semanal/index.ts
import { autorizado } from "../_shared/acceso.ts";
import { admin, lanzar, responder } from "../_shared/db.ts";
import { zohoDesdeEnv } from "../_shared/zoho.ts";
import { generar } from "./servicio.ts";

// Solo lectura: arma el reporte semanal desde Zoho Books (spec 2026-11-25-reporte-semanal-comercializadora-design.md).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return responder(null);
  if (!autorizado(req)) return responder({ ok: false, error: "No autorizado" }, 401);
  const body = await req.json().catch(() => ({}));
  return lanzar(() => generar(admin(), zohoDesdeEnv, new Date(), body));
});
```

Agrega a `supabase/config.toml`, justo después del bloque `[functions.zoho-proveedor-minimo]`:

```toml
[functions.zoho-reporte-semanal]
verify_jwt = false
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/reporte/ supabase/functions/zoho-reporte-semanal/`
Expected: PASS (todas las pruebas de `reporte/` y `servicio_test.ts`).
Run: `deno check --config supabase/functions/deno.json supabase/functions/zoho-reporte-semanal/index.ts`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/_shared/reporte/zohoReporte.ts supabase/functions/_shared/reporte/zohoReporte_test.ts supabase/functions/zoho-reporte-semanal/ supabase/migrations/20261125000097_comercializadora_reporte_semanal.sql supabase/config.toml
git commit -m "feat(reporte-semanal): Edge Function de solo lectura con caché y foto de saldos"
```

---

### Task 8: Prueba de paridad contra el reporte del 16–22 nov

**Files:**
- Create: `supabase/functions/_shared/pruebas/reporte-2026-11-16.json` (datos capturados)
- Test: `supabase/functions/_shared/reporte/paridad_test.ts`
- Modify: `docs/superpowers/specs/2026-11-25-reporte-semanal-comercializadora-design.md` (§7, diferencias explicadas)

**Interfaces:**
- Consumes: `aFactura`, `aPaquete`, `aOv`, `aNota`, `calcularReporte`, `configReporteDef`.

- [ ] **Step 1: Capturar los datos de Zoho**

Con una sesión de Zoho Books abierta en el navegador del portal (org `891749429`), ejecuta en la consola de `https://books.zoho.com/app/891749429` el siguiente script (solo GET). Guarda el JSON resultante como `supabase/functions/_shared/pruebas/reporte-2026-11-16.json`. Deja solo los campos que usan los mapeos (sin correos ni direcciones):

```js
const g=async p=>(await fetch('/api/v3/'+p+(p.includes('?')?'&':'?')+'organization_id=891749429',{credentials:'include',headers:{'X-ZB-SOURCE':'zbclient','X-Requested-With':'XMLHttpRequest'}})).json();
const todo=async(p,k)=>{let o=[];for(let i=1;;i++){const r=await g(p+'&per_page=200&page='+i);o=o.concat(r[k]||[]);if(!r.page_context?.has_more_page)return o}};
const pick=(x,ks)=>Object.fromEntries(ks.map(k=>[k,x[k]]));
const F=['invoice_number','reference_number','date','due_date','customer_name','cf_sucursal','cf_tipo_de_envio','total','balance','status'];
const O=['salesorder_id','salesorder_number','date','customer_name','cf_sucursal','cf_tipo_de_envio','cf_tipo_de_incidencia','cf_resoluci_n','status','shipped_status'];
const facturas=(await todo('invoices?date_start=2026-10-19&date_end=2026-11-22','invoices')).map(x=>pick(x,F));
const paquetes=(await todo('packages?date_start=2026-09-17&date_end=2026-11-22','packages')).map(x=>pick(x,['salesorder_number','date','shipment_date']));
const ovs=(await todo('salesorders?date_start=2026-09-17&date_end=2026-11-22','salesorders')).map(x=>pick(x,O));
const desc={};for(const o of ovs.filter(o=>o.cf_tipo_de_incidencia)){const d=(await g('salesorders/'+o.salesorder_id)).salesorder;desc[o.salesorder_id]=(d.custom_fields.find(c=>c.api_name==='cf_descripci_n_incidencia')||{}).value||''}
const notas=[];for(const x of await todo('creditnotes?date_start=2026-11-16&date_end=2026-11-22','creditnotes')){const d=(await g('creditnotes/'+x.creditnote_id)).creditnote;notas.push({creditnote_number:x.creditnote_number,date:x.date,customer_name:x.customer_name,total:x.total,status:x.status,custom_fields:(d.custom_fields||[]).map(c=>({api_name:c.api_name,value:c.value})),line_items:d.line_items.map(l=>({description:l.description}))})}
const pendientes=(await todo('invoices?filter_by=Status.Unpaid','invoices')).map(x=>pick(x,F));
copy(JSON.stringify({capturado:new Date().toISOString(),facturas,paquetes,ovs,descripciones:desc,notas,pendientes}));
```

Nota: los saldos (`pendientes`) son los del día de captura, no los del 23 nov; por eso la prueba de saldos compara contra el total que dé la captura y se documenta la diferencia con $213,637.69.

- [ ] **Step 2: Write the parity test**

```ts
// supabase/functions/_shared/reporte/paridad_test.ts
import { assertEquals, assertAlmostEquals } from "@std/assert";
import { aFactura, aNota, aOv, aPaquete } from "./zohoReporte.ts";
import { calcularReporte } from "./reporte.ts";
import { configReporteDef } from "./config.ts";

const d = JSON.parse(await Deno.readTextFile(new URL("../pruebas/reporte-2026-11-16.json", import.meta.url)));
const ok = <T>(datos: T) => ({ ok: true as const, datos });
const cfg = { ...configReporteDef(), creditos_activos: [
  { cliente: "TANDEM CORPORATIVO EMPRESARIAL", sucursal: "Patio Santa Fe", nota: "apertura · crédito 6×6" },
  { cliente: "EMMANUEL ORTIZ LOPEZ", sucursal: "Paseo MS", nota: "crédito otorgado" },
] };
const r = calcularReporte({
  facturas: ok(d.facturas.map(aFactura)), paquetes: ok(d.paquetes.map(aPaquete)), ovs: ok(d.ovs.map(aOv)),
  descripciones: ok(d.descripciones), notas: ok(d.notas.map(aNota)), pendientes: ok(d.pendientes.map(aFactura)),
}, cfg, "2026-11-16", "2026-11-23", d.capturado, null);

Deno.test("paridad: ventas 16–22 nov", () => {
  if (!r.ventas.ok) throw new Error(r.ventas.error);
  assertAlmostEquals(r.ventas.datos.total, 1_193_333, 1);
  assertEquals(r.ventas.datos.pedidos, 97);
  assertEquals(r.ventas.datos.semanas.map((s) => Math.round(s.total)), [989_317, 1_107_714, 1_534_595, 1_266_935, 1_193_333]);
  assertEquals(r.ventas.datos.top[0].nombre, "Corporativo AP (MJA + SEJ)");
  assertAlmostEquals(r.ventas.datos.top[0].total, 398_424, 1);
});

Deno.test("paridad: calidad de surtido", () => {
  if (!r.surtido.ok) throw new Error(r.surtido.error);
  const s = r.surtido.datos;
  assertEquals([s.enviados, s.conFaltante, s.incidenciasTotal], [71, 33, 34]);
  assertEquals(s.casos, { stock: 29, pickeo: 4, paqueteria: 1, otro: 0 });
  assertEquals([s.envio.universo, s.envio.enMeta, s.envio.buckets], [55, 54, [8, 25, 21, 1]]);
});

Deno.test("paridad: notas de crédito", () => {
  if (!r.notas.ok) throw new Error(r.notas.error);
  assertEquals(r.notas.datos.filas.map((n) => n.numero), ["CN-00204", "CN-00203", "CN-00202", "CN-00201", "CN-00200"]);
  assertAlmostEquals(r.notas.datos.total, 3_357.73, 0.01);
});
```

- [ ] **Step 3: Run it**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/reporte/paridad_test.ts`
Expected: PASS. Si alguna cifra no cuadra, **no ajustes el número esperado**: investiga la OV/factura que difiere (compara listas de folios contra el HTML original en `C:\Users\sebcm\Downloads\Reporte Semanal · The Coffee · 16–22 Nov 2026.html`), corrige la regla en su módulo con una prueba unitaria nueva, o — si la diferencia es por datos que cambiaron en Zoho después del reporte (incidencias capturadas después) — documenta la diferencia en la spec §7 y cambia el esperado citando ese párrafo.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/_shared/pruebas/reporte-2026-11-16.json supabase/functions/_shared/reporte/paridad_test.ts docs/superpowers/specs/2026-11-25-reporte-semanal-comercializadora-design.md
git commit -m "test(reporte-semanal): paridad con el reporte del 16–22 nov 2026"
```

---

### Task 9: Pantalla del portal

**Files:**
- Modify: `lib/comercializadora/funciones.ts:3` (agregar `'zoho-reporte-semanal'` a `FuncionCom`)
- Create: `lib/comercializadora/reporteSemanal.ts`
- Test: `tests/comercializadora/reporteSemanal.test.ts`
- Modify: `app/(comercializadora)/comercializadora/acciones.ts` (acción `actualizarReporte`)
- Create: `app/(comercializadora)/comercializadora/reporte-semanal/page.tsx`
- Create: `components/comercializadora/reporte-semanal/piezas.tsx`
- Create: `components/comercializadora/reporte-semanal/ventas.tsx`
- Create: `components/comercializadora/reporte-semanal/surtido.tsx`
- Create: `components/comercializadora/reporte-semanal/atencion.tsx`
- Create: `components/comercializadora/reporte-semanal/saldos.tsx`
- Create: `components/comercializadora/reporte-semanal/actualizar.tsx`
- Modify: `components/portal/navegacion.tsx:193` (enlace en «Operación»)

**Interfaces:**
- Consumes: `invocarFuncion`, `Reporte` y tipos de secciones de `supabase/functions/_shared/reporte/*.ts`, `esLunes`, `lunesDe`, `sumar` de `supabase/functions/_shared/reporte/fechas.ts`, `hoyCdmx`, `fechaCorta` de `lib/comercializadora/fechas.ts`, `pesos` de `lib/comercializadora/formato.ts`, `Encabezado`, `Tarjeta` de `components/portal/piezas.tsx`.
- Produces:
  ```ts
  // lib/comercializadora/reporteSemanal.ts
  export type ResultadoReporte = { ok: true; reporte: Reporte; cache: boolean; aviso: string | null } | { ok: false; error: string };
  export function semanaPorDefecto(hoy: string): string;              // lunes de la semana cerrada anterior
  export function semanaDeUrl(x: unknown, hoy: string): string;       // valida o usa la de por defecto
  export async function leerReporteSemanal(semana: string, forzar?: boolean, deps?: Parameters<typeof invocarFuncion>[2]): Promise<ResultadoReporte>;
  // acciones.ts
  export async function actualizarReporte(semana: string): Promise<Resultado>;
  ```

- [ ] **Step 1: Read the Next docs**

Lee en `node_modules/next/dist/docs/` lo que corresponda a páginas con `searchParams` (Promise) y Server Actions con `revalidatePath`. Si algo difiere de lo usado en `app/(comercializadora)/comercializadora/indicadores/page.tsx`, sigue la guía y anótalo en el commit.

- [ ] **Step 2: Write the failing test**

```ts
// tests/comercializadora/reporteSemanal.test.ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { leerReporteSemanal, semanaDeUrl, semanaPorDefecto } from '@/lib/comercializadora/reporteSemanal';

describe('reporte semanal en el portal', () => {
  it('por defecto muestra la semana cerrada anterior', () => {
    expect(semanaPorDefecto('2026-11-25')).toBe('2026-11-16');
    expect(semanaPorDefecto('2026-11-23')).toBe('2026-11-16');
  });
  it('una semana inválida en la URL cae en la de por defecto', () => {
    expect(semanaDeUrl('2026-11-09', '2026-11-25')).toBe('2026-11-09');
    expect(semanaDeUrl('hola', '2026-11-25')).toBe('2026-11-16');
    expect(semanaDeUrl('2026-11-18', '2026-11-25')).toBe('2026-11-16');
  });
  it('invoca la función con la semana y forzar', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, reporte: { lunes: '2026-11-16' }, cache: false, aviso: null })));
    const r = await leerReporteSemanal('2026-11-16', true, { fetch, url: 'http://f', secreto: 's' });
    expect(r).toEqual({ ok: true, reporte: { lunes: '2026-11-16' }, cache: false, aviso: null });
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ semana: '2026-11-16', forzar: true });
  });
  it('propaga el error de la función', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'Zoho no respondió' }), { status: 500 }));
    expect(await leerReporteSemanal('2026-11-16', false, { fetch, url: 'http://f', secreto: 's' })).toEqual({ ok: false, error: 'Zoho no respondió' });
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/comercializadora/reporteSemanal.test.ts`
Expected: FAIL — no existe `@/lib/comercializadora/reporteSemanal`.

- [ ] **Step 4: Write `lib/comercializadora/reporteSemanal.ts` and register the function**

En `lib/comercializadora/funciones.ts` línea 3:

```ts
export type FuncionCom = 'com-minmax' | 'zoho-generar-oc' | 'zoho-sync' | 'zoho-proveedor-minimo' | 'zoho-reporte-semanal';
```

```ts
// lib/comercializadora/reporteSemanal.ts
import 'server-only';
import { invocarFuncion } from './funciones';
import type { Reporte } from '../../supabase/functions/_shared/reporte/reporte.ts';
import { esLunes, lunesDe, sumar } from '../../supabase/functions/_shared/reporte/fechas.ts';

export type ResultadoReporte =
  | { ok: true; reporte: Reporte; cache: boolean; aviso: string | null }
  | { ok: false; error: string };

export const semanaPorDefecto = (hoy: string) => sumar(lunesDe(hoy), -7);
export const semanaDeUrl = (x: unknown, hoy: string) => (esLunes(x) ? x : semanaPorDefecto(hoy));

/** Lee el reporte de la Edge Function (Zoho en vivo con caché de 15 min). */
export async function leerReporteSemanal(
  semana: string,
  forzar = false,
  deps?: Parameters<typeof invocarFuncion>[2],
): Promise<ResultadoReporte> {
  const r = await invocarFuncion('zoho-reporte-semanal', { semana, forzar }, { timeoutMs: 150_000, ...deps });
  if (!r.ok) return r;
  const d = r.datos as { reporte: Reporte; cache: boolean; aviso: string | null };
  return { ok: true, reporte: d.reporte, cache: d.cache, aviso: d.aviso ?? null };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/comercializadora/reporteSemanal.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Add the server action**

Al final de `app/(comercializadora)/comercializadora/acciones.ts`:

```ts
/** "Actualizar" del reporte semanal: vuelve a leer Zoho (solo lectura; cualquiera con acceso a Comercializadora). */
export async function actualizarReporte(semana: string): Promise<Resultado> {
  await sesionComercializadora(false);
  const r = await leerReporteSemanal(semana, true);
  revalidatePath('/comercializadora/reporte-semanal');
  return r.ok ? { ok: true } : { error: r.error };
}
```

y el import arriba: `import { leerReporteSemanal } from '@/lib/comercializadora/reporteSemanal';`

- [ ] **Step 7: Write the components**

```tsx
// components/comercializadora/reporte-semanal/piezas.tsx
import { cn } from 'cn';

export const porcentaje = (x: number | null, dec = 1) => (x == null ? '—' : `${(x * 100).toFixed(dec)}%`);
export const variacion = (x: number | null) =>
  x == null ? '—' : `${x >= 0 ? '▲' : '▼'} ${Math.abs(x * 100).toFixed(1)}%`;

export function SeccionTitulo({ num, children }: { num: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-center gap-2 first:mt-0">
      <span className="rounded bg-ink px-2 py-0.5 font-mono text-[10px] tracking-widest text-surface">{num}</span>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h2>
    </div>
  );
}

export function ErrorSeccion({ error }: { error: string }) {
  return (
    <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
      No se pudo leer esta sección: {error}
    </p>
  );
}

export function Meta({ cumple }: { cumple: boolean | null }) {
  if (cumple == null) return null;
  return (
    <span className={cn('ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', cumple ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad')}>
      {cumple ? '✓ En meta' : '✕ Fuera de meta'}
    </span>
  );
}

/** Lista larga plegable sin JavaScript: los primeros `visibles` y el resto en <details>. */
export function VerTodas<T>({ filas, visibles, render, etiqueta = 'Ver todas' }: {
  filas: T[]; visibles: number; render: (f: T, i: number) => React.ReactNode; etiqueta?: string;
}) {
  return (
    <>
      {filas.slice(0, visibles).map(render)}
      {filas.length > visibles && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-crema-strong">{etiqueta} ({filas.length})</summary>
          {filas.slice(visibles).map((f, i) => render(f, i + visibles))}
        </details>
      )}
    </>
  );
}
```

```tsx
// components/comercializadora/reporte-semanal/ventas.tsx
import { Tarjeta } from '@/components/portal/piezas';
import { pesos } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import type { Ventas } from '../../../supabase/functions/_shared/reporte/ventas.ts';
import { finSemana } from '../../../supabase/functions/_shared/reporte/fechas.ts';
import { variacion, VerTodas } from './piezas';

const TIPOS = ['Ordinario', 'Llenado de canal', 'Apertura'];

export function VentasVista({ v }: { v: Ventas }) {
  const max = Math.max(1, ...v.semanas.map((s) => s.total));
  return (
    <div className="grid gap-3">
      <Tarjeta>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Ventas de la semana</p>
            <p className="font-display text-4xl font-black tabular">{pesos(v.total)}</p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">MXN con IVA · ~{pesos(v.sinIva)} sin IVA (aprox.)</p>
          </div>
          <div className="text-right">
            <p className="font-display text-4xl font-black tabular">{v.pedidos}</p>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">pedidos facturados</p>
          </div>
        </div>
        <ol className="mt-4 divide-y divide-line">
          <VerTodas
            filas={v.top}
            visibles={5}
            etiqueta="Ver top clientes"
            render={(t, i) => (
              <li key={t.nombre} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-5 font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{t.nombre}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.sucursales.slice(0, 4).join(', ')}{t.sucursales.length > 4 ? ', y más' : ''}
                  </p>
                </div>
                <span className="font-mono tabular">{pesos(t.total)}</span>
              </li>
            )}
          />
        </ol>
      </Tarjeta>
      <Tarjeta titulo="Ventas · últimas 5 semanas" descripcion="Con IVA, por tipo de envío. Sin las exclusiones configuradas.">
        <div className="grid grid-cols-5 items-end gap-2">
          {v.semanas.map((s, i) => (
            <div key={s.lunes} className="text-center">
              <div className="mx-auto flex h-32 w-full max-w-14 flex-col-reverse overflow-hidden rounded-md bg-surface-2">
                {TIPOS.map((t, k) => (
                  <div
                    key={t}
                    title={`${t}: ${pesos(s.porTipo[t] ?? 0)}`}
                    className={['bg-ink', 'bg-crema-strong', 'bg-ok'][k]}
                    style={{ height: `${((s.porTipo[t] ?? 0) / max) * 100}%` }}
                  />
                ))}
              </div>
              <p className="mt-1 font-mono text-[11px] tabular">{pesos(s.total)}</p>
              <p className="text-[10px] text-muted-foreground">{fechaCorta(s.lunes)}–{fechaCorta(finSemana(s.lunes))}</p>
              <p className="text-[10px]">{i === 0 ? '—' : variacion(v.semanas[i - 1].total ? (s.total - v.semanas[i - 1].total) / v.semanas[i - 1].total : null)}</p>
            </div>
          ))}
        </div>
        <ul className="mt-3 flex gap-4 text-[11px] text-muted-foreground">
          {TIPOS.map((t, k) => (
            <li key={t} className="flex items-center gap-1">
              <span className={['bg-ink', 'bg-crema-strong', 'bg-ok'][k] + ' size-2 rounded-sm'} aria-hidden="true" /> {t}
            </li>
          ))}
        </ul>
        <dl className="mt-3 grid gap-1 text-sm">
          <div>Vs semana anterior: <strong className="tabular">{pesos(v.difAnterior)}</strong> {variacion(v.vsAnterior)}</div>
          <div>Solo ordinario: <strong className="tabular">{pesos(v.difAnteriorOrdinario)}</strong> {variacion(v.vsAnteriorOrdinario)}</div>
          <div>Promedio 5 semanas: <strong className="tabular">{pesos(v.promedio)}</strong> · esta semana {variacion(v.vsPromedio)}</div>
        </dl>
      </Tarjeta>
    </div>
  );
}
```

```tsx
// components/comercializadora/reporte-semanal/surtido.tsx
import { Tarjeta } from '@/components/portal/piezas';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import type { Origen, Surtido, Indicador } from '../../../supabase/functions/_shared/reporte/surtido.ts';
import { Meta, porcentaje } from './piezas';

const ORIGEN: Record<Origen, string> = {
  stock: 'Error de surtido (falta de stock)', pickeo: 'Error de pickeo', paqueteria: 'Paquetería', otro: 'Sin clasificar',
};

function Ind({ titulo, i, meta, nota }: { titulo: string; i: Indicador; meta: string; nota: string }) {
  return (
    <Tarjeta>
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{titulo}</p>
      <p className="mt-1 font-display text-3xl font-black tabular">{porcentaje(i.valor)}<Meta cumple={i.cumple} /></p>
      <p className="mt-1 text-xs text-muted-foreground">Meta: {meta}</p>
      <p className="text-xs text-muted-foreground">{nota}</p>
    </Tarjeta>
  );
}

export function SurtidoVista({ s }: { s: Surtido }) {
  const m = (i: Indicador, signo: string) => `${signo}${i.meta}%`;
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">{s.enviados} pedidos enviados en la semana</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Ind titulo="Fill rate" i={s.fill} meta={m(s.fill, '≥')} nota={`${s.conFaltante} de ${s.enviados} pedidos con faltante`} />
        <Ind titulo="Faltante / tardío por stock" i={s.stock} meta={m(s.stock, '≤')} nota={`${s.casos.stock} pedido(s) con incidencia de stock`} />
        <Ind titulo="Precisión de pickeo" i={s.pickeo} meta={m(s.pickeo, '≥')} nota={`${s.casos.pickeo} casos de error de pickeo`} />
        <Ind titulo="Calidad física" i={s.fisica} meta={m(s.fisica, '≤')} nota={`${s.casos.paqueteria} pedido(s) con incidencia de paquetería`} />
      </div>
      <Tarjeta>
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Envío en tiempo</p>
        <p className="mt-1 font-display text-3xl font-black tabular">{porcentaje(s.envio.valor)}<Meta cumple={s.envio.cumple} /></p>
        <p className="mt-1 text-xs text-muted-foreground">
          {s.envio.enMeta} de {s.envio.universo} pedidos foráneos · mismo día: {s.envio.buckets[0]} · 1 día: {s.envio.buckets[1]} · 2 días: {s.envio.buckets[2]} · más de 2: {s.envio.buckets[3]}
        </p>
        {s.envio.fuera.map((f) => (
          <p key={f.ov} className="text-xs text-bad">Fuera de meta: {f.sucursal} {f.ov} ({fechaCorta(f.fecha)} → {fechaCorta(f.envio)}, {f.dias} días)</p>
        ))}
      </Tarjeta>
      <Tarjeta titulo={`Incidencias por origen · ${s.incidenciasTotal} en total (${porcentaje(s.enviados ? s.incidenciasTotal / s.enviados : null)} de los pedidos)`}>
        <div className="grid gap-3 sm:grid-cols-3">
          {(['stock', 'pickeo', 'paqueteria'] as Origen[]).map((o) => (
            <div key={o}>
              <p className="font-display text-2xl font-black tabular">{s.casos[o]}</p>
              <p className="text-sm">{ORIGEN[o]}</p>
              <p className="text-xs text-muted-foreground">{porcentaje(s.incidenciasTotal ? s.casos[o] / s.incidenciasTotal : null, 0)} de las incidencias</p>
            </div>
          ))}
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-semibold text-crema-strong">Ver todas ({s.incidencias.length})</summary>
          <div className="overflow-x-auto">
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground"><th className="py-1">OV</th><th>Sucursal</th><th>Origen</th><th>Estatus</th></tr></thead>
              <tbody>
                {s.incidencias.map((f) => (
                  <tr key={f.ov} className="border-t border-line">
                    <td className="py-1 font-mono text-xs">{f.ov}</td><td>{f.sucursal}</td><td>{ORIGEN[f.origen]}</td><td>{f.resolucion || 'Abierta'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </Tarjeta>
    </div>
  );
}
```

Regla para todas las tablas: el plegado (`<details>`) va alrededor de la tabla, nunca dentro de `<tbody>`. `VerTodas` solo se usa con listas (`<li>`).

```tsx
// components/comercializadora/reporte-semanal/atencion.tsx
import { Tarjeta } from '@/components/portal/piezas';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import { pesos } from '@/lib/comercializadora/formato';
import type { Apertura, Atencion, GrupoAtencion, Notas } from '../../../supabase/functions/_shared/reporte/atencion.ts';
import { finSemana } from '../../../supabase/functions/_shared/reporte/fechas.ts';

function Grupo({ titulo, g }: { titulo: string; g: GrupoAtencion }) {
  return (
    <Tarjeta titulo={titulo} descripcion={`${g.abiertas} abiertas · ${g.resueltasSemana} resueltas esta semana`}>
      {g.semanas.length === 0 && <p className="text-sm text-ok">Sin incidencias abiertas.</p>}
      {g.semanas.map((s) => (
        <div key={s.lunes} className="mb-3">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Semana {fechaCorta(s.lunes)} – {fechaCorta(finSemana(s.lunes))}
          </p>
          <ul className="divide-y divide-line">
            {s.casos.map((c) => (
              <li key={c.ov} className="py-2 text-sm">
                <p className="font-medium">
                  {c.sucursal || c.cliente}{c.sucursal ? <span className="text-muted-foreground"> ({c.cliente})</span> : null}
                  <span className="ml-2 font-mono text-[10px] text-muted-foreground">{c.ov}</span>
                </p>
                <p className="text-xs">
                  {c.tipo} · <span className={c.resuelto ? 'text-ok' : 'text-bad'}>{c.resolucion}</span>
                </p>
                {c.descripcion && <p className="whitespace-pre-line text-xs text-muted-foreground">{c.descripcion}</p>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </Tarjeta>
  );
}

export function AtencionVista({ a }: { a: Atencion }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Grupo titulo="Sucursales propias" g={a.propias} />
      <Grupo titulo="Clientes externos" g={a.externos} />
    </div>
  );
}

export function NotasVista({ n }: { n: Notas }) {
  return (
    <Tarjeta titulo="Notas de crédito">
      {n.filas.length === 0 ? <p className="text-sm text-muted-foreground">Sin notas de crédito esta semana.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground"><th className="py-1">Folio</th><th>Cliente</th><th>Descripción</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {n.filas.map((f) => (
                <tr key={f.numero} className="border-t border-line align-top">
                  <td className="py-1 font-mono text-xs">{f.numero}</td>
                  <td>{f.cliente}{f.sucursal ? <span className="block text-xs text-muted-foreground">{f.sucursal}</span> : null}</td>
                  <td className="text-xs">{f.descripcion}</td>
                  <td className="text-right font-mono tabular">{pesos(f.total)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-ink font-semibold"><td colSpan={3} className="py-1">Total NC</td><td className="text-right font-mono tabular">{pesos(n.total)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

export function AperturasVista({ a }: { a: Apertura[] }) {
  return (
    <Tarjeta>
      {a.length === 0 ? <p className="text-sm text-muted-foreground">Sin aperturas en curso.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground"><th className="py-1">Sucursal</th><th>Franquiciatario</th><th>OV</th><th>Pedido</th><th>Estatus</th></tr></thead>
            <tbody>
              {a.map((x) => (
                <tr key={x.ov} className="border-t border-line">
                  <td className="py-1">{x.sucursal}</td><td>{x.cliente}</td><td className="font-mono text-xs">{x.ov}</td>
                  <td>{fechaCorta(x.fecha)}</td><td>{x.envio ? `Enviado ${fechaCorta(x.envio)}` : 'Por enviar'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}
```

```tsx
// components/comercializadora/reporte-semanal/saldos.tsx
import { Tarjeta } from '@/components/portal/piezas';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import { pesos } from '@/lib/comercializadora/formato';
import type { SaldoCliente, SaldosExternos, SaldosSucursales } from '../../../supabase/functions/_shared/reporte/saldos.ts';

export function SucursalesVista({ s, excluidas }: { s: SaldosSucursales; excluidas: string[] }) {
  const tabla = (filas: SaldosSucursales['filas']) => (
    <table className="w-full text-sm">
      <thead><tr className="text-right text-[10px] uppercase tracking-wider text-muted-foreground"><th className="py-1 text-left">Sucursal</th><th>Dentro de crédito</th><th>Fuera de crédito</th></tr></thead>
      <tbody>
        {filas.map((f) => (
          <tr key={f.sucursal} className="border-t border-line text-right">
            <td className="py-1 text-left">{f.sucursal}</td>
            <td className="font-mono tabular text-ok">{pesos(f.dentro)}</td>
            <td className="font-mono tabular text-bad">{pesos(f.fueraAnio + f.anteriores)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <Tarjeta titulo="Saldos · The Coffee Sucursales" descripcion={`${excluidas.length ? `Excluye ${excluidas.join(', ')} · ` : ''}${s.facturas} facturas abiertas`}>
      <p className="font-display text-3xl font-black tabular">{pesos(s.total)}</p>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div><dt className="text-xs text-muted-foreground">Dentro de crédito</dt><dd className="font-mono tabular">{pesos(s.dentro)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Fuera de crédito {s.anio}</dt><dd className="font-mono tabular">{pesos(s.fueraAnio)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Antes de {s.anio}</dt><dd className="font-mono tabular">{pesos(s.anteriores)}</dd></div>
      </dl>
      <div className="mt-4 overflow-x-auto">{tabla(s.filas.slice(0, 11))}</div>
      {s.filas.length > 11 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-crema-strong">Ver todas ({s.filas.length})</summary>
          <div className="overflow-x-auto">{tabla(s.filas.slice(11))}</div>
        </details>
      )}
    </Tarjeta>
  );
}

function Filas({ filas }: { filas: SaldoCliente[] }) {
  return (
    <>
      {filas.map((f) => (
        <tr key={f.cliente + f.nota} className="border-t border-line text-right">
          <td className="py-1 text-left">
            {f.cliente}
            {f.nota && <span className="block text-xs text-muted-foreground">{f.nota}</span>}
            {f.llenado > 0 && (
              <span className="ml-1 rounded bg-surface-2 px-1 text-[10px] uppercase">
                {Math.abs(f.llenado - f.saldo) < 0.01 ? '100% llenado canal' : `Llenado canal ${pesos(f.llenado)}`}
              </span>
            )}
          </td>
          <td className="font-mono text-xs">{fechaCorta(f.masAntigua)}</td>
          <td className={'font-mono text-xs ' + (f.dias > 30 ? 'font-semibold text-bad' : '')}>{f.dias}</td>
          <td className="font-mono tabular">{pesos(f.saldo)}</td>
        </tr>
      ))}
    </>
  );
}

export function ExternosVista({ e, corte }: { e: SaldosExternos & { anterior: number | null }; corte: string }) {
  const encabezado = (
    <thead><tr className="text-right text-[10px] uppercase tracking-wider text-muted-foreground"><th className="py-1 text-left">Cliente</th><th>Más antigua</th><th>Días</th><th>Saldo</th></tr></thead>
  );
  const fila = (t: string, v: number) => (
    <tr className="border-t-2 border-ink font-semibold"><td colSpan={3} className="py-1">{t}</td><td className="text-right font-mono tabular">{pesos(v)}</td></tr>
  );
  return (
    <Tarjeta>
      <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
        Saldos de clientes externos: <strong>{pesos(e.total)}</strong>
        {e.anterior != null && <> (era {pesos(e.anterior)} la semana pasada)</>}, de los cuales {pesos(e.subtotalCreditos)} son créditos activos.
        La deuda interna ({pesos(e.totalInterna)}) se muestra aparte.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {encabezado}
          <tbody>
            <Filas filas={e.filas.slice(0, 6)} />
          </tbody>
        </table>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-crema-strong">Ver todos ({e.filas.length} clientes)</summary>
          <table className="w-full text-sm">
            {encabezado}
            <tbody>
              <Filas filas={e.filas.slice(6)} />
              {fila('Subtotal sin créditos activos', e.subtotal)}
              <tr><td colSpan={4} className="pt-3 text-xs font-semibold uppercase text-muted-foreground">Créditos activos</td></tr>
              <Filas filas={e.creditos} />
              {fila('Subtotal créditos activos', e.subtotalCreditos)}
              {fila('Total saldos clientes externos', e.total)}
              <tr><td colSpan={4} className="pt-3 text-xs font-semibold uppercase text-muted-foreground">Deuda interna · mismo corporativo</td></tr>
              <Filas filas={e.interna} />
              {fila('Total deuda interna', e.totalInterna)}
            </tbody>
          </table>
        </details>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {e.excluidos.length > 0 && <>Excluye {e.excluidos.map((x) => `${x.cliente} (${pesos(x.saldo)})`).join(', ')}. </>}
        Saldo al {fechaCorta(corte)}.
      </p>
    </Tarjeta>
  );
}
```

```tsx
// components/comercializadora/reporte-semanal/actualizar.tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { actualizarReporte } from '@/app/(comercializadora)/comercializadora/acciones';

export function ActualizarReporte({ semana }: { semana: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-sm font-semibold underline"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await actualizarReporte(semana);
            setError('error' in r ? r.error : null);
            router.refresh();
          })
        }
      >
        <RefreshCw size={14} aria-hidden="true" /> {pendiente ? 'Leyendo Zoho…' : 'Actualizar'}
      </button>
      {error ? <span role="alert" className="text-sm text-bad">{error}</span> : null}
    </span>
  );
}
```

- [ ] **Step 8: Write the page**

```tsx
// app/(comercializadora)/comercializadora/reporte-semanal/page.tsx
import Link from 'next/link';
import { Encabezado } from '@/components/portal/piezas';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { hoyCdmx, fechaCorta } from '@/lib/comercializadora/fechas';
import { leerReporteSemanal, semanaDeUrl } from '@/lib/comercializadora/reporteSemanal';
import { com } from '@/lib/comercializadora/consultas';
import { finSemana, sumar } from '../../../../supabase/functions/_shared/reporte/fechas.ts';
import { normalizarConfigReporte } from '../../../../supabase/functions/_shared/reporte/config.ts';
import { ActualizarReporte } from '@/components/comercializadora/reporte-semanal/actualizar';
import { ErrorSeccion, SeccionTitulo } from '@/components/comercializadora/reporte-semanal/piezas';
import { VentasVista } from '@/components/comercializadora/reporte-semanal/ventas';
import { SurtidoVista } from '@/components/comercializadora/reporte-semanal/surtido';
import { AperturasVista, AtencionVista, NotasVista } from '@/components/comercializadora/reporte-semanal/atencion';
import { ExternosVista, SucursalesVista } from '@/components/comercializadora/reporte-semanal/saldos';

export default async function ReporteSemanalPagina({ searchParams }: { searchParams: Promise<{ semana?: string }> }) {
  const { db } = await sesionComercializadora();
  const hoy = hoyCdmx();
  const semana = semanaDeUrl((await searchParams).semana, hoy);
  const [r, cfgR] = await Promise.all([
    leerReporteSemanal(semana),
    com(db).from('com_reporte_config').select('config').eq('id', 1).maybeSingle(),
  ]);
  const cfg = normalizarConfigReporte(cfgR.data?.config);
  const siguiente = sumar(semana, 7);
  const encabezado = (
    <Encabezado
      area="Comercializadora"
      titulo="Reporte semanal"
      descripcion={`Ventas y supply chain del ${fechaCorta(semana)} al ${fechaCorta(finSemana(semana))}, en vivo desde Zoho Books.`}
    >
      <nav aria-label="Semana" className="flex items-center gap-3 text-sm">
        <Link href={`?semana=${sumar(semana, -7)}`} className="underline">‹ Anterior</Link>
        {siguiente <= hoy && <Link href={`?semana=${siguiente}`} className="underline">Siguiente ›</Link>}
      </nav>
      <ActualizarReporte semana={semana} />
    </Encabezado>
  );
  if (!r.ok)
    return (
      <>
        {encabezado}
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">{r.error}</p>
      </>
    );
  const x = r.reporte;
  return (
    <>
      {encabezado}
      {r.aviso && <p role="status" className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">{r.aviso}</p>}
      {x.sinClasificar.length > 0 && (
        <p className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          Valores de Zoho sin clasificar (se cuentan aparte): {x.sinClasificar.join('; ')}.
        </p>
      )}
      <SeccionTitulo num="01">Ventas de la semana</SeccionTitulo>
      {x.ventas.ok ? <VentasVista v={x.ventas.datos} /> : <ErrorSeccion error={x.ventas.error} />}
      <SeccionTitulo num="02">Calidad de surtido</SeccionTitulo>
      {x.surtido.ok ? <SurtidoVista s={x.surtido.datos} /> : <ErrorSeccion error={x.surtido.error} />}
      <SeccionTitulo num="03">Atención al cliente · incidencias abiertas</SeccionTitulo>
      {x.atencion.ok ? <AtencionVista a={x.atencion.datos} /> : <ErrorSeccion error={x.atencion.error} />}
      <SeccionTitulo num="04">Notas de crédito · saldos sucursales propias</SeccionTitulo>
      <div className="grid gap-3 lg:grid-cols-2">
        {x.notas.ok ? <NotasVista n={x.notas.datos} /> : <ErrorSeccion error={x.notas.error} />}
        {x.sucursales.ok ? <SucursalesVista s={x.sucursales.datos} excluidas={cfg.excluir_saldos_sucursales} /> : <ErrorSeccion error={x.sucursales.error} />}
      </div>
      <SeccionTitulo num="05">Saldos pendientes · clientes externos</SeccionTitulo>
      {x.externos.ok ? <ExternosVista e={x.externos.datos} corte={x.corte} /> : <ErrorSeccion error={x.externos.error} />}
      <SeccionTitulo num="06">Aperturas · seguimiento</SeccionTitulo>
      {x.aperturas.ok ? <AperturasVista a={x.aperturas.datos} /> : <ErrorSeccion error={x.aperturas.error} />}
      <p className="mt-8 border-t border-line pt-4 text-center text-xs text-muted-foreground">
        Leído de Zoho el {new Date(x.leidoEn).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}
        {r.cache ? ' (copia de menos de 15 min)' : ''}. Las incidencias se capturan días después de la entrega; estas cifras pueden moverse.
      </p>
    </>
  );
}
```

Agrega en `components/portal/navegacion.tsx`, grupo «Operación», después de Inicio (usa el ícono `FileBarChart` de lucide-react e impórtalo junto a los demás):

```tsx
      { href: '/comercializadora/reporte-semanal', nombre: 'Reporte semanal', icono: FileBarChart },
```

- [ ] **Step 9: Typecheck, lint and tests**

Run: `npm run typecheck`
Expected: sin errores.
Run: `npx vitest run tests/comercializadora/reporteSemanal.test.ts`
Expected: PASS.
Run: `npx eslint "app/(comercializadora)/comercializadora/reporte-semanal" components/comercializadora/reporte-semanal lib/comercializadora/reporteSemanal.ts`
Expected: sin errores.

- [ ] **Step 10: Commit**

```bash
git add lib/comercializadora/funciones.ts lib/comercializadora/reporteSemanal.ts tests/comercializadora/reporteSemanal.test.ts "app/(comercializadora)/comercializadora/acciones.ts" "app/(comercializadora)/comercializadora/reporte-semanal" components/comercializadora/reporte-semanal components/portal/navegacion.tsx
git commit -m "feat(reporte-semanal): pantalla del reporte en Comercializadora"
```

---

### Task 10: Configuración del reporte

**Files:**
- Create: `lib/comercializadora/configReporte.ts`
- Test: `tests/comercializadora/configReporte.test.ts`
- Modify: `app/(comercializadora)/comercializadora/acciones.ts` (acción `guardarConfigReporte`)
- Create: `components/comercializadora/reporte-semanal/config.tsx`
- Modify: `app/(comercializadora)/comercializadora/reporte-semanal/page.tsx` (panel al final, solo editores)

**Interfaces:**
- Consumes: `normalizarConfigReporte`, `ConfigReporte`, `editorCom`, `com`, `puedeEditarCom`.
- Produces:
  ```ts
  // lib/comercializadora/configReporte.ts
  export type FormConfigReporte = Record<'excluir_ventas' | 'corporativo_ap' | 'excluir_saldos' | 'excluir_saldos_sucursales' | 'deuda_interna' | 'creditos_activos', string>
    & Record<'fill' | 'stock' | 'pickeo' | 'fisica' | 'envio' | 'dias_envio' | 'dias_incidencias', string>;
  export function aFormulario(c: ConfigReporte): FormConfigReporte;
  export function desdeFormulario(f: FormConfigReporte): ConfigReporte;
  // acciones.ts
  export async function guardarConfigReporte(f: FormConfigReporte): Promise<Resultado>;
  ```
  Formato de texto: listas = un nombre por línea; créditos activos = una línea `Cliente | Sucursal | Nota`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/comercializadora/configReporte.test.ts
import { describe, expect, it } from 'vitest';
import { aFormulario, desdeFormulario } from '@/lib/comercializadora/configReporte';
import { configReporteDef } from '../../supabase/functions/_shared/reporte/config.ts';

describe('configuración del reporte en formulario', () => {
  it('ida y vuelta conserva la configuración', () => {
    const c = { ...configReporteDef(), creditos_activos: [{ cliente: 'TANDEM', sucursal: 'Patio Santa Fe', nota: 'crédito 6×6' }] };
    expect(desdeFormulario(aFormulario(c))).toEqual(c);
  });
  it('limpia líneas vacías, créditos sin cliente y acota metas', () => {
    const f = { ...aFormulario(configReporteDef()), excluir_ventas: 'A\n\n B \n', creditos_activos: ' | x | y\nC||', fill: '120' };
    const c = desdeFormulario(f);
    expect(c.excluir_ventas).toEqual(['A', 'B']);
    expect(c.creditos_activos).toEqual([{ cliente: 'C', sucursal: '', nota: '' }]);
    expect(c.metas.fill).toBe(100);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/comercializadora/configReporte.test.ts`
Expected: FAIL — no existe `@/lib/comercializadora/configReporte`.

- [ ] **Step 3: Write `lib/comercializadora/configReporte.ts`**

```ts
// lib/comercializadora/configReporte.ts
import { type ConfigReporte, normalizarConfigReporte } from '../../supabase/functions/_shared/reporte/config.ts';

const LISTAS = ['excluir_ventas', 'corporativo_ap', 'excluir_saldos', 'excluir_saldos_sucursales', 'deuda_interna'] as const;
const METAS = ['fill', 'stock', 'pickeo', 'fisica', 'envio', 'dias_envio'] as const;
export type FormConfigReporte = Record<(typeof LISTAS)[number] | 'creditos_activos' | (typeof METAS)[number] | 'dias_incidencias', string>;

export function aFormulario(c: ConfigReporte): FormConfigReporte {
  return {
    ...(Object.fromEntries(LISTAS.map((k) => [k, c[k].join('\n')])) as Record<(typeof LISTAS)[number], string>),
    creditos_activos: c.creditos_activos.map((x) => [x.cliente, x.sucursal, x.nota].join(' | ')).join('\n'),
    ...(Object.fromEntries(METAS.map((k) => [k, String(c.metas[k])])) as Record<(typeof METAS)[number], string>),
    dias_incidencias: String(c.dias_incidencias),
  };
}

export function desdeFormulario(f: FormConfigReporte): ConfigReporte {
  const lineas = (t: string) => String(t ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  return normalizarConfigReporte({
    ...Object.fromEntries(LISTAS.map((k) => [k, lineas(f[k])])),
    creditos_activos: lineas(f.creditos_activos).map((l) => {
      const [cliente = '', sucursal = '', nota = ''] = l.split('|').map((s) => s.trim());
      return { cliente, sucursal, nota };
    }),
    metas: Object.fromEntries(METAS.map((k) => [k, f[k].replace(',', '.')])),
    dias_incidencias: f.dias_incidencias,
  });
}
```

Nota: `normalizarConfigReporte` sustituye una lista vacía por los valores por defecto solo si no es arreglo; una lista vacía (`[]`) se respeta. Si una lista se deja vacía en el formulario queda vacía (sin exclusiones).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/comercializadora/configReporte.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Server action, form and page wiring**

Al final de `app/(comercializadora)/comercializadora/acciones.ts` (agrega el import de `desdeFormulario, type FormConfigReporte` desde `@/lib/comercializadora/configReporte`):

```ts
export async function guardarConfigReporte(f: FormConfigReporte): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const r = await com(s.db).from('com_reporte_config').update({ config: desdeFormulario(f) }).eq('id', 1).select('id');
    if (r.error) return fallo(r.error);
    if (!r.data?.length) return { error: 'Sin permiso para modificar la configuración del reporte' };
    revalidatePath('/comercializadora/reporte-semanal');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
```

(`fallo` y `com` ya existen en `acciones.ts`; verifica sus nombres con `grep -n "function fallo\|import { com" "app/(comercializadora)/comercializadora/acciones.ts"` y ajusta el import si `com` no está importado.)

```tsx
// components/comercializadora/reporte-semanal/config.tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Tarjeta } from '@/components/portal/piezas';
import { guardarConfigReporte } from '@/app/(comercializadora)/comercializadora/acciones';
import type { FormConfigReporte } from '@/lib/comercializadora/configReporte';

const LISTAS: [keyof FormConfigReporte, string, string][] = [
  ['excluir_ventas', 'Excluir de ventas y surtido', 'Un cliente de Zoho por línea'],
  ['corporativo_ap', 'Clientes de Corporativo AP', 'Se suman en el top de clientes'],
  ['excluir_saldos', 'Excluir de saldos externos', 'Se mencionan al pie'],
  ['excluir_saldos_sucursales', 'Sucursales propias fuera de saldos', 'Nombre de la sucursal'],
  ['deuda_interna', 'Deuda interna (mismo corporativo)', 'Se muestran aparte'],
  ['creditos_activos', 'Créditos activos', 'Cliente | Sucursal | Nota (Sucursal vacía = todas)'],
];
const NUMEROS: [keyof FormConfigReporte, string][] = [
  ['fill', 'Meta fill rate (≥ %)'], ['stock', 'Meta faltante por stock (≤ %)'], ['pickeo', 'Meta precisión de pickeo (≥ %)'],
  ['fisica', 'Meta calidad física (≤ %)'], ['envio', 'Meta envío en tiempo (≥ %)'], ['dias_envio', 'Días hábiles para enviar'],
  ['dias_incidencias', 'Días de incidencias abiertas a revisar'],
];

export function ConfigReporteVista({ inicial }: { inicial: FormConfigReporte }) {
  const router = useRouter();
  const [f, setF] = useState(inicial);
  const [pendiente, iniciar] = useTransition();
  const [msj, setMsj] = useState<{ ok: boolean; texto: string } | null>(null);
  const campo = (k: keyof FormConfigReporte) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });
  return (
    <details className="mt-8">
      <summary className="cursor-pointer text-sm font-semibold">Configuración del reporte</summary>
      <Tarjeta className="mt-3">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            iniciar(async () => {
              const r = await guardarConfigReporte(f);
              setMsj('error' in r ? { ok: false, texto: r.error } : { ok: true, texto: 'Guardado. La próxima lectura usa la configuración nueva.' });
              router.refresh();
            });
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            {LISTAS.map(([k, etiqueta, ayuda]) => (
              <label key={k} className="grid gap-1 text-sm">
                <span className="font-medium">{etiqueta}</span>
                <textarea rows={4} className="rounded-lg border border-line bg-surface px-2 py-1 font-mono text-xs" {...campo(k)} />
                <span className="text-xs text-muted-foreground">{ayuda}</span>
              </label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {NUMEROS.map(([k, etiqueta]) => (
              <label key={k} className="grid gap-1 text-sm">
                <span className="font-medium">{etiqueta}</span>
                <input inputMode="decimal" className="rounded-lg border border-line bg-surface px-2 py-1 tabular" {...campo(k)} />
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pendiente} className="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-surface">
              {pendiente ? 'Guardando…' : 'Guardar'}
            </button>
            {msj && <span role={msj.ok ? 'status' : 'alert'} className={msj.ok ? 'text-sm text-ok' : 'text-sm text-bad'}>{msj.texto}</span>}
          </div>
        </form>
      </Tarjeta>
    </details>
  );
}
```

En `page.tsx`: cambia `const { db } = await sesionComercializadora();` por `const { db, accesos } = await sesionComercializadora();`, importa `puedeEditarCom` de `@/lib/portal/modulos`, `aFormulario` de `@/lib/comercializadora/configReporte` y `ConfigReporteVista`; y justo antes del `<p>` del pie (en el caso `r.ok`) y también después del mensaje de error (caso `!r.ok`) agrega:

```tsx
      {puedeEditarCom(accesos) && <ConfigReporteVista inicial={aFormulario(cfg)} />}
```

- [ ] **Step 6: Typecheck and tests**

Run: `npm run typecheck && npx vitest run tests/comercializadora/`
Expected: sin errores; PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/comercializadora/configReporte.ts tests/comercializadora/configReporte.test.ts "app/(comercializadora)/comercializadora/acciones.ts" components/comercializadora/reporte-semanal/config.tsx "app/(comercializadora)/comercializadora/reporte-semanal/page.tsx"
git commit -m "feat(reporte-semanal): configuración editable del reporte"
```

---

### Task 11: Despliegue de prueba y verificación en el navegador

**Files:** ninguno nuevo (correcciones que salgan de la revisión van en el archivo que corresponda, con su prueba).

- [ ] **Step 1: Aplicar migración y desplegar la función** (pide confirmación al usuario antes: toca el proyecto de Supabase compartido)

```bash
npx supabase db push
npx supabase functions deploy zoho-reporte-semanal
```

Expected: migración `20261125000097` aplicada; función desplegada. Los secretos `ZOHO_*` y `COM_SECRETO` ya existen (los usa `zoho-sync`).

- [ ] **Step 2: Cargar los créditos activos iniciales**

En la pantalla, como editor, abre «Configuración del reporte» y captura en Créditos activos:

```
TANDEM CORPORATIVO EMPRESARIAL | Patio Santa Fe | apertura · crédito 6×6
EMMANUEL ORTIZ LOPEZ | Paseo MS | crédito otorgado
```

- [ ] **Step 3: Revisar la pantalla**

Arranca el portal con `preview_start` y abre `/comercializadora/reporte-semanal?semana=2026-11-16`. Compara sección por sección contra `C:\Users\sebcm\Downloads\Reporte Semanal · The Coffee · 16–22 Nov 2026.html`: ventas $1,193,333 / 97, tendencia de 5 semanas, fill 53.5%, 34 incidencias, NC $3,357.73. Revisa en modo oscuro (`resize_window colorScheme: dark`) y en ancho de celular (`preset: mobile`, sin scroll horizontal de la página). Revisa `read_console_messages` sin errores. Pulsa «Actualizar» y confirma que la hora del pie cambia.

- [ ] **Step 4: Commit de correcciones (si hubo)**

```bash
git add -A -- app components lib supabase tests
git commit -m "fix(reporte-semanal): ajustes de la revisión en el navegador"
```
