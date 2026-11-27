'use client';
import { useState } from 'react';
import { Clock3, Gauge, Info, ListChecks, TriangleAlert } from 'lucide-react';
import { cn } from 'cn';
import type { CanalServicio } from '@/lib/sucursales/servicio';
import {
  HORAS_REVISAR,
  MINUTOS_RETRASO,
  type ConteoMenu,
  type ItemRevisar,
  type LecturaMenu,
  type Nivel,
  type RespuestaMenu,
  type RespuestaMenuNacional,
} from '@/lib/sucursales/menu-rappi';
import { Tarjeta, Vacio } from '@/components/portal/piezas';
import { ErrorCarga, Esqueleto } from './estados';
import { AZUL } from './colores';
import { fechaCorta, hace, horaDe, numero, porcentaje } from './formato';
import { useLectura } from './use-lectura';
import { EnlaceSucursal } from './enlace-sucursal';
import { conCiudad, useCiudadTablero } from './ciudad-tablero';

/**
 * Menú/Carta de Rappi (docs/rappi-portal/09): qué productos y toppings tiene apagados cada tienda, desde cuándo y qué hay
 * que revisar. Se lee cada 30 min del portal y la pantalla se relee cada 5 min. Skills frontend-design, dataviz y
 * movimiento-web: un solo contenedor de indicadores, color solo en las marcas y siempre con texto o ícono, y el único
 * movimiento es el punto vivo de la lectura (nada con movimiento reducido).
 */
const ZONA = 'America/Mexico_City';
const CANAL: Record<CanalServicio, string> = { normal: 'Rappi', turbo: 'Turbo' };
const RELEER_MS = 5 * 60_000;

/** «3 h», «2 días»: tiempo en un estado. */
export function duracion(horas: number) {
  if (horas < 1) return `${Math.max(1, Math.round(horas * 60))} min`;
  if (horas < 48) return `${Math.round(horas)} h`;
  return `${Math.round(horas / 24)} días`;
}
/** «hace 3 h» o «desde antes del 23 nov» (si ya estaba así en la primera lectura). */
export function tiempoTexto(x: { horas: number | null; previo: boolean }, primera: string | null) {
  if (x.horas === null) return '—';
  if (x.previo)
    return primera ? `desde antes del ${fechaCorta(fechaLocal(primera))}` : `al menos ${duracion(x.horas)}`;
  return `hace ${duracion(x.horas)}`;
}
const fechaLocal = (iso: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date(iso));

// ── Apartados de Nivel de servicio ───────────────────────────────────────────────────────────────────────────────
export type Apartado = 'servicio' | 'menu';
export const apartadoDeUrl = (): Apartado =>
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('apartado') === 'menu'
    ? 'menu'
    : 'servicio';

/** Servicio (indicadores, conectividad y reclamos) o Menú (productos apagados); viaja en la URL (?apartado=menu). */
export function ApartadosServicio({
  activo,
  alCambiar,
}: {
  activo: Apartado;
  alCambiar: (a: Apartado) => void;
}) {
  const elegir = (a: Apartado) => {
    alCambiar(a);
    const p = new URLSearchParams(window.location.search);
    if (a === 'menu') p.set('apartado', 'menu');
    else p.delete('apartado');
    window.history.replaceState(null, '', `${window.location.pathname}${p.toString() ? `?${p}` : ''}`);
  };
  const opciones: { id: Apartado; texto: string; icono: typeof Gauge }[] = [
    { id: 'servicio', texto: 'Servicio', icono: Gauge },
    { id: 'menu', texto: 'Menú en Rappi', icono: ListChecks },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Apartado de Nivel de servicio"
      className="inline-flex rounded-[10px] border border-line-strong bg-surface p-0.5"
    >
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={activo === o.id}
          onClick={() => elegir(o.id)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-sm font-semibold transition-colors duration-200',
            activo === o.id ? 'bg-ink text-crema' : 'text-ink-2 hover:bg-surface-2',
          )}
        >
          <o.icono size={15} aria-hidden="true" />
          {o.texto}
        </button>
      ))}
    </div>
  );
}

