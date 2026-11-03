'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { cn } from 'cn';
import type { TableroMexico } from '@/lib/sucursales/contratos';
import {
  etiquetaOrigen,
  filtrosOrigen,
  nombreDia,
  variacion,
  type FiltroOrigen,
} from '@/lib/sucursales/metricas';
import type { Origen } from '@/lib/sucursales/normalizar';
import { TRAMO_SEGUNDOS, filtrar, type Cifras, type PorOrigen, type Serie } from '@/lib/sucursales/resumen';
import { sumarDias } from '@/lib/sucursales/tiempo';
import { Tarjeta, Vacio } from '@/components/portal/piezas';
import { COLOR_ORIGEN, Delta, SERIE_BASE } from './colores';
import { etiquetaSemana } from './graficas-tendencias';
import {
  Anillo,
  AreaHoy,
  BarrasOrigen,
  Cifra,
  ColumnasHora,
  LeyendaOrigen,
  MapaEstados,
  ORIGENES,
  SemanasApiladas,
  type EstadoMapa,
} from './graficas-mexico';
import { ErrorCarga, Esqueleto } from './estados';
import { diaMes, dinero, hace, numero, porcentaje } from './formato';
import { NOTA_LINEAS } from './en-vivo';
import { useLectura } from './use-lectura';

const MXN = 'MXN';
const SEMANAS = [4, 8, 12] as const;
/** Una diferencia menor a ±3 % contra la semana pasada se pinta neutra. */
const UMBRAL = 0.03;

/**
 * Estado de cada ciudad configurada, para el mapa. Una ciudad nueva (doc 15, lotes) se agrega aquí; si falta, el
 * tablero la lista como «sin estado» y no la pierde.
 */
const ESTADO_DE_CIUDAD: Record<string, string> = {
  Guadalajara: 'JAL',
  'Puerto Vallarta': 'JAL',
  Tepatitlán: 'JAL',
  'Ciudad de México': 'CDMX',
  Toluca: 'MEX',
  Metepec: 'MEX',
  'Valle de Bravo': 'MEX',
  Cancún: 'QROO',
  Tulum: 'QROO',
  'Ciudad Juárez': 'CHIH',
  Chihuahua: 'CHIH',
  Mérida: 'YUC',
  Colima: 'COL',
  Manzanillo: 'COL',
  Aguascalientes: 'AGS',
  Zacatecas: 'ZAC',
  'San Luis Potosí': 'SLP',
  Querétaro: 'QRO',
  'San Miguel de Allende': 'GTO',
  León: 'GTO',
  Silao: 'GTO',
  Pachuca: 'HGO',
  Puebla: 'PUE',
  Veracruz: 'VER',
  Córdoba: 'VER',
  Oaxaca: 'OAX',
  'Tuxtla Gutiérrez': 'CHIS',
  Durango: 'DGO',
  Torreón: 'COAH',
  Tijuana: 'BC',
  Hermosillo: 'SON',
  Monterrey: 'NL',
  Morelia: 'MICH',
  Villahermosa: 'TAB',
  Acapulco: 'GRO',
  Mazatlán: 'SIN',
};

const hhmm = (seg: number) =>
  `${String(Math.floor(seg / 3600)).padStart(2, '0')}:${String(Math.floor((seg % 3600) / 60)).padStart(2, '0')}`;
const tono = (d: number | null) => (d === null || Math.abs(d) < UMBRAL ? 'neutro' : d > 0 ? 'sube' : 'baja');
const pasa = (o: Origen, f: FiltroOrigen) => f === 'todos' || o === f;

/** Suma de las cifras de varias sucursales con el filtro de origen. */
const sumar = (cs: Cifras[], f: FiltroOrigen) =>
  cs.reduce(
    (t, c) => {
      const x = filtrar(c, f);
      return { pedidos: t.pedidos + x.pedidos, venta: t.venta + x.venta_cent };
    },
    { pedidos: 0, venta: 0 },
  );

