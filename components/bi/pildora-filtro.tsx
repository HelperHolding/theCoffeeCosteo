'use client';
// Píldora de filtro estilo Metabase: botón compacto que abre un recuadro flotante; rellena si el filtro está activo.
import { useEffect, useRef, useState } from 'react';
import { cn } from 'cn';

export function Pildora({
  etiqueta,
  texto,
  activa,
  alQuitar,
  quitarEtiqueta,
  children,
}: {
  etiqueta: string;
  texto: string;
  activa: boolean;
  alQuitar?: () => void;
  quitarEtiqueta?: string;
  children: (cerrar: () => void) => React.ReactNode;
}) {
  const [abierta, setAbierta] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const recuadro = useRef<HTMLDivElement>(null);
  const cerrar = (regresarFoco = true) => {
    setAbierta(false);
    if (regresarFoco) boton.current?.focus();
  };

  useEffect(() => {
    if (!abierta) return;
    recuadro.current?.querySelector<HTMLElement>('input, button, [role="option"], select')?.focus();
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierta(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierta]);

  return (
    <div
      ref={raiz}
      className="sm:relative"
      onKeyDown={(e) => {
        if (abierta && e.key === 'Escape') {
          e.stopPropagation();
          cerrar();
        }
      }}
    >
      <div
        className={cn(
          'inline-flex max-w-[18rem] items-center rounded-full border text-sm',
          activa ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink',
        )}
      >
        <button
          ref={boton}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={abierta}
          onClick={() => setAbierta((v) => !v)}
          className="inline-flex min-w-0 items-center gap-1 py-1.5 pr-2 pl-3 font-medium"
        >
          <span className="truncate">{texto}</span>
          <span aria-hidden="true" className="opacity-70">▾</span>
        </button>
        {activa && alQuitar && (
          <button
            type="button"
            aria-label={quitarEtiqueta ?? `Quitar ${etiqueta}`}
            onClick={alQuitar}
            className="py-1.5 pr-3 pl-1 font-bold opacity-80 hover:opacity-100"
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>
      {abierta && (
        <div
          ref={recuadro}
          role="dialog"
          aria-label={etiqueta}
          className="absolute left-0 z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] max-sm:inset-x-0 max-sm:w-auto rounded-xl border border-line-strong bg-surface p-3 text-ink shadow-lg"
        >
          {children(() => cerrar())}
        </div>
      )}
    </div>
  );
}

/** Lista de opción única dentro de un recuadro (Fecha Relativa, Comparable). */
export function ListaUnica({
  opciones,
  valor,
  alElegir,
}: {
  opciones: { valor: string; texto: string }[];
  valor: string;
  alElegir: (v: string) => void;
}) {
  return (
    <ul role="listbox" className="max-h-72 overflow-auto">
      {opciones.map((o) => (
        <li
          key={o.valor}
          role="option"
          aria-selected={o.valor === valor}
          tabIndex={0}
          onClick={() => alElegir(o.valor)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              alElegir(o.valor);
            }
          }}
          className={cn(
            'cursor-pointer rounded px-2 py-1.5 text-sm hover:bg-surface-2',
            o.valor === valor && 'font-semibold',
          )}
        >
          {o.texto}
        </li>
      ))}
    </ul>
  );
}
