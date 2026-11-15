'use client';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from 'cn';
import { etiquetaOrigen } from '@/lib/sucursales/metricas';
import type { Origen } from '@/lib/sucursales/normalizar';
import { AZUL, COLOR_ORIGEN, SERIE_BASE } from './colores';
import { Tooltip } from './graficas';
import { dinero, numero, porcentaje } from './formato';
import { ESTADOS_MX, MAPA_MX } from './mapa-mexico-trazos';

/**
 * Gráficas del Tablero de México (skills dataviz y movimiento-web). Colores fijos por entidad: Mostrador violeta,
 * App naranja y Rappi verde (COLOR_ORIGEN), la semana pasada en gris de referencia y la magnitud en la rampa azul.
 * Las gráficas de ejes miden su ancho y dibujan a tamaño real (alto fijo, letra de 11 px): nunca se agrandan con la
 * pantalla. Separación de 2 px entre segmentos, tooltip en hover y en foco, y el texto siempre en tinta. El
 * movimiento está en tablero-mexico.css (clases mx-*).
 */

export const ORIGENES: Origen[] = ['mostrador', 'app', 'rappi'];
const MXN = 'MXN';
const TINTA = '#2b2926';
const REJILLA = '#e3ded4';
const FANTASMA = '#e4dfd5';
/** Como compacto, con dos decimales en millones: los totales semanales se parecen mucho entre sí. */
const compactoFino = (cent: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: MXN,
    notation: 'compact',
    maximumFractionDigits: cent >= 1_000_000_00 ? 2 : 0,
  }).format(cent / 100);
export const compacto = (cent: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: MXN,
    notation: 'compact',
    maximumFractionDigits: cent >= 1_000_000_00 ? 1 : 0,
  }).format(cent / 100);
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
export const hhmm = (seg: number) =>
  `${String(Math.floor(seg / 3600)).padStart(2, '0')}:${String(Math.floor((seg % 3600) / 60)).padStart(2, '0')}`;
