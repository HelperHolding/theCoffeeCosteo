'use client';
import { useId, useState } from 'react';
import { SERIE_HOY } from './colores';
import { Tooltip } from './graficas';

/**
 * Gráficas de Tendencias (skill dataviz): una serie por gráfica (sin leyenda; el título la nombra),
 * columnas ≤ 56px con extremo redondeado, rampa secuencial azul de un tono para el mapa de calor,
 * tooltip en hover y teclado, y tabla equivalente donde la gráfica no rotula todos los valores.
 */

/** Etiqueta corta de semana: "21–27 sep" o "28 sep – 4 oct". */
export function etiquetaSemana(desde: string, hasta: string) {
  const f = (s: string, mes: boolean) =>
    new Intl.DateTimeFormat('es-MX', { day: 'numeric', ...(mes ? { month: 'short' } : {}), timeZone: 'UTC' })
      .format(new Date(`${s}T12:00:00Z`))
      .replace('.', '');
  return desde.slice(5, 7) === hasta.slice(5, 7)
    ? `${f(desde, false)}–${f(hasta, true)}`
    : `${f(desde, true)} – ${f(hasta, true)}`;
}

type Punto = { clave: string; etiqueta: string; valor: number | null };

/** Columnas por semana; una semana con lectura incompleta se dibuja rayada y rotulada "parcial". */
export function ColumnasSemana({
  semanas,
  formato,
  titulo,
}: {
  semanas: Punto[];
  formato: (v: number) => string;
  titulo: string;
}) {
  const id = useId();
  const [activa, setActiva] = useState<number | null>(null);
  const max = Math.max(1, ...semanas.map((s) => s.valor ?? 0));
  const W = 720;
  const H = 230;
  const M = { izq: 12, der: 12, arr: 26, aba: 34 };
  const slot = (W - M.izq - M.der) / Math.max(1, semanas.length);
  const ancho = Math.min(56, slot * 0.55);
  const y = (v: number) => H - M.aba - (v / max) * (H - M.arr - M.aba);
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${titulo}. La tabla de la semana tiene las cifras.`}
        className="h-auto w-full"
      >
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
        <line x1={M.izq} x2={W - M.der} y1={y(0)} y2={y(0)} stroke="#e3ded4" />
        {semanas.map((s, i) => {
          const cx = M.izq + (i + 0.5) * slot;
          const top = s.valor === null ? y(max * 0.18) : y(s.valor);
          const alto = y(0) - top;
          const r = Math.min(4, alto / 2);
          const l = cx - ancho / 2;
          const d =
            alto < 0.5
              ? ''
              : `M${l},${y(0)} L${l},${top + r} Q${l},${top} ${l + r},${top} L${l + ancho - r},${top} Q${l + ancho},${top} ${l + ancho},${top + r} L${l + ancho},${y(0)} Z`;
          return (
            <g
              key={s.clave}
              tabIndex={0}
              aria-label={`${s.etiqueta}: ${s.valor === null ? 'lectura incompleta' : formato(s.valor)}`}
              onPointerEnter={() => setActiva(i)}
              onPointerLeave={() => setActiva(null)}
              onFocus={() => setActiva(i)}
              onBlur={() => setActiva(null)}
              className="outline-none"
            >
              <rect
                x={cx - slot / 2}
                y={M.arr - 18}
                width={slot}
                height={H - M.arr - M.aba + 18}
                fill={activa === i ? '#efece5' : 'transparent'}
                rx={6}
              />
              <path d={d} fill={s.valor === null ? `url(#${id}-raya)` : SERIE_HOY} />
              <text x={cx} y={top - 8} textAnchor="middle" className="fill-ink text-[12px] font-semibold">
                {s.valor === null ? 'parcial' : formato(s.valor)}
              </text>
              <text x={cx} y={H - 12} textAnchor="middle" className="fill-muted-foreground text-[11px]">
                {s.etiqueta}
              </text>
            </g>
          );
        })}
      </svg>
      {activa !== null && (
        <Tooltip
          x={M.izq + (activa + 0.5) * slot}
          ancho={W}
          titulo={semanas[activa].etiqueta}
          filas={[
            {
              color: semanas[activa].valor === null ? '#cfc8ba' : SERIE_HOY,
              etiqueta: titulo,
              valor: semanas[activa].valor === null ? 'Lectura incompleta' : formato(semanas[activa].valor!),
            },
          ]}
        />
      )}
    </div>
  );
}

