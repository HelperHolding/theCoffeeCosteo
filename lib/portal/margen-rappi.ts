import type { Estado } from '@/components/portal/piezas';

/** Margen con comisión Rappi de un tamaño (v_resumen.margen_pct, margen y su estado frente al objetivo). */
export type MargenRappi = { pct: number | null; importe: number | null; estado: Estado };
type ConMargen = { precios?: { margenRappi?: MargenRappi }[] };

export const FILTROS_MARGEN = {
  todos: 'Todos los márgenes',
  atencion: 'Requieren atención',
  bajo: 'Bajo objetivo',
  pierde: 'Pierden dinero',
  ok: 'En objetivo',
  'sin-precio': 'Sin precio',
} as const;
export type FiltroMargen = keyof typeof FILTROS_MARGEN;

export const ORDENES_MARGEN = {
  nombre: 'Orden: nombre',
  menor: 'Menor margen',
  mayor: 'Mayor margen',
} as const;
export type OrdenMargen = keyof typeof ORDENES_MARGEN;

const margenes = (f: ConMargen) => (f.precios ?? []).map((p) => p.margenRappi).filter((m) => m !== undefined);
const conDato = (f: ConMargen) =>
  margenes(f).filter((m): m is MargenRappi & { pct: number } => m.pct !== null && m.importe !== null);

/** Un producto entra si alguno de sus tamaños está en ese estado; "En objetivo" exige todos los tamaños. */
export function cumpleFiltro(f: ConMargen, filtro: FiltroMargen): boolean {
  const estados = margenes(f).map((m) => (m.pct === null ? 'sin-precio' : m.estado));
  if (filtro === 'todos') return true;
  if (filtro === 'ok') return estados.length > 0 && estados.every((e) => e === 'ok');
  if (filtro === 'sin-precio') return estados.length === 0 || estados.includes('sin-precio');
  if (filtro === 'atencion') return estados.some((e) => e === 'bajo' || e === 'pierde');
  return estados.includes(filtro);
}

/** Menor: por el peor tamaño. Mayor: por el mejor tamaño. Sin dato, al final. Estable para empates. */
export function ordenarPorMargen<T extends ConMargen>(filas: T[], orden: OrdenMargen): T[] {
  if (orden === 'nombre') return filas;
  const clave = (f: T) => {
    const pcts = conDato(f).map((m) => m.pct);
    if (!pcts.length) return null;
    return orden === 'menor' ? Math.min(...pcts) : Math.max(...pcts);
  };
  return filas
    .map((f, i) => ({ f, i, k: clave(f) }))
    .sort((a, b) => {
      if (a.k === null || b.k === null) return a.k === b.k ? a.i - b.i : a.k === null ? 1 : -1;
      return (orden === 'menor' ? a.k - b.k : b.k - a.k) || a.i - b.i;
    })
    .map((x) => x.f);
}
