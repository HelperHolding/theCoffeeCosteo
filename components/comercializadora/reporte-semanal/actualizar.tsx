// components/comercializadora/reporte-semanal/actualizar.tsx
'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

/** Recarga la página con `forzar=1`: la página lee Zoho una sola vez y muestra el aviso si algo falla. */
export function ActualizarReporte({ semana }: { semana: string }) {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  return (
    <button
      type="button"
      className="inline-flex items-center gap-1 text-sm font-semibold underline"
      disabled={pendiente}
      onClick={() => iniciar(() => router.push(`?semana=${semana}&forzar=1`))}
    >
      <RefreshCw size={14} aria-hidden="true" className={pendiente ? 'animate-spin' : undefined} /> {pendiente ? 'Leyendo Zoho…' : 'Actualizar'}
    </button>
  );
}
