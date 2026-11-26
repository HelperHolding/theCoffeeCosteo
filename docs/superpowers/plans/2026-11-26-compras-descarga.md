# Descarga del tablero de compras (fase 4) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botón «Descargar» (HTML y PDF) en `/comercializadora/compras`. Baja la vista con los filtros elegidos como un archivo autocontenido, igual que el Reporte semanal.

**Architecture:** Se reutiliza todo lo de la fase 1:
- `lib/comercializadora/exportar/html.ts` (documento, sección, tabla, nombre de archivo);
- `pdf.ts` (Chromium con `puppeteer-core` + `@sparticuz/chromium`);
- `descarga.ts` (respuestas).

Del tablero (fase 3) se reutiliza el modelo `TableroCompras` de `armarTablero`, `PlanCompra`, y la gráfica `graficaCompras`, que ya es un SVG en texto.

Los textos de los 9 indicadores pasan a una función pura compartida por la pantalla y el archivo, para que nunca digan cosas distintas. La ruta de descarga lee Supabase como la página y nunca lee Zoho.

**Tech Stack:** Next.js 16 App Router (leer `node_modules/next/dist/docs/` antes de escribir código de Next, como pide AGENTS.md), route handlers con `runtime = 'nodejs'` y `maxDuration`, `puppeteer-core` + `@sparticuz/chromium`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-25-compras-tablero-y-descargas-design.md` §4 (descarga) y §5 (errores de descarga).

## Global Constraints

- **Botón:** «Descargar» (HTML / PDF) en el encabezado del tablero, junto a «Sincronizar ahora». Lo ve todo usuario con lectura de Comercializadora.
- **Contenido:** la vista con los filtros elegidos, que se escriben en el encabezado del archivo.
- **Plantilla:** función pura en `lib/comercializadora/exportar/`, que devuelve un HTML completo.
  - CSS propio incrustado, tema claro, tamaño carta, saltos de página entre secciones.
  - Sin JavaScript ni recursos externos.
  - Las listas plegables salen completas.
  - Las gráficas van como SVG generado en el servidor.
  - Encabezado con título, periodo, filtros y hora de lectura; pie con la nota de fuentes.
- **Ruta:** `GET /comercializadora/compras/descargar?<filtros>&formato=html|pdf`.
  - Verifica la sesión de Comercializadora y usa los mismos datos que la pantalla (Supabase).
  - `html`: `Content-Type: text/html`, `Content-Disposition: attachment; filename=…`.
  - `pdf`: el mismo HTML impreso con `puppeteer-core` + `@sparticuz/chromium` (carta, márgenes de 12 mm, número de página), con `export const maxDuration = 60` en la ruta.
- **Nombre:** `compras-<periodo>-<categoria>[-<proveedor>][-<comprador>].{html,pdf}`, sin acentos ni espacios. Sin categoría, `todas`.
- **Errores:** si Chromium falla, la pantalla muestra el error y ofrece el HTML.
- **Fuente del PDF:** en Vercel, Chromium solo tiene Open Sans. Nada de símbolos que no tenga (▲ ▼ ≥ ≤ →), igual que `reporteVentas.ts`.
- **Empaquetado:** la ruta nueva necesita los binarios de Chromium en `outputFileTracingIncludes` de `next.config.ts`. En la fase 1 su falta tumbó el PDF en producción.

## Review Focus

1. **Proveedor con acentos, «&» o espacios** («JOSÉ & HIJOS»): el enlace de descarga va codificado y el nombre del archivo sale limpio (`compras-2026-11-16-todas-jose-hijos.pdf`). Pruebas en las tareas 2 y 4.
2. **Plan de compra que falla** (motor sin datos): el archivo sale con la sección del plan en error y el resto completo, como la pantalla. Prueba en la tarea 2.
3. **Sin datos de compras** (primera sincronización incompleta): la ruta responde con un mensaje claro (409), no con un archivo en ceros. El botón lo muestra como cualquier error del PDF. Prueba en la tarea 3.
4. **Muchas filas** (60 OCs por llegar, 100 artículos en el plan): salen todas, sin cortes. Prueba en la tarea 2.
5. **Texto de Zoho con `<`, `&` o comillas** en proveedores, artículos o folios: se escapa y no rompe el HTML. Prueba en la tarea 2.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `lib/comercializadora/compras/indicadores.ts` (crear) | `tarjetasIndicadores`: etiqueta, valor, nota y tono de los 9 indicadores (pantalla y archivo). |
| `components/comercializadora/compras/indicadores.tsx` (modificar) | Usar `tarjetasIndicadores`. |
| `lib/comercializadora/exportar/reporteCompras.ts` (crear) | `htmlTableroCompras` y `archivoCompras`. |
| `lib/comercializadora/exportar/descarga.ts` (modificar) | `respuestaError` acepta 409. |
| `app/(comercializadora)/comercializadora/compras/descargar/route.ts` (crear) | La ruta de descarga. |
| `next.config.ts` (modificar) | Binarios de Chromium para la ruta nueva. |
| `lib/comercializadora/compras/filtros.ts` (modificar) | `hrefDescargaCompras`. |
| `components/comercializadora/descargar.tsx` (crear) | Botón genérico HTML / PDF (`Descargar`). |
| `components/comercializadora/reporte-semanal/descargar.tsx` (modificar) | `DescargarReporte` usa `Descargar`. |
| `app/(comercializadora)/comercializadora/compras/page.tsx` (modificar) | El botón en el encabezado. |

---

### Task 1: Textos de los indicadores compartidos

**Files:**
- Create: `lib/comercializadora/compras/indicadores.ts`
- Modify: `components/comercializadora/compras/indicadores.tsx`
- Test: `tests/comercializadora/compras-indicadores.test.ts`

**Interfaces:**
- Consumes: `TableroCompras`, `Semaforo` de `supabase/functions/_shared/compras/tablero.ts`; `pesos` de `lib/comercializadora/formato.ts`.
- Produces:
  ```ts
  export type TonoIndicador = 'ok' | 'bajo' | 'pierde' | 'neutro';
  export type TarjetaIndicador = { clave: 'venta' | 'compras' | 'ratio' | 'llegaron' | 'entregas' | 'lead' | 'mayor' | 'vencidas' | 'faltan'; etiqueta: string; valor: string; nota: string; tono: TonoIndicador };
  export function tarjetasIndicadores(t: TableroCompras, faltan: number | null): TarjetaIndicador[]; // siempre 9, en ese orden
  ```

Los textos son exactamente los de `components/comercializadora/compras/indicadores.tsx` de hoy. La prueba existente `tests/comercializadora/compras-vista.test.tsx` debe seguir en verde sin cambios: eso prueba que la pantalla no cambió.

- [ ] **Step 1: Write the failing test**

```ts
// tests/comercializadora/compras-indicadores.test.ts
import { describe, expect, it } from 'vitest';
import { tarjetasIndicadores } from '@/lib/comercializadora/compras/indicadores';
import { armarTablero } from '../../supabase/functions/_shared/compras/tablero.ts';

