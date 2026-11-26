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
const GUIA = 'var(--color-line, #e3ded4)';
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
