import type { PedidoVista } from './contratos';
import { etiquetaOrigen } from './metricas';

/**
 * Etiqueta de pedido para pegar en el vaso o la bolsa (una por producto: el POS manda una línea por unidad). Formato
 * de impresora térmica de etiquetas, 58 × 80 mm, una etiqueta por página. Sin precios: solo qué es, cómo va y para
 * quién. El HTML se arma aquí (puro, probado) y la impresión vive en components/sucursales/etiqueta.tsx.
 */
export const ETIQUETA_MM = { ancho: 58, alto: 80 } as const;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Personalización que es el vaso o el tamaño («Regular - 440ml», «Large - 600ml»): va destacada aparte. */
const ES_TAMANO = /^(regular|large|grande|chica|tradicional)\b|\d+\s?ml\b/i;

export interface DatosEtiqueta {
  producto: string;
  tamano: string | null;
  opciones: string[];
  /** «Rappi #2490326996», «Mostrador · #32758688», «App The Coffee · #…». */
  para: string;
  cuando: string;
  numero: number;
  total: number;
  sucursal: string;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Una etiqueta por línea del pedido (o solo las de `indices`). */
export function datosEtiquetas(p: PedidoVista, sucursal: string, indices?: number[]): DatosEtiqueta[] {
  const cuales = indices ?? p.lineas.map((_, i) => i);
  const [, mes, dia] = p.fecha.split('-').map(Number);
  const para =
    p.origen === 'rappi' ? `Rappi #${p.numeroPedidoRappi ?? p.id}` : `${etiquetaOrigen[p.origen]} · #${p.id}`;
  return cuales
    .filter((i) => p.lineas[i])
    .map((i) => {
      const l = p.lineas[i];
      const tamano = l.customs.find((c) => ES_TAMANO.test(c.nombre))?.nombre ?? null;
      return {
        producto: l.nombre,
        tamano,
        opciones: l.customs.map((c) => c.nombre).filter((n) => n !== tamano),
        para,
        cuando: `${p.hora.slice(0, 5)} · ${dia} ${MESES[mes - 1] ?? ''}`,
        numero: i + 1,
        total: p.lineas.length,
        sucursal,
      };
    });
}

export function htmlEtiquetas(etiquetas: DatosEtiqueta[]): string {
  const { ancho, alto } = ETIQUETA_MM;
  const una = (e: DatosEtiqueta) => `
<section class="et">
  <header><span class="marca">the coffee.</span><span class="jp">ザ・コーヒー</span><span class="n">${e.numero}/${e.total}</span></header>
  <h1>${esc(e.producto)}</h1>
  ${e.tamano ? `<p class="tam">${esc(e.tamano)}</p>` : ''}
  ${e.opciones.length ? `<ul>${e.opciones.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>` : '<p class="sin">Sin personalizaciones</p>'}
  <footer>
    <p class="para">${esc(e.para)}</p>
    <p class="cuando">${esc(e.cuando)} · ${esc(e.sucursal)}</p>
  </footer>
</section>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas</title><style>
@page { size: ${ancho}mm ${alto}mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; color: #000; font-family: "Helvetica Neue", Arial, sans-serif; }
.et { width: ${ancho}mm; height: ${alto}mm; padding: 3.5mm 4mm; display: flex; flex-direction: column; gap: 1.6mm;
  page-break-after: always; break-after: page; overflow: hidden; }
.et:last-child { page-break-after: auto; break-after: auto; }
header { display: flex; align-items: baseline; gap: 1.5mm; border-bottom: 0.4mm solid #000; padding-bottom: 1.2mm; }
.marca { font-weight: 900; font-size: 4.2mm; letter-spacing: -0.15mm; }
.jp { font-size: 2.2mm; letter-spacing: 0.3mm; }
.n { margin-left: auto; font-weight: 800; font-size: 3.4mm; border: 0.35mm solid #000; border-radius: 1.2mm; padding: 0 1.2mm; }
h1 { font-size: 5.4mm; line-height: 1.05; font-weight: 900; margin-top: 0.6mm; }
.tam { display: inline-block; align-self: flex-start; background: #000; color: #fff; font-weight: 800; font-size: 3.1mm;
  padding: 0.5mm 1.6mm; border-radius: 1mm; }
ul { list-style: none; display: flex; flex-direction: column; gap: 0.6mm; font-size: 3.1mm; line-height: 1.15; }
li::before { content: "• "; font-weight: 900; }
.sin { font-size: 2.8mm; }
footer { margin-top: auto; border-top: 0.3mm dashed #000; padding-top: 1.2mm; }
.para { font-weight: 900; font-size: 3.6mm; }
.cuando { font-size: 2.5mm; margin-top: 0.4mm; }
</style></head><body>${etiquetas.map(una).join('')}</body></html>`;
}
