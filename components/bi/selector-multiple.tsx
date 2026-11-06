'use client';

// Selector de varias opciones: botón que abre un panel con casillas (y búsqueda opcional).
import { useEffect, useId, useRef, useState } from 'react';

interface Props {
  etiqueta: string;
  valores: string[];
  elegidos: string[];
  alCambiar: (elegidos: string[]) => void;
  buscar?: boolean;
  /** Texto legible por valor (si no, se muestra el valor). */
  nombres?: Record<string, string>;
}

export function SelectorMultiple({ etiqueta, valores, elegidos, alCambiar, buscar, nombres }: Props) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  const [consulta, setConsulta] = useState('');
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const nombre = (v: string) => nombres?.[v] ?? v;

  const cerrar = () => {
    setAbierto(false);
    setConsulta('');
  };

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) cerrar();
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  const visibles = consulta.trim()
    ? valores.filter((v) => nombre(v).toLowerCase().includes(consulta.trim().toLowerCase()))
    : valores;
  const alternar = (v: string) =>
    alCambiar(elegidos.includes(v) ? elegidos.filter((x) => x !== v) : [...elegidos, v]);

  return (
    <div
      ref={raiz}
      className="relative min-w-0"
      onKeyDown={(e) => {
        if (abierto && e.key === 'Escape') {
          e.stopPropagation();
          cerrar();
          boton.current?.focus();
        }
      }}
    >
      <label htmlFor={id} className="mb-1 block text-xs font-semibold text-ink-2">
        {etiqueta}
      </label>
      <button
        ref={boton}
        id={id}
        type="button"
        aria-expanded={abierto}
        onClick={() => (abierto ? cerrar() : setAbierto(true))}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-line bg-surface px-3 py-2 text-left text-sm"
      >
        <span className="truncate">{elegidos.length ? `${elegidos.length} elegidos` : 'Todos'}</span>
        <span aria-hidden="true" className="text-muted-foreground">▾</span>
      </button>
      {abierto && (
        <div
          role="group"
          aria-label={etiqueta}
          className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-auto rounded-md border border-line-strong bg-surface p-2 shadow-lg"
        >
          {buscar && (
            <input
              type="search"
              aria-label={`Buscar en ${etiqueta}`}
              value={consulta}
              onChange={(e) => setConsulta(e.target.value)}
              className="mb-2 w-full rounded-md border border-line px-2 py-1.5 text-sm"
            />
          )}
          {visibles.length === 0 && <p className="px-1 py-1 text-sm text-muted-foreground">Sin opciones</p>}
          {visibles.map((v) => (
            <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-surface-2">
              <input type="checkbox" checked={elegidos.includes(v)} onChange={() => alternar(v)} />
              <span className="min-w-0 break-words">{nombre(v)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