const pct = (x: number | null) =>
  x === null ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${Math.abs(x * 100).toFixed(1)} %`;

const reducido = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Cuenta hasta el nuevo valor (700 ms, frena al final). La primera vez cuenta desde cero. */
export function useCifra(valor: number, ms = 700) {
  const [v, setV] = useState(() => (reducido() ? valor : 0));
  const actual = useRef(v);
  useEffect(() => {
    if (reducido()) {
      actual.current = valor;
      setV(valor);
      return;
    }
    const desde = actual.current;
    const inicio = performance.now();
    let raf = 0;
    const paso = (t: number) => {
      const k = Math.min(1, (t - inicio) / ms);
      const x = desde + (valor - desde) * (1 - Math.pow(1 - k, 4));
      actual.current = x;
      setV(x);
      if (k < 1) raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [valor, ms]);
  return v;
}

export function Cifra({ valor, formato }: { valor: number; formato: (v: number) => string }) {
  const v = useCifra(valor);
  // El lector de pantalla oye el valor final, no cada paso.
  return (
    <span className="tabular" aria-label={formato(valor)}>
      <span aria-hidden="true">{formato(v)}</span>
    </span>
  );
}

const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;
/** Ancho real del contenedor (ResizeObserver): las gráficas de ejes dibujan a ese ancho y a alto fijo. */
export function useAncho<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [ancho, setAncho] = useState(0);
  useIso(() => {
    const el = ref.current;
    if (!el) return;
    setAncho(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, ancho] as const;
}

/** Escala «redonda»: tope y marcas (0, paso, 2·paso…) con ~n divisiones. */
export function escala(max: number, n = 4) {
  const bruto = Math.max(1, max) / n;
  const pot = Math.pow(10, Math.floor(Math.log10(bruto)));
  const paso = [1, 2, 2.5, 5, 10].map((m) => m * pot).find((p) => p >= bruto) ?? pot * 10;
  const tope = Math.max(paso, Math.ceil(Math.max(1, max) / paso) * paso);
  return { tope, marcas: Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso) };
}

/** Leyenda de los tres orígenes (siempre visible con 2 series o más). */
export function LeyendaOrigen({
  extra,
  solo,
}: {
  extra?: { color: string; etiqueta: string; linea?: boolean }[];
  solo?: Origen[];
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {(solo ?? ORIGENES).map((o) => (
        <li key={o} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[3px]"
            style={{ backgroundColor: COLOR_ORIGEN[o] }}
          />
          {etiquetaOrigen[o]}
        </li>
      ))}
      {extra?.map((e) => (
        <li key={e.etiqueta} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={e.linea ? 'h-0 w-4 border-t-2 border-dashed' : 'size-2.5 rounded-[3px]'}
            style={e.linea ? { borderColor: e.color } : { backgroundColor: e.color }}
          />
          {e.etiqueta}
        </li>
      ))}
    </ul>
  );
}

const acumular = (s: number[]) => {
  let a = 0;
  return s.map((v) => (a += v));
};
/** Valor acumulado al terminar `t` tramos (0 = medianoche). */
const al = (acum: number[], t: number) => (t <= 0 || !acum.length ? 0 : acum[Math.min(acum.length, t) - 1]);
/** Primera hora del eje: la primera con venta (hoy o la semana pasada), entre las 5 y las 7. */
function primeraHora(series: number[][], porHora: boolean) {
  let i = Infinity;
  for (const s of series) {
    const k = s.findIndex((v) => v > 0);
    if (k >= 0) i = Math.min(i, k);
  }
  const h = i === Infinity ? 7 : porHora ? i : Math.floor(i / 6);
  return Math.max(5, Math.min(7, h));
}

/**
 * Venta acumulada de hoy por tramo de 10 min, apilada por origen, contra la semana pasada (línea punteada, día
 * completo). Hoy llega hasta `hastaTramo` (el corte de referencia); a la derecha, el resto del día va sombreado.
 */
export function CurvaHoy({
  hoy,
  base,
  hastaTramo,
  etiquetaBase,
}: {
  hoy: Record<Origen, number[]>;
  base: number[] | null;
  hastaTramo: number;
  etiquetaBase: string;
}) {
  const id = useId();
  const [ref, W] = useAncho<HTMLDivElement>();
  const [activo, setActivo] = useState<number | null>(null);
  const H = 236;
  const M = { izq: 52, der: 14, arr: 28, aba: 26 };
  const capas = ORIGENES.map((o) => acumular(hoy[o]));
  const baseAc = base ? acumular(base) : null;
  const total = (t: number) => capas.reduce((a, c) => a + al(c, t), 0);
  const desde = primeraHora([...ORIGENES.map((o) => hoy[o]), base ?? []], false);
  const t0 = desde * 6;
  const t1 = 144;
  const corte = Math.max(t0, Math.min(t1, hastaTramo));
  const { tope, marcas } = escala(Math.max(total(corte), baseAc ? al(baseAc, t1) : 0));
  const ancho = Math.max(1, W - M.izq - M.der);
  const x = (t: number) => M.izq + ((t - t0) / (t1 - t0)) * ancho;
  const y = (v: number) => H - M.aba - (v / tope) * (H - M.arr - M.aba);
  const tramos = Array.from({ length: corte - t0 + 1 }, (_, k) => t0 + k);
  const formas = capas.map((_, i) => {
    const debajo = (t: number) => capas.slice(0, i).reduce((a, c) => a + al(c, t), 0);
    const arriba = (t: number) => debajo(t) + al(capas[i], t);
    const sup = tramos.map((t, k) => `${k ? 'L' : 'M'}${x(t).toFixed(1)},${y(arriba(t)).toFixed(1)}`);
    const inf = [...tramos].reverse().map((t) => `L${x(t).toFixed(1)},${y(debajo(t)).toFixed(1)}`);
    return `${sup.join('')}${inf.join('')}Z`;
  });
  const lineaBase = baseAc
    ? Array.from({ length: t1 - t0 + 1 }, (_, k) => t0 + k)
        .map((t, k) => `${k ? 'L' : 'M'}${x(t).toFixed(1)},${y(al(baseAc, t)).toFixed(1)}`)
        .join('')
    : null;
  const horas = Array.from({ length: 25 - desde }, (_, k) => desde + k).filter(
    (h) => h % (W < 460 ? 6 : 3) === 0,
  );
  const fijar = (clientX: number, r: DOMRect) => {
    const t = Math.round(t0 + ((clientX - r.left - M.izq) / ancho) * (t1 - t0));
    setActivo(Math.min(t1, Math.max(t0 + 1, t)));
  };
  const a = activo;
  const derecha = x(corte) > W - 110;
  return (
    <div ref={ref} className="relative" style={{ height: H }}>
      {W > 0 && (
        <svg
          width={W}
          height={H}
          role="img"
          aria-label={`Venta acumulada de hoy hasta las ${hhmm(corte * 600)}: ${dinero(total(corte), MXN, false)}${baseAc ? `; ${etiquetaBase} a la misma hora: ${dinero(al(baseAc, corte), MXN, false)}; su día completo: ${dinero(al(baseAc, t1), MXN, false)}` : ''}.`}
          tabIndex={0}
          className="block outline-none focus-visible:ring-2 focus-visible:ring-ink"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            e.preventDefault();
            setActivo((v) =>
              Math.min(t1, Math.max(t0 + 6, (v ?? corte) + (e.key === 'ArrowRight' ? 6 : -6))),
            );
          }}
          onBlur={() => setActivo(null)}
          onPointerMove={(e) => fijar(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setActivo(null)}
        >
          <defs>
            {ORIGENES.map((o) => (
              <linearGradient key={o} id={`${id}-${o}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor={COLOR_ORIGEN[o]} stopOpacity="0.9" />
                <stop offset="1" stopColor={COLOR_ORIGEN[o]} stopOpacity="0.62" />
              </linearGradient>
            ))}
          </defs>
          {/* Resto del día: aún no pasa. */}
          <rect
            x={x(corte)}
            y={M.arr}
            width={Math.max(0, x(t1) - x(corte))}
            height={H - M.arr - M.aba}
            fill="#f4f1ea"
            opacity={0.7}
          />
          {marcas.map((v) => (
            <g key={v}>
              <line
                x1={M.izq}
                x2={W - M.der}
                y1={y(v)}
                y2={y(v)}
                stroke={REJILLA}
                strokeDasharray={v ? '2 4' : undefined}
              />
              <text
                x={M.izq - 8}
                y={y(v) + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[11px] tabular"
              >
                {compacto(v)}
              </text>
            </g>
          ))}
          {horas.map((h) => (
            <text
              key={h}
              x={x(h * 6)}
              y={H - 8}
              textAnchor={h === 24 ? 'end' : 'middle'}
              className="fill-muted-foreground text-[11px] tabular"
            >
              {hh(h)}
            </text>
          ))}
          {formas.map((d, i) => (
            <path
              key={ORIGENES[i]}
              className="mx-area"
              d={d}
              fill={`url(#${id}-${ORIGENES[i]})`}
              stroke="#ffffff"
              strokeWidth={1.25}
              strokeLinejoin="round"
            />
          ))}
          {lineaBase && (
            <path
              className="mx-area"
              d={lineaBase}
              fill="none"
              stroke={SERIE_BASE}
              strokeWidth={2}
              strokeDasharray="5 5"
              strokeLinejoin="round"
            />
          )}
          <line
            x1={x(corte)}
            x2={x(corte)}
            y1={M.arr - 4}
            y2={H - M.aba}
            stroke={TINTA}
            strokeOpacity={0.55}
          />
          <text
            x={x(corte) + (derecha ? -6 : 6)}
            y={M.arr - 10}
            textAnchor={derecha ? 'end' : 'start'}
            className="fill-ink text-[11px] font-semibold tabular"
          >
            Ahora · {hhmm(corte * 600)}
          </text>
          {baseAc && (
            <circle
              cx={x(corte)}
              cy={y(al(baseAc, corte))}
              r={3.5}
              fill="#ffffff"
              stroke={SERIE_BASE}
              strokeWidth={2}
            />
          )}
          <circle cx={x(corte)} cy={y(total(corte))} r={5} fill="#ffffff" stroke={TINTA} strokeWidth={2.5} />
          {a !== null && (
            <line x1={x(a)} x2={x(a)} y1={M.arr} y2={H - M.aba} stroke={TINTA} strokeOpacity={0.3} />
          )}
        </svg>
      )}
      {a !== null && W > 0 && (
        <Tooltip
          x={x(a)}
          ancho={W}
          titulo={`Hasta las ${hhmm(a * 600)}`}
          filas={[
            ...(a <= corte
              ? [
                  ...ORIGENES.map((o, i) => ({
                    color: COLOR_ORIGEN[o],
                    etiqueta: etiquetaOrigen[o],
                    valor: dinero(al(capas[i], a), MXN, false),
                  })),
                  { color: TINTA, etiqueta: 'hoy', valor: dinero(total(a), MXN, false) },
                ]
              : []),
            ...(baseAc
              ? [
                  {
                    color: SERIE_BASE,
                    etiqueta: etiquetaBase,
                    valor: dinero(al(baseAc, a), MXN, false),
                    linea: true,
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}

/**
 * Pedidos por hora local: columnas apiladas por origen y, detrás, la semana pasada en gris. La hora en curso va
 * rayada y su gris llega solo hasta el mismo corte; las horas que faltan muestran la semana pasada punteada.
 */
export function ColumnasHora({
  hoy,
  base,
  baseHasta,
  horaEnCurso,
  ultimaHora,
  etiquetaBase,
}: {
  hoy: Record<Origen, number[]>;
  base: number[] | null;
  baseHasta: number[] | null;
  horaEnCurso: number | null;
  ultimaHora: number;
  etiquetaBase: string;
}) {
  const id = useId();
  const [ref, W] = useAncho<HTMLDivElement>();
  const [activa, setActiva] = useState<number | null>(null);
  const H = 248;
  const M = { izq: 40, der: 6, arr: 22, aba: 24 };
  const desde = primeraHora([...ORIGENES.map((o) => hoy[o]), base ?? []], true);
  const horas = Array.from({ length: 24 - desde }, (_, k) => desde + k);
  const total = (h: number) => ORIGENES.reduce((a, o) => a + (hoy[o][h] ?? 0), 0);
  const gris = (h: number) => (h <= ultimaHora ? (baseHasta?.[h] ?? 0) : (base?.[h] ?? 0));
  const { tope, marcas } = escala(Math.max(...horas.map(total), ...horas.map((h) => base?.[h] ?? 0)));
  const banda = Math.max(1, W - M.izq - M.der) / horas.length;
  const x = (h: number) => M.izq + (h - desde) * banda;
  const y = (v: number) => H - M.aba - (v / tope) * (H - M.arr - M.aba);
  const pico = horas
    .filter((h) => h <= ultimaHora && h !== horaEnCurso)
    .reduce<number | null>((m, h) => (m === null || total(h) > total(m) ? h : m), null);
  return (
    <div ref={ref} className="relative" style={{ height: H }}>
      {W > 0 && (
        <svg
          width={W}
          height={H}
          role="group"
          aria-label={`Pedidos por hora de hoy frente a ${etiquetaBase}.${pico !== null ? ` Hora pico: ${hh(pico)} con ${numero(total(pico))} pedidos.` : ''}`}
          className="block"
        >
          <defs>
            <pattern
              id={`${id}-raya`}
              width="5"
              height="5"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="5" stroke="#ffffff" strokeWidth="2" strokeOpacity="0.75" />
            </pattern>
          </defs>
          {marcas.map((v) => (
            <g key={v}>
              <line
                x1={M.izq}
                x2={W - M.der}
                y1={y(v)}
                y2={y(v)}
                stroke={REJILLA}
                strokeDasharray={v ? '2 4' : undefined}
              />
              <text
                x={M.izq - 6}
                y={y(v) + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[11px] tabular"
              >
                {numero(v)}
              </text>
            </g>
          ))}
          {horas.map((h, i) => {
            const cx = x(h) + banda / 2;
            const wg = Math.max(4, banda * 0.78);
            const wc = Math.max(3, banda * 0.5);
            const g = gris(h);
            const futura = h > ultimaHora;
            let acumulado = 0;
            return (
              <g
                key={h}
                tabIndex={0}
                role="img"
                aria-label={`${hh(h)} a ${hh(h + 1)}: ${futura ? 'aún no pasa' : `${numero(total(h))} pedidos hoy`}${base ? `, ${numero(g)} ${etiquetaBase}${h === horaEnCurso ? ' al mismo corte' : ''}` : ''}`}
                onPointerEnter={() => setActiva(h)}
                onPointerLeave={() => setActiva(null)}
                onFocus={() => setActiva(h)}
                onBlur={() => setActiva(null)}
                className="outline-none"
              >
                <rect
                  x={x(h)}
                  y={M.arr}
                  width={banda}
                  height={H - M.arr - M.aba}
                  fill={activa === h ? '#efece5' : 'transparent'}
                  rx={6}
                />
                {base && g > 0 && (
                  <rect
                    className="mx-columna"
                    style={{ '--i': i } as React.CSSProperties}
                    x={cx - wg / 2}
                    y={y(g)}
                    width={wg}
                    height={H - M.aba - y(g)}
                    rx={3}
                    fill={futura ? 'none' : FANTASMA}
                    stroke={futura ? '#cfc8ba' : 'none'}
                    strokeDasharray={futura ? '3 3' : undefined}
                  />
                )}
                {!futura &&
                  ORIGENES.map((o) => {
                    const v = hoy[o][h] ?? 0;
                    if (!v) return null;
                    const y0 = y(acumulado);
                    const primero = acumulado === 0;
                    acumulado += v;
                    const y1 = y(acumulado);
                    return (
                      <rect
                        key={o}
                        className="mx-columna"
                        style={{ '--i': i } as React.CSSProperties}
                        x={cx - wc / 2}
                        y={y1}
                        width={wc}
                        // 2 px de separación entre segmentos apilados.
                        height={Math.max(0, y0 - y1 - (primero ? 0 : 2))}
                        fill={COLOR_ORIGEN[o]}
                      />
                    );
                  })}
                {h === horaEnCurso && total(h) > 0 && (
                  <rect
                    x={cx - wc / 2}
                    y={y(total(h))}
                    width={wc}
                    height={H - M.aba - y(total(h))}
                    fill={`url(#${id}-raya)`}
                  />
                )}
                {h === horaEnCurso && (
                  <text
                    x={cx}
                    y={y(Math.max(total(h), g)) - 6}
                    textAnchor="middle"
                    className="fill-ink-2 text-[10px] font-semibold"
                  >
                    en curso
                  </text>
                )}
                {h === pico && total(h) > 0 && (
                  <text
                    x={cx}
                    y={y(Math.max(total(h), g)) - 6}
                    textAnchor="middle"
                    className="fill-ink text-[11px] font-bold tabular"
                  >
                    {numero(total(h))}
                  </text>
                )}
                {(h % 3 === 0 || banda >= 34) && (
                  <text
                    x={cx}
                    y={H - 8}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[11px] tabular"
                  >
                    {banda >= 34 ? hh(h) : h}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {activa !== null && W > 0 && (
        <Tooltip
          x={x(activa) + banda / 2}
          ancho={W}
          titulo={`${hh(activa)} a ${hh(activa + 1)}${activa === horaEnCurso ? ' (en curso)' : ''}`}
          filas={[
            ...(activa <= ultimaHora
              ? [
                  ...ORIGENES.map((o) => ({
                    color: COLOR_ORIGEN[o],
                    etiqueta: etiquetaOrigen[o],
                    valor: numero(hoy[o][activa] ?? 0),
                  })),
                  { color: TINTA, etiqueta: 'pedidos hoy', valor: numero(total(activa)) },
                ]
              : []),
            ...(base
              ? [
                  {
                    color: '#cfc8ba',
                    etiqueta: activa === horaEnCurso ? `${etiquetaBase}, al mismo corte` : etiquetaBase,
                    valor: numero(gris(activa)),
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}

/** Cambio corto en una celda: verde sube, rojo baja; dentro del umbral, gris; sin base, «—» gris. */
export function Cambio({ valor, umbral = 0 }: { valor: number | null; umbral?: number }) {
  if (valor === null) return <span className="text-xs text-muted-foreground">—</span>;
  const neutro = Math.abs(valor) < umbral;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 whitespace-nowrap rounded-full px-1.5 py-0.5 text-xs font-semibold tabular',
        neutro ? 'bg-surface-2 text-ink-2' : valor >= 0 ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad',
      )}
    >
      <span aria-hidden="true">{neutro ? '±' : valor >= 0 ? '▲' : '▼'}</span>
      <span className="sr-only">{neutro ? 'casi igual' : valor >= 0 ? 'sube' : 'baja'}</span>
      {Math.abs(valor * 100).toFixed(1)} %
    </span>
  );
}

export interface FilaMezcla {
  origen: Origen;
  venta: number;
  pedidos: number;
  /** Venta contra la semana pasada a la misma hora (null sin base). */
  delta: number | null;
}

/** De dónde viene la venta: barra 100 % por origen con su parte, y la tabla de cada origen. */
export function MezclaOrigen({ filas }: { filas: FilaMezcla[] }) {
  const total = filas.reduce((a, f) => a + f.venta, 0);
  const visibles = filas.filter((f) => f.venta > 0);
  return (
    <div className="space-y-5">
      <div>
        <div
          className="flex h-12 gap-[2px] overflow-hidden rounded-xl bg-surface-2"
          role="img"
          aria-label={filas
            .map((f) => `${etiquetaOrigen[f.origen]} ${porcentaje(total ? f.venta / total : null, 0)}`)
            .join(', ')}
        >
          {visibles.map((f, i) => (
            <span
              key={f.origen}
              className="mx-barra h-full"
              style={
                {
                  flexGrow: f.venta,
                  flexBasis: 0,
                  backgroundColor: COLOR_ORIGEN[f.origen],
                  '--i': i,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
        {/* La parte de cada origen, con su punto de color (no depende del ancho de cada segmento). */}
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2" aria-hidden="true">
          {filas.map((f) => (
            <li key={f.origen} className="flex items-baseline gap-2">
              <span
                className="size-2.5 translate-y-[-2px] rounded-[3px]"
                style={{ backgroundColor: COLOR_ORIGEN[f.origen] }}
              />
              <span className="font-display text-2xl font-black leading-none tabular text-ink">
                {porcentaje(total ? f.venta / total : null, 0)}
              </span>
              <span className="text-xs text-ink-2">{etiquetaOrigen[f.origen]}</span>
            </li>
          ))}
        </ul>
      </div>
      <table className="w-full text-sm">
        <caption className="sr-only">Venta de hoy por origen</caption>
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="pb-2 text-left font-medium">Origen</th>
            <th className="pb-2 text-right font-medium">Venta</th>
            <th className="pb-2 text-right font-medium">Pedidos</th>
            <th className="hidden pb-2 text-right font-medium sm:table-cell">Ticket</th>
            <th className="pb-2 text-right font-medium">vs sem. pasada</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {filas.map((f) => (
            <tr key={f.origen}>
              <td className="py-2.5">
                <span className="flex items-center gap-2 font-medium">
                  <span
                    aria-hidden="true"
                    className="size-2.5 rounded-[3px]"
                    style={{ backgroundColor: COLOR_ORIGEN[f.origen] }}
                  />
                  {etiquetaOrigen[f.origen]}
                </span>
              </td>
              <td className="py-2.5 text-right font-semibold tabular">{dinero(f.venta, MXN, false)}</td>
              <td className="py-2.5 text-right tabular">{numero(f.pedidos)}</td>
              <td className="hidden py-2.5 text-right tabular sm:table-cell">
                {f.pedidos ? dinero(Math.round(f.venta / f.pedidos), MXN, false) : '—'}
              </td>
              <td className="py-2.5 text-right">
                <Cambio valor={f.delta} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface FilaOrigen {
  clave: string;
  nombre: string;
  detalle?: string;
  href?: string;
  por: Partial<Record<Origen, number>>;
  /** Texto a la derecha (importe ya formateado o con delta). */
  valor: React.ReactNode;
  nota?: React.ReactNode;
}

/** Barras horizontales apiladas por origen, todas en la misma escala (la más grande = 100 %). */
export function BarrasOrigen({ filas }: { filas: FilaOrigen[] }) {
  const total = (f: FilaOrigen) => ORIGENES.reduce((a, o) => a + (f.por[o] ?? 0), 0);
  const max = Math.max(1, ...filas.map(total));
  return (
    <ol className="space-y-3.5">
      {filas.map((f, i) => {
        const nombre = f.href ? (
          <Link href={f.href} className="truncate font-medium hover:underline">
            {f.nombre}
          </Link>
        ) : (
          <span className="truncate font-medium">{f.nombre}</span>
        );
        return (
          <li
            key={f.clave}
            className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 text-sm"
          >
            <span
              className={cn(
                'row-span-2 self-start font-display font-black leading-none tabular',
                i < 3 ? 'text-xl text-ink' : 'text-base text-muted-foreground',
              )}
            >
              {i + 1}
            </span>
            <span className="flex min-w-0 items-baseline gap-2">
              {nombre}
              {f.detalle && <span className="shrink-0 text-xs text-muted-foreground">{f.detalle}</span>}
            </span>
            <span className="text-right tabular">{f.valor}</span>
            <span className="col-span-2 flex items-center gap-3">
              <span className="block h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2/80">
                <span
                  className="mx-barra flex h-full gap-[2px] overflow-hidden rounded-full"
                  style={{ width: `${(total(f) / max) * 100}%`, '--i': i } as React.CSSProperties}
                >
                  {ORIGENES.map((o) =>
                    (f.por[o] ?? 0) > 0 ? (
                      <span
                        key={o}
                        title={`${etiquetaOrigen[o]}: ${dinero(f.por[o]!, MXN, false)}`}
                        style={{ flexGrow: f.por[o], backgroundColor: COLOR_ORIGEN[o] }}
                      />
                    ) : null,
                  )}
                </span>
              </span>
              {f.nota && (
                <span className="w-20 shrink-0 text-right text-xs text-muted-foreground tabular">
                  {f.nota}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export interface SemanaColumna {
  clave: string;
  etiqueta: string;
  por: Partial<Record<Origen, number>>;
  parcial: boolean;
  /** Contra la semana anterior (null en la primera o si alguna de las dos es parcial). */
  delta: number | null;
}

/**
 * Venta por semana: columnas apiladas por origen con el total arriba y el cambio contra la anterior abajo. Una
 * semana sin todos sus días va rayada. `rappiDesde`: la semana en que empieza Rappi del portal (antes no existe).
 */
export function SemanasApiladas({
  semanas,
  rappiDesde,
  rappiTexto,
}: {
  semanas: SemanaColumna[];
  rappiDesde?: string | null;
  rappiTexto?: string;
}) {
  const id = useId();
  const [ref, W] = useAncho<HTMLDivElement>();
  const [activa, setActiva] = useState<number | null>(null);
  const H = 272;
  const M = { izq: 50, der: 6, arr: 26, aba: 44 };
  const total = (s: SemanaColumna) => ORIGENES.reduce((a, o) => a + (s.por[o] ?? 0), 0);
  const { tope, marcas } = escala(Math.max(...semanas.map(total)));
  const banda = Math.max(1, W - M.izq - M.der) / Math.max(1, semanas.length);
  const x = (i: number) => M.izq + i * banda;
  const y = (v: number) => H - M.aba - (v / tope) * (H - M.arr - M.aba);
  const cada = banda < 56 ? 2 : 1;
  const visible = (i: number) => (semanas.length - 1 - i) % cada === 0;
  const iRappi = rappiDesde ? semanas.findIndex((s) => s.clave === rappiDesde) : -1;
  return (
    <div ref={ref} className="relative" style={{ height: H }}>
      {W > 0 && (
        <svg width={W} height={H} role="group" aria-label="Venta por semana por origen" className="block">
          <defs>
            <pattern
              id={`${id}-raya`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill="#efece5" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="#cfc8ba" strokeWidth="2" />
            </pattern>
          </defs>
          {marcas.map((v) => (
            <g key={v}>
              <line
                x1={M.izq}
                x2={W - M.der}
                y1={y(v)}
                y2={y(v)}
                stroke={REJILLA}
                strokeDasharray={v ? '2 4' : undefined}
              />
              <text
                x={M.izq - 6}
                y={y(v) + 4}
                textAnchor="end"
                className="fill-muted-foreground text-[11px] tabular"
              >
                {compacto(v)}
              </text>
            </g>
          ))}
          {iRappi > 0 && (
            <g>
              <line
                x1={x(iRappi)}
                x2={x(iRappi)}
                y1={M.arr - 8}
                y2={H - M.aba}
                stroke={COLOR_ORIGEN.rappi}
                strokeWidth={1.5}
                strokeDasharray="3 3"
              />
              <text x={x(iRappi) + 5} y={M.arr - 12} className="fill-ink-2 text-[10px] font-semibold">
                {rappiTexto ?? 'Rappi desde aquí'}
              </text>
            </g>
          )}
          {semanas.map((s, i) => {
            const cx = x(i) + banda / 2;
            const w = Math.min(56, Math.max(6, banda * 0.62));
            const t = total(s);
            let acumulado = 0;
            return (
              <g
                key={s.clave}
                tabIndex={0}
                role="img"
                aria-label={`${s.etiqueta}: ${dinero(t, MXN, false)}${s.parcial ? ' (semana con días sin guardar)' : ''}${s.delta === null ? '' : `, ${pct(s.delta)} contra la anterior`}`}
                onPointerEnter={() => setActiva(i)}
                onPointerLeave={() => setActiva(null)}
                onFocus={() => setActiva(i)}
                onBlur={() => setActiva(null)}
                className="outline-none"
              >
                <rect
                  x={x(i)}
                  y={M.arr}
                  width={banda}
                  height={H - M.arr - M.aba}
                  fill={activa === i ? '#efece5' : 'transparent'}
                  rx={6}
                />
                {s.parcial ? (
                  <rect
                    className="mx-columna"
                    style={{ '--i': i } as React.CSSProperties}
                    x={cx - w / 2}
                    y={y(t)}
                    width={w}
                    height={H - M.aba - y(t)}
                    rx={3}
                    fill={`url(#${id}-raya)`}
                  />
                ) : (
                  ORIGENES.map((o) => {
                    const v = s.por[o] ?? 0;
                    if (!v) return null;
                    const y0 = y(acumulado);
                    const primero = acumulado === 0;
                    acumulado += v;
                    const y1 = y(acumulado);
                    return (
                      <rect
                        key={o}
                        className="mx-columna"
                        style={{ '--i': i } as React.CSSProperties}
                        x={cx - w / 2}
                        y={y1}
                        width={w}
                        height={Math.max(0, y0 - y1 - (primero ? 0 : 2))}
                        fill={COLOR_ORIGEN[o]}
                      />
                    );
                  })
                )}
                {visible(i) && (
                  <>
                    <text
                      x={cx}
                      y={y(t) - 6}
                      textAnchor="middle"
                      className="fill-ink text-[11px] font-semibold tabular"
                    >
                      {compactoFino(t)}
                    </text>
                    <text
                      x={cx}
                      y={H - M.aba + 16}
                      textAnchor="middle"
                      className="fill-muted-foreground text-[11px]"
                    >
                      {s.etiqueta}
                    </text>
                    {s.delta !== null && (
                      <text
                        x={cx}
                        y={H - M.aba + 32}
                        textAnchor="middle"
                        className="text-[11px] font-semibold tabular"
                      >
                        <tspan className={s.delta >= 0 ? 'fill-ok' : 'fill-bad'}>
                          {s.delta >= 0 ? '▲' : '▼'}
                        </tspan>
                        <tspan className="fill-ink-2"> {Math.abs(s.delta * 100).toFixed(1)} %</tspan>
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {activa !== null && W > 0 && (
        <Tooltip
          x={x(activa) + banda / 2}
          ancho={W}
          titulo={`${semanas[activa].etiqueta}${semanas[activa].parcial ? ' (parcial)' : ''}`}
          filas={[
            ...ORIGENES.map((o) => ({
              color: COLOR_ORIGEN[o],
              etiqueta: etiquetaOrigen[o],
              valor: dinero(semanas[activa].por[o] ?? 0, MXN, false),
            })),
            { color: TINTA, etiqueta: 'total', valor: dinero(total(semanas[activa]), MXN, false) },
            ...(semanas[activa].delta === null
              ? []
              : [{ color: 'transparent', etiqueta: 'vs la anterior', valor: pct(semanas[activa].delta) }]),
          ]}
        />
      )}
    </div>
  );
}

// ——— Calendario de venta por día ———

/** Rampa secuencial azul de 5 pasos (magnitud), de claro a profundo. */
export const RAMPA = ['#e6f0fc', AZUL.claro, AZUL.medio, AZUL.fuerte, AZUL.profundo];
const TINTA_RAMPA = ['#184f95', '#184f95', '#0f2f5c', '#ffffff', '#ffffff'];
const DIAS_SEMANA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Cortes por cuantil (rango) de los valores > 0: cada paso de la rampa tiene la misma cantidad de casos. */
export function cuantiles(valores: number[], pasos: number) {
  const v = valores.filter((x) => x > 0).sort((a, b) => a - b);
  if (!v.length) return [] as number[];
  return Array.from(
    { length: pasos - 1 },
    (_, i) => v[Math.min(v.length - 1, Math.floor(((i + 1) * v.length) / pasos))],
  );
}
const pasoDe = (cortes: number[], x: number) => {
  let i = 0;
  while (i < cortes.length && x >= cortes[i]) i++;
  return i;
};

/** Venta de cada día del periodo (filas de lunes a domingo, una columna por semana) y el promedio por día. */
export function CalendarioVenta({
  dias,
  desde,
  semanas,
}: {
  dias: { fecha: string; venta: number; pedidos: number }[];
  /** Lunes de la primera semana. */
  desde: string;
  semanas: number;
}) {
  const [activo, setActivo] = useState<string | null>(null);
  const porFecha = new Map(dias.map((d) => [d.fecha, d]));
  const cortes = cuantiles(
    dias.map((d) => d.venta),
    RAMPA.length,
  );
  const fecha = (s: number, d: number) => {
    const t = new Date(`${desde}T12:00:00Z`);
    t.setUTCDate(t.getUTCDate() + s * 7 + d);
    return t.toISOString().slice(0, 10);
  };
  const promedio = DIAS_SEMANA.map((_, d) => {
    const xs = Array.from({ length: semanas }, (_, s) => porFecha.get(fecha(s, d))?.venta ?? 0).filter(
      (x) => x > 0,
    );
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  });
  const maxProm = Math.max(1, ...promedio);
  const mejor = promedio.indexOf(Math.max(...promedio));
  const info = activo ? porFecha.get(activo) : undefined;
  const fmt = (f: string) =>
    new Intl.DateTimeFormat('es-MX', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(`${f}T12:00:00Z`));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[2rem_minmax(0,1fr)_6rem] items-center gap-x-3 gap-y-[3px]">
        {DIAS_SEMANA.map((nombre, d) => (
          <div key={nombre} className="contents">
            <span className="text-[11px] text-muted-foreground">{nombre}</span>
            <div
              className="grid gap-[3px]"
              style={{ gridTemplateColumns: `repeat(${semanas}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: semanas }, (_, s) => {
                const f = fecha(s, d);
                const x = porFecha.get(f);
                const k = x && x.venta > 0 ? pasoDe(cortes, x.venta) : -1;
                return (
                  <button
                    key={f}
                    type="button"
                    onPointerEnter={() => setActivo(f)}
                    onPointerLeave={() => setActivo(null)}
                    onFocus={() => setActivo(f)}
                    onBlur={() => setActivo(null)}
                    aria-label={
                      x
                        ? `${fmt(f)}: ${dinero(x.venta, MXN, false)}, ${numero(x.pedidos)} pedidos`
                        : `${fmt(f)}: sin datos`
                    }
                    className={cn(
                      'mx-celda h-5 rounded-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ink sm:h-6',
                      activo === f && 'ring-2 ring-ink',
                    )}
                    style={
                      {
                        backgroundColor: k >= 0 ? RAMPA[k] : '#efece5',
                        '--d': s + d,
                      } as React.CSSProperties
                    }
                  />
                );
              })}
            </div>
            <span className="flex items-center gap-1.5">
              <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="mx-barra block h-full rounded-full"
                  style={{
                    width: `${(promedio[d] / maxProm) * 100}%`,
                    backgroundColor: d === mejor ? AZUL.profundo : AZUL.medio,
                  }}
                />
              </span>
              <span
                className={cn(
                  'w-10 text-right text-[11px] tabular',
                  d === mejor ? 'font-bold text-ink' : 'text-ink-2',
                )}
              >
                {promedio[d] ? compacto(promedio[d]) : '—'}
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[11px] text-ink-2">
        <span className="flex items-center gap-1.5">
          menos
          {RAMPA.map((c) => (
            <span
              key={c}
              aria-hidden="true"
              className="h-2.5 w-4 rounded-[3px]"
              style={{ backgroundColor: c }}
            />
          ))}
          más venta
        </span>
        <span className="min-h-4 tabular text-ink" role="status">
          {info
            ? `${fmt(info.fecha)} · ${dinero(info.venta, MXN, false)} · ${numero(info.pedidos)} pedidos`
            : 'A la derecha, el promedio de cada día'}
        </span>
      </div>
    </div>
  );
}

// ——— Mapa de México por estado (trazos reales) ———

export interface EstadoMapa {
  clave: string;
  sucursales: number;
  venta: number;
  delta: number | null;
  nombres: string[];
}

/** Cambio contra la semana pasada en 5 pasos: rojo y verde (estado), gris al centro. */
export const DIVERGENTE = [
  { hasta: -0.1, fondo: '#b3362b', tinta: '#ffffff', texto: 'baja más de 10 %' },
  { hasta: -0.03, fondo: '#e9a39b', tinta: '#2b2926', texto: 'baja 3–10 %' },
  { hasta: 0.03, fondo: '#dcd7cd', tinta: '#2b2926', texto: '±3 %' },
  { hasta: 0.1, fondo: '#8cc7a2', tinta: '#2b2926', texto: 'sube 3–10 %' },
  { hasta: Infinity, fondo: '#2f7a4f', tinta: '#ffffff', texto: 'sube más de 10 %' },
];
const SIN_SUCURSALES = { fondo: '#e9e4da', tinta: '#6f6a61' };
const SIN_BASE = { fondo: '#f3efe8', tinta: '#6f6a61' };
const SECUENCIAL = RAMPA.slice(1).map((fondo, i) => ({ fondo, tinta: TINTA_RAMPA[i + 1] }));

export const nombreEstado = (clave: string) => ESTADOS_MX.find((e) => e.clave === clave)?.nombre ?? clave;

/** Color de cada estado y su leyenda. Venta: 4 pasos por cuantil (rango) entre los estados con venta. */
export function pintura(estados: EstadoMapa[], modo: 'venta' | 'cambio') {
  const cortes = cuantiles(
    estados.map((e) => e.venta),
    SECUENCIAL.length,
  );
  const color = (e: EstadoMapa | undefined) => {
    if (!e || !e.sucursales) return SIN_SUCURSALES;
    if (modo === 'cambio') return e.delta === null ? SIN_BASE : DIVERGENTE.find((d) => e.delta! < d.hasta)!;
    return e.venta > 0 ? SECUENCIAL[pasoDe(cortes, e.venta)] : SIN_BASE;
  };
  const leyenda =
    modo === 'cambio'
      ? DIVERGENTE.map((d) => ({ fondo: d.fondo, texto: d.texto }))
      : cortes.length < SECUENCIAL.length - 1
        ? [{ fondo: SECUENCIAL[SECUENCIAL.length - 1].fondo, texto: 'con venta hoy' }]
        : SECUENCIAL.map((s, i) => ({
            fondo: s.fondo,
            texto:
              i === 0
                ? `menos de ${compacto(cortes[0])}`
                : i === SECUENCIAL.length - 1
                  ? `${compacto(cortes[i - 1])} o más`
                  : `${compacto(cortes[i - 1])} a ${compacto(cortes[i])}`,
          }));
  return { color, leyenda };
}

/** Zona ampliada (lupa): el Valle de México, donde los estados son muy chicos para leerse en el mapa. */
const LUPA = ['CDMX', 'MEX', 'MOR', 'TLAX'];
const VB = { w: MAPA_MX.ancho, h: MAPA_MX.alto };
const onda = (x: number) => Math.round((x / VB.w) * 14);

export function MapaMexico({ estados, modo }: { estados: EstadoMapa[]; modo: 'venta' | 'cambio' }) {
  const id = useId();
  const [activo, setActivo] = useState<string | null>(null);
  const { color, leyenda } = pintura(estados, modo);
  const de = (c: string) => estados.find((e) => e.clave === c);
  const valor = (e: EstadoMapa) =>
    modo === 'venta'
      ? compacto(e.venta)
      : e.delta === null
        ? '—'
        : `${e.delta > 0 ? '+' : ''}${Math.round(e.delta * 100)} %`;
  // Caja de la lupa en el mapa y su marco ampliado (esquina inferior izquierda, sobre el Pacífico).
  const cajas = ESTADOS_MX.filter((e) => LUPA.includes(e.clave)).map((e) => e.caja);
  const z = {
    x0: Math.min(...cajas.map((c) => c[0])) - 3,
    y0: Math.min(...cajas.map((c) => c[1])) - 3,
    x1: Math.max(...cajas.map((c) => c[2])) + 3,
    y1: Math.max(...cajas.map((c) => c[3])) + 3,
  };
  const k = 214 / (z.x1 - z.x0);
  const marco = { x: 14, w: 214, h: (z.y1 - z.y0) * k, y: 0 };
  marco.y = VB.h - marco.h - 14;
  const enLupa = (px: number, py: number) => [marco.x + (px - z.x0) * k, marco.y + (py - z.y0) * k] as const;
  const info = activo ? de(activo) : undefined;
  const eventos = (clave: string, con: boolean) =>
    con
      ? {
          tabIndex: 0,
          onPointerEnter: () => setActivo(clave),
          onPointerLeave: () => setActivo(null),
          onFocus: () => setActivo(clave),
          onBlur: () => setActivo(null),
        }
      : {};
  const etiquetaDe = (clave: string) => {
    const e = de(clave);
    if (!e?.sucursales) return `${nombreEstado(clave)}: sin sucursales en el tablero`;
    return `${nombreEstado(clave)}: ${e.sucursales} ${e.sucursales === 1 ? 'sucursal' : 'sucursales'}, ${dinero(e.venta, MXN, false)} hoy${e.delta === null ? '' : `, ${porcentaje(e.delta, 1)} contra la semana pasada`}`;
  };
  const trazoDe = (clave: string) => ESTADOS_MX.find((s) => s.clave === clave)!.d;
  return (
    <div className="space-y-4">
      <div className="relative">
        <svg
          viewBox={`0 0 ${VB.w} ${VB.h}`}
          className="block h-auto w-full"
          role="group"
          aria-label="Mapa de México con la venta de hoy por estado"
        >
          <defs>
            <clipPath id={`${id}-lupa`}>
              <rect x={marco.x} y={marco.y} width={marco.w} height={marco.h} rx={10} />
            </clipPath>
          </defs>
          {ESTADOS_MX.map((s) => {
            const e = de(s.clave);
            const con = !!e?.sucursales;
            return (
              <path
                key={s.clave}
                d={s.d}
                className={cn('mx-estado outline-none', con && 'cursor-pointer')}
                style={{ fill: color(e).fondo, '--d': onda(s.x) } as React.CSSProperties}
                stroke="#ffffff"
                strokeWidth={0.9}
                strokeLinejoin="round"
                role={con ? 'img' : undefined}
                aria-label={con ? etiquetaDe(s.clave) : undefined}
                aria-hidden={con ? undefined : true}
                {...eventos(s.clave, con)}
              />
            );
          })}
          {activo && (
            <path
              d={trazoDe(activo)}
              fill="none"
              stroke={TINTA}
              strokeWidth={1.6}
              strokeLinejoin="round"
              pointerEvents="none"
            />
          )}
          {ESTADOS_MX.filter((s) => !LUPA.includes(s.clave) && de(s.clave)?.sucursales && s.radio >= 10).map(
            (s) => {
              const e = de(s.clave)!;
              const c = color(e);
              const dos = s.radio >= 14;
              return (
                <g
                  key={s.clave}
                  pointerEvents="none"
                  className="mx-rotulo"
                  style={{ '--d': onda(s.x) } as React.CSSProperties}
                >
                  <text
                    x={s.x}
                    y={dos ? s.y - 3 : s.y + 4.5}
                    textAnchor="middle"
                    fill={c.tinta}
                    className="text-[12.5px] font-bold"
                  >
                    {s.clave}
                  </text>
                  {dos && (
                    <text
                      x={s.x}
                      y={s.y + 11.5}
                      textAnchor="middle"
                      fill={c.tinta}
                      className="text-[12px] font-semibold tabular"
                    >
                      {valor(e)}
                    </text>
                  )}
                </g>
              );
            },
          )}
          {/* Lupa del Valle de México: la zona en el mapa, la línea guía y el marco ampliado. */}
          <rect
            x={z.x0}
            y={z.y0}
            width={z.x1 - z.x0}
            height={z.y1 - z.y0}
            fill="none"
            stroke={TINTA}
            strokeOpacity={0.6}
            strokeDasharray="2 2"
            rx={2}
            pointerEvents="none"
          />
          <path
            d={`M${z.x0},${z.y1} L${marco.x + marco.w},${marco.y}`}
            stroke={TINTA}
            strokeOpacity={0.35}
            strokeDasharray="2 3"
            fill="none"
            pointerEvents="none"
          />
          <rect
            x={marco.x}
            y={marco.y}
            width={marco.w}
            height={marco.h}
            rx={10}
            fill="#ffffff"
            fillOpacity={0.8}
            stroke="#cfc8ba"
          />
          <g clipPath={`url(#${id}-lupa)`}>
            <g transform={`translate(${marco.x - z.x0 * k} ${marco.y - z.y0 * k}) scale(${k})`}>
              {ESTADOS_MX.map((s) => {
                const e = de(s.clave);
                const con = !!e?.sucursales && LUPA.includes(s.clave);
                return (
                  <path
                    key={s.clave}
                    d={s.d}
                    style={{ fill: color(e).fondo, '--d': 14 } as React.CSSProperties}
                    className={cn('mx-estado outline-none', con && 'cursor-pointer')}
                    stroke="#ffffff"
                    strokeWidth={1.2 / k}
                    strokeLinejoin="round"
                    role={con ? 'img' : undefined}
                    aria-label={con ? `${etiquetaDe(s.clave)} (ampliado)` : undefined}
                    aria-hidden={con ? undefined : true}
                    {...eventos(s.clave, con)}
                  />
                );
              })}
              {activo && LUPA.includes(activo) && (
                <path
                  d={trazoDe(activo)}
                  fill="none"
                  stroke={TINTA}
                  strokeWidth={1.6 / k}
                  pointerEvents="none"
                />
              )}
            </g>
            {ESTADOS_MX.filter((s) => LUPA.includes(s.clave) && de(s.clave)?.sucursales).map((s) => {
              const e = de(s.clave)!;
              const c = color(e);
              const [lx, ly] = enLupa(s.x, s.y);
              return (
                <g
                  key={s.clave}
                  pointerEvents="none"
                  className="mx-rotulo"
                  style={{ '--d': 14 } as React.CSSProperties}
                >
                  <text
                    x={lx}
                    y={ly - 3}
                    textAnchor="middle"
                    fill={c.tinta}
                    className="text-[12.5px] font-bold"
                  >
                    {s.clave}
                  </text>
                  <text
                    x={lx}
                    y={ly + 11.5}
                    textAnchor="middle"
                    fill={c.tinta}
                    className="text-[12px] font-semibold tabular"
                  >
                    {valor(e)}
                  </text>
                </g>
              );
            })}
          </g>
          <text
            x={marco.x + 10}
            y={marco.y + 18}
            className="fill-ink-2 text-[12px] font-semibold"
            pointerEvents="none"
          >
            Valle de México
          </text>
        </svg>
        {info && (
          <div
            role="status"
            className="pointer-events-none absolute right-1 top-1 z-10 w-56 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lift"
          >
            <p className="font-semibold text-ink">{nombreEstado(info.clave)}</p>
            <p className="mt-1 tabular text-ink-2">
              {numero(info.sucursales)} {info.sucursales === 1 ? 'sucursal' : 'sucursales'} ·{' '}
              {dinero(info.venta, MXN, false)} hoy
            </p>
            {info.delta !== null && (
              <p className="tabular text-muted-foreground">
                {porcentaje(info.delta, 1)} contra la semana pasada a la misma hora
              </p>
            )}
            <p className="mt-1 text-muted-foreground">
              {info.nombres.slice(0, 6).join(', ')}
              {info.nombres.length > 6 ? ` y ${info.nombres.length - 6} más` : ''}
            </p>
          </div>
        )}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2">
        {leyenda.map((l) => (
          <li key={l.texto} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2.5 w-4 rounded-[3px]"
              style={{ backgroundColor: l.fondo }}
            />
            {l.texto}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2.5 w-4 rounded-[3px] border border-line"
            style={{ backgroundColor: SIN_SUCURSALES.fondo }}
          />
          sin sucursales
        </li>
      </ul>
    </div>
  );
}

/** Los estados con sucursales, de más a menos venta, con el mismo color del mapa (también es su vista de tabla). */
export function ListaEstados({ estados, modo }: { estados: EstadoMapa[]; modo: 'venta' | 'cambio' }) {
  const { color } = pintura(estados, modo);
  const filas = estados
    .filter((e) => e.sucursales)
    .sort((a, b) => b.venta - a.venta || a.clave.localeCompare(b.clave));
  const max = Math.max(1, ...filas.map((e) => e.venta));
  return (
    <ol className="divide-y divide-line">
      {filas.map((e) => (
        <li
          key={e.clave}
          className="grid grid-cols-[0.75rem_minmax(0,1fr)_auto_4.5rem] items-center gap-x-3 py-2 text-sm"
        >
          <span
            aria-hidden="true"
            className="size-3 rounded-[4px] border border-black/5"
            style={{ backgroundColor: color(e).fondo }}
          />
          <span className="min-w-0">
            <span className="block truncate font-medium">{nombreEstado(e.clave)}</span>
            <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="mx-barra block h-full rounded-full bg-ink/60"
                style={{ width: `${(e.venta / max) * 100}%` }}
              />
            </span>
          </span>
          <span className="text-right">
            <span className="block font-semibold tabular">{dinero(e.venta, MXN, false)}</span>
            <span className="block text-[11px] text-muted-foreground tabular">
              {e.sucursales} {e.sucursales === 1 ? 'sucursal' : 'sucursales'}
            </span>
          </span>
          <span className="text-right">
            <Cambio valor={e.delta} umbral={0.03} />
          </span>
        </li>
      ))}
    </ol>
  );
}
