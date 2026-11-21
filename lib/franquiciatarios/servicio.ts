import { sumar, type FilaDiaRpc, type Totales } from '../sucursales/servicio';
import { sumarDias } from './dia';

/**
 * Nivel de servicio de Rappi para la gerencia (F6, migración 91). Rappi publica por tienda y día con 1–2 días de
 * atraso, así que las ventanas de 7 y 30 días terminan en el último día publicado, no en hoy. Las tasas salen de las
 * MISMAS funciones que la página Nivel de servicio de Sucursales (sumar en lib/sucursales/servicio.ts).
 */
export interface RpcServicioFranq {
  tiendas: number;
  actualizado_hasta: string | null;
  dias: FilaDiaRpc[];
}
export interface ServicioFranq {
  tiendas: number;
  actualizadoHasta: string | null;
  semana: Totales & { desde: string };
  mes: Totales & { desde: string };
  /** Un renglón por día del último mes publicado (tiendas sumadas), del más reciente al más viejo. */
  porDia: (Totales & { fecha: string })[];
}

/** Días que se leen: 30 hasta el último publicado (y un margen por el atraso de Rappi). */
export const DIAS_SERVICIO = 30;

export function armarServicio(r: RpcServicioFranq): ServicioFranq {
  const hasta = r.actualizado_hasta;
  const enVentana = (dias: number) => {
    const desde = hasta ? sumarDias(hasta, -(dias - 1)) : '';
    return {
      desde,
      ...sumar(hasta ? r.dias.filter((d) => d.fecha >= desde && d.fecha <= hasta) : []),
    };
  };
  const fechas = [...new Set(r.dias.map((d) => d.fecha))].sort().reverse();
  return {
    tiendas: r.tiendas,
    actualizadoHasta: hasta,
    semana: enVentana(7),
    mes: enVentana(DIAS_SERVICIO),
    porDia: fechas.map((fecha) => ({ fecha, ...sumar(r.dias.filter((d) => d.fecha === fecha)) })),
  };
}
