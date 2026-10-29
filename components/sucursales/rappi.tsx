'use client';
import { useState } from 'react';
import type { SucursalInfo } from '@/lib/sucursales/contratos';
import { COLOR_ORIGEN } from './colores';
import { EnVivo } from './en-vivo';
import { Tendencias } from './tendencias';
import { RappiPortal } from './rappi-portal';
import type { Periodo } from './periodo';

const VISTAS = [
  { id: 'hoy', nombre: 'Hoy en vivo', api: true },
  { id: 'semanas', nombre: 'Semanas', api: true },
  { id: 'portal', nombre: 'Portal de Rappi', api: false },
] as const;
type IdVista = (typeof VISTAS)[number]['id'];

/**
 * Apartado Rappi de una sucursal.
 * - Con Rappi en la API del POS (forma de pago RAPPI): «Hoy en vivo» y «Semanas», con las mismas lecturas, fórmulas
 *   y diseño que Ventas POS. Esos pedidos también se suman en el resto de pestañas.
 * - Con Rappi leído del portal de Partners (docs/rappi-portal): «Portal de Rappi», con pedidos de la tienda normal y la
 *   Turbo y el desglose de cada producto. No se suma a las ventas del POS.
 */
export function Rappi({
  sucursal,
  periodo,
  alCambiarPeriodo,
}: {
  sucursal: SucursalInfo;
  periodo: Periodo;
  alCambiarPeriodo: (p: Periodo) => void;
}) {
  const vistas = VISTAS.filter((v) => (v.api ? sucursal.rappi : sucursal.rappiPortal));
  const [vista, setVista] = useState<IdVista>(vistas[0]?.id ?? 'hoy');
  const companyId = sucursal.companyId;
  return (
    <div className="space-y-6">
      <div className="placa flex flex-wrap items-center justify-between gap-3 px-3 py-2">
        <p className="flex items-center gap-2 text-xs text-ink-2">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full"
            style={{ backgroundColor: COLOR_ORIGEN.rappi }}
          />
          {vista === 'portal' ? (
            <span>
              <strong className="font-semibold">Pedidos del portal de Rappi</strong> (tienda normal y Turbo),
              con precio Rappi y el desglose de cada producto.
            </span>
          ) : (
            <span>
              <strong className="font-semibold">Solo pedidos de Rappi</strong> (
              {sucursal.rappiPortal
                ? 'leídos del portal de Rappi cada 10 minutos'
                : 'forma de pago RAPPI en la API'}
              ), con precio Rappi. También se suman en las demás pestañas con el filtro "Mostrador + App +
              Rappi".
            </span>
          )}
        </p>
        {vistas.length > 1 && (
          <div
            className="flex rounded-[10px] border border-line-strong bg-paper p-0.5"
            role="group"
            aria-label="Vista de Rappi"
          >
            {vistas.map((v) => (
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
        )}
      </div>
      {vista === 'portal' ? (
        <RappiPortal
          key={`${companyId}-rappi-portal`}
          companyId={companyId}
          zona={sucursal.zona}
          moneda={sucursal.moneda}
          periodo={periodo}
          alCambiarPeriodo={alCambiarPeriodo}
        />
      ) : vista === 'hoy' ? (
        <EnVivo key={`${companyId}-rappi-hoy`} companyId={companyId} origen="rappi" />
      ) : (
        <Tendencias key={`${companyId}-rappi-semanas`} companyId={companyId} origen="rappi" />
      )}
    </div>
  );
}
