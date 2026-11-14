import type { Tono } from './inicio';
import type { EstadoRiesgo, FilaRiesgo } from '../../supabase/functions/_shared/planKpi.ts';

export type { EstadoRiesgo, FilaRiesgo };

/** _DOH_EST: los seis estados del riesgo de quiebre, en su orden, con el tono del portal. */
export const DOH_EST: { id: EstadoRiesgo; texto: string; tono: Tono }[] = [
  { id: 'pedir', texto: 'Pedir ya', tono: 'pierde' },
  { id: 'confirmar', texto: 'OC por confirmar', tono: 'bajo' },
  { id: 'cubierto', texto: 'Cubierto con OC', tono: 'ok' },
  { id: 'pronto', texto: 'Pronto', tono: 'bajo' },
  { id: 'ok', texto: 'OK', tono: 'ok' },
  { id: 'sinventa', texto: 'Sin venta', tono: 'neutro' },
];

/** Filtro inicial por la URL (?estado=). El viejo mandaba 'urgente' desde Inicio: es 'pedir'. */
export function estadoInicial(param: string | undefined): EstadoRiesgo | 'todos' {
  const e = param === 'urgente' ? 'pedir' : param;
  return DOH_EST.some((x) => x.id === e) ? (e as EstadoRiesgo) : 'todos';
}

/** _dohFilas (filtro): estado, categoría y texto en nombre o SKU (sin distinguir mayúsculas). */
export function filtrarDoh(
  filas: FilaRiesgo[],
  f: { estado: EstadoRiesgo | 'todos'; cat: string; q: string },
): FilaRiesgo[] {
  const lq = f.q.trim().toLowerCase();
  return filas.filter(
    (r) =>
      (f.estado === 'todos' || r.estado === f.estado) &&
      (f.cat === 'todos' || r.cat === f.cat) &&
      (!lq || r.nombre.toLowerCase().includes(lq) || r.sku.toLowerCase().includes(lq)),
  );
}

/** Resumen del riesgo para Inicio (_kpiForecastRiesgo): conteos y los primeros 7 por pedir o por confirmar. */
export interface RiesgoInicio {
  pedir: number;
  confirmar: number;
  cubierto: number;
  negativos: number;
  lista: Pick<FilaRiesgo, 'sku' | 'nombre' | 'inv' | 'cons' | 'dias' | 'estado'>[];
}
export function riesgoInicio(r: {
  pedir: number;
  confirmar: number;
  cubierto: number;
  negativos: number;
  filas: FilaRiesgo[];
}): RiesgoInicio {
  return {
    pedir: r.pedir,
    confirmar: r.confirmar,
    cubierto: r.cubierto,
    negativos: r.negativos,
    lista: r.filas
      .filter((x) => x.estado === 'pedir' || x.estado === 'confirmar')
      .slice(0, 7)
      .map(({ sku, nombre, inv, cons, dias, estado }) => ({ sku, nombre, inv, cons, dias, estado })),
  };
}
