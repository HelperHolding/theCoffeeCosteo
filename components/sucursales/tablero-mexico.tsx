'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, RefreshCw } from 'lucide-react';
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
import {
  TRAMOS,
  TRAMO_SEGUNDOS,
  filtrar,
  sumaFiltrada,
  type Cifras,
  type PorOrigen,
  type Serie,
} from '@/lib/sucursales/resumen';
import { HISTORIAL_DESDE, RANGO_MAX_DIAS } from '@/lib/sucursales/tablero-fechas';
import { diasEntre, fechaValida, sumarDias } from '@/lib/sucursales/tiempo';
import { Tarjeta, Vacio } from '@/components/portal/piezas';
import { Button } from '@/components/ui/button';
import { Segmentos } from '@/components/ui/segmentos';
import { AZUL, COLOR_ORIGEN, Delta, SERIE_BASE } from './colores';
import { etiquetaSemana } from './graficas-tendencias';
import {
  BarrasOrigen,
  CalendarioVenta,
  Cambio,
  Cifra,
  ColumnasHora,
  CurvaHoy,
  LeyendaOrigen,
  ListaEstados,
  MapaMexico,
  MezclaOrigen,
  MOMENTO_HOY,
  ORIGENES,
  SemanasApiladas,
  hhmm,
  type EstadoMapa,
  type FilaMezcla,
  type Momento,
  type SemanaColumna,
} from './graficas-mexico';
import { ErrorCarga, Esqueleto } from './estados';
import { diaMes, dinero, hace, numero, porcentaje } from './formato';
import { NOTA_LINEAS } from './en-vivo';
import { useLectura } from './use-lectura';

const MXN = 'MXN';
const SEMANAS = [4, 8, 12] as const;
/** Una diferencia menor a ±3 % contra la semana pasada se pinta neutra. */
const UMBRAL = 0.03;
/** Ciudades que se ven sin pedir más (las demás, con «Ver las N ciudades»). */
const CIUDADES_VISIBLES = 8;

/**
 * Estado de cada ciudad configurada, para el mapa. Una ciudad nueva (doc 15, lotes) se agrega aquí. Si falta, el
 * tablero la avisa arriba y bajo el mapa (cuenta en los totales, pero no se pinta). La prueba
 * «cada ciudad configurada tiene estado» falla antes de llegar a producción.
 */
export const ESTADO_DE_CIUDAD: Record<string, string> = {
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
  'Los Cabos': 'BCS',
  Hermosillo: 'SON',
  Monterrey: 'NL',
  Morelia: 'MICH',
  Villahermosa: 'TAB',
  Acapulco: 'GRO',
  Mazatlán: 'SIN',
};

