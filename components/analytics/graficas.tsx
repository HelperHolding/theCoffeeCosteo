'use client';
import { useId, useState } from 'react';
import { COLOR_ORIGEN } from '@/components/sucursales/colores';
import { Tooltip } from '@/components/sucursales/graficas';
import { dinero, numero } from '@/components/sucursales/formato';
import {
  TEXTO_ESTADO,
  type CeldaCobertura,
  type DiaTablero,
  type EstadoDiaTablero,
  type FilaTienda,
} from '@/lib/analytics/tablero';

/**
 * Gráficas de Analytics (skill dataviz). Mismos colores de ENTIDAD que Sucursales: mostrador morado, app naranja
 * (par validado con validate_palette.js: PASS en todas las pruebas). Columnas con extremo redondeado de 4px y
 * 2px de superficie entre segmentos; el día provisional o parcial lleva textura rayada (no solo color);
 * texto siempre en tinta; tooltip en hover y en foco de teclado; las tablas de detalle tienen todas las cifras.
 */
const MOSTRADOR = COLOR_ORIGEN.mostrador;
const APP = COLOR_ORIGEN.app;

const corto = (cent: number) => {
  const p = cent / 100;
  if (p >= 1_000_000) return `$${(p / 1_000_000).toLocaleString('es-MX', { maximumFractionDigits: 2 })} M`;
  if (p >= 1_000) return `$${Math.round(p / 1_000).toLocaleString('es-MX')} mil`;
  return dinero(cent, 'MXN', false);
};
const dia = (f: string, formato: 'corto' | 'largo') =>
  new Intl.DateTimeFormat('es-MX', {
    weekday: formato === 'corto' ? 'short' : 'long',
    day: 'numeric',
    ...(formato === 'largo' ? { month: 'long' } : {}),
    timeZone: 'UTC',
  })
    .format(new Date(`${f}T12:00:00Z`))
    .replace('.', '');

export function Leyenda({ conTextura = true }: { conTextura?: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-2">
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="size-3 rounded-[3px]" style={{ backgroundColor: MOSTRADOR }} />
        Mostrador
      </li>
      <li className="flex items-center gap-2">
        <span aria-hidden="true" className="size-3 rounded-[3px]" style={{ backgroundColor: APP }} />
        App
      </li>
      {conTextura && (
        <li className="flex items-center gap-2 text-muted-foreground">
          <span aria-hidden="true" className="textura-provisional size-3 rounded-[3px]" />
          Rayado: día abierto o lectura parcial
        </li>
      )}
    </ul>
  );
}

