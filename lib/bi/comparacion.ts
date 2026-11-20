// Comparación de los KPI del tablero BI contra el periodo anterior
// (docs/superpowers/specs/2026-11-19-bi-estilo-metabase-design.md §2).

const DIA_MS = 86_400_000;
const aFecha = (s: string) => new Date(`${s}T00:00:00Z`);
const aTexto = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (s: string, n: number) => aTexto(new Date(aFecha(s).getTime() + n * DIA_MS));
const diasEntre = (a: string, b: string) => Math.round((aFecha(b).getTime() - aFecha(a).getTime()) / DIA_MS);

/** Mueve una fecha n meses; si el día no existe en el mes destino, queda en su último día (31 mar − 1 → 28 feb). */
function sumarMeses(s: string, n: number) {
  const d = aFecha(s);
  const a = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  return aTexto(new Date(Date.UTC(a, m, Math.min(d.getUTCDate(), ultimo))));
}
const finDeMes = (s: string) => {
  const d = aFecha(s);
  return aTexto(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
};

type Periodo = { desde: string; hasta: string };
const correrDias = (p: Periodo, n: number): Periodo => ({ desde: sumarDias(p.desde, n), hasta: sumarDias(p.hasta, n) });
/** Tramo en curso (del inicio a hoy): mismo tramo k meses antes. */
const tramoMeses = (p: Periodo, k: number): Periodo => ({ desde: sumarMeses(p.desde, -k), hasta: sumarMeses(p.hasta, -k) });
/** Meses calendario completos: los k meses previos completos. */
const mesesCompletos = (p: Periodo, k: number): Periodo => {
  const desde = sumarMeses(p.desde, -k);
  return { desde, hasta: finDeMes(sumarMeses(p.hasta, -k)) };
};

/** Periodo con el que se comparan los KPI: mismo largo y mismo tramo, inmediatamente antes. */
export function periodoAnterior(fr: string | undefined, p: Periodo): Periodo {
  switch (fr) {
    case 'hoy':
    case 'ayer':
      return correrDias(p, -1);
    case 'esta-semana':
    case 'semana-anterior':
    case '2-semanas-anteriores':
    case '3-semanas-anteriores':
    case '4-semanas-anteriores':
      return correrDias(p, -7);
    case 'ultimas-4-semanas':
      return correrDias(p, -28);
    case 'este-mes':
      return tramoMeses(p, 1);
    case 'este-trimestre':
      return tramoMeses(p, 3);
    case 'este-ano':
      return tramoMeses(p, 12);
    case 'mes-anterior':
      return mesesCompletos(p, 1);
    case 'ultimos-3-meses':
    case 'trimestre-anterior':
      return mesesCompletos(p, 3);
    case 'ano-anterior':
      return mesesCompletos(p, 12);
    default: {
      const n = diasEntre(p.desde, p.hasta) + 1;
      return { desde: sumarDias(p.desde, -n), hasta: sumarDias(p.desde, -1) };
    }
  }
}

const ZONA = 'America/Mexico_City';
const enMexico = (ms: number) => {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const v = (t: string) => partes.find((x) => x.type === t)!.value;
  return { fecha: `${v('year')}-${v('month')}-${v('day')}`, hora: Number(v('hour')) };
};

/**
 * Hora (CDMX) del último corte si el periodo termina hoy y ese corte es de hoy; si no, null (sin recorte).
 * El último día del periodo anterior solo cuenta las líneas con hora < esta hora.
 */
export function horaCorte(ultimoCorte: string | null, hasta: string, hoy: string): number | null {
  if (!ultimoCorte || hasta !== hoy) return null;
  const ms = Date.parse(ultimoCorte);
  if (!Number.isFinite(ms)) return null;
  const c = enMexico(ms);
  return c.fecha === hoy ? c.hora : null;
}

/** Cambio relativo; sin base (anterior 0 o nulo) no hay comparación. «igual» si |cambio| < 0.1 %. */
export function cambio(actual: number | null, anterior: number | null) {
  if (actual === null || anterior === null || anterior === 0) return null;
  const pct = (actual - anterior) / anterior;
  const dir: 'sube' | 'baja' | 'igual' = Math.abs(pct) < 0.001 ? 'igual' : pct > 0 ? 'sube' : 'baja';
  return { pct, dir };
}
