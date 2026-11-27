'use client';
import { useId, useState } from 'react';
import { cn } from 'cn';
import type { CiudadTablero } from '@/lib/sucursales/alcance';
import { configDe } from '@/lib/sucursales/config';
import type { Origen } from '@/lib/sucursales/normalizar';
import { Tarjeta } from '@/components/portal/piezas';
import { Segmentos } from '@/components/ui/segmentos';
import type { ConsumoNacional, DesgloseConsumo } from '@/lib/sucursales/contratos';
import { armarDesglose, type FilaInsumo } from '@/lib/sucursales/consumo-nacional';
import type { FiltroOrigen } from '@/lib/sucursales/metricas';
import { conCiudad } from './ciudad-tablero';
import { ErrorCarga, Esqueleto } from './estados';
import { useLectura } from './use-lectura';
import { AZUL } from './colores';
import { EnlaceSucursal } from './enlace-sucursal';
import { dinero, numero } from './formato';
import { Cambio, DIVERGENTE, compacto, useAncho, type Momento } from './graficas-mexico';
import {
  AVENIDAS_GDL,
  MAPA_GDL,
  MUNICIPIOS_GDL,
  proyectarGdl,
  type AvenidaTrazo,
  type MunicipioTrazo,
} from './mapa-guadalajara-trazos';

/**
 * Mapa de una ciudad para su tablero (docs/sucursales/19): municipios y avenidas principales de OpenStreetMap y un punto
 * por sucursal en su ubicación (config, `coordenadas`). El punto lleva el número de su lugar en la lista de al lado, que
 * es también la vista de tabla del mapa. Sin mosaicos de terceros: todo es SVG propio.
 */
interface Trazos {
  ancho: number;
  alto: number;
  municipios: MunicipioTrazo[];
  avenidas: AvenidaTrazo[];
  proyectar: (lon: number, lat: number) => [number, number];
}
const TRAZOS: Record<CiudadTablero['clave'], Trazos> = {
  guadalajara: {
    ancho: MAPA_GDL.ancho,
    alto: MAPA_GDL.alto,
    municipios: MUNICIPIOS_GDL,
    avenidas: AVENIDAS_GDL,
    proyectar: proyectarGdl,
  },
};

const MXN = 'MXN';
const UMBRAL = 0.03;

export interface PuntoCiudad {
  companyId: number;
  nombre: string;
  /** Lugar en la lista (1 = el primero); va dentro del punto. */
  numero: number;
  /** Radio en unidades del SVG. */
  radio: number;
  fondo: string;
  tinta: string;
  /** Texto del tooltip y de lectores de pantalla. */
  detalle: string[];
  vacio?: boolean;
}

