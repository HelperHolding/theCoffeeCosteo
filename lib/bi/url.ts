// Filtros del tablero BI en la URL: lectura tolerante, escritura canónica y periodo efectivo.
import { fechaRelativa, type FiltrosBi } from './filtros';

const ETIQUETAS_FR = [
  'Hoy', 'Ayer', 'Esta semana', 'Semana anterior', '2 semanas anteriores', '3 semanas anteriores',
  '4 semanas anteriores', 'Últimas 4 semanas', 'Este mes', 'Mes anterior', 'Últimos 3 meses', 'Este trimestre',
  'Trimestre anterior', 'Este año', 'Año anterior',
];
const aClave = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '-');
export const OPCIONES_FR: { clave: string; etiqueta: string }[] = ETIQUETAS_FR.map((etiqueta) => ({
  clave: aClave(etiqueta),
  etiqueta,
}));
export const FR_POR_OMISION = 'esta-semana';
const MAX_DIAS = 1100;
const DIA_MS = 86_400_000;

/** Filtros de la URL (sin fechas resueltas). */
export interface FiltrosUrl {
  fr?: string;
  desde?: string;
  hasta?: string;
  comparable?: boolean;
  aniosOperando: number[];
  dias: number[];
  companias: number[];
  franquiciatarios: string[];
  tipos: string[];
  categorias: string[];
  grupos: string[];
  cafe: ('Sí' | 'No')[];
  productos: string[];
  pagos: string[];
  horas: number[];
  maduracion: string[];
  montoMin?: number;
  montoMax?: number;
  semanas: string[];
}

const decodificar = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // % suelto: se conserva tal cual
  }
};
const lista = (q: URLSearchParams, k: string) =>
  (q.get(k) ?? '').split(',').map((s) => decodificar(s).trim()).filter(Boolean);
const enteros = (q: URLSearchParams, k: string, min: number, max: number) =>
  [...new Set(lista(q, k).map(Number).filter((n) => Number.isInteger(n) && n >= min && n <= max))];
const monto = (v: string | null) => {
  if (v == null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const siNo = (v: string | null) => (v === 'si' ? true : v === 'no' ? false : undefined);
const fechaOk = (s: string | null): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export function leerUrl(q: URLSearchParams): FiltrosUrl {
  const desde = q.get('desde');
  const hasta = q.get('hasta');
  // Con las dos presentes se conservan tal cual: si son inválidas, resolverPeriodo lo reporta.
  const conRango = !!desde && !!hasta;
  const fr = q.get('fr');
  return {
    fr: conRango ? undefined : OPCIONES_FR.some((o) => o.clave === fr) ? fr! : FR_POR_OMISION,
    desde: conRango ? desde! : undefined,
    hasta: conRango ? hasta! : undefined,
    comparable: siNo(q.get('comp')),
    aniosOperando: enteros(q, 'anios', 0, 99),
    dias: enteros(q, 'dias', 0, 6),
    companias: enteros(q, 'tiendas', 1, 2_147_483_647),
    franquiciatarios: lista(q, 'franq'),
    tipos: lista(q, 'tipo'),
    categorias: lista(q, 'cat'),
    grupos: lista(q, 'grupo'),
    cafe: lista(q, 'cafe').map((s) => (s === 'si' ? 'Sí' : s === 'no' ? 'No' : null)).filter((x): x is 'Sí' | 'No' => !!x),
    productos: lista(q, 'prod'),
    pagos: lista(q, 'pago'),
    horas: enteros(q, 'hora', 0, 23),
    maduracion: lista(q, 'mad'),
    montoMin: monto(q.get('min')),
    montoMax: monto(q.get('max')),
    semanas: lista(q, 'sem'),
  };
}

/** Inverso de `leerUrl`: omite vacíos y el periodo por omisión. */
export function escribirUrl(f: FiltrosUrl): URLSearchParams {
  const q = new URLSearchParams();
  const lis = (k: string, v: (string | number)[]) => {
    if (v.length) q.set(k, v.map((x) => encodeURIComponent(String(x))).join(','));
  };
  if (f.fr && f.fr !== FR_POR_OMISION) q.set('fr', f.fr);
  if (f.desde) q.set('desde', f.desde);
  if (f.hasta) q.set('hasta', f.hasta);
  if (f.comparable !== undefined) q.set('comp', f.comparable ? 'si' : 'no');
  lis('anios', f.aniosOperando);
  lis('dias', f.dias);
  lis('tiendas', f.companias);
  lis('franq', f.franquiciatarios);
  lis('tipo', f.tipos);
  lis('cat', f.categorias);
  lis('grupo', f.grupos);
  lis('cafe', f.cafe.map((c) => (c === 'Sí' ? 'si' : 'no')));
  lis('prod', f.productos);
  lis('pago', f.pagos);
  lis('hora', f.horas);
  lis('mad', f.maduracion);
  if (f.montoMin !== undefined) q.set('min', String(f.montoMin));
  if (f.montoMax !== undefined) q.set('max', String(f.montoMax));
  lis('sem', f.semanas);
  return q;
}

/** Fecha de hoy (AAAA-MM-DD) en America/Mexico_City. */
export function hoyMexico(ahora: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora);
}

export function resolverPeriodo(
  f: FiltrosUrl,
  hoy: string,
): { ok: true; desde: string; hasta: string } | { ok: false; error: string } {
  let p: { desde: string; hasta: string } | null = null;
  if (f.desde && f.hasta) {
    if (!fechaOk(f.desde) || !fechaOk(f.hasta)) return { ok: false, error: 'El periodo no es válido.' };
    p ={ desde: f.desde, hasta: f.hasta };
  } else {
    const etiqueta = OPCIONES_FR.find((o) => o.clave === (f.fr ?? FR_POR_OMISION))?.etiqueta;
    p = etiqueta ? fechaRelativa(etiqueta, hoy) : null;
  }
  if (!p || p.desde > p.hasta) return { ok: false, error: 'El periodo no es válido.' };
  const dias = (Date.parse(`${p.hasta}T00:00:00Z`) - Date.parse(`${p.desde}T00:00:00Z`)) / DIA_MS + 1;
  if (dias > MAX_DIAS) return { ok: false, error: 'El periodo máximo es de 1,100 días.' };
  return { ok: true, desde: p.desde, hasta: p.hasta };
}

/** FiltrosUrl + periodo + compañías efectivas → FiltrosBi para aJsonRpc. */
export function aFiltrosBi(
  f: FiltrosUrl,
  periodo: { desde: string; hasta: string },
  companias: number[],
  hoy: string,
): FiltrosBi {
  return {
    desde: periodo.desde,
    hasta: periodo.hasta,
    companias,
    dias: f.dias,
    horas: f.horas,
    semanas: f.semanas,
    franquiciatarios: f.franquiciatarios,
    tipos: f.tipos,
    aniosOperando: f.aniosOperando,
    comparable: f.comparable,
    maduracion: f.maduracion,
    categorias: f.categorias,
    grupos: f.grupos,
    cafe: f.cafe,
    productos: f.productos,
    pagos: f.pagos,
    montoMin: f.montoMin,
    montoMax: f.montoMax,
    hoy,
  };
}
