'use client';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Map as MapaGl, Marker } from 'maplibre-gl';
import type { FeatureCollection, MultiLineString } from 'geojson';
import { cn } from 'cn';
import type { CiudadTablero } from '@/lib/sucursales/alcance';
import { configDe } from '@/lib/sucursales/config';
import type { ConsumoNacional, DesgloseConsumo } from '@/lib/sucursales/contratos';
import { armarDesglose, type FilaInsumo } from '@/lib/sucursales/consumo-nacional';
import type { FiltroOrigen } from '@/lib/sucursales/metricas';
import { Tarjeta } from '@/components/portal/piezas';
import { conCiudad } from './ciudad-tablero';
import { EnlaceSucursal } from './enlace-sucursal';
import { ErrorCarga, Esqueleto } from './estados';
import { estiloMapa, pinturaLimites, type TemaMapa } from './estilo-mapa';
import { dinero } from './formato';
import { Cambio, compacto, type Momento } from './graficas-mexico';
import { LIMITES_GDL } from './mapa-guadalajara-limites';
import { useLectura } from './use-lectura';

/**
 * Mapa de una ciudad para su tablero (docs/sucursales/19): un mapa de calles real (MapLibre con los mosaicos de
 * OpenFreeMap, datos de OpenStreetMap, sin llave), con el contorno de la ciudad y, en cada sucursal, un pin con su
 * etiqueta: nombre, la cifra y el cambio. Las etiquetas se acomodan para no encimarse; con zoom se separan. La lista de
 * al lado es la vista de tabla del mapa y se resalta junto con la etiqueta.
 */
type Limites = FeatureCollection<MultiLineString, { nombre: string; principal: boolean }>;
const LIMITES: Record<CiudadTablero['clave'], Limites> = { guadalajara: LIMITES_GDL };

const MXN = 'MXN';
const UMBRAL = 0.03;
const TEXTOS = {
  'CooperativeGesturesHandler.WindowsHelpText': 'Usa Ctrl + rueda del ratón para acercar el mapa',
  'CooperativeGesturesHandler.MacHelpText': 'Usa ⌘ + rueda del ratón para acercar el mapa',
  'CooperativeGesturesHandler.MobileHelpText': 'Usa dos dedos para mover el mapa',
  'NavigationControl.ZoomIn': 'Acercar',
  'NavigationControl.ZoomOut': 'Alejar',
  'AttributionControl.ToggleAttribution': 'Créditos del mapa',
};

export interface PuntoCiudad {
  companyId: number;
  nombre: string;
  /** Lugar en la lista de al lado: en pantallas angostas el pin lleva solo este número. */
  numero: number;
  /** La cifra de la etiqueta: «$6.5 k» o «2,350 gr». */
  valor: string;
  /** Cambio contra la base; sin él la etiqueta no lo muestra. */
  cambio?: number | null;
  /** Para lectores de pantalla y el título de la etiqueta. */
  detalle: string[];
  /** Sin venta o sin consumo: la etiqueta va atenuada. */
  vacio?: boolean;
}

/** Día o noche, como el interruptor del portal (html[data-luz='noche']). */
function useTemaMapa(): TemaMapa {
  const [tema, setTema] = useState<TemaMapa>('dia');
  useEffect(() => {
    const leer = () => setTema(document.documentElement.dataset.luz === 'noche' ? 'noche' : 'dia');
    leer();
    const mo = new MutationObserver(leer);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-luz'] });
    return () => mo.disconnect();
  }, []);
  return tema;
}

/** Dónde va cada etiqueta: el centro de la etiqueta respecto al pin, en píxeles. Una línea las une. */
interface Lugar {
  dx: number;
  dy: number;
}
const ARRIBA: Lugar = { dx: 0, dy: -30 };
/** Lugares posibles para una etiqueta de w × h, del preferido al último: arriba, a los lados, abajo y en diagonal,
 * cada vez más lejos. */
