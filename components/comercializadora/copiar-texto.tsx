'use client';
import { useState } from 'react';

/** "Copiar pedido" / "Copiar folios por borrar" (_hoyCopiar, _borrCopiar): deja el texto en el portapapeles. */
export function CopiarTexto({ texto, etiqueta, ok }: { texto: string; etiqueta: string; ok: string }) {
  const [msj, setMsj] = useState<{ bien: boolean; t: string } | null>(null);
  const mal = () => setMsj({ bien: false, t: 'No se pudo copiar automáticamente' });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          try {
            if (!navigator.clipboard?.writeText) return mal();
            navigator.clipboard.writeText(texto).then(() => setMsj({ bien: true, t: ok }), mal);
          } catch {
            mal();
          }
        }}
        className="rounded-[10px] border border-line-strong px-3 py-1.5 text-sm font-semibold"
      >
        {etiqueta}
      </button>
      {msj ? (
        <span role={msj.bien ? 'status' : 'alert'} className={`text-xs ${msj.bien ? 'text-ok' : 'text-bad'}`}>
          {msj.t}
        </span>
      ) : null}
    </span>
  );
}