/** Línea semanal con puntos y el valor de la última semana rotulado. */
export function LineaSemanal({
  semanas,
  formato,
  titulo,
}: {
  semanas: Punto[];
  formato: (v: number) => string;
  titulo: string;
}) {
  const [activa, setActiva] = useState<number | null>(null);
  const vals = semanas.map((s) => s.valor).filter((v): v is number => v !== null);
  const min = vals.length ? Math.min(...vals) : 0;
  const maxV = vals.length ? Math.max(...vals) : 1;
  const pad = Math.max(1, (maxV - min) * 0.25);
  const lo = Math.max(0, min - pad);
  const hi = maxV + pad;
  const W = 720;
  const H = 180;
  const M = { izq: 24, der: 76, arr: 18, aba: 30 };
  const x = (i: number) =>
    M.izq + (semanas.length === 1 ? 0.5 : i / (semanas.length - 1)) * (W - M.izq - M.der);
  const y = (v: number) => H - M.aba - ((v - lo) / (hi - lo || 1)) * (H - M.arr - M.aba);
  const pts = semanas.map((s, i) => (s.valor === null ? null : ([x(i), y(s.valor)] as const)));
  const tramo = pts
    .filter((p): p is readonly [number, number] => p !== null)
    .map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(' ');
  const ultimo = [...pts.keys()].reverse().find((i) => pts[i] !== null);
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${titulo}. La tabla de la semana tiene las cifras.`}
        className="h-auto w-full"
      >
        <line x1={M.izq} x2={W - M.der} y1={H - M.aba} y2={H - M.aba} stroke="#e3ded4" />
        <polyline
          points={tramo}
          fill="none"
          stroke={SERIE_HOY}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {semanas.map((s, i) => (
          <g
            key={s.clave}
            tabIndex={0}
            aria-label={`${s.etiqueta}: ${s.valor === null ? 'lectura incompleta' : formato(s.valor)}`}
            onPointerEnter={() => setActiva(i)}
            onPointerLeave={() => setActiva(null)}
            onFocus={() => setActiva(i)}
            onBlur={() => setActiva(null)}
            className="outline-none"
          >
            <rect x={x(i) - 24} y={M.arr} width={48} height={H - M.arr - M.aba} fill="transparent" />
            {pts[i] && (
              <circle
                cx={pts[i]![0]}
                cy={pts[i]![1]}
                r={activa === i ? 6 : 4.5}
                fill={SERIE_HOY}
                stroke="#ffffff"
                strokeWidth={2}
              />
            )}
            <text x={x(i)} y={H - 10} textAnchor="middle" className="fill-muted-foreground text-[11px]">
              {s.etiqueta}
            </text>
          </g>
        ))}
        {ultimo !== undefined && (
          <text
            x={pts[ultimo]![0] + 10}
            y={pts[ultimo]![1] + 4}
            className="fill-ink text-[12px] font-semibold"
          >
            {formato(semanas[ultimo].valor!)}
          </text>
        )}
      </svg>
      {activa !== null && (
        <Tooltip
          x={x(activa)}
          ancho={W}
          titulo={semanas[activa].etiqueta}
          filas={[
            {
              color: SERIE_HOY,
              etiqueta: titulo,
              valor: semanas[activa].valor === null ? 'Lectura incompleta' : formato(semanas[activa].valor!),
              linea: true,
            },
          ]}
        />
      )}
    </div>
  );
}

const RAMPA = ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'];
const CERO = '#efece5';
const SIN_DATOS = '#f7f5f1';
const DIAS_CORTOS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const hh = (h: number) => String(h).padStart(2, '0');
const uno = (v: number) => v.toLocaleString('es-MX', { maximumFractionDigits: 1 });

/** Mapa de calor día × hora con rampa secuencial azul (un tono). Gris = 0 pedidos. */
export function MapaCalor({ celdas, semanas }: { celdas: (number | null)[][]; semanas: number }) {
  const [activa, setActiva] = useState<[number, number] | null>(null);
  const horasConDatos = celdas.flatMap((f) => f.map((v, h) => ((v ?? 0) > 0 ? h : -1))).filter((h) => h >= 0);
  const desde = horasConDatos.length ? Math.min(...horasConDatos) : 7;
  const hasta = horasConDatos.length ? Math.max(...horasConDatos) : 21;
  const horas = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
  const max = Math.max(0.0001, ...celdas.flat().map((v) => v ?? 0));
  const color = (v: number | null) =>
    v === null
      ? SIN_DATOS
      : v === 0
        ? CERO
        : RAMPA[Math.min(RAMPA.length - 1, Math.floor((v / max) * RAMPA.length))];
  const texto = (v: number | null) => (v === null ? 'sin datos' : `${uno(v)} pedidos`);
  return (
    <figure className="space-y-3">
      <div className="overflow-x-auto">
        <div
          role="grid"
          aria-label={`Pedidos promedio por día y hora (${semanas} semanas completas)`}
          className="grid min-w-[560px] gap-[2px]"
          style={{ gridTemplateColumns: `2.5rem repeat(${horas.length}, minmax(0, 1fr))` }}
        >
          <span />
          {horas.map((h) => (
            <span key={h} className="text-center text-[10px] text-muted-foreground tabular">
              {hh(h)}
            </span>
          ))}
          {celdas.map((fila, d) => (
            <div key={d} role="row" className="contents">
              <span role="rowheader" className="self-center text-xs font-medium text-ink-2">
                {DIAS_CORTOS[d]}
              </span>
              {horas.map((h) => {
                const v = fila[h];
                const sel = activa !== null && activa[0] === d && activa[1] === h;
                return (
                  <span
                    key={h}
                    role="gridcell"
                    tabIndex={0}
                    aria-label={`${DIAS_CORTOS[d]} ${hh(h)}:00, ${texto(v)} en promedio`}
                    onPointerEnter={() => setActiva([d, h])}
                    onPointerLeave={() => setActiva(null)}
                    onFocus={() => setActiva([d, h])}
                    onBlur={() => setActiva(null)}
                    className={`h-7 rounded-[4px] outline-none ${sel ? 'ring-2 ring-ink ring-offset-1' : ''}`}
                    style={{ backgroundColor: color(v) }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <figcaption className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span aria-live="polite" className="min-h-4 font-medium text-ink-2">
          {activa
            ? `${DIAS_CORTOS[activa[0]]} ${hh(activa[1])}:00–${hh(activa[1])}:59 · ${texto(celdas[activa[0]][activa[1]])} en promedio`
            : 'Pasa el cursor o usa Tab para ver cada celda.'}
        </span>
        <span className="flex items-center gap-2">
          <span>0</span>
          <span className="flex gap-[2px]" aria-hidden="true">
            <span className="size-3 rounded-[3px]" style={{ backgroundColor: CERO }} />
            {RAMPA.map((c) => (
              <span key={c} className="size-3 rounded-[3px]" style={{ backgroundColor: c }} />
            ))}
          </span>
          <span>máx. {uno(max)} pedidos/h</span>
        </span>
      </figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-ink-2">Ver como tabla</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="tabla w-full">
            <caption className="sr-only">Pedidos promedio por día y hora</caption>
            <thead>
              <tr>
                <th scope="col">Día</th>
                {horas.map((h) => (
                  <th key={h} scope="col" className="numero">
                    {hh(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {celdas.map((fila, d) => (
                <tr key={d}>
                  <th scope="row">{DIAS_CORTOS[d]}</th>
                  {horas.map((h) => (
                    <td key={h} className="numero">
                      {fila[h] === null ? '—' : uno(fila[h]!)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Una barra apilada al 100% por semana, con leyenda única arriba (colores fijos por entidad). */
export function FilasApiladas({
  filas,
  claves,
}: {
  filas: { clave: string; etiqueta: string; segmentos: { clave: string; participacion: number | null }[] }[];
  claves: { clave: string; etiqueta: string; color: string }[];
}) {
  const [activa, setActiva] = useState<string | null>(null);
  const nombre = (k: string) => claves.find((c) => c.clave === k)?.etiqueta ?? k;
  const pct = (p: number | null) => `${Math.round((p ?? 0) * 100)}%`;
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {claves.map((c) => (
          <li
            key={c.clave}
            onPointerEnter={() => setActiva(c.clave)}
            onPointerLeave={() => setActiva(null)}
            className="flex items-center gap-1.5 text-ink-2"
          >
            <span
              aria-hidden="true"
              className="size-2.5 rounded-[3px]"
              style={{ backgroundColor: c.color }}
            />
            {c.etiqueta}
          </li>
        ))}
      </ul>
      <ul className="space-y-2">
        {filas.map((f) => (
          <li key={f.clave} className="grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 text-xs">
            <span className="tabular text-ink-2">{f.etiqueta}</span>
            {f.segmentos.length === 0 ? (
              <span className="text-muted-foreground">Lectura incompleta</span>
            ) : (
              <span
                className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[4px]"
                role="img"
                aria-label={`${f.etiqueta}: ${f.segmentos.map((s) => `${nombre(s.clave)} ${pct(s.participacion)}`).join(', ')}`}
              >
                {f.segmentos.map((s) => (
                  <span
                    key={s.clave}
                    title={`${nombre(s.clave)}: ${pct(s.participacion)}`}
                    onPointerEnter={() => setActiva(s.clave)}
                    onPointerLeave={() => setActiva(null)}
                    className="h-full transition-opacity"
                    style={{
                      width: `${(s.participacion ?? 0) * 100}%`,
                      backgroundColor: claves.find((c) => c.clave === s.clave)?.color ?? '#a39e94',
                      opacity: activa && activa !== s.clave ? 0.3 : 1,
                    }}
                  />
                ))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