function lugaresPara(w: number, h: number): Lugar[] {
  const res: Lugar[] = [];
  for (const k of [0, 1, 2, 3]) {
    const v = h / 2 + 14 + k * (h + 8);
    const lado = w / 2 + 14 + k * 24;
    res.push(
      { dx: 0, dy: -v },
      { dx: lado, dy: 0 },
      { dx: -lado, dy: 0 },
      { dx: 0, dy: v },
      { dx: lado, dy: -v },
      { dx: -lado, dy: -v },
      { dx: lado, dy: v },
      { dx: -lado, dy: v },
    );
  }
  return res;
}
type Caja = { x0: number; y0: number; x1: number; y1: number };
const cruce = (a: Caja, b: Caja) =>
  Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) *
  Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));

function añadirLimites(mapa: MapaGl, limites: Limites, tema: TemaMapa) {
  if (mapa.getSource('limites')) return;
  const p = pinturaLimites(tema);
  mapa.addSource('limites', { type: 'geojson', data: limites });
  mapa.addLayer(
    {
      id: 'limites-vecinos',
      type: 'line',
      source: 'limites',
      filter: ['!', ['get', 'principal']],
      paint: { 'line-color': p.vecino.color, 'line-width': p.vecino.ancho, 'line-dasharray': [2, 2] },
    },
    'nombres-calles',
  );
  mapa.addLayer(
    {
      id: 'limites-ciudad',
      type: 'line',
      source: 'limites',
      filter: ['==', ['get', 'principal'], true],
      paint: { 'line-color': p.principal.color, 'line-width': p.principal.ancho },
    },
    'nombres-calles',
  );
}

