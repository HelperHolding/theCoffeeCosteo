import type { PedidoVista } from './contratos';
import { etiquetaOrigen } from './metricas';

/**
 * Etiqueta de pedido para pegar en el vaso o la bolsa (una por producto: el POS manda una línea por unidad). Formato
 * vertical de impresora térmica (ETIQUETA_MM), una etiqueta por página, con el diseño aprobado por Carlos
 * (2026-11-20): marca en Zen Kaku Gothic New, tamaño en óvalo, personalizaciones en lista con casilla y un bloque
 * «Para» grande. Sin precios. El POS no trae el nombre del cliente (comprobado en la API el 2026-11-20): «Para» es
 * «RAPPI» con su orden, o los últimos 4 dígitos del ticket en mostrador y app.
 * El HTML se arma aquí (puro, probado) y la impresión vive en components/sucursales/etiqueta.tsx.
 */
export const ETIQUETA_MM = { ancho: 50, alto: 80 } as const;

/** Fuentes del portal: Zen Kaku Gothic New (marca y títulos) e Inter (texto). */
export const FUENTES_ETIQUETA =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Zen+Kaku+Gothic+New:wght@500;700;900&display=block';

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Personalización que es el vaso o el tamaño («Regular - 440ml», «Large - 600ml»): va destacada aparte. */
const ES_TAMANO = /^(regular|large|grande|chica|tradicional|mediano)\b/i;

export interface DatosEtiqueta {
  producto: string;
  /** Tamaño en dos partes para el óvalo: «LARGE» y «600 ml» (sin ml si el POS no lo trae). */
  tamano: { nombre: string; ml: string | null } | null;
  opciones: string[];
  /** Lo que va en grande en «Para»: «RAPPI» o «#7956». */
  paraGrande: string;
  /** Debajo: «Orden #2490343977», «Mostrador», «App The Coffee». */
  paraDetalle: string;
  cuando: string;
  numero: number;
  total: number;
  sucursal: string;
}

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function partirTamano(t: string): DatosEtiqueta['tamano'] {
  const m = /^([^-–]+?)\s*[-–]\s*(\d+)\s*ml/i.exec(t);
  return m
    ? { nombre: m[1].trim().toUpperCase(), ml: `${m[2]} ml` }
    : { nombre: t.trim().toUpperCase(), ml: null };
}

/** Una etiqueta por línea del pedido (o solo las de `indices`). */
export function datosEtiquetas(p: PedidoVista, sucursal: string, indices?: number[]): DatosEtiqueta[] {
  const cuales = indices ?? p.lineas.map((_, i) => i);
  const [, mes, dia] = p.fecha.split('-').map(Number);
  const rappi = p.origen === 'rappi';
  const paraGrande = rappi ? 'RAPPI' : `#${String(p.id).slice(-4)}`;
  const paraDetalle = rappi ? `Orden #${p.numeroPedidoRappi ?? p.id}` : etiquetaOrigen[p.origen];
  return cuales
    .filter((i) => p.lineas[i])
    .map((i) => {
      const l = p.lineas[i];
      const tamano = l.customs.find((c) => ES_TAMANO.test(c.nombre))?.nombre ?? null;
      return {
        producto: l.nombre,
        tamano: tamano ? partirTamano(tamano) : null,
        opciones: l.customs.map((c) => c.nombre).filter((n) => n !== tamano),
        paraGrande,
        paraDetalle,
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
  <div class="mk">the coffee.</div>
  <div class="jp">ザ・コーヒー</div>
  <div class="dbl"></div>
  <h1>${esc(e.producto)}</h1>
  ${e.tamano ? `<div><span class="tam">${esc(e.tamano.nombre)}${e.tamano.ml ? ` <b>${esc(e.tamano.ml)}</b>` : ''}</span></div>` : ''}
  <div class="sep">PERSONALIZACIÓN</div>
  ${
    e.opciones.length
      ? `<ul>${e.opciones.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>`
      : '<p class="sin">Sin cambios · como viene</p>'
  }
  <div class="para">
    <div class="pl">PARA</div>
    <div class="big">${esc(e.paraGrande)}</div>
    <div class="num">${esc(e.paraDetalle)}</div>
  </div>
  <div class="ft"><span>${esc(e.cuando)} · ${esc(e.sucursal)}</span><span class="n">${e.numero}/${e.total}</span></div>
</section>`;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Etiquetas</title>
<link rel="stylesheet" href="${FUENTES_ETIQUETA}">
<style>
@page { size: ${ancho}mm ${alto}mm; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: #fff; color: #000; font-family: Inter, "Helvetica Neue", Arial, sans-serif;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.et { width: ${ancho}mm; height: ${alto}mm; padding: 3.4mm 3.8mm 3mm; display: flex; flex-direction: column;
  page-break-after: always; break-after: page; overflow: hidden; }
.et:last-child { page-break-after: auto; break-after: auto; }
.mk { font-family: "Zen Kaku Gothic New", sans-serif; font-weight: 900; font-size: 5.6mm; letter-spacing: -0.15mm;
  line-height: 1; text-align: center; }
.jp { font-family: "Zen Kaku Gothic New", sans-serif; font-size: 2.1mm; letter-spacing: 0.9mm; text-align: center;
  margin-top: 0.9mm; }
.dbl { border-top: 0.4mm solid #000; border-bottom: 0.15mm solid #000; height: 0.6mm; margin: 2.2mm 0 2.4mm; }
h1 { font-family: "Zen Kaku Gothic New", sans-serif; font-weight: 700; font-size: 5.1mm; line-height: 1.05;
  letter-spacing: -0.07mm; }
.tam { display: inline-flex; gap: 1.4mm; align-items: baseline; border: 0.3mm solid #000; border-radius: 99mm;
  padding: 0.4mm 2.1mm; margin-top: 1.5mm; font-size: 2.35mm; font-weight: 700; letter-spacing: 0.2mm; }
.tam b { font-weight: 500; letter-spacing: 0; }
.sep { display: flex; align-items: center; gap: 1.4mm; margin: 2.6mm 0 1.5mm; font-size: 1.75mm; font-weight: 700;
  letter-spacing: 0.42mm; }
.sep::before, .sep::after { content: ""; flex: 1; height: 0.12mm; background: #000; }
ul { list-style: none; display: flex; flex-direction: column; gap: 1.4mm; font-size: 2.7mm; line-height: 1.25; }
li { display: flex; gap: 1.6mm; align-items: flex-start; }
li::before { content: ""; width: 1.6mm; height: 1.6mm; border: 0.25mm solid #000; border-radius: 0.45mm;
  margin-top: 0.65mm; flex: none; }
.sin { font-size: 2.6mm; color: #444; }
.para { border: 0.38mm solid #000; border-radius: 1.9mm; padding: 1.4mm 1.9mm 1.6mm; text-align: center;
  margin-top: auto; }
.pl { font-size: 1.75mm; font-weight: 700; letter-spacing: 0.47mm; }
.big { font-family: "Zen Kaku Gothic New", sans-serif; font-weight: 900; font-size: 7mm; letter-spacing: 0.35mm;
  line-height: 1.05; }
.num { font-size: 2.6mm; font-weight: 600; letter-spacing: 0.1mm; }
.ft { display: flex; justify-content: space-between; align-items: center; margin-top: 2.1mm; font-size: 2.2mm; }
.ft span:first-child { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.n { flex: none; margin-left: 1.5mm; font-weight: 700; border: 0.28mm solid #000; border-radius: 99mm; padding: 0.2mm 1.6mm; }
</style></head><body>${etiquetas.map(una).join('')}</body></html>`;
}
