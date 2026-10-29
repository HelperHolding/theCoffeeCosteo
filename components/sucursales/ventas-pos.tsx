'use client';
import type { SucursalInfo } from '@/lib/sucursales/contratos';
import type { FiltroOrigen } from '@/lib/sucursales/metricas';
import { Pestanas } from '@/components/portal/pestanas';
import { EnVivo } from './en-vivo';
import { Pedidos } from './pedidos';
import { Productos } from './productos';
import { Tendencias } from './tendencias';
import { Rappi } from './rappi';
import { AvisoCalidadRappi } from './estados';
import type { Periodo } from './periodo';

export const PESTANAS = [
  { id: 'vivo', nombre: 'En vivo' },
  { id: 'tendencias', nombre: 'Tendencias' },
  { id: 'productos', nombre: 'Productos' },
  { id: 'pedidos', nombre: 'Pedidos' },
  { id: 'rappi', nombre: 'Rappi' },
] as const;

/** Pestañas de Ventas de una sucursal: la de Rappi si Rappi llega por la API o se lee del portal de Rappi. */
export const pestanasDe = (s: Pick<SucursalInfo, 'rappi' | 'rappiPortal'>) =>
  PESTANAS.filter((p) => p.id !== 'rappi' || s.rappi || s.rappiPortal);

/**
 * Sección Ventas de una sucursal. El filtro de origen y el periodo son de la sucursal (los comparten Ventas, Costeo y
 * Consumo) y llegan de SeccionesSucursal. Solo se monta la pestaña activa, y cada lectura va con su clave (sucursal +
 * filtros), así que cambiar de sucursal, origen o pestaña nunca deja datos de otra combinación en pantalla.
 */
export function VentasPos({
  sucursal,
  tab,
  alCambiarTab,
  origen,
  periodo,
  alCambiarPeriodo,
}: {
  sucursal: SucursalInfo;
  tab: string;
  alCambiarTab: (id: string) => void;
  origen: FiltroOrigen;
  periodo: Periodo;
  alCambiarPeriodo: (p: Periodo) => void;
}) {
  const pestanas = pestanasDe(sucursal);
  const activa = pestanas.some((p) => p.id === tab) ? tab : 'vivo';
  const clave = `${sucursal.companyId}-${origen}`;
  const contenido = (id: string) => {
    if (id !== activa) return null;
    if (id === 'vivo') return <EnVivo key={clave} companyId={sucursal.companyId} origen={origen} />;
    if (id === 'tendencias') return <Tendencias key={clave} companyId={sucursal.companyId} origen={origen} />;
    if (id === 'productos')
      return (
        <Productos
          key={clave}
          companyId={sucursal.companyId}
          origen={origen}
          zona={sucursal.zona}
          periodo={periodo}
          alCambiarPeriodo={alCambiarPeriodo}
        />
      );
    if (id === 'rappi')
      return <Rappi sucursal={sucursal} periodo={periodo} alCambiarPeriodo={alCambiarPeriodo} />;
    return <Pedidos key={clave} companyId={sucursal.companyId} origen={origen} zona={sucursal.zona} />;
  };

  return (
    <div className="space-y-6">
      {/* Las métricas incluyen Rappi en la pestaña Rappi y con el filtro «Mostrador + App + Rappi» o «Rappi». */}
      {sucursal.rappi && (activa === 'rappi' || origen === 'todos' || origen === 'rappi') && (
        <AvisoCalidadRappi />
      )}
      <Pestanas
        inicial={activa}
        alCambiar={alCambiarTab}
        pestanas={pestanas.map((p) => ({ id: p.id, nombre: p.nombre, contenido: contenido(p.id) }))}
      />
    </div>
  );
}