/** El mapa con sus etiquetas; `activo` se comparte con la lista para resaltar la misma sucursal en los dos. */
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
  const tema = useTemaMapa();
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaGl | null>(null);
  const [listo, setListo] = useState(false);
  const [fallo, setFallo] = useState(false);
  const [elementos, setElementos] = useState<Map<number, HTMLElement>>(new Map());
  const [lugares, setLugares] = useState<Record<number, Lugar>>({});
  // En pantallas angostas no caben 11 etiquetas: cada pin lleva su número (el de la lista).
  const [angosto, setAngosto] = useState(false);
  useEffect(() => {
    const el = caja.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setAngosto(e.contentRect.width < 600));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Solo las sucursales con ubicación; en el orden recibido (el de la lista), que es el orden de prioridad al acomodar.
  const conUbicacion = useMemo(
    () =>
      puntos
        .map((p) => ({ ...p, c: configDe(p.companyId)?.coordenadas }))
        .filter((p): p is typeof p & { c: NonNullable<typeof p.c> } => !!p.c),
    [puntos],
  );
  const ids = conUbicacion.map((p) => p.companyId).join(',');
  // El tema con el que se pintó el estilo actual (el handler de style.load lo lee para los límites).
  const temaPintado = useRef(tema);

  // El mapa, una vez por ciudad. maplibre-gl se carga aquí: no pesa en el resto del portal.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const ml = await import('maplibre-gl');
        if (cancelado || !caja.current) return;
        // El worker se sirve desde public/ (los empaquetadores no lo copian); su nombre lleva la versión instalada.
        ml.setWorkerUrl(`/maplibre/maplibre-gl-worker-${ml.getVersion()}.mjs`);
        const m = new ml.Map({
          container: caja.current,
          style: estiloMapa(temaPintado.current),
          center: [-103.37, 20.68],
          zoom: 11.5,
          minZoom: 9,
          maxZoom: 17,
          attributionControl: { compact: true },
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          locale: TEXTOS,
        });
        m.touchZoomRotate.disableRotation();
        m.addControl(new ml.NavigationControl({ showCompass: false }), 'top-right');
        m.on('style.load', () => añadirLimites(m, LIMITES[clave], temaPintado.current));
        m.on('load', () => {
          // El crédito compacto arranca abierto y tapa el mapa en pantallas chicas: se cierra (el botón (i) lo abre).
          m.getContainer()
            .querySelector('.maplibregl-ctrl-attrib')
            ?.classList.remove('maplibregl-compact-show');
          setListo(true);
        });
        m.on('error', (e) => console.warn('[mapa]', e.error?.message));
        mapa.current = m;
      } catch {
        if (!cancelado) setFallo(true);
      }
    })();
    return () => {
      cancelado = true;
      mapa.current?.remove();
      mapa.current = null;
      setListo(false);
    };
  }, [clave]);

  // Día o noche: cambia el estilo (los límites se vuelven a poner al cargar).
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo || temaPintado.current === tema) return;
    temaPintado.current = tema;
    m.setStyle(estiloMapa(tema));
  }, [tema, listo]);

  // Un marcador por sucursal (se rehacen si cambia el conjunto) y el encuadre que las muestra a todas.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    let marcadores: Marker[] = [];
    let cancelado = false;
    (async () => {
      const ml = await import('maplibre-gl');
      if (cancelado) return;
      const els = new Map<number, HTMLElement>();
      marcadores = conUbicacion.map((p) => {
        const el = document.createElement('div');
        els.set(p.companyId, el);
        return new ml.Marker({ element: el, anchor: 'center' }).setLngLat([p.c.lon, p.c.lat]).addTo(m);
      });
      setElementos(els);
      if (conUbicacion.length) {
        const lons = conUbicacion.map((p) => p.c.lon);
        const lats = conUbicacion.map((p) => p.c.lat);
        m.fitBounds(
          [
            [Math.min(...lons), Math.min(...lats)],
            [Math.max(...lons), Math.max(...lats)],
          ],
          {
            // Con etiquetas hace falta margen arriba y a los lados; con números (pantalla angosta), mucho menos.
            padding:
              m.getContainer().clientWidth < 600
                ? { top: 40, bottom: 30, left: 30, right: 30 }
                : { top: 90, bottom: 40, left: 80, right: 80 },
            maxZoom: 14,
            duration: 0,
          },
        );
      }
    })();
    return () => {
      cancelado = true;
      marcadores.forEach((x) => x.remove());
      setElementos(new Map());
    };
    // `ids` resume el conjunto; las cifras cambian sin rehacer los marcadores.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, listo]);

  // Acomodo de etiquetas: en el orden de la lista, cada una toma el primer lugar libre (sin tapar otras ni otros pines).
  useEffect(() => {
    const m = mapa.current;
    if (!m || !elementos.size) return;
    let cuadro = 0;
    const acomodar = () => {
      cancelAnimationFrame(cuadro);
      cuadro = requestAnimationFrame(() => {
        const W = m.getContainer().clientWidth;
        const H = m.getContainer().clientHeight;
        const pts = conUbicacion.map((p) => ({ id: p.companyId, xy: m.project([p.c.lon, p.c.lat]) }));
        const ocupadas: Caja[] = pts.map(({ xy }) => ({
          x0: xy.x - 8,
          y0: xy.y - 8,
          x1: xy.x + 8,
          y1: xy.y + 8,
        }));
        const res: Record<number, Lugar> = {};
        for (const { id, xy } of pts) {
          const chip = elementos.get(id)?.querySelector<HTMLElement>('[data-etiqueta]');
          const w = chip?.offsetWidth ?? 120;
          const h = chip?.offsetHeight ?? 30;
          const cajaDe = (l: Lugar): Caja => ({
            x0: xy.x + l.dx - w / 2 - 4,
            y0: xy.y + l.dy - h / 2 - 4,
            x1: xy.x + l.dx + w / 2 + 4,
            y1: xy.y + l.dy + h / 2 + 4,
          });
          const dentro = (c: Caja) => c.x0 >= 0 && c.y0 >= 0 && c.x1 <= W && c.y1 <= H;
          const choque = (l: Lugar) => ocupadas.reduce((a, o) => a + cruce(o, cajaDe(l)), 0);
          const opciones = lugaresPara(w, h);
          const libre = opciones.find((l) => dentro(cajaDe(l)) && choque(l) === 0);
          // Sin lugar libre (muy alejado o muy junto): el que menos tapa, dentro del mapa si se puede.
          const l =
            libre ??
            [...opciones].sort(
              (a, b) => Number(dentro(cajaDe(b))) - Number(dentro(cajaDe(a))) || choque(a) - choque(b),
            )[0];
          ocupadas.push(cajaDe(l));
          res[id] = l;
        }
        setLugares(res);
      });
    };
    acomodar();
    m.on('move', acomodar);
    m.on('resize', acomodar);
    return () => {
      cancelAnimationFrame(cuadro);
      m.off('move', acomodar);
      m.off('resize', acomodar);
    };
  }, [elementos, conUbicacion, angosto]);

  return (
    <figure className="relative">
      <div
        ref={caja}
        role="region"
        aria-label={etiqueta}
        className="h-[24rem] w-full overflow-hidden rounded-xl border border-line bg-surface-2 sm:h-[30rem] xl:h-[32rem]"
      />
      {fallo && (
        <p className="absolute inset-0 grid place-items-center rounded-xl bg-surface-2 px-6 text-center text-sm text-muted-foreground">
          Este navegador no puede dibujar el mapa. La lista de al lado tiene las mismas cifras.
        </p>
      )}
      {conUbicacion.map((p) => {
        const el = elementos.get(p.companyId);
        if (!el) return null;
        const l = lugares[p.companyId] ?? ARRIBA;
        const esta = activo === p.companyId;
        return createPortal(
          <div className={cn('relative', esta && 'z-10')}>
            <svg
              aria-hidden="true"
              width="1"
              height="1"
              className="pointer-events-none absolute left-0 top-0 overflow-visible"
            >
              <line
                x1={0}
                y1={0}
                x2={l.dx}
                y2={l.dy}
                stroke="var(--color-ink-2)"
                strokeOpacity={0.7}
                strokeWidth={1.5}
              />
            </svg>
            <span
              aria-hidden="true"
              className={cn(
                'absolute left-0 top-0 block size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow',
                p.vacio ? 'bg-ink/40' : 'bg-crema',
              )}
            />
            <button
              type="button"
              data-etiqueta
              aria-label={[p.nombre, ...p.detalle].join('. ')}
              title={[p.nombre, ...p.detalle].join(' · ')}
              onMouseEnter={() => alActivo(p.companyId)}
              onMouseLeave={() => alActivo(null)}
              onFocus={() => alActivo(p.companyId)}
              onBlur={() => alActivo(null)}
              className={cn(
                'absolute flex -translate-x-1/2 -translate-y-1/2 items-center whitespace-nowrap border bg-surface text-left shadow-card transition-[box-shadow,border-color] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crema',
                angosto
                  ? 'size-7 justify-center rounded-full font-display text-xs font-black tabular text-ink'
                  : 'gap-2 rounded-lg px-2.5 py-1.5',
                esta ? 'border-crema ring-2 ring-crema/60' : 'border-line',
                p.vacio && 'opacity-70',
              )}
              style={{ left: l.dx, top: l.dy }}
            >
              {angosto ? (
                p.numero
              ) : (
                <>
                  <span className="text-xs font-semibold text-ink">{p.nombre}</span>
                  <span className="font-display text-sm font-black tabular text-ink">{p.valor}</span>
                  {p.cambio !== undefined && <Cambio valor={p.cambio} umbral={UMBRAL} />}
                </>
              )}
            </button>
          </div>,
          el,
          String(p.companyId),
        );
      })}
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
  sinCorte?: boolean;
}

