import type { PedidoVista } from './contratos';
import { etiquetaOrigen } from './metricas';

/**
 * Etiqueta de pedido para pegar en el vaso o la bolsa (una por producto: el POS manda una línea por unidad). Formato
 * de impresora térmica de etiquetas (ETIQUETA_MM), una etiqueta por página. Sin precios: solo qué es, cómo va y para
 * quién. El HTML se arma aquí (puro, probado) y la impresión vive en components/sucursales/etiqueta.tsx.
 */
/** Etiqueta térmica chica estándar (50 × 30 mm) hasta que se confirme la medida de la impresora de la tienda. */
export const ETIQUETA_MM = { ancho: 50, alto: 30 } as const;

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Personalización que es el vaso o el tamaño («Regular - 440ml», «Large - 600ml»): va destacada aparte. */
const ES_TAMANO = /^(regular|large|grande|chica|tradicional|mediano)\b/i;

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
  // Etiqueta chica: personalizaciones en un renglón corrido (hasta 3 líneas) para que quepa todo en 30 mm de alto.
  const una = (e: DatosEtiqueta) => `
<section class="et">
  <header><span class="marca">the coffee.</span><span class="jp">ザ・コーヒー</span><span class="n">${e.numero}/${e.total}</span></header>
  <h1>${esc(e.producto)}${e.tamano ? ` <span class="tam">${esc(e.tamano)}</span>` : ''}</h1>
  <p class="ops">${e.opciones.length ? e.opciones.map(esc).join(' · ') : 'Sin personalizaciones'}</p>
  <footer><span class="para">${esc(e.para)}</span><span class="cuando">${esc(e.cuando)} · ${esc(e.sucursal)}</span></footer>
</section>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas</title><style>
@page { size: ${ancho}mm ${alto}mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; color: #000; font-family: "Helvetica Neue", Arial, sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.et { width: ${ancho}mm; height: ${alto}mm; padding: 1.6mm 2mm; display: flex; flex-direction: column; gap: 0.7mm;
  page-break-after: always; break-after: page; overflow: hidden; }
.et:last-child { page-break-after: auto; break-after: auto; }
header { display: flex; align-items: baseline; gap: 1mm; border-bottom: 0.3mm solid #000; padding-bottom: 0.5mm; }
.marca { font-weight: 900; font-size: 2.9mm; letter-spacing: -0.1mm; }
.jp { font-size: 1.6mm; }
.n { margin-left: auto; font-weight: 900; font-size: 2.6mm; border: 0.3mm solid #000; border-radius: 0.8mm;
  padding: 0 0.8mm; line-height: 1.2; }
h1 { font-size: 3.5mm; line-height: 1.1; font-weight: 900; display: -webkit-box; -webkit-line-clamp: 2;
  -webkit-box-orient: vertical; overflow: hidden; }
.tam { font-size: 2.4mm; font-weight: 800; border: 0.3mm solid #000; border-radius: 0.8mm; padding: 0 0.7mm;
  white-space: nowrap; vertical-align: 0.3mm; }
.ops { font-size: 2.3mm; line-height: 1.2; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;
  overflow: hidden; }
footer { margin-top: auto; border-top: 0.25mm dashed #000; padding-top: 0.5mm; display: flex; flex-direction: column; }
.para { font-weight: 900; font-size: 2.7mm; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cuando { font-size: 1.9mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style></head><body>${etiquetas.map(una).join('')}</body></html>`;
}
