'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Archive, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { archivarTienda, moverTienda } from '@/app/(crm)/crm/acciones';
import { MoverA } from '../tarjeta-tienda';
import type { Tienda } from '@/lib/crm/tipos';

const motivos: Record<string, string> = {
  fecha_apertura: 'Las dos fechas de apertura de Zoho no coincidían; se tomó "Fecha en que aperturó".',
  marca_cafetera: 'La marca de cafetera del campo y la de la etiqueta no coincidían.',
};

export function AccionesTienda({
  tienda,
  etapas,
  editable,
}: {
  tienda: Pick<Tienda, 'id' | 'nombre' | 'etapa_id' | 'version' | 'revisar'>;
  etapas: { id: string; nombre: string }[];
  editable: boolean;
}) {
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const etapa = etapas.find((e) => e.id === tienda.etapa_id)?.nombre ?? '';
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white">
          {etapa}
        </span>
        {editable && (
          <>
            <MoverA
              tarjeta={tienda}
              etapas={etapas}
              deshabilitado={pendiente}
              alMover={(nueva) =>
                iniciar(async () => {
                  setError('');
                  const r = await moverTienda(tienda.id, nueva, null, tienda.version);
                  if (r.error !== undefined) return setError(r.error);
                  router.refresh();
                })
              }
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={pendiente}
              onClick={() =>
                iniciar(async () => {
                  if (!window.confirm(`¿Archivar ${tienda.nombre}? Dejará de verse en el pipeline.`)) return;
                  const r = await archivarTienda(tienda.id, tienda.version);
                  if (r.error !== undefined) return setError(r.error);
                  router.push('/crm/tiendas');
                })
              }
            >
              <Archive aria-hidden="true" /> Archivar
            </Button>
          </>
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      {tienda.revisar.length > 0 && (
        <div className="flex gap-2 rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
          <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <ul>
            {tienda.revisar.map((r) => (
              <li key={r}>{motivos[r] ?? `Revisar ${r.replaceAll('_', ' ')}.`}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
