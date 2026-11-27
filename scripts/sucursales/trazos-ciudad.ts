import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Trazos del mapa de una ciudad (docs/sucursales/19), para el Tablero de ciudad: municipios y avenidas principales en
 * SVG, recortados al recuadro de la ciudad y simplificados. Solo lee archivos; la descarga (Overpass API, una vez) va
 * fuera del repo.
 *
 * Fuente: © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). El mapa del portal lleva
 * el crédito. Proyección: equirectangular local (x ∝ longitud · cos(latitud media), y ∝ latitud): a escala de ciudad
 * la deformación es menor a un píxel.
 *
 *   npx tsx scripts/sucursales/trazos-ciudad.ts --municipios municipios.json --avenidas avenidas.json \
 *     --salida components/sucursales/mapa-guadalajara-trazos.ts
 *
 * municipios.json: rel["boundary"="administrative"]["admin_level"="6"] … out geom;
 * avenidas.json:   way["highway"~"^(motorway|trunk|primary)$"]["name"~"…"](bbox); out geom;
 */
const args = process.argv.slice(2);
const opcion = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const entradaM = opcion('--municipios');
const entradaA = opcion('--avenidas');
const salida = opcion('--salida');
if (!entradaM || !entradaA || !salida) throw new Error('Faltan --municipios, --avenidas o --salida');

// Recuadro de Guadalajara: las 11 sucursales con margen (de Ciudad Granja a Forum Tlaquepaque).
const RECUADRO = { sur: 20.625, norte: 20.73, oeste: -103.47, este: -103.3 };
const ANCHO = 800;
const LAT0 = ((RECUADRO.sur + RECUADRO.norte) / 2) * (Math.PI / 180);
const K = ANCHO / ((RECUADRO.este - RECUADRO.oeste) * Math.cos(LAT0));
const ALTO = Math.round((RECUADRO.norte - RECUADRO.sur) * K);
type P = [number, number];
const proyectar = (lon: number, lat: number): P => [
  (lon - RECUADRO.oeste) * Math.cos(LAT0) * K,
  (RECUADRO.norte - lat) * K,
];

// ── Geometría ──────────────────────────────────────────────────────────────────────────────────────────────────────
const MARGEN = 6;
const caja = { x0: -MARGEN, y0: -MARGEN, x1: ANCHO + MARGEN, y1: ALTO + MARGEN };

/** Sutherland–Hodgman: recorta un anillo contra el recuadro (con margen, para que el borde no se vea). */
function recortarAnillo(anillo: P[]): P[] {
  const lados: [(p: P) => boolean, (a: P, b: P) => P][] = [
    [(p) => p[0] >= caja.x0, (a, b) => corte(a, b, 0, caja.x0)],
    [(p) => p[0] <= caja.x1, (a, b) => corte(a, b, 0, caja.x1)],
    [(p) => p[1] >= caja.y0, (a, b) => corte(a, b, 1, caja.y0)],
    [(p) => p[1] <= caja.y1, (a, b) => corte(a, b, 1, caja.y1)],
  ];
  let salidaA = anillo;
  for (const [dentro, cruce] of lados) {
    const entrada = salidaA;
    salidaA = [];
    for (let i = 0; i < entrada.length; i++) {
      const a = entrada[i];
      const b = entrada[(i + 1) % entrada.length];
      if (dentro(b)) {
        if (!dentro(a)) salidaA.push(cruce(a, b));
        salidaA.push(b);
      } else if (dentro(a)) salidaA.push(cruce(a, b));
    }
    if (!salidaA.length) break;
  }
  return salidaA;
}
function corte(a: P, b: P, eje: 0 | 1, v: number): P {
  const t = (v - a[eje]) / (b[eje] - a[eje]);
  return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
}

/** Douglas–Peucker. */
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

const n1 = (x: number) => Math.round(x * 10) / 10;
const ruta = (anillo: P[], cerrar: boolean) =>
  anillo.map((p, i) => `${i ? 'L' : 'M'}${n1(p[0])} ${n1(p[1])}`).join('') + (cerrar ? 'Z' : '');

/** Une las vías de una relación en anillos cerrados (por sus extremos). */
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

/** Área con signo (para el centroide). */
function centroide(anillo: P[]): P {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < anillo.length; i++) {
    const [x0, y0] = anillo[i];
    const [x1, y1] = anillo[(i + 1) % anillo.length];
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  return a ? [cx / (3 * a), cy / (3 * a)] : anillo[0];
}
const area = (anillo: P[]) =>
  Math.abs(
    anillo.reduce(
      (s, p, i) => s + p[0] * anillo[(i + 1) % anillo.length][1] - anillo[(i + 1) % anillo.length][0] * p[1],
      0,
    ),
  ) / 2;

