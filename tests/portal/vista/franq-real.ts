// Datos REALES de una sucursal para grabar los videos del módulo (?franquiciatarios&grabar). Los deja
// scripts/franquiciatarios/datos-video.ts en ./datos-reales/ (excluido de git). Sin esa carpeta, el arnés sigue
// con sus datos sintéticos.
import type { FilaPedidoLegado } from '../../../lib/franquiciatarios/pedidos';
import type { PylMes } from '../../../lib/franquiciatarios/pyl-servidor';
import type { RpcFicha } from '../../../lib/franquiciatarios/recetas';
import type { RpcServicioFranq } from '../../../lib/franquiciatarios/servicio';
import type { EquivalenciaSku } from '../../../lib/franquiciatarios/existencias';
import type { FranqInsumo } from '../../../lib/franquiciatarios/tipos';
import type { RpcRappiPortal } from '../../../lib/sucursales/rappi-portal';
import type { PedidoApi } from '../sucursales-fixtures';

const archivos = import.meta.glob('./datos-reales/*.json', { eager: true, import: 'default' });
const leer = <T>(n: string) => archivos[`./datos-reales/${n}.json`] as T | undefined;

export interface DatosReales {
  meta: { company: number; nombre: string; hoy: string; desde: string; hasta: string; generado: string };
  pos: Record<string, PedidoApi[]>;
  rappi: RpcRappiPortal;
  servicio: RpcServicioFranq;
  ficha: RpcFicha;
  insumos: {
    insumos: FranqInsumo[];
    equivalencias: EquivalenciaSku[];
    presentaciones: Record<string, number>;
    costos?: Record<string, number | null>;
  };
  pedidos: FilaPedidoLegado[];
  pyl: PylMes;
  consumo: { aviso: string | null; dias: Record<string, Record<string, number>> | null };
  sucursales: { companyId: number; nombre: string; ciudad: string; ubicacion: string | null }[];
}

const meta = leer<DatosReales['meta']>('meta');
export const REAL: DatosReales | null = meta
  ? {
      meta,
      pos: leer('pos')!,
      rappi: leer('rappi')!,
      servicio: leer('servicio')!,
      ficha: leer('ficha')!,
      insumos: leer('insumos')!,
      pedidos: leer('pedidos')!,
      pyl: leer('pyl')!,
      consumo: leer('consumo')!,
      sucursales: leer('sucursales')!,
    }
  : null;

const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
/** Grabando un video con datos reales: estado en sessionStorage, navegación dentro del arnés y reloj fijo. */
export const GRABAR = params.has('franquiciatarios') && params.has('grabar') && REAL !== null;

/** Rappi del portal recortado a [desde, hasta]. */
export function rappiEntre(desde: string, hasta: string): RpcRappiPortal {
  const r = REAL!.rappi;
  return {
    ...r,
    conteos: r.conteos.filter((c) => c.fecha >= desde && c.fecha <= hasta),
    pedidos: r.pedidos.filter((p) => p.fecha >= desde && p.fecha <= hasta),
  };
}
