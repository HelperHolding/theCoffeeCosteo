'use client';
import { useState } from 'react';

/**
 * Renglón de proveedor que se abre para ver sus artículos (_planSemToggle / _hoyToggle). El botón "+/−" lo abre con el
 * teclado; un clic en el renglón también, salvo en sus enlaces y botones (Crear OC, Copiar pedido).
 */
export function FilaPlegable(p: {
  etiqueta: string;
  titulo: React.ReactNode;
  celdas: React.ReactNode;
  detalle: React.ReactNode;
  claseTitulo?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <tr
        className="cursor-pointer hover:bg-surface-2"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('a,button')) setAbierto(!abierto);
        }}
      >
        <td className={p.claseTitulo ?? 'sticky left-0 z-[1] bg-surface font-semibold'}>
          <button
            type="button"
            aria-expanded={abierto}
            aria-label={`${abierto ? 'Ocultar' : 'Ver'} los artículos de ${p.etiqueta}`}
            onClick={() => setAbierto(!abierto)}
            className="mr-1 inline-block w-4 text-muted-foreground"
          >
            {abierto ? '−' : '+'}
          </button>
          {p.titulo}
        </td>
        {p.celdas}
      </tr>
      {abierto ? p.detalle : null}
    </>
  );
}
