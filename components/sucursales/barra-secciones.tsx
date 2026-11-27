'use client';
import type { LucideIcon } from 'lucide-react';
import { cn } from 'cn';

export interface Seccion<T extends string> {
  id: T;
  nombre: string;
  detalle: string;
  icono: LucideIcon;
}

/**
 * Barra de secciones de una sucursal (y del tablero de una ciudad, que tiene las mismas): píldora oscura con ícono,
 * nombre y descripción; la activa en crema. En móvil, ícono sobre nombre; desde sm, con su descripción.
 */
export function BarraSecciones<T extends string>({
  etiqueta,
  secciones,
  activa,
  alElegir,
}: {
  etiqueta: string;
  secciones: Seccion<T>[];
  activa: T;
  alElegir: (id: T) => void;
}) {
  return (
    <nav aria-label={etiqueta} className="rounded-2xl bg-ink p-1.5 shadow-card">
      <ul className="grid auto-cols-fr grid-flow-col gap-1.5">
        {secciones.map((s) => {
          const esta = s.id === activa;
          const Icono = s.icono;
          return (
            <li key={s.id} className="min-w-0">
              <button
                type="button"
                aria-current={esta ? 'page' : undefined}
                onClick={() => alElegir(s.id)}
                className={cn(
                  'flex h-full w-full flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crema sm:flex-row sm:gap-3 sm:px-4 sm:py-3 sm:text-left',
                  esta ? 'bg-crema text-ink shadow-card' : 'text-white/75 hover:bg-white/10 hover:text-white',
                )}
              >
                <span
                  className={cn(
                    'grid size-9 shrink-0 place-items-center rounded-lg',
                    esta ? 'bg-ink text-crema' : 'bg-white/10',
                  )}
                >
                  <Icono size={18} aria-hidden="true" />
                </span>
                <span className="min-w-0 max-w-full">
                  <span className="block font-display text-sm font-bold leading-tight sm:text-base">
                    {s.nombre}
                  </span>
                  <span
                    className={cn('hidden truncate text-xs sm:block', esta ? 'text-ink-2' : 'text-white/60')}
                  >
                    {s.detalle}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
