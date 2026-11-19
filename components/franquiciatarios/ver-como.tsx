'use client';
import { useState, useTransition } from 'react';
import { Eye } from 'lucide-react';
import { Segmentos } from '@/components/ui/segmentos';
import { verComo } from '@/app/(franquiciatarios)/franquiciatarios/acciones';
import type { RolFranq } from '@/lib/supabase/sesion';

const NOMBRE: Record<RolFranq, string> = {
  admin: 'Administración',
  franquiciatario: 'Franquiciatario',
  gerente: 'Gerente',
  barista: 'Baristas',
};

/**
 * Vista previa del admin del módulo: elige con qué rol ver las pantallas de la sucursal. Solo cambia lo que se
 * muestra; lo que registre sigue siendo un registro real a su nombre.
 */
export function VerComo({ rol }: { rol: RolFranq }) {
  const [actual, setActual] = useState(rol);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-line-strong bg-surface-2 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <p className="flex items-start gap-2 text-sm text-ink-2">
        <Eye size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          <span className="font-semibold text-ink">Ver como</span> · vista previa del administrador.
          {actual !== 'admin' && ' Lo que registres aquí es real y queda a tu nombre.'}
        </span>
      </p>
      <Segmentos
        etiqueta="Ver la sucursal como"
        opciones={(Object.keys(NOMBRE) as RolFranq[]).map((r) => ({ id: r, texto: NOMBRE[r] }))}
        activa={actual}
        alCambiar={(id) => {
          const r = id as RolFranq;
          const antes = actual;
          setActual(r);
          setError(null);
          iniciar(async () => {
            try {
              const res = await verComo(r);
              if ('error' in res) {
                setActual(antes);
                setError(res.error);
              }
            } catch {
              setActual(antes);
              setError('No hay conexión. Intenta de nuevo.');
            }
          });
        }}
        className={pendiente ? 'opacity-70' : undefined}
      />
      {error && (
        <p role="alert" className="text-sm font-medium text-bad lg:basis-full">
          {error}
        </p>
      )}
    </div>
  );
}
