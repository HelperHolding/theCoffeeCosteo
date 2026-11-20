import { cn } from 'cn';
import { ArrowLeftRight, MoonStar, Sunrise, Timer, type LucideIcon } from 'lucide-react';
import type { SeccionClave } from '@/lib/franquiciatarios/tipos';

/**
 * Color fijo por tipo de información del módulo (tokens --color-<tono> y --color-<tono>-soft en globals.css, con
 * variante oscura). El color va en marcas, barras, bordes y en un brillo que sube desde abajo (brillo); el texto siempre queda en tinta. Los
 * colores de estado (ok/warn/bad) se reservan para estados: completa, en curso, «No».
 * Las clases van escritas completas para que Tailwind las genere.
 */
export type Tono = SeccionClave | 'ventas' | 'tira' | 'incidencia' | 'alerta';

export const TONO: Record<Tono, { suave: string; brillo: string; borde: string; marca: string }> = {
  apertura: {
    suave: 'bg-apertura-soft',
    brillo: 'bg-linear-to-t from-apertura/25 via-apertura/8 via-45% to-surface',
    borde: 'border-apertura/40',
    marca: 'bg-apertura',
  },
  durante: {
    suave: 'bg-durante-soft',
    brillo: 'bg-linear-to-t from-durante/25 via-durante/8 via-45% to-surface',
    borde: 'border-durante/40',
    marca: 'bg-durante',
  },
  cambio: {
    suave: 'bg-cambio-soft',
    brillo: 'bg-linear-to-t from-cambio/25 via-cambio/8 via-45% to-surface',
    borde: 'border-cambio/40',
    marca: 'bg-cambio',
  },
  // Medio turno (v2) es la misma fase que el cambio de turno (v1): mismo color.
  medio: {
    suave: 'bg-cambio-soft',
    brillo: 'bg-linear-to-t from-cambio/25 via-cambio/8 via-45% to-surface',
    borde: 'border-cambio/40',
    marca: 'bg-cambio',
  },
  cierre: {
    suave: 'bg-cierre-soft',
    brillo: 'bg-linear-to-t from-cierre/25 via-cierre/8 via-45% to-surface',
    borde: 'border-cierre/40',
    marca: 'bg-cierre',
  },
  ventas: {
    suave: 'bg-ventas-soft',
    brillo: 'bg-linear-to-t from-ventas/25 via-ventas/8 via-45% to-surface',
    borde: 'border-ventas/40',
    marca: 'bg-ventas',
  },
  tira: {
    suave: 'bg-tira-soft',
    brillo: 'bg-linear-to-t from-tira/25 via-tira/8 via-45% to-surface',
    borde: 'border-tira/40',
    marca: 'bg-tira',
  },
  incidencia: {
    suave: 'bg-incidencia-soft',
    brillo: 'bg-linear-to-t from-incidencia/25 via-incidencia/8 via-45% to-surface',
    borde: 'border-incidencia/40',
    marca: 'bg-incidencia',
  },
  alerta: {
    suave: 'bg-bad-soft',
    brillo: 'bg-linear-to-t from-bad/25 via-bad/8 via-45% to-surface',
    borde: 'border-bad/40',
    marca: 'bg-bad',
  },
};

export const ICONO_SECCION: Record<SeccionClave, LucideIcon> = {
  apertura: Sunrise,
  durante: Timer,
  cambio: ArrowLeftRight,
  medio: ArrowLeftRight,
  cierre: MoonStar,
};

/** Franja vertical de color al borde izquierdo de una tarjeta (el padre lleva `relative overflow-hidden`). */
export function Franja({ tono }: { tono: Tono }) {
  return <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', TONO[tono].marca)} />;
}
