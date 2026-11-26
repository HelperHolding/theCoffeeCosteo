# Tablero de Compras (fase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** La pantalla `/comercializadora/compras`: tablero de compras con filtros (periodo, categoría, proveedor, comprador), 9 indicadores con el periodo anterior, gráfica de 16 semanas, plan de compra del motor y detalle plegable, leyendo solo Supabase.

**Architecture:** Todo el cálculo del tablero es puro y vive en `supabase/functions/_shared/compras/tablero.ts` (Deno, con paridad contra el tablero original). Devuelve un modelo `TableroCompras` que la fase 4 (descarga) reutiliza sin cambios. El portal lee las tablas `com_compras_*` (fase 2), las líneas abiertas de `com_zoho_oc_lineas` y el motor del plan de abastos. Arma el modelo y lo pinta con componentes de servidor; solo los filtros y «Sincronizar ahora» son de cliente.

**Tech Stack:** Next.js 16 App Router (leer `node_modules/next/dist/docs/` antes de escribir código de Next, como pide AGENTS.md), React 19, Tailwind 4, Supabase, Deno test (`npm run test:funciones`), Vitest + Testing Library (`npm test`).

**Spec:** `docs/superpowers/specs/2026-11-25-compras-tablero-y-descargas-design.md` (§3 tablero; §5 errores; §6 pruebas; §7 paridad).

## Global Constraints

- Ruta `/comercializadora/compras`, en el menú «Operación» junto a «Reporte semanal». Lectura de Comercializadora (`sesionComercializadora()`); la página lee solo Supabase (no Zoho).
- Filtros en la URL: `?periodo=2026-11-16&categoria=CAF&proveedor=…&comprador=…`. Periodo: semanas (lunes a domingo) y meses (`2026-11`: suma de las semanas que empiezan en ese mes). Por omisión, la semana cerrada anterior.
- Categorías y etiquetas exactas: Todas, Café (`CAF`), Bebidas (`BEB`), Desechables (`DES`), Delivery (`DEL`), Barra (`BA`, «Barra (incluye bases frappé)»), Limpieza (`LIM`), Foods (`FOD`), RTD (`RTD`).
- Proveedor y comprador solo afectan indicadores de OCs y entregas; la venta no tiene proveedor.
- OCs en borrador (`estado = 'draft'`) no cuentan como elaboradas (§7). Las OCs de registro (`es_registro`) no cuentan como elaboradas ni en entregas, y su mercancía tampoco cuenta como compra recibida.
- Meta de compras / venta: 45–55%. Verde dentro, ámbar ±5 pp fuera, rojo más allá.
- Sincronización de más de 36 h: aviso. «Sincronizar ahora» solo para editores; respeta el enfriamiento de 10 minutos de la función.
- Si el plan de compra falla (motor sin datos), esa sección muestra el error y el resto sale.
- Comprador vacío → «Sin comprador»; SKU sin familia → `otros`; nunca se descartan.
- Montos con IVA, MXN. Formato con `pesos()` de `lib/comercializadora/formato.ts`.
- Copia en español de México. Debe verse bien en escritorio, en celular (375 px, sin desbordes: usar `*:min-w-0` en grids) y en modo oscuro (tokens `--color-*` de `app/globals.css`).
- Nada de este plan escribe en Zoho.

## Review Focus

1. **Periodo sin datos de venta** (semana sin fila en `com_compras_venta_semana`, o un mes a medias): venta 0, ratio «—», sin semáforo y sin dividir entre cero. Prueba en la tarea 1.
2. **Filtro de proveedor con un nombre que no existe** (URL editada a mano) o con acentos y mayúsculas distintas entre Zoho y el plan: la página no truena; el plan compara con `planKey`. Pruebas en las tareas 2 y 3.
3. **OC con recepciones pero sin arribo esperado**: cuenta como llegada y como «sin fecha», no a favor ni en contra. Prueba en la tarea 1.
4. **Primera sincronización incompleta** (sin filas en `com_compras_oc` ni en `com_compras_venta_semana`): mensaje claro y botón para sincronizar, no una página en ceros. Prueba en la tarea 5.
5. **Más de 1000 filas** en recepciones u OCs: se leen con `leerTodoCom` (páginas de 1000). Prueba en la tarea 2.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `supabase/functions/_shared/compras/tablero.ts` (crear) | Cálculo puro: periodos, filtros, indicadores, semáforo, entregas, OCs por proveedor, por llegar, vencidas, serie de 16 semanas, `armarTablero`. |
| `supabase/functions/_shared/compras/tablero_test.ts` (crear) | Pruebas Deno de lo anterior y paridad con el fixture `compras-2026-11.json`. |
| `lib/comercializadora/compras/filtros.ts` (crear) | URL ↔ filtros (`filtrosDeUrl`, `hrefCompras`). |
| `lib/comercializadora/compras/datos.ts` (crear) | Lectura de Supabase (servidor): `leerDatosCompras`, `lineasAbiertas`. |
| `lib/comercializadora/compras/motor.ts` (crear) | `semDelMotor`: la semana del motor del plan de abastos (servidor). |
| `lib/comercializadora/compras/plan.ts` (crear) | Plan de compra desde la semana del motor (`planCompra`), puro. |
| `lib/comercializadora/compras/grafica.ts` (crear) | SVG de venta, compras y presupuesto (string; la fase 4 lo reutiliza). |
| `lib/comercializadora/compras/sync.ts` (crear) | Mensajes de la sincronización (`mensajeSync`, `estadoSync`). |
| `lib/comercializadora/funciones.ts` (modificar) | Agregar `'zoho-compras-sync'` a `FuncionCom`. |
| `app/(comercializadora)/comercializadora/acciones.ts` (modificar) | Acción `sincronizarCompras`. |
| `components/comercializadora/compras/*.tsx` (crear) | `filtros.tsx`, `sincronizar.tsx` (cliente); `indicadores.tsx`, `grafica.tsx`, `plan.tsx`, `detalle.tsx` (servidor). |
| `app/(comercializadora)/comercializadora/compras/page.tsx` (crear) | La página. |
| `components/portal/navegacion.tsx` (modificar) | Enlace «Compras» en Operación. |
| `tests/comercializadora/compras-*.test.ts(x)` (crear) | Vitest del portal. |

---

### Task 1: Cálculo puro del tablero

**Files:**
- Create: `supabase/functions/_shared/compras/tablero.ts`
- Test: `supabase/functions/_shared/compras/tablero_test.ts`

**Interfaces:**
- Consumes: `Categoria`, `PorCategoria`, `CATEGORIAS`, `FilaOc`, `ocDesdeDetalle` de `./reglas.ts`; `sumar`, `dif`, `lunesDe`, `finSemana`, `enRango` de `../reporte/fechas.ts`.
- Produces (exactas; las tareas 2–5 y la fase 4 las usan):
  ```ts
  export type Cat = Exclude<Categoria, "otros">;
  export type FiltrosCompras = { periodo: string; categoria: Cat | null; proveedor: string | null; comprador: string | null };
  export type OcT = Pick<FilaOc, "zoho_po_id" | "folio" | "proveedor" | "comprador" | "emision" | "arribo" | "estado" | "received_status" | "monto_ins" | "por_categoria" | "es_registro">;
  export type RecT = { zoho_po_id: string; fecha: string; monto: number; por_categoria: PorCategoria };
  export type VentaT = { semana: string; venta_total_ci: number; por_categoria_ci: PorCategoria };
  export type LineaAbierta = { zoho_po_id: string; sku: string; nombre: string; pendiente: number };
  export type DatosCompras = { ocs: OcT[]; recepciones: RecT[]; ventas: VentaT[]; lineas: LineaAbierta[] };
  export type Periodo = { clave: string; tipo: "semana" | "mes"; etiqueta: string; lunes: string[]; ini: string; fin: string };
  export type Semaforo = "ok" | "cerca" | "fuera";
  export type Indicadores = {
    venta: number; compras: number; ratio: number | null; semaforo: Semaforo | null;
    llegaron: { n: number; mismas: number; antes: number };
    entregas: { aTiempo: number; tarde: number; sinFecha: number; pct: number | null };
    lead: number | null;
    mayor: { proveedor: string; monto: number } | null;
  };
  export type FilaProveedor = { proveedor: string; ocs: number; monto: number; registro: number; recibidas: number; aTiempo: number; atrasadas: number; pendVencidas: number; pendEnPlazo: number; lead: number | null };
  export type OcPorLlegar = { folio: string; proveedor: string; arribo: string | null; estado: "Vencida" | "En plazo" | "Sin fecha"; monto: number; articulos: { sku: string; nombre: string; pendiente: number }[] };
  export type PuntoSerie = { semana: string; venta: number; compras: number; presupuesto: number };
  export type TableroCompras = {
    periodo: Periodo; anterior: Periodo; filtros: FiltrosCompras; hoy: string;
    k: Indicadores; kAnt: Indicadores;
    vencidas: { n: number; monto: number };
    porLlegar: OcPorLlegar[]; proveedores: FilaProveedor[]; serie: PuntoSerie[];
    opciones: { periodos: Periodo[]; proveedores: string[]; compradores: string[] };
  };
  export const ETIQUETA_CAT: Record<Cat, string>;
  export function periodos(semanas: string[]): Periodo[];
  export function periodoDe(clave: string | null | undefined, hoy: string): Periodo;
  export function periodoAnterior(p: Periodo): Periodo;
  export function semaforo(ratio: number | null): Semaforo | null;
  export function indicadores(d: DatosCompras, f: FiltrosCompras, p: Periodo): Indicadores;
  export function vencidas(d: DatosCompras, f: FiltrosCompras, hoy: string): { n: number; monto: number };
  export function proveedores(d: DatosCompras, f: FiltrosCompras, p: Periodo, hoy: string): FilaProveedor[];
  export function porLlegar(d: DatosCompras, f: FiltrosCompras, hoy: string): OcPorLlegar[];
  export function serie(d: DatosCompras, f: FiltrosCompras, p: Periodo, n?: number): PuntoSerie[];
  export function armarTablero(d: DatosCompras, f: FiltrosCompras, hoy: string): TableroCompras;
  ```

**Reglas (las del spec §3, escritas como las aplica el código):**
- OC válida: `estado` no es `draft` ni `cancelled`.
- Filtro de OCs: proveedor y comprador por igualdad exacta; categoría: la OC entra si `por_categoria[cat] > 0`. El monto con categoría es `por_categoria[cat]`; sin categoría, el total (`monto_ins` en OCs; `monto` en recepciones, que incluye `otros` como el tablero original: 477,634).
- Primera recepción de una OC: la fecha mínima de sus recepciones.
- Compras recibidas: recepciones con fecha en el periodo, de OCs válidas, no de registro y que pasan el filtro.
- OCs que llegaron: primera recepción en el periodo (válidas, no de registro, filtradas). `mismas` = emitidas dentro del periodo; `antes` = el resto.
- Entregas a tiempo: primera recepción ≤ arribo esperado. Sin arribo → `sinFecha` (no cuenta en el porcentaje). `pct = aTiempo / (aTiempo + tarde)`, o null si no hay.
- Lead time: promedio de `dif(emision, primera)` de las que llegaron, con un decimal.
- Mayor compra: proveedor con más compras recibidas en el periodo.
- Vencidas: válidas, no de registro, filtradas, `arribo < hoy` y `received_status !== "received"`. No dependen del periodo.
- Por llegar: válidas, no de registro, filtradas, `received_status !== "received"` y `estado !== "closed"`. Estado: Vencida (arribo < hoy), En plazo, Sin fecha. Artículos de `d.lineas` con `pendiente > 0`. Ordenadas por arribo (sin fecha al final).
- OCs por proveedor del periodo: OCs válidas emitidas en el periodo, filtradas. `ocs` y `monto` sin las de registro; `registro` las cuenta aparte. `recibidas` = con primera recepción; `atrasadas` = primera > arribo; `pendVencidas` = sin recepción y arribo < hoy; `pendEnPlazo` = sin recepción y no vencidas. Orden: monto descendente.
- Meses: los lunes del calendario cuyo día cae en ese mes. Periodo anterior: semana −7 días; mes, el mes anterior.
- Semáforo: `0.45 ≤ r ≤ 0.55` → ok; `0.40 ≤ r < 0.45` o `0.55 < r ≤ 0.60` → cerca; si no, fuera; `null` → null.
- `opciones.periodos` = `periodos(semanas de ventas)`; `opciones.proveedores` y `compradores` = valores únicos de OCs válidas, ordenados con `localeCompare("es")`.