/** El SVG con sus puntos; `activo` se comparte con la lista para resaltar la misma sucursal en los dos. */
export function MapaCiudad({
  clave,
  puntos,
  activo,
  alActivo,
  etiqueta,
}: {
  clave: CiudadTablero['clave'];
  puntos: PuntoCiudad[];
  activo: number | null;
  alActivo: (id: number | null) => void;
  etiqueta: string;
}) {
  const t = TRAZOS[clave];
  const id = useId();
  // En pantallas angostas el SVG se reduce: los puntos y sus números se agrandan en la misma proporción (hasta 2.4×)
  // para que en pantalla midan lo mismo que en escritorio.
  const [ref, ancho] = useAncho<HTMLElement>();
  const k = ancho > 0 ? Math.min(2.4, Math.max(1, 640 / ancho)) : 1;
  const conXY = puntos
    .map((p) => {
      const c = configDe(p.companyId)?.coordenadas;
      if (!c) return null;
      const [x, y] = t.proyectar(c.lon, c.lat);
      return { ...p, x, y, ubicacion: configDe(p.companyId)?.ubicacion ?? '' };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)
    // Los grandes primero: los chicos quedan encima y se pueden señalar.
    .sort((a, b) => b.radio - a.radio);
  const sel = conXY.find((p) => p.companyId === activo) ?? null;
  // Separación del tooltip en píxeles de pantalla: el radio del punto escalado como se dibuja.
  const separa = sel ? sel.radio * k * (ancho > 0 ? ancho / t.ancho : 1) + 10 : 0;
  return (
    <figure ref={ref} className="relative">
      <svg
        viewBox={`0 0 ${t.ancho} ${t.alto}`}
        className="block h-auto w-full"
        role="group"
        aria-labelledby={`${id}-t`}
      >
        <title id={`${id}-t`}>{etiqueta}</title>
        <g aria-hidden="true">
          {t.municipios.map((m) => (
            <path
              key={m.clave}
              d={m.d}
              className="fill-surface-2 stroke-line"
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
          ))}
          {t.avenidas.map((a) => (
            <path
              key={a.nombre}
              d={a.d}
              fill="none"
              className="stroke-ink/15"
              strokeWidth={a.tipo === 'via-rapida' ? 2.4 : 1.3}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <title>{a.nombre}</title>
            </path>
          ))}
          {t.municipios
            .filter((m) => m.visible)
            .map((m) => (
              <text
                key={m.clave}
                x={m.x}
                y={m.y}
                textAnchor="middle"
                className="fill-ink/35 font-display text-[15px] font-bold tracking-wide"
              >
                {m.nombre}
              </text>
            ))}
        </g>
        {conXY.map((p) => {
          const esta = p.companyId === activo;
          return (
            <g
              key={p.companyId}
              tabIndex={0}
              role="img"
              aria-label={[p.nombre, ...p.detalle].join('. ')}
              onMouseEnter={() => alActivo(p.companyId)}
              onMouseLeave={() => alActivo(null)}
              onFocus={() => alActivo(p.companyId)}
              onBlur={() => alActivo(null)}
              className="cursor-default outline-none [&:focus-visible>circle:first-child]:stroke-ink"
            >
              <circle
                cx={p.x}
                cy={p.y}
                r={(p.radio + (esta ? 2 : 0)) * k}
                fill={p.vacio ? 'var(--color-surface)' : p.fondo}
                stroke={esta ? 'var(--color-ink)' : 'var(--color-surface)'}
                strokeWidth={(esta ? 2.5 : 2) * k}
                strokeDasharray={p.vacio ? '3 2' : undefined}
                className={cn(p.vacio && !esta && 'stroke-ink/40')}
              />
              <text
                x={p.x}
                y={p.y}
                dy="0.35em"
                textAnchor="middle"
                fill={p.vacio ? 'var(--color-ink-2)' : p.tinta}
                fontSize={11 * k}
                className="pointer-events-none select-none font-display font-black tabular"
              >
                {p.numero}
              </text>
            </g>
          );
        })}
      </svg>
      {sel && (
        <figcaption
          role="status"
          className="pointer-events-none absolute z-10 w-56 rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-card"
          style={{
            left: `clamp(0px, calc(${(sel.x / t.ancho) * 100}% - 7rem), calc(100% - 14rem))`,
            // En la mitad de abajo se abre hacia arriba, para no salirse del mapa.
            ...(sel.y / t.alto > 0.5
              ? { bottom: `calc(${(1 - sel.y / t.alto) * 100}% + ${separa}px)` }
              : { top: `calc(${(sel.y / t.alto) * 100}% + ${separa}px)` }),
          }}
        >
          <span className="block font-semibold text-ink">
            {sel.numero}. {sel.nombre}
          </span>
          {sel.ubicacion && <span className="block text-muted-foreground">{sel.ubicacion}</span>}
          {sel.detalle.map((d) => (
            <span key={d} className="block tabular text-ink-2">
              {d}
            </span>
          ))}
        </figcaption>
      )}
      <p className="mt-2 text-right text-[11px] text-muted-foreground">
        Mapa:{' '}
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="underline-offset-2 hover:underline"
        >
          © OpenStreetMap
        </a>
      </p>
    </figure>
  );
}

/** Lo que el tablero de ventas sabe de cada sucursal (una fila de `calcular`). */
export interface FilaMapaVenta {
  companyId: number;
  nombre: string;
  venta: number;
  pedidos: number;
  delta: number | null;
  por: Partial<Record<Origen, number>>;
  sinCorte?: boolean;
}

/** Radio por área: el punto más grande mide `max` y el área es proporcional al valor. */
export const radioPorArea = (valor: number, maximo: number, min = 9, max = 24) =>
  maximo > 0 && valor > 0 ? Math.max(min, max * Math.sqrt(valor / maximo)) : min;

/** Ventas: el mapa (tamaño = venta, o color = cambio) y la lista con el mismo número. */
export function MapaCiudadTablero({
  ciudad,
  filas,
  modo,
  alModo,
  momento,
}: {
  ciudad: CiudadTablero;
  filas: FilaMapaVenta[];
  modo: 'venta' | 'cambio';
  alModo: (m: 'venta' | 'cambio') => void;
  momento: Momento;
}) {
  const [activo, setActivo] = useState<number | null>(null);
  const orden = [...filas].sort((a, b) => b.venta - a.venta || a.nombre.localeCompare(b.nombre));
  const max = Math.max(0, ...orden.map((f) => f.venta));
  const colorCambio = (d: number | null) =>
    d === null ? { fondo: '#dcd7cd', tinta: '#2b2926' } : DIVERGENTE.find((x) => d < x.hasta)!;
  const puntos: PuntoCiudad[] = orden.map((f, i) => {
    const c = modo === 'cambio' ? colorCambio(f.delta) : { fondo: AZUL.fuerte, tinta: '#ffffff' };
    return {
      companyId: f.companyId,
      nombre: f.nombre,
      numero: i + 1,
      radio: modo === 'venta' ? radioPorArea(f.venta, max) : 12,
      fondo: c.fondo,
      tinta: c.tinta,
      vacio: f.venta === 0,
      detalle: [
        f.sinCorte ? 'Sin corte' : `Venta ${dinero(f.venta, MXN, false)}`,
        `${numero(f.pedidos)} pedidos`,
        f.delta === null
          ? 'Sin base para comparar'
          : `${f.delta >= 0 ? 'Sube' : 'Baja'} ${Math.abs(Math.round(f.delta * 100))} % contra ${momento.contra}`,
      ],
    };
  });
  const sinUbicar = orden.filter((f) => !configDe(f.companyId)?.coordenadas).map((f) => f.nombre);
  return (
    <div
      data-entra
      style={{ '--i': 1 } as React.CSSProperties}
      className="grid grid-cols-1 gap-6 xl:grid-cols-12"
    >
      <Tarjeta
        className="xl:col-span-8"
        titulo={`${ciudad.nombre} ${momento.cuando}, por sucursal`}
        descripcion={
          modo === 'venta'
            ? `El tamaño del punto es su venta ${momento.cuando}; el número, su lugar en la lista. Pasa el cursor o el foco por un punto para ver su detalle.`
            : `El color es el cambio contra ${momento.contra}; el número, su lugar por venta en la lista.`
        }
        acciones={
          <Segmentos
            etiqueta="Qué muestra el mapa"
            opciones={[
              { id: 'venta', texto: 'Venta' },
              { id: 'cambio', texto: 'Cambio' },
            ]}
            activa={modo}
            alCambiar={(x) => alModo(x as 'venta' | 'cambio')}
          />
        }
      >
        <MapaCiudad
          clave={ciudad.clave}
          puntos={puntos}
          activo={activo}
          alActivo={setActivo}
          etiqueta={`Mapa de ${ciudad.nombre} con ${puntos.length} sucursales`}
        />
        <LeyendaMapa modo={modo} max={max} cuando={momento.cuando} />
        {sinUbicar.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Sin ubicación en el mapa: {sinUbicar.join(', ')}.
          </p>
        )}
      </Tarjeta>
      <Tarjeta
        className="xl:col-span-4"
        titulo="Por sucursal"
        descripcion={
          modo === 'venta'
            ? `De más a menos venta ${momento.cuando}, con el número del mapa.`
            : `Cambio contra ${momento.contra}, con el color del mapa.`
        }
      >
        <ol className="divide-y divide-line">
          {orden.map((f, i) => {
            const p = puntos[i];
            return (
              <li
                key={f.companyId}
                onMouseEnter={() => setActivo(f.companyId)}
                onMouseLeave={() => setActivo(null)}
                className={cn(
                  'grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 py-1.5 transition-colors',
                  activo === f.companyId && 'bg-surface-2/60',
                )}
              >
                <span
                  aria-hidden="true"
                  className="grid size-7 place-items-center rounded-full font-display text-[11px] font-black tabular"
                  style={
                    p.vacio
                      ? { border: '1.5px dashed var(--color-line)', color: 'var(--color-ink-2)' }
                      : { backgroundColor: p.fondo, color: p.tinta }
                  }
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <EnlaceSucursal
                    companyId={f.companyId}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {f.nombre}
                  </EnlaceSucursal>
                </span>
                <span className="flex items-center gap-2 text-right">
                  <span className="text-sm font-semibold tabular">
                    {f.sinCorte ? '—' : dinero(f.venta, MXN, false)}
                  </span>
                  <Cambio valor={f.delta} umbral={UMBRAL} />
                </span>
              </li>
            );
          })}
        </ol>
      </Tarjeta>
    </div>
  );
}