// ── Municipios ─────────────────────────────────────────────────────────────────────────────────────────────────────
const CLAVES: Record<string, string> = {
  Guadalajara: 'guadalajara',
  Zapopan: 'zapopan',
  'San Pedro Tlaquepaque': 'tlaquepaque',
  Tonalá: 'tonala',
  'Tlajomulco de Zúñiga': 'tlajomulco',
  'El Salto': 'el-salto',
};
const NOMBRE_CORTO: Record<string, string> = {
  'San Pedro Tlaquepaque': 'Tlaquepaque',
  'Tlajomulco de Zúñiga': 'Tlajomulco',
};
const M = JSON.parse(readFileSync(entradaM, 'utf8')) as {
  elements: {
    tags: { name: string };
    members: { geometry?: { lat: number; lon: number }[]; role: string }[];
  }[];
};
const municipios = M.elements
  .filter((e) => CLAVES[e.tags.name])
  .map((e) => {
    const rs = anillos(e.members)
      .map((r) => recortarAnillo(r.map(([lon, lat]) => proyectar(lon, lat))))
      .filter((r) => r.length >= 3)
      .map((r) => simplificar([...r, r[0]], 0.6).slice(0, -1))
      .filter((r) => r.length >= 3 && area(r) > 40);
    const mayor = rs.reduce<P[] | null>((m, r) => (!m || area(r) > area(m) ? r : m), null);
    const [x, y] = mayor ? centroide(mayor) : [0, 0];
    return {
      clave: CLAVES[e.tags.name],
      nombre: NOMBRE_CORTO[e.tags.name] ?? e.tags.name,
      d: rs.map((r) => ruta(r, true)).join(''),
      x: n1(x),
      y: n1(y),
      visible: rs.length > 0 && area(mayor!) > 1500,
    };
  })
  .filter((m) => m.d)
  .sort((a, b) => a.clave.localeCompare(b.clave));

// ── Avenidas ───────────────────────────────────────────────────────────────────────────────────────────────────────
const A = JSON.parse(readFileSync(entradaA, 'utf8')) as {
  elements: { tags: { name: string; highway: string }; geometry?: { lat: number; lon: number }[] }[];
};
const dentro = (p: P) => p[0] >= caja.x0 && p[0] <= caja.x1 && p[1] >= caja.y0 && p[1] <= caja.y1;
const porNombre = new Map<string, { tipo: string; tramos: P[][] }>();
for (const w of A.elements) {
  if (!w.geometry?.length) continue;
  // Las laterales se dibujarían como una línea doble junto a su vía: fuera. Norte/Sur y «Prolongación» son la misma.
  if (/lateral/i.test(w.tags.name)) continue;
  const nombre = /perif[ée]rico/i.test(w.tags.name)
    ? 'Anillo Periférico'
    : w.tags.name
        .replace(/^Prolongación /, '')
        .replace(/ (Norte|Sur|Oriente|Poniente)$/, '')
        .replace(/^Calle /, '');
  const x = porNombre.get(nombre) ?? { tipo: w.tags.highway, tramos: [] };
  // Partes de la vía dentro del recuadro.
  let actual: P[] = [];
  for (const g of w.geometry) {
    const p = proyectar(g.lon, g.lat);
    if (dentro(p)) actual.push(p);
    else if (actual.length) {
      x.tramos.push(actual);
      actual = [];
    }
  }
  if (actual.length > 1) x.tramos.push(actual);
  porNombre.set(nombre, x);
}
const avenidas = [...porNombre]
  .map(([nombre, x]) => ({
    nombre,
    tipo: x.tipo === 'motorway' || x.tipo === 'trunk' ? 'via-rapida' : 'avenida',
    d: x.tramos
      .map((t) => simplificar(t, 0.9))
      .filter((t) => t.length > 1)
      .map((t) => ruta(t, false))
      .join(''),
  }))
  .filter((a) => a.d)
  .sort((a, b) => a.nombre.localeCompare(b.nombre));

const ts = `// Generado por scripts/sucursales/trazos-ciudad.ts (docs/sucursales/19). No editar a mano.
// © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright). Descarga del ${new Date().toISOString().slice(0, 10)} (Overpass API).

export interface MunicipioTrazo {
  clave: string;
  nombre: string;
  d: string;
  /** Punto para el nombre (centroide de su parte más grande dentro del recuadro). */
  x: number;
  y: number;
  /** Solo los municipios con área suficiente dentro del recuadro llevan nombre. */
  visible: boolean;
}
export interface AvenidaTrazo {
  nombre: string;
  tipo: 'via-rapida' | 'avenida';
  d: string;
}

export const MAPA_GDL = {
  ancho: ${ANCHO},
  alto: ${ALTO},
  recuadro: ${JSON.stringify(RECUADRO)},
} as const;

const LAT0 = ${LAT0};
const K = ${K};
/** Longitud y latitud → coordenadas del SVG (misma proyección que los trazos). */
export const proyectarGdl = (lon: number, lat: number): [number, number] => [
  (lon - MAPA_GDL.recuadro.oeste) * Math.cos(LAT0) * K,
  (MAPA_GDL.recuadro.norte - lat) * K,
];

export const MUNICIPIOS_GDL: MunicipioTrazo[] = ${JSON.stringify(municipios, null, 2)};

export const AVENIDAS_GDL: AvenidaTrazo[] = ${JSON.stringify(avenidas, null, 2)};
`;
writeFileSync(salida, ts);
console.log(
  `${municipios.length} municipios, ${avenidas.length} avenidas, ${Math.round(ts.length / 1024)} KB → ${salida} (${ANCHO}×${ALTO})`,
);
