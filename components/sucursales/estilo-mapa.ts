import type { FilterSpecification, LineLayerSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * Estilo del mapa de ciudad (docs/sucursales/19), sobre los mosaicos vectoriales de OpenFreeMap (esquema OpenMapTiles,
 * datos de OpenStreetMap, sin llave). De noche, la paleta del mapa nocturno al que está acostumbrado el equipo: fondo
 * azul marino, avenidas en azul, áreas verdes en verde azulado y colonias en mayúsculas grises. De día, el mapa claro
 * de siempre. Sin edificios ni puntos de interés: el mapa es fondo para las sucursales.
 */
export type TemaMapa = 'dia' | 'noche';

const PALETAS = {
  noche: {
    fondo: '#1d2c4d',
    verde: '#0e4a4f',
    agua: '#0e1a33',
    calle: '#2a3c63',
    avenida: '#355180',
    principal: '#4269a3',
    rapida: '#5a86c5',
    colonia: '#8c9bb6',
    ciudad: '#e8ecf3',
    halo: '#1d2c4d',
    nombreCalle: '#7f8fae',
  },
  dia: {
    fondo: '#f4f2ee',
    verde: '#cfe6cf',
    agua: '#aad3f2',
    calle: '#ffffff',
    avenida: '#ffffff',
    principal: '#fbe6a2',
    rapida: '#f6cf65',
    colonia: '#7a7f87',
    ciudad: '#2b2f36',
    halo: '#f4f2ee',
    nombreCalle: '#80858d',
  },
} as const;

const ATRIBUCION =
  '<a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">© OpenMapTiles</a> ' +
  '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>';

/** Ancho de una vía según el zoom (de 11 a 16). */
const ancho = (a11: number, a16: number) =>
  ['interpolate', ['exponential', 1.5], ['zoom'], 11, a11, 16, a16] as unknown as number;

export function estiloMapa(tema: TemaMapa): StyleSpecification {
  const c = PALETAS[tema];
  const via = (
    id: string,
    clases: string[],
    color: string,
    a11: number,
    a16: number,
    minzoom = 0,
  ): LineLayerSpecification => ({
    id,
    type: 'line',
    source: 'calles',
    'source-layer': 'transportation',
    minzoom,
    filter: [
      'all',
      ['in', ['get', 'class'], ['literal', clases]],
      ['!=', ['get', 'brunnel'], 'tunnel'],
    ] as FilterSpecification,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': color, 'line-width': ancho(a11, a16) },
  });
  return {
    version: 8,
    glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
    sources: {
      calles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet', attribution: ATRIBUCION },
    },
    layers: [
      { id: 'fondo', type: 'background', paint: { 'background-color': c.fondo } },
      {
        id: 'verde',
        type: 'fill',
        source: 'calles',
        'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood', 'farmland']]],
        paint: { 'fill-color': c.verde, 'fill-opacity': 0.85 },
      },
      {
        id: 'parques',
        type: 'fill',
        source: 'calles',
        'source-layer': 'landuse',
        filter: ['in', ['get', 'class'], ['literal', ['park', 'cemetery', 'pitch', 'stadium']]],
        paint: { 'fill-color': c.verde, 'fill-opacity': 0.85 },
      },
      {
        id: 'agua',
        type: 'fill',
        source: 'calles',
        'source-layer': 'water',
        paint: { 'fill-color': c.agua },
      },
      via('calles', ['minor', 'service'], c.calle, 0.4, 5, 12),
      via('avenidas', ['secondary', 'tertiary'], c.avenida, 0.8, 8),
      via('principales', ['primary', 'trunk'], c.principal, 1.4, 11),
      via('rapidas', ['motorway'], c.rapida, 1.8, 13),
      {
        id: 'nombres-calles',
        type: 'symbol',
        source: 'calles',
        'source-layer': 'transportation_name',
        minzoom: 13,
        filter: ['in', ['get', 'class'], ['literal', ['primary', 'trunk', 'secondary', 'motorway']]],
        layout: {
          'symbol-placement': 'line',
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 10,
        },
        paint: { 'text-color': c.nombreCalle, 'text-halo-color': c.halo, 'text-halo-width': 1.2 },
      },
      {
        id: 'colonias',
        type: 'symbol',
        source: 'calles',
        'source-layer': 'place',
        minzoom: 11.5,
        filter: ['in', ['get', 'class'], ['literal', ['suburb', 'neighbourhood', 'quarter']]],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 9.5, 15, 12],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.08,
          'text-max-width': 8,
        },
        paint: { 'text-color': c.colonia, 'text-halo-color': c.halo, 'text-halo-width': 1.4 },
      },
      {
        id: 'ciudades',
        type: 'symbol',
        source: 'calles',
        'source-layer': 'place',
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Noto Sans Bold'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 10, 13, 14, 20],
        },
        paint: { 'text-color': c.ciudad, 'text-halo-color': c.halo, 'text-halo-width': 1.6 },
      },
    ],
  };
}

/** Contorno municipal: el de la ciudad en trazo claro y firme; los vecinos, punteados y tenues. */
export const pinturaLimites = (tema: TemaMapa) => ({
  principal: { color: tema === 'noche' ? '#ffffff' : '#3c4043', ancho: 2 },
  vecino: { color: tema === 'noche' ? '#8c9bb6' : '#9aa0a6', ancho: 1 },
});