/** Leyenda: dos puntos de muestra (venta) o los cinco pasos del cambio. */
function LeyendaMapa({ modo, max, cuando }: { modo: 'venta' | 'cambio'; max: number; cuando: string }) {
  if (modo === 'cambio')
    return (
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
        {DIVERGENTE.map((d) => (
          <li key={d.texto} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-3 rounded-full" style={{ backgroundColor: d.fondo }} />
            {d.texto}
          </li>
        ))}
      </ul>
    );
  if (max <= 0) return <p className="mt-3 text-xs text-muted-foreground">Sin venta {cuando}.</p>;
  const muestras = [max / 4, max];
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-2">
      {muestras.map((v) => {
        const r = radioPorArea(v, max);
        return (
          <span key={v} className="flex items-center gap-2">
            <svg width={r * 2 + 4} height={r * 2 + 4} aria-hidden="true">
              <circle cx={r + 2} cy={r + 2} r={r} fill={AZUL.fuerte} opacity={0.85} />
            </svg>
            {compacto(v)}
          </span>
        );
      })}
      <span className="flex items-center gap-2">
        <svg width={22} height={22} aria-hidden="true">
          <circle
            cx={11}
            cy={11}
            r={9}
            fill="var(--color-surface)"
            stroke="currentColor"
            strokeDasharray="3 2"
            strokeWidth={1.5}
            className="text-ink/40"
          />
        </svg>
        sin venta
      </span>
    </div>
  );
}

