'use client';
import { useId, useState } from 'react';

export function Pestanas({
  pestanas,
  inicial,
  parametro = 'tab',
}: {
  pestanas: { id: string; nombre: string; contenido: React.ReactNode; contador?: number }[];
  inicial?: string;
  parametro?: string;
}) {
  const base = useId();
  const [actual, setActual] = useState(pestanas.some((p) => p.id === inicial) ? inicial! : pestanas[0]?.id);
  const elegir = (id: string) => {
    setActual(id);
    const params = new URLSearchParams(window.location.search);
    params.set(parametro, id);
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
  };
  return (
    <div className="space-y-6">
      <div
        role="tablist"
        aria-orientation="horizontal"
        className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line [scrollbar-width:none]"
        onKeyDown={(e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          const i = pestanas.findIndex((p) => p.id === actual);
          const siguiente =
            pestanas[(i + (e.key === 'ArrowRight' ? 1 : -1) + pestanas.length) % pestanas.length];
          elegir(siguiente.id);
          document.getElementById(`${base}-${siguiente.id}`)?.focus();
        }}
      >
        {pestanas.map((p) => {
          const activa = p.id === actual;
          return (
            <button
              key={p.id}
              id={`${base}-${p.id}`}
              role="tab"
              type="button"
              aria-selected={activa}
              aria-controls={`${base}-${p.id}-panel`}
              tabIndex={activa ? 0 : -1}
              onClick={() => elegir(p.id)}
              className={`relative -mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                activa ? 'border-ink text-ink' : 'border-transparent text-muted-foreground hover:text-ink'
              }`}
            >
              {p.nombre}
              {p.contador !== undefined && (
                <span
                  className={`rounded-full px-1.5 text-[11px] tabular ${activa ? 'bg-ink text-white' : 'bg-surface-2 text-ink-2'}`}
                >
                  {p.contador}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {pestanas.map((p) => (
        <div
          key={p.id}
          id={`${base}-${p.id}-panel`}
          role="tabpanel"
          aria-labelledby={`${base}-${p.id}`}
          hidden={p.id !== actual}
          className="space-y-6"
        >
          {p.contenido}
        </div>
      ))}
    </div>
  );
}