/** Ventas: el mapa con una etiqueta por sucursal (nombre, venta y cambio) y la lista de más a menos venta. */
export function MapaCiudadTablero({
  ciudad,
  filas,
  momento,
}: {
  ciudad: CiudadTablero;
  filas: FilaMapaVenta[];
  momento: Momento;
}) {
  const [activo, setActivo] = useState<number | null>(null);
  const orden = [...filas].sort((a, b) => b.venta - a.venta || a.nombre.localeCompare(b.nombre));
  const puntos: PuntoCiudad[] = orden.map((f, i) => ({
    companyId: f.companyId,
    nombre: f.nombre,
    numero: i + 1,
    valor: f.sinCorte ? 'sin corte' : compacto(f.venta),
    cambio: f.delta,
    vacio: f.venta === 0,
    detalle: [
      f.sinCorte ? 'Sin corte' : `Venta ${dinero(f.venta, MXN, false)}`,
      `${f.pedidos} pedidos`,
      f.delta === null
        ? 'Sin base para comparar'
        : `${f.delta >= 0 ? 'Sube' : 'Baja'} ${Math.abs(Math.round(f.delta * 100))} % contra ${momento.contra}`,
    ],
  }));
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
        descripcion={`Cada etiqueta es una sucursal en su ubicación, con su venta ${momento.cuando} y el cambio contra ${momento.contra}. Acerca el mapa para separar las que están juntas.`}
      >
        <MapaCiudad
          clave={ciudad.clave}
          puntos={puntos}
          activo={activo}
          alActivo={setActivo}
          etiqueta={`Mapa de ${ciudad.nombre} con ${puntos.length} sucursales`}
        />
        {sinUbicar.length > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            Sin ubicación en el mapa: {sinUbicar.join(', ')}.
          </p>
        )}
      </Tarjeta>
      <Tarjeta
        className="xl:col-span-4"
        titulo="Por sucursal"
        descripcion={`De más a menos venta ${momento.cuando}.`}
      >
        <ol className="divide-y divide-line">
          {orden.map((f, i) => (
            <li
              key={f.companyId}
              onMouseEnter={() => setActivo(f.companyId)}
              onMouseLeave={() => setActivo(null)}
              className={cn(
                'grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 py-2 transition-colors',
                activo === f.companyId && 'bg-surface-2/60',
              )}
            >
              <span className="text-right font-display text-sm font-black tabular text-muted-foreground">
                {i + 1}
              </span>
              <EnlaceSucursal
                companyId={f.companyId}
                className="block truncate text-sm font-medium hover:underline"
              >
                {f.nombre}
              </EnlaceSucursal>
              <span className="flex items-center gap-2 text-right">
                <span className="text-sm font-semibold tabular">
                  {f.sinCorte ? '—' : dinero(f.venta, MXN, false)}
                </span>
                <Cambio valor={f.delta} umbral={UMBRAL} />
              </span>
            </li>
          ))}
        </ol>
      </Tarjeta>
    </div>
  );
}

