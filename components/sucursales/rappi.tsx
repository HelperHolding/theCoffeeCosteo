'use client';
import { useState } from 'react';
import { COLOR_ORIGEN } from './colores';
import { EnVivo } from './en-vivo';
import { Tendencias } from './tendencias';

const VISTAS = [
  { id: 'hoy', nombre: 'Hoy en vivo' },
  { id: 'semanas', nombre: 'Semanas' },
] as const;

/**
 * Apartado Rappi de una sucursal: mismas lecturas, fórmulas y diseño que Ventas POS, pero SOLO pedidos
 * con forma de pago RAPPI (que también se suman en el resto de pestañas). Sirve igual para todas las sucursales: si una
 * tienda no tiene Rappi, los periodos aparecen vacíos (cero real con lectura completa).
 */
export function Rappi({ companyId }: { companyId: number }) {
  const [vista, setVista] = useState<(typeof VISTAS)[number]['id']>('hoy');
  return (
    <div className="space-y-6">
      <div className="placa flex flex-wrap items-center justify-between gap-3 px-3 py-2">
        <p className="flex items-center gap-2 text-xs text-ink-2">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full"
            style={{ backgroundColor: COLOR_ORIGEN.rappi }}
          />
          <span>
            <strong className="font-semibold">Solo pedidos de Rappi</strong> (forma de pago RAPPI en la API),
            con precio Rappi. También se suman en las demás pestañas con el filtro "Mostrador + App + Rappi".
          </span>
        </p>
        <div
          className="flex rounded-[10px] border border-line-strong bg-paper p-0.5"
          role="group"
          aria-label="Vista de Rappi"
        >
          {VISTAS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={vista === v.id}
              onClick={() => setVista(v.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${vista === v.id ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink'}`}
            >
              {v.nombre}
            </button>
          ))}
        </div>
      </div>
      {vista === 'hoy' ? (
        <EnVivo key={`${companyId}-rappi-hoy`} companyId={companyId} origen="rappi" />
      ) : (
        <Tendencias key={`${companyId}-rappi-semanas`} companyId={companyId} origen="rappi" />
      )}
    </div>
  );
}