- [ ] **Step 1: Write the failing tests**

```ts
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

Deno.test("paridad: OCs por proveedor 16–22 nov suman 20 OCs, 1,599,653 en insumos y 2 de registro", () => {
  const p = proveedores(dFx, f(), sem, "2026-11-23");
  assertEquals(p.reduce((a, x) => a + x.ocs, 0), 20);
  assertEquals(Math.round(p.reduce((a, x) => a + x.monto, 0)), 1599653);
  assertEquals(p.reduce((a, x) => a + x.registro, 0), 2);
});
```

Cuentas de la prueba de indicadores, para quien la revise:
- **Compras:** P1 (1160), P2 (580) y P3 (232) tienen recepción del 16 al 22. P5 es de registro y no cuenta.
- **Llegadas:** P1 y P3 se emitieron en la semana; P2 el 5 de noviembre (antes).
- **A tiempo:** P1 llegó el 19 con arribo el 19 (a tiempo). P2 llegó el 17 con arribo el 10 (tarde). P3 no tiene arribo (sin fecha).
- **Lead:** dif(17→19) = 2, dif(5→17) = 12 y dif(18→20) = 2, que promedian 5.3.
- **Mayor compra:** Prov A con 1160 + 232 = 1392.
- **Proveedores:**
  - Prov A emitió P1, P3 y P6 (ocs = 3, monto = 1500). P4 es borrador y queda fuera; P5 de registro va aparte (registro = 1).
  - Recibidas: P1 y P3. A tiempo: P1. P3 no tiene arribo, así que no es atrasada.
  - P6 no tiene recepción y su arribo (20) es menor que hoy (26), así que es pendiente vencida.
  - Lead: (2 + 2) / 2 = 2.
  - P2 se emitió fuera del periodo.
- **Serie:** las compras de la semana del 16 son 1160 + 580 + 232 = 1972.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:funciones -- --filter tablero`
Expected: FAIL: `Module not found "…/compras/tablero.ts"`.

- [ ] **Step 3: Write the implementation**

```ts
// supabase/functions/_shared/compras/tablero.ts
// Cálculo puro del tablero de compras (spec compras §3). Sin Deno ni Supabase: el portal y la descarga (fase 4) lo importan.
import { type Categoria, type FilaOc, type PorCategoria } from "./reglas.ts";
import { dif, enRango, finSemana, lunesDe, sumar } from "../reporte/fechas.ts";

export type Cat = Exclude<Categoria, "otros">;
export type FiltrosCompras = { periodo: string; categoria: Cat | null; proveedor: string | null; comprador: string | null };
export type OcT = Pick<FilaOc, "zoho_po_id" | "folio" | "proveedor" | "comprador" | "emision" | "arribo" | "estado" | "received_status" | "monto_ins" | "por_categoria" | "es_registro">;
export type RecT = { zoho_po_id: string; fecha: string; monto: number; por_categoria: PorCategoria };
export type VentaT = { semana: string; venta_total_ci: number; por_categoria_ci: PorCategoria };
export type LineaAbierta = { zoho_po_id: string; sku: string; nombre: string; pendiente: number };
export type DatosCompras = { ocs: OcT[]; recepciones: RecT[]; ventas: VentaT[]; lineas: LineaAbierta[] };
export type Periodo = { clave: string; tipo: "semana" | "mes"; etiqueta: string; lunes: string[]; ini: string; fin: string };
export type Semaforo = "ok" | "cerca" | "fuera";
export type Indicadores = {
  venta: number; compras: number; ratio: number | null; semaforo: Semaforo | null;
  llegaron: { n: number; mismas: number; antes: number };
  entregas: { aTiempo: number; tarde: number; sinFecha: number; pct: number | null };
  lead: number | null;
  mayor: { proveedor: string; monto: number } | null;
};
export type FilaProveedor = { proveedor: string; ocs: number; monto: number; registro: number; recibidas: number; aTiempo: number; atrasadas: number; pendVencidas: number; pendEnPlazo: number; lead: number | null };
export type OcPorLlegar = { folio: string; proveedor: string; arribo: string | null; estado: "Vencida" | "En plazo" | "Sin fecha"; monto: number; articulos: { sku: string; nombre: string; pendiente: number }[] };
export type PuntoSerie = { semana: string; venta: number; compras: number; presupuesto: number };
export type TableroCompras = {
  periodo: Periodo; anterior: Periodo; filtros: FiltrosCompras; hoy: string;
  k: Indicadores; kAnt: Indicadores;
  vencidas: { n: number; monto: number };
  porLlegar: OcPorLlegar[]; proveedores: FilaProveedor[]; serie: PuntoSerie[];
  opciones: { periodos: Periodo[]; proveedores: string[]; compradores: string[] };
};

export const ETIQUETA_CAT: Record<Cat, string> = {
  CAF: "Café", BEB: "Bebidas", DES: "Desechables", DEL: "Delivery", BA: "Barra (incluye bases frappé)", LIM: "Limpieza", FOD: "Foods", RTD: "RTD",
};
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const r1 = (x: number) => Math.round(x * 10) / 10;
const dia = (iso: string) => `${Number(iso.slice(8, 10))} ${MES_CORTO[Number(iso.slice(5, 7)) - 1]}`;

function semana(lunes: string): Periodo {
  const fin = finSemana(lunes);
  return { clave: lunes, tipo: "semana", etiqueta: `${dia(lunes)} – ${dia(fin)} ${fin.slice(0, 4)}`, lunes: [lunes], ini: lunes, fin };
}
function mes(clave: string): Periodo {
  const primero = `${clave}-01`;
  let l = lunesDe(primero);
  if (l < primero) l = sumar(l, 7);
  const lunes: string[] = [];
  for (; l.slice(0, 7) === clave; l = sumar(l, 7)) lunes.push(l);
  const m = Number(clave.slice(5, 7));
  const etiqueta = `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} ${clave.slice(0, 4)}`;
  return { clave, tipo: "mes", etiqueta, lunes, ini: lunes[0], fin: finSemana(lunes[lunes.length - 1]) };
}