const cantidad = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
const cantidadCorta = (x: number, unidad: string) =>
  x >= 10000 && (unidad === 'gr' || unidad === 'ml')
    ? `${cantidad.format(x / 1000)} ${unidad === 'gr' ? 'kg' : 'L'}`
    : `${cantidad.format(x)} ${unidad}`;

/**
 * Consumo en el mapa (G5, docs/sucursales/19): un ingrediente a la vez (las unidades no se suman entre ingredientes).
 * Cada etiqueta dice cuánto pidieron las recetas de esa sucursal en el mes.
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
  const puntos: PuntoCiudad[] = (r?.sucursales ?? []).map((s, i) => ({
    companyId: s.companyId,
    nombre: s.nombre,
    numero: i + 1,
    valor: cantidadCorta(s.cantidad, fila.unidad),
    detalle: [`${cantidad.format(s.cantidad)} ${fila.unidad}`, `${Math.round(s.parte * 100)} % de la ciudad`],
  }));
  const idSelect = `insumo-${ciudad.clave}`;
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <Tarjeta
        className="xl:col-span-8"
        titulo={`${fila.insumo} en ${ciudad.nombre}`}
        descripcion="Cada etiqueta es lo que pidieron las recetas de lo vendido en esa sucursal en el mes."
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
                  'grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 py-2',
                  activo === s.companyId && 'bg-surface-2/60',
                )}
              >
                <span className="text-right font-display text-sm font-black tabular text-muted-foreground">
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
