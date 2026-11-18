'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import type { LibroExcel } from '@/lib/comercializadora/excelImpCafe';

/**
 * "Exportar Excel" (_impExportar / _cafeExportar): arma el .xlsx en el navegador con SheetJS (`xlsx` 0.20.3 de la CDN
 * oficial, la que ya usa el portal), con las hojas que calculó el servidor. No lee nada más ni usa llaves.
 */
export function DescargarExcel({ libro }: { libro: LibroExcel | null }) {
  const [error, setError] = useState(false);
  if (!libro) return null;
  return (
    <>
      <button
        type="button"
        onClick={() =>
          import('xlsx')
            .then((XLSX) => {
              const wb = XLSX.utils.book_new();
              for (const h of libro.hojas)
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(h.filas), h.nombre);
              XLSX.writeFile(wb, libro.archivo);
              setError(false);
            })
            .catch(() => setError(true))
        }
        className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3 text-sm font-semibold"
      >
        <Download size={15} aria-hidden="true" /> Exportar Excel
      </button>
      {error ? (
        <span role="alert" className="text-sm text-bad">
          La librería de Excel no está disponible
        </span>
      ) : null}
    </>
  );
}
