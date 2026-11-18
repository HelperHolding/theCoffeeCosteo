'use client';
import { cn } from 'cn';
import { usePastilla } from './use-pastilla';

export interface OpcionSegmento {
  id: string;
  texto: React.ReactNode;
  /** Punto de color a la izquierda (p. ej. el color del origen en las gráficas). */
  color?: string;
}

/**
 * Selector de una opción entre pocas (Hoy / Un día / Rango, Todo / Mostrador / App / Rappi). Una pastilla oscura se
 * desliza a la opción elegida (transform, var(--dur-corta)); sin JavaScript o antes de medir, la opción elegida lleva
 * su propio fondo, así que nunca se ve sin marcar. Teclado: flechas para moverse y elegir (patrón radiogroup).
 */
export function Segmentos({
  etiqueta,
  opciones,
  activa,
  alCambiar,
  className,
}: {
  etiqueta: string;
  opciones: OpcionSegmento[];
  activa: string;
  alCambiar: (id: string) => void;
  className?: string;
}) {
  const { ref, medido, animar, estilo } = usePastilla<HTMLDivElement>(
    '[aria-checked="true"]',
    `${activa}|${opciones.length}`,
  );

  const mover = (paso: number) => {
    const i = opciones.findIndex((o) => o.id === activa);
    const siguiente = opciones[(i + paso + opciones.length) % opciones.length];
    alCambiar(siguiente.id);
    requestAnimationFrame(() =>
      ref.current?.querySelector<HTMLButtonElement>(`[data-id="${CSS.escape(siguiente.id)}"]`)?.focus(),
    );
  };

  return (
    <div
      ref={ref}
      role="radiogroup"
      aria-label={etiqueta}
      data-medido={medido ? '' : undefined}
      className={cn('segmentos', className)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          mover(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          mover(-1);
        }
      }}
    >
      {medido && (
        <span
          aria-hidden="true"
          className="segmentos-pastilla"
          data-animar={animar ? '' : undefined}
          style={estilo}
        />
      )}
      {opciones.map((o) => {
        const elegida = o.id === activa;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            data-id={o.id}
            aria-checked={elegida}
            tabIndex={elegida ? 0 : -1}
            onClick={() => alCambiar(o.id)}
          >
            {o.color && (
              <span aria-hidden="true" className="size-2 rounded-full" style={{ backgroundColor: o.color }} />
            )}
            {o.texto}
          </button>
        );
      })}
    </div>
  );
}
