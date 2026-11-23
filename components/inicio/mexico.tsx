'use client';
import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { ArrowUpRight, MapPinned } from 'lucide-react';
import { cn } from 'cn';
import type { TableroMexico } from '@/lib/sucursales/contratos';
import { etiquetaOrigen } from '@/lib/sucursales/metricas';
import { calcular } from '@/components/sucursales/tablero-mexico';
import { Cambio, Cifra, CurvaHoy } from '@/components/sucursales/graficas-mexico';
import { COLOR_ORIGEN } from '@/components/sucursales/colores';
import { useLectura } from '@/components/sucursales/use-lectura';
import { dinero, numero } from '@/components/sucursales/formato';
import { ESTILO_MODULO } from '@/components/portal/modulos-ui';
import { FalloBloque } from './bloque';
import './inicio.css';

const MXN = 'MXN';

/**
 * Tablero México en Inicio: las mismas cifras que /sucursales/mexico (mismo endpoint y mismo `calcular`), en vivo y
 * con todos los orígenes. Venta de hoy contra la semana pasada a la misma hora, curva del día, mezcla por origen y
 * las 5 sucursales que más venden. Se vuelve a leer cada 2 minutos solo con la pestaña visible (useLectura).
 */
export function MexicoResumen({ datosIniciales }: { datosIniciales?: TableroMexico }) {
  const { datos, error, recargar } = useLectura<TableroMexico>(
    datosIniciales ? null : '/api/sucursales/tablero?semanas=4',
    {
      intervaloMs: 120_000,
    },
  );
  const d = datosIniciales ?? datos;
  // La primera lectura del día puede pasar del tiempo límite (la base calcula en frío): se reintenta una vez sola.
  const reintentado = useRef(false);
  useEffect(() => {
    if (!error || d || reintentado.current || [401, 403, 404].includes(error.status)) return;
    reintentado.current = true;
    const t = setTimeout(recargar, 3000);
    return () => clearTimeout(t);
  }, [error, d, recargar]);
  const v = useMemo(() => (d ? calcular(d, 'todos') : null), [d]);
  const e = ESTILO_MODULO.sucursales;
  return (
    <section
      aria-label="Tablero México"
      className="luz-modulo relative overflow-hidden rounded-3xl p-5 shadow-card sm:p-6"
      style={{ '--tono': e.tono } as React.CSSProperties}
    >
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <span className={cn('grid size-10 place-items-center rounded-2xl text-primary-foreground', e.marca)}>
          <MapPinned size={19} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[1.05rem] leading-tight font-bold">Tablero México</span>
          <span className="block text-xs text-ink-2">
            {v
              ? `${v.momento.cuando === 'hoy' ? 'Hoy en vivo' : v.titulo} · ${numero(v.total)} sucursales`
              : 'Ventas de la red'}
          </span>
        </span>
        <Link
          href="/sucursales/mexico"
          className="inline-flex items-center gap-1 rounded-full border border-line-strong bg-surface/70 px-3 py-1.5 text-xs font-semibold text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
        >
          Ver tablero completo <ArrowUpRight size={13} aria-hidden="true" />
        </Link>
      </header>

      {error && !d ? (
        error.status === 404 || error.status === 403 ? (
          <p className="text-sm text-ink-2">Todavía no tienes sucursales asignadas en el Tablero México.</p>
        ) : (
          <div className="space-y-2">
            <FalloBloque texto="No se pudo leer el Tablero México." />
            <button type="button" onClick={recargar} className="text-sm font-semibold underline">
              Reintentar
            </button>
          </div>
        )
      ) : !v ? (
        <div
          role="status"
          aria-label="Cargando"
          className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]"
        >
          <div className="h-40 rounded-2xl bg-surface-2/70 motion-safe:animate-pulse" />
          <div className="h-40 rounded-2xl bg-surface-2/70 motion-safe:animate-pulse" />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.5fr)_minmax(0,1fr)]">
          {/* 1. La cifra del día */}
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-ink-2">{v.titulo}</p>
              <p className="font-display text-[3.2rem] leading-none font-black tracking-tight">
                <Cifra valor={v.hoy.venta} formato={(x) => dinero(Math.round(x), MXN, false)} />
              </p>
              {v.comparable && (
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-2">
                  <Cambio valor={v.comparable.venta} /> {v.comparable.sufijo}
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Dato valor={numero(v.hoy.pedidos)} etiqueta="pedidos" />
              <Dato
                valor={v.hoy.pedidos ? dinero(Math.round(v.hoy.venta / v.hoy.pedidos), MXN, false) : '—'}
                etiqueta="ticket"
              />
              <Dato valor={`${numero(v.conVenta)}/${numero(v.total)}`} etiqueta="con venta" />
            </div>
            <div>
              <div
                className="flex h-3 gap-[2px] overflow-hidden rounded-full bg-surface-2"
                role="img"
                aria-label="Venta por origen"
              >
                {v.mezcla
                  .filter((m) => m.venta > 0)
                  .map((m) => (
                    <span
                      key={m.origen}
                      style={{
                        width: `${(m.venta / Math.max(1, v.hoy.venta)) * 100}%`,
                        backgroundColor: COLOR_ORIGEN[m.origen],
                      }}
                    />
                  ))}
              </div>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {v.mezcla.map((m) => (
                  <li key={m.origen} className="flex items-center gap-1.5">
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-full"
                      style={{ backgroundColor: COLOR_ORIGEN[m.origen] }}
                    />
                    {etiquetaOrigen[m.origen]}
                    <span className="font-semibold tabular">
                      {v.hoy.venta ? Math.round((m.venta / v.hoy.venta) * 100) : 0} %
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 2. La curva del día contra la semana pasada */}
          <div className="min-w-0 rounded-2xl border border-line/60 bg-surface/35 p-3">
            <p className="mb-1 text-xs font-semibold text-ink-2">Venta acumulada · hoy vs {v.dia}</p>
            <CurvaHoy
              hoy={v.ventaTramo}
              base={v.baseVentaTramo}
              hastaTramo={v.hastaTramo}
              etiquetaBase={v.dia}
              paso={v.paso}
              cerrado={v.modo !== 'vivo'}
              corto={v.momento.corto}
            />
          </div>

          {/* 3. Las 5 que más venden */}
          <div className="min-w-0">
            <p className="mb-2 text-xs font-semibold text-ink-2">Las 5 que más venden</p>
            {v.top.length === 0 ? (
              <p className="text-sm text-ink-2">Sin ventas todavía.</p>
            ) : (
              <ol className="space-y-2">
                {v.top.map((s, i) => (
                  <li
                    key={s.companyId}
                    className="grid grid-cols-[1.6rem_minmax(0,1fr)_auto] items-center gap-2"
                  >
                    <span
                      className={cn(
                        'font-display text-xl leading-none font-black',
                        i === 0 ? 'text-ventas' : 'text-ink-2',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <Link
                        href={`/sucursales/${s.companyId}`}
                        className="block truncate text-sm font-semibold hover:underline"
                      >
                        {s.nombre}
                      </Link>
                      <span className="mt-1 block h-1.5 rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-ventas"
                          style={{ width: `${(s.venta / Math.max(1, v.top[0].venta)) * 100}%` }}
                        />
                      </span>
                    </span>
                    <span className="text-right text-sm font-semibold tabular">
                      {dinero(s.venta, MXN, false)}
                      <span className="block">
                        <Cambio valor={s.delta} />
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function Dato({ valor, etiqueta }: { valor: string; etiqueta: string }) {
  return (
    <div className="rounded-2xl border border-line/60 bg-surface/35 px-3 py-2">
      <p className="font-display text-base leading-tight font-black tabular">{valor}</p>
      <p className="text-[11px] text-ink-2">{etiqueta}</p>
    </div>
  );
}