/** Series por hora (pedidos o venta, por origen) a partir de los tramos de 10 min; solo los orígenes del filtro. */
function porHora(tramos: PorOrigen<Serie>, f: FiltroOrigen, i: 0 | 1, acumulada: boolean) {
  const r = Object.fromEntries(ORIGENES.map((o) => [o, Array<number>(24).fill(0)])) as Record<
    Origen,
    number[]
  >;
  for (const o of ORIGENES) {
    const s = tramos[o];
    if (!s || !pasa(o, f)) continue;
    s[i].forEach((x, k) => (r[o][Math.floor((k * TRAMO_SEGUNDOS) / 3600)] += x));
    if (acumulada) {
      let acc = 0;
      r[o] = r[o].map((v) => (acc += v));
    }
  }
  return r;
}
const sumaHoras = (r: Record<Origen, number[]>) =>
  Array.from({ length: 24 }, (_, h) => ORIGENES.reduce((a, o) => a + r[o][h], 0));

/**
 * Tablero de México (docs/sucursales/16): la venta de todas las sucursales del usuario, sumada. Lee solo los totales
 * del corte (cada 10 min); el filtro de origen y el modo del mapa se aplican aquí, sin volver a leer.
 */
export function TableroMexicoVista() {
  const [semanas, setSemanas] = useState<(typeof SEMANAS)[number]>(8);
  const [origen, setOrigen] = useState<FiltroOrigen>('todos');
  const [modoMapa, setModoMapa] = useState<'venta' | 'cambio'>('venta');
  const { datos, error, cargando, recargar } = useLectura<TableroMexico>(
    `/api/sucursales/tablero?semanas=${semanas}`,
    { intervaloMs: 120_000 },
  );
  const v = useMemo(() => (datos ? calcular(datos, origen) : null), [datos, origen]);
  if (!datos || !v)
    return error ? <ErrorCarga error={error} alReintentar={recargar} /> : <Esqueleto filas={3} />;

  const edad = datos.hoy.ultimoCorte
    ? Math.max(0, (Date.parse(datos.generadoEn) - Date.parse(datos.hoy.ultimoCorte)) / 1000)
    : null;
  const estadoCorte =
    edad === null ? 'sin' : edad > 30 * 60 ? 'retrasado' : edad > 15 * 60 ? 'pendiente' : 'al-dia';
  const c = v.comparable;
  return (
    <div className="tablero-mx space-y-7" aria-busy={cargando}>
      <div className="placa flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={cn(
              'inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold',
              estadoCorte === 'al-dia' && 'bg-ok-soft text-ok',
              estadoCorte === 'pendiente' && 'bg-warn-soft text-warn',
              (estadoCorte === 'retrasado' || estadoCorte === 'sin') && 'bg-bad-soft text-bad',
            )}
          >
            <span
              aria-hidden="true"
              className={cn('size-1.5 rounded-full bg-current', estadoCorte === 'al-dia' && 'mx-vivo')}
            />
            {
              {
                sin: 'Sin corte todavía',
                retrasado: 'Corte retrasado',
                pendiente: 'Corte pendiente',
                'al-dia': 'Al día',
              }[estadoCorte]
            }
          </span>
          <span className="text-muted-foreground" aria-live="polite">
            {edad === null
              ? 'El primer corte aparece en los siguientes 10 minutos.'
              : `Último corte ${hace(edad)} · cada 10 min · ${v.total} sucursales`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmentos
            etiqueta="Origen"
            opciones={filtrosOrigen.map((o) => ({
              id: o,
              texto: o === 'todos' ? 'Todo' : o === 'app' ? 'App' : etiquetaOrigen[o],
              color: o === 'todos' ? undefined : COLOR_ORIGEN[o],
            }))}
            activa={origen}
            alCambiar={(o) => setOrigen(o as FiltroOrigen)}
          />
          <button
            type="button"
            onClick={recargar}
            className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3 text-sm font-semibold shadow-card active:scale-[0.97]"
          >
            <RefreshCw size={15} aria-hidden="true" className={cargando ? 'animate-spin' : ''} />
            Actualizar
          </button>
        </div>
      </div>

      {v.avisos.length > 0 && (
        <ul className="placa space-y-1 px-3 py-2 text-xs text-muted-foreground">
          {v.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      {/* 1. Hoy: la cifra del día, cuatro números clave y la curva por origen. */}
      <section
        data-entra
        style={{ '--i': 0 } as React.CSSProperties}
        className="rounded-2xl border border-line bg-surface p-5 shadow-card sm:p-6"
        aria-labelledby="mx-hoy"
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:items-end">
          <div>
            <h2 id="mx-hoy" className="text-sm font-medium text-ink-2">
              Venta de hoy{origen === 'todos' ? '' : ` · ${etiquetaOrigen[origen]}`}
            </h2>
            <p className="mt-2 font-display text-[2.6rem] font-black leading-none tracking-tight">
              <Cifra valor={v.hoy.venta} formato={(x) => dinero(Math.round(x), MXN, false)} />
            </p>
            <p className="mt-3 text-xs">
              {c ? (
                <Delta valor={c.venta} sufijo={c.sufijo} />
              ) : (
                <span className="text-muted-foreground">Sin base comparable todavía</span>
              )}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-y-4 sm:grid-cols-4 sm:divide-x sm:divide-line">
            <Numero etiqueta="Pedidos" nota={c ? <Delta valor={c.pedidos} /> : null}>
              <Cifra valor={v.hoy.pedidos} formato={(x) => numero(Math.round(x))} />
            </Numero>
            <Numero etiqueta="Ticket promedio" nota={c ? <Delta valor={c.ticket} /> : null}>
              {v.hoy.pedidos ? (
                <Cifra
                  valor={v.hoy.venta / v.hoy.pedidos}
                  formato={(x) => dinero(Math.round(x), MXN, false)}
                />
              ) : (
                '—'
              )}
            </Numero>
            <Numero
              etiqueta="Sucursales vendiendo"
              nota={v.sinCorte ? `${v.sinCorte} sin corte` : `de ${v.total}`}
            >
              <Cifra valor={v.conVenta} formato={(x) => numero(Math.round(x))} />
            </Numero>
            <Numero etiqueta="Va adelante" nota={v.lider ? dinero(v.lider.venta, MXN, false) : null}>
              <span className="block truncate text-[1.35rem]">{v.lider?.nombre ?? '—'}</span>
            </Numero>
          </dl>
        </div>
        <div className="mt-6 space-y-3">
          <LeyendaOrigen extra={[{ color: SERIE_BASE, etiqueta: `${v.dia} (referencia)`, linea: true }]} />
          <AreaHoy
            hoy={v.ventaHora}
            base={v.baseVentaHora}
            horaCorte={v.horaCorte}
            horaTexto={c?.hora ?? hhmm((v.horaCorte + 1) * 3600)}
            etiquetaBase={v.dia}
          />
        </div>
      </section>

      {/* 2. Dónde: el mapa por estado y las sucursales que más venden hoy. */}
      <div data-entra style={{ '--i': 1 } as React.CSSProperties} className="grid gap-6 xl:grid-cols-12">
        <Tarjeta
          className="xl:col-span-7"
          titulo="México hoy, por estado"
          descripcion={`${v.estadosConSucursales} de 32 estados con sucursales en el tablero. Toca o pasa el cursor sobre un estado para ver el detalle.`}
          acciones={
            <Segmentos
              etiqueta="Color del mapa"
              opciones={[
                { id: 'venta', texto: 'Venta' },
                { id: 'cambio', texto: 'Cambio' },
              ]}
              activa={modoMapa}
              alCambiar={(m) => setModoMapa(m as 'venta' | 'cambio')}
            />
          }
        >
          <MapaEstados estados={v.estados} modo={modoMapa} />
          {v.sinEstado.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Sin estado asignado: {v.sinEstado.join(', ')}.
            </p>
          )}
        </Tarjeta>
        <Tarjeta
          className="xl:col-span-5"
          titulo="Las que más venden hoy"
          descripcion="Top 10, con la mezcla de origen de cada una."
        >
          {v.top.length === 0 ? <Vacio titulo="Sin ventas hoy todavía" /> : <BarrasOrigen filas={v.top} />}
        </Tarjeta>
      </div>

      {/* 3. Cuándo y de dónde: ritmo por hora y mezcla por origen. */}
      <div data-entra style={{ '--i': 2 } as React.CSSProperties} className="grid gap-6 xl:grid-cols-12">
        <Tarjeta
          className="xl:col-span-7"
          titulo="Pedidos por hora"
          descripcion={`Hoy por origen; en gris, ${v.dia}.`}
        >
          <ColumnasHora
            hoy={v.pedidosHora}
            base={v.basePedidosHora}
            horaCorte={v.horaCorte}
            etiquetaBase={v.dia}
          />
        </Tarjeta>
        <Tarjeta
          className="xl:col-span-5"
          titulo="De dónde viene la venta"
          descripcion="Mostrador, App y Rappi, hoy."
        >
          <Anillo segmentos={v.mezcla} centro={v.mezclaCentro.valor} detalle={v.mezclaCentro.detalle} />
        </Tarjeta>
      </div>

      {/* 4. Cada sucursal, agrupada por ciudad. */}
      <div data-entra style={{ '--i': 3 } as React.CSSProperties}>
        <Mosaico grupos={v.mosaico} hora={c?.hora ?? null} dia={v.dia} />
      </div>

      {/* 5. El periodo: semanas completas. */}
      <section
        data-entra
        style={{ '--i': 4 } as React.CSSProperties}
        aria-labelledby="mx-periodo"
        className="space-y-5"
      >
        <div className="placa flex flex-wrap items-center justify-between gap-3 px-3 py-2">
          <h2 id="mx-periodo" className="font-display text-lg font-bold">
            Últimas {semanas} semanas
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {etiquetaSemana(datos.periodo.desde, datos.periodo.hasta)}, de lunes a domingo
            </span>
          </h2>
          <Segmentos
            etiqueta="Semanas"
            opciones={SEMANAS.map((n) => ({ id: String(n), texto: `${n} sem.` }))}
            activa={String(semanas)}
            alCambiar={(n) => setSemanas(Number(n) as (typeof SEMANAS)[number])}
          />
        </div>
        {datos.periodo.diasLeidos === 0 ? (
          <Tarjeta>
            <Vacio titulo="Todavía no hay semanas guardadas">
              Las semanas aparecen cuando el corte guarda su historial.
            </Vacio>
          </Tarjeta>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-y-4 rounded-2xl border border-line bg-surface p-5 shadow-card sm:grid-cols-4 sm:divide-x sm:divide-line">
              <Numero etiqueta="Venta del periodo" grande>
                <Cifra valor={v.periodo.venta} formato={(x) => dinero(Math.round(x), MXN, false)} />
              </Numero>
              <Numero etiqueta="Pedidos" grande>
                <Cifra valor={v.periodo.pedidos} formato={(x) => numero(Math.round(x))} />
              </Numero>
              <Numero etiqueta="Ticket promedio" grande>
                {v.periodo.pedidos
                  ? dinero(Math.round(v.periodo.venta / v.periodo.pedidos), MXN, false)
                  : '—'}
              </Numero>
              <Numero
                etiqueta="Última semana"
                grande
                nota={<Delta valor={v.periodo.ultimaVsAnterior} sufijo="vs la anterior" />}
              >
                {v.periodo.ultima === null ? '—' : dinero(v.periodo.ultima, MXN, false)}
              </Numero>
            </dl>
            <div className="grid gap-6 xl:grid-cols-12">
              <Tarjeta
                className="xl:col-span-7"
                titulo="Venta por semana"
                descripcion="Apilada por origen. Una semana sin todos sus días guardados va rayada."
              >
                <div className="space-y-3">
                  <LeyendaOrigen />
                  <SemanasApiladas semanas={v.semanas} />
                </div>
              </Tarjeta>
              <Tarjeta
                className="xl:col-span-5"
                titulo="Lo más vendido"
                descripcion="Por importe: producto y sus personalizaciones."
              >
                {v.productos.length === 0 ? (
                  <Vacio titulo="Sin productos en el periodo" />
                ) : (
                  <>
                    <BarrasOrigen filas={v.productos} />
                    <p className="mt-4 text-xs text-muted-foreground">* {NOTA_LINEAS}</p>
                  </>
                )}
              </Tarjeta>
            </div>
            <Tarjeta
              titulo="Sucursales en el periodo"
              descripcion="Ordenadas por venta. Toca una para abrir su tablero."
              cuerpo={false}
            >
              <TablaSucursales filas={v.tabla} />
            </Tarjeta>
          </>
        )}
      </section>
    </div>
  );
}

/** Control segmentado con un punto de color opcional (los orígenes llevan su color). */
function Segmentos({
  etiqueta,
  opciones,
  activa,
  alCambiar,
}: {
  etiqueta: string;
  opciones: { id: string; texto: string; color?: string }[];
  activa: string;
  alCambiar: (id: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={etiqueta}
      className="flex rounded-[10px] border border-line-strong bg-surface p-0.5"
    >
      {opciones.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={activa === o.id}
          onClick={() => alCambiar(o.id)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-[8px] px-3 text-sm font-semibold transition-colors duration-200 active:scale-[0.97]',
            activa === o.id ? 'bg-ink text-crema' : 'text-ink-2 hover:bg-surface-2',
          )}
        >
          {o.color && (
            <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: o.color }} />
          )}
          {o.texto}
        </button>
      ))}
    </div>
  );
}

