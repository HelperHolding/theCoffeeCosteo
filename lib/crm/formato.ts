// Formatos compartidos por componentes de servidor y de cliente (sin 'use client').
import type { Actividad } from './tipos';

const hoy = () => new Date().toISOString().slice(0, 10);

export const vencida = (a: Pick<Actividad, 'estado' | 'fecha_vencimiento'>) =>
  a.estado !== 'Completed' && !!a.fecha_vencimiento && a.fecha_vencimiento < hoy();

export const fechaCorta = (s: string) =>
  new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${s}T00:00:00Z`));

export const fechaHora = (s: string) =>
  new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Mexico_City',
  }).format(new Date(s));

/** Estilo de los campos de formulario del CRM (texto: sirve en servidor y cliente). */
export const claseCampo =
  'h-10 w-full rounded-[10px] border border-line-strong bg-surface px-3 text-sm shadow-card outline-none focus-visible:ring-[3px] focus-visible:ring-crema/35';
