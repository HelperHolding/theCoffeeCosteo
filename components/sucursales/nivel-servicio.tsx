'use client';
import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { cn } from 'cn';
import type { SucursalInfo } from '@/lib/sucursales/contratos';
import {
  TIPOS_RECHAZO,
  TIPOS_RECLAMO,
  nombreTop,
  type CanalServicio,
  type RespuestaServicio,
  type TipoReclamo,
  type TipoRechazo,
  type Totales,
} from '@/lib/sucursales/servicio';
import { hojasServicio } from '@/lib/sucursales/servicio-excel';
import { Tarjeta, Vacio } from '@/components/portal/piezas';
import { ErrorCarga, Esqueleto } from './estados';
import { AZUL } from './colores';
import { Tooltip } from './graficas';
import { diaMes, fechaCorta, hace, horaDe, numero, porcentaje } from './formato';
import { sumarDias } from '@/lib/sucursales/tiempo';
import { rango, SelectorPeriodo, type Periodo } from './periodo';
import { useLectura } from './use-lectura';
import { ApartadosServicio, MenuRappi, apartadoDeUrl, type Apartado } from './menu-rappi';
import './nivel-servicio.css';

/**
 * Sección «Nivel de servicio» de una sucursal (docs/rappi-portal/08): Rappi y Rappi Turbo leídos del portal de Partners.
 * Responde una pregunta: ¿cómo está atendiendo esta sucursal en Rappi? Arriba el estado en vivo; luego los indicadores
 * del periodo (los de Rappi, sumados), el día por día, la conectividad (cinta por día, la jugada firma) y los reclamos.
 * Skills frontend-design y dataviz: un solo contenedor de KPIs, marcas finas, color solo en las marcas y nunca solo.
 */
export const CANAL: Record<CanalServicio, string> = { normal: 'Rappi', turbo: 'Rappi Turbo' };
export const COLOR_RECLAMO: Record<TipoReclamo, string> = {
  incorrecto: 'var(--recl-incorrecto)',
  faltante: 'var(--recl-faltante)',
  mal_estado: 'var(--recl-mal-estado)',
};
// Orden fijo de las series (el color sigue al tipo, nunca al rango).
export const ORDEN_RECLAMO: TipoReclamo[] = ['incorrecto', 'faltante', 'mal_estado'];
const ORDEN_RECHAZO = Object.keys(TIPOS_RECHAZO) as TipoRechazo[];

export const minutos = (m: number | null) => {
  if (m === null) return '—';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
};
export const decimal = (x: number | null, d = 1) =>
  x === null ? '—' : x.toLocaleString('es-MX', { minimumFractionDigits: d, maximumFractionDigits: d });
/**
 * Parte del horario sin disponibilidad (%): 100 − disponibilidad promedio, el dato que Rappi sí manda (su portal lo
 * muestra así). Los minutos llegan vacíos del portal, así que no pueden ser el número principal.
 */
export const sinDisponibilidad = (t: Totales) =>
  t.disponibilidad === null ? null : Math.max(0, 100 - t.disponibilidad);

