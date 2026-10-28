import Link from 'next/link';
import { ChevronLeft, ChevronRight, Clock, Database, TriangleAlert } from 'lucide-react';
import { Encabezado, Insignia, Vacio } from '@/components/portal/piezas';
import { dinero, numero } from '@/components/sucursales/formato';
import { cn } from '@/lib/utils';
import { TEXTO_ESTADO, type EstadoDiaTablero, type Tablero } from '@/lib/analytics/tablero';
import type { Resumen } from '@/lib/analytics/contrato';
import { Leyenda, MatrizCobertura, RankingTiendas, SemanaColumnas } from './graficas';

/**
 * Tablero de Analytics. Una sola pieza protagonista (la semana en columnas, con el total encima); el resto en
 * voz baja: una franja de indicadores, ranking por tienda, cobertura y, plegadas, las tablas con todas las cifras.
 */
const fechaCorta = (f: string) =>
  new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(`${f}T12:00:00Z`))
    .replace(/\./g, '');
const rango = (desde: string, hasta: string) => {
  const f = (s: string, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('es-MX', { ...o, timeZone: 'UTC' }).format(new Date(`${s}T12:00:00Z`));
  return desde.slice(5, 7) === hasta.slice(5, 7)
    ? `${f(desde, { day: 'numeric' })} al ${f(hasta, { day: 'numeric', month: 'long', year: 'numeric' })}`
    : `${f(desde, { day: 'numeric', month: 'long' })} al ${f(hasta, { day: 'numeric', month: 'long', year: 'numeric' })}`;
};
const momento = (iso: string) =>
  new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Mexico_City',
  }).format(new Date(iso));
const decimal = (x: number | null) =>
  x === null
    ? '—'
    : new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
const promedio = (r: Resumen) =>
  dinero(r.ticketPromedioCent === null ? null : Math.round(r.ticketPromedioCent));

const claseEstado: Record<EstadoDiaTablero, string> = {
  cerrado: 'border-ok/30 bg-ok-soft text-ok',
  provisional: 'border-warn/30 bg-warn-soft text-warn',
  'pendiente-cierre': 'border-warn/30 bg-warn-soft text-warn',
  parcial: 'border-warn/30 bg-warn-soft text-warn',
  'sin-lectura': 'border-bad/30 bg-bad-soft text-bad',
  futuro: '',
};

function Celdas({ r }: { r: Resumen }) {
  return (
    <>
      <td className="numero text-right">{dinero(r.venta_cent)}</td>
      <td className="numero text-right">{numero(r.tickets)}</td>
      <td className="numero text-right">{promedio(r)}</td>
      <td className="numero text-right">{numero(r.unidades)}</td>
      <td className="numero text-right">{decimal(r.unidadesPorTicket)}</td>
    </>
  );
}
const Cabeceras = () => (
  <>
    <th className="text-right">Ventas con IVA</th>
    <th className="text-right">Tickets</th>
    <th className="text-right">Ticket promedio</th>
    <th className="text-right">Unidades</th>
    <th className="text-right">Unid. por ticket</th>
  </>
);

function Navegacion({ t }: { t: Tablero }) {
  const boton =
    'grid size-9 place-items-center rounded-[10px] border border-line bg-surface hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';
  return (
    <nav aria-label="Semana" className="flex items-center gap-2">
      <Link href={`/analytics?semana=${t.semana.anterior}`} aria-label="Semana anterior" className={boton}>
        <ChevronLeft size={18} aria-hidden="true" />
      </Link>
      <p className="min-w-0 text-sm font-semibold text-ink-2">
        Semana del {rango(t.semana.desde, t.semana.hasta)}
      </p>
      {t.semana.siguiente ? (
        <Link
          href={`/analytics?semana=${t.semana.siguiente}`}
          aria-label="Semana siguiente"
          className={boton}
        >
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      ) : (
        <span aria-hidden="true" className={cn(boton, 'opacity-30')}>
          <ChevronRight size={18} />
        </span>
      )}
    </nav>
  );
}

