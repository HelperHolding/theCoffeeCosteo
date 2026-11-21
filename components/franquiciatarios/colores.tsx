import { cn } from 'cn';
import { ArrowLeftRight, MoonStar, Sunrise, Timer, type LucideIcon } from 'lucide-react';
import type { SeccionClave } from '@/lib/franquiciatarios/tipos';

/**
 * Color fijo por tipo de información del módulo (tokens --color-<tono> y --color-<tono>-soft en globals.css, con
 * variante oscura). El color va en marcas, barras, bordes y en un brillo que sube desde abajo (brillo); el texto siempre queda en tinta. Los
 * colores de estado (ok/warn/bad) se reservan para estados: completa, en curso, «No».
 * Las clases van escritas completas para que Tailwind las genere.
 */
export type Tono = SeccionClave | 'ventas' | 'tira' | 'pedidos' | 'incidencia' | 'alerta';

export const TONO: Record<Tono, { suave: string; brillo: string; borde: string; marca: string; texto: string }> = {
  pedidos: {
    suave: 'bg-pedidos-soft',
    brillo: 'bg-linear-to-t from-pedidos/25 via-pedidos/8 via-45% to-surface',
    borde: 'border-pedidos/40',
    marca: 'bg-pedidos',
    texto: 'text-pedidos',
  },
  apertura: {
    suave: 'bg-apertura-soft',
    brillo: 'bg-linear-to-t from-apertura/25 via-apertura/8 via-45% to-surface',
    borde: 'border-apertura/40',
    marca: 'bg-apertura',
    texto: 'text-apertura',
  },
  durante: {
    suave: 'bg-durante-soft',
    brillo: 'bg-linear-to-t from-durante/25 via-durante/8 via-45% to-surface',
    borde: 'border-durante/40',
    marca: 'bg-durante',
    texto: 'text-durante',
  },
  cambio: {
    suave: 'bg-cambio-soft',
    brillo: 'bg-linear-to-t from-cambio/25 via-cambio/8 via-45% to-surface',
    borde: 'border-cambio/40',
    marca: 'bg-cambio',
    texto: 'text-cambio',
  },
  // Medio turno (v2) es la misma fase que el cambio de turno (v1): mismo color.
  medio: {
    suave: 'bg-cambio-soft',
    brillo: 'bg-linear-to-t from-cambio/25 via-cambio/8 via-45% to-surface',
    borde: 'border-cambio/40',
    marca: 'bg-cambio',
    texto: 'text-cambio',
  },
  cierre: {
    suave: 'bg-cierre-soft',
    brillo: 'bg-linear-to-t from-cierre/25 via-cierre/8 via-45% to-surface',
    borde: 'border-cierre/40',
    marca: 'bg-cierre',
    texto: 'text-cierre',
  },
  ventas: {
    suave: 'bg-ventas-soft',
    brillo: 'bg-linear-to-t from-ventas/25 via-ventas/8 via-45% to-surface',
    borde: 'border-ventas/40',
    marca: 'bg-ventas',
    texto: 'text-ventas',
  },
  tira: {
    suave: 'bg-tira-soft',
    brillo: 'bg-linear-to-t from-tira/25 via-tira/8 via-45% to-surface',
    borde: 'border-tira/40',
    marca: 'bg-tira',
    texto: 'text-tira',
  },
  incidencia: {
    suave: 'bg-incidencia-soft',
    brillo: 'bg-linear-to-t from-incidencia/25 via-incidencia/8 via-45% to-surface',
    borde: 'border-incidencia/40',
    marca: 'bg-incidencia',
    texto: 'text-incidencia',
  },
  alerta: {
    suave: 'bg-bad-soft',
    brillo: 'bg-linear-to-t from-bad/25 via-bad/8 via-45% to-surface',
    borde: 'border-bad/40',
    marca: 'bg-bad',
    texto: 'text-bad',
  },
};

export const ICONO_SECCION: Record<SeccionClave, LucideIcon> = {
  apertura: Sunrise,
  durante: Timer,
  cambio: ArrowLeftRight,
  medio: ArrowLeftRight,
  cierre: MoonStar,
};

/** Tonos para colorear categorías sin significado de estado (recetas, posiciones, turnos): se asignan en orden. */
export const TONOS_CICLO: Tono[] = ['ventas', 'cierre', 'cambio', 'apertura', 'tira', 'durante', 'pedidos', 'incidencia'];
/** Tono estable para un nombre (la misma categoría siempre con el mismo color). */
export function tonoDe(nombre: string, lista: Tono[] = TONOS_CICLO): Tono {
  let h = 0;
  for (const c of nombre.toLocaleLowerCase('es-MX')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return lista[h % lista.length];
}

/** Franja vertical de color al borde izquierdo de una tarjeta (el padre lleva `relative overflow-hidden`). */
export function Franja({ tono }: { tono: Tono }) {
  return <span aria-hidden="true" className={cn('absolute inset-y-0 left-0 w-1', TONO[tono].marca)} />;
}