function Numero({
  etiqueta,
  nota,
  grande,
  children,
}: {
  etiqueta: string;
  nota?: React.ReactNode;
  grande?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 px-0 sm:px-4 sm:first:pl-0">
      <dt className="text-xs font-medium text-ink-2">{etiqueta}</dt>
      <dd
        className={cn(
          'mt-1 font-display font-black leading-tight tracking-tight',
          grande ? 'text-[1.9rem]' : 'text-[1.6rem]',
        )}
      >
        {children}
      </dd>
      {nota && <dd className="mt-1 text-xs text-muted-foreground">{nota}</dd>}
    </div>
  );
}

function Mosaico({
  grupos,
  hora,
  dia,
}: {
  grupos: ReturnType<typeof calcular>['mosaico'];
  hora: string | null;
  dia: string;
}) {
  return (
    <Tarjeta
      titulo="Cómo va cada sucursal hoy"
      descripcion={
        hora
          ? `Venta de hoy, su mezcla de origen y su cambio frente a ${dia} a la misma hora. Verde sube más de 3 %; rojo baja más de 3 %.`
          : 'Venta de hoy de cada sucursal.'
      }
    >
      <div className="space-y-6">
        {grupos.map((g) => (
          <section key={g.ciudad} aria-label={g.ciudad} className="space-y-2.5">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
              <span className="font-display text-base font-bold">{g.ciudad}</span>
              <span className="tabular text-muted-foreground">{dinero(g.venta, MXN, false)}</span>
              {g.delta !== null && <Delta valor={g.delta} />}
            </p>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2">
              {g.sucursales.map((s) => (
                <li key={s.companyId}>
                  <Link
                    href={`/sucursales/${s.companyId}`}
                    className={cn(
                      'group flex h-full flex-col gap-1.5 rounded-xl border p-3 transition-[transform,box-shadow,background-color] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:scale-[0.98] [@media(hover:hover)]:hover:-translate-y-0.5 [@media(hover:hover)]:hover:shadow-lift',
                      s.tono === 'sube' && 'border-ok/35 bg-ok-soft/70',
                      s.tono === 'baja' && 'border-bad/35 bg-bad-soft/70',
                      s.tono === 'neutro' && 'border-line bg-surface/70',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{s.nombre}</span>
                      {g.varias && (
                        <span className="block truncate text-xs text-muted-foreground">{s.ciudad}</span>
                      )}
                    </span>
                    <span className="font-display text-lg font-black leading-tight tabular">
                      {s.sinCorte ? '—' : dinero(s.venta, MXN, false)}
                    </span>
                    <span
                      aria-hidden="true"
                      className="flex h-1.5 gap-[2px] overflow-hidden rounded-full bg-white/60"
                    >
                      {ORIGENES.map((o) =>
                        (s.por[o] ?? 0) > 0 ? (
                          <span key={o} style={{ flexGrow: s.por[o], backgroundColor: COLOR_ORIGEN[o] }} />
                        ) : null,
                      )}
                    </span>
                    <span className="text-xs">
                      {s.sinCorte ? (
                        <span className="text-muted-foreground">Sin corte de hoy</span>
                      ) : s.delta === null ? (
                        <span className="text-muted-foreground">Sin semana pasada</span>
                      ) : (
                        <Delta valor={s.delta} />
                      )}
                      {!s.sinCorte && !s.completa && (
                        <span
                          className="ml-1 text-muted-foreground"
                          title="Alguna lectura de hoy quedó incompleta"
                        >
                          · parcial
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Tarjeta>
  );
}

function TablaSucursales({ filas }: { filas: ReturnType<typeof calcular>['tabla'] }) {
  const max = Math.max(1, ...filas.map((f) => f.venta));
  return (
    <div className="max-h-[30rem] overflow-auto">
      <table className="tabla w-full text-sm">
        <thead className="sticky top-0 z-[1]">
          <tr>
            <th className="text-left">Sucursal</th>
            <th className="w-[34%] text-left">Venta</th>
            <th className="text-right">Pedidos</th>
            <th className="text-right">Ticket</th>
            <th className="text-right">Parte</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.companyId}>
              <td>
                <Link href={`/sucursales/${f.companyId}`} className="font-medium hover:underline">
                  {f.nombre}
                </Link>
                <span className="block text-xs text-muted-foreground">{f.ciudad}</span>
              </td>
              <td>
                <span className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-right tabular font-semibold">
                    {dinero(f.venta, MXN, false)}
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex h-2 flex-1 gap-[2px] overflow-hidden rounded-full bg-surface-2"
                  >
                    <span
                      className="mx-barra flex h-full gap-[2px] overflow-hidden rounded-full"
                      style={{ width: `${(f.venta / max) * 100}%` }}
                    >
                      {ORIGENES.map((o) =>
                        (f.por[o] ?? 0) > 0 ? (
                          <span key={o} style={{ flexGrow: f.por[o], backgroundColor: COLOR_ORIGEN[o] }} />
                        ) : null,
                      )}
                    </span>
                  </span>
                </span>
              </td>
              <td className="text-right tabular">{numero(f.pedidos)}</td>
              <td className="text-right tabular">
                {f.pedidos ? dinero(Math.round(f.venta / f.pedidos), MXN, false) : '—'}
              </td>
              <td className="text-right tabular">{porcentaje(f.parte, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const porOrigen = (c: Cifras, f: FiltroOrigen) =>
  Object.fromEntries(ORIGENES.filter((o) => pasa(o, f)).map((o) => [o, c[o]?.venta_cent ?? 0])) as Partial<
    Record<Origen, number>
  >;

/** Todo lo que se pinta, con el filtro de origen aplicado. Exportada para las pruebas. */
export function calcular(d: TableroMexico, f: FiltroOrigen) {
  const ss = d.hoy.sucursales;
  const conCorte = ss.filter((s) => !s.sinCorte);
  const hoy = sumar(
    conCorte.map((s) => s.hoy),
    f,
  );
  const comparables = conCorte.filter((s) => s.comparable);
  const hoyC = sumar(
    comparables.map((s) => s.comparable!.hoy),
    f,
  );
  const baseC = sumar(
    comparables.map((s) => s.comparable!.base),
    f,
  );
  const horas = [...new Set(comparables.map((s) => s.comparadoA!))];
  const diaBase = sumarDias(
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date(d.generadoEn)),
    -7,
  );
  const dia = `${nombreDia(diaBase)} ${diaMes(diaBase)}`;
  const hora = horas.length === 1 ? hhmm(horas[0]) : 'la misma hora local';
  const comparable =
    comparables.length && baseC.venta > 0
      ? {
          venta: variacion(hoyC.venta, baseC.venta),
          pedidos: variacion(hoyC.pedidos, baseC.pedidos),
          ticket:
            hoyC.pedidos && baseC.pedidos
              ? variacion(hoyC.venta / hoyC.pedidos, baseC.venta / baseC.pedidos)
              : null,
          hora,
          sufijo: `vs ${dia} a las ${hora}${comparables.length < conCorte.length ? ` (${comparables.length} de ${conCorte.length} sucursales)` : ''}`,
        }
      : null;

  // Curva y ritmo: hoy hasta la última hora con tramos completos; la semana pasada, el día completo.
  const horaCorte = Math.max(
    0,
    Math.floor(((Math.max(1, d.hoy.curva.hastaTramo) - 1) * TRAMO_SEGUNDOS) / 3600),
  );
  const hayBase = Object.keys(d.hoy.curva.base).length > 0;
  const ventaHora = porHora(d.hoy.curva.hoy, f, 1, true);
  const pedidosHora = porHora(d.hoy.curva.hoy, f, 0, false);
  const baseVentaHora = hayBase ? sumaHoras(porHora(d.hoy.curva.base, f, 1, true)) : null;
  const basePedidosHora = hayBase ? sumaHoras(porHora(d.hoy.curva.base, f, 0, false)) : null;

  const celdas = ss.map((s) => {
    const venta = filtrar(s.hoy, f).venta_cent;
    const delta = s.comparable
      ? variacion(filtrar(s.comparable.hoy, f).venta_cent, filtrar(s.comparable.base, f).venta_cent || null)
      : null;
    return { ...s, venta, delta, tono: tono(delta), por: porOrigen(s.hoy, f) };
  });
  const lider = [...celdas].sort((a, b) => b.venta - a.venta)[0];

  // Mapa por estado.
  const estados = new Map<string, EstadoMapa & { hoyC: number; baseC: number }>();
  const sinEstado = new Set<string>();
  for (const s of celdas) {
    const clave = ESTADO_DE_CIUDAD[s.ciudad];
    if (!clave) {
      sinEstado.add(s.ciudad);
      continue;
    }
    const e = estados.get(clave) ?? {
      clave,
      sucursales: 0,
      venta: 0,
      delta: null,
      nombres: [],
      hoyC: 0,
      baseC: 0,
    };
    e.sucursales++;
    e.venta += s.venta;
    e.nombres.push(s.nombre);
    if (s.comparable) {
      e.hoyC += filtrar(s.comparable.hoy, f).venta_cent;
      e.baseC += filtrar(s.comparable.base, f).venta_cent;
    }
    estados.set(clave, e);
  }
  for (const e of estados.values()) e.delta = e.baseC ? variacion(e.hoyC, e.baseC) : null;

  const top = [...celdas]
    .filter((s) => s.venta > 0)
    .sort((a, b) => b.venta - a.venta)
    .slice(0, 10)
    .map((s) => ({
      clave: String(s.companyId),
      nombre: s.nombre,
      detalle: s.ciudad,
      href: `/sucursales/${s.companyId}`,
      por: s.por,
      valor: <span className="font-semibold">{dinero(s.venta, MXN, false)}</span>,
      nota: s.delta === null ? '—' : <Delta valor={s.delta} />,
    }));

  const total = (c: Cifras, o: Origen) => c[o]?.venta_cent ?? 0;
  const mezcla = ORIGENES.filter((o) => pasa(o, f)).map((o) => ({
    clave: o,
    etiqueta: etiquetaOrigen[o],
    color: COLOR_ORIGEN[o],
    valor: conCorte.reduce((a, s) => a + total(s.hoy, o), 0),
  }));
  const mezclaTotal = mezcla.reduce((a, s) => a + s.valor, 0);
  const principal = [...mezcla].sort((a, b) => b.valor - a.valor)[0];
  const mezclaCentro =
    mezclaTotal && principal
      ? { valor: porcentaje(principal.valor / mezclaTotal, 0), detalle: principal.etiqueta }
      : { valor: '—', detalle: 'sin ventas' };

  // Ciudades con 3 sucursales o más van en su propio grupo; las demás, juntas en «Más ciudades» (con la ciudad en
  // cada celda), para que el mosaico no se vuelva una columna de grupos de una sola sucursal.
  const grupo = (ciudad: string, de: typeof celdas, varias = false) => {
    const comp = de.filter((s) => s.comparable);
    const h = sumar(
      comp.map((s) => s.comparable!.hoy),
      f,
    ).venta;
    const b = sumar(
      comp.map((s) => s.comparable!.base),
      f,
    ).venta;
    return {
      ciudad,
      varias,
      venta: de.reduce((a, s) => a + s.venta, 0),
      delta: b ? variacion(h, b) : null,
      sucursales: [...de].sort((a, b2) => b2.venta - a.venta || a.nombre.localeCompare(b2.nombre)),
    };
  };
  const porCiudad = [...new Set(ss.map((s) => s.ciudad))].map((ciudad) => ({
    ciudad,
    de: celdas.filter((s) => s.ciudad === ciudad),
  }));
  const chicas = porCiudad.filter((c) => c.de.length < 3);
  const ciudades = [
    ...porCiudad
      .filter((c) => c.de.length >= 3)
      .map((c) => grupo(c.ciudad, c.de))
      .sort((a, b) => b.venta - a.venta || a.ciudad.localeCompare(b.ciudad)),
    ...(chicas.length
      ? [
          grupo(
            'Más ciudades',
            chicas.flatMap((c) => c.de),
            true,
          ),
        ]
      : []),
  ];

  // Periodo.
  const semanas = d.periodo.semanas.map((w) => ({
    clave: w.semana,
    etiqueta: etiquetaSemana(w.semana, sumarDias(w.semana, 6)),
    por: porOrigen(w.cifras, f),
    parcial: w.dias < 7,
    venta: filtrar(w.cifras, f).venta_cent,
  }));
  const completas = semanas.filter((w) => !w.parcial);
  const ultima = completas.at(-1)?.venta ?? null;
  const anterior = completas.at(-2)?.venta ?? null;
  const tp = d.periodo.semanas.reduce(
    (t, w) => {
      const x = filtrar(w.cifras, f);
      return { venta: t.venta + x.venta_cent, pedidos: t.pedidos + x.pedidos };
    },
    { venta: 0, pedidos: 0 },
  );

  const prods = d.periodo.productos
    .map((p) => {
      const por = Object.fromEntries(
        (Object.entries(p.por) as [Origen, [number, number]][])
          .filter(([o]) => pasa(o, f))
          .map(([o, x]) => [o, x[1]]),
      ) as Partial<Record<Origen, number>>;
      const lineas = (Object.entries(p.por) as [Origen, [number, number]][])
        .filter(([o]) => pasa(o, f))
        .reduce((a, [, x]) => a + x[0], 0);
      const importe = Object.values(por).reduce((a, x) => a + (x ?? 0), 0);
      return { p, por, lineas, importe };
    })
    .filter((x) => x.importe > 0)
    .sort((a, b) => b.importe - a.importe);
  const totalProd = prods.reduce((a, x) => a + x.importe, 0);
  const productos = prods.slice(0, 10).map((x) => ({
    clave: x.p.clave,
    nombre: x.p.nombre,
    detalle: `${x.p.sucursales} suc.`,
    por: x.por,
    valor: (
      <>
        <span className="font-semibold">{dinero(x.importe, MXN, false)}</span>
        <span className="ml-2 text-xs text-muted-foreground">
          {porcentaje(totalProd ? x.importe / totalProd : null, 0)}
        </span>
      </>
    ),
    nota: `${numero(x.lineas)} lín.*`,
  }));

  const filasPeriodo = d.periodo.sucursales.map((s) => {
    const t = filtrar(s.cifras, f);
    return {
      companyId: s.companyId,
      nombre: s.nombre,
      ciudad: s.ciudad,
      venta: t.venta_cent,
      pedidos: t.pedidos,
      por: porOrigen(s.cifras, f),
    };
  });
  const totalPeriodo = filasPeriodo.reduce((a, s) => a + s.venta, 0);
  const tabla = filasPeriodo
    .map((s) => ({ ...s, parte: totalPeriodo ? s.venta / totalPeriodo : null }))
    .sort((a, b) => b.venta - a.venta);

  const sinCorte = ss.length - conCorte.length;
  const incompletas = conCorte.filter((s) => !s.completa).length;
  const avisos = [
    incompletas === 1
      ? '1 sucursal con alguna lectura incompleta hoy: su venta puede ir por debajo.'
      : incompletas
        ? `${incompletas} sucursales con alguna lectura incompleta hoy: su venta puede ir por debajo.`
        : '',
    d.periodo.incompletos
      ? `${d.periodo.incompletos} ${d.periodo.incompletos === 1 ? 'día de sucursal' : 'días de sucursal'} del periodo con lectura incompleta.`
      : '',
    f === 'rappi' ? 'Rappi solo está en las sucursales que ya leen el portal de Rappi.' : '',
  ].filter(Boolean);

  return {
    total: ss.length,
    sinCorte,
    conVenta: celdas.filter((s) => s.venta > 0).length,
    hoy,
    comparable,
    dia,
    lider: lider && lider.venta > 0 ? { nombre: lider.nombre, venta: lider.venta } : null,
    horaCorte,
    ventaHora,
    baseVentaHora,
    pedidosHora,
    basePedidosHora,
    estados: [...estados.values()],
    estadosConSucursales: estados.size,
    sinEstado: [...sinEstado],
    top,
    mezcla,
    mezclaCentro,
    mosaico: ciudades,
    semanas,
    periodo: {
      venta: tp.venta,
      pedidos: tp.pedidos,
      ultima,
      ultimaVsAnterior: ultima !== null && anterior ? variacion(ultima, anterior) : null,
    },
    productos,
    tabla,
    avisos,
  };
}
