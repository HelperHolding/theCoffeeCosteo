import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Genera components/sucursales/mapa-mexico-trazos.ts (los 32 estados como trazos SVG) a partir del TopoJSON de México
 * de datamaps 0.5.9 (MIT, © 2012 Mark DiMarco; geometría de Natural Earth, dominio público). El TopoJSON se saca como
 * DATOS de dist/datamaps.mex.js (Datamap.prototype.mexTopo = {...}); nunca se ejecuta ese archivo.
 *
 * - Proyección cónica conforme de Lambert con los parámetros del INEGI: paralelos 17.5° y 29.5°, origen 12° N, −102°.
 * - Simplificación Douglas-Peucker por ARCO (antes de armar los polígonos): las fronteras compartidas quedan idénticas.
 * - Se quitan islas chicas o lejanas (Revillagigedo, Guadalupe) para que el mapa no se encoja.
 * - Punto de etiqueta: el punto interior más lejano del borde (rejilla), no el centroide (Veracruz, Baja California).
 *
 *   npx tsx scripts/sucursales/trazos-mexico.ts --entrada <mex.topo.json> --salida components/sucursales/mapa-mexico-trazos.ts
 */
const args = process.argv.slice(2);
const opcion = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const entrada = opcion('--entrada');
const salida = opcion('--salida');
if (!entrada || !salida) throw new Error('Faltan --entrada y --salida');

interface Topologia {
  type: 'Topology';
  objects: {
    mex: {
      geometries: {
        type: 'Polygon' | 'MultiPolygon';
        id: string;
        properties: { name: string | null };
        arcs: number[][] | number[][][];
      }[];
    };
  };
  arcs: [number, number][][];
  transform: { scale: [number, number]; translate: [number, number] };
}
const topo = JSON.parse(readFileSync(entrada, 'utf8')) as Topologia;

/** Clave de datamaps (Natural Earth, códigos FIPS) → clave del tablero. */
const CLAVES: Record<string, [string, string]> = {
  'MX.AG': ['AGS', 'Aguascalientes'],
  'MX.BN': ['BC', 'Baja California'],
  'MX.BS': ['BCS', 'Baja California Sur'],
  'MX.CM': ['CAM', 'Campeche'],
  'MX.CA': ['COAH', 'Coahuila'],
  'MX.CL': ['COL', 'Colima'],
  'MX.CP': ['CHIS', 'Chiapas'],
  'MX.CH': ['CHIH', 'Chihuahua'],
  'MX.DF': ['CDMX', 'Ciudad de México'],
  'MX.DU': ['DGO', 'Durango'],
  'MX.GJ': ['GTO', 'Guanajuato'],
  'MX.GR': ['GRO', 'Guerrero'],
  'MX.HI': ['HGO', 'Hidalgo'],
  'MX.JA': ['JAL', 'Jalisco'],
  'MX.MX': ['MEX', 'Estado de México'],
  'MX.MC': ['MICH', 'Michoacán'],
  'MX.MR': ['MOR', 'Morelos'],
  'MX.NA': ['NAY', 'Nayarit'],
  'MX.NL': ['NL', 'Nuevo León'],
  'MX.OA': ['OAX', 'Oaxaca'],
  'MX.PU': ['PUE', 'Puebla'],
  'MX.QE': ['QRO', 'Querétaro'],
  'MX.QR': ['QROO', 'Quintana Roo'],
  'MX.SL': ['SLP', 'San Luis Potosí'],
  'MX.SI': ['SIN', 'Sinaloa'],
  'MX.SO': ['SON', 'Sonora'],
  'MX.TB': ['TAB', 'Tabasco'],
  'MX.TM': ['TAMS', 'Tamaulipas'],
  'MX.TL': ['TLAX', 'Tlaxcala'],
  'MX.VE': ['VER', 'Veracruz'],
  'MX.YU': ['YUC', 'Yucatán'],
  'MX.ZA': ['ZAC', 'Zacatecas'],
};

// ——— Proyección (esfera unitaria) ———
const rad = Math.PI / 180;
const [F1, F2, F0, L0] = [17.5 * rad, 29.5 * rad, 12 * rad, -102 * rad];
const t = (f: number) => Math.tan(Math.PI / 4 + f / 2);
const N = Math.log(Math.cos(F1) / Math.cos(F2)) / Math.log(t(F2) / t(F1));
const FF = (Math.cos(F1) * Math.pow(t(F1), N)) / N;
const RHO0 = FF / Math.pow(t(F0), N);
type P = [number, number];
const lambert = (lon: number, lat: number): P => {
  const rho = FF / Math.pow(t(lat * rad), N);
  const th = N * (lon * rad - L0);
  return [rho * Math.sin(th), -(RHO0 - rho * Math.cos(th))];
};

