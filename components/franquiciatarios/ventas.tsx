'use client';
import { useState } from 'react';
import { cn } from 'cn';
import { Segmentos } from '@/components/ui/segmentos';
import { EnVivo } from '@/components/sucursales/en-vivo';
import { Pedidos } from '@/components/sucursales/pedidos';
import { nombreOrigen, opcionesOrigen } from '@/components/sucursales/secciones';
import type { FiltroOrigen } from '@/lib/sucursales/metricas';

const API = '/api/franquiciatarios';

/**
 * Ventas de la sucursal para el módulo: las mismas vistas de Sucursales (En vivo y Pedidos con su desglose), contra la
 * API del módulo (sin neto, costos ni otras sucursales). El origen se elige con botones grandes para tablet.
 */
export function VentasFranq({
  companyId,
  zona,
  rappi,
  alcance,
}: {
  companyId: number;
  zona: string;
  rappi: boolean;
  alcance: string;
}) {
  const [origen, setOrigen] = useState<FiltroOrigen>('todos');
  const [vista, setVista] = useState<'vivo' | 'pedidos'>('vivo');
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <FiltroOrigenFranq origen={origen} rappi={rappi} alCambiar={setOrigen} />
        <Segmentos
          etiqueta="Vista"
          opciones={[
            { id: 'vivo', texto: 'Venta de hoy' },
            { id: 'pedidos', texto: 'Pedidos' },
          ]}
          activa={vista}
          alCambiar={(v) => setVista(v as 'vivo' | 'pedidos')}
        />
      </div>
      <p className="text-xs text-muted-foreground">{alcance}</p>
      {vista === 'vivo' ? (
        <EnVivo companyId={companyId} origen={origen} base={API} />
      ) : (
        <Pedidos companyId={companyId} origen={origen} zona={zona} base={API} diasAtras={7} />
      )}
    </div>
  );
}

export function FiltroOrigenFranq({
  origen,
  rappi,
  alCambiar,
}: {
  origen: FiltroOrigen;
  rappi: boolean;
  alCambiar: (o: FiltroOrigen) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-ink">Origen de los pedidos</legend>
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {opcionesOrigen(rappi).map((o) => (
          <label
            key={o}
            className={cn(
              'flex min-h-12 cursor-pointer items-center justify-center rounded-xl border px-4 text-sm font-semibold transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-crema/45',
              origen === o
                ? 'border-ink bg-ink text-white'
                : 'border-line-strong bg-surface text-ink hover:border-ink/40',
            )}
          >
            <input
              type="radio"
              name="origen-franq"
              value={o}
              checked={origen === o}
              onChange={() => alCambiar(o)}
              className="sr-only"
            />
            {nombreOrigen(o, rappi)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
