'use client';
import { useId, useRef, useState } from 'react';
import { AZUL, SERIE_BASE, SERIE_HOY } from './colores';
import { dinero, numero, porcentaje } from './formato';

/**
 * Gráficas SVG de Sucursales siguiendo la skill dataviz: líneas 2px, columnas ≤ 24px con extremo
 * redondeado de 4px, separación de 2px, rejilla tenue, leyenda siempre visible para 2 series,
 * tooltip en hover y en foco de teclado (←/→), y tabla equivalente. Texto siempre en tinta.
 */

type FilaTooltip = { color: string; etiqueta: string; valor: string; linea?: boolean };

export function Tooltip({
  x,
  titulo,
  filas,
  ancho,
}: {
  x: number;
  titulo: string;
  filas: FilaTooltip[];
  ancho: number;
}) {
  // Se ancla al lado contrario cuando no cabe a la derecha.
  const izquierda = x > ancho * 0.62;
  return (
    <div
      role="status"
      className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lift"
      style={
        izquierda
          ? { right: `calc(${100 - (x / ancho) * 100}% + 10px)` }
          : { left: `calc(${(x / ancho) * 100}% + 10px)` }
      }
    >
      <p className="mb-1 font-semibold text-ink-2">{titulo}</p>
      <ul className="space-y-1">
        {filas.map((f) => (
          <li key={f.etiqueta} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={f.linea ? 'h-0.5 w-3 rounded-full' : 'size-2.5 rounded-sm'}
              style={{ backgroundColor: f.color }}
            />
            <span className="font-semibold tabular text-ink">{f.valor}</span>
            <span className="text-muted-foreground">{f.etiqueta}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const rangoHoras = (series: (number | null)[][], horaCorte: number) => {
  const horas = series.flatMap((v) => v.map((x, h) => ((x ?? 0) > 0 ? h : -1)).filter((h) => h >= 0));
  const todas = [...horas, horaCorte];
  return { desde: Math.max(0, Math.min(6, ...todas) - 1), hasta: Math.min(23, Math.max(21, ...todas)) };
};
const hh = (h: number) => String(h).padStart(2, '0');
const tickLimpio = (max: number) => {
  const paso = 10 ** Math.floor(Math.log10(Math.max(1, max / 2)));
  const n = Math.ceil(max / 2 / paso) * paso;
  return [0, n, n * 2];
};

/** Interacción común: hora bajo el puntero o con flechas del teclado. */
function useHoraActiva(
  desde: number,
  hasta: number,
  xDeHora: (h: number) => number,
  W: number,
  inicial: number,
) {
  const [hora, setHora] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const alMover = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    let mejor = desde;
    for (let h = desde; h <= hasta; h++)
      if (Math.abs(xDeHora(h) - x) < Math.abs(xDeHora(mejor) - x)) mejor = h;
    setHora(mejor);
  };
  const props = {
    ref,
    tabIndex: 0,
    onPointerMove: alMover,
    onPointerLeave: () => setHora(null),
    onFocus: () => setHora(inicial),
    onBlur: () => setHora(null),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      setHora((h) => Math.min(hasta, Math.max(desde, (h ?? inicial) + (e.key === 'ArrowRight' ? 1 : -1))));
    },
  };
  return { hora, props };
}

export function CurvaAcumulada({
  hoy,
  base,
  horaCorte,
  horaTexto,
  etiquetaBase,
  moneda,
}: {
  hoy: (number | null)[];
  base: number[] | null;
  horaCorte: number;
  horaTexto: string;
  etiquetaBase: string;
  moneda: string;
}) {
  const id = useId();
  const { desde, hasta } = rangoHoras([hoy, base ?? []], horaCorte);
  const ticks = tickLimpio(Math.max(1, ...hoy.map((v) => v ?? 0), ...(base ?? [])));
  const max = ticks[2];
  const W = 720;
  const H = 240;
  const M = { izq: 56, der: 70, arr: 22, aba: 28 };
  // Punto de cada hora al CIERRE de la hora (h + 1).
  const x = (h: number) => M.izq + ((h + 1 - desde) / (hasta + 1 - desde)) * (W - M.izq - M.der);
  const y = (v: number) => H - M.aba - (v / max) * (H - M.arr - M.aba);
  const puntos = (vals: (number | null)[], de: number, a: number) => {
    const pts: [number, number][] = [[x(de - 1), y(de === desde ? 0 : (vals[de - 1] ?? 0))]];
    for (let h = de; h <= a; h++) if (vals[h] !== null) pts.push([x(h), y(vals[h]!)]);
    return pts;
  };
  const linea = (pts: [number, number][]) => pts.map(([a, b]) => `${a.toFixed(1)},${b.toFixed(1)}`).join(' ');
  const ultimaHoy = Math.min(horaCorte, hasta);
  const ptsHoy = puntos(hoy, desde, ultimaHoy);
  const area = `${linea(ptsHoy)} ${x(ultimaHoy).toFixed(1)},${y(0)} ${x(desde - 1).toFixed(1)},${y(0)}`;
  const finHoy = ptsHoy.at(-1)!;
  const { hora, props } = useHoraActiva(desde, hasta, x, W, ultimaHoy);
  const filas = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);

  return (
    <figure className="space-y-3">
      <div className="relative">
        <svg
          {...props}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Venta acumulada por hora de hoy frente a ${etiquetaBase}. Usa las flechas para recorrer las horas; la tabla tiene las cifras.`}
          className="h-auto w-full touch-pan-y rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <defs>
            <linearGradient id={`${id}-area`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={SERIE_HOY} stopOpacity={0.16} />
              <stop offset="100%" stopColor={SERIE_HOY} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.izq} x2={W - M.der} y1={y(t)} y2={y(t)} stroke="#e3ded4" strokeWidth={1} />
              <text x={M.izq - 8} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
                {dinero(t, moneda, false)}
              </text>
            </g>
          ))}
          {filas
            .filter((h) => h % 2 === 0)
            .map((h) => (
              <text
                key={h}
                x={x(h - 0.5)}
                y={H - 8}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {hh(h)}
              </text>
            ))}
          {/* Marca de "ahora" */}
          <line
            x1={x(horaCorte)}
            x2={x(horaCorte)}
            y1={M.arr - 6}
            y2={H - M.aba}
            stroke="#a8774a"
            strokeWidth={1}
          />
          <text
            x={x(horaCorte)}
            y={M.arr - 10}
            textAnchor="middle"
            className="fill-crema-strong text-[11px] font-semibold"
          >
            Ahora {horaTexto}
          </text>
          {base && (
            <>
              <polyline
                points={linea(puntos(base, desde, ultimaHoy))}
                fill="none"
                stroke={SERIE_BASE}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {horaCorte < hasta && (
                <polyline
                  points={linea(puntos(base, horaCorte + 1, hasta))}
                  fill="none"
                  stroke={SERIE_BASE}
                  strokeOpacity={0.55}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  strokeLinecap="round"
                />
              )}
            </>
          )}
          <polygon points={area} fill={`url(#${id}-area)`} />
          <polyline
            points={linea(ptsHoy)}
            fill="none"
            stroke={SERIE_HOY}
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle cx={finHoy[0]} cy={finHoy[1]} r={5} fill={SERIE_HOY} stroke="#ffffff" strokeWidth={2} />
          <text x={finHoy[0] + 10} y={finHoy[1] + 4} className="fill-ink text-[12px] font-semibold">
            {dinero(hoy[ultimaHoy] ?? 0, moneda, false)}
          </text>
          {hora !== null && (
            <g pointerEvents="none">
              <line
                x1={x(hora)}
                x2={x(hora)}
                y1={M.arr}
                y2={H - M.aba}
                stroke="#2b2926"
                strokeOpacity={0.35}
                strokeWidth={1}
              />
              {hoy[hora] !== null && hora <= ultimaHoy && (
                <circle
                  cx={x(hora)}
                  cy={y(hoy[hora]!)}
                  r={4}
                  fill={SERIE_HOY}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              )}
              {base && (
                <circle
                  cx={x(hora)}
                  cy={y(base[hora])}
                  r={4}
                  fill={SERIE_BASE}
                  stroke="#ffffff"
                  strokeWidth={2}
                />
              )}
            </g>
          )}
        </svg>
        {hora !== null && (
          <Tooltip
            x={x(hora)}
            ancho={W}
            titulo={`Acumulado al cierre de ${hh(hora)}:59`}
            filas={[
              ...(hora <= ultimaHoy && hoy[hora] !== null
                ? [
                    {
                      color: SERIE_HOY,
                      etiqueta: 'Hoy',
                      valor: dinero(hoy[hora], moneda, false),
                      linea: true,
                    },
                  ]
                : [{ color: SERIE_HOY, etiqueta: 'Hoy (aún no llega)', valor: '—', linea: true }]),
              ...(base
                ? [
                    {
                      color: SERIE_BASE,
                      etiqueta: etiquetaBase,
                      valor: dinero(base[hora], moneda, false),
                      linea: true,
                    },
                  ]
                : []),
            ]}
          />
        )}
      </div>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="h-[3px] w-5 rounded-full"
            style={{ backgroundColor: SERIE_HOY }}
          />{' '}
          Hoy
        </span>
        {base && (
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-[2px] w-5 rounded-full"
              style={{ backgroundColor: SERIE_BASE }}
            />
            {etiquetaBase} (punteado: resto de ese día, referencia)
          </span>
        )}
      </figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-ink-2">Ver como tabla</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="tabla w-full">
            <caption className="sr-only">Venta acumulada al cierre de cada hora</caption>
            <thead>
              <tr>
                <th scope="col">Hora</th>
                <th scope="col" className="numero">
                  Hoy
                </th>
                {base && (
                  <th scope="col" className="numero">
                    {etiquetaBase}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filas.map((h) => (
                <tr key={h}>
                  <td>
                    {hh(h)}:00–{hh(h)}:59
                  </td>
                  <td className="numero">{hoy[h] === null ? '—' : dinero(hoy[h], moneda)}</td>
                  {base && <td className="numero">{dinero(base[h], moneda)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

type Hora = { pedidos: number; ventaCent: number };

/** Pedidos por hora: columnas pareadas hoy (azul) y semana pasada (gris). */
export function PedidosPorHora({
  hoy,
  base,
  horaCorte,
  etiquetaBase,
  moneda,
}: {
  hoy: Hora[];
  base: Hora[] | null;
  horaCorte: number;
  etiquetaBase: string;
  moneda: string;
}) {
  const hoyV = hoy.map((x, h) => (h <= horaCorte ? x.pedidos : null));
  const { desde, hasta } = rangoHoras([hoyV, base?.map((b) => b.pedidos) ?? []], horaCorte);
  const ticks = tickLimpio(Math.max(1, ...hoy.map((v) => v.pedidos), ...(base ?? []).map((v) => v.pedidos)));
  const max = ticks[2];
  const W = 720;
  const H = 220;
  const M = { izq: 36, der: 8, arr: 12, aba: 28 };
  const slot = (W - M.izq - M.der) / (hasta - desde + 1);
  const ancho = Math.min(14, (slot - 8) / 2);
  const centro = (h: number) => M.izq + (h - desde + 0.5) * slot;
  const y = (v: number) => H - M.aba - (v / max) * (H - M.arr - M.aba);
  // Columna con extremo superior redondeado (4px) y base recta.
  const columna = (cx: number, v: number) => {
    const top = y(v);
    const bottom = y(0);
    const r = Math.min(4, (bottom - top) / 2, ancho / 2);
    const l = cx - ancho / 2;
    const rr = l + ancho;
    if (bottom - top < 0.5) return '';
    return `M${l},${bottom} L${l},${top + r} Q${l},${top} ${l + r},${top} L${rr - r},${top} Q${rr},${top} ${rr},${top + r} L${rr},${bottom} Z`;
  };
  const { hora, props } = useHoraActiva(desde, hasta, centro, W, Math.min(horaCorte, hasta));
  const filas = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
  return (
    <figure className="space-y-3">
      <div className="relative">
        <svg
          {...props}
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Pedidos por hora de hoy frente a ${etiquetaBase}. Usa las flechas para recorrer las horas; la tabla tiene las cifras.`}
          className="h-auto w-full touch-pan-y rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={M.izq} x2={W - M.der} y1={y(t)} y2={y(t)} stroke="#e3ded4" strokeWidth={1} />
              <text x={M.izq - 8} y={y(t) + 4} textAnchor="end" className="fill-muted-foreground text-[11px]">
                {numero(t)}
              </text>
            </g>
          ))}
          {filas.map((h) => (
            <g key={h}>
              {hora === h && (
                <rect
                  x={centro(h) - slot / 2}
                  y={M.arr}
                  width={slot}
                  height={H - M.arr - M.aba}
                  fill="#efece5"
                  rx={4}
                />
              )}
              {base && <path d={columna(centro(h) - ancho / 2 - 1, base[h].pedidos)} fill={SERIE_BASE} />}
              {h <= horaCorte && (
                <path d={columna(centro(h) + ancho / 2 + 1, hoy[h].pedidos)} fill={SERIE_HOY} />
              )}
              {h % 2 === 0 && (
                <text
                  x={centro(h)}
                  y={H - 8}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[11px]"
                >
                  {hh(h)}
                </text>
              )}
            </g>
          ))}
        </svg>
        {hora !== null && (
          <Tooltip
            x={centro(hora)}
            ancho={W}
            titulo={`${hh(hora)}:00–${hh(hora)}:59`}
            filas={[
              {
                color: SERIE_HOY,
                etiqueta:
                  hora <= horaCorte
                    ? `Hoy · ${dinero(hoy[hora].ventaCent, moneda, false)}`
                    : 'Hoy (aún no llega)',
                valor: hora <= horaCorte ? `${numero(hoy[hora].pedidos)} ped.` : '—',
              },
              ...(base
                ? [
                    {
                      color: SERIE_BASE,
                      etiqueta: `${etiquetaBase} · ${dinero(base[hora].ventaCent, moneda, false)}`,
                      valor: `${numero(base[hora].pedidos)} ped.`,
                    },
                  ]
                : []),
            ]}
          />
        )}
      </div>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ backgroundColor: SERIE_HOY }} />{' '}
          Hoy
        </span>
        {base && (
          <span className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="size-2.5 rounded-sm"
              style={{ backgroundColor: SERIE_BASE }}
            />
            {etiquetaBase}
          </span>
        )}
      </figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-ink-2">Ver como tabla</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="tabla w-full">
            <caption className="sr-only">Pedidos y venta por hora</caption>
            <thead>
              <tr>
                <th scope="col">Hora</th>
                <th scope="col" className="numero">
                  Pedidos hoy
                </th>
                <th scope="col" className="numero">
                  Venta hoy
                </th>
                {base && (
                  <>
                    <th scope="col" className="numero">
                      Pedidos {etiquetaBase}
                    </th>
                    <th scope="col" className="numero">
                      Venta {etiquetaBase}
                    </th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filas.map((h) => (
                <tr key={h}>
                  <td>
                    {hh(h)}:00–{hh(h)}:59
                  </td>
                  <td className="numero">{h <= horaCorte ? numero(hoy[h].pedidos) : '—'}</td>
                  <td className="numero">{h <= horaCorte ? dinero(hoy[h].ventaCent, moneda) : '—'}</td>
                  {base && (
                    <>
                      <td className="numero">{numero(base[h].pedidos)}</td>
                      <td className="numero">{dinero(base[h].ventaCent, moneda)}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export interface Segmento {
  clave: string;
  etiqueta: string;
  color: string;
  ventaCent: number;
  pedidos: number;
  participacion: number | null;
}

/** Barra apilada al 100% con separación de 2px y leyenda con valores (los colores claros llevan etiqueta). */
export function BarraApilada({
  titulo,
  segmentos,
  moneda,
}: {
  titulo: string;
  segmentos: Segmento[];
  moneda: string;
}) {
  const [activo, setActivo] = useState<string | null>(null);
  const visibles = segmentos.filter((s) => (s.participacion ?? 0) > 0);
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-ink-2">{titulo}</p>
      <div
        className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-[4px]"
        role="img"
        aria-label={`${titulo}: ${visibles.map((s) => `${s.etiqueta} ${porcentaje(s.participacion, 0)}`).join(', ')}`}
      >
        {visibles.map((s) => (
          <span
            key={s.clave}
            onPointerEnter={() => setActivo(s.clave)}
            onPointerLeave={() => setActivo(null)}
            className="h-full transition-opacity"
            style={{
              width: `${(s.participacion ?? 0) * 100}%`,
              backgroundColor: s.color,
              opacity: activo && activo !== s.clave ? 0.35 : 1,
            }}
          />
        ))}
      </div>
      <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {segmentos.map((s) => (
          <li
            key={s.clave}
            onPointerEnter={() => setActivo(s.clave)}
            onPointerLeave={() => setActivo(null)}
            className={`flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm transition-colors ${activo === s.clave ? 'bg-surface-2' : ''}`}
          >
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-[3px]"
              style={{ backgroundColor: s.color }}
            />
            <span className="min-w-0 flex-1 truncate font-medium">{s.etiqueta}</span>
            <span className="tabular text-ink-2">
              {dinero(s.ventaCent, moneda, false)} · {numero(s.pedidos)} ped.
            </span>
            <span className="w-11 text-right tabular font-semibold">{porcentaje(s.participacion, 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Ranking con barra de magnitud (rampa azul) para "lo más vendido". */
export function Ranking({
  filas,
  moneda,
}: {
  filas: {
    clave: string;
    nombre: string;
    importeCent: number;
    lineas: number;
    participacion: number | null;
  }[];
  moneda: string;
}) {
  const max = Math.max(1, ...filas.map((f) => f.importeCent));
  return (
    <ol className="space-y-3">
      {filas.map((f, i) => (
        <li key={f.clave} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
          <span
            className="grid size-6 place-items-center rounded-full text-[11px] font-bold tabular"
            style={{
              backgroundColor: i === 0 ? AZUL.fuerte : AZUL.claro,
              color: i === 0 ? '#ffffff' : AZUL.profundo,
            }}
          >
            {i + 1}
          </span>
          <span className="truncate text-sm font-medium">{f.nombre}</span>
          <span className="text-right text-sm tabular">
            <span className="font-semibold">{dinero(f.importeCent, moneda, false)}</span>
            <span className="ml-2 text-xs text-muted-foreground">{porcentaje(f.participacion, 0)}</span>
          </span>
          <span />
          <span className="col-span-2 flex items-center gap-2">
            <span aria-hidden="true" className="block h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
              <span
                className="block h-full rounded-full"
                style={{ width: `${(f.importeCent / max) * 100}%`, backgroundColor: AZUL.fuerte }}
              />
            </span>
            <span className="w-16 text-right text-xs text-muted-foreground tabular">
              {numero(f.lineas)} lín.*
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
