import { ZONA_OPERACION } from '@/lib/franquiciatarios/dia';

/** Hora local de la operación (CDMX), 24 h: «08:12». */
export const hora = (iso: string) =>
  new Intl.DateTimeFormat('es-MX', {
    timeZone: ZONA_OPERACION,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));

/** «jueves 19 de noviembre» a partir de AAAA-MM-DD. */
export const diaLargo = (dia: string) =>
  new Intl.DateTimeFormat('es-MX', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(`${dia}T12:00:00Z`));

/** «19 nov» a partir de AAAA-MM-DD. */
export const diaCorto = (dia: string) =>
  new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', day: 'numeric', month: 'short' })
    .format(new Date(`${dia}T12:00:00Z`))
    .replace('.', '');
