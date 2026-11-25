// components/comercializadora/reporte-semanal/descargar.tsx
'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';

/** HTML: enlace directo. PDF: se pide con fetch para poder mostrar el error y ofrecer el HTML si falla. */
export function DescargarReporte({ semana }: { semana: string }) {
  const base = `/comercializadora/reporte-semanal/descargar?semana=${semana}`;
  const [pendiente, setPendiente] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function pdf() {
    setPendiente(true);
    setError(null);
    try {
      const r = await fetch(`${base}&formato=pdf`);
      if (!r.ok) throw new Error((await r.text()) || 'No se pudo generar el PDF.');
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a');
      a.href = url;
      a.download = `reporte-ventas-${semana}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el PDF.');
    } finally {
      setPendiente(false);
    }
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm">
      <Download size={14} aria-hidden="true" />
      <a href={`${base}&formato=html`} download className="font-semibold underline">HTML</a>
      <button type="button" onClick={pdf} disabled={pendiente} className="font-semibold underline">
        {pendiente ? 'Generando PDF…' : 'PDF'}
      </button>
      {error && (
        <span role="alert" className="text-bad">
          {error} <a href={`${base}&formato=html`} download className="underline">Bajar HTML</a>
        </span>
      )}
    </span>
  );
}
