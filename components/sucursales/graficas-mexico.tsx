'use client';
import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { cn } from 'cn';
import { etiquetaOrigen } from '@/lib/sucursales/metricas';
import type { Origen } from '@/lib/sucursales/normalizar';
import { AZUL, COLOR_ORIGEN, SERIE_BASE } from './colores';
import { Tooltip } from './graficas';
import { dinero, numero, porcentaje } from './formato';

/**
 * Gráficas del Tablero de México (skills dataviz y movimiento-web). Colores fijos por entidad: Mostrador violeta,
 * App naranja y Rappi verde (COLOR_ORIGEN), la semana pasada en gris de referencia y la magnitud en la rampa azul.
 * Separación de 2 px entre segmentos, tooltip en hover y en foco, y el texto siempre en tinta. El movimiento está en
 * tablero-mexico.css (clases mx-*).
 */

export const ORIGENES: Origen[] = ['mostrador', 'app', 'rappi'];
const MXN = 'MXN';
const compacto = (cent: number) =>
  new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: MXN,
    notation: 'compact',
    maximumFractionDigits: cent >= 1_000_000_00 ? 1 : 0,
  }).format(cent / 100);
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

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

/** Leyenda de los tres orígenes (siempre visible con 2 series o más). */
export function LeyendaOrigen({ extra }: { extra?: { color: string; etiqueta: string; linea?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {ORIGENES.map((o) => (
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

const ticks = (max: number) => {
  const paso = Math.pow(10, Math.floor(Math.log10(Math.max(1, max / 3))));
  const p = [1, 2, 2.5, 5, 10].map((m) => m * paso).find((x) => x * 3 >= max) ?? paso * 10;
  return [0, p, p * 2, p * 3];
};

/**
 * Venta acumulada de hoy apilada por origen (área) contra la semana pasada (línea punteada, total), hora por hora.
 * Hoy llega hasta `horaCorte`; la semana pasada, el día completo como referencia.
 */
export function AreaHoy({
  hoy,
  base,
  horaCorte,
  horaTexto,
  etiquetaBase,
}: {
  hoy: Record<Origen, number[]>;
  base: number[] | null;
  horaCorte: number;
  horaTexto: string;
  etiquetaBase: string;
}) {
  const id = useId();
  const [hora, setHora] = useState<number | null>(null);
  const desde = 6;
  const hasta = 23;
  const total = (h: number) => ORIGENES.reduce((a, o) => a + (hoy[o][h] ?? 0), 0);
  const max = ticks(Math.max(1, ...(base ?? [0]), ...Array.from({ length: 24 }, (_, h) => total(h))))[3];
  const W = 760;
  const H = 280;
  const M = { izq: 58, der: 18, arr: 18, aba: 30 };
  const x = (h: number) => M.izq + ((h + 1 - desde) / (hasta + 1 - desde)) * (W - M.izq - M.der);
  const y = (v: number) => H - M.aba - (v / max) * (H - M.arr - M.aba);
  const fin = Math.max(desde, Math.min(hasta, horaCorte));
  // Capas: cada origen se apila sobre los anteriores.
  const capas = ORIGENES.map((o, i) => {
    const debajo = (h: number) => ORIGENES.slice(0, i).reduce((a, q) => a + (hoy[q][h] ?? 0), 0);
    const arriba = (h: number) => debajo(h) + (hoy[o][h] ?? 0);
    const horas = Array.from({ length: fin - desde + 1 }, (_, k) => desde + k);
    const sup = [`M${x(desde - 1)},${y(0)}`, ...horas.map((h) => `L${x(h)},${y(arriba(h))}`)];
    const inf = [...horas].reverse().map((h) => `L${x(h)},${y(debajo(h))}`);
    return { o, d: `${sup.join(' ')} ${inf.join(' ')} L${x(desde - 1)},${y(0)} Z` };
  });
  const lineaBase = base
    ? `M${x(desde - 1)},${y(0)} ` +
      Array.from({ length: hasta - desde + 1 }, (_, k) => `L${x(desde + k)},${y(base[desde + k])}`).join(' ')
    : null;
  const t = ticks(max);
  const activa = hora ?? null;
  return (
    <figure className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Venta acumulada de hoy hasta las ${horaTexto}: ${dinero(total(fin), MXN, false)}${base ? `; ${etiquetaBase} a la misma hora: ${dinero(base[fin], MXN, false)}` : ''}.`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
          e.preventDefault();
          setHora((h) => Math.min(hasta, Math.max(desde, (h ?? fin) + (e.key === 'ArrowRight' ? 1 : -1))));
        }}
        onBlur={() => setHora(null)}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          const h = Math.round(desde - 1 + ((px - M.izq) / (W - M.izq - M.der)) * (hasta + 1 - desde));
          setHora(Math.min(hasta, Math.max(desde, h)));
        }}
        onPointerLeave={() => setHora(null)}
      >
        <defs>
          {ORIGENES.map((o) => (
            <linearGradient key={o} id={`${id}-${o}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor={COLOR_ORIGEN[o]} stopOpacity="0.85" />
              <stop offset="1" stopColor={COLOR_ORIGEN[o]} stopOpacity="0.55" />
            </linearGradient>
          ))}
        </defs>
        {t.map((v) => (
          <g key={v}>
            <line
              x1={M.izq}
              x2={W - M.der}
              y1={y(v)}
              y2={y(v)}
              stroke="#e3ded4"
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
        {Array.from({ length: (hasta - desde) / 3 + 1 }, (_, k) => desde - 1 + k * 3).map((h) => (
          <text
            key={h}
            x={x(h)}
            y={H - 8}
            textAnchor="middle"
            className="fill-muted-foreground text-[11px] tabular"
          >
            {hh(h + 1)}
          </text>
        ))}
        {capas.map((c) => (
          <path
            key={c.o}
            className="mx-area"
            style={{ d: `path('${c.d}')` } as React.CSSProperties}
            d={c.d}
            fill={`url(#${id}-${c.o})`}
            stroke="#ffffff"
            strokeWidth={1.5}
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
          />
        )}
        <line x1={x(fin)} x2={x(fin)} y1={M.arr} y2={H - M.aba} stroke="#a8774a" strokeDasharray="3 3" />
        <text
          x={x(fin) - 6}
          y={M.arr + 10}
          textAnchor="end"
          className="fill-crema-strong text-[11px] font-semibold"
        >
          Ahora {horaTexto}
        </text>
        <circle cx={x(fin)} cy={y(total(fin))} r={5} fill="#ffffff" stroke={AZUL.fuerte} strokeWidth={2.5} />
        {activa !== null && (
          <line
            x1={x(activa)}
            x2={x(activa)}
            y1={M.arr}
            y2={H - M.aba}
            stroke="#2b2926"
            strokeOpacity={0.35}
          />
        )}
      </svg>
      {activa !== null && (
        <Tooltip
          x={x(activa)}
          ancho={W}
          titulo={`Hasta las ${hh(activa + 1)}`}
          filas={[
            ...(activa <= fin
              ? [
                  ...ORIGENES.map((o) => ({
                    color: COLOR_ORIGEN[o],
                    etiqueta: etiquetaOrigen[o],
                    valor: dinero(hoy[o][activa] ?? 0, MXN, false),
                  })),
                  { color: '#2b2926', etiqueta: 'hoy', valor: dinero(total(activa), MXN, false) },
                ]
              : []),
            ...(base
              ? [
                  {
                    color: SERIE_BASE,
                    etiqueta: etiquetaBase,
                    valor: dinero(base[activa], MXN, false),
                    linea: true,
                  },
                ]
              : []),
          ]}
        />
      )}
    </figure>
  );
}

/** Pedidos por hora de hoy (columnas por origen apiladas) con la semana pasada como columna gris detrás. */
export function ColumnasHora({
  hoy,
  base,
  horaCorte,
  etiquetaBase,
}: {
  hoy: Record<Origen, number[]>;
  base: number[] | null;
  horaCorte: number;
  etiquetaBase: string;
}) {
  const [activa, setActiva] = useState<number | null>(null);
  const horas = Array.from({ length: 16 }, (_, k) => k + 6);
  const total = (h: number) => ORIGENES.reduce((a, o) => a + (hoy[o][h] ?? 0), 0);
  const max = Math.max(1, ...horas.map(total), ...horas.map((h) => base?.[h] ?? 0));
  return (
    <div className="relative">
      <div
        className="flex h-56 items-end gap-1.5"
        role="img"
        aria-label="Pedidos por hora de hoy frente a la semana pasada. La tabla de abajo tiene las cifras."
      >
        {horas.map((h, i) => (
          <button
            key={h}
            type="button"
            onPointerEnter={() => setActiva(h)}
            onPointerLeave={() => setActiva(null)}
            onFocus={() => setActiva(h)}
            onBlur={() => setActiva(null)}
            aria-label={`${hh(h)}: ${numero(total(h))} pedidos hoy${base ? `, ${numero(base[h])} ${etiquetaBase}` : ''}`}
            className={cn(
              'relative flex h-full flex-1 items-end justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ink',
              activa === h && 'bg-surface-2/70',
            )}
          >
            {base && (
              <span
                className="mx-columna absolute bottom-0 left-1/2 w-[78%] -translate-x-1/2 rounded-t-[4px] bg-[#e7e3db]"
                style={{ height: `${(base[h] / max) * 100}%`, '--i': i } as React.CSSProperties}
              />
            )}
            <span
              className="mx-columna relative flex w-[52%] flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]"
              style={
                {
                  height: `${(total(h) / max) * 100}%`,
                  opacity: h > horaCorte ? 0 : 1,
                  '--i': i,
                } as React.CSSProperties
              }
            >
              {ORIGENES.map((o) =>
                (hoy[o][h] ?? 0) > 0 ? (
                  <span key={o} style={{ flexGrow: hoy[o][h], backgroundColor: COLOR_ORIGEN[o] }} />
                ) : null,
              )}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5 text-[11px] text-muted-foreground tabular">
        {horas.map((h) => (
          <span key={h} className="flex-1 text-center">
            {h % 3 === 0 ? h : ''}
          </span>
        ))}
      </div>
      {activa !== null && (
        <Tooltip
          x={((activa - 6 + 0.5) / 16) * 720}
          ancho={720}
          titulo={`${hh(activa)} a ${hh(activa + 1)}`}
          filas={[
            ...ORIGENES.map((o) => ({
              color: COLOR_ORIGEN[o],
              etiqueta: etiquetaOrigen[o],
              valor: numero(hoy[o][activa] ?? 0),
            })),
            ...(base ? [{ color: '#cfc8ba', etiqueta: etiquetaBase, valor: numero(base[activa]) }] : []),
          ]}
        />
      )}
    </div>
  );
}

/** Anillo por origen con separación y la cifra principal al centro. */
export function Anillo({
  segmentos,
  centro,
  detalle,
}: {
  segmentos: { clave: string; etiqueta: string; color: string; valor: number }[];
  centro: string;
  detalle: string;
}) {
  const total = segmentos.reduce((a, s) => a + s.valor, 0);
  const R = 70;
  const C = 2 * Math.PI * R;
  const hueco = segmentos.filter((s) => s.valor > 0).length > 1 ? 4 : 0;
  let acumulado = 0;
  return (
    <div className="flex flex-wrap items-center gap-6">
      <svg
        viewBox="0 0 180 180"
        className="size-44 shrink-0"
        role="img"
        aria-label={segmentos
          .map((s) => `${s.etiqueta} ${porcentaje(total ? s.valor / total : null, 0)}`)
          .join(', ')}
      >
        <circle cx={90} cy={90} r={R} fill="none" stroke="#efece5" strokeWidth={22} />
        {segmentos.map((s) => {
          const largo = total ? (s.valor / total) * C : 0;
          const visible = Math.max(0, largo - hueco);
          const offset = -acumulado;
          acumulado += largo;
          return (
            <circle
              key={s.clave}
              className="mx-anillo"
              cx={90}
              cy={90}
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={22}
              strokeDasharray={`${visible} ${C - visible}`}
              strokeDashoffset={offset}
              transform="rotate(-90 90 90)"
            />
          );
        })}
        <text
          x={90}
          y={88}
          textAnchor="middle"
          className="fill-ink font-display text-[26px] font-black tabular"
        >
          {centro}
        </text>
        <text x={90} y={108} textAnchor="middle" className="fill-muted-foreground text-[11px]">
          {detalle}
        </text>
      </svg>
      <ul className="min-w-44 flex-1 space-y-2.5">
        {segmentos.map((s) => (
          <li
            key={s.clave}
            className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-2 text-sm"
          >
            <span
              aria-hidden="true"
              className="size-3 translate-y-0.5 rounded-[3px]"
              style={{ backgroundColor: s.color }}
            />
            <span className="font-medium">{s.etiqueta}</span>
            <span className="text-right font-semibold tabular">
              {porcentaje(total ? s.valor / total : null, 0)}
            </span>
            <span />
            <span className="col-span-2 text-xs text-muted-foreground tabular">
              {dinero(s.valor, MXN, false)}
            </span>
          </li>
        ))}
      </ul>
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
    <ol className="space-y-3">
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
            className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 text-sm"
          >
            <span
              className="grid size-6 place-items-center rounded-full text-[11px] font-bold tabular"
              style={{
                backgroundColor: i < 3 ? AZUL.fuerte : AZUL.claro,
                color: i < 3 ? '#ffffff' : AZUL.profundo,
              }}
            >
              {i + 1}
            </span>
            <span className="flex min-w-0 items-baseline gap-2">
              {nombre}
              {f.detalle && <span className="truncate text-xs text-muted-foreground">{f.detalle}</span>}
            </span>
            <span className="text-right tabular">{f.valor}</span>
            <span />
            <span className="col-span-2 flex items-center gap-2">
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
                <span className="w-24 text-right text-xs text-muted-foreground tabular">{f.nota}</span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Venta por semana, columnas apiladas por origen con el total arriba. Una semana sin todos sus días va rayada. */
export function SemanasApiladas({
  semanas,
}: {
  semanas: { clave: string; etiqueta: string; por: Partial<Record<Origen, number>>; parcial: boolean }[];
}) {
  const id = useId();
  const [activa, setActiva] = useState<number | null>(null);
  const total = (s: (typeof semanas)[number]) => ORIGENES.reduce((a, o) => a + (s.por[o] ?? 0), 0);
  const max = Math.max(1, ...semanas.map(total));
  return (
    <div className="relative">
      <svg width="0" height="0" className="absolute" aria-hidden="true">
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
      </svg>
      <div
        className="flex h-64 items-end gap-2 pt-6"
        role="img"
        aria-label="Venta por semana por origen. La tabla de sucursales tiene el total del periodo."
      >
        {semanas.map((s, i) => (
          <button
            key={s.clave}
            type="button"
            onPointerEnter={() => setActiva(i)}
            onPointerLeave={() => setActiva(null)}
            onFocus={() => setActiva(i)}
            onBlur={() => setActiva(null)}
            aria-label={`${s.etiqueta}: ${s.parcial ? 'semana parcial' : dinero(total(s), MXN, false)}`}
            className={cn(
              'relative flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ink',
              activa === i && 'bg-surface-2/70',
            )}
          >
            <span className="mb-1 text-[11px] font-semibold tabular text-ink">
              {s.parcial ? 'parcial' : compacto(total(s))}
            </span>
            <span
              className="mx-columna flex w-[62%] max-w-14 flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]"
              style={{ height: `${(total(s) / max) * 84}%`, '--i': i } as React.CSSProperties}
            >
              {s.parcial ? (
                <svg className="size-full" aria-hidden="true">
                  <rect width="100%" height="100%" fill={`url(#${id}-raya)`} />
                </svg>
              ) : (
                ORIGENES.map((o) =>
                  (s.por[o] ?? 0) > 0 ? (
                    <span key={o} style={{ flexGrow: s.por[o], backgroundColor: COLOR_ORIGEN[o] }} />
                  ) : null,
                )
              )}
            </span>
          </button>
        ))}
      </div>
      <div className="mt-2 flex gap-2 text-[11px] text-muted-foreground">
        {semanas.map((s) => (
          <span key={s.clave} className="min-w-0 flex-1 truncate text-center">
            {s.etiqueta}
          </span>
        ))}
      </div>
      {activa !== null && (
        <Tooltip
          x={((activa + 0.5) / semanas.length) * 720}
          ancho={720}
          titulo={semanas[activa].etiqueta}
          filas={[
            ...ORIGENES.map((o) => ({
              color: COLOR_ORIGEN[o],
              etiqueta: etiquetaOrigen[o],
              valor: dinero(semanas[activa].por[o] ?? 0, MXN, false),
            })),
            { color: '#2b2926', etiqueta: 'total', valor: dinero(total(semanas[activa]), MXN, false) },
          ]}
        />
      )}
    </div>
  );
}

// ——— Mapa de México en mosaico de estados ———

/** [clave, nombre, columna, fila]: mosaico aproximado a la geografía (noroeste arriba a la izquierda). */
export const ESTADOS: [string, string, number, number][] = [
  ['BC', 'Baja California', 0, 0],
  ['SON', 'Sonora', 1, 0],
  ['CHIH', 'Chihuahua', 2, 0],
  ['COAH', 'Coahuila', 3, 0],
  ['NL', 'Nuevo León', 4, 0],
  ['BCS', 'Baja California Sur', 0, 1],
  ['SIN', 'Sinaloa', 1, 1],
  ['DGO', 'Durango', 2, 1],
  ['ZAC', 'Zacatecas', 3, 1],
  ['SLP', 'San Luis Potosí', 4, 1],
  ['TAMS', 'Tamaulipas', 5, 1],
  ['NAY', 'Nayarit', 1, 2],
  ['JAL', 'Jalisco', 2, 2],
  ['AGS', 'Aguascalientes', 3, 2],
  ['GTO', 'Guanajuato', 4, 2],
  ['QRO', 'Querétaro', 5, 2],
  ['HGO', 'Hidalgo', 6, 2],
  ['COL', 'Colima', 2, 3],
  ['MICH', 'Michoacán', 3, 3],
  ['MEX', 'Estado de México', 4, 3],
  ['CDMX', 'Ciudad de México', 5, 3],
  ['TLAX', 'Tlaxcala', 6, 3],
  ['VER', 'Veracruz', 7, 3],
  ['GRO', 'Guerrero', 4, 4],
  ['MOR', 'Morelos', 5, 4],
  ['PUE', 'Puebla', 6, 4],
  ['TAB', 'Tabasco', 8, 4],
  ['CAM', 'Campeche', 9, 4],
  ['YUC', 'Yucatán', 10, 4],
  ['OAX', 'Oaxaca', 6, 5],
  ['CHIS', 'Chiapas', 8, 5],
  ['QROO', 'Quintana Roo', 10, 5],
];

export interface EstadoMapa {
  clave: string;
  sucursales: number;
  venta: number;
  delta: number | null;
  nombres: string[];
}

/** Cambio contra la semana pasada en 5 pasos: rojo y verde (estado), gris al centro. */
const DIVERGENTE = [
  { hasta: -0.1, fondo: '#b3362b', tinta: '#ffffff', texto: 'baja más de 10 %' },
  { hasta: -0.03, fondo: '#e9a39b', tinta: '#2b2926', texto: 'baja 3–10 %' },
  { hasta: 0.03, fondo: '#dcd7cd', tinta: '#2b2926', texto: '±3 %' },
  { hasta: 0.1, fondo: '#8cc7a2', tinta: '#2b2926', texto: 'sube 3–10 %' },
  { hasta: Infinity, fondo: '#2f7a4f', tinta: '#ffffff', texto: 'sube más de 10 %' },
];
const SECUENCIAL = [
  { fondo: AZUL.claro, tinta: '#184f95' },
  { fondo: AZUL.medio, tinta: '#0f2f5c' },
  { fondo: AZUL.fuerte, tinta: '#ffffff' },
  { fondo: AZUL.profundo, tinta: '#ffffff' },
];

export function MapaEstados({ estados, modo }: { estados: EstadoMapa[]; modo: 'venta' | 'cambio' }) {
  const [activo, setActivo] = useState<string | null>(null);
  const max = Math.max(1, ...estados.map((e) => e.venta));
  const color = (e: EstadoMapa | undefined) => {
    if (!e || !e.sucursales) return { fondo: '#ebe7df', tinta: '#6f6a61' };
    if (modo === 'cambio')
      return e.delta === null
        ? { fondo: '#ece8e0', tinta: '#6f6a61' }
        : DIVERGENTE.find((d) => e.delta! < d.hasta)!;
    return SECUENCIAL[Math.min(3, Math.floor((e.venta / max) * 3.999))];
  };
  const info = activo ? estados.find((e) => e.clave === activo) : undefined;
  const nombreDe = (c: string) => ESTADOS.find((e) => e[0] === c)?.[1] ?? c;
  return (
    <div className="space-y-4">
      <div className="relative">
        <div
          className="grid grid-cols-11 gap-[3px] sm:gap-1.5"
          role="list"
          aria-label="Estados con su venta de hoy"
        >
          {ESTADOS.map(([clave, nombre, col, fila]) => {
            const e = estados.find((x) => x.clave === clave);
            const c = color(e);
            return (
              <button
                key={clave}
                type="button"
                role="listitem"
                data-con={e?.sucursales ? '' : undefined}
                onPointerEnter={() => setActivo(clave)}
                onPointerLeave={() => setActivo(null)}
                onFocus={() => setActivo(clave)}
                onBlur={() => setActivo(null)}
                aria-label={
                  e?.sucursales
                    ? `${nombre}: ${e.sucursales} sucursales, ${dinero(e.venta, MXN, false)} hoy${e.delta === null ? '' : `, ${porcentaje(e.delta, 1)} contra la semana pasada`}`
                    : `${nombre}: sin sucursales en el tablero`
                }
                className="mx-estado flex aspect-square flex-col items-center justify-center rounded-[10px] border border-white/60 p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ink"
                style={
                  {
                    gridColumn: col + 1,
                    gridRow: fila + 1,
                    backgroundColor: c.fondo,
                    color: c.tinta,
                    '--d': col + fila,
                  } as React.CSSProperties
                }
              >
                <span className="text-[10px] font-bold leading-none sm:text-xs">{clave}</span>
                {e?.sucursales ? (
                  <span className="mt-0.5 hidden text-[10px] font-semibold leading-none tabular sm:block">
                    {modo === 'venta'
                      ? compacto(e.venta)
                      : e.delta === null
                        ? '—'
                        : `${e.delta > 0 ? '+' : ''}${Math.round(e.delta * 100)}%`}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {info && (
          <div
            role="status"
            className="pointer-events-none absolute right-0 top-0 z-10 w-60 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lift"
          >
            <p className="font-semibold text-ink">{nombreDe(info.clave)}</p>
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
              {info.nombres.length > 6 ? '…' : ''}
            </p>
          </div>
        )}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-2">
        {modo === 'cambio'
          ? DIVERGENTE.map((d) => (
              <li key={d.texto} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-[3px]"
                  style={{ backgroundColor: d.fondo }}
                />
                {d.texto}
              </li>
            ))
          : [
              <li key="menos" className="flex items-center gap-1.5">
                menos venta
                {SECUENCIAL.map((s) => (
                  <span
                    key={s.fondo}
                    aria-hidden="true"
                    className="h-2.5 w-5 rounded-[3px]"
                    style={{ backgroundColor: s.fondo }}
                  />
                ))}
                más venta
              </li>,
            ]}
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-[3px] border border-line"
            style={{ backgroundColor: '#ebe7df' }}
          />
          sin sucursales todavía
        </li>
      </ul>
    </div>
  );
}