const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const pasa = (o: Origen, f: FiltroOrigen) => f === 'todos' || o === f;
const lunesDe = (fecha: string) => sumarDias(fecha, -((new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7));
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** La gráfica de semanas, por día (rango). */
const TEXTOS_DIA = {
  grafica: 'Venta por día por origen',
  parcial: 'día con lectura incompleta',
  contra: 'contra el mismo día de la semana anterior',
};
const lista = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`;

/** Suma de las cifras de varias sucursales con el filtro de origen. */
const sumar = (cs: Cifras[], f: FiltroOrigen) =>
  cs.reduce(
    (t, c) => {
      const x = filtrar(c, f);
      return { pedidos: t.pedidos + x.pedidos, venta: t.venta + x.venta_cent };
    },
    { pedidos: 0, venta: 0 },
  );

/** Qué se ve: hoy en vivo, un día cerrado o un rango de días cerrados (docs/sucursales/16). */
type Vista =
  { modo: 'vivo' } | { modo: 'dia'; dia: string } | { modo: 'rango'; desde: string; hasta: string };

const hoyCdmx = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());

/**
 * Tablero de México (docs/sucursales/16): la venta de todas las sucursales del usuario, sumada. Lee solo los totales
 * del corte (cada 10 min); el filtro de origen y el modo del mapa se aplican aquí, sin volver a leer. El selector de
 * fechas cambia lo que se lee: hoy en vivo, un día o un rango.
 */
export function TableroMexicoVista() {
  const [semanas, setSemanas] = useState<(typeof SEMANAS)[number]>(8);
  const [origen, setOrigen] = useState<FiltroOrigen>('todos');
  const [modoMapa, setModoMapa] = useState<'venta' | 'cambio'>('venta');
  const [vista, setVista] = useState<Vista>({ modo: 'vivo' });
  const fechas =
    vista.modo === 'dia'
      ? `&dia=${vista.dia}`
      : vista.modo === 'rango'
        ? `&desde=${vista.desde}&hasta=${vista.hasta}`
        : '';
  const { datos, error, cargando, recargar } = useLectura<TableroMexico>(
    `/api/sucursales/tablero?semanas=${semanas}${fechas}`,
    // Un día o un rango cerrados no cambian: solo hoy se vuelve a leer.
    { intervaloMs: vista.modo === 'vivo' ? 120_000 : undefined },
  );
  const v = useMemo(() => (datos ? calcular(datos, origen) : null), [datos, origen]);

  const edad = datos?.hoy.ultimoCorte
    ? Math.max(0, (Date.parse(datos.generadoEn) - Date.parse(datos.hoy.ultimoCorte)) / 1000)
    : null;
  const estadoCorte =
    edad === null ? 'sin' : edad > 30 * 60 ? 'retrasado' : edad > 15 * 60 ? 'pendiente' : 'al-dia';
  return (
    <div className="tablero-mx space-y-7" aria-busy={cargando}>
      <div className="placa flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <SelectorFechas vista={vista} alCambiar={setVista} />
          {vista.modo === 'vivo' && datos && (
            <span className="flex items-center gap-2" title="Se actualiza cada 10 minutos.">
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
                  : `Último corte ${hace(edad)}.`}
              </span>
            </span>
          )}
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
          {vista.modo === 'vivo' && (
            <Button variant="outline" size="sm" onClick={recargar} aria-busy={cargando || undefined}>
              <RefreshCw aria-hidden="true" className={cargando ? 'motion-safe:animate-spin' : ''} />
              Actualizar
            </Button>
          )}
        </div>
      </div>
      {!datos || !v ? (
        error ? (
          <ErrorCarga error={error} alReintentar={recargar} />
        ) : (
          <Esqueleto filas={3} />
        )
      ) : (
        <Cuerpo
          datos={datos}
          v={v}
          origen={origen}
          semanas={semanas}
          alSemanas={setSemanas}
          modoMapa={modoMapa}
          alModoMapa={setModoMapa}
        />
      )}
    </div>
  );
}

/** Hoy en vivo, un día o un rango: botones y campos de fecha (del historial a ayer, rangos de hasta 120 días). */
function SelectorFechas({ vista, alCambiar }: { vista: Vista; alCambiar: (v: Vista) => void }) {
  const ayer = useMemo(() => sumarDias(hoyCdmx(), -1), []);
  const [dia, setDia] = useState(vista.modo === 'dia' ? vista.dia : ayer);
  const [desde, setDesde] = useState(vista.modo === 'rango' ? vista.desde : sumarDias(ayer, -6));
  const [hasta, setHasta] = useState(vista.modo === 'rango' ? vista.hasta : ayer);
  const fuera = (f: string) => !fechaValida(f) || f < HISTORIAL_DESDE || f > ayer;
  const problemaRango = (d: string, h: string) =>
    fuera(d) || fuera(h)
      ? `Elige fechas del ${diaMes(HISTORIAL_DESDE)} a ayer.`
      : d > h
        ? 'La fecha de inicio va antes de la final.'
        : diasEntre(d, h) + 1 > RANGO_MAX_DIAS
          ? `El rango puede tener hasta ${RANGO_MAX_DIAS} días.`
          : null;
  const problema =
    vista.modo === 'dia' && fuera(dia)
      ? `Elige un día del ${diaMes(HISTORIAL_DESDE)} a ayer.`
      : vista.modo === 'rango'
        ? problemaRango(desde, hasta)
        : null;
  const alDia = (x: string) => {
    setDia(x);
    if (!fuera(x)) alCambiar({ modo: 'dia', dia: x });
  };
  const alRango = (d: string, h: string) => {
    setDesde(d);
    setHasta(h);
    if (!problemaRango(d, h)) alCambiar({ modo: 'rango', desde: d, hasta: h });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmentos
        etiqueta="Qué ver"
        opciones={[
          { id: 'vivo', texto: 'Hoy' },
          { id: 'dia', texto: 'Un día' },
          { id: 'rango', texto: 'Rango' },
        ]}
        activa={vista.modo}
        alCambiar={(m) =>
          m === 'dia' ? alDia(dia) : m === 'rango' ? alRango(desde, hasta) : alCambiar({ modo: 'vivo' })
        }
      />
      {vista.modo === 'dia' && (
        <CampoFecha etiqueta="Día" valor={dia} min={HISTORIAL_DESDE} max={ayer} alCambiar={alDia} />
      )}
      {vista.modo === 'rango' && (
        <>
          <CampoFecha
            etiqueta="Del"
            valor={desde}
            min={HISTORIAL_DESDE}
            max={hasta || ayer}
            alCambiar={(x) => alRango(x, hasta)}
          />
          <CampoFecha
            etiqueta="al"
            valor={hasta}
            min={desde || HISTORIAL_DESDE}
            max={ayer}
            alCambiar={(x) => alRango(desde, x)}
          />
        </>
      )}
      {problema && (
        <span role="alert" className="text-xs font-medium text-bad">
          {problema}
        </span>
      )}
    </div>
  );
}

function CampoFecha({
  etiqueta,
  valor,
  min,
  max,
  alCambiar,
}: {
  etiqueta: string;
  valor: string;
  min: string;
  max: string;
  alCambiar: (fecha: string) => void;
}) {
  return (
    <label className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-line-strong bg-surface pl-3 pr-2 text-sm shadow-card focus-within:ring-2 focus-within:ring-ink">
      <span className="text-xs font-medium text-ink-2">{etiqueta}</span>
      <input
        type="date"
        value={valor}
        min={min}
        max={max}
        onChange={(e) => alCambiar(e.target.value)}
        className="bg-transparent font-semibold tabular text-ink outline-none"
      />
    </label>
  );
}

function Cuerpo({
  datos,
  v,
  origen,
  semanas,
  alSemanas,
  modoMapa,
  alModoMapa,
}: {
  datos: TableroMexico;
  v: Calculo;
  origen: FiltroOrigen;
  semanas: (typeof SEMANAS)[number];
  alSemanas: (n: (typeof SEMANAS)[number]) => void;
  modoMapa: 'venta' | 'cambio';
  alModoMapa: (m: 'venta' | 'cambio') => void;
}) {
  const c = v.comparable;
  const origenes = ORIGENES.filter((o) => pasa(o, origen));
  const m = v.momento;
  return (
    <>
      {v.avisos.length > 0 && (
        <ul className="placa space-y-1 px-3 py-2 text-xs text-muted-foreground">
          {v.avisos.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}

      {/* 1. El día (o el rango): la cifra, cuatro números clave y la curva por origen (o la venta por día). */}
      <section
        data-entra
        style={{ '--i': 0 } as React.CSSProperties}
        className="rounded-2xl border border-line bg-surface shadow-card"
        aria-labelledby="mx-hoy"
      >
        <div className="grid gap-x-8 gap-y-5 p-5 sm:p-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,2fr)] lg:items-center">
          <div className="min-w-0">
            <h2 id="mx-hoy" className="text-sm font-medium text-ink-2">
              {v.titulo}
              {origen === 'todos' ? '' : `, ${etiquetaOrigen[origen]}`}
            </h2>
            <p className="mt-1.5 font-display text-[2.5rem] font-black leading-none tracking-[-0.03em]">
              <Cifra valor={v.hoy.venta} formato={(x) => dinero(Math.round(x), MXN, false)} />
            </p>
            <p className="mt-3">
              {c ? (
                <Delta valor={c.venta} sufijo={c.sufijo} />
              ) : (
                <span className="text-xs text-muted-foreground">
                  {v.modo === 'vivo' ? 'Sin base comparable todavía' : 'Sin base para comparar'}
                </span>
              )}
            </p>
          </div>
          <dl className="grid grid-cols-2 gap-y-5 sm:grid-cols-4 sm:divide-x sm:divide-line">
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
              etiqueta={v.modo === 'vivo' ? 'Con venta hoy' : 'Con venta'}
              nota={
                v.sinCorte ? (
                  `${v.sinCorte} ${v.modo === 'vivo' ? 'sin corte' : 'sin datos'}`
                ) : v.sinVenta.length ? (
                  <span
                    title={`Sin venta${v.modo === 'vivo' ? ' todavía' : ''}: ${lista(v.sinVenta)}`}
                    className="line-clamp-2"
                  >
                    Sin venta: {lista(v.sinVenta)}
                  </span>
                ) : v.modo === 'vivo' ? (
                  'todas vendiendo'
                ) : (
                  'todas vendieron'
                )
              }
            >
              <span className="tabular">
                {numero(v.conVenta)}
                <span className="text-base font-bold text-muted-foreground"> de {numero(v.total)}</span>
              </span>
            </Numero>
            {v.modo === 'vivo' ? (
              <Numero
                etiqueta={v.ultimaHora ? `Última hora, ${v.ultimaHora.etiqueta}` : 'Última hora'}
                nota={v.ultimaHora ? <Delta valor={v.ultimaHora.delta} /> : null}
              >
                {v.ultimaHora ? dinero(v.ultimaHora.venta, MXN, false) : '—'}
              </Numero>
            ) : v.rango ? (
              <Numero etiqueta="Promedio por día" nota={`venta de ${numero(v.rango.dias)} días`}>
                <Cifra valor={v.rango.porDia} formato={(x) => dinero(Math.round(x), MXN, false)} />
              </Numero>
            ) : (
              <Numero
                etiqueta={v.pico ? `Hora pico, ${hh(v.pico.hora)} a ${hh(v.pico.hora + 1)}` : 'Hora pico'}
                nota={v.pico ? `pedidos, ${dinero(v.pico.venta, MXN, false)}` : null}
              >
                {v.pico ? numero(v.pico.pedidos) : '—'}
              </Numero>
            )}
          </dl>
        </div>
        <div className="border-t border-line px-5 pb-4 pt-4 sm:px-6">
          {v.rango ? (
            <>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div>
                  <h3 className="text-sm font-semibold">Venta por día</h3>
                  <p className="text-xs text-muted-foreground">
                    Apilada por origen; abajo, el cambio contra el mismo día de la semana anterior.
                  </p>
                </div>
                <LeyendaOrigen solo={origenes} />
              </div>
              <SemanasApiladas
                semanas={v.rango.columnas}
                rappiDesde={v.rango.rappi}
                rappiTexto={v.rango.rappi ? `Rappi desde el ${diaMes(v.rango.rappi)}` : undefined}
                textos={TEXTOS_DIA}
              />
            </>
          ) : (
            <>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="text-sm font-semibold">Venta acumulada en el día</h3>
                <LeyendaOrigen
                  solo={origenes}
                  extra={
                    v.hayBase ? [{ color: SERIE_BASE, etiqueta: `${v.dia}, día completo`, linea: true }] : []
                  }
                />
              </div>
              <CurvaHoy
                hoy={v.ventaTramo}
                base={v.baseVentaTramo}
                hastaTramo={v.hastaTramo}
                etiquetaBase={v.dia}
                paso={v.paso}
                cerrado={v.modo !== 'vivo'}
                corto={m.corto}
              />
              {v.paso > 1 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Por hora: de los días de hace más de una semana solo se guardan las horas.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* 2. Dónde: el mapa por estado y la lista de estados con el mismo color. */}
      <div data-entra style={{ '--i': 1 } as React.CSSProperties} className="grid gap-6 xl:grid-cols-12">
        <Tarjeta
          className="xl:col-span-8"
          titulo={`México ${m.cuando}, por estado`}
          descripcion={`${v.estados.filter((e) => e.sucursales).length} estados con ${v.sinTienda.length ? 'tienda en Rappi' : 'sucursales'}. Pasa el cursor o el foco por un estado para ver su detalle; el Valle de México va ampliado.`}
          acciones={
            <Segmentos
              etiqueta="Color del mapa"
              opciones={[
                { id: 'venta', texto: 'Venta' },
                { id: 'cambio', texto: 'Cambio' },
              ]}
              activa={modoMapa}
              alCambiar={(x) => alModoMapa(x as 'venta' | 'cambio')}
            />
          }
        >
          <MapaMexico estados={v.estados} modo={modoMapa} momento={m} />
          {v.sinEstado.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Sin estado asignado: {v.sinEstado.join(', ')}.
            </p>
          )}
        </Tarjeta>
        <Tarjeta
          className="xl:col-span-4"
          titulo="Por estado"
          descripcion={
            modoMapa === 'venta'
              ? `De más a menos venta ${m.cuando}, con el color del mapa.`
              : `Cambio contra ${m.contra}, con el color del mapa.`
          }
        >
          {/* relative: los textos solo para lectores de pantalla quedan dentro del recorte (no alargan la página). */}
          <div className="relative -mr-2 max-h-[32rem] overflow-auto pr-2">
            <ListaEstados estados={v.estados} modo={modoMapa} />
          </div>
        </Tarjeta>
      </div>

      {/* 3. Cuándo y de dónde: ritmo por hora (o lo más vendido del rango) y mezcla por origen. */}
      <div data-entra style={{ '--i': 2 } as React.CSSProperties} className="grid gap-6 xl:grid-cols-12">
        {v.rango ? (
          <Tarjeta
            className="xl:col-span-7"
            titulo="Lo más vendido"
            descripcion={`Por importe, ${m.cuando}: producto con sus personalizaciones, y en cuántas sucursales se vendió.`}
          >
            {v.rango.productos.length === 0 ? (
              <Vacio titulo="Sin productos en el rango" />
            ) : (
              <>
                <BarrasOrigen filas={v.rango.productos} />
                <p className="mt-4 text-xs text-muted-foreground">* {NOTA_LINEAS}</p>
              </>
            )}
          </Tarjeta>
        ) : (
          <Tarjeta
            className="xl:col-span-7"
            titulo="Pedidos por hora"
            descripcion={
              v.pico
                ? `Hora pico: ${hh(v.pico.hora)} a ${hh(v.pico.hora + 1)}, con ${numero(v.pico.pedidos)} pedidos. En gris, ${v.dia}${v.modo === 'vivo' ? ' hasta el mismo corte' : ''}.`
                : `${capital(m.cuando)} por origen; en gris, ${v.dia}${v.modo === 'vivo' ? ' hasta el mismo corte' : ''}.`
            }
          >
            <div className="space-y-3">
              <LeyendaOrigen
                solo={origenes}
                extra={v.hayBase ? [{ color: '#e4dfd5', etiqueta: v.dia }] : []}
              />
              <ColumnasHora
                hoy={v.pedidosHora}
                base={v.basePedidosHora}
                baseHasta={v.baseHastaPedidosHora}
                horaEnCurso={v.horaEnCurso}
                ultimaHora={v.ultimaHoraConDatos}
                etiquetaBase={v.dia}
                corto={m.corto}
              />
            </div>
          </Tarjeta>
        )}
        <Tarjeta
          className="xl:col-span-5"
          titulo="De dónde viene la venta"
          descripcion={`${capital(m.cuando)}, por origen. El cambio es contra ${m.contra}.`}
        >
          <MezclaOrigen filas={v.mezcla} momento={m} />
        </Tarjeta>
      </div>

      {/* 4. Cada sucursal: las 5 que más venden y cada ciudad con todas las suyas. */}
      <div data-entra style={{ '--i': 3 } as React.CSSProperties}>
        <Tarjeta
          titulo={v.modo === 'vivo' ? 'Cómo va cada sucursal hoy' : `Cómo le fue a cada sucursal ${m.cuando}`}
          descripcion={`Las 5 que más ${v.modo === 'vivo' ? 'venden' : 'vendieron'} y, abajo, cada ciudad: ábrela para ver todas sus sucursales. El cambio es contra ${m.contra}.`}
        >
          <div className="space-y-7">
            {v.top.length === 0 ? (
              <Vacio titulo={v.modo === 'vivo' ? 'Sin ventas hoy todavía' : `Sin ventas ${m.cuando}`} />
            ) : (
              <Podio
                filas={v.top}
                titulo={
                  v.modo === 'vivo' ? 'Las 5 que más venden hoy' : `Las 5 que más vendieron ${m.cuando}`
                }
              />
            )}
            <Ciudades grupos={v.ciudades} momento={m} />
            {v.sinTienda.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Sin tienda en Rappi (no cuentan en este filtro):{' '}
                {lista(v.sinTienda.map((s) => `${s.nombre} (${s.ciudad})`))}.
              </p>
            )}
          </div>
        </Tarjeta>
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
            alCambiar={(n) => alSemanas(Number(n) as (typeof SEMANAS)[number])}
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
            <dl className="grid grid-cols-2 gap-y-5 rounded-2xl border border-line bg-surface p-5 shadow-card sm:grid-cols-4 sm:divide-x sm:divide-line">
              <Numero
                etiqueta="Venta del periodo"
                grande
                nota={`${dinero(v.periodo.porSemana, MXN, false)} por semana en promedio`}
              >
                <Cifra valor={v.periodo.venta} formato={(x) => dinero(Math.round(x), MXN, false)} />
              </Numero>
              <Numero
                etiqueta="Pedidos"
                grande
                nota={v.periodo.porDia ? `${numero(Math.round(v.periodo.porDia))} por día en promedio` : null}
              >
                <Cifra valor={v.periodo.pedidos} formato={(x) => numero(Math.round(x))} />
              </Numero>
              <Numero
                etiqueta="Ticket promedio"
                grande
                nota={<Delta valor={v.periodo.ticketVsAnterior} sufijo="última semana vs la anterior" />}
              >
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
                descripcion={`Apilada por origen, con el cambio contra la semana anterior. Una semana sin todos sus días guardados va rayada.${v.rappi ? ` Rappi se lee del portal desde el ${diaMes(v.rappi.desde)}: las semanas anteriores no lo incluyen.` : ''}`}
              >
                <div className="space-y-3">
                  <LeyendaOrigen solo={origenes} />
                  <SemanasApiladas
                    semanas={v.semanas}
                    rappiDesde={v.rappi?.semana ?? null}
                    rappiTexto={v.rappi ? `Rappi desde el ${diaMes(v.rappi.desde)}` : undefined}
                  />
                </div>
              </Tarjeta>
              <Tarjeta
                className="xl:col-span-5"
                titulo="Venta por día"
                descripcion="Cada cuadro es un día; el azul más fuerte, los días que más venden."
              >
                <CalendarioVenta dias={v.calendario} desde={datos.periodo.desde} semanas={datos.semanas} />
              </Tarjeta>
            </div>
            <div className="grid gap-6 xl:grid-cols-12">
              <Tarjeta
                className="xl:col-span-5"
                titulo="Lo más vendido"
                descripcion="Por importe: producto con sus personalizaciones, y en cuántas sucursales se vendió."
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
              <Tarjeta
                className="xl:col-span-7"
                titulo="Sucursales en el periodo"
                descripcion="Ordenadas por venta, con su tendencia semana a semana y el cambio de la última semana contra la anterior. Toca una para abrir su tablero."
                cuerpo={false}
              >
                <TablaSucursales filas={v.tabla} />
              </Tarjeta>
            </div>
          </>
        )}
      </section>
    </>
  );
}

/** Control segmentado con un punto de color opcional (los orígenes llevan su color). */
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
      <dt className="truncate text-xs font-medium text-ink-2">{etiqueta}</dt>
      <dd
        className={cn(
          'mt-1 truncate font-display font-black leading-tight tracking-[-0.02em]',
          grande ? 'text-[1.75rem]' : 'text-[1.5rem]',
        )}
      >
        {children}
      </dd>
      {nota && <dd className="mt-1 text-xs text-muted-foreground">{nota}</dd>}
    </div>
  );
}

type Calculo = ReturnType<typeof calcular>;

/** Las 5 sucursales que más venden: rango, nombre, barra por origen a la misma escala, venta y cambio. */
function Podio({ filas, titulo }: { filas: Calculo['top']; titulo: string }) {
  const max = Math.max(1, ...filas.map((f) => f.venta));
  return (
    <section aria-labelledby="mx-top">
      <h3 id="mx-top" className="mb-2 text-sm font-semibold">
        {titulo}
      </h3>
      <ol className="divide-y divide-line">
        {filas.map((s, i) => (
          <li
            key={s.companyId}
            className="grid grid-cols-[2.25rem_minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 py-3 sm:grid-cols-[2.5rem_minmax(0,14rem)_minmax(0,1fr)_7.5rem_5rem]"
          >
            <span
              className={cn(
                'font-display text-[1.75rem] font-black leading-none tabular',
                i === 0 ? 'text-crema-strong' : 'text-ink',
              )}
            >
              {i + 1}
            </span>
            <span className="min-w-0">
              <Link
                href={`/sucursales/${s.companyId}`}
                className="block truncate font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                {s.nombre}
              </Link>
              <span className="block truncate text-xs text-muted-foreground tabular">
                {s.ciudad} · {numero(s.pedidos)} pedidos · ticket{' '}
                {s.pedidos ? dinero(Math.round(s.venta / s.pedidos), MXN, false) : '—'}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="col-span-3 col-start-1 row-start-2 block h-3 overflow-hidden rounded-full bg-surface-2 sm:col-span-1 sm:col-start-auto sm:row-start-auto"
            >
              <span
                className="mx-barra flex h-full gap-[2px] overflow-hidden rounded-full"
                style={{ width: `${(s.venta / max) * 100}%`, '--i': i } as React.CSSProperties}
              >
                {ORIGENES.map((o) =>
                  (s.por[o] ?? 0) > 0 ? (
                    <span key={o} style={{ flexGrow: s.por[o], backgroundColor: COLOR_ORIGEN[o] }} />
                  ) : null,
                )}
              </span>
            </span>
            <span className="text-right">
              <span className="block font-display text-lg font-black tabular sm:text-xl">
                {dinero(s.venta, MXN, false)}
              </span>
              <span className="mt-0.5 block sm:hidden">
                <Cambio valor={s.delta} umbral={UMBRAL} />
              </span>
            </span>
            <span className="hidden text-right sm:block">
              <Cambio valor={s.delta} umbral={UMBRAL} />
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Cada ciudad en una fila que se abre para mostrar todas sus sucursales. */
function Ciudades({ grupos, momento }: { grupos: Calculo['ciudades']; momento: Momento }) {
  const [abiertas, setAbiertas] = useState<Set<string>>(new Set());
  const [todas, setTodas] = useState(false);
  const visibles = todas ? grupos : grupos.slice(0, CIUDADES_VISIBLES);
  const max = Math.max(1, ...grupos.map((g) => g.venta));
  const alternar = (c: string) =>
    setAbiertas((s) => {
      const n = new Set(s);
      if (n.has(c)) n.delete(c);
      else n.add(c);
      return n;
    });
  return (
    <section aria-labelledby="mx-ciudades">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="mx-ciudades" className="text-sm font-semibold">
          Por ciudad
          <span className="ml-2 text-xs font-normal text-muted-foreground">{grupos.length} ciudades</span>
        </h3>
        <button
          type="button"
          onClick={() =>
            setAbiertas((s) =>
              s.size === visibles.length ? new Set() : new Set(visibles.map((g) => g.ciudad)),
            )
          }
          className="text-xs font-semibold text-ink-2 underline-offset-2 hover:underline"
        >
          {abiertas.size === visibles.length ? 'Cerrar todas' : 'Abrir todas'}
        </button>
      </div>
      <ul className="overflow-hidden rounded-xl border border-line bg-surface/60">
        {visibles.map((g) => {
          const abierta = abiertas.has(g.ciudad);
          const panel = `mx-ciudad-${g.ciudad.replace(/\W+/g, '-')}`;
          return (
            <li key={g.ciudad} className="border-b border-line last:border-b-0">
              <button
                type="button"
                aria-expanded={abierta}
                aria-controls={panel}
                onClick={() => alternar(g.ciudad)}
                className="grid w-full grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 px-3 py-2.5 text-left text-sm transition-colors duration-150 hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink sm:grid-cols-[1rem_minmax(0,13rem)_minmax(0,1fr)_7rem_5rem]"
              >
                <ChevronRight
                  size={16}
                  aria-hidden="true"
                  className={cn(
                    'text-muted-foreground transition-transform duration-200',
                    abierta && 'rotate-90',
                  )}
                />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{g.ciudad}</span>
                  <span className="block text-xs text-muted-foreground">
                    {g.sucursales.length} {g.sucursales.length === 1 ? 'sucursal' : 'sucursales'}
                    {g.conVenta < g.sucursales.length ? `, ${g.conVenta} con venta` : ''}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="hidden h-2 overflow-hidden rounded-full bg-surface-2 sm:block"
                >
                  <span
                    className="mx-barra flex h-full gap-[2px] overflow-hidden rounded-full"
                    style={{ width: `${(g.venta / max) * 100}%` }}
                  >
                    {ORIGENES.map((o) =>
                      (g.por[o] ?? 0) > 0 ? (
                        <span key={o} style={{ flexGrow: g.por[o], backgroundColor: COLOR_ORIGEN[o] }} />
                      ) : null,
                    )}
                  </span>
                </span>
                <span className="text-right">
                  <span className="block font-semibold tabular">{dinero(g.venta, MXN, false)}</span>
                  <span className="mt-0.5 block sm:hidden">
                    <Cambio valor={g.delta} umbral={UMBRAL} />
                  </span>
                </span>
                <span className="hidden text-right sm:block">
                  <Cambio valor={g.delta} umbral={UMBRAL} />
                </span>
              </button>
              <div
                id={panel}
                role="region"
                aria-label={`Sucursales de ${g.ciudad}`}
                className="mx-panel grid"
                data-abierto={abierta || undefined}
              >
                <div className="min-h-0 overflow-hidden">
                  {abierta && <TablaCiudad filas={g.sucursales} momento={momento} />}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {grupos.length > CIUDADES_VISIBLES && (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setTodas((t) => !t)}>
          {todas ? 'Ver menos ciudades' : `Ver las ${grupos.length} ciudades`}
        </Button>
      )}
    </section>
  );
}

function TablaCiudad({
  filas,
  momento,
}: {
  filas: Calculo['ciudades'][number]['sucursales'];
  momento: Momento;
}) {
  const max = Math.max(1, ...filas.map((f) => f.venta));
  return (
    <div className="relative overflow-x-auto bg-surface-2/40 px-3 pb-3 pt-1">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="py-2 text-left font-medium">Sucursal</th>
            <th className="w-[38%] py-2 text-left font-medium">Venta</th>
            <th className="py-2 text-right font-medium">Pedidos</th>
            <th className="py-2 text-right font-medium">Ticket</th>
            <th className="py-2 text-right font-medium">{momento.columna}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {filas.map((s) => (
            <tr key={s.companyId}>
              <td className="py-2 pr-3">
                <Link href={`/sucursales/${s.companyId}`} className="font-medium hover:underline">
                  {s.nombre}
                </Link>
                {(s.sinCorte || !s.completa) && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    {s.sinCorte
                      ? momento.cuando === 'hoy'
                        ? 'sin corte de hoy'
                        : 'sin datos'
                      : 'lectura parcial'}
                  </span>
                )}
              </td>
              <td className="py-2 pr-3">
                <span className="flex items-center gap-2">
                  <span className="w-[5.5rem] shrink-0 text-right font-semibold tabular">
                    {s.sinCorte ? '—' : dinero(s.venta, MXN, false)}
                  </span>
                  <span
                    aria-hidden="true"
                    className="block h-2 flex-1 overflow-hidden rounded-full bg-surface"
                  >
                    <span
                      className="flex h-full gap-[2px] overflow-hidden rounded-full"
                      style={{ width: `${(s.venta / max) * 100}%` }}
                    >
                      {ORIGENES.map((o) =>
                        (s.por[o] ?? 0) > 0 ? (
                          <span key={o} style={{ flexGrow: s.por[o], backgroundColor: COLOR_ORIGEN[o] }} />
                        ) : null,
                      )}
                    </span>
                  </span>
                </span>
              </td>
              <td className="py-2 text-right tabular">{numero(s.pedidos)}</td>
              <td className="py-2 text-right tabular">
                {s.pedidos ? dinero(Math.round(s.venta / s.pedidos), MXN, false) : '—'}
              </td>
              <td className="py-2 text-right">
                <Cambio valor={s.delta} umbral={UMBRAL} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tendencia semanal de una sucursal (venta por semana del periodo, misma escala dentro de la fila). */
function Tendencia({ serie, etiqueta }: { serie: number[]; etiqueta: string }) {
  const w = 80;
  const h = 24;
  const max = Math.max(1, ...serie);
  const pts = serie.map((v, i) => [
    2 + (i / Math.max(1, serie.length - 1)) * (w - 4),
    h - 3 - (v / max) * (h - 6),
  ]);
  const ultimo = pts[pts.length - 1];
  return (
    <svg width={w} height={h} role="img" aria-label={etiqueta} className="inline-block align-middle">
      <polyline
        points={pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')}
        fill="none"
        stroke={AZUL.fuerte}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {ultimo && <circle cx={ultimo[0]} cy={ultimo[1]} r={2.5} fill={AZUL.fuerte} />}
    </svg>
  );
}

function TablaSucursales({ filas }: { filas: Calculo['tabla'] }) {
  const max = Math.max(1, ...filas.map((f) => f.venta));
  return (
    // relative: sin él, los textos solo para lectores de pantalla («sube», «baja») escapan del recorte y alargan la
    // página miles de píxeles (quedaba solo el muro al final).
    <div className="relative max-h-[34rem] overflow-auto">
      <table className="tabla w-full min-w-[34rem] text-sm">
        <thead className="sticky top-0 z-[1]">
          <tr>
            <th className="text-left">Sucursal</th>
            <th className="w-[28%] text-left">Venta</th>
            <th className="text-right">Ticket</th>
            <th className="text-center">Semanas</th>
            <th className="text-right">Últ. semana</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => (
            <tr key={f.companyId}>
              <td>
                <Link href={`/sucursales/${f.companyId}`} className="font-medium hover:underline">
                  {f.nombre}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {f.ciudad} · {porcentaje(f.parte, 1)} del total
                </span>
              </td>
              <td>
                <span className="flex items-center gap-2">
                  <span className="w-24 shrink-0 text-right tabular font-semibold">
                    {dinero(f.venta, MXN, false)}
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex h-2 flex-1 overflow-hidden rounded-full bg-surface-2"
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
              <td className="text-right tabular">
                {f.pedidos ? dinero(Math.round(f.venta / f.pedidos), MXN, false) : '—'}
              </td>
              <td className="text-center">
                <Tendencia
                  serie={f.serie}
                  etiqueta={`Venta por semana de ${f.nombre}: ${f.serie.map((x) => dinero(x, MXN, false)).join(', ')}`}
                />
              </td>
              <td className="text-right">
                <Cambio valor={f.delta} umbral={UMBRAL} />
              </td>
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

/** Series por tramo (pedidos o venta) por origen; los orígenes fuera del filtro, en cero. */
function porTramo(tramos: PorOrigen<Serie>, f: FiltroOrigen, i: 0 | 1) {
  return Object.fromEntries(
    ORIGENES.map((o) => [o, pasa(o, f) && tramos[o] ? tramos[o]![i] : Array<number>(TRAMOS).fill(0)]),
  ) as Record<Origen, number[]>;
}
const sumaOrigenes = (r: Record<Origen, number[]>, n: number) =>
  Array.from({ length: n }, (_, j) => ORIGENES.reduce((a, o) => a + (r[o][j] ?? 0), 0));
const aHoras = (s: number[]) =>
  Array.from({ length: 24 }, (_, h) => s.slice(h * 6, h * 6 + 6).reduce((a, b) => a + b, 0));

/** Todo lo que se pinta, con el filtro de origen aplicado. Exportada para las pruebas. */
/** Las 10 que más venden por importe, con el filtro de origen (periodo o rango). */
function masVendidos(lista: TableroMexico['periodo']['productos'], f: FiltroOrigen) {
  const prods = lista
    .map((p) => {
      const por = Object.fromEntries(
        (Object.entries(p.por) as [Origen, [number, number]][])
          .filter(([o]) => pasa(o, f))
          .map(([o, x]) => [o, x[1]]),
      ) as Partial<Record<Origen, number>>;
      const lineas = (Object.entries(p.por) as [Origen, [number, number]][])
        .filter(([o]) => pasa(o, f))
        .reduce((acc, [, x]) => acc + x[0], 0);
      const importe = Object.values(por).reduce((acc, x) => acc + (x ?? 0), 0);
      return { p, por, lineas, importe };
    })
    .filter((x) => x.importe > 0)
    .sort((x, y) => y.importe - x.importe);
  const totalProd = prods.reduce((acc, x) => acc + x.importe, 0);
  return prods.slice(0, 10).map((x) => ({
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
}

export function calcular(d: TableroMexico, f: FiltroOrigen) {
  // Con el filtro Rappi solo cuentan las sucursales con tienda en el portal. Las demás van aparte, como «sin tienda
  // en Rappi», nunca como venta cero. Sin el campo `rappi` (respuestas viejas), cuentan todas.
  const sinTienda = f === 'rappi' ? d.hoy.sucursales.filter((s) => s.rappi === false) : [];
  const ss = f === 'rappi' ? d.hoy.sucursales.filter((s) => s.rappi !== false) : d.hoy.sucursales;
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
  // Qué se ve: hoy en vivo, un día cerrado (contra el mismo día de la semana anterior, completo) o un rango (contra
  // los mismos días justo antes).
  const modo = d.modo ?? 'vivo';
  const r = modo === 'rango' ? (d.rango ?? null) : null;
  const fecha =
    modo === 'dia' && d.fecha
      ? d.fecha
      : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date(d.generadoEn));
  const diaBase = sumarDias(fecha, -7);
  const dia = r
    ? etiquetaSemana(r.previoDesde, r.previoHasta)
    : `el ${nombreDia(diaBase)} ${diaMes(diaBase)}`;
  const diasRango = r ? diasEntre(r.desde, r.hasta) + 1 : 0;
  const momento: Momento =
    modo === 'vivo'
      ? { ...MOMENTO_HOY, contra: `${dia} a la misma hora` }
      : r
        ? {
            cuando: `del ${diaMes(r.desde)} al ${diaMes(r.hasta)}`,
            corto: `${diaMes(r.desde)} a ${diaMes(r.hasta)}`,
            contra: `los ${numero(diasRango)} días anteriores (${dia})`,
            columna: 'vs días antes',
          }
        : {
            cuando: `el ${nombreDia(fecha)} ${diaMes(fecha)}`,
            corto: `${nombreDia(fecha).slice(0, 3)} ${diaMes(fecha)}`,
            contra: dia,
            columna: 'vs sem. pasada',
          };
  const titulo =
    modo === 'vivo'
      ? 'Venta de hoy'
      : r
        ? `Venta del ${diaMes(r.desde)} al ${diaMes(r.hasta)}`
        : `Venta del ${nombreDia(fecha)} ${diaMes(fecha)}`;
  const k = d.hoy.curva.hastaTramo;
  // Las sucursales en otra zona comparan a la misma hora LOCAL (una hora antes o después que el centro).
  const otraZona = new Set(comparables.map((s) => s.comparadoA)).size > 1;
  const parciales =
    comparables.length < conCorte.length ? `, ${comparables.length} de ${conCorte.length} sucursales` : '';
  const comparable =
    comparables.length && baseC.venta > 0
      ? {
          venta: variacion(hoyC.venta, baseC.venta),
          pedidos: variacion(hoyC.pedidos, baseC.pedidos),
          ticket:
            hoyC.pedidos && baseC.pedidos
              ? variacion(hoyC.venta / hoyC.pedidos, baseC.venta / baseC.pedidos)
              : null,
          sufijo:
            modo === 'vivo'
              ? `vs ${dia} a las ${hhmm(k * TRAMO_SEGUNDOS)}${otraZona ? ' (hora local)' : ''}${parciales}`
              : r
                ? `vs ${momento.contra}${parciales}`
                : `vs ${dia}, día completo${parciales}`,
        }
      : null;

  // Curva y ritmo, por tramo de 10 min y hora local (armarHoy ya cortó hoy y la semana pasada en el mismo tramo).
  const { curva } = d.hoy;
  const hayBase = Object.keys(curva.base).length > 0;
  const ventaTramo = porTramo(curva.hoy, f, 1);
  const baseVentaTramo = hayBase ? sumaOrigenes(porTramo(curva.base, f, 1), TRAMOS) : null;
  const pedidosHora = Object.fromEntries(
    ORIGENES.map((o) => [o, aHoras(porTramo(curva.hoy, f, 0)[o])]),
  ) as Record<Origen, number[]>;
  const basePedidosHora = hayBase ? aHoras(sumaOrigenes(porTramo(curva.base, f, 0), TRAMOS)) : null;
  const baseHastaPedidosHora = hayBase ? aHoras(sumaOrigenes(porTramo(curva.baseHasta, f, 0), TRAMOS)) : null;
  const horaEnCurso = k % 6 ? Math.floor(k / 6) : null;
  const ultimaHoraConDatos = Math.max(0, Math.ceil(k / 6) - 1);
  const totalHora = (h: number) => ORIGENES.reduce((a, o) => a + pedidosHora[o][h], 0);
  const ventaEnHora = (s: Record<Origen, number[]>, h: number) =>
    ORIGENES.reduce((a, o) => a + s[o].slice(h * 6, h * 6 + 6).reduce((x, y) => x + y, 0), 0);
  const pico = Array.from({ length: 24 }, (_, h) => h)
    .filter((h) => h <= ultimaHoraConDatos && h !== horaEnCurso && totalHora(h) > 0)
    .reduce<{ hora: number; pedidos: number; venta: number } | null>(
      (m, h) =>
        m === null || totalHora(h) > m.pedidos
          ? { hora: h, pedidos: totalHora(h), venta: ventaEnHora(ventaTramo, h) }
          : m,
      null,
    );
  // Última hora completa (todas las sucursales del corte de referencia) contra la misma hora de la semana pasada.
  // Solo en vivo: en un día cerrado la última hora es la de las 23:00.
  const hu = Math.floor(k / 6) - 1;
  const ultimaHora =
    modo === 'vivo' && hu >= 0
      ? {
          etiqueta: `${hh(hu)} a ${hh(hu + 1)}`,
          venta: ventaEnHora(ventaTramo, hu),
          delta: hayBase
            ? variacion(ventaEnHora(ventaTramo, hu), ventaEnHora(porTramo(curva.baseHasta, f, 1), hu) || null)
            : null,
        }
      : null;

  const celdas = ss.map((s) => {
    const t = filtrar(s.hoy, f);
    const delta = s.comparable
      ? variacion(filtrar(s.comparable.hoy, f).venta_cent, filtrar(s.comparable.base, f).venta_cent || null)
      : null;
    return { ...s, venta: t.venta_cent, pedidos: t.pedidos, delta, por: porOrigen(s.hoy, f) };
  });
  const sinVenta = celdas.filter((s) => !s.sinCorte && s.venta === 0).map((s) => s.nombre);

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
  // Las sin tienda en Rappi se marcan en su estado (rayado si ninguna tiene), sin sumar venta ni sucursales.
  for (const s of sinTienda) {
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
    e.sinCanal = (e.sinCanal ?? 0) + 1;
    (e.nombresSinCanal ??= []).push(s.nombre);
    estados.set(clave, e);
  }
  for (const e of estados.values()) e.delta = e.baseC ? variacion(e.hoyC, e.baseC) : null;

  const top = [...celdas]
    .filter((s) => s.venta > 0)
    .sort((a, b) => b.venta - a.venta || a.nombre.localeCompare(b.nombre))
    .slice(0, 5);

  const mezcla: FilaMezcla[] = ORIGENES.filter((o) => pasa(o, f)).map((o) => {
    const h = comparables.reduce((a, s) => a + (s.comparable!.hoy[o]?.venta_cent ?? 0), 0);
    const b = comparables.reduce((a, s) => a + (s.comparable!.base[o]?.venta_cent ?? 0), 0);
    return {
      origen: o,
      venta: conCorte.reduce((a, s) => a + (s.hoy[o]?.venta_cent ?? 0), 0),
      pedidos: conCorte.reduce((a, s) => a + (s.hoy[o]?.pedidos ?? 0), 0),
      delta: b ? variacion(h, b) : null,
    };
  });

  // Ciudades, de más a menos venta, con todas sus sucursales.
  const ciudades = [...new Set(ss.map((s) => s.ciudad))]
    .map((ciudad) => {
      const de = celdas.filter((s) => s.ciudad === ciudad);
      const comp = de.filter((s) => s.comparable);
      const h = sumar(
        comp.map((s) => s.comparable!.hoy),
        f,
      ).venta;
      const b = sumar(
        comp.map((s) => s.comparable!.base),
        f,
      ).venta;
      const por: Partial<Record<Origen, number>> = {};
      for (const s of de) for (const o of ORIGENES) if (s.por[o]) por[o] = (por[o] ?? 0) + s.por[o]!;
      return {
        ciudad,
        venta: de.reduce((a, s) => a + s.venta, 0),
        pedidos: de.reduce((a, s) => a + s.pedidos, 0),
        delta: b ? variacion(h, b) : null,
        conVenta: de.filter((s) => s.venta > 0).length,
        por,
        sucursales: [...de].sort((x, y) => y.venta - x.venta || x.nombre.localeCompare(y.nombre)),
      };
    })
    .sort((a, b) => b.venta - a.venta || a.ciudad.localeCompare(b.ciudad));

  // Periodo.
  const semanas: SemanaColumna[] = d.periodo.semanas.map((w, i, xs) => {
    const venta = filtrar(w.cifras, f).venta_cent;
    const previa = xs[i - 1];
    return {
      clave: w.semana,
      etiqueta: diaMes(w.semana).replace('.', ''),
      por: porOrigen(w.cifras, f),
      parcial: w.dias < 7,
      delta:
        previa && w.dias >= 7 && previa.dias >= 7
          ? variacion(venta, filtrar(previa.cifras, f).venta_cent || null)
          : null,
    };
  });
  const completas = d.periodo.semanas.filter((w) => w.dias >= 7);
  const ultimaW = completas.at(-1);
  const anteriorW = completas.at(-2);
  const t = (w: (typeof completas)[number] | undefined) => (w ? filtrar(w.cifras, f) : null);
  const [u, a] = [t(ultimaW), t(anteriorW)];
  const tp = d.periodo.semanas.reduce(
    (acc, w) => {
      const x = filtrar(w.cifras, f);
      return { venta: acc.venta + x.venta_cent, pedidos: acc.pedidos + x.pedidos };
    },
    { venta: 0, pedidos: 0 },
  );
  const diasConDatos = d.periodo.dias.filter((x) => sumaFiltrada(x.pedidos, f) > 0).length;
  const primeraRappi = d.periodo.dias.find((x) => (x.venta.rappi ?? 0) > 0)?.fecha ?? null;
  const rappi =
    (f === 'todos' || f === 'rappi') && primeraRappi && primeraRappi > d.periodo.desde
      ? { desde: primeraRappi, semana: lunesDe(primeraRappi) }
      : null;
  const calendario = d.periodo.dias.map((x) => ({
    fecha: x.fecha,
    venta: sumaFiltrada(x.venta, f),
    pedidos: sumaFiltrada(x.pedidos, f),
  }));

  const productos = masVendidos(d.periodo.productos, f);

  // Rango: la venta de cada día (todos los días, también los que no tienen renglón) con el cambio contra el mismo
  // día de la semana anterior (del rango o del periodo de antes), lo más vendido y el promedio por día.
  const rango = r
    ? (() => {
        const ventaDe = new Map(
          [...r.diasPrevio, ...r.dias].map((x) => [x.fecha, sumaFiltrada(x.venta, f)] as const),
        );
        const deFecha = new Map(r.dias.map((x) => [x.fecha, x]));
        const columnas: SemanaColumna[] = Array.from({ length: diasRango }, (_, i) => {
          const fx = sumarDias(r.desde, i);
          const x = deFecha.get(fx);
          const venta = x ? sumaFiltrada(x.venta, f) : 0;
          const antes = ventaDe.get(sumarDias(fx, -7));
          return {
            clave: fx,
            etiqueta: diaMes(fx).replace('.', ''),
            por: Object.fromEntries(
              ORIGENES.filter((o) => pasa(o, f)).map((o) => [o, x?.venta[o] ?? 0]),
            ) as Partial<Record<Origen, number>>,
            parcial: false,
            delta: antes ? variacion(venta, antes) : null,
          };
        });
        const primera = r.dias.find((x) => (x.venta.rappi ?? 0) > 0)?.fecha ?? null;
        return {
          dias: diasRango,
          porDia: hoy.venta / diasRango,
          columnas,
          rappi: (f === 'todos' || f === 'rappi') && primera && primera > r.desde ? primera : null,
          productos: masVendidos(r.productos, f),
        };
      })()
    : null;

  const claves = d.periodo.semanas.map((w) => w.semana);
  const fueraDelCanal = new Set(sinTienda.map((s) => s.companyId));
  const filasPeriodo = d.periodo.sucursales
    .filter((s) => !fueraDelCanal.has(s.companyId))
    .map((s) => {
      const tt = filtrar(s.cifras, f);
      const serie = claves.map((c) => (s.porSemana[c] ? filtrar(s.porSemana[c], f).venta_cent : 0));
      const us =
        ultimaW && s.porSemana[ultimaW.semana] ? filtrar(s.porSemana[ultimaW.semana], f).venta_cent : null;
      const as =
        anteriorW && s.porSemana[anteriorW.semana]
          ? filtrar(s.porSemana[anteriorW.semana], f).venta_cent
          : null;
      return {
        companyId: s.companyId,
        nombre: s.nombre,
        ciudad: s.ciudad,
        venta: tt.venta_cent,
        pedidos: tt.pedidos,
        por: porOrigen(s.cifras, f),
        serie,
        delta: us !== null && as ? variacion(us, as) : null,
      };
    });
  const totalPeriodo = filasPeriodo.reduce((acc, s) => acc + s.venta, 0);
  const tabla = filasPeriodo
    .map((s) => ({ ...s, parte: totalPeriodo ? s.venta / totalPeriodo : null }))
    .sort((x, y) => y.venta - x.venta);

  const sinCorte = ss.length - conCorte.length;
  const incompletas = conCorte.filter((s) => !s.completa).length;
  const ese = modo === 'vivo' ? 'hoy' : 'ese día';
  // Un día o rango con Rappi contra una base sin Rappi del portal (antes de que se leyera): «Todo» sube de más.
  const rappiDe = (lado: 'hoy' | 'base') =>
    comparables.reduce((acc, s) => acc + (s.comparable![lado].rappi?.venta_cent ?? 0), 0);
  const avisos = [
    r
      ? r.incompletos
        ? `${r.incompletos} ${r.incompletos === 1 ? 'día de sucursal' : 'días de sucursal'} del rango con lectura incompleta: la venta puede ir por debajo.`
        : ''
      : incompletas === 1
        ? `1 sucursal con alguna lectura incompleta ${ese}: su venta puede ir por debajo.`
        : incompletas
          ? `${incompletas} sucursales con alguna lectura incompleta ${ese}: su venta puede ir por debajo.`
          : '',
    f === 'todos' && modo !== 'vivo' && rappiDe('hoy') > 0 && rappiDe('base') === 0
      ? `${capital(momento.contra)} no ${r ? 'tienen' : 'tiene'} venta de Rappi del portal (empezó a leerse después): el cambio de «Todo» va de más.`
      : '',
    d.periodo.incompletos
      ? `${d.periodo.incompletos} ${d.periodo.incompletos === 1 ? 'día de sucursal' : 'días de sucursal'} del periodo con lectura incompleta.`
      : '',
    sinTienda.length
      ? `${sinTienda.length === 1 ? '1 sucursal no tiene tienda en el portal de Rappi y no cuenta' : `${sinTienda.length} sucursales no tienen tienda en el portal de Rappi y no cuentan`} en este filtro: ${lista(sinTienda.map((s) => s.nombre))}.`
      : '',
    // Una ciudad sin estado cuenta en los totales pero no se pinta en el mapa: que no pase sin aviso.
    sinEstado.size
      ? `${lista([...sinEstado])} no ${sinEstado.size === 1 ? 'tiene' : 'tienen'} estado en el mapa: su venta cuenta en los totales, pero no se pinta.`
      : '',
  ].filter(Boolean);

  return {
    modo,
    sinTienda: sinTienda.map((s) => ({ companyId: s.companyId, nombre: s.nombre, ciudad: s.ciudad })),
    momento,
    titulo,
    paso: d.hoy.curva.paso ?? 1,
    rango,
    total: ss.length,
    sinCorte,
    conVenta: celdas.filter((s) => s.venta > 0).length,
    sinVenta,
    hoy,
    comparable,
    dia,
    hastaTramo: k,
    hayBase,
    ventaTramo,
    baseVentaTramo,
    pedidosHora,
    basePedidosHora,
    baseHastaPedidosHora,
    horaEnCurso,
    ultimaHoraConDatos,
    pico,
    ultimaHora,
    estados: [...estados.values()],
    sinEstado: [...sinEstado],
    top,
    mezcla,
    ciudades,
    semanas,
    rappi,
    calendario,
    periodo: {
      venta: tp.venta,
      pedidos: tp.pedidos,
      porSemana: d.periodo.semanas.length ? tp.venta / d.periodo.semanas.length : 0,
      porDia: diasConDatos ? tp.pedidos / diasConDatos : 0,
      ultima: u?.venta_cent ?? null,
      ultimaVsAnterior: u && a ? variacion(u.venta_cent, a.venta_cent || null) : null,
      ticketVsAnterior:
        u?.pedidos && a?.pedidos ? variacion(u.venta_cent / u.pedidos, a.venta_cent / a.pedidos) : null,
    },
    productos,
    tabla,
    avisos,
  };
}