// ── Piezas comunes ────────────────────────────────────────────────────────────────────────────────────────────────
function EstadoLectura({ l }: { l: LecturaMenu }) {
  const tono =
    l.estado === 'al-dia'
      ? 'bg-ok-soft text-ok'
      : l.estado === 'retrasada'
        ? 'bg-warn-soft text-warn'
        : 'bg-bad-soft text-bad';
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" aria-live="polite">
      <span
        className={cn('inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold', tono)}
      >
        <span
          aria-hidden="true"
          className={cn(
            'size-1.5 rounded-full bg-current',
            l.estado === 'al-dia' && 'motion-safe:animate-pulse',
          )}
        />
        {l.estado === 'al-dia'
          ? 'En vivo'
          : l.estado === 'retrasada'
            ? 'Lectura retrasada'
            : 'Sin lectura todavía'}
      </span>
      <span className="text-muted-foreground">
        {l.minutos === null
          ? 'El menú aparece con la primera lectura del portal (cada 30 min).'
          : `Menú leído ${hace(l.minutos * 60)} · se lee cada 30 min${l.estado === 'retrasada' ? `; pasó de ${MINUTOS_RETRASO} min` : ''}.`}
        {l.fallidas.length > 0 && ` No se pudo leer en la última corrida: ${l.fallidas.join(', ')}.`}
      </span>
    </div>
  );
}

