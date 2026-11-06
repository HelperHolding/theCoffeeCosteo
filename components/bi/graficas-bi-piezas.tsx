'use client';
// Piezas comunes de las gráficas del tablero BI (graficas-bi.tsx): tipos, paleta, escalas, interacción,
// leyenda y tabla equivalente.
import { useRef, useState } from 'react';
import { AZUL, COLOR_ORIGEN, SERIE_BASE, TIPOS } from '@/components/sucursales/colores';

export interface Categoria {
  clave: string;
  /** Rótulo corto del eje; vacío para omitirlo. */
  eje: string;
  /** Rótulo completo del tooltip y de la tabla. */
  titulo: string;
}

export interface Serie {
  etiqueta: string;
  color: string;
  valores: (number | null)[];
  formato: (v: number | null) => string;
}

/** Paleta categórica validada de Sucursales (colores.tsx); del séptimo en adelante, gris con etiqueta. */
const PALETA = [
  AZUL.fuerte,
  COLOR_ORIGEN.app,
  COLOR_ORIGEN.rappi,
  COLOR_ORIGEN.mostrador,
  TIPOS.dulzor.color,
  TIPOS.extra.color,
];
export const colorCategoria = (i: number) => PALETA[i] ?? SERIE_BASE;

export const W = 720;
export const LINEA_REJILLA = 'stroke-line';
export const TEXTO_EJE = 'fill-muted-foreground text-[11px]';

/** Tres marcas redondas (0, mitad y tope) que cubren el máximo. */
export function marcas(max: number) {
  const paso = 10 ** Math.floor(Math.log10(Math.max(1, max / 2)));
  const n = Math.ceil(Math.max(1, max) / 2 / paso) * paso;
  return [0, n, n * 2];
}

/** Columna con extremo superior redondeado (4px) y base recta. */
export function columna(cx: number, ancho: number, top: number, bottom: number) {
  if (bottom - top < 0.5) return '';
  const r = Math.min(4, (bottom - top) / 2, ancho / 2);
  const l = cx - ancho / 2;
  const d = l + ancho;
  return `M${l},${bottom} L${l},${top + r} Q${l},${top} ${l + r},${top} L${d - r},${top} Q${d},${top} ${d},${top + r} L${d},${bottom} Z`;
}

type Punto = readonly [number, number];

/** Tramos continuos de una línea: un punto nulo (sin dato) la corta. */
export function tramosDe(puntos: (Punto | null)[]) {
  const tramos: Punto[][] = [];
  let actual: Punto[] = [];
  for (const p of puntos) {
    if (p) {
      actual.push(p);
    } else if (actual.length) {
      tramos.push(actual);
      actual = [];
    }
  }
  if (actual.length) tramos.push(actual);
  return tramos;
}
export const aPuntos = (tramo: Punto[]) => tramo.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

/** Índice bajo el puntero o recorrido con las flechas. */
export function useIndiceActivo(n: number, xDe: (i: number) => number) {
  const [indice, setIndice] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const props = {
    ref,
    tabIndex: 0,
    onPointerMove: (e: React.PointerEvent<SVGSVGElement>) => {
      const r = ref.current!.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W;
      let mejor = 0;
      for (let i = 1; i < n; i++) if (Math.abs(xDe(i) - x) < Math.abs(xDe(mejor) - x)) mejor = i;
      setIndice(mejor);
    },
    onPointerLeave: () => setIndice(null),
    onFocus: () => setIndice(n - 1),
    onBlur: () => setIndice(null),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      setIndice((i) => Math.min(n - 1, Math.max(0, (i ?? n - 1) + (e.key === 'ArrowRight' ? 1 : -1))));
    },
  };
  return { indice, props };
}

export function Leyenda({
  series,
  linea,
}: {
  series: { etiqueta: string; color: string }[];
  linea: (i: number) => boolean;
}) {
  return (
    <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
      {series.map((s, i) => (
        <span key={s.etiqueta} className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={linea(i) ? 'h-[2px] w-5 rounded-full' : 'size-2.5 rounded-sm'}
            style={{ backgroundColor: s.color }}
          />
          {s.etiqueta}
        </span>
      ))}
    </figcaption>
  );
}

export function TablaEquivalente({
  resumen,
  categorias,
  series,
}: {
  resumen: string;
  categorias: Categoria[];
  series: Serie[];
}) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold text-ink-2">Ver como tabla</summary>
      <div className="mt-2 max-h-96 overflow-auto">
        <table className="tabla w-full">
          <caption className="sr-only">{resumen}</caption>
          <thead>
            <tr>
              <th scope="col">&nbsp;</th>
              {series.map((s) => (
                <th key={s.etiqueta} scope="col" className="numero">
                  {s.etiqueta}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {categorias.map((c, i) => (
              <tr key={c.clave}>
                <th scope="row" className="font-medium">
                  {c.titulo}
                </th>
                {series.map((s) => (
                  <td key={s.etiqueta} className="numero">
                    {s.formato(s.valores[i] ?? null)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export interface PropsGrafica {
  /** Descripción para lectores de pantalla y título de la tabla equivalente. */
  resumen: string;
  categorias: Categoria[];
  /** Ancho mínimo en pantallas angostas (clase de Tailwind). */
  anchoMinimo?: string;
}