function Indicador({ nombre, valor, definicion }: { nombre: string; valor: string; definicion: string }) {
  return (
    <div className="px-5 py-4">
      <dt className="text-sm text-ink-2">{nombre}</dt>
      <dd className="mt-1 font-display text-[1.75rem] font-black leading-none tracking-tight tabular">
        {valor}
      </dd>
      <dd className="mt-2 text-xs leading-snug text-muted-foreground">{definicion}</dd>
    </div>
  );
}

function Panel({
  titulo,
  children,
  className,
}: {
  titulo: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={titulo}
      className={cn('rounded-2xl border border-line bg-surface p-5 shadow-card', className)}
    >
      <h2 className="mb-4 font-display text-lg font-bold">{titulo}</h2>
      {children}
    </section>
  );
}

export function TableroAnalytics({ t }: { t: Tablero }) {
  const r = t.total;
  const sinDatos = t.lecturasObtenidas === 0;
  const pct = t.lecturasEsperadas ? t.lecturasObtenidas / t.lecturasEsperadas : 0;
  return (
    <>
      <Encabezado
        area="Analytics"
        titulo="Ventas de la red"
        descripcion="Tiendas de México con relación verificada, leídas del POS (mostrador y app). Rappi va aparte mientras su integración esté pendiente."
      />

      <section
        aria-label="Venta de la semana"
        className="rounded-[22px] border border-line bg-surface shadow-card"
      >
        <div className="flex flex-col gap-4 border-b border-line px-5 py-4 md:flex-row md:items-center md:justify-between">
          <Navegacion t={t} />
          <ul className="flex flex-wrap gap-2 text-xs">
            <li>
              <Insignia>
                <Database size={13} aria-hidden="true" /> API POS · mostrador y app
              </Insignia>
            </li>
            <li>
              <Insignia>
                <Clock size={13} aria-hidden="true" />
                {t.ultimaLectura ? `Leído ${momento(t.ultimaLectura)} (CDMX)` : 'Sin lectura'}
              </Insignia>
            </li>
          </ul>
        </div>

        {sinDatos ? (
          <Vacio titulo="Sin lecturas para esta semana">
            Aún no hay ventas cargadas para estas fechas. No significa venta cero: elige otra semana o espera
            la siguiente carga.
          </Vacio>
        ) : (
          <div className="grid gap-6 p-5 lg:grid-cols-[minmax(0,17rem)_1fr] lg:gap-8 lg:p-7">
            <div className="flex flex-col justify-between gap-6">
              <div>
                <p className="text-sm text-ink-2">Ventas con IVA</p>
                <p className="mt-2 font-display text-[clamp(2.6rem,6vw,3.6rem)] font-black leading-[0.95] tracking-tight tabular">
                  {dinero(r!.venta_cent, 'MXN', false)}
                </p>
                <p className="mt-3 max-w-[30ch] text-sm leading-relaxed text-muted-foreground">
                  Lo cobrado en mostrador y app, ya con descuentos, de {numero(t.lecturasObtenidas)} lecturas
                  de tienda por día.
                </p>
              </div>
              <div className="space-y-2">
                <p className="flex items-baseline justify-between text-sm">
                  <span className="text-ink-2">Cobertura</span>
                  <span className="tabular font-semibold">
                    {numero(t.lecturasObtenidas)} / {numero(t.lecturasEsperadas)}
                  </span>
                </p>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
                  <div
                    className="h-full rounded-full bg-ink-2"
                    style={{ width: `${Math.round(pct * 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Tienda-día leídos de {t.tiendasEsperadas} tiendas en los días transcurridos.
                </p>
              </div>
            </div>
            <div className="min-w-0">
              <div className="mb-2 flex justify-end">
                <Leyenda />
              </div>
              <SemanaColumnas dias={t.dias} />
            </div>
          </div>
        )}
      </section>

      {(t.hayProvisional || t.faltantes.length > 0 || t.pendientesCierre.length > 0) && (
        <div
          role="status"
          className="flex gap-3 rounded-2xl border border-warn/30 bg-warn-soft p-4 text-sm text-warn"
        >
          <TriangleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            {t.desactualizado && (
              <p className="font-semibold">
                La lectura del día en curso tiene más de 3 horas: las cifras de hoy pueden estar atrasadas.
              </p>
            )}
            {t.hayProvisional && (
              <p>
                Los días rayados se leyeron con el día abierto: sus cifras cambiarán con la siguiente lectura.
              </p>
            )}
            {t.pendientesCierre.length > 0 && (
              <p>
                Pendiente de lectura de cierre: {t.pendientesCierre.map(fechaCorta).join(', ')}. El día ya
                terminó en todas las zonas, pero sus cifras son las de la última lectura con el día abierto.
              </p>
            )}
            {t.faltantes.length > 0 && (
              <p>
                Tiendas sin lectura:{' '}
                {t.faltantes.map((f) => `${fechaCorta(f.fecha)}, ${f.tiendas}`).join(' · ')}. Sus ventas no
                están en los totales y no se cuentan como cero.
              </p>
            )}
          </div>
        </div>
      )}

      {!sinDatos && (
        <>
          <dl
            aria-label="Indicadores de la semana"
            className="grid divide-line rounded-2xl border border-line bg-surface shadow-card sm:grid-cols-2 sm:divide-x xl:grid-cols-4 [&>div]:border-line max-sm:divide-y"
          >
            <Indicador
              nombre="Tickets"
              valor={numero(r!.tickets)}
              definicion="Pedidos únicos de mostrador y app."
            />
            <Indicador
              nombre="Ticket promedio"
              valor={promedio(r!)}
              definicion="Ventas con IVA ÷ tickets de la semana."
            />
            <Indicador
              nombre="Unidades"
              valor={numero(r!.unidades)}
              definicion="Productos vendidos (una línea del POS es una unidad)."
            />
            <Indicador
              nombre="Unidades por ticket"
              valor={decimal(r!.unidadesPorTicket)}
              definicion="Unidades ÷ tickets. Etiqueta propuesta; no es el «UPT» de Zoho, que cuenta filas."
            />
          </dl>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
            <Panel titulo="Tiendas por venta">
              <div className="mb-4">
                <Leyenda conTextura={false} />
              </div>
              <RankingTiendas tiendas={t.tiendas} />
            </Panel>

            <div className="flex flex-col gap-6">
              <Panel titulo="Cobertura por día">
                <MatrizCobertura cobertura={t.cobertura} tiendas={t.tiendas} />
              </Panel>
              <Panel titulo="Metas y punto de equilibrio">
                <dl className="grid grid-cols-2 gap-4">
                  {['Meta de venta', 'Punto de equilibrio'].map((n) => (
                    <div key={n}>
                      <dt className="text-sm text-ink-2">{n}</dt>
                      <dd className="mt-1 font-display text-xl font-bold text-muted-foreground">Sin datos</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  Falta decidir su fuente. No se muestra ninguna estimación: en la fuente actual no hay punto
                  de equilibrio de 2026.
                </p>
              </Panel>
            </div>
          </div>
        </>
      )}

      <Panel titulo="Fuera de los totales">
        <dl className="grid gap-4 text-sm md:grid-cols-2">
          <div className="rounded-xl bg-surface-2 p-4">
            <dt className="font-medium">Rappi registrado en el POS</dt>
            <dd className="mt-1 font-display text-xl font-bold tabular">
              {sinDatos
                ? 'Sin lectura'
                : `${numero(t.excluido.rappiPos.tickets)} pedidos · ${dinero(t.excluido.rappiPos.venta_cent)}`}
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              Pendiente de lo que exponga la API de Brasil.
            </dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-4">
            <dt className="font-medium">Rappi en Zoho, carga manual del día siguiente</dt>
            <dd className="mt-1 font-display text-xl font-bold tabular">
              {t.excluido.rappiZoho.fechas.length
                ? `${numero(t.excluido.rappiZoho.tickets)} pedidos · ${dinero(t.excluido.rappiZoho.venta_cent)}`
                : 'Sin datos'}
            </dd>
            <dd className="mt-1 text-xs text-muted-foreground">
              {t.excluido.rappiZoho.fechas.length
                ? `${t.excluido.rappiZoho.fechas.map(fechaCorta).join(', ')}. Comparte pedidos con el Rappi del POS: sumarlo los duplicaría.`
                : 'Sin datos preparados para esta semana.'}
            </dd>
          </div>
        </dl>
        {t.excluido.sinOrigenTickets > 0 && (
          <p className="mt-3 text-sm">Pedidos del POS sin origen: {numero(t.excluido.sinOrigenTickets)}.</p>
        )}
      </Panel>

      {!sinDatos && (
        <details className="group rounded-2xl border border-line bg-surface shadow-card">
          <summary className="cursor-pointer list-none px-5 py-4 font-display text-lg font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
            <span className="flex items-center justify-between">
              Tablas con todas las cifras
              <ChevronRight
                size={18}
                aria-hidden="true"
                className="transition-transform group-open:rotate-90 motion-reduce:transition-none"
              />
            </span>
          </summary>
          <div className="space-y-6 border-t border-line pb-2">
            <div className="overflow-x-auto">
              <table className="tabla min-w-[760px]">
                <caption className="sr-only">Ventas por día</caption>
                <thead>
                  <tr>
                    <th>Día</th>
                    <th>Estado</th>
                    <th className="text-right">Tiendas leídas</th>
                    <Cabeceras />
                  </tr>
                </thead>
                <tbody>
                  {t.dias.map((d) => (
                    <tr key={d.fecha} className={cn(d.estado === 'futuro' && 'text-muted-foreground')}>
                      <td className="whitespace-nowrap">{fechaCorta(d.fecha)}</td>
                      <td>
                        <Insignia className={claseEstado[d.estado]}>{TEXTO_ESTADO[d.estado]}</Insignia>
                      </td>
                      <td className="numero text-right">
                        {d.estado === 'futuro' ? '—' : `${d.tiendasLeidas} / ${t.tiendasEsperadas}`}
                      </td>
                      {d.resumen ? (
                        d.resumen.tickets === 0 ? (
                          <td colSpan={5} className="text-right text-muted-foreground">
                            Sin ventas
                          </td>
                        ) : (
                          <Celdas r={d.resumen} />
                        )
                      ) : (
                        <td colSpan={5} className="text-right text-muted-foreground">
                          {d.estado === 'futuro' ? '' : 'Sin lectura'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="overflow-x-auto">
              <table className="tabla min-w-[820px]">
                <caption className="sr-only">Ventas por tienda en los días leídos</caption>
                <thead>
                  <tr>
                    <th>Tienda</th>
                    <th className="text-right">Store ID</th>
                    <th className="text-right">Días leídos</th>
                    <Cabeceras />
                  </tr>
                </thead>
                <tbody>
                  {t.tiendas.map((f) => (
                    <tr key={f.company_id}>
                      <td className="min-w-48">{f.nombre}</td>
                      <td className="numero text-right text-muted-foreground">{f.store_id}</td>
                      <td className="numero text-right">{f.diasLeidos}</td>
                      {!f.resumen ? (
                        <td colSpan={5} className="text-right text-bad">
                          Sin lectura
                        </td>
                      ) : f.resumen.tickets === 0 ? (
                        <td colSpan={5} className="text-right text-muted-foreground">
                          Sin ventas
                        </td>
                      ) : (
                        <Celdas r={f.resumen} />
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </details>
      )}
    </>
  );
}

export function ErrorAnalytics({ mensaje }: { mensaje: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-bad/30 bg-bad-soft p-4 text-sm">
      <p className="font-semibold text-bad">No se pudieron leer las ventas de Analytics</p>
      <p className="mt-1 text-ink-2">
        {mensaje} Las cifras no se muestran como cero; intenta de nuevo más tarde.
      </p>
    </div>
  );
}