// ——— Arcos: absolutos, proyectados ———
const { scale, translate } = topo.transform;
const arcos: P[][] = topo.arcs.map((a) => {
  let x = 0;
  let y = 0;
  return a.map(([dx, dy]) => {
    x += dx;
    y += dy;
    return lambert(x * scale[0] + translate[0], y * scale[1] + translate[1]);
  });
});

// Encaje provisional (con todo) para medir en píxeles; el definitivo va tras quitar islas.
const ANCHO = 800;
const MARGEN = 8;
function encaje(puntos: P[]) {
  const xs = puntos.map((p) => p[0]);
  const ys = puntos.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const k = (ANCHO - 2 * MARGEN) / (x1 - x0);
  return { k, x0, y0, alto: Math.ceil((y1 - y0) * k + 2 * MARGEN) };
}

const anillo = (indices: number[], arcosPx: P[][]): P[] => {
  const r: P[] = [];
  for (const i of indices) {
    const a = i >= 0 ? arcosPx[i] : [...arcosPx[~i]].reverse();
    r.push(...(r.length ? a.slice(1) : a));
  }
  return r;
};
const area = (r: P[]) => {
  let s = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(s / 2);
};
const caja = (r: P[]) => {
  const xs = r.map((p) => p[0]);
  const ys = r.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] as const;
};

const geometrias = topo.objects.mex.geometries.filter((g) => CLAVES[g.id]);
const poligonosDe = (g: (typeof geometrias)[number]) =>
  (g.type === 'Polygon' ? [g.arcs] : g.arcs) as number[][][];

// 1) Qué polígonos se quedan (medido con el encaje provisional, sin simplificar).
const e0 = encaje(arcos.flat());
const aPx0 = (p: P): P => [(p[0] - e0.x0) * e0.k, (p[1] - e0.y0) * e0.k];
const arcosPx0 = arcos.map((a) => a.map(aPx0));
const quedan = new Map<string, number[][][]>();
for (const g of geometrias) {
  const polis = poligonosDe(g).map((rings) => ({ rings, ext: anillo(rings[0], arcosPx0) }));
  const mayor = polis.reduce((a, b) => (area(b.ext) > area(a.ext) ? b : a));
  const [mx0, my0, mx1, my1] = caja(mayor.ext);
  quedan.set(
    g.id,
    polis
      .filter((p) => {
        if (p === mayor) return true;
        const [x0, y0, x1, y1] = caja(p.ext);
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        // Islas: al menos 12 px² y a menos de 60 px de la caja del territorio principal.
        const lejos = Math.max(mx0 - cx, cx - mx1, my0 - cy, cy - my1, 0) > 60;
        return area(p.ext) >= 12 && !lejos;
      })
      .map((p) => p.rings),
  );
}

// 2) Encaje definitivo con lo que queda.
const usados = new Set([...quedan.values()].flat(3).map((i) => (i >= 0 ? i : ~i)));
const e = encaje([...usados].flatMap((i) => arcos[i]));
const aPx = (p: P): P => [(p[0] - e.x0) * e.k + MARGEN, (p[1] - e.y0) * e.k + MARGEN];

// 3) Douglas-Peucker por arco, en píxeles.
const TOLERANCIA = 0.45;
function dp(pts: P[], tol: number): P[] {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const largo = Math.hypot(dx, dy) || 1;
  let max = 0;
  let k = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d =
      dx === 0 && dy === 0
        ? Math.hypot(pts[i][0] - a[0], pts[i][1] - a[1])
        : Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / largo;
    if (d > max) {
      max = d;
      k = i;
    }
  }
  if (max <= tol) return [a, b];
  return [...dp(pts.slice(0, k + 1), tol).slice(0, -1), ...dp(pts.slice(k), tol)];
}
const arcosFinales = arcos.map((a) => dp(a.map(aPx), TOLERANCIA));

