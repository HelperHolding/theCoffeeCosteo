import { cn } from 'cn';
import { ArrowLeftRight, MoonStar, Sunrise, type LucideIcon } from 'lucide-react';
import type { SeccionClave } from '@/lib/franquiciatarios/tipos';

/**
 * Color fijo por tipo de información del módulo (tokens --color-<tono> y --color-<tono>-soft en globals.css, con
 * variante oscura). El color va en marcas, barras, bordes y fondos suaves; el texto siempre queda en tinta. Los
 * colores de estado (ok/warn/bad) se reservan para estados: completa, en curso, «No».
 * Las clases van escritas completas para que Tailwind las genere.
 */
export type Tono = SeccionClave | 'ventas' | 'tira' | 'incidencia' | 'alerta';

export const TONO: Record<Tono, { suave: string; borde: string; marca: string }> = {
  apertura: {
    suave: 'bg-apertura-soft',
    borde: 'border-apertura/40',
    marca: 'bg-apertura',
  },
  cambio: {
    suave: 'bg-cambio-soft',
    borde: 'border-cambio/40',
    marca: 'bg-cambio',
  },
  cierre: {
    suave: 'bg-cierre-soft',
    borde: 'border-cierre/40',
    marca: 'bg-cierre',
  },
  ventas: {
    suave: 'bg-ventas-soft',
    borde: 'border-ventas/40',
    marca: 'bg-ventas',
  },
  tira: { suave: 'bg-tira-soft', borde: 'border-tira/40', marca: 'bg-tira' },
  incidencia: {
    suave: 'bg-incidencia-soft',
    borde: 'border-incidencia/40',
    marca: 'bg-incidencia',
  },
  alerta: { suave: 'bg-bad-soft', borde: 'border-bad/40', marca: 'bg-bad' },
};

export const ICONO_SECCION: Record<SeccionClave, LucideIcon> = {
  apertura: Sunrise,
  cambio: ArrowLeftRight,
  cierre: MoonStar,
};

/** Franja vertical de color al borde izquierdo de una tarjeta (el padre lleva `relative overflow-hidden`). */
export function Franja({ tono }: { tono: Tono }) {
  return <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', TONO[tono].marca)} />;
}
