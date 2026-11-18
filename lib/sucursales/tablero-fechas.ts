import { diasEntre, fechaValida, sumarDias } from './tiempo';

/**
 * Fechas del Tablero de México (docs/sucursales/16): hoy en vivo, un día cerrado o un rango de días cerrados.
 * Se comparte entre la ruta, la vista de prueba y las pruebas.
 */

/** Primer día con historial de las 79 sucursales (corte.ts lo cargó desde el 10 de agosto de 2026). */
export const HISTORIAL_DESDE = '2026-08-10';
/** Límite de sucursales_tablero_periodo (120 días por lectura); el periodo anterior lee otros tantos. */
export const RANGO_MAX_DIAS = 120;

export type ConsultaTablero =
  | { modo: 'vivo' }
  | { modo: 'dia'; dia: string }
  | {
      modo: 'rango';
      desde: string;
      hasta: string;
      /** Los mismos días justo antes del rango, para el cambio. */
      previoDesde: string;
      previoHasta: string;
      dias: number;
    };

/**
 * Lee `dia` o `desde` y `hasta` de la URL. `ayer` es el último día cerrado en TODAS las sucursales (el día anterior al
 * «hoy» más temprano entre zonas). Sin fechas, es hoy en vivo.
 */
export function leerConsulta(q: URLSearchParams, ayer: string): ConsultaTablero | { error: string } {
  const dia = q.get('dia');
  const desde = q.get('desde');
  const hasta = q.get('hasta');
  const fuera = (f: string) => f < HISTORIAL_DESDE || f > ayer;
  const rangoTexto = `del ${HISTORIAL_DESDE} al ${ayer}`;
  if (dia !== null) {
    if (!fechaValida(dia)) return { error: 'Día inválido (AAAA-MM-DD).' };
    if (fuera(dia)) return { error: `El día debe estar ${rangoTexto}.` };
    return { modo: 'dia', dia };
  }
  if (desde !== null || hasta !== null) {
    if (!fechaValida(desde) || !fechaValida(hasta)) return { error: 'Rango inválido (AAAA-MM-DD).' };
    if (desde > hasta) return { error: 'El rango empieza después de terminar.' };
    if (fuera(desde) || fuera(hasta)) return { error: `El rango debe estar ${rangoTexto}.` };
    const dias = diasEntre(desde, hasta) + 1;
    if (dias > RANGO_MAX_DIAS) return { error: `El rango puede tener hasta ${RANGO_MAX_DIAS} días.` };
    return {
      modo: 'rango',
      desde,
      hasta,
      previoDesde: sumarDias(desde, -dias),
      previoHasta: sumarDias(desde, -1),
      dias,
    };
  }
  return { modo: 'vivo' };
}
