// components/comercializadora/descargar.tsx
'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';

/**
 * «Descargar» HTML / PDF de un reporte. HTML: enlace directo. PDF: se pide con fetch para poder mostrar el error
 * y ofrecer el HTML si falla (spec §5). `base` es la ruta de descarga con sus filtros; aquí se agrega el formato.
 */
export function Descargar({ base, archivoPdf }: { base: string; archivoPdf: string }) {
  const con = (formato: 'html' | 'pdf') => `${base}${base.includes('?') ? '&' : '?'}formato=${formato}`;
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pdf() {
    setPendiente(true);
    setError(null);
    try {
      const r = await fetch(con('pdf'));
      if (!r.ok) throw new Error((await r.text()) || 'No se pudo generar el PDF.');
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = archivoPdf;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Safari y Firefox cancelan la descarga si el enlace se revoca en el mismo instante.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el PDF.');
    } finally {
      setPendiente(false);
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      <Download size={14} aria-hidden="true" />
      <a href={con('html')} download className="font-semibold underline">HTML</a>
      <button type="button" onClick={pdf} disabled={pendiente} className="font-semibold underline">
        {pendiente ? 'Generando PDF…' : 'PDF'}
      </button>
      {error && (
        <span role="alert" className="text-bad">
          {error} <a href={con('html')} download className="underline">Bajar HTML</a>
        </span>
      )}
    </span>
  );
}
