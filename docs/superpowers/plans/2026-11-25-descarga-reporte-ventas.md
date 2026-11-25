# Descarga HTML/PDF del Reporte semanal — plan de implementación (fase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el Reporte semanal de ventas (`/comercializadora/reporte-semanal`) se pueda bajar como HTML autocontenido y como PDF.

**Architecture:** Una plantilla de exportación pura (`lib/comercializadora/exportar/`) convierte el `Reporte` ya calculado en un HTML completo con CSS incrustado y gráficas SVG. Una ruta del portal sirve ese HTML como descarga o lo imprime a PDF con Chromium sin cabeza (`puppeteer-core` + `@sparticuz/chromium`). Un botón «Descargar» en la pantalla baja el archivo y, si el PDF falla, ofrece el HTML.

**Tech Stack:** Next.js App Router (route handlers), TypeScript, Vitest, puppeteer-core, @sparticuz/chromium.

**Spec:** `docs/superpowers/specs/2026-11-25-compras-tablero-y-descargas-design.md` (§4 y §5, solo la parte del reporte de ventas; el tablero de compras va en planes posteriores).

**Carpeta de trabajo:** `C:\Users\sebcm\Projects\thecoffee-costeos-compras` (worktree de la rama `feat/compras-tablero`). No usar la carpeta principal `thecoffee-costeos`: otra sesión trabaja ahí en otra rama.

## Global Constraints

- AGENTS.md: esta versión de Next.js cambia APIs. Antes de escribir la ruta, lee en `node_modules/next/dist/docs/` la guía de route handlers y de `serverExternalPackages`.
- HTML exportado: CSS propio incrustado, tema claro, tamaño carta, saltos de página entre secciones; **sin `<script>` y sin recursos externos**.
- Listas plegables de la pantalla salen completas en la exportación.
- Gráficas como SVG generado en el servidor.
- Encabezado con título, periodo, filtros y hora de lectura; pie con la nota de fuentes.
- Rutas: `GET /comercializadora/reporte-semanal/descargar?semana=…&formato=html|pdf`; verifican la sesión de Comercializadora; usan la misma lectura que la pantalla (caché de la función, **sin forzar Zoho**).
- `html`: `Content-Type: text/html; charset=utf-8`, `Content-Disposition: attachment; filename=…`. `pdf`: tamaño carta, márgenes 12 mm, pie con número de página.
- Nombre: `reporte-ventas-AAAA-MM-DD.{html,pdf}` (AAAA-MM-DD = lunes de la semana).
- Si Chromium falla, la pantalla muestra el error y ofrece el HTML.
- Textos en español de México. Dinero con `pesos()` de `lib/comercializadora/formato.ts`.
- Pruebas Vitest: `npx vitest run tests/comercializadora/`. Tipos: `npm run typecheck`.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Texto de Zoho con caracteres de HTML** (`<`, `&`, comillas en nombres de cliente o descripciones de incidencias): se muestran literales, nunca rompen el documento. → prueba en Task 1 (`esc`/`tabla`) y Task 2.
2. **Sección fallida en el reporte** (`ok: false`): la exportación la muestra como «No se pudo leer esta sección: …» y el resto sale. → prueba en Task 2.
3. **Semana inválida en la URL de descarga**: usa la semana por omisión, igual que la pantalla (no 500). → prueba en Task 4 (`parametrosDescarga`).
4. **PDF falla** (Chromium no arranca o tarda): el botón muestra el error y un enlace al HTML; la ruta responde 500 con mensaje claro, no un stack. → prueba en Task 4 (componente) y Task 3 (`htmlAPdf` propaga error claro).
5. **Usuario sin sesión o sin Comercializadora** pide la descarga: 401/403 sin datos. → prueba en Task 4 (`respuestaError`).

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `lib/comercializadora/exportar/html.ts` | Piezas de HTML: escape, documento con CSS de impresión, sección, tabla, gráfica SVG de barras apiladas, nombre de archivo |
| `lib/comercializadora/exportar/reporteVentas.ts` | `htmlReporteVentas(reporte, opciones)`: el Reporte semanal completo como HTML |
| `lib/comercializadora/exportar/pdf.ts` | `htmlAPdf(html, deps?)`: imprime HTML a PDF con Chromium |
| `lib/comercializadora/exportar/descarga.ts` | Parámetros de la URL y respuestas HTTP de descarga (puras) |
| `app/(comercializadora)/comercializadora/reporte-semanal/descargar/route.ts` | Ruta GET de descarga |
| `components/comercializadora/reporte-semanal/descargar.tsx` | Botón «Descargar» (HTML / PDF) con manejo de error |
| `tests/comercializadora/exportar-*.test.ts(x)` | Pruebas |

---

### Task 1: Piezas de HTML para exportar

