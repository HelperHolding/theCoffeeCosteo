import { enZona, sumarDias } from './tiempo';

/**
 * Periodo compartido por Productos, Costeo y Consumo (hasta 62 días; docs/sucursales/13). «Hoy» es el de la sucursal,
 * no el del navegador. La API vuelve a validar el rango (400 si pasa de 62 días).
 */
export const DIAS_MAXIMOS = 62;
export const PRESETS = [
  { id: 'hoy', nombre: 'Hoy', dias: 0, fin: 0 },
  { id: 'ayer', nombre: 'Ayer', dias: 0, fin: -1 },
  { id: '7d', nombre: 'Últimos 7 días', dias: 6, fin: 0 },
  { id: '28d', nombre: 'Últimos 28 días', dias: 27, fin: 0 },
  { id: '62d', nombre: 'Últimos 62 días', dias: 61, fin: 0 },
] as const;
export type IdPreset = (typeof PRESETS)[number]['id'];
export type Periodo = { id: IdPreset } | { id: 'rango'; desde: string; hasta: string };

export function rango(p: Periodo, zona: string, ahora = new Date()): { desde: string; hasta: string } {
  if (p.id === 'rango') return { desde: p.desde, hasta: p.hasta };
  const hoy = enZona(ahora, zona).fecha;
  const x = PRESETS.find((y) => y.id === p.id)!;
  const hasta = sumarDias(hoy, x.fin);
  return { desde: sumarDias(hasta, -x.dias), hasta };
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
/** Lee el periodo de la URL (?periodo=28d o ?desde=…&hasta=…); si no es válido, el de por omisión. */
export function periodoDeUrl(q: URLSearchParams, porOmision: IdPreset): Periodo {
  const d = q.get('desde');
  const h = q.get('hasta');
  if (d && h && FECHA.test(d) && FECHA.test(h) && d <= h) return { id: 'rango', desde: d, hasta: h };
  const id = q.get('periodo');
  return PRESETS.some((x) => x.id === id) ? { id: id as IdPreset } : { id: porOmision };
}
