'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDown, Download } from 'lucide-react';
import { cn } from 'cn';
import { nombreTop, TIPOS_RECLAMO, type TipoReclamo, type Totales } from '@/lib/sucursales/servicio';
import type { RespuestaServicioNacional } from '@/lib/sucursales/servicio-nacional';
import { hojasServicioNacional } from '@/lib/sucursales/servicio-excel';
import { Tarjeta, Vacio } from '@/components/portal/piezas';
import { ErrorCarga, Esqueleto } from './estados';
import { hace, horaDe, numero, porcentaje } from './formato';
import {
  AlDiaRappi,
  CANAL,
  COLOR_RECLAMO,
  decimal,
  Indicadores,
  ORDEN_RECLAMO,
  ReclamosPorDia,
  SinDisponibilidadPorDia,
  sinDisponibilidad,
  SinPublicar,
  tituloPeriodo,
} from './nivel-servicio';
import { rango, SelectorPeriodo, type Periodo } from './periodo';
import { useLectura } from './use-lectura';
import { ApartadosServicio, MenuRappiNacional, apartadoDeUrl, type Apartado } from './menu-rappi';
import './nivel-servicio.css';

/**
 * Tablero de México · Nivel de servicio (docs/rappi-portal/08, fase 3). Responde: ¿cómo está atendiendo México en
 * Rappi y qué sucursales hay que ver? Arriba, cuántas tiendas están activas ahora y cuáles no; luego los indicadores
 * nacionales, el día por día, el ranking de sucursales (ordenable, cada una abre su sección) y los reclamos.
 * Mismas piezas y cálculos que la sección de una sucursal (nivel-servicio.tsx).
 */
const ZONA = 'America/Mexico_City';