**Files:**
- Create: `lib/comercializadora/exportar/html.ts`
- Test: `tests/comercializadora/exportar-html.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Crudo = { readonly __html: string };
  export type Celda = string | number | Crudo;
  export const crudo: (html: string) => Crudo;
  export function esc(x: unknown): string;
  export function celda(c: Celda): string;                 // string → esc; number → String; Crudo → tal cual
  export function documento(o: { titulo: string; subtitulo: string; meta: string[]; cuerpo: string; pie: string }): string;
  export function seccion(num: string, titulo: string, cuerpo: string): string;
  export function tabla(enc: string[], filas: Celda[][], o?: { derecha?: number[]; total?: Celda[] }): string;
  export function barrasApiladas(cols: { etiqueta: string; total: string; partes: { nombre: string; valor: number; color: string }[] }[]): string;
  export function nombreArchivo(partes: string[], ext: 'html' | 'pdf'): string;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/comercializadora/exportar-html.test.ts
import { describe, expect, it } from 'vitest';
import { barrasApiladas, celda, crudo, documento, esc, nombreArchivo, seccion, tabla } from '@/lib/comercializadora/exportar/html';

describe('piezas de HTML para exportar', () => {
  it('esc escapa los caracteres de HTML', () => {
    expect(esc(`<b>"A&B"</b> 'x'`)).toBe('&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt; &#39;x&#39;');
    expect(esc(null)).toBe('');
  });
  it('celda: texto escapado, número tal cual, crudo sin tocar', () => {
    expect(celda('a<b')).toBe('a&lt;b');
    expect(celda(12)).toBe('12');
    expect(celda(crudo('<i>x</i>'))).toBe('<i>x</i>');
  });
  it('tabla con encabezado, columnas a la derecha y fila de total', () => {
    const h = tabla(['Cliente', 'Saldo'], [['Mop & Co', '$1.00']], { derecha: [1], total: ['Total', '$1.00'] });
    expect(h).toContain('<th>Cliente</th>');
    expect(h).toContain('<td>Mop &amp; Co</td>');
    expect(h).toContain('<td class="der">$1.00</td>');
    expect(h).toContain('<tr class="total">');
  });
  it('documento completo, imprimible, sin scripts ni recursos externos', () => {
    const d = documento({ titulo: 'Reporte <1>', subtitulo: 'Semana', meta: ['Leído hoy'], cuerpo: seccion('01', 'Ventas', '<p>x</p>'), pie: 'Fuente: Zoho' });
    expect(d.startsWith('<!doctype html>')).toBe(true);
    expect(d).toContain('<meta charset="utf-8">');
    expect(d).toContain('@page');
    expect(d).toContain('<title>Reporte &lt;1&gt;</title>');
    expect(d).toContain('<span class="num">01</span>');
    expect(d).not.toMatch(/<script|<link|src="http|href="http/);
  });
  it('barrasApiladas dibuja un SVG con un rect por parte con valor', () => {
    const s = barrasApiladas([
      { etiqueta: '16 nov', total: '$10', partes: [{ nombre: 'Ordinario', valor: 6, color: '#111' }, { nombre: 'Apertura', valor: 4, color: '#2f7a4f' }] },
      { etiqueta: '23 nov', total: '$0', partes: [{ nombre: 'Ordinario', valor: 0, color: '#111' }] },
    ]);
    expect(s.startsWith('<svg')).toBe(true);
    expect((s.match(/<rect /g) ?? []).length).toBe(2);
    expect(s).toContain('16 nov');
  });
  it('nombreArchivo sin acentos ni espacios', () => {
    expect(nombreArchivo(['Reporte ventas', '2026-11-16'], 'pdf')).toBe('reporte-ventas-2026-11-16.pdf');
    expect(nombreArchivo(['compras', 'Café', 'Ávila Camacho'], 'html')).toBe('compras-cafe-avila-camacho.html');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/comercializadora/exportar-html.test.ts`
Expected: FAIL — no existe `@/lib/comercializadora/exportar/html`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/comercializadora/exportar/html.ts
// Piezas para exportar reportes como HTML autocontenido: CSS incrustado, sin scripts ni recursos externos.
export type Crudo = { readonly __html: string };
export type Celda = string | number | Crudo;
export const crudo = (html: string): Crudo => ({ __html: html });

