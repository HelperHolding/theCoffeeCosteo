'use client';
// Contenido de una píldora de varias opciones: búsqueda opcional y casillas (se aplica al marcar).
import { useState } from 'react';

export function ListaMultiple({
  etiqueta,
  valores,
  elegidos,
  alCambiar,
  buscar,
  nombres,
}: {
  etiqueta: string;
  valores: string[];
  elegidos: string[];
  alCambiar: (elegidos: string[]) => void;
  buscar?: boolean;
  nombres?: Record<string, string>;
}) {
  const [consulta, setConsulta] = useState('');
  const nombre = (v: string) => nombres?.[v] ?? v;
  const q = consulta.trim().toLowerCase();
  const visibles = q ? valores.filter((v) => nombre(v).toLowerCase().includes(q)) : valores;
  const alternar = (v: string) =>
    alCambiar(elegidos.includes(v) ? elegidos.filter((x) => x !== v) : [...elegidos, v]);
  return (
    <div role="group" aria-label={etiqueta} className="max-h-72 overflow-auto">
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
  );
}