export function periodoDe(clave: string | null | undefined, hoy: string): Periodo {
  const c = String(clave ?? "");
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(c)) return mes(c);
  if (/^\d{4}-\d{2}-\d{2}$/.test(c) && !Number.isNaN(Date.parse(`${c}T00:00:00Z`))) return semana(lunesDe(c));
  return semana(sumar(lunesDe(hoy), -7));
}
export function periodoAnterior(p: Periodo): Periodo {
  if (p.tipo === "semana") return semana(sumar(p.ini, -7));
  const [a, m] = p.clave.split("-").map(Number);
  return mes(m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`);
}
export function periodos(semanas: string[]): Periodo[] {
  const ls = [...new Set(semanas)].sort().reverse();
  const meses = [...new Set(ls.map((l) => l.slice(0, 7)))];
  return [...ls.map(semana), ...meses.map(mes)];
}

export function semaforo(ratio: number | null): Semaforo | null {
  if (ratio == null) return null;
  const r = Math.round(ratio * 1e4) / 1e4;
  if (r >= 0.45 && r <= 0.55) return "ok";
  if (r >= 0.4 && r <= 0.6) return "cerca";
  return "fuera";
}

const valida = (o: OcT) => o.estado !== "draft" && o.estado !== "cancelled";
const pasa = (o: OcT, f: FiltrosCompras) =>
  valida(o) && (!f.proveedor || o.proveedor === f.proveedor) && (!f.comprador || o.comprador === f.comprador) &&
  (!f.categoria || (o.por_categoria[f.categoria] ?? 0) > 0);
const montoCat = (pc: PorCategoria, total: number, cat: Cat | null) => (cat ? pc[cat] ?? 0 : total);

function primeras(d: DatosCompras): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of d.recepciones) { const ya = m.get(r.zoho_po_id); if (!ya || r.fecha < ya) m.set(r.zoho_po_id, r.fecha); }
  return m;
}
function comprasPorProveedor(d: DatosCompras, f: FiltrosCompras, ini: string, fin: string): Map<string, number> {
  const ocs = new Map(d.ocs.filter((o) => pasa(o, f) && !o.es_registro).map((o) => [o.zoho_po_id, o]));
  const m = new Map<string, number>();
  for (const r of d.recepciones) {
    const o = ocs.get(r.zoho_po_id);
    if (!o || !enRango(r.fecha, ini, fin)) continue;
    m.set(o.proveedor, (m.get(o.proveedor) ?? 0) + montoCat(r.por_categoria, r.monto, f.categoria));
  }
  return m;
}
function venta(d: DatosCompras, f: FiltrosCompras, lunes: string[]): number {
  const s = new Set(lunes);
  return d.ventas.filter((v) => s.has(v.semana)).reduce((a, v) => a + montoCat(v.por_categoria_ci, v.venta_total_ci, f.categoria), 0);
}

export function indicadores(d: DatosCompras, f: FiltrosCompras, p: Periodo): Indicadores {
  const porProv = comprasPorProveedor(d, f, p.ini, p.fin);
  const compras = [...porProv.values()].reduce((a, x) => a + x, 0);
  const v = venta(d, f, p.lunes);
  const ratio = v > 0 ? compras / v : null;
  const prim = primeras(d);
  const llegadas = d.ocs.filter((o) => pasa(o, f) && !o.es_registro && enRango(prim.get(o.zoho_po_id) ?? "", p.ini, p.fin));
  const mismas = llegadas.filter((o) => o.emision >= p.ini).length;
  let aTiempo = 0, tarde = 0, sinFecha = 0, lead = 0;
  for (const o of llegadas) {
    const pr = prim.get(o.zoho_po_id)!;
    lead += dif(o.emision, pr);
    if (!o.arribo) sinFecha++; else if (pr <= o.arribo) aTiempo++; else tarde++;
  }
  let mayor: Indicadores["mayor"] = null;
  for (const [proveedor, monto] of porProv) if (monto > 0 && (!mayor || monto > mayor.monto)) mayor = { proveedor, monto };
  return {
    venta: v, compras, ratio, semaforo: semaforo(ratio),
    llegaron: { n: llegadas.length, mismas, antes: llegadas.length - mismas },
    entregas: { aTiempo, tarde, sinFecha, pct: aTiempo + tarde ? aTiempo / (aTiempo + tarde) : null },
    lead: llegadas.length ? r1(lead / llegadas.length) : null,
    mayor,
  };
}

const abierta = (o: OcT) => o.received_status !== "received";
export function vencidas(d: DatosCompras, f: FiltrosCompras, hoy: string) {
  const xs = d.ocs.filter((o) => pasa(o, f) && !o.es_registro && abierta(o) && !!o.arribo && o.arribo < hoy);
  return { n: xs.length, monto: xs.reduce((a, o) => a + montoCat(o.por_categoria, o.monto_ins, f.categoria), 0) };
}

export function porLlegar(d: DatosCompras, f: FiltrosCompras, hoy: string): OcPorLlegar[] {
  const lineas = new Map<string, LineaAbierta[]>();
  for (const l of d.lineas) if (l.pendiente > 0) lineas.set(l.zoho_po_id, [...(lineas.get(l.zoho_po_id) ?? []), l]);
  return d.ocs
    .filter((o) => pasa(o, f) && !o.es_registro && abierta(o) && o.estado !== "closed")
    .map((o): OcPorLlegar => ({
      folio: o.folio, proveedor: o.proveedor, arribo: o.arribo,
      estado: !o.arribo ? "Sin fecha" : o.arribo < hoy ? "Vencida" : "En plazo",
      monto: montoCat(o.por_categoria, o.monto_ins, f.categoria),
      articulos: (lineas.get(o.zoho_po_id) ?? []).map(({ sku, nombre, pendiente }) => ({ sku, nombre, pendiente })),
    }))
    .sort((a, b) => (a.arribo ?? "9999").localeCompare(b.arribo ?? "9999") || a.folio.localeCompare(b.folio));
}

export function proveedores(d: DatosCompras, f: FiltrosCompras, p: Periodo, hoy: string): FilaProveedor[] {
  const prim = primeras(d);
  const m = new Map<string, FilaProveedor & { leadSuma: number }>();
  for (const o of d.ocs) {
    if (!pasa(o, f) || !enRango(o.emision, p.ini, p.fin)) continue;
    const x = m.get(o.proveedor) ?? { proveedor: o.proveedor, ocs: 0, monto: 0, registro: 0, recibidas: 0, aTiempo: 0, atrasadas: 0, pendVencidas: 0, pendEnPlazo: 0, lead: null, leadSuma: 0 };
    m.set(o.proveedor, x);
    if (o.es_registro) { x.registro++; continue; }
    x.ocs++;
    x.monto += montoCat(o.por_categoria, o.monto_ins, f.categoria);
    const pr = prim.get(o.zoho_po_id);
    if (pr) {
      x.recibidas++;
      x.leadSuma += dif(o.emision, pr);
      if (o.arribo && pr <= o.arribo) x.aTiempo++;
      else if (o.arribo) x.atrasadas++;
    } else if (o.arribo && o.arribo < hoy) x.pendVencidas++;
    else x.pendEnPlazo++;
  }
  return [...m.values()]
    .map(({ leadSuma, ...x }) => ({ ...x, lead: x.recibidas ? r1(leadSuma / x.recibidas) : null }))
    .sort((a, b) => b.monto - a.monto || a.proveedor.localeCompare(b.proveedor, "es"));
}

export function serie(d: DatosCompras, f: FiltrosCompras, p: Periodo, n = 16): PuntoSerie[] {
  const ultimo = p.lunes[p.lunes.length - 1];
  return Array.from({ length: n }, (_, i) => sumar(ultimo, -7 * (n - 1 - i))).map((l) => {
    const v = venta(d, f, [l]);
    const c = [...comprasPorProveedor(d, f, l, finSemana(l)).values()].reduce((a, x) => a + x, 0);
    return { semana: l, venta: v, compras: c, presupuesto: v * 0.5 };
  });
}

const unicos = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
export function armarTablero(d: DatosCompras, f: FiltrosCompras, hoy: string): TableroCompras {
  const periodo = periodoDe(f.periodo, hoy);
  const anterior = periodoAnterior(periodo);
  const validas = d.ocs.filter(valida);
  return {
    periodo, anterior, filtros: { ...f, periodo: periodo.clave }, hoy,
    k: indicadores(d, f, periodo), kAnt: indicadores(d, f, anterior),
    vencidas: vencidas(d, f, hoy),
    porLlegar: porLlegar(d, f, hoy),
    proveedores: proveedores(d, f, periodo, hoy),
    serie: serie(d, f, periodo),
    opciones: { periodos: periodos(d.ventas.map((v) => v.semana)), proveedores: unicos(validas.map((o) => o.proveedor)), compradores: unicos(validas.map((o) => o.comprador)) },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:funciones -- --filter tablero`
Expected: PASS (12 pruebas).

Si una prueba de paridad no cuadra, no ajustes la expectativa a ciegas. Investiga la diferencia con superpowers:systematic-debugging, explícala en el §7 del spec (como la de los borradores) y déjala en el ledger como `Ruling:`. Ejemplos: una OC de registro que el tablero sí contaba, o una entrega con arribo vacío. Recuerda que el fixture se capturó el 25 de noviembre y el tablero tiene datos al 23, así que algunas recepciones pueden ser posteriores.

- [ ] **Step 5: Run the full functions suite and commit**

Run: `npm run test:funciones`
Expected: todo en verde (392 + 12).

```bash
git add supabase/functions/_shared/compras/tablero.ts supabase/functions/_shared/compras/tablero_test.ts
git commit -m "feat(compras): cálculo puro del tablero con paridad de entregas"
```

---

### Task 2: Filtros de la URL y lectura de Supabase

**Files:**
- Create: `lib/comercializadora/compras/filtros.ts`
- Create: `lib/comercializadora/compras/datos.ts`
- Create: `lib/comercializadora/compras/motor.ts`
- Modify: `lib/comercializadora/funciones.ts:3`
- Test: `tests/comercializadora/compras-filtros.test.ts`
- Test: `tests/comercializadora/compras-datos.test.ts`

**Interfaces:**
- Consumes: `FiltrosCompras`, `Cat`, `ETIQUETA_CAT`, `DatosCompras`, `LineaAbierta` (tarea 1); `leerTodoCom`, `com` de `lib/comercializadora/consultas.ts`; `motorPlan`, `planLocalMotor`, `cafeOrdenesMotor`, `importacionesMotor` de `lib/comercializadora/motor.ts`; `planSemCalc`, `planSemW`, `FuentesPlan` de `lib/comercializadora/planAbastos.ts`.
- Produces:
  ```ts
  // filtros.ts
  export type ParamsCompras = Record<string, string | string[] | undefined>;
  export function filtrosDeUrl(sp: ParamsCompras): FiltrosCompras; // periodo crudo; armarTablero lo normaliza
  export function hrefCompras(f: FiltrosCompras, cambio?: Partial<FiltrosCompras>): string; // '/comercializadora/compras?…'
  export function textoFiltros(f: FiltrosCompras, etiquetaPeriodo: string): string; // «16 – 22 nov 2026 · Café · Prov A»
  // datos.ts (server-only)
  export function lineasAbiertas(lineas: { zoho_po_id: string; sku: string; cantidad: number; cantidad_recibida: number }[], nombres: Map<string, string>): LineaAbierta[];
  export async function leerDatosCompras(db: unknown): Promise<{ datos: DatosCompras; ultimaSync: string | null }>;
  // motor.ts (server-only)
  export async function semDelMotor(db: unknown): Promise<{ ok: true; S: Sem; hoyIso: string } | { ok: false; error: string }>;
  // funciones.ts
  export type FuncionCom = … | 'zoho-compras-sync';
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// tests/comercializadora/compras-filtros.test.ts
import { describe, expect, it } from 'vitest';
import { filtrosDeUrl, hrefCompras, textoFiltros } from '@/lib/comercializadora/compras/filtros';

describe('filtros del tablero de compras', () => {
  it('lee la URL; categoría desconocida o vacía es Todas', () => {
    expect(filtrosDeUrl({ periodo: '2026-11-16', categoria: 'CAF', proveedor: 'Prov A', comprador: 'CC' }))
      .toEqual({ periodo: '2026-11-16', categoria: 'CAF', proveedor: 'Prov A', comprador: 'CC' });
    expect(filtrosDeUrl({ categoria: 'XYZ', proveedor: '' })).toEqual({ periodo: '', categoria: null, proveedor: null, comprador: null });
    expect(filtrosDeUrl({ categoria: ['BEB', 'CAF'] }).categoria).toBe('BEB');
  });
  it('arma el enlace solo con los filtros puestos y codifica acentos', () => {
    const f = { periodo: '2026-11-16', categoria: null, proveedor: 'JOSÉ & HIJOS', comprador: null };
    expect(hrefCompras(f)).toBe('/comercializadora/compras?periodo=2026-11-16&proveedor=JOS%C3%89+%26+HIJOS');
    expect(hrefCompras(f, { proveedor: null, categoria: 'DES' })).toBe('/comercializadora/compras?periodo=2026-11-16&categoria=DES');
  });
  it('describe los filtros para el encabezado', () => {
    expect(textoFiltros({ periodo: 'x', categoria: 'CAF', proveedor: 'Prov A', comprador: null }, '16 – 22 nov 2026'))
      .toBe('16 – 22 nov 2026 · Café · Proveedor: Prov A');
    expect(textoFiltros({ periodo: 'x', categoria: null, proveedor: null, comprador: 'CC' }, 'Noviembre 2026'))
      .toBe('Noviembre 2026 · Todas las categorías · Comprador: CC');
  });
});
```

```ts
// tests/comercializadora/compras-datos.test.ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { leerDatosCompras, lineasAbiertas } from '@/lib/comercializadora/compras/datos';

// Cliente falso: cada tabla devuelve sus filas en páginas de 1000, como PostgREST.
function dbFalsa(tablas: Record<string, unknown[]>, log: unknown[] = []) {
  return {
    from(t: string) {
      const q = {
        _t: t,
        select: () => q, order: () => q, eq: () => q, not: () => q, limit: () => Promise.resolve({ data: log, error: null }),
        range: (a: number, b: number) => Promise.resolve({ data: (tablas[t] ?? []).slice(a, b + 1), error: null }),
      };
      return q;
    },
  };
}

describe('lectura de compras', () => {
  it('lineasAbiertas: pendiente = pedido − recibido (no negativo) y el nombre del catálogo', () => {
    expect(lineasAbiertas(
      [{ zoho_po_id: 'P1', sku: 'INS-CAF-1', cantidad: 10, cantidad_recibida: 4 }, { zoho_po_id: 'P1', sku: 'X', cantidad: 1, cantidad_recibida: 3 }],
      new Map([['INS-CAF-1', 'Café de grano']]),
    )).toEqual([
      { zoho_po_id: 'P1', sku: 'INS-CAF-1', nombre: 'Café de grano', pendiente: 6 },
      { zoho_po_id: 'P1', sku: 'X', nombre: 'X', pendiente: 0 },
    ]);
  });
  it('lee más de 1000 recepciones y la última sincronización buena', async () => {
    const recs = Array.from({ length: 1500 }, (_, i) => ({ zoho_po_id: `P${i}`, fecha: '2026-11-17', monto: '10', por_categoria: {} }));
    const r = await leerDatosCompras(dbFalsa({ com_compras_recepcion: recs }, [{ fin: '2026-11-26T10:00:00Z' }]));
    expect(r.datos.recepciones).toHaveLength(1500);
    expect(r.datos.recepciones[0].monto).toBe(10);
    expect(r.ultimaSync).toBe('2026-11-26T10:00:00Z');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/comercializadora/compras-filtros.test.ts tests/comercializadora/compras-datos.test.ts`
Expected: FAIL: `Failed to resolve import "@/lib/comercializadora/compras/filtros"`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/comercializadora/compras/filtros.ts
import { type Cat, ETIQUETA_CAT, type FiltrosCompras } from '../../../supabase/functions/_shared/compras/tablero.ts';

export type ParamsCompras = Record<string, string | string[] | undefined>;
const RUTA = '/comercializadora/compras';
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;

export function filtrosDeUrl(sp: ParamsCompras): FiltrosCompras {
  const cat = uno(sp.categoria);
  return {
    periodo: uno(sp.periodo) ?? '',
    categoria: cat && cat in ETIQUETA_CAT ? (cat as Cat) : null,
    proveedor: uno(sp.proveedor),
    comprador: uno(sp.comprador),
  };
}

export function hrefCompras(f: FiltrosCompras, cambio: Partial<FiltrosCompras> = {}): string {
  const x = { ...f, ...cambio };
  const q = new URLSearchParams();
  if (x.periodo) q.set('periodo', x.periodo);
  if (x.categoria) q.set('categoria', x.categoria);
  if (x.proveedor) q.set('proveedor', x.proveedor);
  if (x.comprador) q.set('comprador', x.comprador);
  const s = q.toString();
  return s ? `${RUTA}?${s}` : RUTA;
}

export function textoFiltros(f: FiltrosCompras, etiquetaPeriodo: string): string {
  return [
    etiquetaPeriodo,
    f.categoria ? ETIQUETA_CAT[f.categoria] : 'Todas las categorías',
    f.proveedor ? `Proveedor: ${f.proveedor}` : null,
    f.comprador ? `Comprador: ${f.comprador}` : null,
  ].filter(Boolean).join(' · ');
}
```

```ts
// lib/comercializadora/compras/datos.ts
import 'server-only';
import { com, leerTodoCom } from '@/lib/comercializadora/consultas';
import type { DatosCompras, LineaAbierta, OcT, RecT, VentaT } from '../../../supabase/functions/_shared/compras/tablero.ts';

const n = (x: unknown) => Number(x) || 0;

export function lineasAbiertas(
  lineas: { zoho_po_id: string; sku: string; cantidad: number; cantidad_recibida: number }[],
  nombres: Map<string, string>,
): LineaAbierta[] {
  return lineas.map((l) => ({
    zoho_po_id: String(l.zoho_po_id), sku: String(l.sku), nombre: nombres.get(String(l.sku)) || String(l.sku),
    pendiente: Math.max(0, n(l.cantidad) - n(l.cantidad_recibida)),
  }));
}

/** Todo lo que el tablero lee de Supabase (spec §3: la página no lee Zoho). Lanza con un mensaje claro si algo falla. */
export async function leerDatosCompras(db: unknown): Promise<{ datos: DatosCompras; ultimaSync: string | null }> {
  const [ocs, recs, ventas, lineas, cat, log] = await Promise.all([
    leerTodoCom<OcT>(db, 'com_compras_oc', 'zoho_po_id,folio,proveedor,comprador,emision,arribo,estado,received_status,monto_ins,por_categoria,es_registro', 'zoho_po_id'),
    leerTodoCom<RecT>(db, 'com_compras_recepcion', 'zoho_receive_id,zoho_po_id,fecha,monto,por_categoria', 'zoho_receive_id'),
    leerTodoCom<VentaT>(db, 'com_compras_venta_semana', 'semana,venta_total_ci,por_categoria_ci', 'semana'),
    leerTodoCom<{ zoho_po_id: string; sku: string; cantidad: number; cantidad_recibida: number }>(db, 'com_zoho_oc_lineas', 'zoho_po_id,sku,cantidad,cantidad_recibida', 'zoho_po_id,sku'),
    leerTodoCom<{ sku: string; nombre: string | null }>(db, 'com_catalogo', 'sku,nombre', 'sku'),
    com(db).from('com_sync_log').select('fin').eq('proceso', 'zoho-compras-sync').eq('ok', true).not('fin', 'is', null)
      .order('fin', { ascending: false }).limit(1),
  ]);
  const nombres = new Map(cat.map((c) => [c.sku, c.nombre || c.sku]));
  return {
    datos: {
      ocs: ocs.map((o) => ({ ...o, monto_ins: n(o.monto_ins), por_categoria: o.por_categoria ?? {}, comprador: o.comprador || 'Sin comprador' })),
      recepciones: recs.map((r) => ({ zoho_po_id: r.zoho_po_id, fecha: r.fecha, monto: n(r.monto), por_categoria: r.por_categoria ?? {} })),
      ventas: ventas.map((v) => ({ semana: v.semana, venta_total_ci: n(v.venta_total_ci), por_categoria_ci: v.por_categoria_ci ?? {} })),
      lineas: lineasAbiertas(lineas, nombres),
    },
    ultimaSync: (log?.data?.[0]?.fin as string | undefined) ?? null,
  };
}
```

```ts
// lib/comercializadora/compras/motor.ts — aparte de datos.ts para que la lectura no cargue el motor.
import 'server-only';
import { cafeOrdenesMotor, importacionesMotor, motorPlan, planLocalMotor } from '@/lib/comercializadora/motor';
import { planSemCalc, planSemW, type FuentesPlan } from '@/lib/comercializadora/planAbastos';
import type { Sem } from '../../../supabase/functions/_shared/planSem.ts';

/** La semana del motor del Plan de abastos, igual que «Esta semana» (las tres categorías). */
export async function semDelMotor(db: unknown): Promise<{ ok: true; S: Sem; hoyIso: string } | { ok: false; error: string }> {
  try {
    const m = await motorPlan(db as Parameters<typeof motorPlan>[0]);
    if (!m.ok) return { ok: false, error: m.error };
    const c = planLocalMotor(m);
    const f: FuentesPlan = { cafe: null, imp: null };
    const S = planSemCalc(c, { local: true, cafe: true, imp: true }, planSemW(c, 0), {
      cafe: () => (f.cafe = cafeOrdenesMotor(m)),
      imp: () => (f.imp = importacionesMotor(m, null)),
    });
    return { ok: true, S, hoyIso: c.hoyIso };
  } catch {
    return { ok: false, error: 'No se pudo calcular el plan de compra. Intenta de nuevo en unos minutos.' };
  }
}
```

Antes de escribir `semDelMotor` (en `motor.ts`), abre `app/(comercializadora)/comercializadora/esta-semana/page.tsx:62-87` y copia la forma exacta de llamar a `motorPlan`, `planLocalMotor`, `cafeOrdenesMotor`, `importacionesMotor` y `planSemCalc`. Si una firma difiere de este bloque, manda la de esa página: es la fuente del cálculo de «Esta semana».

En `lib/comercializadora/funciones.ts:3`:

```ts
export type FuncionCom = 'com-minmax' | 'zoho-generar-oc' | 'zoho-sync' | 'zoho-proveedor-minimo' | 'zoho-reporte-semanal' | 'zoho-compras-sync';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/comercializadora/compras-filtros.test.ts tests/comercializadora/compras-datos.test.ts`
Expected: PASS (5 pruebas).

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit -p .`
Expected: sin errores.

```bash
git add lib/comercializadora/compras/filtros.ts lib/comercializadora/compras/datos.ts lib/comercializadora/compras/motor.ts lib/comercializadora/funciones.ts tests/comercializadora/compras-filtros.test.ts tests/comercializadora/compras-datos.test.ts
git commit -m "feat(compras): filtros en la URL y lectura del tablero desde Supabase"
```

---

### Task 3: Plan de compra desde el motor

**Files:**
- Create: `lib/comercializadora/compras/plan.ts`
- Test: `tests/comercializadora/compras-plan.test.ts`

**Interfaces:**
- Consumes: `Sem`, `PSEM_CATS` de `supabase/functions/_shared/planSem.ts`; `ctxFila` de `supabase/functions/_shared/planHoy.ts`; `planKey` de `supabase/functions/_shared/planBuild.ts`; `categoriaSku`, `Categoria` de `_shared/compras/reglas.ts`; `Cat` (tarea 1).
- Produces:
  ```ts
  export type Urgencia = 'Urgente' | 'Pronto' | 'Normal';
  export type FilaPlanCompra = { urgencia: Urgencia; sku: string; nombre: string; proveedor: string; categoria: Categoria; decision: string; inventario: number; faltaSurtir: number; dias: number | null; pedir: [number, number]; costo: [number, number]; llega: string | null; llegaVencida: boolean };
  export type PlanCompra = { filas: FilaPlanCompra[]; urgentes: { n: number; monto: number }; pronto: { n: number; monto: number }; faltan: number };
  export function urgenciaDe(dias: number | null): Urgencia;
  export function planCompra(S: Sem, f: { categoria: Cat | null; proveedor: string | null }, hoy: string): PlanCompra;
  ```

**Reglas:**
- Filas: de todas las categorías del motor (`PSEM_CATS`), artículos con `sem[0] > 0` o `sem[1] > 0`. El plan ya excluye «Compra Unica»: quedan las compras recurrentes.
- Urgencia por días que alcanza (spec: Urgente < 5; Pronto 5–10): `< 5` Urgente, `< 10` Pronto, si no (o null) Normal.
  - Ruling: el motor marca «Pronto» con `diasHoy < dm` (días de entrega del artículo); el tablero usa el corte fijo del spec.
- Inventario = `max(0, tienes)`; si `tienes < 0`, `faltaSurtir = −tienes` (el original: «se muestra 0 y debajo lo que falta surtir»).
- Costo por semana:
  - `r.m[k]` si es mayor que 0 (importaciones);
  - si no, `r.contenedor ? r.costo : q × r.costo`;
  - sin costo, 0.
  - Es la misma regla que `hoyPedidoTexto`.
- Decisión: `r.calc?.accion`; si no hay, «PEDIR» o «PRÓXIMA» según la semana.
- Proveedor: el nombre del grupo del motor. El filtro compara con `clave(x) = planKey(x.normalize('NFD').replace(/\p{Diacritic}/gu, ''))` (sin acentos ni mayúsculas; `planKey` solo baja a minúsculas).
- Categoría: `categoriaSku(r.sku)`; con filtro, solo esa.
- Orden: urgencia, días (null al final), nombre.
- `faltan` = suma de `costo[0]` (lo de esta semana). Las tarjetas suman `costo[0] + costo[1]` de sus filas.

- [ ] **Step 1: Write the failing test**

```ts
// tests/comercializadora/compras-plan.test.ts
import { describe, expect, it } from 'vitest';
import { planCompra, urgenciaDe } from '@/lib/comercializadora/compras/plan';

const fila = (o: Record<string, unknown>) => ({ sku: 'INS-CAF-001', nombre: 'Café', costo: 10, sem: [0, 0], calc: { accion: 'PEDIR', invBase: 50, consumo: 10, diasHoy: 5, disponible: 50 }, llegaOC: null, ...o });
const grupo = (nombre: string, rows: unknown[]) => ({ key: nombre, pk: nombre, cat: 'local', fuente: '', nombre, real: true, rows, monto: [0, 0], n: [0, 0], uds: [0, 0], sinCosto: [0, 0], minimo: 0 });
const S = (provs: unknown[]) => ({ cat: { local: { provs }, cafe: { provs: [] }, imp: { provs: [] } } }) as never;

describe('plan de compra', () => {
  it('urgencia por días que alcanza: <5 urgente, 5–10 pronto', () => {
    expect([0, 4.9, 5, 9.9, 10, null].map(urgenciaDe)).toEqual(['Urgente', 'Urgente', 'Pronto', 'Pronto', 'Normal', 'Normal']);
  });
  it('filas a pedir esta o la próxima semana, con costos, inventario sin negativos y orden por urgencia', () => {
    const p = planCompra(S([
      grupo('JOSÉ Pérez', [
        fila({ sku: 'INS-CAF-001', nombre: 'B café', sem: [3, 0], calc: { accion: 'PEDIR', invBase: -4, consumo: 2, diasHoy: 0, disponible: -4 }, llegaOC: '2026-11-20' }),
        fila({ sku: 'INS-DES-001', nombre: 'A vaso', sem: [0, 2], calc: { accion: 'PRÓXIMA', invBase: 70, consumo: 10, diasHoy: 7, disponible: 70 } }),
        fila({ sku: 'INS-BEB-001', nombre: 'Nada', sem: [0, 0] }),
      ]),
    ]), { categoria: null, proveedor: null }, '2026-11-26');
    expect(p.filas.map((f) => [f.sku, f.urgencia, f.inventario, f.faltaSurtir, f.pedir, f.costo, f.llegaVencida])).toEqual([
      ['INS-CAF-001', 'Urgente', 0, 4, [3, 0], [30, 0], true],
      ['INS-DES-001', 'Pronto', 70, 0, [0, 2], [0, 20], false],
    ]);
    expect(p.urgentes).toEqual({ n: 1, monto: 30 });
    expect(p.pronto).toEqual({ n: 1, monto: 20 });
    expect(p.faltan).toBe(30);
  });
  it('filtra por categoría de SKU y por proveedor sin acentos ni mayúsculas', () => {
    const s = S([grupo('JOSÉ Pérez', [fila({ sku: 'INS-CAF-001', sem: [1, 0] }), fila({ sku: 'INS-DES-001', sem: [1, 0] })]), grupo('Otro', [fila({ sku: 'INS-CAF-002', sem: [1, 0] })])]);
    expect(planCompra(s, { categoria: 'CAF', proveedor: 'jose perez' }, '2026-11-26').filas.map((f) => f.sku)).toEqual(['INS-CAF-001']);
    expect(planCompra(s, { categoria: null, proveedor: 'No existe' }, '2026-11-26').filas).toEqual([]);
  });
});
```

`planKey` (`_shared/planBuild.ts`) solo hace `trim().toLowerCase()`, así que no quita acentos. Por eso `plan.ts` compara con `clave()`, que además quita los diacríticos.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/comercializadora/compras-plan.test.ts`
Expected: FAIL: `Failed to resolve import "@/lib/comercializadora/compras/plan"`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/comercializadora/compras/plan.ts
import { PSEM_CATS, type Sem } from '../../../supabase/functions/_shared/planSem.ts';
import { ctxFila } from '../../../supabase/functions/_shared/planHoy.ts';
import { planKey } from '../../../supabase/functions/_shared/planBuild.ts';
import { type Categoria, categoriaSku } from '../../../supabase/functions/_shared/compras/reglas.ts';
import type { Cat } from '../../../supabase/functions/_shared/compras/tablero.ts';

export type Urgencia = 'Urgente' | 'Pronto' | 'Normal';
export type FilaPlanCompra = {
  urgencia: Urgencia; sku: string; nombre: string; proveedor: string; categoria: Categoria; decision: string;
  inventario: number; faltaSurtir: number; dias: number | null; pedir: [number, number]; costo: [number, number];
  llega: string | null; llegaVencida: boolean;
};
export type PlanCompra = { filas: FilaPlanCompra[]; urgentes: { n: number; monto: number }; pronto: { n: number; monto: number }; faltan: number };

/** Nombre de proveedor comparable entre Zoho y el plan: sin acentos, sin mayúsculas ni espacios en los extremos. */
const clave = (x: string) => planKey(String(x).normalize('NFD').replace(/\p{Diacritic}/gu, ''));

export const urgenciaDe = (dias: number | null): Urgencia => (dias == null ? 'Normal' : dias < 5 ? 'Urgente' : dias < 10 ? 'Pronto' : 'Normal');
const RANGO: Record<Urgencia, number> = { Urgente: 0, Pronto: 1, Normal: 2 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const costoSem = (r: any, k: number, q: number) =>
  Number(r.m?.[k]) > 0 ? Number(r.m[k]) : Number(r.costo) > 0 ? (r.contenedor ? Number(r.costo) : q * Number(r.costo)) : 0;

/** Plan de compra del tablero (spec §3): lo que el motor pide esta semana o la próxima, con urgencia por días que alcanza. */
export function planCompra(S: Sem, f: { categoria: Cat | null; proveedor: string | null }, hoy: string): PlanCompra {
  const filas: FilaPlanCompra[] = [];
  const prov = f.proveedor ? clave(f.proveedor) : null;
  for (const d of PSEM_CATS) {
    for (const g of S.cat[d.id]?.provs ?? []) {
      if (prov && clave(g.nombre) !== prov) continue;
      for (const r of g.rows) {
        const q0 = Number(r.sem?.[0]) || 0, q1 = Number(r.sem?.[1]) || 0;
        if (q0 <= 0 && q1 <= 0) continue;
        const categoria = categoriaSku(r.sku);
        if (f.categoria && categoria !== f.categoria) continue;
        const ctx = ctxFila(r, 0);
        const tienes = Number(ctx?.tienes) || 0;
        const dias = ctx?.diasHoy ?? null;
        const llega: string | null = r.llegaOC ?? null;
        filas.push({
          urgencia: urgenciaDe(dias), sku: String(r.sku), nombre: String(r.nombre ?? r.sku), proveedor: g.nombre, categoria,
          decision: String(r.calc?.accion ?? (q0 > 0 ? 'PEDIR' : 'PRÓXIMA')),
          inventario: Math.max(0, tienes), faltaSurtir: tienes < 0 ? -tienes : 0, dias,
          pedir: [q0, q1], costo: [costoSem(r, 0, q0), costoSem(r, 1, q1)],
          llega, llegaVencida: !!llega && llega < hoy,
        });
      }
    }
  }
  filas.sort((a, b) => RANGO[a.urgencia] - RANGO[b.urgencia] || (a.dias ?? 1e9) - (b.dias ?? 1e9) || a.nombre.localeCompare(b.nombre, 'es'));
  const suma = (u: Urgencia) => {
    const xs = filas.filter((x) => x.urgencia === u);
    return { n: xs.length, monto: xs.reduce((a, x) => a + x.costo[0] + x.costo[1], 0) };
  };
  return { filas, urgentes: suma('Urgente'), pronto: suma('Pronto'), faltan: filas.reduce((a, x) => a + x.costo[0], 0) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/comercializadora/compras-plan.test.ts`
Expected: PASS (3 pruebas).

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/compras/plan.ts tests/comercializadora/compras-plan.test.ts
git commit -m "feat(compras): plan de compra del tablero desde el motor de abastos"
```

---

### Task 4: Gráfica SVG y mensajes de la sincronización

**Files:**
- Create: `lib/comercializadora/compras/grafica.ts`
- Create: `lib/comercializadora/compras/sync.ts`
- Test: `tests/comercializadora/compras-grafica.test.ts`

**Interfaces:**
- Consumes: `PuntoSerie` (tarea 1); `esc` de `lib/comercializadora/exportar/html.ts`; `pesos` de `lib/comercializadora/formato.ts`. (`edadHoras` de `consultas.ts` es `server-only`; `sync.ts` calcula la edad a mano para poder probarse.)
- Produces:
  ```ts
  // grafica.ts — string SVG autocontenido: la pantalla lo incrusta y la descarga (fase 4) también.
  export const COLORES_GRAFICA: { venta: string; compras: string; presupuesto: string };
  export function graficaCompras(serie: PuntoSerie[], o?: { ancho?: number; alto?: number }): string;
  // sync.ts
  export function estadoSync(ultima: string | null, ahora: Date): { texto: string; viejo: boolean; nunca: boolean };
  export function mensajeSync(d: { omitida?: string; ocs?: number; recepciones?: number; facturas?: number; pendientes?: boolean; avisos?: string[] }): string;
  ```

**Reglas:**
- Gráfica: barras agrupadas de venta y compras recibidas por semana, línea punteada del presupuesto (50% de la venta). El eje Y va de 0 al máximo de la serie y tiene 4 líneas guía con montos abreviados («1.2 M», «800 k»). Etiquetas X con el día y el mes abreviado del lunes («16 nov»), una de cada dos si son 16.
- Cada semana lleva un `<g>` con `<title>` («Semana del 16 nov · Venta $1,193,333 · Compras $477,634 (40%) · Presupuesto $596,667»). Es el valor al pasar el cursor, nativo del navegador y sin JavaScript, así que también sirve en el HTML descargado.
- Colores con variables CSS y respaldo fijo para el archivo descargado:
  - Venta: `var(--color-ink, #111111)`.
  - Compras: `var(--color-crema, #a8774a)`.
  - Presupuesto: `var(--color-ok, #2f7a4f)`.
  - Texto: `var(--color-ink-2, #2b2926)`.
  - Guías: `var(--color-line, #e5e0d8)`.
- Antes de usar `--color-line`, confirma en `app/globals.css` que existe; si no, usa el token de borde que use `border-line`.
- `viewBox` fijo y `width="100%"`: se adapta al celular sin desbordar.
- Sincronización:
  - Sin corrida buena: «Sin sincronizar todavía» (`nunca`).
  - Con corrida: «Sincronizado hace N min/h» o «el 24 nov a las 10:15».
  - `viejo` si tiene más de 36 h.
  - Mensaje de la acción:
    - Omitida: «Se sincronizó hace menos de 10 minutos; intenta más tarde».
    - Si no: «Listo: N OCs, N recepciones y N facturas leídas de Zoho», más «; aún faltan documentos por leer, el siguiente ciclo sigue» si `pendientes`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/comercializadora/compras-grafica.test.ts
import { describe, expect, it } from 'vitest';
import { graficaCompras } from '@/lib/comercializadora/compras/grafica';
import { estadoSync, mensajeSync } from '@/lib/comercializadora/compras/sync';

const serie = Array.from({ length: 16 }, (_, i) => ({ semana: `2026-08-${String(3 + i).padStart(2, '0')}`, venta: 1000 * (i + 1), compras: 400 * (i + 1), presupuesto: 500 * (i + 1) }));

describe('gráfica de compras', () => {
  it('SVG autocontenido: una barra de venta y una de compras por semana, línea de presupuesto y títulos al pasar el cursor', () => {
    const s = graficaCompras(serie);
    expect(s.startsWith('<svg')).toBe(true);
    expect(s).toContain('width="100%"');
    expect(s.match(/<g class="semana"/g)).toHaveLength(16);
    expect(s).toContain('<polyline');
    expect(s).toContain('Venta $16,000');
    expect(s).toContain('Compras $6,400.00 (40%)'); // pesos() lleva centavos
    expect(s).not.toContain('<script');
  });
  it('sin datos no divide entre cero', () => {
    const s = graficaCompras(serie.map((p) => ({ ...p, venta: 0, compras: 0, presupuesto: 0 })));
    expect(s).not.toContain('NaN');
    expect(s).not.toContain('Infinity');
  });
});

describe('estado de la sincronización', () => {
  const ahora = new Date('2026-11-26T18:00:00Z');
  it('nunca, reciente y vieja (más de 36 h)', () => {
    expect(estadoSync(null, ahora)).toMatchObject({ nunca: true, viejo: true, texto: 'Sin sincronizar todavía' });
    expect(estadoSync('2026-11-26T17:40:00Z', ahora)).toMatchObject({ nunca: false, viejo: false, texto: 'Sincronizado hace 20 min' });
    expect(estadoSync('2026-11-24T12:00:00Z', ahora).viejo).toBe(true);
  });
  it('mensajes de la acción', () => {
    expect(mensajeSync({ omitida: 'sincronización reciente' })).toBe('Se sincronizó hace menos de 10 minutos; intenta más tarde.');
    expect(mensajeSync({ ocs: 3, recepciones: 2, facturas: 40, pendientes: true }))
      .toBe('Listo: 3 OCs, 2 recepciones y 40 facturas leídas de Zoho; aún faltan documentos por leer, el siguiente ciclo sigue.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/comercializadora/compras-grafica.test.ts`
Expected: FAIL: `Failed to resolve import "@/lib/comercializadora/compras/grafica"`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/comercializadora/compras/grafica.ts
import { esc } from '@/lib/comercializadora/exportar/html';
import { pesos } from '@/lib/comercializadora/formato';
import type { PuntoSerie } from '../../../supabase/functions/_shared/compras/tablero.ts';

export const COLORES_GRAFICA = {
  venta: 'var(--color-ink, #111111)',
  compras: 'var(--color-crema, #a8774a)',
  presupuesto: 'var(--color-ok, #2f7a4f)',
};
const TEXTO = 'var(--color-ink-2, #2b2926)';
const GUIA = 'var(--color-line, #e5e0d8)';
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dia = (iso: string) => `${Number(iso.slice(8, 10))} ${MES[Number(iso.slice(5, 7)) - 1]}`;
const corto = (x: number) => (x >= 1e6 ? `${(x / 1e6).toFixed(1)} M` : x >= 1e3 ? `${Math.round(x / 1e3)} k` : String(Math.round(x)));
const f1 = (x: number) => (Math.round(x * 10) / 10).toString();

/** Venta y compras por semana con el presupuesto (50% de la venta). SVG sin scripts: el valor sale en <title> al pasar el cursor. */
export function graficaCompras(serie: PuntoSerie[], o: { ancho?: number; alto?: number } = {}): string {
  const W = o.ancho ?? 720, H = o.alto ?? 260, izq = 48, der = 8, arr = 10, abj = 28;
  const ancho = W - izq - der, alto = H - arr - abj;
  const max = Math.max(1, ...serie.flatMap((p) => [p.venta, p.compras, p.presupuesto]));
  const y = (v: number) => arr + alto - (v / max) * alto;
  const paso = ancho / Math.max(1, serie.length);
  const barra = Math.max(2, paso * 0.34);
  const guias = [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const v = max * t, yy = f1(y(v));
    return `<line x1="${izq}" x2="${W - der}" y1="${yy}" y2="${yy}" stroke="${GUIA}" stroke-width="1"/>` +
      `<text x="${izq - 6}" y="${yy}" text-anchor="end" dominant-baseline="middle" font-size="10" fill="${TEXTO}">${esc(corto(v))}</text>`;
  }).join('');
  const salto = serie.length > 8 ? 2 : 1;
  const grupos = serie.map((p, i) => {
    const x0 = izq + i * paso + (paso - barra * 2) / 2;
    const pct = p.venta > 0 ? ` (${Math.round((p.compras / p.venta) * 100)}%)` : '';
    const titulo = `Semana del ${dia(p.semana)} · Venta ${pesos(p.venta)} · Compras ${pesos(p.compras)}${pct} · Presupuesto ${pesos(p.presupuesto)}`;
    const etiqueta = (serie.length - 1 - i) % salto === 0
      ? `<text x="${f1(izq + i * paso + paso / 2)}" y="${H - 8}" text-anchor="middle" font-size="10" fill="${TEXTO}">${esc(dia(p.semana))}</text>` : '';
    return `<g class="semana"><title>${esc(titulo)}</title>` +
      `<rect x="${f1(izq + i * paso)}" y="${arr}" width="${f1(paso)}" height="${alto}" fill="transparent"/>` +
      `<rect x="${f1(x0)}" y="${f1(y(p.venta))}" width="${f1(barra)}" height="${f1(arr + alto - y(p.venta))}" fill="${COLORES_GRAFICA.venta}" rx="1.5"/>` +
      `<rect x="${f1(x0 + barra)}" y="${f1(y(p.compras))}" width="${f1(barra)}" height="${f1(arr + alto - y(p.compras))}" fill="${COLORES_GRAFICA.compras}" rx="1.5"/>` +
      `${etiqueta}</g>`;
  }).join('');
  const linea = serie.map((p, i) => `${f1(izq + i * paso + paso / 2)},${f1(y(p.presupuesto))}`).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Venta, compras recibidas y presupuesto por semana">` +
    `${guias}${grupos}<polyline points="${linea}" fill="none" stroke="${COLORES_GRAFICA.presupuesto}" stroke-width="2" stroke-dasharray="5 4"/></svg>`;
}
```

```ts
// lib/comercializadora/compras/sync.ts
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export function estadoSync(ultima: string | null, ahora: Date): { texto: string; viejo: boolean; nunca: boolean } {
  if (!ultima) return { texto: 'Sin sincronizar todavía', viejo: true, nunca: true };
  const t = new Date(ultima);
  const min = Math.max(0, Math.round((ahora.getTime() - t.getTime()) / 60_000));
  const viejo = min > 36 * 60;
  if (min < 60) return { texto: `Sincronizado hace ${min} min`, viejo, nunca: false };
  if (min < 24 * 60) return { texto: `Sincronizado hace ${Math.round(min / 60)} h`, viejo, nunca: false };
  const cdmx = new Date(t.toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  const hh = `${cdmx.getHours()}`.padStart(2, '0'), mm = `${cdmx.getMinutes()}`.padStart(2, '0');
  return { texto: `Sincronizado el ${cdmx.getDate()} ${MES[cdmx.getMonth()]} a las ${hh}:${mm}`, viejo, nunca: false };
}

export function mensajeSync(d: { omitida?: string; ocs?: number; recepciones?: number; facturas?: number; pendientes?: boolean }): string {
  if (d.omitida) return 'Se sincronizó hace menos de 10 minutos; intenta más tarde.';
  const base = `Listo: ${d.ocs ?? 0} OCs, ${d.recepciones ?? 0} recepciones y ${d.facturas ?? 0} facturas leídas de Zoho`;
  return d.pendientes ? `${base}; aún faltan documentos por leer, el siguiente ciclo sigue.` : `${base}.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/comercializadora/compras-grafica.test.ts`
Expected: PASS (4 pruebas).

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/compras/grafica.ts lib/comercializadora/compras/sync.ts tests/comercializadora/compras-grafica.test.ts
git commit -m "feat(compras): gráfica SVG del tablero y estado de la sincronización"
```

---

### Task 5: La página, sus componentes, la acción y el menú

**Files:**
- Create: `components/comercializadora/compras/filtros.tsx` (cliente)
- Create: `components/comercializadora/compras/sincronizar.tsx` (cliente)
- Create: `components/comercializadora/compras/indicadores.tsx`
- Create: `components/comercializadora/compras/grafica.tsx`
- Create: `components/comercializadora/compras/plan.tsx`
- Create: `components/comercializadora/compras/detalle.tsx`
- Create: `app/(comercializadora)/comercializadora/compras/page.tsx`
- Modify: `app/(comercializadora)/comercializadora/acciones.ts` (acción `sincronizarCompras`)
- Modify: `components/portal/navegacion.tsx:195` (enlace)
- Test: `tests/comercializadora/compras-vista.test.tsx`

**Interfaces:**
- Consumes: todo lo producido en las tareas 1–4; `Encabezado`, `Kpi` de `components/portal/piezas.tsx`; `SeccionTitulo`, `ErrorSeccion` de `components/comercializadora/reporte-semanal/piezas.tsx`; `editorCom`, `Resultado` y `SOLO_LECTURA` ya existentes en `acciones.ts`; `invocarFuncion`.
- Produces:
  ```ts
  // acciones.ts
  export async function sincronizarCompras(): Promise<Resultado<{ mensaje: string }>>;
  // componentes (props exactas)
  export function FiltrosCompras(p: { filtros: FiltrosCompras; opciones: TableroCompras['opciones'] }): JSX.Element;      // filtros.tsx
  export function SincronizarCompras(): JSX.Element;                                                                   // sincronizar.tsx
  export function IndicadoresCompras(p: { t: TableroCompras; faltan: number | null }): JSX.Element;                    // indicadores.tsx
  export function GraficaCompras(p: { serie: PuntoSerie[] }): JSX.Element;                                             // grafica.tsx
  export function PlanCompraVista(p: { plan: PlanCompra; porLlegar: OcPorLlegar[] }): JSX.Element;                     // plan.tsx
  export function DetalleCompras(p: { t: TableroCompras }): JSX.Element;                                                // detalle.tsx
  ```

**Contenido de cada pieza:**
- **Encabezado** (`Encabezado area="Comercializadora" titulo="Compras"`). Descripción: «Venta, compras recibidas y entregas de proveedores · {textoFiltros}. Datos de Supabase sincronizados desde Zoho Books.» Lleva el estado de la sincronización (`estadoSync`), con un aviso `bg-warn-soft` si `viejo && !nunca`, y `SincronizarCompras` solo si `puedeEditarCom(accesos)`.
- **Sin sincronización previa** (`datos.ocs.length === 0 && datos.ventas.length === 0`): solo el encabezado y `role="status"` con «Todavía no hay datos de compras. La primera sincronización tarda varias corridas; vuelve en unos minutos.». Para editores sale además el botón de sincronizar.
- **Filtros** (cliente):
  - Cuatro `<select>` con etiqueta: Periodo (semanas y luego meses, del modelo), Categoría (Todas + `ETIQUETA_CAT`), Proveedor (Todos + opciones) y Comprador (Todos + opciones).
  - Al cambiar cualquiera: `router.push(hrefCompras(filtros, cambio))` dentro de `useTransition`.
  - Enlace «Restablecer filtros» a `/comercializadora/compras`.
  - Grid `grid gap-3 *:min-w-0 sm:grid-cols-2 lg:grid-cols-5`.
- **Indicadores**: 9 tarjetas con `Kpi` en grid `grid gap-3 *:min-w-0 sm:grid-cols-2 xl:grid-cols-3`. La nota de cada una compara con el periodo anterior («Anterior: $X»).
  1. Venta (`pesos(k.venta)`).
  2. Compras recibidas.
  3. Compras / venta · meta 45–55%: porcentaje sin decimales o «—». Tono: `ok` → `ok`, `cerca` → `bajo`, `fuera` → `pierde`.
  4. OCs que llegaron: `n`, con la nota «{mismas} elaboradas en el periodo · {antes} antes».
  5. Entregas a tiempo: `pct` o «—», con la nota «{aTiempo} a tiempo · {tarde} tarde · {sinFecha} sin fecha».
  6. Lead time promedio: «{lead} días» o «—».
  7. Mayor compra del periodo: el nombre del proveedor y su monto, o «—».
  8. OCs vencidas sin recibir: `n` y monto.
  9. Faltan por comprar: `pesos(faltan)`, o «—» con la nota «No se pudo calcular el plan» si `faltan === null`.
  - Iconos lucide: `ShoppingBag`, `PackageCheck`, `Percent`, `Truck`, `Clock`, `Timer`, `Trophy`, `AlertTriangle`, `ListTodo`.
- **Gráfica**:
  - Tarjeta `rounded-2xl border border-line bg-surface p-4`.
  - Título «Venta, compras y presupuesto por semana».
  - Nota «Con IVA, sin DODO Pizza ni Compras The Coffee, igual al Reporte semanal. Presupuesto = 50% de la venta.».
  - Leyenda con `COLORES_GRAFICA`.
  - `<div dangerouslySetInnerHTML={{ __html: graficaCompras(serie) }} />`. Es seguro porque `graficaCompras` escapa todo el texto con `esc`.
- **Plan de compra**:
  - `SeccionTitulo num="03"` «Plan de compra · Plan de abastos».
  - Tres tarjetas: Urgentes (menos de 5 días), Pronto (5 a 10 días) e Insumos por llegar (`porLlegar.length` y su monto).
  - Tabla con `overflow-x-auto`. Columnas: Urgencia, Artículo / SKU, Proveedor, Decisión, Inventario (y «faltan {faltaSurtir} por surtir» debajo si > 0), Días que alcanza, Pedir esta, Costo esta, Pedir próxima, Costo próxima, Llega (en `text-bad` si `llegaVencida`).
  - Si el plan falla: `<ErrorSeccion error={…} />` y el resto de la página sale igual.
- **Detalle plegable**: dos `<details>`.
  - «OCs por proveedor del periodo ({n})». Tabla: Proveedor, OCs, Monto, Registro, A tiempo, Atrasadas, Pendientes (vencidas / en plazo) y Lead time.
  - «OCs por llegar ({n})». Por OC: folio, proveedor, arribo, estado (Vencida en `text-bad`) y monto, con la lista de artículos («SKU · nombre ×pendiente»).
- **Pie**: «Compras = mercancía de órdenes de compra recibida en la semana; no pagos. Los meses suman las semanas que empiezan en ese mes.».

- [ ] **Step 1: Write the failing test**

```tsx
// tests/comercializadora/compras-vista.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock('@/app/(comercializadora)/comercializadora/acciones', () => ({ sincronizarCompras: vi.fn(async () => ({ ok: true, mensaje: 'Listo: 1 OCs, 0 recepciones y 2 facturas leídas de Zoho.' })) }));

import { FiltrosCompras } from '@/components/comercializadora/compras/filtros';
import { IndicadoresCompras } from '@/components/comercializadora/compras/indicadores';
import { SincronizarCompras } from '@/components/comercializadora/compras/sincronizar';
import { armarTablero, periodoDe } from '../../supabase/functions/_shared/compras/tablero.ts';

const t = armarTablero({
  ocs: [{ zoho_po_id: 'P1', folio: 'COM-OC-1', proveedor: 'Prov A', comprador: 'CC', emision: '2026-11-17', arribo: '2026-11-19', estado: 'open', received_status: 'received', monto_ins: 1000, por_categoria: { CAF: 1000 }, es_registro: false }],
  recepciones: [{ zoho_po_id: 'P1', fecha: '2026-11-19', monto: 2000, por_categoria: { CAF: 2000 } }],
  ventas: [{ semana: '2026-11-16', venta_total_ci: 4000, por_categoria_ci: { CAF: 4000 } }],
  lineas: [],
}, { periodo: '2026-11-16', categoria: null, proveedor: null, comprador: null }, '2026-11-26');

describe('vista del tablero de compras', () => {
  it('los 9 indicadores con su semáforo y el plan que no se pudo calcular', () => {
    render(<IndicadoresCompras t={t} faltan={null} />);
    for (const e of ['Venta', 'Compras recibidas', 'Compras / venta · meta 45–55%', 'OCs que llegaron', 'Entregas a tiempo', 'Lead time promedio', 'Mayor compra del periodo', 'OCs vencidas sin recibir', 'Faltan por comprar'])
      expect(screen.getByText(e)).toBeTruthy();
    expect(screen.getByText('50%')).toBeTruthy();
    expect(screen.getByText('No se pudo calcular el plan')).toBeTruthy();
  });
  it('cambiar la categoría lleva a la URL con el filtro y conserva el periodo', () => {
    render(<FiltrosCompras filtros={t.filtros} opciones={t.opciones} />);
    fireEvent.change(screen.getByLabelText('Categoría'), { target: { value: 'CAF' } });
    expect(push).toHaveBeenCalledWith('/comercializadora/compras?periodo=2026-11-16&categoria=CAF');
    expect(screen.getByRole('link', { name: 'Restablecer filtros' }).getAttribute('href')).toBe('/comercializadora/compras');
  });
  it('Sincronizar ahora muestra el resultado', async () => {
    render(<SincronizarCompras />);
    fireEvent.click(screen.getByRole('button', { name: /Sincronizar ahora/ }));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('Listo');
  });
  it('periodoDe sigue el mismo periodo que la vista', () => {
    expect(t.periodo.clave).toBe(periodoDe('2026-11-16', '2026-11-26').clave);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/comercializadora/compras-vista.test.tsx`
Expected: FAIL: `Failed to resolve import "@/components/comercializadora/compras/filtros"`.

- [ ] **Step 3: Write the action and the client components**

En `app/(comercializadora)/comercializadora/acciones.ts`, junto a las demás acciones (usa `editorCom`, `SOLO_LECTURA` e `invocarFuncion`, que ya están en el archivo):

```ts
/** «Sincronizar ahora» del tablero de compras (editores). La función respeta su enfriamiento de 10 minutos. */
export async function sincronizarCompras(): Promise<Resultado<{ mensaje: string }>> {
  if (!(await editorCom())) return { error: SOLO_LECTURA };
  const r = await invocarFuncion('zoho-compras-sync', {}, { timeoutMs: 140_000 });
  if (!r.ok) return { error: r.error };
  revalidatePath('/comercializadora/compras');
  return { ok: true, mensaje: mensajeSync(r.datos as Parameters<typeof mensajeSync>[0]) };
}
```

Importa `mensajeSync` de `@/lib/comercializadora/compras/sync`. Si `revalidatePath` aún no está importado en `acciones.ts`, impórtalo de `next/cache` (revisa en `node_modules/next/dist/docs/` que siga siendo la API en esta versión).

```tsx
// components/comercializadora/compras/filtros.tsx
'use client';
import Link from 'next/link';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { hrefCompras } from '@/lib/comercializadora/compras/filtros';
import { ETIQUETA_CAT, type Cat, type FiltrosCompras as F, type TableroCompras } from '../../../supabase/functions/_shared/compras/tablero.ts';

const CLASE = 'rounded-[10px] border border-line bg-surface px-2 py-1.5 text-sm text-ink';

export function FiltrosCompras({ filtros, opciones }: { filtros: F; opciones: TableroCompras['opciones'] }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const ir = (cambio: Partial<F>) => iniciar(() => router.push(hrefCompras(filtros, cambio)));
  const campo = (etiqueta: string, valor: string, cambio: (v: string) => Partial<F>, opcionesHtml: React.ReactNode) => (
    <label className="grid gap-1 text-xs text-muted-foreground">
      {etiqueta}
      <select aria-label={etiqueta} className={CLASE} value={valor} disabled={pendiente} onChange={(e) => ir(cambio(e.target.value))}>{opcionesHtml}</select>
    </label>
  );
  return (
    <div className="mb-4 grid items-end gap-3 *:min-w-0 sm:grid-cols-2 lg:grid-cols-5">
      {campo('Periodo', filtros.periodo, (v) => ({ periodo: v }), opciones.periodos.map((p) => <option key={p.clave} value={p.clave}>{p.tipo === 'mes' ? `Mes · ${p.etiqueta}` : p.etiqueta}</option>))}
      {campo('Categoría', filtros.categoria ?? '', (v) => ({ categoria: (v || null) as Cat | null }), [<option key="" value="">Todas</option>, ...Object.entries(ETIQUETA_CAT).map(([k, e]) => <option key={k} value={k}>{e}</option>)])}
      {campo('Proveedor', filtros.proveedor ?? '', (v) => ({ proveedor: v || null }), [<option key="" value="">Todos</option>, ...opciones.proveedores.map((p) => <option key={p} value={p}>{p}</option>)])}
      {campo('Comprador', filtros.comprador ?? '', (v) => ({ comprador: v || null }), [<option key="" value="">Todos</option>, ...opciones.compradores.map((p) => <option key={p} value={p}>{p}</option>)])}
      <Link href="/comercializadora/compras" className="pb-2 text-sm font-semibold underline">Restablecer filtros</Link>
    </div>
  );
}
```

Si el periodo de la URL no está entre las opciones (por ejemplo, una semana sin venta guardada), agrega esa opción al principio de la lista para que el `<select>` muestre el periodo real. Pasa `periodoActual: Periodo` desde la página si hace falta, y déjalo en el ledger como `Ruling:`.

```tsx
// components/comercializadora/compras/sincronizar.tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { sincronizarCompras } from '@/app/(comercializadora)/comercializadora/acciones';

export function SincronizarCompras() {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" disabled={pendiente} className="inline-flex items-center gap-1 text-sm font-semibold underline"
        onClick={() => iniciar(async () => {
          const r = await sincronizarCompras();
          setMsg('error' in r ? { ok: false, texto: r.error } : { ok: true, texto: r.mensaje });
          router.refresh();
        })}>
        <RefreshCw size={14} aria-hidden="true" className={pendiente ? 'animate-spin' : undefined} />
        {pendiente ? 'Leyendo Zoho (hasta 2 min)…' : 'Sincronizar ahora'}
      </button>
      {msg && <span role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-xs text-ok' : 'text-xs text-bad'}>{msg.texto}</span>}
    </span>
  );
}
```

- [ ] **Step 4: Write the server components**

`components/comercializadora/compras/indicadores.tsx`:

```tsx
import { AlertTriangle, Clock, ListTodo, PackageCheck, Percent, ShoppingBag, Timer, Trophy, Truck } from 'lucide-react';
import { Kpi } from '@/components/portal/piezas';
import { pesos } from '@/lib/comercializadora/formato';
import type { Semaforo, TableroCompras } from '../../../supabase/functions/_shared/compras/tablero.ts';

const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const TONO: Record<Semaforo, 'ok' | 'bajo' | 'pierde'> = { ok: 'ok', cerca: 'bajo', fuera: 'pierde' };

export function IndicadoresCompras({ t, faltan }: { t: TableroCompras; faltan: number | null }) {
  const { k, kAnt } = t;
  const ant = `Anterior (${t.anterior.etiqueta}):`;
  return (
    <section aria-label="Indicadores" className="mb-6 grid gap-3 *:min-w-0 sm:grid-cols-2 xl:grid-cols-3">
      <Kpi etiqueta="Venta" icono={ShoppingBag} valor={pesos(k.venta)} nota={`${ant} ${pesos(kAnt.venta)}`} />
      <Kpi etiqueta="Compras recibidas" icono={PackageCheck} valor={pesos(k.compras)} nota={`${ant} ${pesos(kAnt.compras)}`} />
      <Kpi etiqueta="Compras / venta · meta 45–55%" icono={Percent} valor={pct(k.ratio)} tono={k.semaforo ? TONO[k.semaforo] : 'neutro'} nota={`${ant} ${pct(kAnt.ratio)}`} />
      <Kpi etiqueta="OCs que llegaron" icono={Truck} valor={k.llegaron.n} nota={`${k.llegaron.mismas} elaboradas en el periodo · ${k.llegaron.antes} antes · ${ant} ${kAnt.llegaron.n}`} />
      <Kpi etiqueta="Entregas a tiempo" icono={Clock} valor={pct(k.entregas.pct)} nota={`${k.entregas.aTiempo} a tiempo · ${k.entregas.tarde} tarde · ${k.entregas.sinFecha} sin fecha · ${ant} ${pct(kAnt.entregas.pct)}`} />
      <Kpi etiqueta="Lead time promedio" icono={Timer} valor={k.lead == null ? '—' : `${k.lead} días`} nota={`De la emisión de la OC a su primera recepción · ${ant} ${kAnt.lead == null ? '—' : `${kAnt.lead} días`}`} />
      <Kpi etiqueta="Mayor compra del periodo" icono={Trophy} valor={k.mayor ? pesos(k.mayor.monto) : '—'} nota={k.mayor ? k.mayor.proveedor : 'Sin compras recibidas'} />
      <Kpi etiqueta="OCs vencidas sin recibir" icono={AlertTriangle} valor={t.vencidas.n} tono={t.vencidas.n ? 'pierde' : 'neutro'} nota={`${pesos(t.vencidas.monto)} con arribo esperado ya pasado`} />
      <Kpi etiqueta="Faltan por comprar" icono={ListTodo} valor={faltan == null ? '—' : pesos(faltan)} nota={faltan == null ? 'No se pudo calcular el plan' : 'Lo que el plan de abastos pide esta semana'} />
    </section>
  );
}
```

`components/comercializadora/compras/grafica.tsx`:

```tsx
import { COLORES_GRAFICA, graficaCompras } from '@/lib/comercializadora/compras/grafica';
import type { PuntoSerie } from '../../../supabase/functions/_shared/compras/tablero.ts';

export function GraficaCompras({ serie }: { serie: PuntoSerie[] }) {
  const ley = [['Venta', COLORES_GRAFICA.venta], ['Compras recibidas', COLORES_GRAFICA.compras], ['Presupuesto (50%)', COLORES_GRAFICA.presupuesto]];
  return (
    <section className="mb-6 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <h2 className="font-semibold">Venta, compras y presupuesto por semana</h2>
      <p className="mb-2 text-xs text-muted-foreground">Con IVA, sin DODO Pizza ni Compras The Coffee, igual al Reporte semanal. Presupuesto = 50% de la venta. Pasa el cursor sobre una semana para ver sus valores.</p>
      <div className="mb-2 flex flex-wrap gap-3 text-xs text-ink-2">
        {ley.map(([n, c]) => <span key={n} className="inline-flex items-center gap-1"><i aria-hidden="true" className="inline-block size-2.5 rounded-sm" style={{ background: c }} />{n}</span>)}
      </div>
      {/* graficaCompras escapa todo el texto (esc) y no lleva scripts. */}
      <div dangerouslySetInnerHTML={{ __html: graficaCompras(serie) }} />
    </section>
  );
}
```

`components/comercializadora/compras/plan.tsx`:

```tsx
import { pesos, numero } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import type { PlanCompra } from '@/lib/comercializadora/compras/plan';
import type { OcPorLlegar } from '../../../supabase/functions/_shared/compras/tablero.ts';

const TONO_URG = { Urgente: 'text-bad font-semibold', Pronto: 'text-warn font-semibold', Normal: 'text-ink-2' } as const;

export function PlanCompraVista({ plan, porLlegar }: { plan: PlanCompra; porLlegar: OcPorLlegar[] }) {
  const tarjeta = (t: string, v: string, nota: string, clase: string) => (
    <div className="rounded-2xl border border-line bg-surface p-4"><p className="text-sm text-ink-2">{t}</p><p className={`mt-1 font-display text-2xl font-black ${clase}`}>{v}</p><p className="mt-1 text-xs text-muted-foreground">{nota}</p></div>
  );
  return (
    <>
      <p className="mb-3 max-w-4xl text-xs text-muted-foreground">Artículos de compra recurrente que el plan de abastos marca para pedir esta semana o la próxima. Días que alcanza = inventario entre venta diaria (Urgente: menos de 5 días; Pronto: 5 a 10). Llega: arribo esperado de la OC abierta (en rojo si ya pasó).</p>
      <div className="mb-3 grid gap-3 *:min-w-0 sm:grid-cols-3">
        {tarjeta('Urgentes (menos de 5 días)', String(plan.urgentes.n), pesos(plan.urgentes.monto), 'text-bad')}
        {tarjeta('Pronto (5 a 10 días)', String(plan.pronto.n), pesos(plan.pronto.monto), 'text-warn')}
        {tarjeta('Insumos por llegar', String(porLlegar.length), pesos(porLlegar.reduce((a, o) => a + o.monto, 0)), '')}
      </div>
      {plan.filas.length === 0 ? <p className="mb-6 text-sm text-ink-2">El plan no pide nada esta semana ni la próxima con estos filtros.</p> : (
        <div className="mb-6 overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[56rem] text-sm tabular">
            <thead className="bg-surface-2 text-left text-xs text-ink-2"><tr>
              {['Urgencia', 'Artículo', 'Proveedor', 'Decisión', 'Inventario', 'Días que alcanza', 'Pedir esta', 'Costo esta', 'Pedir próxima', 'Costo próxima', 'Llega'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
            </tr></thead>
            <tbody>{plan.filas.map((f) => (
              <tr key={`${f.proveedor}|${f.sku}`} className="border-t border-line align-top">
                <td className={`px-3 py-2 ${TONO_URG[f.urgencia]}`}>{f.urgencia}</td>
                <td className="px-3 py-2">{f.nombre}<div className="text-xs text-muted-foreground">{f.sku}</div></td>
                <td className="px-3 py-2">{f.proveedor}</td>
                <td className="px-3 py-2">{f.decision}</td>
                <td className="px-3 py-2 text-right">{numero(f.inventario)}{f.faltaSurtir > 0 && <div className="text-xs text-bad">faltan {numero(f.faltaSurtir)} por surtir</div>}</td>
                <td className="px-3 py-2 text-right">{f.dias == null ? '—' : numero(Math.round(f.dias * 10) / 10)}</td>
                <td className="px-3 py-2 text-right">{numero(f.pedir[0])}</td>
                <td className="px-3 py-2 text-right">{pesos(f.costo[0])}</td>
                <td className="px-3 py-2 text-right">{numero(f.pedir[1])}</td>
                <td className="px-3 py-2 text-right">{pesos(f.costo[1])}</td>
                <td className={`px-3 py-2 ${f.llegaVencida ? 'text-bad font-semibold' : ''}`}>{f.llega ? fechaCorta(f.llega) : '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </>
  );
}
```

`components/comercializadora/compras/detalle.tsx`:

```tsx
import { pesos, numero } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import type { TableroCompras } from '../../../supabase/functions/_shared/compras/tablero.ts';

export function DetalleCompras({ t }: { t: TableroCompras }) {
  const cab = 'bg-surface-2 text-left text-xs text-ink-2';
  return (
    <div className="mb-6 grid gap-3">
      <details className="rounded-2xl border border-line bg-surface p-4">
        <summary className="cursor-pointer font-semibold">OCs por proveedor del periodo ({t.proveedores.length})</summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[44rem] text-sm tabular">
            <thead className={cab}><tr>{['Proveedor', 'OCs', 'Monto', 'Registro', 'A tiempo', 'Atrasadas', 'Pendientes (vencidas / en plazo)', 'Lead time'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody>{t.proveedores.map((p) => (
              <tr key={p.proveedor} className="border-t border-line">
                <td className="px-3 py-2">{p.proveedor}</td><td className="px-3 py-2 text-right">{p.ocs}</td><td className="px-3 py-2 text-right">{pesos(p.monto)}</td>
                <td className="px-3 py-2 text-right">{p.registro}</td><td className="px-3 py-2 text-right">{p.aTiempo}</td><td className="px-3 py-2 text-right">{p.atrasadas}</td>
                <td className="px-3 py-2 text-right">{p.pendVencidas} / {p.pendEnPlazo}</td><td className="px-3 py-2 text-right">{p.lead == null ? '—' : `${numero(p.lead)} días`}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </details>
      <details className="rounded-2xl border border-line bg-surface p-4">
        <summary className="cursor-pointer font-semibold">OCs por llegar ({t.porLlegar.length})</summary>
        <ul className="mt-3 grid gap-2">{t.porLlegar.map((o) => (
          <li key={o.folio} className="rounded-xl border border-line p-3 text-sm">
            <div className="flex flex-wrap gap-x-3"><b>{o.folio}</b><span>{o.proveedor}</span><span>{o.arribo ? `Arribo ${fechaCorta(o.arribo)}` : 'Sin fecha de arribo'}</span>
              <span className={o.estado === 'Vencida' ? 'font-semibold text-bad' : 'text-ink-2'}>{o.estado}</span><span className="ml-auto">{pesos(o.monto)}</span></div>
            {o.articulos.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{o.articulos.map((a) => `${a.sku} · ${a.nombre} ×${numero(a.pendiente)}`).join('; ')}</p>}
          </li>
        ))}</ul>
      </details>
    </div>
  );
}
```

- [ ] **Step 5: Write the page and the menu link**

```tsx
// app/(comercializadora)/comercializadora/compras/page.tsx
import { Encabezado } from '@/components/portal/piezas';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import { leerDatosCompras } from '@/lib/comercializadora/compras/datos';
import { semDelMotor } from '@/lib/comercializadora/compras/motor';
import { filtrosDeUrl, textoFiltros, type ParamsCompras } from '@/lib/comercializadora/compras/filtros';
import { planCompra } from '@/lib/comercializadora/compras/plan';
import { estadoSync } from '@/lib/comercializadora/compras/sync';
import { armarTablero } from '../../../../supabase/functions/_shared/compras/tablero.ts';
import { ErrorSeccion, SeccionTitulo } from '@/components/comercializadora/reporte-semanal/piezas';
import { FiltrosCompras } from '@/components/comercializadora/compras/filtros';
import { SincronizarCompras } from '@/components/comercializadora/compras/sincronizar';
import { IndicadoresCompras } from '@/components/comercializadora/compras/indicadores';
import { GraficaCompras } from '@/components/comercializadora/compras/grafica';
import { PlanCompraVista } from '@/components/comercializadora/compras/plan';
import { DetalleCompras } from '@/components/comercializadora/compras/detalle';

// «Sincronizar ahora» espera a la función (hasta ~80 s de lectura de Zoho).
export const maxDuration = 150;

export default async function ComprasPagina({ searchParams }: { searchParams: Promise<ParamsCompras> }) {
  const { db, accesos } = await sesionComercializadora();
  const hoy = hoyCdmx();
  const editor = puedeEditarCom(accesos);
  const [{ datos, ultimaSync }, motor] = await Promise.all([leerDatosCompras(db), semDelMotor(db)]);
  const t = armarTablero(datos, filtrosDeUrl(await searchParams), hoy);
  const sync = estadoSync(ultimaSync, new Date());
  const encabezado = (
    <Encabezado area="Comercializadora" titulo="Compras"
      descripcion={`Venta, compras recibidas y entregas de proveedores · ${textoFiltros(t.filtros, t.periodo.etiqueta)}. Datos sincronizados desde Zoho Books.`}>
      <span className="text-sm text-ink-2">{sync.texto}</span>
      {editor && <SincronizarCompras />}
    </Encabezado>
  );
  if (datos.ocs.length === 0 && datos.ventas.length === 0)
    return (<>{encabezado}<p role="status" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">Todavía no hay datos de compras. La primera sincronización tarda varias corridas; vuelve en unos minutos.</p></>);
  const plan = motor.ok ? planCompra(motor.S, t.filtros, hoy) : null;
  return (
    <>
      {encabezado}
      {sync.viejo && !sync.nunca && <p role="status" className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">La última sincronización buena tiene más de 36 horas: las cifras pueden estar atrasadas.</p>}
      <FiltrosCompras filtros={t.filtros} opciones={t.opciones} />
      <SeccionTitulo num="01">Indicadores · {t.periodo.etiqueta}</SeccionTitulo>
      <IndicadoresCompras t={t} faltan={plan ? plan.faltan : null} />
      <SeccionTitulo num="02">Evolución</SeccionTitulo>
      <GraficaCompras serie={t.serie} />
      <SeccionTitulo num="03">Plan de compra · Plan de abastos</SeccionTitulo>
      {plan ? <PlanCompraVista plan={plan} porLlegar={t.porLlegar} /> : <ErrorSeccion error={motor.ok ? '' : motor.error} />}
      <SeccionTitulo num="04">Detalle</SeccionTitulo>
      <DetalleCompras t={t} />
      <p className="mt-8 border-t border-line pt-4 text-center text-xs text-muted-foreground">
        Compras = mercancía de órdenes de compra recibida; no pagos. Venta y compras con IVA. Los meses suman las semanas que empiezan en ese mes. OCs en borrador y de registro no cuentan como elaboradas.
      </p>
    </>
  );
}
```

Revisa en `node_modules/next/dist/docs/` que `searchParams` como `Promise` y `export const maxDuration` sigan siendo así en esta versión. `reporte-semanal/page.tsx` ya los usa: copia su forma.

En `components/portal/navegacion.tsx`, justo después del enlace del Reporte semanal (línea 195):

```tsx
      { href: '/comercializadora/compras', nombre: 'Compras', icono: PackageCheck },
```

Agrega `PackageCheck` al import de `lucide-react` del archivo. Si ya hay un enlace llamado «Compras» en otro menú, usa «Tablero de compras». Busca primero con `grep -n "nombre: 'Compras'" components/portal/navegacion.tsx`.

- [ ] **Step 6: Run the tests, typecheck and lint**

Run: `npx vitest run tests/comercializadora/compras-vista.test.tsx`
Expected: PASS (4 pruebas).

Run: `npm test` y `npx tsc --noEmit -p .` y `npm run lint`
Expected: todo en verde. Si una prueba existente cuenta los enlaces del menú, actualízala con el nuevo enlace.

- [ ] **Step 7: Commit**

```bash
git add app/(comercializadora)/comercializadora/compras components/comercializadora/compras app/(comercializadora)/comercializadora/acciones.ts components/portal/navegacion.tsx tests/comercializadora/compras-vista.test.tsx
git commit -m "feat(compras): tablero de compras con filtros, indicadores, gráfica y plan de compra"
```

---

### Task 6: Verificación en el navegador y cierre

**Files:**
- Modify: `docs/superpowers/specs/2026-11-25-compras-tablero-y-descargas-design.md` (§7, si hubo diferencias de paridad o decisiones nuevas)

- [ ] **Step 1: Levantar el portal del worktree**

Usa la configuración `portal-compras` de `.claude/launch.json` del checkout principal (`npm --prefix` al worktree, puerto 3001) con `preview_start`. El `.env.local` del worktree ya tiene las variables. Entra con la sesión del usuario; si pide iniciar sesión, pídele que lo haga en el panel.

- [ ] **Step 2: Revisar la pantalla con datos reales**

Abre `/comercializadora/compras` y confirma:
- Los 9 indicadores con números, sin «NaN» ni «Infinity».
- La gráfica con 16 semanas.
- El plan de compra, o su error si el motor no tiene datos.
- Los dos plegables abren.

Con `read_console_messages` no debe haber errores. Prueba un cambio de cada filtro: la URL cambia y los indicadores responden, y la venta no cambia con proveedor ni comprador. Prueba también un mes, «Restablecer filtros» y una URL con `?proveedor=NoExiste` (indicadores de OCs en 0, sin tronar).

Si la carga inicial de la sincronización no ha terminado, algunas semanas tendrán venta parcial. Anótalo en el resumen; no es un error del tablero.

- [ ] **Step 3: Celular y modo oscuro**

`resize_window` con preset `mobile`: no debe haber desborde horizontal (`document.documentElement.scrollWidth <= innerWidth`); las tablas desplazan dentro de su contenedor. Después `colorScheme: dark`: los textos, las barras de la gráfica y los semáforos se leen bien. Regresa con preset `desktop`.

- [ ] **Step 4: Sincronizar ahora**

Como editor, presiona «Sincronizar ahora». Debe mostrar «Se sincronizó hace menos de 10 minutos…» (si el cron corrió hace poco) o el resumen de la corrida. La hora del encabezado se actualiza.

- [ ] **Step 5: Spec y commit final**

Si hubo diferencias de paridad o decisiones (`Ruling:`) que cambian lo que el spec dice, escríbelas en §7 del spec.

Run: `npm test` y `npm run test:funciones`
Expected: todo en verde.

```bash
git add docs/superpowers/specs/2026-11-25-compras-tablero-y-descargas-design.md
git commit -m "docs(compras): notas de paridad y decisiones del tablero"
```