export function SeccionServicio({
  sucursal,
  periodo,
  alCambiarPeriodo,
}: {
  sucursal: SucursalInfo;
  periodo: Periodo;
  alCambiarPeriodo: (p: Periodo) => void;
}) {
  const { desde, hasta } = rango(periodo, sucursal.zona);
  // Rappi publica cada día con 1 a 2 días de retraso: la sección abre en el último día que ya publicó (el periodo
  // compartido no cambia). Al elegir otro periodo se usa ese.
  const [ultimo, setUltimo] = useState(true);
  // Apartado Servicio o Menú en Rappi (docs/rappi-portal/09), de la URL al montar: así no se lee lo que no se ve.
  const [apartado, setApartado] = useState<Apartado | null>(null);
  useEffect(() => setApartado(apartadoDeUrl()), []);
  // La conectividad se fotografía cada 10 min y los indicadores cada hora: se refresca cada 5 min, así que el último
  // día con datos avanza solo cuando Rappi publica el siguiente.
  const { datos, error, cargando, recargar } = useLectura<RespuestaServicio>(
    apartado !== 'servicio'
      ? null
      : ultimo
        ? `/api/sucursales/${sucursal.companyId}/servicio?ultimo=1`
        : `/api/sucursales/${sucursal.companyId}/servicio?desde=${desde}&hasta=${hasta}`,
    { intervaloMs: 5 * 60_000 },
  );
  const descargar = async () => {
    if (!datos) return;
    const h = hojasServicio({ ...datos, hasta: datos.indicadoresHasta ?? datos.hasta }, sucursal.nombre);
    const XLSX = await import('xlsx');
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(h.resumen), 'Resumen');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(h.dias), 'Por día');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(h.porCanal), 'Por tienda');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(h.reclamos), 'Reclamos');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(h.conectividad), 'Conectividad');
    XLSX.writeFile(libro, h.nombreArchivo);
  };
  return (
    <div className="servicio space-y-6" aria-busy={apartado === 'servicio' && cargando}>
      <ApartadosServicio activo={apartado ?? 'servicio'} alCambiar={setApartado} />
      {apartado === 'menu' ? (
        <MenuRappi companyId={sucursal.companyId} />
      ) : apartado === null ? (
        <Esqueleto filas={3} />
      ) : (
        <>
          <div className="placa flex flex-wrap items-end justify-between gap-3 p-3">
            <SelectorPeriodo
              periodo={periodo}
              zona={sucursal.zona}
              alCambiar={(p) => {
                setUltimo(false);
                alCambiarPeriodo(p);
              }}
              ultimo={{
                activo: ultimo,
                fecha: datos?.publicadoHasta ?? null,
                alElegir: () => setUltimo(true),
              }}
            />
            <button
              type="button"
              onClick={descargar}
              disabled={!datos}
              className="inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"
            >
              <Download size={15} aria-hidden="true" />
              Descargar Excel
            </button>
            {datos && (
              <AlDiaRappi
                publicadoHasta={datos.publicadoHasta}
                hasta={datos.hasta}
                indicadoresHasta={datos.indicadoresHasta}
                ultimo={ultimo}
              />
            )}
          </div>
          {!datos ? (
            error ? (
              <ErrorCarga error={error} alReintentar={recargar} />
            ) : (
              <Esqueleto filas={3} />
            )
          ) : (
            <>
              {error && <ErrorCarga error={error} alReintentar={recargar} />}
              <AhoraEnRappi d={datos} zona={sucursal.zona} />
              {/* Sin días de Rappi no hay indicadores: no se muestran ceros que parezcan datos. */}
              {datos.dias.length > 0 && (
                <Indicadores
                  titulo={`${tituloPeriodo(datos.desde, datos.indicadoresHasta ?? datos.hasta)} en Rappi`}
                  t={datos.totales}
                >
                  <PorCanal d={datos} />
                </Indicadores>
              )}
              {datos.dias.length === 0 ? (
                <SinPublicar
                  desde={datos.desde}
                  hasta={datos.hasta}
                  publicadoHasta={datos.publicadoHasta}
                  alVerUltimo={ultimo ? undefined : () => setUltimo(true)}
                />
              ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                  <ReclamosPorDia d={datos} />
                  <SinDisponibilidadPorDia d={datos} />
                </div>
              )}
              <Conectividad d={datos} zona={sucursal.zona} />
              <Reclamos d={datos} />
              <p className="placa px-3 py-2 text-xs text-muted-foreground">
                Fuente: Nivel de servicio y Conectividad del portal de Rappi Partners, leídos cada 10 min
                (conectividad) y cada hora (indicadores). Rappi publica los indicadores de cada día con 1 a 2
                días de retraso; el cierre de las 5:07 vuelve a leer los últimos 7 días porque Rappi corrige
                tarde.
                {datos.diasEnHoraCentro &&
                  ' Rappi cuenta los días en hora del centro: el corte del día no coincide con la hora local; las horas de conectividad sí van en hora local.'}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Hasta qué día publicó Rappi ─────────────────────────────────────────────────────────────────────────────────
/** Leyenda bajo el selector: hasta qué día hay datos y, si el periodo va más allá, desde cuándo faltan. */
export function AlDiaRappi({
  publicadoHasta,
  hasta,
  indicadoresHasta,
  ultimo,
}: {
  publicadoHasta: string | null | undefined;
  hasta: string;
  indicadoresHasta: string | null | undefined;
  /** En «Último día con datos» no hace falta decir qué días faltan. */
  ultimo?: boolean;
}) {
  // Sin el dato (lectura fallida o respuesta vieja) no se dice nada que no se sepa.
  if (publicadoHasta === undefined) return null;
  return (
    <p className="basis-full text-xs text-muted-foreground" aria-live="polite">
      {publicadoHasta ? (
        <>
          Datos de Rappi actualizados hasta el{' '}
          <span className="font-semibold text-ink-2">{fechaCorta(publicadoHasta)}</span>.
        </>
      ) : (
        'Rappi todavía no publica datos de nivel de servicio.'
      )}{' '}
      Rappi publica cada día con 1 a 2 días de retraso; esta vista avanza sola cuando llega el siguiente.
      {!ultimo && publicadoHasta && indicadoresHasta && hasta > publicadoHasta
        ? ` Del ${diaMes(sumarDias(publicadoHasta, 1))} en adelante todavía no hay datos.`
        : ''}
    </p>
  );
}

/** Periodo que Rappi aún no publica: lo dice, sin ceros que parezcan datos, y lleva al último día con datos. */
export function SinPublicar({
  desde,
  hasta,
  publicadoHasta,
  alVerUltimo,
}: {
  desde: string;
  hasta: string;
  publicadoHasta: string | null | undefined;
  alVerUltimo?: () => void;
}) {
  const pendiente = !!publicadoHasta && desde > publicadoHasta;
  return (
    <div className="rounded-2xl border border-line bg-surface shadow-card">
      <Vacio
        titulo={
          pendiente
            ? `Rappi todavía no publica ${desde === hasta ? 'el' : 'del'} ${tituloPeriodo(desde, hasta)}`
            : 'Sin indicadores de Rappi en el periodo'
        }
      >
        {pendiente
          ? `Los datos llegan hasta el ${fechaCorta(publicadoHasta!)}.`
          : 'Rappi todavía no publica datos de estos días. Elige otro periodo.'}
        {alVerUltimo && publicadoHasta && (
          <button
            type="button"
            onClick={alVerUltimo}
            className="ml-2 mt-3 inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Ver el {fechaCorta(publicadoHasta)}
          </button>
        )}
      </Vacio>
    </div>
  );
}

// ── Ahora en Rappi ───────────────────────────────────────────────────────────────────────────────────────────────
function AhoraEnRappi({ d, zona }: { d: RespuestaServicio; zona: string }) {
  const ahora = Date.now();
  return (
    <section aria-label="Ahora en Rappi" className="rounded-2xl border border-line bg-surface shadow-card">
      <ul className="grid divide-y divide-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {d.canales.map((c) => {
          const a = c.ahora;
          const viejo = a ? (ahora - new Date(a.visto).getTime()) / 1000 : null;
          const atrasada = viejo !== null && viejo > 30 * 60;
          return (
            <li
              key={c.canal}
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{CANAL[c.canal]}</p>
                {a ? (
                  <p className="mt-1 flex items-center gap-2 font-display text-lg font-bold">
                    <span
                      aria-hidden="true"
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: a.activa ? 'var(--color-ok)' : 'var(--color-bad)' }}
                    />
                    {a.activa ? 'Activa' : 'Desactivada'}
                    <span className="text-sm font-normal text-ink-2">
                      {a.activa ? (a.cierra ? `cierra a las ${a.cierra}` : '') : (a.motivo ?? a.estadoRappi)}
                    </span>
                  </p>
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">Sin foto de conectividad todavía</p>
                )}
                {a && (
                  <p
                    className={cn(
                      'mt-0.5 text-xs',
                      atrasada ? 'text-[var(--color-warn)]' : 'text-muted-foreground',
                    )}
                  >
                    Así desde las {horaDe(new Date(a.desde).getTime(), zona)} · última foto{' '}
                    {hace(Math.max(0, Math.round(viejo!)))}
                    {atrasada && ' (el lector no ha confirmado el estado reciente)'}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Top Restaurantes</p>
                <p className="mt-1 text-sm font-semibold">{nombreTop(c.top?.categoria ?? null) ?? '—'}</p>
                {c.top?.proxima && c.top.proxima !== c.top.categoria && (
                  <p className="text-xs text-muted-foreground">próxima: {nombreTop(c.top.proxima)}</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// ── Indicadores del periodo ─────────────────────────────────────────────────────────────────────────────────────
/** Título del periodo: «vie 20 nov» o «14 nov a 20 nov». */
export const tituloPeriodo = (desde: string, hasta: string) =>
  desde === hasta ? fechaCorta(desde) : `${diaMes(desde)} a ${diaMes(hasta)}`;

/** Indicadores del periodo en un solo contenedor; `children` va debajo (la tabla por tienda o por canal). */
export function Indicadores({
  titulo,
  t,
  children,
}: {
  titulo: string;
  t: Totales;
  children?: React.ReactNode;
}) {
  const sinDisp = sinDisponibilidad(t);
  const hallazgo = [
    t.tasaReclamos !== null ? `Reclamos en ${porcentaje(t.tasaReclamos)} de los pedidos finalizados` : null,
    sinDisp ? `${decimal(sinDisp, 2)} % del horario sin disponibilidad` : null,
    t.rechazosTotal ? `${numero(t.rechazosTotal)} rechazos` : null,
  ].filter(Boolean);
  const celdas: { titulo: string; valor: string; detalle: string }[] = [
    { titulo: 'Pedidos', valor: numero(t.pedidos), detalle: `${numero(t.finalizados)} finalizados` },
    {
      titulo: 'Reclamos',
      valor: numero(t.reclamosTotal),
      detalle: `${porcentaje(t.tasaReclamos)} de finalizados`,
    },
    {
      titulo: 'Rechazos y cancelaciones',
      valor: numero(t.rechazosTotal),
      detalle: `${porcentaje(t.tasaRechazos)} de creados`,
    },
    {
      // Rappi da el porcentaje del horario (como su portal); los minutos solo si los trae.
      titulo: 'Sin disponibilidad',
      valor: sinDisp === null ? '—' : `${decimal(sinDisp, 2)} %`,
      detalle:
        sinDisp === null
          ? '—'
          : t.sinDispMinutos
            ? `del horario (${minutos(t.sinDispMinutos)} en total)`
            : 'del horario, promedio de los días',
    },
    {
      titulo: 'Espera del repartidor',
      valor: t.espera === null ? '—' : `${decimal(t.espera)} min`,
      detalle: 'promedio por pedido finalizado',
    },
    {
      titulo: 'Cocina demorada',
      valor: porcentaje(t.tasaCocina),
      detalle: `${numero(t.cocinaDemorada)} de ${numero(t.cocinaPedidos)} pedidos`,
    },
  ];
  return (
    <section
      aria-labelledby="indicadores-servicio"
      className="rounded-2xl border border-line bg-surface shadow-card"
    >
      <header className="px-5 pt-5">
        <h2 id="indicadores-servicio">{titulo}</h2>
        <p className="mt-1 text-sm text-ink-2">
          {hallazgo.length ? hallazgo.join(' · ') : 'Sin reclamos, rechazos ni tiempo sin disponibilidad.'}
        </p>
      </header>
      <dl className="mt-4 grid grid-cols-2 border-t border-line md:grid-cols-3 xl:grid-cols-6">
        {celdas.map((c, i) => (
          <div
            key={c.titulo}
            className={cn(
              'border-line px-5 py-4',
              i % 2 === 1 && 'border-l',
              'md:border-l-0 md:[&:not(:nth-child(3n+1))]:border-l',
              'xl:[&:not(:first-child)]:border-l',
              i >= 2 && 'border-t md:border-t-0',
              i >= 3 && 'md:border-t xl:border-t-0',
            )}
          >
            <dt className="text-xs text-muted-foreground">{c.titulo}</dt>
            <dd className="mt-1 whitespace-nowrap font-display text-[22px] font-black sm:text-[26px] leading-none tabular text-ink">
              {c.valor}
            </dd>
            <dd className="mt-1.5 text-xs text-muted-foreground">{c.detalle}</dd>
          </div>
        ))}
      </dl>
      {children}
    </section>
  );
}

/** Rappi y Turbo lado a lado, con los rechazos por tipo: el detalle que el portal reparte en varias pantallas. */
function PorCanal({ d }: { d: RespuestaServicio }) {
  const canales = (Object.entries(d.porCanal) as [CanalServicio, Totales][]).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  if (!canales.length) return null;
  return (
    <div className="relative overflow-x-auto border-t border-line">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="sr-only">
          Indicadores por tienda (Rappi y Rappi Turbo) y rechazos por tipo
        </caption>
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="px-5 py-2 font-medium">Tienda</th>
            <th className="px-3 py-2 text-right font-medium">Pedidos</th>
            <th className="px-3 py-2 text-right font-medium">Reclamos</th>
            {ORDEN_RECHAZO.map((k) => (
              <th key={k} className="px-3 py-2 text-right font-medium">
                {TIPOS_RECHAZO[k]}
              </th>
            ))}
            <th className="px-5 py-2 text-right font-medium">Espera</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {canales.map(([c, t]) => (
            <tr key={c} className="border-t border-line">
              <th scope="row" className="px-5 py-2 text-left font-semibold">
                {CANAL[c]}
              </th>
              <td className="px-3 py-2 text-right">{numero(t.pedidos)}</td>
              <td className="px-3 py-2 text-right">
                {numero(t.reclamosTotal)}{' '}
                <span className="text-xs text-muted-foreground">{porcentaje(t.tasaReclamos)}</span>
              </td>
              {ORDEN_RECHAZO.map((k) => (
                <td key={k} className={cn('px-3 py-2 text-right', !t.rechazos[k] && 'text-muted-foreground')}>
                  {numero(t.rechazos[k])}
                </td>
              ))}
              <td className="px-5 py-2 text-right">{t.espera === null ? '—' : `${decimal(t.espera)} min`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Día por día ─────────────────────────────────────────────────────────────────────────────────────────────────
/** Columnas por día con hover y foco de teclado (←/→); el tooltip es el de las demás gráficas de Sucursales. */
export function Columnas({
  titulo,
  descripcion,
  leyenda,
  dias,
  partes,
  formatear,
  filas,
}: {
  titulo: string;
  descripcion: string;
  leyenda: { color: string; nombre: string }[];
  dias: { fecha: string; valores: number[] }[];
  partes: { color: string; nombre: string }[];
  formatear: (n: number) => string;
  filas: (i: number) => { color: string; etiqueta: string; valor: string }[];
}) {
  const [activo, setActivo] = useState<number | null>(null);
  const max = Math.max(1, ...dias.map((x) => x.valores.reduce((a, b) => a + b, 0)));
  const n = dias.length;
  return (
    <Tarjeta titulo={titulo} descripcion={descripcion}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        {leyenda.length > 1 ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Leyenda">
            {leyenda.map((l) => (
              <li key={l.nombre} className="flex items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="size-2.5 rounded-[3px]"
                  style={{ backgroundColor: l.color }}
                />
                {l.nombre}
              </li>
            ))}
          </ul>
        ) : (
          <span />
        )}
        <p className="text-[11px] text-muted-foreground tabular">máx. {formatear(max)}</p>
      </div>
      <div
        className="relative"
        role="group"
        aria-label={`${titulo}: usa ← y → para recorrer los días`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') setActivo((a) => Math.min(n - 1, (a ?? -1) + 1));
          if (e.key === 'ArrowLeft') setActivo((a) => Math.max(0, (a ?? n) - 1));
        }}
        onBlur={() => setActivo(null)}
      >
        <div
          className="flex h-40 items-end gap-[2px] border-b border-line"
          onPointerLeave={() => setActivo(null)}
        >
          {dias.map((x, i) => {
            const total = x.valores.reduce((a, b) => a + b, 0);
            return (
              <div
                key={x.fecha}
                className="flex h-full flex-1 flex-col justify-end"
                onPointerEnter={() => setActivo(i)}
                style={{ opacity: activo !== null && activo !== i ? 0.45 : 1 }}
              >
                <div
                  className="barra-dia mx-auto flex w-full max-w-6 flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]"
                  style={{ height: `${(total / max) * 100}%` }}
                >
                  {x.valores.map((v, k) =>
                    v ? (
                      <span
                        key={k}
                        className="w-full shrink-0"
                        style={{ height: `${(v / total) * 100}%`, backgroundColor: partes[k].color }}
                      />
                    ) : null,
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[11px] text-muted-foreground tabular">
          <span>{diaMes(dias[0].fecha)}</span>
          {n > 1 && <span>{diaMes(dias[n - 1].fecha)}</span>}
        </div>
        {activo !== null && (
          <Tooltip x={activo + 0.5} ancho={n} titulo={fechaCorta(dias[activo].fecha)} filas={filas(activo)} />
        )}
      </div>
    </Tarjeta>
  );
}

export function ReclamosPorDia({ d }: { d: { dias: { fecha: string; total: Totales }[] } }) {
  const partes = ORDEN_RECLAMO.map((k) => ({ color: COLOR_RECLAMO[k], nombre: TIPOS_RECLAMO[k] }));
  return (
    <Columnas
      titulo="Reclamos por día"
      descripcion="Pedidos finalizados con reclamo del cliente, por tipo."
      leyenda={partes}
      partes={partes}
      dias={d.dias.map((x) => ({ fecha: x.fecha, valores: ORDEN_RECLAMO.map((k) => x.total.reclamos[k]) }))}
      formatear={numero}
      filas={(i) => {
        const t = d.dias[i].total;
        return [
          ...ORDEN_RECLAMO.map((k) => ({
            color: COLOR_RECLAMO[k],
            etiqueta: TIPOS_RECLAMO[k],
            valor: numero(t.reclamos[k]),
          })),
          { color: 'transparent', etiqueta: 'De finalizados', valor: porcentaje(t.tasaReclamos) },
          { color: 'var(--rechazo)', etiqueta: 'Rechazos', valor: numero(t.rechazosTotal) },
        ];
      }}
    />
  );
}

export function SinDisponibilidadPorDia({ d }: { d: { dias: { fecha: string; total: Totales }[] } }) {
  const parte = { color: 'var(--sin-disp)', nombre: 'Sin disponibilidad (% del horario)' };
  return (
    <Columnas
      titulo="Tiempo sin disponibilidad por día"
      descripcion="Parte del horario en que Rappi contó la tienda sin recibir pedidos (promedio de Rappi y Turbo), como en su portal."
      leyenda={[]}
      partes={[parte]}
      dias={d.dias.map((x) => ({ fecha: x.fecha, valores: [sinDisponibilidad(x.total) ?? 0] }))}
      formatear={(p) => `${decimal(p, 2)} %`}
      filas={(i) => {
        const t = d.dias[i].total;
        const s = sinDisponibilidad(t);
        return [
          {
            color: parte.color,
            etiqueta: 'Sin disponibilidad',
            valor: s === null ? '—' : `${decimal(s, 2)} %`,
          },
          ...(t.sinDispMinutos
            ? [{ color: 'transparent', etiqueta: 'Minutos', valor: minutos(t.sinDispMinutos) }]
            : []),
          {
            color: 'transparent',
            etiqueta: 'Espera del repartidor',
            valor: t.espera === null ? '—' : `${decimal(t.espera)} min`,
          },
        ];
      }}
    />
  );
}

// ── Conectividad ────────────────────────────────────────────────────────────────────────────────────────────────
const COLOR_ESTADO = { activa: 'var(--color-ok)', inactiva: 'var(--color-bad)', sin_dato: '' } as const;
const NOMBRE_ESTADO = { activa: 'Activa', inactiva: 'Desactivada', sin_dato: 'Sin foto' } as const;
const hh = (s: number) =>
  `${String(Math.floor(s / 3600) % 24).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;

function Conectividad({ d, zona }: { d: RespuestaServicio; zona: string }) {
  const canales = d.canales.map((c) => c.canal);
  const con = d.cintas.filter((c) => c.tramos.length);
  // Ventana del día: de la primera a la última hora con foto (al menos 6:00–23:00).
  const [ini, fin] = useMemo(() => {
    const t = con.flatMap((c) => c.tramos);
    const a = Math.min(6 * 3600, ...t.map((x) => x.inicio));
    const b = Math.max(23 * 3600, ...t.map((x) => x.fin));
    return [Math.floor(a / 3600) * 3600, Math.min(86_400, Math.ceil(b / 3600) * 3600)];
  }, [con]);
  const horas = [];
  for (let h = ini; h <= fin; h += 3 * 3600) horas.push(h);
  const [calor, setCalor] = useState<CanalServicio>('normal');
  const semana = d.semana.find((s) => s.canal === calor) ?? d.semana[0];
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Tarjeta
        titulo="Conectividad por día"
        descripcion={`Cuándo estuvo activa cada tienda, en hora local (${zona}). Se arma con la foto de cada 10 min.`}
      >
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Leyenda">
          {(['activa', 'inactiva', 'sin_dato'] as const).map((e) => (
            <li key={e} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className={cn('h-2.5 w-4 rounded-[3px]', e === 'sin_dato' && 'sin-dato')}
                style={e === 'sin_dato' ? undefined : { backgroundColor: COLOR_ESTADO[e] }}
              />
              {NOMBRE_ESTADO[e]}
            </li>
          ))}
        </ul>
        {con.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            {d.conectividadDesde
              ? `Sin fotos de conectividad en estos días. Se guardan desde el ${fechaCorta(d.conectividadDesde.slice(0, 10))}.`
              : 'Todavía no hay fotos de conectividad de esta sucursal.'}
          </p>
        ) : (
          <div className="space-y-3">
            {[...con].reverse().map((c) => (
              <div key={c.fecha}>
                <p className="mb-1 text-xs font-medium text-ink-2">{fechaCorta(c.fecha)}</p>
                <div className="space-y-1">
                  {canales.map((canal) => (
                    <Cinta
                      key={canal}
                      canal={canal}
                      tramos={c.tramos.filter((t) => t.canal === canal)}
                      ini={ini}
                      fin={fin}
                    />
                  ))}
                </div>
              </div>
            ))}
            <div
              className="relative ml-24 mr-[4.5rem] h-4 text-[11px] text-muted-foreground tabular"
              aria-hidden="true"
            >
              {horas.map((h) => (
                <span
                  key={h}
                  className="absolute -translate-x-1/2"
                  style={{ left: `${((h - ini) / (fin - ini)) * 100}%` }}
                >
                  {hh(h)}
                </span>
              ))}
            </div>
          </div>
        )}
      </Tarjeta>
      <Tarjeta
        titulo="Disponibilidad en 15 días"
        descripcion="Qué tanto estuvo disponible cada hora, según Rappi (últimos 15 días, por día de la semana)."
        acciones={
          d.semana.length > 1 ? (
            <div className="flex rounded-[10px] border border-line-strong bg-paper p-0.5 text-xs">
              {d.semana.map((s) => (
                <button
                  key={s.canal}
                  type="button"
                  aria-pressed={calor === s.canal}
                  onClick={() => setCalor(s.canal)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 font-semibold',
                    calor === s.canal ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink',
                  )}
                >
                  {CANAL[s.canal]}
                </button>
              ))}
            </div>
          ) : undefined
        }
      >
        {semana ? (
          <Calor matriz={semana.matriz} fecha={semana.fecha} />
        ) : (
          <p className="text-sm text-muted-foreground">Rappi aún no da este dato.</p>
        )}
      </Tarjeta>
    </div>
  );
}

function Cinta({
  canal,
  tramos,
  ini,
  fin,
}: {
  canal: CanalServicio;
  tramos: RespuestaServicio['cintas'][number]['tramos'];
  ini: number;
  fin: number;
}) {
  const ancho = fin - ini;
  const inactivo = tramos.filter((t) => t.estado === 'inactiva').reduce((a, t) => a + (t.fin - t.inicio), 0);
  return (
    <div className="flex items-center gap-2">
      <span className="w-22 shrink-0 text-xs text-muted-foreground">{CANAL[canal]}</span>
      <div
        className="relative h-4 flex-1 overflow-hidden rounded-[4px] bg-surface-2"
        role="img"
        aria-label={`${CANAL[canal]}: ${tramos.length ? tramos.map((t) => `${NOMBRE_ESTADO[t.estado]} de ${hh(t.inicio)} a ${hh(t.fin)}`).join(', ') : 'sin fotos'}`}
      >
        {tramos.map((t, i) => (
          <span
            key={i}
            title={`${NOMBRE_ESTADO[t.estado]} · ${hh(t.inicio)}–${hh(t.fin)}${t.motivo ? ` · ${t.motivo}` : ''}`}
            className={cn('absolute inset-y-0', t.estado === 'sin_dato' && 'sin-dato')}
            style={{
              left: `${((Math.max(t.inicio, ini) - ini) / ancho) * 100}%`,
              width: `max(2px, calc(${((Math.min(t.fin, fin) - Math.max(t.inicio, ini)) / ancho) * 100}% - 2px))`,
              backgroundColor: t.estado === 'sin_dato' ? undefined : COLOR_ESTADO[t.estado],
            }}
          />
        ))}
      </div>
      <span className="w-16 shrink-0 text-right text-[11px] text-muted-foreground tabular">
        {inactivo ? `${minutos(Math.round(inactivo / 60))} off` : ''}
      </span>
    </div>
  );
}

const DIAS_SEMANA = [
  ['mon', 'Lun'],
  ['tue', 'Mar'],
  ['wed', 'Mié'],
  ['thu', 'Jue'],
  ['fri', 'Vie'],
  ['sat', 'Sáb'],
  ['sun', 'Dom'],
] as const;
/** Rampa secuencial azul en 4 pasos (dataviz: una sola tonalidad, de claro a oscuro). */
const pasoCalor = (v: number) =>
  v >= 0.95 ? AZUL.profundo : v >= 0.75 ? AZUL.fuerte : v >= 0.4 ? AZUL.medio : v > 0 ? AZUL.claro : null;

function Calor({ matriz, fecha }: { matriz: Record<string, Record<string, number>>; fecha: string }) {
  // Solo las horas en las que alguna vez estuvo disponible (fuera de horario, todo es 0).
  const horas = Object.keys(matriz)
    .sort()
    .filter((h) => DIAS_SEMANA.some(([k]) => (matriz[h][k] ?? 0) > 0));
  if (!horas.length)
    return <p className="text-sm text-muted-foreground">Sin disponibilidad registrada en 15 días.</p>;
  return (
    <div>
      <div className="relative overflow-x-auto">
        <table className="w-full border-separate border-spacing-[2px] text-[11px]">
          <caption className="sr-only">Fracción del tiempo disponible por hora y día de la semana</caption>
          <thead>
            <tr>
              <th className="w-12" />
              {DIAS_SEMANA.map(([k, n]) => (
                <th key={k} scope="col" className="font-medium text-muted-foreground">
                  {n}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {horas.map((h) => (
              <tr key={h}>
                <th scope="row" className="pr-1 text-right font-normal text-muted-foreground tabular">
                  {h}
                </th>
                {DIAS_SEMANA.map(([k, n]) => {
                  const v = matriz[h][k] ?? 0;
                  const color = pasoCalor(v);
                  return (
                    <td
                      key={k}
                      title={`${n} ${h}: ${Math.round(v * 100)} % del tiempo disponible`}
                      className="h-4 rounded-[3px]"
                      style={{ backgroundColor: color ?? 'var(--color-surface-2)' }}
                    >
                      <span className="sr-only">{`${n} ${h}: ${Math.round(v * 100)} %`}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {[
          ['menos de 40 %', AZUL.claro],
          ['40–75 %', AZUL.medio],
          ['75–95 %', AZUL.fuerte],
          ['95 % o más', AZUL.profundo],
        ].map(([n, c]) => (
          <span key={n} className="flex items-center gap-1">
            <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ backgroundColor: c }} />
            {n}
          </span>
        ))}
        <span className="basis-full">Leído el {fechaCorta(fecha)}.</span>
      </div>
    </div>
  );
}

// ── Reclamos ────────────────────────────────────────────────────────────────────────────────────────────────────
function Reclamos({ d }: { d: RespuestaServicio }) {
  const [tipo, setTipo] = useState<TipoReclamo | 'todos'>('todos');
  const lista = tipo === 'todos' ? d.reclamos : d.reclamos.filter((r) => r.tipo === tipo);
  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Tarjeta
        titulo={`Reclamos (${numero(d.reclamos.length)})`}
        descripcion={`Cada reclamo con lo que escribió el cliente. Compensado por Rappi: ${d.compensado.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}.`}
        cuerpo={false}
        acciones={
          d.reclamos.length ? (
            <div className="flex flex-wrap rounded-[10px] border border-line-strong bg-paper p-0.5 text-xs">
              {(['todos', ...ORDEN_RECLAMO] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={tipo === k}
                  onClick={() => setTipo(k)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-semibold',
                    tipo === k ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink',
                  )}
                >
                  {k !== 'todos' && (
                    <span
                      aria-hidden="true"
                      className="size-2 rounded-[2px]"
                      style={{ backgroundColor: COLOR_RECLAMO[k] }}
                    />
                  )}
                  {k === 'todos' ? 'Todos' : TIPOS_RECLAMO[k]}
                </button>
              ))}
            </div>
          ) : undefined
        }
      >
        {lista.length === 0 ? (
          <Vacio titulo={d.reclamos.length ? 'Sin reclamos de este tipo' : 'Sin reclamos en el periodo'} />
        ) : (
          <div className="relative mt-3 max-h-[480px] overflow-auto border-t border-line">
            <table className="w-full min-w-[640px] text-sm">
              <caption className="sr-only">Reclamos del periodo</caption>
              <thead className="sticky top-0 bg-surface">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Comentario del cliente</th>
                  <th className="px-5 py-2 text-right font-medium">Compensado</th>
                </tr>
              </thead>
              <tbody>
                {lista.map((r) => (
                  <tr key={r.pedido} className="border-t border-line align-top">
                    <td className="whitespace-nowrap px-5 py-2.5 text-xs text-ink-2">
                      {diaMes(r.fecha)}
                      <span className="block text-muted-foreground">{CANAL[r.canal]}</span>
                    </td>
                    <td className="px-3 py-2.5 font-medium">{r.producto ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {r.tipo && (
                        <span className="flex items-center gap-1.5 font-semibold">
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-[2px]"
                            style={{ backgroundColor: COLOR_RECLAMO[r.tipo] }}
                          />
                          {TIPOS_RECLAMO[r.tipo]}
                        </span>
                      )}
                      {r.detalle && <span className="block text-muted-foreground">{r.detalle}</span>}
                    </td>
                    <td className="max-w-[38ch] px-3 py-2.5 text-ink-2">
                      {r.comentario ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-2.5 text-right tabular">
                      {r.monto === null
                        ? '—'
                        : r.monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Tarjeta>
      <Tarjeta
        titulo="Productos con más reclamos"
        descripcion="Cuántos reclamos tuvo cada producto en el periodo."
      >
        {d.productos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin reclamos con producto.</p>
        ) : (
          <ol className="space-y-3">
            {d.productos.slice(0, 8).map((p) => (
              <li key={p.producto}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate font-medium">{p.producto}</span>
                  <span className="tabular font-semibold">{numero(p.reclamos)}</span>
                </div>
                <div
                  className="mt-1 flex h-2 gap-[2px] overflow-hidden rounded-[3px]"
                  style={{ width: `${(p.reclamos / d.productos[0].reclamos) * 100}%` }}
                  role="img"
                  aria-label={ORDEN_RECLAMO.filter((k) => p.tipos[k])
                    .map((k) => `${TIPOS_RECLAMO[k]} ${p.tipos[k]}`)
                    .join(', ')}
                >
                  {ORDEN_RECLAMO.map((k) =>
                    p.tipos[k] ? (
                      <span key={k} style={{ flex: p.tipos[k], backgroundColor: COLOR_RECLAMO[k] }} />
                    ) : null,
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Tarjeta>
    </div>
  );
}
