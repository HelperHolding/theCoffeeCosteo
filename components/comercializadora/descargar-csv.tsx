'use client';
import { Download } from 'lucide-react';
import { aCsv } from '@/lib/comercializadora/formato';

export function DescargarCsv({
  nombre,
  filas,
  columnas,
}: {
  nombre: string;
  filas: Record<string, unknown>[];
  columnas: [string, string][];
}) {
  return (
    <button
      type="button"
      onClick={() => {
        const url = URL.createObjectURL(
          new Blob([aCsv(filas, columnas)], { type: 'text/csv;charset=utf-8' }),
        );
        const a = document.createElement('a');
        a.href = url;
        a.download = nombre;
        a.click();
        URL.revokeObjectURL(url);
      }}
      className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3 text-sm font-semibold"
    >
      <Download size={15} aria-hidden="true" /> Descargar CSV
    </button>
  );
}