const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (x: unknown) => String(x ?? '').replace(/[&<>"']/g, (c) => ENT[c]);
export const celda = (c: Celda) => (typeof c === 'number' ? String(c) : typeof c === 'string' ? esc(c) : c.__html);

const CSS = `
@page{size:Letter;margin:12mm}
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI",system-ui,-apple-system,sans-serif;color:#1b1b1b;background:#fff;font-size:11px;line-height:1.4}
.doc{max-width:190mm;margin:0 auto;padding:6mm 0}
header.cab{border-bottom:2px solid #1b1b1b;padding-bottom:6px;margin-bottom:10px}
header.cab h1{font-size:20px;margin:0 0 2px}
header.cab p{margin:0;color:#555}
.meta{font-size:10px;color:#666;margin-top:4px}
section.sec{margin:14px 0;break-inside:auto}
section.sec + section.sec{break-before:auto}
.sec h2{display:flex;gap:8px;align-items:center;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#555;margin:0 0 6px}
.sec h2 .num{background:#1b1b1b;color:#fff;font-family:monospace;font-size:9px;padding:2px 6px;border-radius:3px}
.salto{break-before:page}
.tarjetas{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:6px 0}
.tarjeta{border:1px solid #ddd;border-radius:6px;padding:6px 8px;break-inside:avoid}
.tarjeta .et{font-size:9px;text-transform:uppercase;color:#666}
.tarjeta .va{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums}
.tarjeta .no{font-size:9px;color:#666}
.ok{color:#1e7a44}.mal{color:#b3261e}.aviso{background:#fef7ec;border:1px solid #e8c48c;color:#8a5207;padding:6px 8px;border-radius:6px;margin:6px 0}
.error{background:#fdf0ee;border:1px solid #e6b1aa;color:#a93226;padding:6px 8px;border-radius:6px}
table{width:100%;border-collapse:collapse;margin:4px 0;font-variant-numeric:tabular-nums}
th{text-align:left;font-size:9px;text-transform:uppercase;color:#666;font-weight:600;border-bottom:1px solid #ccc;padding:3px 4px}
td{border-bottom:1px solid #eee;padding:3px 4px;vertical-align:top}
tr{break-inside:avoid}
.der{text-align:right}
tr.total td{font-weight:700;border-top:2px solid #1b1b1b;background:#f6f6f3}
.peq{font-size:9px;color:#666}
.desc{white-space:pre-line;color:#444}
footer.pie{margin-top:14px;border-top:1px solid #ccc;padding-top:6px;font-size:9px;color:#777}
svg{max-width:100%;height:auto}
`;

export function documento(o: { titulo: string; subtitulo: string; meta: string[]; cuerpo: string; pie: string }): string {
  return `<!doctype html><html lang="es-MX"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>${esc(o.titulo)}</title><style>${CSS}</style></head><body><div class="doc">`
    + `<header class="cab"><h1>${esc(o.titulo)}</h1><p>${esc(o.subtitulo)}</p>`
    + o.meta.map((m) => `<div class="meta">${esc(m)}</div>`).join('')
    + `</header>${o.cuerpo}<footer class="pie">${esc(o.pie)}</footer></div></body></html>`;
}

export const seccion = (num: string, titulo: string, cuerpo: string) =>
  `<section class="sec"><h2><span class="num">${esc(num)}</span>${esc(titulo)}</h2>${cuerpo}</section>`;

export function tabla(enc: string[], filas: Celda[][], o: { derecha?: number[]; total?: Celda[] } = {}): string {
  const td = (c: Celda, i: number) => (o.derecha?.includes(i) ? `<td class="der">${celda(c)}</td>` : `<td>${celda(c)}</td>`);
  const cuerpo = filas.map((f) => `<tr>${f.map(td).join('')}</tr>`).join('');
  const total = o.total ? `<tr class="total">${o.total.map(td).join('')}</tr>` : '';
  return `<table><thead><tr>${enc.map((e) => `<th>${esc(e)}</th>`).join('')}</tr></thead><tbody>${cuerpo}${total}</tbody></table>`;
}

/** Barras apiladas verticales; una columna por periodo. Sin interacción: es para papel. */
export function barrasApiladas(cols: { etiqueta: string; total: string; partes: { nombre: string; valor: number; color: string }[] }[]): string {
  const ancho = 600, alto = 180, base = 140, tope = 20, paso = ancho / Math.max(cols.length, 1), barra = Math.min(60, paso * 0.6);
  const max = Math.max(1, ...cols.map((c) => c.partes.reduce((a, p) => a + Math.max(0, p.valor), 0)));
  const esc_ = esc;
  const grupos = cols.map((c, i) => {
    const x = i * paso + (paso - barra) / 2;
    let y = base;
    const rects = c.partes.filter((p) => p.valor > 0).map((p) => {
      const h = (p.valor / max) * (base - tope);
      y -= h;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barra.toFixed(1)}" height="${h.toFixed(1)}" fill="${esc_(p.color)}"><title>${esc_(p.nombre)}</title></rect>`;
    }).join('');
    const cx = (x + barra / 2).toFixed(1);
    return `${rects}<text x="${cx}" y="${(y - 4).toFixed(1)}" font-size="9" text-anchor="middle">${esc_(c.total)}</text>`
      + `<text x="${cx}" y="${base + 14}" font-size="9" text-anchor="middle" fill="#666">${esc_(c.etiqueta)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" role="img">${grupos}</svg>`;
}

export function nombreArchivo(partes: string[], ext: 'html' | 'pdf'): string {
  const slug = partes.join('-').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug}.${ext}`;
}
```

Nota: el SVG usa `xmlns="http://www.w3.org/2000/svg"`; el test de «sin recursos externos» busca `src="http` y `href="http`, no `xmlns`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/comercializadora/exportar-html.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/exportar/html.ts tests/comercializadora/exportar-html.test.ts
git commit -m "feat(exportar): piezas de HTML autocontenido para descargar reportes"
```

---

### Task 2: Plantilla del Reporte semanal

**Files:**
- Create: `lib/comercializadora/exportar/reporteVentas.ts`
- Test: `tests/comercializadora/exportar-reporte-ventas.test.ts`

**Interfaces:**
- Consumes: Task 1 (`documento`, `seccion`, `tabla`, `barrasApiladas`, `crudo`, `esc`, `nombreArchivo`); tipos de `supabase/functions/_shared/reporte/*.ts` (`Reporte`, `Ventas`, `Surtido`, `Atencion`, `GrupoAtencion`, `Notas`, `SaldosSucursales`, `SaldosExternos`, `SaldoCliente`, `Apertura`, `Seccion`); `finSemana` de `supabase/functions/_shared/reporte/fechas.ts`; `pesos` de `lib/comercializadora/formato.ts`; `fechaCorta` de `lib/comercializadora/fechas.ts`.
- Produces:
  ```ts
  export function htmlReporteVentas(r: Reporte, o: { excluidasSucursales: string[]; aviso: string | null }): string;
  export const archivoVentas: (semana: string, ext: 'html' | 'pdf') => string;   // reporte-ventas-AAAA-MM-DD.ext
  ```

- [ ] **Step 1: Write the failing test**

```ts
// tests/comercializadora/exportar-reporte-ventas.test.ts
import { describe, expect, it } from 'vitest';
import { archivoVentas, htmlReporteVentas } from '@/lib/comercializadora/exportar/reporteVentas';
import type { Reporte } from '../../supabase/functions/_shared/reporte/reporte.ts';

const ind = (valor: number | null, meta: number, cumple: boolean | null) => ({ valor, meta, cumple });
const base = (): Reporte => ({
  lunes: '2026-11-16', fin: '2026-11-22', corte: '2026-11-25', leidoEn: '2026-11-25T17:00:00Z', sinClasificar: [],
  ventas: { ok: true, datos: {
    total: 1193333.39, sinIva: 1028735.68, pedidos: 97, promedio: 1218378.9, vsPromedio: -0.021,
    difAnterior: -73601.84, vsAnterior: -0.058, difAnteriorOrdinario: -24657.99, vsAnteriorOrdinario: -0.023,
    top: Array.from({ length: 9 }, (_, i) => ({ nombre: `Cliente ${i + 1}`, sucursales: ['Suc A'], total: 1000 - i })),
    semanas: [{ lunes: '2026-11-16', total: 1193333.39, porTipo: { Ordinario: 1053000, 'Llenado de canal': 6000, Apertura: 134333.39 } }],
  } },
  surtido: { ok: true, datos: {
    enviados: 71, conFaltante: 35, incidenciasTotal: 36, casos: { stock: 29, pickeo: 6, paqueteria: 1, otro: 0 },
    fill: ind(0.507, 98, false), stock: ind(0.408, 1, false), pickeo: ind(0.915, 98, false), fisica: ind(0.014, 1, false),
    envio: { ...ind(1, 100, true), universo: 54, enMeta: 54, buckets: [8, 24, 22, 0], fuera: [] },
    incidencias: [{ ov: 'COM-OV-04809', sucursal: 'Marina Vallarta', cliente: 'MOP', origen: 'paqueteria', tipo: 'Derrame', resolucion: 'Resuelto' }],
  } },
  atencion: { ok: true, datos: {
    propias: { abiertas: 0, resueltasSemana: 0, semanas: [] },
    externos: { abiertas: 1, resueltasSemana: 0, semanas: [{ lunes: '2026-11-16', casos: [
      { ov: 'COM-OV-04883', fecha: '2026-11-17', sucursal: 'Ávila Camacho', cliente: 'Virtuo <MKT>', tipo: 'Pedido Incompleto', resolucion: 'En Proceso', resuelto: false, descripcion: 'Falta vaso\n12 oz' },
    ] }] },
  } },
  notas: { ok: false, error: 'Zoho no respondió: 429' },
  sucursales: { ok: true, datos: { anio: 2026, total: 30, dentro: 10, fueraAnio: 20, anteriores: 0, facturas: 2, filas: [{ sucursal: 'Ventura', dentro: 10, fueraAnio: 20, anteriores: 0, facturas: 2 }] } },
  externos: { ok: true, datos: {
    filas: [{ cliente: 'Tandem', nota: '', masAntigua: '2026-10-13', dias: 43, saldo: 100, llenado: 100 }], subtotal: 100,
    creditos: [{ cliente: 'Tandem', nota: 'Patio Santa Fe · crédito', masAntigua: '2026-06-29', dias: 149, saldo: 50, llenado: 0 }], subtotalCreditos: 50,
    total: 150, interna: [{ cliente: 'Marketing', nota: '', masAntigua: '2026-04-21', dias: 218, saldo: 70, llenado: 0 }], totalInterna: 70,
    excluidos: [{ cliente: 'Dodo Pizza', saldo: 22 }], anterior: 266433.05,
  } },
  aperturas: { ok: true, datos: [{ ov: 'COM-OV-05069', fecha: '2026-11-24', sucursal: 'Plaza Sania', cliente: 'Jorge Montelongo', envio: null, estadoEnvio: '' }] },
});

describe('HTML del Reporte semanal', () => {
  const h = htmlReporteVentas(base(), { excluidasSucursales: ['Polanco'], aviso: null });

  it('trae las seis secciones y el encabezado con la semana', () => {
    for (const t of ['Ventas de la semana', 'Calidad de surtido', 'Atención al cliente', 'Notas de crédito', 'Saldos de sucursales propias', 'Saldos pendientes · clientes externos', 'Aperturas'])
      expect(h).toContain(t);
    expect(h).toContain('16 nov – 22 nov');
    expect(h).toContain('$1,193,333.39');
  });
  it('listas completas: los 9 clientes del top y todas las filas de saldos', () => {
    expect(h).toContain('Cliente 9');
    expect(h).toContain('Marketing');
    expect(h).toContain('Patio Santa Fe · crédito');
    expect(h).toContain('era $266,433.05 la semana pasada');
  });
  it('escapa el texto de Zoho y conserva saltos de línea de las descripciones', () => {
    expect(h).toContain('Virtuo &lt;MKT&gt;');
    expect(h).not.toContain('Virtuo <MKT>');
    expect(h).toContain('Falta vaso\n12 oz');
  });
  it('una sección fallida sale como error y las demás siguen', () => {
    expect(h).toContain('No se pudo leer esta sección: Zoho no respondió: 429');
    expect(h).toContain('Plaza Sania');
  });
  it('incluye el aviso y los valores sin clasificar cuando existen', () => {
    const r = base(); r.sinClasificar = ['Tipo de envío: Raro'];
    const h2 = htmlReporteVentas(r, { excluidasSucursales: [], aviso: 'Datos de hace 20 min; Zoho no respondió' });
    expect(h2).toContain('Datos de hace 20 min');
    expect(h2).toContain('Tipo de envío: Raro');
  });
  it('sin scripts y con gráfica SVG', () => {
    expect(h).not.toContain('<script');
    expect(h).toContain('<svg');
  });
  it('nombre de archivo', () => {
    expect(archivoVentas('2026-11-16', 'pdf')).toBe('reporte-ventas-2026-11-16.pdf');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/comercializadora/exportar-reporte-ventas.test.ts`
Expected: FAIL — no existe `@/lib/comercializadora/exportar/reporteVentas`.

- [ ] **Step 3: Write the implementation**

```ts
// lib/comercializadora/exportar/reporteVentas.ts
import { pesos } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import type { Reporte } from '../../../supabase/functions/_shared/reporte/reporte.ts';
import type { Seccion } from '../../../supabase/functions/_shared/reporte/tipos.ts';
import type { Ventas } from '../../../supabase/functions/_shared/reporte/ventas.ts';
import type { Indicador, Origen, Surtido } from '../../../supabase/functions/_shared/reporte/surtido.ts';
import type { Apertura, Atencion, GrupoAtencion, Notas } from '../../../supabase/functions/_shared/reporte/atencion.ts';
import type { SaldoCliente, SaldosExternos, SaldosSucursales } from '../../../supabase/functions/_shared/reporte/saldos.ts';
import { finSemana } from '../../../supabase/functions/_shared/reporte/fechas.ts';
import { barrasApiladas, crudo, documento, esc, nombreArchivo, seccion, tabla } from './html';

export const archivoVentas = (semana: string, ext: 'html' | 'pdf') => nombreArchivo(['reporte-ventas', semana], ext);

const pct = (x: number | null, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
const vari = (x: number | null) => (x == null ? '—' : `${x >= 0 ? '▲' : '▼'} ${Math.abs(x * 100).toFixed(1)}%`);
const rango = (l: string) => `${fechaCorta(l)} – ${fechaCorta(finSemana(l))}`;
const COLOR: Record<string, string> = { Ordinario: '#1b1b1b', 'Llenado de canal': '#8c5f36', Apertura: '#2f7a4f', 'Sin clasificar': '#9a958c' };
const ORIGEN: Record<Origen, string> = { stock: 'Error de surtido (falta de stock)', pickeo: 'Error de pickeo', paqueteria: 'Paquetería', otro: 'Sin clasificar' };

function o<T>(s: Seccion<T>, f: (d: T) => string): string {
  return s.ok ? f(s.datos) : `<p class="error">No se pudo leer esta sección: ${esc(s.error)}</p>`;
}
const tarjeta = (et: string, va: string, no = '', clase = '') =>
  `<div class="tarjeta"><div class="et">${esc(et)}</div><div class="va ${clase}">${esc(va)}</div><div class="no">${esc(no)}</div></div>`;
const meta = (i: Indicador, signo: string) => `Meta: ${signo}${i.meta}%`;
const clase = (i: Indicador) => (i.cumple == null ? '' : i.cumple ? 'ok' : 'mal');

function ventas(v: Ventas): string {
  const grafica = barrasApiladas(v.semanas.map((s) => ({
    etiqueta: fechaCorta(s.lunes), total: pesos(s.total),
    partes: Object.entries(s.porTipo).map(([nombre, valor]) => ({ nombre, valor, color: COLOR[nombre] ?? '#9a958c' })),
  })));
  return `<div class="tarjetas">${tarjeta('Ventas con IVA', pesos(v.total), `~${pesos(v.sinIva)} sin IVA`)}${tarjeta('Pedidos facturados', String(v.pedidos))}`
    + `${tarjeta('Vs semana anterior', vari(v.vsAnterior), pesos(v.difAnterior))}${tarjeta('Vs promedio 5 semanas', vari(v.vsPromedio), pesos(v.promedio))}</div>`
    + tabla(['#', 'Cliente', 'Sucursales', 'Total'], v.top.map((t, i) => [String(i + 1).padStart(2, '0'), t.nombre, t.sucursales.join(', '), pesos(t.total)]), { derecha: [3] })
    + `<p class="peq">Últimas 5 semanas, con IVA, por tipo de envío (${Object.keys(COLOR).join(' · ')}).</p>${grafica}`
    + `<p class="peq">Solo ordinario vs semana anterior: ${esc(pesos(v.difAnteriorOrdinario))} ${esc(vari(v.vsAnteriorOrdinario))}</p>`;
}

function surtido(s: Surtido): string {
  const fuera = s.envio.fuera.map((f) => `${f.sucursal} ${f.ov} (${fechaCorta(f.fecha)} → ${fechaCorta(f.envio)}, ${f.dias} días)`);
  return `<p>${s.enviados} pedidos enviados en la semana.</p><div class="tarjetas">`
    + tarjeta('Fill rate', pct(s.fill.valor), `${meta(s.fill, '≥')} · ${s.conFaltante} con faltante`, clase(s.fill))
    + tarjeta('Faltante por stock', pct(s.stock.valor), `${meta(s.stock, '≤')} · ${s.casos.stock} casos`, clase(s.stock))
    + tarjeta('Precisión de pickeo', pct(s.pickeo.valor), `${meta(s.pickeo, '≥')} · ${s.casos.pickeo} casos`, clase(s.pickeo))
    + tarjeta('Calidad física', pct(s.fisica.valor), `${meta(s.fisica, '≤')} · ${s.casos.paqueteria} casos`, clase(s.fisica))
    + `</div><div class="tarjetas">${tarjeta('Envío en tiempo', pct(s.envio.valor), `${s.envio.enMeta} de ${s.envio.universo} · mismo día ${s.envio.buckets[0]} · 1 día ${s.envio.buckets[1]} · 2 días ${s.envio.buckets[2]} · más ${s.envio.buckets[3]}`, clase(s.envio))}</div>`
    + (fuera.length ? `<p class="peq mal">Fuera de meta: ${esc(fuera.join('; '))}</p>` : '')
    + `<p class="peq">Incidencias por origen: ${s.incidenciasTotal} (${pct(s.enviados ? s.incidenciasTotal / s.enviados : null)} de los pedidos).</p>`
    + tabla(['OV', 'Sucursal', 'Origen', 'Estatus'], s.incidencias.map((f) => [f.ov, f.sucursal, ORIGEN[f.origen], f.resolucion || 'Abierta']));
}

function grupo(titulo: string, g: GrupoAtencion, conCliente: boolean): string {
  const filas = g.semanas.flatMap((s) => s.casos.map((c) => [
    rango(s.lunes), c.ov, conCliente && c.sucursal ? `${c.sucursal} (${c.cliente})` : c.sucursal || c.cliente,
    `${c.tipo} · ${c.resolucion}`, crudo(`<span class="desc">${esc(c.descripcion)}</span>`),
  ]));
  return `<h3>${esc(titulo)} · ${g.abiertas} abiertas · ${g.resueltasSemana} resueltas esta semana</h3>`
    + (filas.length ? tabla(['Semana', 'OV', 'Sucursal', 'Tipo · estatus', 'Descripción'], filas) : '<p class="peq">Sin incidencias abiertas.</p>');
}
const atencion = (a: Atencion) => grupo('Sucursales propias', a.propias, false) + grupo('Clientes externos', a.externos, true);

const notas = (n: Notas) => n.filas.length
  ? tabla(['Folio', 'Cliente', 'Sucursal', 'Descripción', 'Total'], n.filas.map((f) => [f.numero, f.cliente, f.sucursal, f.descripcion, pesos(f.total)]), { derecha: [4], total: ['Total NC', '', '', '', pesos(n.total)] })
  : '<p class="peq">Sin notas de crédito esta semana.</p>';

const sucursales = (s: SaldosSucursales, excluidas: string[]) =>
  `<p>${esc(pesos(s.total))} en ${s.facturas} facturas abiertas${excluidas.length ? ` · excluye ${esc(excluidas.join(', '))}` : ''}.</p>`
  + tabla(['Sucursal', 'Dentro de crédito', `Fuera de crédito ${s.anio}`, `Antes de ${s.anio}`],
    s.filas.map((f) => [f.sucursal, pesos(f.dentro), pesos(f.fueraAnio), pesos(f.anteriores)]), { derecha: [1, 2, 3], total: ['Total', pesos(s.dentro), pesos(s.fueraAnio), pesos(s.anteriores)] });

const filasCliente = (fs: SaldoCliente[]) => fs.map((f) => [
  f.nota ? `${f.cliente} — ${f.nota}` : f.cliente,
  f.llenado > 0 ? (Math.abs(f.llenado - f.saldo) < 0.01 ? '100% llenado canal' : `Llenado canal ${pesos(f.llenado)}`) : '',
  fechaCorta(f.masAntigua), f.dias, pesos(f.saldo),
]);
function externos(e: SaldosExternos & { anterior: number | null }, corte: string): string {
  const enc = ['Cliente', 'Llenado de canal', 'Más antigua', 'Días', 'Saldo'];
  return `<p>Saldos de clientes externos: <b>${esc(pesos(e.total))}</b>${e.anterior != null ? ` (era ${esc(pesos(e.anterior))} la semana pasada)` : ''}, de los cuales ${esc(pesos(e.subtotalCreditos))} son créditos activos. Saldo al ${esc(fechaCorta(corte))}.</p>`
    + tabla(enc, filasCliente(e.filas), { derecha: [3, 4], total: ['Subtotal sin créditos activos', '', '', '', pesos(e.subtotal)] })
    + `<h3>Créditos activos</h3>` + tabla(enc, filasCliente(e.creditos), { derecha: [3, 4], total: ['Subtotal créditos activos', '', '', '', pesos(e.subtotalCreditos)] })
    + `<h3>Deuda interna · mismo corporativo</h3>` + tabla(enc, filasCliente(e.interna), { derecha: [3, 4], total: ['Total deuda interna', '', '', '', pesos(e.totalInterna)] })
    + (e.excluidos.length ? `<p class="peq">Excluye ${esc(e.excluidos.map((x) => `${x.cliente} (${pesos(x.saldo)})`).join(', '))}.</p>` : '');
}

const aperturas = (a: Apertura[]) => a.length
  ? tabla(['Sucursal', 'Franquiciatario', 'OV', 'Pedido', 'Estatus'], a.map((x) => [x.sucursal, x.cliente, x.ov, fechaCorta(x.fecha), x.envio ? `Enviado ${fechaCorta(x.envio)}` : 'Por enviar']))
  : '<p class="peq">Sin aperturas en curso.</p>';

export function htmlReporteVentas(r: Reporte, opc: { excluidasSucursales: string[]; aviso: string | null }): string {
  const leido = new Date(r.leidoEn).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  const avisos = (opc.aviso ? `<p class="aviso">${esc(opc.aviso)}</p>` : '')
    + (r.sinClasificar.length ? `<p class="aviso">Valores de Zoho sin clasificar (se cuentan aparte): ${esc(r.sinClasificar.join('; '))}.</p>` : '');
  const cuerpo = avisos
    + seccion('01', 'Ventas de la semana', o(r.ventas, ventas))
    + seccion('02', 'Calidad de surtido', o(r.surtido, surtido))
    + `<div class="salto"></div>` + seccion('03', 'Atención al cliente · incidencias abiertas', o(r.atencion, atencion))
    + seccion('04', 'Notas de crédito', o(r.notas, notas))
    + seccion('05', 'Saldos de sucursales propias', o(r.sucursales, (s) => sucursales(s, opc.excluidasSucursales)))
    + seccion('06', 'Saldos pendientes · clientes externos', o(r.externos, (e) => externos(e, r.corte)))
    + seccion('07', 'Aperturas · seguimiento', o(r.aperturas, aperturas));
  return documento({
    titulo: 'Reporte semanal · Comercializadora',
    subtitulo: `Ventas y supply chain · ${rango(r.lunes)}`,
    meta: [`Leído de Zoho Books el ${leido}`],
    cuerpo,
    pie: 'Fuente: Zoho Books (facturas, órdenes de venta, paquetes, notas de crédito y saldos). Las incidencias se capturan días después de la entrega; estas cifras pueden moverse.',
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/comercializadora/exportar-reporte-ventas.test.ts`
Expected: PASS (7 tests). Si `fechaCorta` o `pesos` difieren en formato (por ejemplo `$1,193,333.39`), ajusta el test al formato real de `pesos()` — no cambies `pesos()`.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/exportar/reporteVentas.ts tests/comercializadora/exportar-reporte-ventas.test.ts
git commit -m "feat(exportar): plantilla HTML del Reporte semanal"
```

---

### Task 3: HTML a PDF con Chromium

**Files:**
- Modify: `package.json` / `package-lock.json` (dependencias)
- Modify: `next.config.ts`
- Create: `lib/comercializadora/exportar/pdf.ts`
- Test: `tests/comercializadora/exportar-pdf.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Lanzador = () => Promise<{ newPage(): Promise<{ setContent(html: string, o: { waitUntil: 'load' }): Promise<unknown>; pdf(o: object): Promise<Uint8Array> }>; close(): Promise<void> }>;
  export async function htmlAPdf(html: string, deps?: { lanzar?: Lanzador }): Promise<Uint8Array>;   // lanza Error("No se pudo generar el PDF: …")
  export const OPCIONES_PDF: { format: 'letter'; printBackground: true; margin: {...}; displayHeaderFooter: true; headerTemplate: string; footerTemplate: string };
  ```

- [ ] **Step 1: Install dependencies**

Lee el README de `@sparticuz/chromium` (en `node_modules/@sparticuz/chromium/README.md` tras instalar, o la página del paquete en npm) para la versión de `puppeteer-core` compatible. Instala ambas con versión exacta:

Run: `npm install --save-exact @sparticuz/chromium puppeteer-core`
Luego, si el README pide una versión concreta de `puppeteer-core` distinta a la instalada, reinstálala con `npm install --save-exact puppeteer-core@<versión>`. Anota las versiones en el commit.

En `next.config.ts`:

```ts
import type { NextConfig } from 'next';
// Chromium para generar PDFs: no se empaqueta con el código de la app (spec descargas §4).
const config: NextConfig = { poweredByHeader: false, serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'] };
export default config;
```

(Confirma el nombre `serverExternalPackages` en `node_modules/next/dist/docs/`.)

- [ ] **Step 2: Write the failing test**

```ts
// tests/comercializadora/exportar-pdf.test.ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { htmlAPdf, OPCIONES_PDF } from '@/lib/comercializadora/exportar/pdf';

describe('htmlAPdf', () => {
  it('carga el HTML, imprime carta con márgenes y número de página, y cierra el navegador', async () => {
    const pasos: string[] = [];
    const lanzar = async () => ({
      newPage: async () => ({
        setContent: async (h: string) => { pasos.push(`contenido:${h.length}`); },
        pdf: async (o: object) => { pasos.push(`pdf:${JSON.stringify(o).includes('letter')}`); return new Uint8Array([37, 80, 68, 70]); },
      }),
      close: async () => { pasos.push('cerrado'); },
    });
    const pdf = await htmlAPdf('<p>x</p>', { lanzar });
    expect(Array.from(pdf.slice(0, 4))).toEqual([37, 80, 68, 70]);
    expect(pasos).toEqual(['contenido:8', 'pdf:true', 'cerrado']);
    expect(OPCIONES_PDF.footerTemplate).toContain('pageNumber');
    expect(OPCIONES_PDF.margin).toEqual({ top: '12mm', bottom: '14mm', left: '12mm', right: '12mm' });
  });
  it('si Chromium falla, cierra y lanza un error claro', async () => {
    let cerrado = false;
    const lanzar = async () => ({
      newPage: async () => ({ setContent: async () => { throw new Error('crash'); }, pdf: async () => new Uint8Array() }),
      close: async () => { cerrado = true; },
    });
    await expect(htmlAPdf('<p>x</p>', { lanzar })).rejects.toThrow('No se pudo generar el PDF: crash');
    expect(cerrado).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/comercializadora/exportar-pdf.test.ts`
Expected: FAIL — no existe `@/lib/comercializadora/exportar/pdf`.

- [ ] **Step 4: Write the implementation**

```ts
// lib/comercializadora/exportar/pdf.ts
import 'server-only';

type Pagina = { setContent(html: string, o: { waitUntil: 'load' }): Promise<unknown>; pdf(o: object): Promise<Uint8Array> };
type Navegador = { newPage(): Promise<Pagina>; close(): Promise<void> };
export type Lanzador = () => Promise<Navegador>;

export const OPCIONES_PDF = {
  format: 'letter' as const,
  printBackground: true as const,
  margin: { top: '12mm', bottom: '14mm', left: '12mm', right: '12mm' },
  displayHeaderFooter: true as const,
  headerTemplate: '<span></span>',
  footerTemplate: '<div style="font-size:8px;color:#777;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
};

/**
 * Chromium sin cabeza: en Vercel usa @sparticuz/chromium; en desarrollo local, el Chrome/Edge de la máquina
 * indicado en CHROMIUM_PATH (p. ej. C:\Program Files\Google\Chrome\Application\chrome.exe).
 */
const lanzarReal: Lanzador = async () => {
  const puppeteer = (await import('puppeteer-core')).default;
  const local = process.env.CHROMIUM_PATH;
  if (local) return puppeteer.launch({ executablePath: local, headless: true }) as unknown as Navegador;
  const chromium = (await import('@sparticuz/chromium')).default;
  return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true }) as unknown as Navegador;
};

export async function htmlAPdf(html: string, deps: { lanzar?: Lanzador } = {}): Promise<Uint8Array> {
  let nav: Navegador | null = null;
  try {
    nav = await (deps.lanzar ?? lanzarReal)();
    const pagina = await nav.newPage();
    await pagina.setContent(html, { waitUntil: 'load' });
    return await pagina.pdf(OPCIONES_PDF);
  } catch (e) {
    throw new Error(`No se pudo generar el PDF: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    await nav?.close().catch(() => {});
  }
}
```

Si `npm run typecheck` reclama tipos de `puppeteer.launch` (las opciones `headless` cambian entre versiones), ajusta solo la llamada según la versión instalada; no cambies la firma de `htmlAPdf`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/comercializadora/exportar-pdf.test.ts` y `npm run typecheck`
Expected: PASS (2 tests); typecheck limpio.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json next.config.ts lib/comercializadora/exportar/pdf.ts tests/comercializadora/exportar-pdf.test.ts
git commit -m "feat(exportar): HTML a PDF con Chromium (puppeteer-core + @sparticuz/chromium)"
```

---

### Task 4: Ruta de descarga y botón

**Files:**
- Create: `lib/comercializadora/exportar/descarga.ts`
- Create: `app/(comercializadora)/comercializadora/reporte-semanal/descargar/route.ts`
- Create: `components/comercializadora/reporte-semanal/descargar.tsx`
- Modify: `app/(comercializadora)/comercializadora/reporte-semanal/page.tsx` (botón en el encabezado)
- Test: `tests/comercializadora/exportar-descarga.test.ts`
- Test: `tests/comercializadora/descargar-boton.test.tsx`

**Interfaces:**
- Consumes: `htmlReporteVentas`, `archivoVentas` (Task 2); `htmlAPdf` (Task 3); `leerReporteSemanal`, `semanaDeUrl` (`lib/comercializadora/reporteSemanal.ts`); `sesionComercializadora` (`lib/supabase/sesion.ts`); `normalizarConfigReporte`; `com`; `hoyCdmx`.
- Produces:
  ```ts
  // descarga.ts
  export type Formato = 'html' | 'pdf';
  export function parametrosDescarga(url: string, hoy: string): { semana: string; formato: Formato };
  export function respuestaArchivo(cuerpo: string | Uint8Array, nombre: string, formato: Formato): Response;
  export function respuestaError(estado: 401 | 403 | 500 | 502, mensaje: string): Response;
  // descargar.tsx
  export function DescargarReporte({ semana }: { semana: string }): JSX.Element;
  ```

- [ ] **Step 1: Read the Next docs**

Lee en `node_modules/next/dist/docs/` la guía de route handlers (`route.ts`, `GET(request)`, `export const runtime` y `maxDuration`). Si difiere de `app/api/comercializadora/ov-sugerida/route.ts`, sigue la guía.

- [ ] **Step 2: Write the failing tests**

```ts
// tests/comercializadora/exportar-descarga.test.ts
import { describe, expect, it } from 'vitest';
import { parametrosDescarga, respuestaArchivo, respuestaError } from '@/lib/comercializadora/exportar/descarga';

describe('descarga de reportes', () => {
  it('lee semana y formato; semana inválida cae en la de por omisión y formato inválido en html', () => {
    expect(parametrosDescarga('http://x/d?semana=2026-11-16&formato=pdf', '2026-11-25')).toEqual({ semana: '2026-11-16', formato: 'pdf' });
    expect(parametrosDescarga('http://x/d?semana=hola&formato=exe', '2026-11-25')).toEqual({ semana: '2026-11-16', formato: 'html' });
  });
  it('archivo HTML como descarga con nombre', async () => {
    const r = respuestaArchivo('<p>á</p>', 'reporte-ventas-2026-11-16.html', 'html');
    expect(r.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(r.headers.get('content-disposition')).toBe('attachment; filename="reporte-ventas-2026-11-16.html"');
    expect(await r.text()).toBe('<p>á</p>');
  });
  it('archivo PDF', () => {
    const r = respuestaArchivo(new Uint8Array([37, 80]), 'r.pdf', 'pdf');
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('error con estado y mensaje claro, sin datos', async () => {
    const r = respuestaError(403, 'No tienes acceso a Comercializadora');
    expect(r.status).toBe(403);
    expect(await r.text()).toBe('No tienes acceso a Comercializadora');
  });
});
```

```tsx
// tests/comercializadora/descargar-boton.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DescargarReporte } from '@/components/comercializadora/reporte-semanal/descargar';

describe('botón Descargar', () => {
  it('HTML es un enlace directo a la ruta con la semana', () => {
    render(<DescargarReporte semana="2026-11-16" />);
    const a = screen.getByRole('link', { name: /HTML/ });
    expect(a.getAttribute('href')).toBe('reporte-semanal/descargar?semana=2026-11-16&formato=html');
  });
  it('si el PDF falla, muestra el error y ofrece el HTML', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('No se pudo generar el PDF: crash', { status: 502 })));
    render(<DescargarReporte semana="2026-11-16" />);
    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No se pudo generar el PDF: crash'));
    expect(screen.getByRole('alert').querySelector('a')?.getAttribute('href')).toBe('reporte-semanal/descargar?semana=2026-11-16&formato=html');
    vi.unstubAllGlobals();
  });
});
```

(Antes de escribir el test de componente, revisa `tests/portal/setup.ts` y un `*.test.tsx` existente para confirmar que `@testing-library/react` está instalado y cómo se importa; si el proyecto usa otra utilidad, usa esa.)

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/comercializadora/exportar-descarga.test.ts tests/comercializadora/descargar-boton.test.tsx`
Expected: FAIL — módulos no encontrados.

- [ ] **Step 4: Write `descarga.ts`**

```ts
// lib/comercializadora/exportar/descarga.ts
import { semanaDeUrl } from '@/lib/comercializadora/reporteSemanal';

export type Formato = 'html' | 'pdf';

export function parametrosDescarga(url: string, hoy: string): { semana: string; formato: Formato } {
  const p = new URL(url).searchParams;
  return { semana: semanaDeUrl(p.get('semana'), hoy), formato: p.get('formato') === 'pdf' ? 'pdf' : 'html' };
}

export function respuestaArchivo(cuerpo: string | Uint8Array, nombre: string, formato: Formato): Response {
  return new Response(cuerpo as BodyInit, {
    headers: {
      'Content-Type': formato === 'pdf' ? 'application/pdf' : 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const respuestaError = (estado: 401 | 403 | 500 | 502, mensaje: string) =>
  new Response(mensaje, { status: estado, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
```

Nota: `lib/comercializadora/reporteSemanal.ts` importa `server-only`; si el test de `descarga.ts` falla por eso, agrega `vi.mock('server-only', () => ({}))` al inicio del test (patrón de `tests/portal/*.test.ts`).

- [ ] **Step 5: Write the route**

```ts
// app/(comercializadora)/comercializadora/reporte-semanal/descargar/route.ts
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import { leerReporteSemanal } from '@/lib/comercializadora/reporteSemanal';
import { com } from '@/lib/comercializadora/consultas';
import { normalizarConfigReporte } from '../../../../../supabase/functions/_shared/reporte/config.ts';
import { archivoVentas, htmlReporteVentas } from '@/lib/comercializadora/exportar/reporteVentas';
import { htmlAPdf } from '@/lib/comercializadora/exportar/pdf';
import { parametrosDescarga, respuestaArchivo, respuestaError } from '@/lib/comercializadora/exportar/descarga';

export const runtime = 'nodejs';
// Puede leer Zoho si la copia de la función venció (hasta 150 s) y luego arrancar Chromium.
export const maxDuration = 300;

export async function GET(req: Request) {
  let db;
  try {
    ({ db } = await sesionComercializadora(false));
  } catch (e) {
    const m = e instanceof Error ? e.message : 'Sin sesión';
    return respuestaError(/sesión venció/i.test(m) ? 401 : 403, m);
  }
  const { semana, formato } = parametrosDescarga(req.url, hoyCdmx());
  const [r, cfgR] = await Promise.all([
    leerReporteSemanal(semana, false),
    com(db).from('com_reporte_config').select('config').eq('id', 1).maybeSingle(),
  ]);
  if (!r.ok) return respuestaError(502, r.error);
  const html = htmlReporteVentas(r.reporte, {
    excluidasSucursales: normalizarConfigReporte(cfgR.data?.config).excluir_saldos_sucursales,
    aviso: r.aviso,
  });
  if (formato === 'html') return respuestaArchivo(html, archivoVentas(semana, 'html'), 'html');
  try {
    return respuestaArchivo(await htmlAPdf(html), archivoVentas(semana, 'pdf'), 'pdf');
  } catch (e) {
    console.error('[comercializadora] descarga pdf', e instanceof Error ? e.message : e);
    return respuestaError(502, e instanceof Error ? e.message : 'No se pudo generar el PDF.');
  }
}
```

- [ ] **Step 6: Write the button and wire it in the page**

```tsx
// components/comercializadora/reporte-semanal/descargar.tsx
'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';

/** HTML: enlace directo. PDF: se pide con fetch para poder mostrar el error y ofrecer el HTML si falla. */
export function DescargarReporte({ semana }: { semana: string }) {
  const base = `reporte-semanal/descargar?semana=${semana}`;
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pdf() {
    setPendiente(true);
    setError(null);
    try {
      const r = await fetch(`${base}&formato=pdf`);
      if (!r.ok) throw new Error((await r.text()) || 'No se pudo generar el PDF.');
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-ventas-${semana}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el PDF.');
    } finally {
      setPendiente(false);
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      <Download size={14} aria-hidden="true" />
      <a href={`${base}&formato=html`} download className="font-semibold underline">HTML</a>
      <button type="button" onClick={pdf} disabled={pendiente} className="font-semibold underline">
        {pendiente ? 'Generando PDF…' : 'PDF'}
      </button>
      {error && (
        <span role="alert" className="text-bad">
          {error} <a href={`${base}&formato=html`} download className="underline">Bajar HTML</a>
        </span>
      )}
    </span>
  );
}
```

En `page.tsx`, importa `DescargarReporte` y colócalo dentro de `<Encabezado>` justo después de `<ActualizarReporte semana={semana} />`:

```tsx
      <ActualizarReporte semana={semana} />
      <DescargarReporte semana={semana} />
```

Los enlaces son relativos (`reporte-semanal/descargar?…`) porque la página vive en `/comercializadora/reporte-semanal`; si en el navegador resuelven a una ruta incorrecta, cámbialos a absolutos `/comercializadora/reporte-semanal/descargar?…` en el componente y en ambos tests.

- [ ] **Step 7: Run tests and typecheck**

Run: `npx vitest run tests/comercializadora/` y `npm run typecheck`
Expected: PASS; typecheck limpio.

- [ ] **Step 8: Commit**

```bash
git add lib/comercializadora/exportar/descarga.ts "app/(comercializadora)/comercializadora/reporte-semanal/descargar/route.ts" components/comercializadora/reporte-semanal/descargar.tsx "app/(comercializadora)/comercializadora/reporte-semanal/page.tsx" tests/comercializadora/exportar-descarga.test.ts tests/comercializadora/descargar-boton.test.tsx
git commit -m "feat(reporte-semanal): descargar el reporte en HTML y PDF"
```

---

### Task 5: Verificación en el navegador

**Files:** ninguno nuevo (correcciones con su prueba en el archivo que corresponda).

- [ ] **Step 1:** Instala dependencias en la carpeta de trabajo si falta `node_modules` (`npm ci`), copia `.env.local` de la carpeta principal y agrega `CHROMIUM_PATH` con la ruta del Chrome o Edge local en `.env.local` (no se sube).
- [ ] **Step 2:** Levanta el portal desde la carpeta de trabajo en el puerto 3001 y abre `/comercializadora/reporte-semanal?semana=2026-11-16` con sesión iniciada.
- [ ] **Step 3:** Baja el HTML: ábrelo, confirma las 7 secciones, listas completas, gráfica y que no tiene `<script>`.
- [ ] **Step 4:** Baja el PDF: abre el archivo, revisa tamaño carta, números de página, saltos de página razonables y que el contenido coincide con la pantalla.
- [ ] **Step 5:** Fuerza un fallo de PDF (por ejemplo `CHROMIUM_PATH` apuntando a un archivo inexistente) y confirma que el botón muestra el error con el enlace «Bajar HTML». Restaura la variable.
- [ ] **Step 6:** Commit de correcciones si las hubo.
