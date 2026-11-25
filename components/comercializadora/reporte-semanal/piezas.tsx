import { cn } from 'cn';

export const porcentaje = (x: number | null, dec = 1) => (x == null ? '—' : `${(x * 100).toFixed(dec)}%`);
export const variacion = (x: number | null) =>
  x == null ? '—' : `${x >= 0 ? '▲' : '▼'} ${Math.abs(x * 100).toFixed(1)}%`;

export function SeccionTitulo({ num, children }: { num: string; children: React.ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-center gap-2 first:mt-0">
      <span className="rounded bg-ink px-2 py-0.5 font-mono text-[10px] tracking-widest text-surface">{num}</span>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h2>
    </div>
  );
}

export function ErrorSeccion({ error }: { error: string }) {
  return (
    <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
      No se pudo leer esta sección: {error}
    </p>
  );
}

export function Meta({ cumple }: { cumple: boolean | null }) {
  if (cumple == null) return null;
  return (
    <span className={cn('ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', cumple ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad')}>
      {cumple ? '✓ En meta' : '✕ Fuera de meta'}
    </span>
  );
}

/** Lista numerada larga plegable sin JavaScript: los primeros `visibles` en un <ol> y el resto en <details> con su propio <ol>. */
export function VerTodas<T>({ filas, visibles, render, etiqueta = 'Ver todas', className }: {
  filas: T[]; visibles: number; render: (f: T, i: number) => React.ReactNode; etiqueta?: string; className?: string;
}) {
  return (
    <>
      <ol className={className}>{filas.slice(0, visibles).map(render)}</ol>
      {filas.length > visibles && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-crema-strong">{etiqueta} ({filas.length})</summary>
          <ol className={className}>{filas.slice(visibles).map((f, i) => render(f, i + visibles))}</ol>
        </details>
      )}
    </>
  );
}
