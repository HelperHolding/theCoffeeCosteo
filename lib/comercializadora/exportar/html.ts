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
section.sec{margin:14px 0}
.sec h2{display:flex;gap:8px;align-items:center;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#555;margin:0 0 6px}
.sec h2 .num{background:#1b1b1b;color:#fff;font-family:monospace;font-size:9px;padding:2px 6px;border-radius:3px}
.sec h3{font-size:11px;margin:10px 0 4px}
.salto{break-before:page}
.tarjetas{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:6px 0}
.tarjeta{border:1px solid #ddd;border-radius:6px;padding:6px 8px;break-inside:avoid}
.tarjeta .et{font-size:9px;text-transform:uppercase;color:#666}
.tarjeta .va{font-size:16px;font-weight:700;font-variant-numeric:tabular-nums}
.tarjeta .no{font-size:9px;color:#666}
.ok{color:#1e7a44}.mal{color:#b3261e}
.aviso{background:#fef7ec;border:1px solid #e8c48c;color:#8a5207;padding:6px 8px;border-radius:6px;margin:6px 0}
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
  const ancho = 600, alto = 180, base = 140, tope = 20;
  const paso = ancho / Math.max(cols.length, 1), barra = Math.min(60, paso * 0.6);
  const max = Math.max(1, ...cols.map((c) => c.partes.reduce((a, p) => a + Math.max(0, p.valor), 0)));
  const grupos = cols.map((c, i) => {
    const x = i * paso + (paso - barra) / 2;
    let y = base;
    const rects = c.partes.filter((p) => p.valor > 0).map((p) => {
      const h = (p.valor / max) * (base - tope);
      y -= h;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barra.toFixed(1)}" height="${h.toFixed(1)}" fill="${esc(p.color)}"><title>${esc(p.nombre)}</title></rect>`;
    }).join('');
    const cx = (x + barra / 2).toFixed(1);
    return `${rects}<text x="${cx}" y="${(y - 4).toFixed(1)}" font-size="9" text-anchor="middle">${esc(c.total)}</text>`
      + `<text x="${cx}" y="${base + 14}" font-size="9" text-anchor="middle" fill="#666">${esc(c.etiqueta)}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" role="img">${grupos}</svg>`;
}

export function nombreArchivo(partes: string[], ext: 'html' | 'pdf'): string {
  const slug = partes.join('-').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slug}.${ext}`;
}