// 4) Trazo y punto de etiqueta.
const num = (n: number) => String(Math.round(n * 10) / 10);
const trazo = (r: P[]) => {
  const pts = r.slice(0, -1);
  if (pts.length < 3) return '';
  let d = `M${num(pts[0][0])},${num(pts[0][1])}`;
  let [px, py] = pts[0];
  for (const [x, y] of pts.slice(1)) {
    d += `l${num(x - px)},${num(y - py)}`;
    // Acumula el redondeo: el siguiente relativo parte del punto ya redondeado.
    px = px + Number(num(x - px));
    py = py + Number(num(y - py));
  }
  return `${d}z`;
};
const dentro = (p: P, r: P[]) => {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++)
    if (
      r[i][1] > p[1] !== r[j][1] > p[1] &&
      p[0] < ((r[j][0] - r[i][0]) * (p[1] - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]
    )
      c = !c;
  return c;
};
const distBorde = (p: P, r: P[]) => {
  let m = Infinity;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [ax, ay] = r[j];
    const [bx, by] = r[i];
    const l2 = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
    const u = Math.max(0, Math.min(1, ((p[0] - ax) * (bx - ax) + (p[1] - ay) * (by - ay)) / l2));
    m = Math.min(m, Math.hypot(p[0] - (ax + u * (bx - ax)), p[1] - (ay + u * (by - ay))));
  }
  return m;
};
function etiqueta(r: P[]): { x: number; y: number; radio: number } {
  const [x0, y0, x1, y1] = caja(r);
  let mejor = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, radio: 0 };
  const paso = Math.max(0.5, Math.min(x1 - x0, y1 - y0) / 40);
  for (let x = x0; x <= x1; x += paso)
    for (let y = y0; y <= y1; y += paso) {
      const p: P = [x, y];
      if (!dentro(p, r)) continue;
      const d = distBorde(p, r);
      if (d > mejor.radio) mejor = { x, y, radio: d };
    }
  return mejor;
}

const estados = geometrias
  .map((g) => {
    const [clave, nombre] = CLAVES[g.id];
    const polis = quedan.get(g.id)!;
    const anillos = polis.map((rings) => rings.map((ri) => anillo(ri, arcosFinales)));
    const d = anillos.flat().map(trazo).filter(Boolean).join('');
    const exterior = anillos.map((a) => a[0]).reduce((a, b) => (area(b) > area(a) ? b : a));
    const et = etiqueta(exterior);
    const [bx0, by0, bx1, by1] = caja(anillos.flatMap((a) => a[0]));
    return {
      clave,
      nombre,
      d,
      x: Math.round(et.x * 10) / 10,
      y: Math.round(et.y * 10) / 10,
      // Radio del círculo libre más grande alrededor de la etiqueta: decide si cabe texto adentro.
      radio: Math.round(et.radio * 10) / 10,
      caja: [bx0, by0, bx1, by1].map((v) => Math.round(v * 10) / 10) as [number, number, number, number],
    };
  })
  .sort((a, b) => a.clave.localeCompare(b.clave));

const archivo = `/**
 * Los 32 estados de México como trazos SVG, para el mapa del Tablero de México. GENERADO por
 * scripts/sucursales/trazos-mexico.ts: no se edita a mano.
 *
 * Geometría: Natural Earth (dominio público), vía el TopoJSON de México de datamaps 0.5.9 (MIT, © 2012 Mark DiMarco).
 * Proyección cónica conforme de Lambert con los parámetros del INEGI (paralelos 17.5° y 29.5°, origen 12° N, −102°),
 * simplificada por arco con tolerancia de ${TOLERANCIA} px: las fronteras compartidas coinciden.
 * x, y: punto de etiqueta (el interior más lejano del borde); radio: espacio libre alrededor; caja: [x0, y0, x1, y1].
 */
export interface EstadoTrazo {
  clave: string;
  nombre: string;
  d: string;
  x: number;
  y: number;
  radio: number;
  caja: [number, number, number, number];
}

export const MAPA_MX = { ancho: ${ANCHO}, alto: ${e.alto} } as const;

/** [lon, lat] → [x, y] en el mismo lienzo (para ubicar ciudades). */
export function proyectar(lon: number, lat: number): [number, number] {
  const r = Math.PI / 180;
  const t = (f: number) => Math.tan(Math.PI / 4 + f / 2);
  const rho = ${FF} / Math.pow(t(lat * r), ${N});
  const th = ${N} * (lon * r - ${L0});
  return [(rho * Math.sin(th) - ${e.x0}) * ${e.k} + ${MARGEN}, (-(${RHO0} - rho * Math.cos(th)) - ${e.y0}) * ${e.k} + ${MARGEN}];
}

export const ESTADOS_MX: EstadoTrazo[] = ${JSON.stringify(estados, null, 1)};
`;
writeFileSync(salida, archivo);
console.log(
  `${estados.length} estados; ${MAPA_MX_TXT()}; ${(archivo.length / 1024).toFixed(1)} KB; islas fuera: ${geometrias
    .map((g) => `${CLAVES[g.id][0]} ${poligonosDe(g).length - quedan.get(g.id)!.length}`)
    .filter((x) => !x.endsWith(' 0'))
    .join(', ')}`,
);
function MAPA_MX_TXT() {
  return `${ANCHO}×${e.alto}`;
}