const t = armarTablero({
  ocs: [{ zoho_po_id: 'P1', folio: 'COM-OC-1', proveedor: 'Prov A', comprador: 'CC', emision: '2026-11-17', arribo: '2026-11-19', estado: 'open', received_status: 'received', monto_ins: 1000, por_categoria: { CAF: 1000 }, es_registro: false }],
  recepciones: [{ zoho_po_id: 'P1', fecha: '2026-11-19', monto: 2000, por_categoria: { CAF: 2000 } }],
  ventas: [{ semana: '2026-11-16', venta_total_ci: 4000, por_categoria_ci: { CAF: 4000 } }],
  lineas: [],
}, { periodo: '2026-11-16', categoria: null, proveedor: null, comprador: null }, '2026-11-26');

describe('textos de los indicadores', () => {
  it('nueve tarjetas en orden, con el periodo anterior y el semáforo como tono', () => {
    const xs = tarjetasIndicadores(t, 1234.5);
    expect(xs.map((x) => x.clave)).toEqual(['venta', 'compras', 'ratio', 'llegaron', 'entregas', 'lead', 'mayor', 'vencidas', 'faltan']);
    const por = Object.fromEntries(xs.map((x) => [x.clave, x]));
    expect(por.venta.valor).toBe('$4,000.00');
    expect(por.venta.nota).toBe('Anterior (9 nov – 15 nov 2026): $0.00');
    expect([por.ratio.valor, por.ratio.tono]).toEqual(['50%', 'ok']);
    expect(por.llegaron.nota).toContain('1 elaboradas en el periodo · 0 antes');
    expect(por.entregas.valor).toBe('100%');
    expect(por.lead.valor).toBe('2 días');
    expect([por.mayor.valor, por.mayor.nota]).toEqual(['$2,000.00', 'Prov A']);
    expect(por.faltan.valor).toBe('$1,234.50');
  });
  it('sin plan: «—» y la nota del error; sin compras: mayor compra vacía', () => {
    const xs = tarjetasIndicadores({ ...t, k: { ...t.k, mayor: null } }, null);
    const por = Object.fromEntries(xs.map((x) => [x.clave, x]));
    expect([por.faltan.valor, por.faltan.nota]).toEqual(['—', 'No se pudo calcular el plan']);
    expect([por.mayor.valor, por.mayor.nota]).toEqual(['—', 'Sin compras recibidas']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/comercializadora/compras-indicadores.test.ts`
Expected: FAIL: `Failed to resolve import "@/lib/comercializadora/compras/indicadores"`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/comercializadora/compras/indicadores.ts
import { pesos } from '@/lib/comercializadora/formato';
import type { Semaforo, TableroCompras } from '../../../supabase/functions/_shared/compras/tablero.ts';

export type TonoIndicador = 'ok' | 'bajo' | 'pierde' | 'neutro';
export type TarjetaIndicador = {
  clave: 'venta' | 'compras' | 'ratio' | 'llegaron' | 'entregas' | 'lead' | 'mayor' | 'vencidas' | 'faltan';
  etiqueta: string; valor: string; nota: string; tono: TonoIndicador;
};

const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`);
const dias = (x: number | null) => (x == null ? '—' : `${x} días`);
const TONO: Record<Semaforo, TonoIndicador> = { ok: 'ok', cerca: 'bajo', fuera: 'pierde' };

/** Los 9 indicadores del tablero (spec §3) como texto: los pinta la pantalla y la descarga. */
export function tarjetasIndicadores(t: TableroCompras, faltan: number | null): TarjetaIndicador[] {
  const { k, kAnt } = t;
  const ant = `Anterior (${t.anterior.etiqueta}):`;
  return [
    { clave: 'venta', etiqueta: 'Venta', valor: pesos(k.venta), nota: `${ant} ${pesos(kAnt.venta)}`, tono: 'neutro' },
    { clave: 'compras', etiqueta: 'Compras recibidas', valor: pesos(k.compras), nota: `${ant} ${pesos(kAnt.compras)}`, tono: 'neutro' },
    { clave: 'ratio', etiqueta: 'Compras / venta · meta 45–55%', valor: pct(k.ratio), nota: `${ant} ${pct(kAnt.ratio)}`, tono: k.semaforo ? TONO[k.semaforo] : 'neutro' },
    { clave: 'llegaron', etiqueta: 'OCs que llegaron', valor: String(k.llegaron.n), nota: `${k.llegaron.mismas} elaboradas en el periodo · ${k.llegaron.antes} antes · ${ant} ${kAnt.llegaron.n}`, tono: 'neutro' },
    { clave: 'entregas', etiqueta: 'Entregas a tiempo', valor: pct(k.entregas.pct), nota: `${k.entregas.aTiempo} a tiempo · ${k.entregas.tarde} tarde · ${k.entregas.sinFecha} sin fecha · ${ant} ${pct(kAnt.entregas.pct)}`, tono: 'neutro' },
    { clave: 'lead', etiqueta: 'Lead time promedio', valor: dias(k.lead), nota: `De la emisión de la OC a su primera recepción · ${ant} ${dias(kAnt.lead)}`, tono: 'neutro' },
    { clave: 'mayor', etiqueta: 'Mayor compra del periodo', valor: k.mayor ? pesos(k.mayor.monto) : '—', nota: k.mayor ? k.mayor.proveedor : 'Sin compras recibidas', tono: 'neutro' },
    { clave: 'vencidas', etiqueta: 'OCs vencidas sin recibir', valor: String(t.vencidas.n), nota: `${pesos(t.vencidas.monto)} con arribo esperado ya pasado`, tono: t.vencidas.n ? 'pierde' : 'neutro' },
    { clave: 'faltan', etiqueta: 'Faltan por comprar', valor: faltan == null ? '—' : pesos(faltan), nota: faltan == null ? 'No se pudo calcular el plan' : 'Lo que el plan de abastos pide esta semana', tono: 'neutro' },
  ];
}
```

`components/comercializadora/compras/indicadores.tsx` queda así:

```tsx
import { AlertTriangle, Clock, ListTodo, type LucideIcon, PackageCheck, Percent, ShoppingBag, Timer, Trophy, Truck } from 'lucide-react';
import { Kpi } from '@/components/portal/piezas';
import { tarjetasIndicadores, type TarjetaIndicador } from '@/lib/comercializadora/compras/indicadores';
import type { TableroCompras } from '../../../supabase/functions/_shared/compras/tablero.ts';

const ICONO: Record<TarjetaIndicador['clave'], LucideIcon> = {
  venta: ShoppingBag, compras: PackageCheck, ratio: Percent, llegaron: Truck, entregas: Clock, lead: Timer, mayor: Trophy, vencidas: AlertTriangle, faltan: ListTodo,
};

export function IndicadoresCompras({ t, faltan }: { t: TableroCompras; faltan: number | null }) {
  return (
    <section aria-label="Indicadores" className="mb-6 grid gap-3 *:min-w-0 sm:grid-cols-2 xl:grid-cols-3">
      {tarjetasIndicadores(t, faltan).map((x) => (
        <Kpi key={x.clave} etiqueta={x.etiqueta} icono={ICONO[x.clave]} valor={x.valor} nota={x.nota} tono={x.tono} />
      ))}
    </section>
  );
}
```

Antes de escribirlo, confirma que `lucide-react` exporta el tipo `LucideIcon` (lo usa `components/portal/piezas.tsx`). La «OCs que llegaron» y la «OCs vencidas» de hoy pasaban un número como `valor`; ahora pasan texto. `Kpi` acepta `React.ReactNode`, así que se ve igual.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/comercializadora/compras-indicadores.test.ts tests/comercializadora/compras-vista.test.tsx`
Expected: PASS (2 + 4 pruebas).

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/compras/indicadores.ts components/comercializadora/compras/indicadores.tsx tests/comercializadora/compras-indicadores.test.ts
git commit -m "refactor(compras): textos de los indicadores compartidos por la pantalla y la descarga"
```

---

### Task 2: Plantilla HTML del tablero

**Files:**
- Create: `lib/comercializadora/exportar/reporteCompras.ts`
- Test: `tests/comercializadora/exportar-compras.test.ts`

**Interfaces:**
- Consumes: `documento`, `seccion`, `tabla`, `leyenda`, `esc`, `crudo`, `nombreArchivo` de `./html`; `graficaCompras`, `COLORES_GRAFICA` de `lib/comercializadora/compras/grafica.ts`; `tarjetasIndicadores` (tarea 1); `textoFiltros` de `lib/comercializadora/compras/filtros.ts`; `PlanCompra` de `lib/comercializadora/compras/plan.ts`; `TableroCompras` (fase 3); `pesos`, `numero` de `formato.ts`; `fechaCorta` de `fechas.ts`.
- Produces:
  ```ts
  export function archivoCompras(t: TableroCompras, ext: 'html' | 'pdf'): string;
  export function htmlTableroCompras(t: TableroCompras, o: { plan: PlanCompra | null; errorPlan: string | null; leidoEn: string; ultimaSync: string | null }): string;
  ```

**Contenido del archivo** (mismo orden que la pantalla; todas las listas completas, sin `<details>`):
- **Encabezado:**
  - Título «Compras · Comercializadora»; subtítulo «Venta, compras recibidas y entregas de proveedores».
  - Meta 1: `Filtros: ${textoFiltros(t.filtros, t.periodo.etiqueta)}`.
  - Meta 2: `Leído de Supabase el ${fecha y hora CDMX de leidoEn}` más «· sincronizado con Zoho el ${…}» si hay `ultimaSync`.
- **Aviso** (si `t.sinDetalle.length`): el mismo texto de la pantalla.
- **01 Indicadores · {periodo}:** las 9 tarjetas de `tarjetasIndicadores`. Clase `ok` si el tono es ok, `mal` si es pierde.
- **02 Evolución:** nota «Con IVA, sin DODO Pizza ni Compras The Coffee. Presupuesto = 50% de la venta.», la leyenda con `COLORES_GRAFICA` y `graficaCompras(t.serie)`.
  - Los colores usan `var(--color-…, #respaldo)`; en el archivo no hay variables CSS, así que se usa el respaldo.
- **03 Plan de compra · Plan de abastos** (con `.salto` antes):
  - Con plan: tres tarjetas (Urgentes, Pronto, Insumos por llegar) y la tabla completa con las mismas columnas que la pantalla.
  - Sin plan: `<p class="error">No se pudo calcular el plan de compra: {errorPlan}</p>`.
- **04 OCs por proveedor del periodo:** tabla Proveedor, OCs, Monto, Registro, A tiempo, Atrasadas, Pendientes (vencidas / en plazo), Lead time.
- **05 OCs por llegar:** tabla Folio, Proveedor, Arribo, Estado, Monto, Artículos («SKU · nombre ×n», separados por «; »).
- **Pie:** «Fuente: Zoho Books (OCs, recepciones y facturas) sincronizado en Supabase; plan de compra del Plan de abastos. Compras = mercancía de órdenes de compra recibida, no pagos. Montos con IVA. Los meses suman las semanas que empiezan en ese mes.»

- [ ] **Step 1: Write the failing test**

```ts
// tests/comercializadora/exportar-compras.test.ts
import { describe, expect, it } from 'vitest';
import { archivoCompras, htmlTableroCompras } from '@/lib/comercializadora/exportar/reporteCompras';
import type { PlanCompra } from '@/lib/comercializadora/compras/plan';
import { armarTablero, type DatosCompras } from '../../supabase/functions/_shared/compras/tablero.ts';

const oc = (i: number) => ({
  zoho_po_id: `P${i}`, folio: `COM-OC-${i}`, proveedor: i === 0 ? 'Prov <A> & "B"' : `Prov ${i}`, comprador: 'CC', emision: '2026-11-17',
  arribo: '2026-11-20', estado: 'open', received_status: '', monto_ins: 100, por_categoria: { CAF: 100 }, es_registro: false,
});
const datos = (): DatosCompras => ({
  ocs: Array.from({ length: 60 }, (_, i) => oc(i)),
  recepciones: [],
  ventas: [{ semana: '2026-11-16', venta_total_ci: 4000, por_categoria_ci: { CAF: 4000 } }],
  lineas: [{ zoho_po_id: 'P0', sku: 'INS-CAF-001', nombre: 'Café <grano>', pendiente: 5 }],
});
const t = armarTablero(datos(), { periodo: '2026-11-16', categoria: null, proveedor: null, comprador: null }, '2026-11-26');
const plan: PlanCompra = {
  filas: Array.from({ length: 100 }, (_, i) => ({ urgencia: 'Normal' as const, sku: `INS-CAF-${i}`, nombre: `Art ${i}`, proveedor: 'Prov 1', categoria: 'CAF' as const, decision: 'PEDIR', inventario: 1, faltaSurtir: 0, dias: 12, pedir: [1, 0] as [number, number], costo: [10, 0] as [number, number], llega: null, llegaVencida: false })),
  urgentes: { n: 0, monto: 0 }, pronto: { n: 0, monto: 0 }, faltan: 1000,
};
const opts = { plan, errorPlan: null, leidoEn: '2026-11-26T18:00:00Z', ultimaSync: '2026-11-26T17:52:00Z' };

describe('descarga del tablero de compras', () => {
  it('documento completo sin scripts, con filtros y hora en el encabezado y las 5 secciones', () => {
    const h = htmlTableroCompras(t, opts);
    expect(h.startsWith('<!doctype html>')).toBe(true);
    expect(h).not.toMatch(/<script|<link|https?:\/\/(?!www\.w3\.org)/);
    expect(h).toContain('Filtros: 16 nov – 22 nov 2026 · Todas las categorías');
    expect(h).toContain('Leído de Supabase el 26 nov 2026');
    for (const s of ['Indicadores', 'Evolución', 'Plan de compra', 'OCs por proveedor del periodo', 'OCs por llegar']) expect(h).toContain(s);
    expect(h).toContain('<svg');
    expect(h).toContain('class="sec"><h2><span class="num">03</span>');
    expect(h).toMatch(/class="salto"/);
  });
  it('listas completas: 60 OCs por llegar y 100 artículos del plan', () => {
    const h = htmlTableroCompras(t, opts);
    expect(h).toContain('COM-OC-59');
    expect(h).toContain('INS-CAF-99');
  });
  it('escapa el texto que viene de Zoho', () => {
    const h = htmlTableroCompras(t, opts);
    expect(h).toContain('Prov &lt;A&gt; &amp; &quot;B&quot;');
    expect(h).toContain('Café &lt;grano&gt;');
    expect(h).not.toContain('Prov <A>');
  });
  it('si el plan falla, sale el error y el resto del archivo', () => {
    const h = htmlTableroCompras(t, { ...opts, plan: null, errorPlan: 'Motor sin datos' });
    expect(h).toContain('No se pudo calcular el plan de compra: Motor sin datos');
    expect(h).toContain('OCs por llegar');
  });
  it('solo símbolos que tiene Open Sans (la fuente de Chromium en Vercel)', () => {
    expect(htmlTableroCompras(t, opts)).not.toMatch(/[▲▼≥≤→]/);
  });
  it('nombre del archivo: periodo, categoría (o todas), proveedor y comprador, sin acentos', () => {
    expect(archivoCompras(t, 'pdf')).toBe('compras-2026-11-16-todas.pdf');
    const f = armarTablero(datos(), { periodo: '2026-11', categoria: 'CAF', proveedor: 'JOSÉ & HIJOS', comprador: 'Compras Comercializadora' }, '2026-11-26');
    expect(archivoCompras(f, 'html')).toBe('compras-2026-11-caf-jose-hijos-compras-comercializadora.html');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/comercializadora/exportar-compras.test.ts`
Expected: FAIL: `Failed to resolve import "@/lib/comercializadora/exportar/reporteCompras"`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/comercializadora/exportar/reporteCompras.ts
// El tablero de compras con los filtros elegidos como HTML autocontenido (spec compras §4).
import { numero, pesos } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import { tarjetasIndicadores } from '@/lib/comercializadora/compras/indicadores';
import { textoFiltros } from '@/lib/comercializadora/compras/filtros';
import { COLORES_GRAFICA, graficaCompras } from '@/lib/comercializadora/compras/grafica';
import type { PlanCompra } from '@/lib/comercializadora/compras/plan';
import type { TableroCompras } from '../../../supabase/functions/_shared/compras/tablero.ts';
import { documento, esc, leyenda, nombreArchivo, seccion, tabla } from './html';

export const archivoCompras = (t: TableroCompras, ext: 'html' | 'pdf') =>
  nombreArchivo(['compras', t.periodo.clave, t.filtros.categoria ?? 'todas', t.filtros.proveedor ?? '', t.filtros.comprador ?? ''].filter(Boolean), ext);

const hora = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace('.', '');
const tarjeta = (et: string, va: string, no = '', clase = '') =>
  `<div class="tarjeta"><div class="et">${esc(et)}</div><div class="va ${clase}">${esc(va)}</div><div class="no">${esc(no)}</div></div>`;
const fecha = (iso: string | null) => (iso ? fechaCorta(iso) : '—');

function plan(p: PlanCompra, t: TableroCompras): string {
  const porLlegar = t.porLlegar.reduce((a, o) => a + o.monto, 0);
  return `<div class="tarjetas">${tarjeta('Urgentes (menos de 5 días)', String(p.urgentes.n), pesos(p.urgentes.monto), 'mal')}`
    + `${tarjeta('Pronto (5 a 10 días)', String(p.pronto.n), pesos(p.pronto.monto))}${tarjeta('Insumos por llegar', String(t.porLlegar.length), pesos(porLlegar))}</div>`
    + (p.filas.length === 0 ? '<p>El plan no pide nada esta semana ni la próxima con estos filtros.</p>' : tabla(
      ['Urgencia', 'Artículo', 'SKU', 'Proveedor', 'Decisión', 'Inventario', 'Días', 'Pedir esta', 'Costo esta', 'Pedir próxima', 'Costo próxima', 'Llega'],
      p.filas.map((f) => [
        f.urgencia, f.nombre, f.sku, f.proveedor, f.decision,
        f.faltaSurtir > 0 ? `${numero(f.inventario)} (faltan ${numero(f.faltaSurtir)})` : numero(f.inventario),
        f.dias == null ? '—' : numero(Math.round(f.dias * 10) / 10),
        numero(f.pedir[0]), pesos(f.costo[0]), numero(f.pedir[1]), pesos(f.costo[1]),
        f.llega ? `${fechaCorta(f.llega)}${f.llegaVencida ? ' (vencida)' : ''}` : '—',
      ]),
      { derecha: [5, 6, 7, 8, 9, 10] },
    ));
}

export function htmlTableroCompras(t: TableroCompras, o: { plan: PlanCompra | null; errorPlan: string | null; leidoEn: string; ultimaSync: string | null }): string {
  const ind = tarjetasIndicadores(t, o.plan ? o.plan.faltan : null)
    .map((x) => tarjeta(x.etiqueta, x.valor, x.nota, x.tono === 'ok' ? 'ok' : x.tono === 'pierde' ? 'mal' : '')).join('');
  const aviso = t.sinDetalle.length
    ? `<p class="aviso">Compras recibidas aproximadas: Zoho no dio el detalle de cada recepción de ${esc(t.sinDetalle.join(', '))}. Lo recibido de esas OCs se cuenta completo en su recepción más reciente, aunque haya llegado en varias semanas.</p>`
    : '';
  const evolucion = '<p class="peq">Con IVA, sin DODO Pizza ni Compras The Coffee. Presupuesto = 50% de la venta.</p>'
    + leyenda([{ nombre: 'Venta', color: COLORES_GRAFICA.venta }, { nombre: 'Compras recibidas', color: COLORES_GRAFICA.compras }, { nombre: 'Presupuesto (50%)', color: COLORES_GRAFICA.presupuesto }])
    + graficaCompras(t.serie);
  const proveedores = tabla(
    ['Proveedor', 'OCs', 'Monto', 'Registro', 'A tiempo', 'Atrasadas', 'Pendientes (vencidas / en plazo)', 'Lead time'],
    t.proveedores.map((p) => [p.proveedor, String(p.ocs), pesos(p.monto), String(p.registro), String(p.aTiempo), String(p.atrasadas), `${p.pendVencidas} / ${p.pendEnPlazo}`, p.lead == null ? '—' : `${numero(p.lead)} días`]),
    { derecha: [1, 2, 3, 4, 5, 6, 7] },
  );
  const porLlegar = tabla(
    ['Folio', 'Proveedor', 'Arribo', 'Estado', 'Monto', 'Artículos'],
    t.porLlegar.map((x) => [x.folio, x.proveedor, fecha(x.arribo), x.estado, pesos(x.monto), x.articulos.map((a) => `${a.sku} · ${a.nombre} ×${numero(a.pendiente)}`).join('; ')]),
    { derecha: [4] },
  );
  const cuerpo = aviso
    + seccion('01', `Indicadores · ${t.periodo.etiqueta}`, `<div class="tarjetas">${ind}</div>`)
    + seccion('02', 'Evolución', evolucion)
    + '<div class="salto"></div>'
    + seccion('03', 'Plan de compra · Plan de abastos', o.plan ? plan(o.plan, t) : `<p class="error">No se pudo calcular el plan de compra: ${esc(o.errorPlan ?? '')}</p>`)
    + '<div class="salto"></div>'
    + seccion('04', 'OCs por proveedor del periodo', t.proveedores.length ? proveedores : '<p>Sin OCs emitidas en el periodo.</p>')
    + seccion('05', 'OCs por llegar', t.porLlegar.length ? porLlegar : '<p>No hay OCs por llegar.</p>');
  return documento({
    titulo: 'Compras · Comercializadora',
    subtitulo: 'Venta, compras recibidas y entregas de proveedores',
    meta: [
      `Filtros: ${textoFiltros(t.filtros, t.periodo.etiqueta)}`,
      `Leído de Supabase el ${hora(o.leidoEn)}${o.ultimaSync ? ` · sincronizado con Zoho el ${hora(o.ultimaSync)}` : ''}`,
    ],
    cuerpo,
    pie: 'Fuente: Zoho Books (OCs, recepciones y facturas) sincronizado en Supabase; plan de compra del Plan de abastos. Compras = mercancía de órdenes de compra recibida, no pagos. Montos con IVA. Los meses suman las semanas que empiezan en ese mes.',
  });
}
```

Notas para quien lo implemente:
- **`hora()`:** `toLocaleString('es-MX')` da algo como «26 nov 2026, 12:00». La prueba solo pide «26 nov 2026». Si Node da «26 nov. 2026», el `.replace('.', '')` lo limpia; si da otro formato, ajusta `hora()` y no la prueba.
- **Signo «×»:** Open Sans lo tiene, y `reporteVentas.ts` ya usa «–» y «·».

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/comercializadora/exportar-compras.test.ts`
Expected: PASS (6 pruebas).

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/exportar/reporteCompras.ts tests/comercializadora/exportar-compras.test.ts
git commit -m "feat(compras): plantilla HTML de la descarga del tablero"
```

---

### Task 3: Ruta de descarga y empaquetado de Chromium

**Files:**
- Create: `app/(comercializadora)/comercializadora/compras/descargar/route.ts`
- Modify: `lib/comercializadora/exportar/descarga.ts` (`respuestaError` acepta 409)
- Modify: `next.config.ts`
- Test: `tests/comercializadora/next-config-pdf.test.ts` (ampliar)
- Test: `tests/comercializadora/compras-descarga-ruta.test.ts`

**Interfaces:**
- Consumes: `sesionComercializadora` de `lib/supabase/sesion`; `leerDatosCompras` de `lib/comercializadora/compras/datos.ts`; `semDelMotor` de `lib/comercializadora/compras/motor.ts`; `filtrosDeUrl`; `planCompra`; `armarTablero`, `faltanDatos` (fase 3); `htmlTableroCompras`, `archivoCompras` (tarea 2); `htmlAPdf`, `MENSAJE_FALLA_PDF` de `exportar/pdf.ts`; `respuestaArchivo`, `respuestaError` de `exportar/descarga.ts`; `hoyCdmx`.
- Produces:
  ```ts
  // route.ts
  export const runtime = 'nodejs';
  export const maxDuration = 60;
  export async function GET(req: Request): Promise<Response>;
  export const SIN_DATOS: string; // mensaje de 409
  // descarga.ts
  export const respuestaError = (estado: 401 | 403 | 409 | 500 | 502, mensaje: string) => Response;
  ```

- [ ] **Step 1: Write the failing tests**

En `tests/comercializadora/next-config-pdf.test.ts`, dentro del `describe`:

```ts
  it('la descarga del tablero de compras también los incluye', () => {
    const incluye = config.outputFileTracingIncludes?.['/comercializadora/compras/descargar'] ?? [];
    expect(incluye).toContain('./node_modules/@sparticuz/chromium/bin/**/*');
  });
```

```ts
// tests/comercializadora/compras-descarga-ruta.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const leer = vi.fn();
const pdf = vi.fn();
vi.mock('@/lib/supabase/sesion', () => ({ sesionComercializadora: vi.fn(async () => ({ db: {}, accesos: [] })) }));
vi.mock('@/lib/comercializadora/compras/datos', () => ({ leerDatosCompras: (...a: unknown[]) => leer(...a) }));
vi.mock('@/lib/comercializadora/compras/motor', () => ({ semDelMotor: vi.fn(async () => ({ ok: false, error: 'Motor sin datos' })) }));
vi.mock('@/lib/comercializadora/exportar/pdf', () => ({ htmlAPdf: (...a: unknown[]) => pdf(...a), MENSAJE_FALLA_PDF: 'No se pudo generar el PDF. Baja el HTML.' }));

import { GET, SIN_DATOS } from '@/app/(comercializadora)/comercializadora/compras/descargar/route';

const conDatos = {
  datos: {
    ocs: [{ zoho_po_id: 'P1', folio: 'COM-OC-1', proveedor: 'Prov A', comprador: 'CC', emision: '2026-11-17', arribo: '2026-11-19', estado: 'open', received_status: 'received', monto_ins: 1000, por_categoria: { CAF: 1000 }, es_registro: false }],
    recepciones: [], lineas: [],
    ventas: [{ semana: '2026-11-16', venta_total_ci: 4000, por_categoria_ci: { CAF: 4000 } }],
  },
  ultimaSync: '2026-11-26T17:00:00Z',
};
const url = (q: string) => new Request(`http://x/comercializadora/compras/descargar?${q}`);

describe('ruta de descarga del tablero de compras', () => {
  beforeEach(() => { leer.mockReset(); pdf.mockReset(); });
  it('HTML con los filtros de la URL, como archivo adjunto con su nombre', async () => {
    leer.mockResolvedValue(conDatos);
    const r = await GET(url('periodo=2026-11-16&categoria=CAF&formato=html'));
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toContain('text/html');
    expect(r.headers.get('Content-Disposition')).toBe('attachment; filename="compras-2026-11-16-caf.html"');
    const h = await r.text();
    expect(h).toContain('Filtros: 16 nov – 22 nov 2026 · Café');
    expect(h).toContain('No se pudo calcular el plan de compra: Motor sin datos');
  });
  it('PDF: el mismo HTML impreso; si Chromium falla, 502 con el mensaje fijo', async () => {
    leer.mockResolvedValue(conDatos);
    pdf.mockResolvedValueOnce(new Uint8Array([37, 80, 68, 70]));
    const ok = await GET(url('periodo=2026-11-16&formato=pdf'));
    expect([ok.status, ok.headers.get('Content-Type')]).toEqual([200, 'application/pdf']);
    expect(String(pdf.mock.calls[0][0])).toContain('<!doctype html>');
    pdf.mockRejectedValueOnce(new Error('crash'));
    const mal = await GET(url('periodo=2026-11-16&formato=pdf'));
    expect([mal.status, await mal.text()]).toEqual([502, 'No se pudo generar el PDF. Baja el HTML.']);
  });
  it('sin datos sincronizados: 409 con mensaje claro, sin archivo', async () => {
    leer.mockResolvedValue({ datos: { ocs: [], recepciones: [], ventas: [], lineas: [] }, ultimaSync: null });
    const r = await GET(url('formato=pdf'));
    expect([r.status, await r.text()]).toEqual([409, SIN_DATOS]);
    expect(pdf).not.toHaveBeenCalled();
  });
  it('si la lectura de Supabase falla: 500 con el mensaje de la lectura', async () => {
    leer.mockRejectedValue(new Error('No se pudieron leer los datos de Comercializadora. Intenta de nuevo.'));
    const r = await GET(url('formato=html'));
    expect([r.status, await r.text()]).toEqual([500, 'No se pudieron leer los datos de Comercializadora. Intenta de nuevo.']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/comercializadora/next-config-pdf.test.ts tests/comercializadora/compras-descarga-ruta.test.ts`
Expected: FAIL. La de `next.config` falla porque no incluye la ruta nueva; la de la ruta, con `Failed to resolve import ".../compras/descargar/route"`.

- [ ] **Step 3: Write the implementation**

En `lib/comercializadora/exportar/descarga.ts`:

```ts
export const respuestaError = (estado: 401 | 403 | 409 | 500 | 502, mensaje: string) =>
```

En `next.config.ts`, dentro de `outputFileTracingIncludes`:

```ts
    '/comercializadora/compras/descargar': ['./node_modules/@sparticuz/chromium/bin/**/*'],
```

```ts
// app/(comercializadora)/comercializadora/compras/descargar/route.ts
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import { leerDatosCompras } from '@/lib/comercializadora/compras/datos';
import { semDelMotor } from '@/lib/comercializadora/compras/motor';
import { filtrosDeUrl } from '@/lib/comercializadora/compras/filtros';
import { planCompra } from '@/lib/comercializadora/compras/plan';
import { archivoCompras, htmlTableroCompras } from '@/lib/comercializadora/exportar/reporteCompras';
import { htmlAPdf, MENSAJE_FALLA_PDF } from '@/lib/comercializadora/exportar/pdf';
import { respuestaArchivo, respuestaError } from '@/lib/comercializadora/exportar/descarga';
import { armarTablero, faltanDatos } from '../../../../../supabase/functions/_shared/compras/tablero.ts';

export const runtime = 'nodejs';
// Solo Supabase (sin Zoho) y luego Chromium.
export const maxDuration = 60;

export const SIN_DATOS = 'Todavía no hay datos de compras para descargar. La primera sincronización tarda varias corridas; intenta en unos minutos.';

export async function GET(req: Request) {
  let db;
  try {
    ({ db } = await sesionComercializadora(false));
  } catch (e) {
    const m = e instanceof Error ? e.message : 'Sin sesión';
    return respuestaError(/sesión venció/i.test(m) ? 401 : 403, m);
  }
  const sp = new URL(req.url).searchParams;
  const formato = sp.get('formato') === 'pdf' ? 'pdf' : 'html';
  const hoy = hoyCdmx();
  let leido;
  try {
    leido = await Promise.all([leerDatosCompras(db), semDelMotor(db)]);
  } catch (e) {
    return respuestaError(500, e instanceof Error ? e.message : 'No se pudieron leer los datos de compras.');
  }
  const [{ datos, ultimaSync }, motor] = leido;
  if (faltanDatos(datos)) return respuestaError(409, SIN_DATOS);
  const t = armarTablero(datos, filtrosDeUrl(Object.fromEntries(sp)), hoy);
  const html = htmlTableroCompras(t, {
    plan: motor.ok ? planCompra(motor.S, t.filtros, hoy) : null,
    errorPlan: motor.ok ? null : motor.error,
    leidoEn: new Date().toISOString(),
    ultimaSync,
  });
  if (formato === 'html') return respuestaArchivo(html, archivoCompras(t, 'html'), 'html');
  try {
    return respuestaArchivo(await htmlAPdf(html), archivoCompras(t, 'pdf'), 'pdf');
  } catch {
    // htmlAPdf ya registró el detalle; al usuario solo el mensaje fijo.
    return respuestaError(502, MENSAJE_FALLA_PDF);
  }
}
```

Antes de escribir la ruta, revisa en `node_modules/next/dist/docs/` que un route handler pueda exportar constantes además de `GET`, `runtime` y `maxDuration` (el `SIN_DATOS` de la prueba). Si Next lo rechaza al compilar, mueve `SIN_DATOS` a `lib/comercializadora/compras/sync.ts`, impórtalo de ahí en la ruta y en la prueba, y déjalo en el ledger como `Ruling:`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/comercializadora/next-config-pdf.test.ts tests/comercializadora/compras-descarga-ruta.test.ts tests/comercializadora/exportar-descarga.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit -p .`
Expected: sin errores.

```bash
git add "app/(comercializadora)/comercializadora/compras/descargar/route.ts" lib/comercializadora/exportar/descarga.ts next.config.ts tests/comercializadora/next-config-pdf.test.ts tests/comercializadora/compras-descarga-ruta.test.ts
git commit -m "feat(compras): ruta de descarga del tablero en HTML y PDF"
```

---

### Task 4: Botón «Descargar» en el tablero

**Files:**
- Create: `components/comercializadora/descargar.tsx`
- Modify: `components/comercializadora/reporte-semanal/descargar.tsx`
- Modify: `lib/comercializadora/compras/filtros.ts` (`hrefDescargaCompras`)
- Modify: `app/(comercializadora)/comercializadora/compras/page.tsx`
- Test: `tests/comercializadora/descargar-boton.test.tsx` (ampliar; las 3 pruebas de hoy no cambian)
- Test: `tests/comercializadora/compras-filtros.test.ts` (ampliar)

**Interfaces:**
- Consumes: `hrefCompras` (fase 3); `archivoCompras` (tarea 2).
- Produces:
  ```ts
  // components/comercializadora/descargar.tsx ('use client')
  export function Descargar(p: { base: string; archivoPdf: string }): JSX.Element; // base puede traer «?…»; se agrega formato=html|pdf
  // filtros.ts
  export function hrefDescargaCompras(f: FiltrosCompras): string; // '/comercializadora/compras/descargar?…' (o sin «?» si no hay filtros)
  ```

- [ ] **Step 1: Write the failing tests**

En `tests/comercializadora/compras-filtros.test.ts`, agrega `hrefDescargaCompras` al import y esta prueba dentro del `describe`:

```ts
  it('enlace de descarga con los mismos filtros, codificados', () => {
    expect(hrefDescargaCompras({ periodo: '2026-11-16', categoria: 'CAF', proveedor: 'JOSÉ & HIJOS', comprador: null }))
      .toBe('/comercializadora/compras/descargar?periodo=2026-11-16&categoria=CAF&proveedor=JOS%C3%89+%26+HIJOS');
    expect(hrefDescargaCompras({ periodo: '', categoria: null, proveedor: null, comprador: null })).toBe('/comercializadora/compras/descargar');
  });
```

En `tests/comercializadora/descargar-boton.test.tsx`, agrega `import { Descargar } from '@/components/comercializadora/descargar';` y este `describe` al final:

```tsx
describe('botón Descargar genérico', () => {
  it('agrega formato con & si la base ya trae filtros, o con ? si no', () => {
    const { unmount } = render(<Descargar base="/comercializadora/compras/descargar?periodo=2026-11-16" archivoPdf="compras-2026-11-16-todas.pdf" />);
    expect(screen.getByRole('link', { name: 'HTML' }).getAttribute('href')).toBe('/comercializadora/compras/descargar?periodo=2026-11-16&formato=html');
    unmount();
    render(<Descargar base="/comercializadora/compras/descargar" archivoPdf="compras.pdf" />);
    expect(screen.getByRole('link', { name: 'HTML' }).getAttribute('href')).toBe('/comercializadora/compras/descargar?formato=html');
  });
  it('el PDF se baja con el nombre que le pasan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['%PDF']), { status: 200 })));
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() }));
    let nombre = '';
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { nombre = this.download; });
    render(<Descargar base="/comercializadora/compras/descargar?periodo=2026-11-16" archivoPdf="compras-2026-11-16-todas.pdf" />);
    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));
    await waitFor(() => expect(clic).toHaveBeenCalled());
    expect(nombre).toBe('compras-2026-11-16-todas.pdf');
    clic.mockRestore();
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/comercializadora/descargar-boton.test.tsx tests/comercializadora/compras-filtros.test.ts`
Expected: FAIL: `Failed to resolve import "@/components/comercializadora/descargar"` y `hrefDescargaCompras is not a function`.

- [ ] **Step 3: Write the implementation**

```tsx
// components/comercializadora/descargar.tsx
'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';

/**
 * «Descargar» HTML / PDF de un reporte. HTML: enlace directo. PDF: se pide con fetch para poder mostrar el error
 * y ofrecer el HTML si falla (spec §5). `base` es la ruta de descarga con sus filtros; aquí se agrega el formato.
 */
export function Descargar({ base, archivoPdf }: { base: string; archivoPdf: string }) {
  const con = (formato: 'html' | 'pdf') => `${base}${base.includes('?') ? '&' : '?'}formato=${formato}`;
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pdf() {
    setPendiente(true);
    setError(null);
    try {
      const r = await fetch(con('pdf'));
      if (!r.ok) throw new Error((await r.text()) || 'No se pudo generar el PDF.');
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = archivoPdf;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Safari y Firefox cancelan la descarga si el enlace se revoca en el mismo instante.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el PDF.');
    } finally {
      setPendiente(false);
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      <Download size={14} aria-hidden="true" />
      <a href={con('html')} download className="font-semibold underline">HTML</a>
      <button type="button" onClick={pdf} disabled={pendiente} className="font-semibold underline">
        {pendiente ? 'Generando PDF…' : 'PDF'}
      </button>
      {error && (
        <span role="alert" className="text-bad">
          {error} <a href={con('html')} download className="underline">Bajar HTML</a>
        </span>
      )}
    </span>
  );
}
```

```tsx
// components/comercializadora/reporte-semanal/descargar.tsx
'use client';
import { Descargar } from '@/components/comercializadora/descargar';

/** El Reporte semanal de la semana elegida (spec descargas §4). */
export function DescargarReporte({ semana }: { semana: string }) {
  return <Descargar base={`/comercializadora/reporte-semanal/descargar?semana=${semana}`} archivoPdf={`reporte-ventas-${semana}.pdf`} />;
}
```

En `lib/comercializadora/compras/filtros.ts`:

```ts
/** La ruta de descarga con los mismos filtros que la vista (spec §4). */
export const hrefDescargaCompras = (f: FiltrosCompras) => hrefCompras(f).replace(RUTA, `${RUTA}/descargar`);
```

En `app/(comercializadora)/comercializadora/compras/page.tsx`:
- Importa `Descargar` de `@/components/comercializadora/descargar`, `hrefDescargaCompras` de `@/lib/comercializadora/compras/filtros` y `archivoCompras` de `@/lib/comercializadora/exportar/reporteCompras`.
- En el `Encabezado`, después de `{editor && <SincronizarCompras />}`, agrega:

```tsx
      {!faltanDatos(datos) && <Descargar base={hrefDescargaCompras(t.filtros)} archivoPdf={archivoCompras(t, 'pdf')} />}
```

Sin datos no hay nada que bajar, así que el botón no sale. La ruta igual responde 409 si alguien la abre directo.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/comercializadora`
Expected: PASS. Las 3 pruebas de hoy del botón del Reporte semanal siguen en verde sin cambios.

- [ ] **Step 5: Typecheck and commit**

Run: `npx tsc --noEmit -p .`
Expected: sin errores.

```bash
git add components/comercializadora/descargar.tsx components/comercializadora/reporte-semanal/descargar.tsx lib/comercializadora/compras/filtros.ts "app/(comercializadora)/comercializadora/compras/page.tsx" tests/comercializadora/descargar-boton.test.tsx tests/comercializadora/compras-filtros.test.ts
git commit -m "feat(compras): botón Descargar HTML y PDF en el tablero"
```

---

### Task 5: Verificación en el navegador

**Files:** ninguno, salvo que algo falle.

- [ ] **Step 1: Levantar el portal del worktree**

`preview_start` con `portal-compras` (puerto 3001; el `.env.local` del worktree ya trae `CHROMIUM_PATH` a Chrome Headless Shell 158 en el scratchpad). Abre `/comercializadora/compras?periodo=2026-11-16&categoria=CAF`.

- [ ] **Step 2: HTML**

Con `javascript_tool`, pide `fetch` de la ruta de descarga en HTML y confirma:
- estado 200 y `Content-Disposition` `compras-2026-11-16-caf.html`;
- el texto trae «Filtros: 16 nov – 22 nov 2026 · Café», las 5 secciones y un `<svg`;
- no trae `<script`.

El botón «HTML» del encabezado apunta a esa misma URL.

- [ ] **Step 3: PDF**

Presiona «PDF» y confirma que la descarga arranca sin error (sin `role="alert"`). También con `fetch` desde la página:
- estado 200 y `Content-Type: application/pdf`;
- los primeros bytes son `%PDF`;
- el PDF tiene 2 o más páginas (cuenta los `/Type /Page` del texto con un regex: `(buf.match(/\/Type\s*\/Page[^s]/g) || []).length`).

Si Chromium no arranca en local, revisa `CHROMIUM_PATH` en `.env.local` antes de tocar código: la memoria del proyecto dice que Edge falla en local.

- [ ] **Step 4: Error y suite**

Abre a mano `/comercializadora/compras/descargar?formato=html&periodo=basura`. Debe bajar la semana cerrada anterior, porque el periodo se normaliza; no es un error.

Run: `npm run test:funciones` y `npx vitest run --exclude tests/migracion/paridad.test.ts`
Expected: todo en verde.