export function ServicioNacionalVista() {
  const [periodo, setPeriodo] = useState<Periodo>({ id: '7d' });
  // Rappi publica cada día con 1 a 2 días de retraso: abre en el último día que ya publicó y avanza solo (se relee
  // cada 5 min). Al elegir otro periodo se usa ese.
  const [ultimo, setUltimo] = useState(true);
  // Apartado Servicio o Menú en Rappi (docs/rappi-portal/09), de la URL al montar: así no se lee lo que no se ve.
  const [apartado, setApartado] = useState<Apartado | null>(null);
  useEffect(() => setApartado(apartadoDeUrl()), []);
  const { desde, hasta } = rango(periodo, ZONA);
  const { datos, error, cargando, recargar } = useLectura<RespuestaServicioNacional>(
    apartado !== 'servicio'
      ? null
      : ultimo
        ? '/api/sucursales/servicio-nacional?ultimo=1'
        : `/api/sucursales/servicio-nacional?desde=${desde}&hasta=${hasta}`,
    { intervaloMs: 5 * 60_000 },
  );
  const descargar = async () => {
    if (!datos) return;
    const h = hojasServicioNacional({ ...datos, hasta: datos.indicadoresHasta ?? datos.hasta });
    const XLSX = await import('xlsx');
    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(h.resumen), 'Resumen');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(h.porSucursal), 'Por sucursal');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(h.dias), 'Por día');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(h.reclamos), 'Reclamos');
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(h.desactivadas), 'Desactivadas ahora');
    XLSX.writeFile(libro, h.nombreArchivo);
  };
  return (
    <div className="servicio space-y-6" aria-busy={apartado === 'servicio' && cargando}>
      <ApartadosServicio activo={apartado ?? 'servicio'} alCambiar={setApartado} />
      {apartado === 'menu' ? (
        <MenuRappiNacional />
      ) : apartado === null ? (
        <Esqueleto filas={3} />
      ) : (
        <>
          <div className="placa flex flex-wrap items-end justify-between gap-3 p-3">
            <SelectorPeriodo
              periodo={periodo}
              zona={ZONA}
              alCambiar={(p) => {
                setUltimo(false);
                setPeriodo(p);
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
              <AhoraEnMexico d={datos} />
              {datos.dias.length === 0 ? (
                <SinPublicar
                  desde={datos.desde}
                  hasta={datos.hasta}
                  publicadoHasta={datos.publicadoHasta}
                  alVerUltimo={ultimo ? undefined : () => setUltimo(true)}
                />
              ) : (
                <>
                  <Indicadores
                    titulo={`${tituloPeriodo(datos.desde, datos.indicadoresHasta ?? datos.hasta)} en Rappi, ${datos.sucursales.length} sucursales`}
                    t={datos.totales}
                  />
                  <div className="grid gap-6 lg:grid-cols-2">
                    <ReclamosPorDia d={datos} />
                    <SinDisponibilidadPorDia d={datos} />
                  </div>
                </>
              )}
              <Ranking d={datos} />
              <ReclamosMexico d={datos} />
              <p className="placa px-3 py-2 text-xs text-muted-foreground">
                Fuente: Nivel de servicio y Conectividad del portal de Rappi Partners (Rappi y Rappi Turbo),
                leídos cada 10 min (conectividad) y cada hora (indicadores). Rappi publica los indicadores de
                cada día con 1 a 2 días de retraso. Los días son los de Rappi, en hora del centro.
                {datos.leidoEn &&
                  ` Última lectura de indicadores ${hace(Math.round((Date.now() - new Date(datos.leidoEn).getTime()) / 1000))}.`}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ── Ahora en Rappi ───────────────────────────────────────────────────────────────────────────────────────────────
function AhoraEnMexico({ d }: { d: RespuestaServicioNacional }) {
  const total = d.sucursales.length + d.sinPortal.length;
  return (
    <section aria-labelledby="ahora-mexico" className="rounded-2xl border border-line bg-surface shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-5 pt-5">
        <h2 id="ahora-mexico">Ahora en Rappi</h2>
        <p className="text-xs text-muted-foreground">
          {d.sucursales.length} de {total} sucursales con tienda en Rappi
        </p>
      </header>
      <dl className="mt-4 grid border-t border-line sm:grid-cols-2">
        {d.ahora.map((a, i) => {
          const apagadas = a.tiendas - a.activas;
          return (
            <div
              key={a.canal}
              className={cn('px-5 py-4', i > 0 && 'border-t border-line sm:border-l sm:border-t-0')}
            >
              <dt className="text-xs text-muted-foreground">{CANAL[a.canal]}</dt>
              <dd className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-[26px] font-black leading-none tabular">
                  {numero(a.activas)}
                </span>
                <span className="text-sm text-ink-2">de {numero(a.tiendas)} tiendas activas</span>
              </dd>
              <dd className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: apagadas ? 'var(--color-bad)' : 'var(--color-ok)' }}
                />
                {apagadas
                  ? `${numero(apagadas)} desactivada${apagadas === 1 ? '' : 's'} o sin foto`
                  : 'Todas activas'}
              </dd>
            </div>
          );
        })}
      </dl>
      {d.desactivadas.length > 0 && (
        <div className="relative max-h-72 overflow-auto border-t border-line">
          <table className="w-full min-w-[520px] text-sm">
            <caption className="sr-only">Tiendas desactivadas ahora</caption>
            <thead className="sticky top-0 bg-surface">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-5 py-2 font-medium">Desactivada ahora</th>
                <th className="px-3 py-2 font-medium">Tienda</th>
                <th className="px-3 py-2 font-medium">Motivo de Rappi</th>
                <th className="px-5 py-2 text-right font-medium">Desde</th>
              </tr>
            </thead>
            <tbody>
              {d.desactivadas.map((x) => (
                <tr key={`${x.companyId}-${x.canal}`} className="border-t border-line">
                  <td className="px-5 py-2">
                    <Link
                      href={`/sucursales/${x.companyId}?seccion=servicio`}
                      className="font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ink"
                    >
                      {x.sucursal}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-ink-2">{CANAL[x.canal]}</td>
                  <td className="px-3 py-2 text-ink-2">{x.motivo ?? x.estado}</td>
                  <td className="whitespace-nowrap px-5 py-2 text-right tabular text-ink-2">
                    {horaDe(new Date(x.desde).getTime(), ZONA)}
                    <span className="block text-[11px] text-muted-foreground">
                      {hace(Math.max(0, Math.round((Date.now() - new Date(x.desde).getTime()) / 1000)))}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d.sinPortal.length > 0 && (
        <p className="border-t border-line px-5 py-3 text-xs text-muted-foreground">
          Sin tienda en el portal de Rappi ({d.sinPortal.length}):{' '}
          {d.sinPortal.map((s) => s.nombre).join(', ')}. No entran en estas cifras.
        </p>
      )}
    </section>
  );
}

// ── Ranking de sucursales ───────────────────────────────────────────────────────────────────────────────────────
type Orden = 'pedidos' | 'tasaReclamos' | 'rechazosTotal' | 'sinDisp' | 'espera' | 'nombre';
// Sin disponibilidad: % del horario (Rappi no manda los minutos; ver sinDisponibilidad en nivel-servicio.tsx).
const valorDe = (t: Totales, o: Exclude<Orden, 'nombre'>) => (o === 'sinDisp' ? sinDisponibilidad(t) : t[o]);
const COLUMNAS: { id: Orden; nombre: string; valor: (t: Totales) => string }[] = [
  { id: 'pedidos', nombre: 'Pedidos', valor: (t) => numero(t.pedidos) },
  { id: 'tasaReclamos', nombre: 'Reclamos', valor: (t) => porcentaje(t.tasaReclamos) },
  { id: 'rechazosTotal', nombre: 'Rechazos', valor: (t) => numero(t.rechazosTotal) },
  {
    id: 'sinDisp',
    nombre: 'Sin disponibilidad',
    valor: (t) => {
      const s = sinDisponibilidad(t);
      return s === null ? '—' : `${decimal(s, 2)} %`;
    },
  },
  { id: 'espera', nombre: 'Espera', valor: (t) => (t.espera === null ? '—' : `${decimal(t.espera)} min`) },
];

function Ranking({ d }: { d: RespuestaServicioNacional }) {
  const [orden, setOrden] = useState<Orden>('tasaReclamos');
  const filas = useMemo(() => {
    const v = (t: Totales) => (orden === 'nombre' ? 0 : (valorDe(t, orden) ?? -1));
    return [...d.sucursales].sort((a, b) =>
      orden === 'nombre'
        ? a.nombre.localeCompare(b.nombre)
        : v(b.totales) - v(a.totales) || a.nombre.localeCompare(b.nombre),
    );
  }, [d.sucursales, orden]);
  return (
    <Tarjeta
      titulo="Sucursales"
      descripcion="Ordena por cualquier columna; cada sucursal abre su sección de Nivel de servicio."
      cuerpo={false}
    >
      <div className="relative mt-3 max-h-[560px] overflow-auto border-t border-line">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">Nivel de servicio de Rappi por sucursal</caption>
          <thead className="sticky top-0 z-[1] bg-surface">
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-5 py-2 font-medium" aria-sort={orden === 'nombre' ? 'ascending' : 'none'}>
                <button type="button" onClick={() => setOrden('nombre')} className="hover:text-ink">
                  Sucursal
                </button>
              </th>
              <th className="px-3 py-2 font-medium">Ahora</th>
              {COLUMNAS.map((c) => (
                <th
                  key={c.id}
                  className="px-3 py-2 text-right font-medium"
                  aria-sort={orden === c.id ? 'descending' : 'none'}
                >
                  <button
                    type="button"
                    onClick={() => setOrden(c.id)}
                    className={cn(
                      'inline-flex items-center gap-1 hover:text-ink',
                      orden === c.id && 'text-ink',
                    )}
                  >
                    {c.nombre}
                    {orden === c.id && <ArrowDown size={12} aria-hidden="true" />}
                  </button>
                </th>
              ))}
              <th className="px-5 py-2 font-medium">Top Restaurantes</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {filas.map((s) => (
              <tr key={s.companyId} className="border-t border-line hover:bg-surface-2/60">
                <td className="px-5 py-2">
                  <Link
                    href={`/sucursales/${s.companyId}?seccion=servicio`}
                    className="font-semibold underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ink"
                  >
                    {s.nombre}
                  </Link>
                  <span className="block text-[11px] text-muted-foreground">{s.ciudad}</span>
                </td>
                <td className="px-3 py-2">
                  <span className="flex gap-2 text-[11px] text-ink-2">
                    {(['normal', 'turbo'] as const)
                      .filter((c) => s.ahora[c])
                      .map((c) => (
                        <span
                          key={c}
                          className="flex items-center gap-1"
                          title={s.ahora[c]!.motivo ?? undefined}
                        >
                          <span
                            aria-hidden="true"
                            className="size-2 rounded-full"
                            style={{
                              backgroundColor: s.ahora[c]!.activa ? 'var(--color-ok)' : 'var(--color-bad)',
                            }}
                          />
                          <span>
                            {c === 'normal' ? 'Rappi' : 'Turbo'}
                            <span className="sr-only">{s.ahora[c]!.activa ? ' activa' : ' desactivada'}</span>
                          </span>
                        </span>
                      ))}
                  </span>
                </td>
                {COLUMNAS.map((c) => (
                  <td
                    key={c.id}
                    className={cn(
                      'whitespace-nowrap px-3 py-2 text-right',
                      orden === c.id && 'font-semibold',
                    )}
                  >
                    {c.valor(s.totales)}
                  </td>
                ))}
                <td className="whitespace-nowrap px-5 py-2 text-xs text-ink-2">{nombreTop(s.top) ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}

/** Tiendas Rappi por categoría de Top Restaurantes (va junto a los productos con más reclamos). */
function TopRestaurantes({ d }: { d: RespuestaServicioNacional }) {
  return (
    <Tarjeta
      titulo="Top Restaurantes"
      descripcion="Tiendas Rappi por categoría, según la última lectura de Rappi."
    >
      {d.top.length === 0 ? (
        <p className="text-sm text-muted-foreground">Rappi aún no da este dato.</p>
      ) : (
        <ul className="space-y-3">
          {d.top.map((x) => {
            const max = Math.max(...d.top.map((y) => y.tiendas));
            return (
              <li key={x.categoria}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-medium">{nombreTop(x.categoria)}</span>
                  <span className="tabular font-semibold">{numero(x.tiendas)}</span>
                </div>
                <div
                  className="mt-1 h-2 rounded-[3px] bg-[var(--sin-disp)]"
                  style={{ width: `${(x.tiendas / max) * 100}%` }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Tarjeta>
  );
}

// ── Reclamos de México ──────────────────────────────────────────────────────────────────────────────────────────
const MAX_FILAS = 200;

function ReclamosMexico({ d }: { d: RespuestaServicioNacional }) {
  const [tipo, setTipo] = useState<TipoReclamo | 'todos'>('todos');
  const lista = tipo === 'todos' ? d.reclamos : d.reclamos.filter((r) => r.tipo === tipo);
  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
      <Tarjeta
        titulo={`Reclamos (${numero(d.reclamos.length)})`}
        descripcion={`Compensado por Rappi: ${d.compensado.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })}.${lista.length > MAX_FILAS ? ` Se ven los ${MAX_FILAS} más recientes; el Excel trae todos.` : ''}`}
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
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Reclamos del periodo en todas las sucursales</caption>
              <thead className="sticky top-0 bg-surface">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2 font-medium">Fecha</th>
                  <th className="px-3 py-2 font-medium">Sucursal</th>
                  <th className="px-3 py-2 font-medium">Producto</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Comentario del cliente</th>
                  <th className="px-5 py-2 text-right font-medium">Compensado</th>
                </tr>
              </thead>
              <tbody>
                {lista.slice(0, MAX_FILAS).map((r) => (
                  <tr key={r.pedido} className="border-t border-line align-top">
                    <td className="whitespace-nowrap px-5 py-2.5 text-xs text-ink-2">
                      {r.fecha.slice(5).split('-').reverse().join('/')}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      <Link
                        href={`/sucursales/${r.companyId}?seccion=servicio`}
                        className="font-semibold hover:underline"
                      >
                        {r.sucursal}
                      </Link>
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
                    <td className="max-w-[36ch] px-3 py-2.5 text-ink-2">
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
      <div className="space-y-6">
        <Tarjeta titulo="Productos con más reclamos" descripcion="En todas las sucursales, en el periodo.">
          {d.productos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin reclamos con producto.</p>
          ) : (
            <ol className="space-y-3">
              {d.productos.slice(0, 10).map((p) => (
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
        <TopRestaurantes d={d} />
      </div>
    </div>
  );
}