/** Indicadores del menú en un solo contenedor. */
function IndicadoresMenu({ titulo, t, hallazgo }: { titulo: string; t: ConteoMenu; hallazgo?: string }) {
  const celdas: { titulo: string; valor: string; detalle: string; alerta?: 'bad' | 'warn' }[] = [
    {
      titulo: 'Productos apagados',
      valor: numero(t.apagados),
      detalle: `de ${numero(t.productos)} · ${porcentaje(t.productos ? t.apagados / t.productos : null, 0)} del menú`,
    },
    {
      titulo: 'Toppings apagados',
      valor: numero(t.toppingsApagados),
      detalle: `de ${numero(t.toppings)} opciones`,
    },
    {
      titulo: 'No se pueden pedir',
      valor: numero(t.noSePuedenPedir),
      detalle: 'encendidos, sin opción en un grupo obligatorio',
      alerta: t.noSePuedenPedir ? 'bad' : undefined,
    },
    {
      titulo: 'Por revisar',
      valor: numero(t.revisar),
      detalle: `apagados hace ${HORAS_REVISAR} h o más`,
      alerta: t.revisar ? 'warn' : undefined,
    },
    { titulo: 'Sin foto', valor: numero(t.sinFoto), detalle: 'productos' },
    { titulo: 'Sin descripción', valor: numero(t.sinDescripcion), detalle: 'productos' },
  ];
  return (
    <section
      aria-labelledby="indicadores-menu"
      className="rounded-2xl border border-line bg-surface shadow-card"
    >
      <header className="px-5 pt-5">
        <h2 id="indicadores-menu">{titulo}</h2>
        {hallazgo && <p className="mt-1 text-sm text-ink-2">{hallazgo}</p>}
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
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {c.alerta && (
                <TriangleAlert
                  size={13}
                  aria-hidden="true"
                  className={c.alerta === 'bad' ? 'text-bad' : 'text-warn'}
                />
              )}
              {c.titulo}
            </dt>
            <dd
              className={cn(
                'mt-1 font-display text-[22px] font-black leading-none tabular sm:text-[26px]',
                c.alerta === 'bad' ? 'text-bad' : 'text-ink',
              )}
            >
              {c.valor}
            </dd>
            <dd className="mt-1.5 text-xs text-muted-foreground">{c.detalle}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const NIVEL: Record<Nivel, { texto: string; clase: string; icono: typeof Info }> = {
  grave: { texto: 'Grave', clase: 'bg-bad-soft text-bad', icono: TriangleAlert },
  alto: { texto: 'Revisar', clase: 'bg-warn-soft text-warn', icono: Clock3 },
  medio: { texto: 'Apagado', clase: 'bg-surface-2 text-ink-2', icono: Clock3 },
  info: { texto: 'Info', clase: 'bg-surface-2 text-muted-foreground', icono: Info },
};

function ChipNivel({ n }: { n: Nivel }) {
  const x = NIVEL[n];
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold', x.clase)}
    >
      <x.icono size={12} aria-hidden="true" />
      {x.texto}
    </span>
  );
}

/** Lo que hay que revisar, de lo más grave y antiguo a lo menos. */
function ListaRevisar({
  items,
  primera,
  conSucursal,
  vacio,
}: {
  items: (ItemRevisar & { companyId?: number; sucursal?: string })[];
  primera: string | null;
  conSucursal?: boolean;
  vacio: string;
}) {
  const [filtro, setFiltro] = useState<'todo' | 'alertas'>('alertas');
  const alertas = items.filter((x) => x.nivel !== 'info');
  const lista = filtro === 'alertas' ? alertas : items;
  return (
    <Tarjeta
      titulo="Por revisar"
      descripcion={`Primero lo que no se puede pedir, luego lo apagado hace ${HORAS_REVISAR} h o más y lo apagado hoy. Lo informativo (sin foto, precio distinto) va en «Todo».`}
      acciones={
        <div
          role="radiogroup"
          aria-label="Qué ver"
          className="inline-flex rounded-[10px] border border-line-strong p-0.5"
        >
          {(
            [
              ['alertas', `Alertas (${numero(alertas.length)})`],
              ['todo', `Todo (${numero(items.length)})`],
            ] as const
          ).map(([id, texto]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={filtro === id}
              onClick={() => setFiltro(id)}
              className={cn(
                'h-7 rounded-[8px] px-2.5 text-xs font-semibold',
                filtro === id ? 'bg-ink text-crema' : 'text-ink-2 hover:bg-surface-2',
              )}
            >
              {texto}
            </button>
          ))}
        </div>
      }
      cuerpo={false}
    >
      {lista.length === 0 ? (
        <div className="px-5 pb-5">
          <Vacio titulo={vacio} />
        </div>
      ) : (
        // relative: los textos solo para lectores de pantalla quedan dentro del recorte.
        <div className="relative mt-3 max-h-[32rem] overflow-auto border-t border-line">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Productos y toppings por revisar</caption>
            <thead className="sticky top-0 z-[1] bg-surface">
              <tr className="text-left text-xs text-muted-foreground">
                <th className="px-5 py-2 font-medium">Nivel</th>
                {conSucursal && <th className="px-3 py-2 font-medium">Sucursal</th>}
                <th className="px-3 py-2 font-medium">Producto</th>
                <th className="px-3 py-2 font-medium">Motivo</th>
                <th className="px-5 py-2 text-right font-medium">Desde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lista.map((x, i) => (
                <tr key={`${x.tienda}-${x.tipo}-${x.nombre}-${x.motivo}-${i}`}>
                  <td className="px-5 py-2.5 align-top">
                    <ChipNivel n={x.nivel} />
                  </td>
                  {conSucursal && (
                    <td className="px-3 py-2.5 align-top">
                      {x.companyId ? (
                        <EnlaceSucursal
                          companyId={x.companyId}
                          href={`/sucursales/${x.companyId}?seccion=servicio&apartado=menu`}
                          className="font-medium hover:underline"
                        >
                          {x.sucursal}
                        </EnlaceSucursal>
                      ) : (
                        x.sucursal
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2.5 align-top">
                    <span className="block font-medium text-ink">{x.nombre}</span>
                    <span className="block text-xs text-muted-foreground">
                      {CANAL[x.canal]}
                      {x.tipo === 'topping' ? ' · topping' : ''}
                      {x.categoria ? ` · ${x.categoria}` : ''}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 align-top text-ink-2">{x.motivo}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right align-top tabular text-muted-foreground">
                    {tiempoTexto(x, primera)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

// ── Una sucursal ─────────────────────────────────────────────────────────────────────────────────────────────────
export function MenuRappi({ companyId }: { companyId: number }) {
  const { datos, error, recargar } = useLectura<RespuestaMenu>(`/api/sucursales/${companyId}/menu`, {
    intervaloMs: RELEER_MS,
  });
  if (!datos) return error ? <ErrorCarga error={error} alReintentar={recargar} /> : <Esqueleto filas={3} />;
  const d = datos;
  const t = d.totales;
  const hallazgo = [
    t.noSePuedenPedir
      ? `${numero(t.noSePuedenPedir)} ${t.noSePuedenPedir === 1 ? 'producto encendido no se puede pedir' : 'productos encendidos no se pueden pedir'}`
      : null,
    t.apagados ? `${numero(t.apagados)} productos apagados` : null,
    t.toppingsApagados ? `${numero(t.toppingsApagados)} toppings apagados` : null,
  ].filter(Boolean);
  return (
    <div className="space-y-6">
      {error && <ErrorCarga error={error} alReintentar={recargar} />}
      <div className="placa px-3 py-2">
        <EstadoLectura l={d.lectura} />
      </div>
      {d.lectura.estado === 'sin' ? (
        <div className="rounded-2xl border border-line bg-surface shadow-card">
          <Vacio titulo="Todavía no hay lectura del menú">
            El lector del portal de Rappi lee el menú de cada tienda cada 30 min; aparece aquí con la primera
            lectura.
          </Vacio>
        </div>
      ) : (
        <>
          <IndicadoresMenu
            titulo="Menú en Rappi, ahora"
            t={t}
            hallazgo={
              hallazgo.length ? hallazgo.join(' · ') : 'Todo el menú está encendido y se puede pedir.'
            }
          />
          <PorTienda d={d} />
          <ListaRevisar items={d.revisar} primera={d.lectura.primera} vacio="Nada por revisar en el menú" />
          <div className="grid gap-6 lg:grid-cols-2">
            <ToppingsApagados d={d} />
            <CambiosRecientes d={d} />
          </div>
        </>
      )}
      <p className="placa px-3 py-2 text-xs text-muted-foreground">
        Fuente: Menú/Carta del portal de Rappi Partners, leído cada 30 min (solo lectura; nada se cambia en
        Rappi). Rappi no dice desde cuándo está apagado algo: el «desde» sale de nuestras lecturas
        {d.lectura.primera ? `, que empezaron el ${fechaCorta(fechaLocal(d.lectura.primera))}` : ''}.
      </p>
    </div>
  );
}

function PorTienda({ d }: { d: RespuestaMenu }) {
  if (d.canales.length < 2) return null;
  return (
    <Tarjeta titulo="Por tienda" descripcion="Rappi y Rappi Turbo tienen su propio menú." cuerpo={false}>
      <div className="relative mt-3 overflow-x-auto border-t border-line">
        <table className="w-full min-w-[520px] text-sm">
          <caption className="sr-only">Menú por tienda</caption>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="px-5 py-2 font-medium">Tienda</th>
              <th className="px-3 py-2 text-right font-medium">Productos apagados</th>
              <th className="px-3 py-2 text-right font-medium">Toppings apagados</th>
              <th className="px-3 py-2 text-right font-medium">No se pueden pedir</th>
              <th className="px-5 py-2 text-right font-medium">Por revisar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {d.canales.map((c) => (
              <tr key={c.id}>
                <td className="px-5 py-2.5 font-semibold">{CANAL[c.canal]}</td>
                <td className="px-3 py-2.5 text-right tabular">
                  {numero(c.conteo.apagados)}
                  <span className="text-muted-foreground"> de {numero(c.conteo.productos)}</span>
                </td>
                <td className="px-3 py-2.5 text-right tabular">
                  {numero(c.conteo.toppingsApagados)}
                  <span className="text-muted-foreground"> de {numero(c.conteo.toppings)}</span>
                </td>
                <td
                  className={cn(
                    'px-3 py-2.5 text-right tabular',
                    c.conteo.noSePuedenPedir && 'font-semibold text-bad',
                  )}
                >
                  {numero(c.conteo.noSePuedenPedir)}
                </td>
                <td className="px-5 py-2.5 text-right tabular">{numero(c.conteo.revisar)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  );
}

function ToppingsApagados({ d }: { d: RespuestaMenu }) {
  return (
    <Tarjeta titulo="Toppings apagados" descripcion="Por grupo de opciones, con cuántos productos los usan.">
      {d.toppingsApagados.length === 0 ? (
        <Vacio titulo="Todas las opciones están encendidas" />
      ) : (
        <ul className="space-y-4">
          {d.toppingsApagados.map((g) => (
            <li key={g.grupo}>
              <p className="text-xs font-semibold text-ink-2">{g.grupo}</p>
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {g.items.map((x) => (
                  <li
                    key={`${x.canal}-${x.nombre}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2/60 px-2.5 py-1 text-xs"
                    title={tiempoTexto(x, d.lectura.primera)}
                  >
                    <span className="font-medium text-ink">{x.nombre}</span>
                    <span className="text-muted-foreground">
                      {CANAL[x.canal]} · {numero(x.productos)} prod.
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}

function CambiosRecientes({ d }: { d: RespuestaMenu }) {
  return (
    <Tarjeta
      titulo="Cambios en las últimas 24 h"
      descripcion="Lo que se apagó o se prendió entre lecturas (cada 30 min)."
    >
      {d.cambios.length === 0 ? (
        <Vacio titulo="Sin cambios en las últimas 24 h" />
      ) : (
        <ol className="relative max-h-[22rem] space-y-2.5 overflow-auto pr-1">
          {d.cambios.map((x, i) => (
            <li key={`${x.cuando}-${x.nombre}-${i}`} className="flex items-start gap-3 text-sm">
              <span className="w-12 shrink-0 pt-0.5 text-xs tabular text-muted-foreground">
                {horaDe(Date.parse(x.cuando), ZONA)}
              </span>
              <span
                aria-hidden="true"
                className={cn('mt-1.5 size-2 shrink-0 rounded-full', x.disponible ? 'bg-ok' : 'bg-bad')}
              />
              <span className="min-w-0">
                <span className="font-medium text-ink">{x.nombre}</span>{' '}
                <span className="text-ink-2">{x.disponible ? 'se prendió' : 'se apagó'}</span>
                <span className="block text-xs text-muted-foreground">
                  {CANAL[x.canal]}
                  {x.tipo === 'topping' ? ' · topping' : ''}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </Tarjeta>
  );
}

// ── Tablero de México ────────────────────────────────────────────────────────────────────────────────────────────
export function MenuRappiNacional() {
  const ciudad = useCiudadTablero();
  const { datos, error, recargar } = useLectura<RespuestaMenuNacional>(conCiudad('/api/sucursales/menu-nacional', ciudad), {
    intervaloMs: RELEER_MS,
  });
  if (!datos) return error ? <ErrorCarga error={error} alReintentar={recargar} /> : <Esqueleto filas={3} />;
  const d = datos;
  const conApagados = d.sucursales.filter((s) => s.conteo.apagados > 0).length;
  return (
    <div className="space-y-6">
      {error && <ErrorCarga error={error} alReintentar={recargar} />}
      <div className="placa px-3 py-2">
        <EstadoLectura l={d.lectura} />
      </div>
      {d.lectura.estado === 'sin' ? (
        <div className="rounded-2xl border border-line bg-surface shadow-card">
          <Vacio titulo="Todavía no hay lectura del menú">
            El lector del portal de Rappi lee el menú de cada tienda cada 30 min; aparece aquí con la primera
            lectura.
          </Vacio>
        </div>
      ) : (
        <>
          <IndicadoresMenu
            titulo={`Menú en Rappi, ahora: ${numero(d.sucursales.length)} sucursales`}
            t={d.totales}
            hallazgo={`${numero(conApagados)} de ${numero(d.sucursales.length)} sucursales tienen productos apagados${d.enVarias.length ? `; ${numero(d.enVarias.length)} productos están apagados en dos o más` : ''}.`}
          />
          <div className="grid gap-6 xl:grid-cols-12">
            <div className="xl:col-span-7">
              <TopSucursales d={d} />
            </div>
            <div className="xl:col-span-5">
              <EnVarias d={d} />
            </div>
          </div>
          <ListaRevisar
            items={d.revisar}
            primera={d.lectura.primera}
            conSucursal
            vacio="Nada por revisar en los menús"
          />
          {(d.sinLectura.length > 0 || d.sinTienda.length > 0) && (
            <p className="placa px-3 py-2 text-xs text-muted-foreground">
              {d.sinLectura.length > 0 && `Sin lectura del menú todavía: ${d.sinLectura.join(', ')}. `}
              {d.sinTienda.length > 0 &&
                `Sin tienda en el portal de Rappi (no cuentan): ${d.sinTienda.join(', ')}.`}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** Las sucursales con más productos apagados: barra por la parte del menú apagada, a la misma escala. */
function TopSucursales({ d }: { d: RespuestaMenuNacional }) {
  const [todas, setTodas] = useState(false);
  const filas = d.sucursales.filter((s) => s.conteo.apagados > 0 || s.conteo.toppingsApagados > 0);
  const vista = todas ? filas : filas.slice(0, 10);
  const max = Math.max(0.01, ...filas.map((s) => s.parte ?? 0));
  return (
    <Tarjeta
      titulo="Sucursales con más productos apagados"
      descripcion="La barra es la parte de su menú apagada; cada sucursal abre su menú."
    >
      {filas.length === 0 ? (
        <Vacio titulo="Ninguna sucursal tiene productos apagados" />
      ) : (
        <>
          <ol className="divide-y divide-line">
            {vista.map((s, i) => (
              <li
                key={s.companyId}
                className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2.5 sm:grid-cols-[1.75rem_minmax(0,12rem)_minmax(0,1fr)_6.5rem]"
              >
                <span className="font-display text-lg font-black tabular text-ink-2">{i + 1}</span>
                <span className="min-w-0">
                  <EnlaceSucursal
                    companyId={s.companyId}
                    href={`/sucursales/${s.companyId}?seccion=servicio&apartado=menu`}
                    className="block truncate font-semibold hover:underline"
                  >
                    {s.nombre}
                  </EnlaceSucursal>
                  <span className="block truncate text-xs text-muted-foreground">
                    {s.ciudad}
                    {s.conteo.toppingsApagados ? ` · ${numero(s.conteo.toppingsApagados)} toppings` : ''}
                    {s.masAntiguo?.horas != null
                      ? ` · el más antiguo ${tiempoTexto(s.masAntiguo, d.lectura.primera)}`
                      : ''}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="col-span-3 col-start-1 row-start-2 block h-2.5 overflow-hidden rounded-full bg-surface-2 sm:col-span-1 sm:col-start-auto sm:row-start-auto"
                >
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${((s.parte ?? 0) / max) * 100}%`, backgroundColor: AZUL.fuerte }}
                  />
                </span>
                <span className="text-right">
                  <span className="block font-semibold tabular">
                    {numero(s.conteo.apagados)}
                    <span className="text-xs font-normal text-muted-foreground">
                      {' '}
                      de {numero(s.conteo.productos)}
                    </span>
                  </span>
                  <span className="block text-xs tabular text-muted-foreground">
                    {porcentaje(s.parte, 0)} del menú
                    {s.conteo.noSePuedenPedir ? (
                      <span className="text-bad"> · {numero(s.conteo.noSePuedenPedir)} sin pedir</span>
                    ) : null}
                  </span>
                </span>
              </li>
            ))}
          </ol>
          {filas.length > 10 && (
            <button
              type="button"
              onClick={() => setTodas((x) => !x)}
              className="mt-3 inline-flex h-9 items-center rounded-[10px] border border-line-strong bg-surface px-3 text-sm font-semibold shadow-card"
            >
              {todas ? 'Ver solo las 10 primeras' : `Ver las ${numero(filas.length)} sucursales`}
            </button>
          )}
        </>
      )}
    </Tarjeta>
  );
}

/** Productos apagados en dos o más sucursales: si es una parte grande de donde existe, puede ser falta de abasto. */
function EnVarias({ d }: { d: RespuestaMenuNacional }) {
  return (
    <Tarjeta
      titulo="Apagados en varias sucursales"
      descripcion="Por nombre del producto. «Abasto» marca los apagados en 30 % o más de las tiendas que lo tienen."
      cuerpo={false}
    >
      {d.enVarias.length === 0 ? (
        <div className="px-5 pb-5">
          <Vacio titulo="Ningún producto está apagado en dos o más sucursales" />
        </div>
      ) : (
        <ul className="relative mt-3 max-h-[30rem] divide-y divide-line overflow-auto border-t border-line">
          {d.enVarias.map((x) => (
            <li key={x.nombre_norm} className="px-5 py-2.5">
              <details>
                <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="font-medium text-ink">{x.nombre}</span>
                    {x.abasto && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">
                        <TriangleAlert size={11} aria-hidden="true" />
                        Abasto
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right text-xs tabular text-muted-foreground">
                    <span className="font-semibold text-ink">{numero(x.sucursales.length)} sucursales</span>
                    {' · '}
                    {numero(x.tiendasApagado)} de {numero(x.tiendasConProducto)} tiendas
                  </span>
                </summary>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {x.sucursales.map((s) => s.nombre).join(', ')}
                </p>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Tarjeta>
  );
}
