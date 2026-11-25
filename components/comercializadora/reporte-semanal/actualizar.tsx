// components/comercializadora/reporte-semanal/actualizar.tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { actualizarReporte } from '@/app/(comercializadora)/comercializadora/acciones';

export function ActualizarReporte({ semana }: { semana: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-sm font-semibold underline"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await actualizarReporte(semana);
            setError('error' in r ? r.error : null);
            router.refresh();
          })
        }
      >
        <RefreshCw size={14} aria-hidden="true" /> {pendiente ? 'Leyendo Zoho…' : 'Actualizar'}
      </button>
      {error ? <span role="alert" className="text-sm text-bad">{error}</span> : null}
    </span>
  );
}