const cantidad = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });

/**
 * Consumo en el mapa (G5, docs/sucursales/19): un insumo a la vez (las unidades no se suman entre insumos). El tamaño
 * del punto es lo que pidieron las recetas de esa sucursal en el mes; la lista es la vista de tabla.
 */
export function MapaConsumoCiudad({
  ciudad,
  datos,
  filas,
  origen,
}: {
  ciudad: CiudadTablero;
  datos: ConsumoNacional;
  filas: FilaInsumo[];
  origen: FiltroOrigen;
}) {
  const opciones = [...filas].sort(
    (a, b) => a.categoria.localeCompare(b.categoria) || b.cantidad - a.cantidad,
  );
  const [insumoId, setInsumoId] = useState<string | null>(null);
  const [activo, setActivo] = useState<number | null>(null);
  const fila = opciones.find((f) => f.insumoId === insumoId) ?? opciones[0];
  const {
    datos: d,
    error,
    recargar,
  } = useLectura<DesgloseConsumo>(
    fila
      ? conCiudad(
          `/api/sucursales/consumo-nacional/desglose?mes=${datos.mes!.slice(0, 7)}&insumo=${fila.insumoId}`,
          ciudad,
        )
      : null,
  );
  if (!fila) return null;
  const r = d ? armarDesglose(d.filas, fila.insumoId, origen, datos.sucursales) : null;
  const max = Math.max(0, ...(r?.sucursales.map((s) => s.cantidad) ?? [0]));
  const puntos: PuntoCiudad[] = (r?.sucursales ?? []).map((s, i) => ({
    companyId: s.companyId,
    nombre: s.nombre,
    numero: i + 1,
    radio: radioPorArea(s.cantidad, max),
    fondo: AZUL.fuerte,
    tinta: '#ffffff',
    detalle: [`${cantidad.format(s.cantidad)} ${fila.unidad}`, `${Math.round(s.parte * 100)} % de la ciudad`],
  }));
  const idSelect = `insumo-${ciudad.clave}`;
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <Tarjeta
        className="xl:col-span-8"
        titulo={`${fila.insumo} en ${ciudad.nombre}`}
        descripcion="El tamaño del punto es lo que pidieron las recetas de lo vendido en el mes; el número, su lugar en la lista."
        acciones={
          <label htmlFor={idSelect} className="flex items-center gap-2 text-xs text-ink-2">
            Ingrediente
            <select
              id={idSelect}
              value={fila.insumoId}
              onChange={(e) => setInsumoId(e.target.value)}
              className="max-w-[14rem] rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              {opciones.map((f) => (
                <option key={f.insumoId} value={f.insumoId}>
                  {f.categoria} · {f.insumo}
                </option>
              ))}
            </select>
          </label>
        }
      >
        {!r ? (
          error ? (
            <ErrorCarga error={error} alReintentar={recargar} />
          ) : (
            <Esqueleto filas={2} />
          )
        ) : (
          <MapaCiudad
            clave={ciudad.clave}
            puntos={puntos}
            activo={activo}
            alActivo={setActivo}
            etiqueta={`Consumo de ${fila.insumo} por sucursal en ${ciudad.nombre}`}
          />
        )}
      </Tarjeta>
      <Tarjeta
        className="xl:col-span-4"
        titulo="Por sucursal"
        descripcion={`${fila.insumo}, de más a menos.`}
      >
        {r && r.sucursales.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguna sucursal usó este ingrediente en el mes.</p>
        ) : (
          <ol className="divide-y divide-line">
            {(r?.sucursales ?? []).map((s, i) => (
              <li
                key={s.companyId}
                onMouseEnter={() => setActivo(s.companyId)}
                onMouseLeave={() => setActivo(null)}
                className={cn(
                  'grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-3 py-2',
                  activo === s.companyId && 'bg-surface-2/60',
                )}
              >
                <span
                  aria-hidden="true"
                  className="grid size-7 place-items-center rounded-full font-display text-[11px] font-black tabular text-white"
                  style={{ backgroundColor: AZUL.fuerte }}
                >
                  {i + 1}
                </span>
                <EnlaceSucursal
                  companyId={s.companyId}
                  className="truncate text-sm font-medium hover:underline"
                >
                  {s.nombre}
                </EnlaceSucursal>
                <span className="text-right text-sm tabular">
                  {cantidad.format(s.cantidad)} {fila.unidad}
                  <span className="block text-xs text-muted-foreground">{Math.round(s.parte * 100)} %</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </Tarjeta>
    </div>
  );
}
