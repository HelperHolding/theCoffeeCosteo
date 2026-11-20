// Tarjeta del mosaico BI (estilo Metabase): título chico, descripción de una línea y acciones a la derecha.
import { cn } from 'cn';

/** Columnas que ocupa la tarjeta en la cuadrícula de 12 (escritorio); en tableta 8 y 12 van a lo ancho. */
export const ANCHO = {
  4: 'lg:col-span-4',
  6: 'lg:col-span-6',
  8: 'sm:col-span-2 lg:col-span-8',
  12: 'sm:col-span-2 lg:col-span-12',
} as const;

export function TarjetaBi({
  titulo,
  descripcion,
  acciones,
  ancho,
  cuerpo = true,
  children,
}: {
  titulo: string;
  descripcion?: React.ReactNode;
  acciones?: React.ReactNode;
  ancho: keyof typeof ANCHO;
  cuerpo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={titulo}
      className={cn('flex min-w-0 flex-col rounded-2xl border border-line bg-surface shadow-card', ANCHO[ancho])}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{titulo}</h2>
          {descripcion && <p className="mt-0.5 text-xs text-muted-foreground">{descripcion}</p>}
        </div>
        {acciones}
      </header>
      <div className={cuerpo ? 'min-w-0 flex-1 p-4' : 'min-w-0 flex-1 pt-3'}>{children}</div>
    </section>
  );
}
