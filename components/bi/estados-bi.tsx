'use client';
// Estados de lectura del tablero BI que no son cifras: desactualizado y cargando.
import { useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { hace } from '@/components/sucursales/formato';

/** Error con cifras previas de la misma lectura: se conservan, con su antigüedad. Nunca se cambian por ceros. */
export function AvisoDesactualizado({
  recibidoEn,
  alReintentar,
}: {
  recibidoEn: number | null;
  alReintentar: () => void;
}) {
  // La antigüedad se toma al aparecer el aviso; un aviso nuevo (otro error) la vuelve a tomar.
  const [ahora] = useState(() => Date.now());
  const antiguedad =
    recibidoEn === null ? '' : ` (${hace(Math.max(0, Math.round((ahora - recibidoEn) / 1000)))})`;
  return (
    <p
      role="status"
      className="flex flex-wrap items-start gap-2 rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-ink-2"
    >
      <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
      <span className="min-w-0 flex-1">
        No se pudo actualizar{antiguedad}. Se muestran las últimas cifras leídas.
      </span>
      <button type="button" onClick={alReintentar} className="font-semibold underline">
        Reintentar
      </button>
    </p>
  );
}

export function Cargando({ texto }: { texto: string }) {
  const bloque = 'rounded-2xl bg-surface/70 motion-safe:animate-pulse';
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={`${bloque} h-32`} />
        ))}
      </div>
      <div className={`${bloque} h-56`} />
      <span className="sr-only">{texto}</span>
    </div>
  );
}