/** Columnas apiladas lunes a domingo (mostrador abajo, app arriba). La pieza principal del tablero. */
export function SemanaColumnas({ dias }: { dias: DiaTablero[] }) {
  const id = useId();
  const [activa, setActiva] = useState<number | null>(null);
  const W = 760;
  const H = 300;
  const M = { izq: 8, der: 8, arr: 34, aba: 46 };
  const slot = (W - M.izq - M.der) / dias.length;
  const ancho = Math.min(64, slot * 0.58);
  const max = Math.max(1, ...dias.map((d) => d.resumen?.venta_cent ?? 0));
  const y = (v: number) => H - M.aba - (v / max) * (H - M.arr - M.aba);
  const base = y(0);
  const con = (i: number) => M.izq + (i + 0.5) * slot;
  const rayado = (e: EstadoDiaTablero) => e === 'provisional' || e === 'parcial' || e === 'pendiente-cierre';

  /** Segmento con extremo superior redondeado solo si es la cima de la pila. */
  const segmento = (l: number, arriba: number, abajo: number, cima: boolean) => {
    const alto = abajo - arriba;
    if (alto <= 0.5) return '';
    const r = cima ? Math.min(4, alto / 2) : 0;
    return `M${l},${abajo} L${l},${arriba + r} Q${l},${arriba} ${l + r},${arriba} L${l + ancho - r},${arriba} Q${l + ancho},${arriba} ${l + ancho},${arriba + r} L${l + ancho},${abajo} Z`;
  };

  const d = activa === null ? null : dias[activa];
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div className="relative min-w-[540px]">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label="Ventas con IVA por día de la semana, mostrador y app. Las cifras exactas están en la tabla por día."
          className="h-auto w-full overflow-visible"
        >
          <defs>
            <pattern
              id={`${id}-raya`}
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="7" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="2.5" />
            </pattern>
            <pattern
              id={`${id}-vacio`}
              width="7"
              height="7"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="7" height="7" fill="#f6f4ef" />
              <line x1="0" y1="0" x2="0" y2="7" stroke="#e3ded4" strokeWidth="2" />
            </pattern>
          </defs>
          {[0.5, 1].map((p) => (
            <line
              key={p}
              x1={M.izq}
              x2={W - M.der}
              y1={y(max * p)}
              y2={y(max * p)}
              stroke="#efece5"
              strokeDasharray="2 4"
            />
          ))}
          <line x1={M.izq} x2={W - M.der} y1={base} y2={base} stroke="#cfc8ba" />
          {dias.map((x, i) => {
            const cx = con(i);
            const l = cx - ancho / 2;
            const c = x.canales;
            const total = x.resumen?.venta_cent ?? 0;
            const conDatos = !!c && total > 0;
            const yApp = conDatos ? y(total) : base;
            const yMostrador = conDatos ? y(c!.mostrador_cent) : base;
            const vacio = !x.resumen;
            return (
              <g
                key={x.fecha}
                tabIndex={0}
                aria-label={`${dia(x.fecha, 'largo')}: ${TEXTO_ESTADO[x.estado]}${
                  x.resumen ? `, ${dinero(x.resumen.venta_cent)}` : ''
                }`}
                onPointerEnter={() => setActiva(i)}
                onPointerLeave={() => setActiva(null)}
                onFocus={() => setActiva(i)}
                onBlur={() => setActiva(null)}
                className="outline-none focus-visible:[&>rect:first-child]:stroke-crema"
              >
                <rect
                  x={cx - slot / 2 + 2}
                  y={M.arr - 26}
                  width={slot - 4}
                  height={H - M.arr - M.aba + 26}
                  rx={10}
                  fill={activa === i ? '#f6f4ef' : 'transparent'}
                  stroke="transparent"
                  strokeWidth={2}
                />
                {conDatos && (
                  <>
                    <path d={segmento(l, yMostrador, base, c!.app_cent <= 0)} fill={MOSTRADOR} />
                    {c!.app_cent > 0 && <path d={segmento(l, yApp, yMostrador - 2, true)} fill={APP} />}
                    {rayado(x.estado) && <path d={segmento(l, yApp, base, true)} fill={`url(#${id}-raya)`} />}
                    <text
                      x={cx}
                      y={yApp - 10}
                      textAnchor="middle"
                      className="fill-ink text-[13px] font-semibold tabular"
                    >
                      {corto(total)}
                    </text>
                  </>
                )}
                {vacio && (
                  <>
                    <rect
                      x={l}
                      y={base - 46}
                      width={ancho}
                      height={46}
                      rx={4}
                      fill={x.estado === 'futuro' ? 'transparent' : `url(#${id}-vacio)`}
                      stroke={x.estado === 'futuro' ? '#cfc8ba' : 'none'}
                      strokeDasharray="3 4"
                    />
                    <text
                      x={cx}
                      y={base - 56}
                      textAnchor="middle"
                      className="fill-muted-foreground text-[12px]"
                    >
                      {x.estado === 'futuro' ? 'por venir' : 'sin lectura'}
                    </text>
                  </>
                )}
                {x.resumen && !conDatos && (
                  <text
                    x={cx}
                    y={base - 10}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[12px]"
                  >
                    sin ventas
                  </text>
                )}
                <text x={cx} y={H - 24} textAnchor="middle" className="fill-ink-2 text-[13px] font-medium">
                  {dia(x.fecha, 'corto')}
                </text>
                {x.estado !== 'futuro' && x.estado !== 'cerrado' && (
                  <text x={cx} y={H - 8} textAnchor="middle" className="fill-warn text-[11px] font-semibold">
                    {x.estado === 'sin-lectura' ? '' : TEXTO_ESTADO[x.estado].toLowerCase()}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {d && d.resumen && d.canales && (
          <Tooltip
            x={con(activa!)}
            ancho={W}
            titulo={`${dia(d.fecha, 'largo')} · ${TEXTO_ESTADO[d.estado]}`}
            filas={[
              { color: MOSTRADOR, etiqueta: 'mostrador', valor: dinero(d.canales.mostrador_cent) },
              { color: APP, etiqueta: 'app', valor: dinero(d.canales.app_cent) },
              {
                color: '#2b2926',
                etiqueta: `en ${numero(d.resumen.tickets)} tickets`,
                valor: dinero(d.resumen.venta_cent),
              },
            ]}
          />
        )}
      </div>
    </div>
  );
}

const nombreCorto = (n: string) => n.replace(/^the coffee\s+/i, '');

/** Ranking de tiendas: barras horizontales apiladas por canal, con el valor en tinta a la derecha. */
export function RankingTiendas({ tiendas, visibles = 12 }: { tiendas: FilaTienda[]; visibles?: number }) {
  const [todas, setTodas] = useState(false);
  const conVenta = tiendas.filter((t) => (t.resumen?.venta_cent ?? 0) > 0);
  const resto = tiendas.length - conVenta.length;
  const lista = todas ? conVenta : conVenta.slice(0, visibles);
  const max = Math.max(1, ...conVenta.map((t) => t.resumen!.venta_cent));
  const totalRed = conVenta.reduce((s, t) => s + t.resumen!.venta_cent, 0);
  return (
    <div>
      <ol className="space-y-2.5">
        {lista.map((t, i) => {
          const c = t.canales!;
          const r = t.resumen!;
          return (
            <li
              key={t.company_id}
              className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[1.75rem_minmax(0,13rem)_1fr_auto] sm:gap-y-0"
            >
              <span className="text-right text-xs text-muted-foreground tabular">{i + 1}</span>
              <span className="truncate text-sm font-medium" title={t.nombre}>
                {nombreCorto(t.nombre)}
              </span>
              <span
                className="order-last col-span-2 col-start-2 flex h-3 min-w-0 gap-[2px] sm:order-none sm:col-span-1 sm:col-start-auto sm:h-3.5"
                role="img"
                aria-label={`Mostrador ${dinero(c.mostrador_cent)}, app ${dinero(c.app_cent)}`}
              >
                <span
                  className="h-full rounded-l-[4px] last:rounded-r-[4px]"
                  style={{ width: `${(c.mostrador_cent / max) * 100}%`, backgroundColor: MOSTRADOR }}
                />
                {c.app_cent > 0 && (
                  <span
                    className="h-full rounded-r-[4px]"
                    style={{ width: `${(c.app_cent / max) * 100}%`, backgroundColor: APP }}
                  />
                )}
              </span>
              <span className="text-right text-sm tabular">
                <span className="font-semibold">{corto(r.venta_cent)}</span>
                <span className="ml-2 hidden text-xs text-muted-foreground sm:inline">
                  {((r.venta_cent / totalRed) * 100).toLocaleString('es-MX', { maximumFractionDigits: 1 })} %
                </span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-muted-foreground">
          {conVenta.length} tiendas con venta{resto > 0 ? ` · ${resto} sin venta o sin lectura` : ''}
        </p>
        {conVenta.length > visibles && (
          <button
            type="button"
            onClick={() => setTodas((v) => !v)}
            aria-expanded={todas}
            className="rounded-[10px] border border-line px-3 py-1.5 font-medium hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {todas ? `Ver solo las ${visibles} primeras` : `Ver las ${conVenta.length}`}
          </button>
        )}
      </div>
    </div>
  );
}

const CELDA: Record<CeldaCobertura, { clase: string; texto: string }> = {
  ventas: { clase: 'bg-ink-2', texto: 'leída, con ventas' },
  'sin-ventas': { clase: 'border border-line-strong bg-surface', texto: 'leída, sin ventas' },
  'sin-lectura': { clase: 'textura-sin-lectura', texto: 'sin lectura' },
};

/** Una fila por día transcurrido, una celda por tienda (orden del ranking). Sin lectura ≠ sin ventas. */
export function MatrizCobertura({
  cobertura,
  tiendas,
}: {
  cobertura: { fecha: string; celdas: CeldaCobertura[] }[];
  tiendas: FilaTienda[];
}) {
  if (!cobertura.length)
    return <p className="text-sm text-muted-foreground">Aún no transcurre ningún día de esta semana.</p>;
  return (
    <div className="space-y-4">
      {cobertura.map((c) => {
        const n = (k: CeldaCobertura) => c.celdas.filter((x) => x === k).length;
        return (
          <div key={c.fecha}>
            <p className="mb-1.5 flex justify-between text-sm">
              <span className="font-medium">{dia(c.fecha, 'corto')}</span>
              <span className="tabular text-muted-foreground">
                {c.celdas.length - n('sin-lectura')} de {c.celdas.length} leídas
              </span>
            </p>
            <div
              className="flex flex-wrap gap-[3px]"
              role="img"
              aria-label={`${n('ventas')} con ventas, ${n('sin-ventas')} sin ventas, ${n('sin-lectura')} sin lectura`}
            >
              {c.celdas.map((x, i) => (
                <span
                  key={tiendas[i].company_id}
                  title={`${nombreCorto(tiendas[i].nombre)}: ${CELDA[x].texto}`}
                  className={`size-2.5 rounded-[2px] ${CELDA[x].clase}`}
                />
              ))}
            </div>
          </div>
        );
      })}
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {(Object.keys(CELDA) as CeldaCobertura[]).map((k) => (
          <li key={k} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-2.5 rounded-[2px] ${CELDA[k].clase}`} />
            {CELDA[k].texto}
          </li>
        ))}
      </ul>
    </div>
  );
}
