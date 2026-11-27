import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Límites municipales del área metropolitana de Guadalajara para el mapa del Tablero de ciudad (docs/sucursales/19), en
 * GeoJSON (longitud, latitud), simplificados. El mapa de calles lo pone MapLibre con los mosaicos de OpenFreeMap; esto
 * solo dibuja el contorno de cada municipio encima. Solo lee un archivo; la descarga (Overpass API, una vez) va fuera
 * del repo.
 *
 * Fuente: © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright).
 *
 *   npx tsx scripts/sucursales/limites-ciudad.ts --municipios municipios.json \
 *     --salida components/sucursales/mapa-guadalajara-limites.ts
 *
 * municipios.json: rel["boundary"="administrative"]["admin_level"="6"]["name"~"^(Guadalajara|Zapopan|…)$"]; out geom;
 */
const args = process.argv.slice(2);
const opcion = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const entrada = opcion('--municipios');
const salida = opcion('--salida');
if (!entrada || !salida) throw new Error('Faltan --municipios o --salida');

type P = [number, number];
const TOLERANCIA = 0.0003; // grados, unos 30 m: a la escala de la ciudad no se nota
const redondear = (p: P): P => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5];

function simplificar(ps: P[], tol: number): P[] {
  if (ps.length <= 2) return ps;
  const [a, b] = [ps[0], ps[ps.length - 1]];
  let max = 0;
  let i = 0;
  for (let k = 1; k < ps.length - 1; k++) {
    const d = distancia(ps[k], a, b);
    if (d > max) [max, i] = [d, k];
  }
  if (max <= tol) return [a, b];
  return [...simplificar(ps.slice(0, i + 1), tol).slice(0, -1), ...simplificar(ps.slice(i), tol)];
}
function distancia(p: P, a: P, b: P) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const l = dx * dx + dy * dy;
  if (!l) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Une las vías externas de una relación en anillos cerrados (por sus extremos). */
function anillos(miembros: { geometry?: { lat: number; lon: number }[]; role: string }[]): P[][] {
  const tramos = miembros
    .filter((m) => m.role !== 'inner' && m.geometry?.length)
    .map((m) => m.geometry!.map((g) => [g.lon, g.lat] as P));
  const igual = (a: P, b: P) => Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;
  const res: P[][] = [];
  while (tramos.length) {
    let anillo = tramos.shift()!;
    let avanzo = true;
    while (!igual(anillo[0], anillo[anillo.length - 1]) && avanzo) {
      avanzo = false;
      for (let i = 0; i < tramos.length; i++) {
        const t = tramos[i];
        const fin = anillo[anillo.length - 1];
        if (igual(t[0], fin)) anillo = [...anillo, ...t.slice(1)];
        else if (igual(t[t.length - 1], fin)) anillo = [...anillo, ...[...t].reverse().slice(1)];
        else continue;
        tramos.splice(i, 1);
        avanzo = true;
        break;
      }
    }
    res.push(anillo);
  }
  return res;
}

const NOMBRES: Record<string, string> = {
  Guadalajara: 'Guadalajara',
  Zapopan: 'Zapopan',
  'San Pedro Tlaquepaque': 'Tlaquepaque',
  Tonalá: 'Tonalá',
  'Tlajomulco de Zúñiga': 'Tlajomulco',
  'El Salto': 'El Salto',
};
const M = JSON.parse(readFileSync(entrada, 'utf8')) as {
  elements: {
    tags: { name: string };
    members: { geometry?: { lat: number; lon: number }[]; role: string }[];
  }[];
};
const features = M.elements
  .filter((e) => NOMBRES[e.tags.name])
  .map((e) => ({
    type: 'Feature' as const,
    properties: { nombre: NOMBRES[e.tags.name], principal: e.tags.name === 'Guadalajara' },
    geometry: {
      type: 'MultiLineString' as const,
      coordinates: anillos(e.members)
        .map((r) => simplificar(r, TOLERANCIA).map(redondear))
        .filter((r) => r.length > 3),
    },
  }))
  .sort((a, b) => a.properties.nombre.localeCompare(b.properties.nombre));

const ts = `// Generado por scripts/sucursales/limites-ciudad.ts (docs/sucursales/19). No editar a mano.
// © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). Descarga del 2026-11-27 (Overpass API).
import type { FeatureCollection, MultiLineString } from 'geojson';

/** Contorno de los municipios del área metropolitana; \`principal\` es el municipio de Guadalajara. */
export const LIMITES_GDL: FeatureCollection<MultiLineString, { nombre: string; principal: boolean }> = ${JSON.stringify(
  { type: 'FeatureCollection', features },
)};
`;
writeFileSync(salida, ts);
console.log(`${features.length} municipios, ${Math.round(ts.length / 1024)} KB → ${salida}`);
