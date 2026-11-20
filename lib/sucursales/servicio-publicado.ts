import { sumarDias } from './tiempo';
import type { RpcServicio } from './servicio';

/**
 * Hasta qué día publicó Rappi el Nivel de servicio (docs/rappi-portal/08). Rappi procesa cada día con 1 a 2 días de
 * retraso (el portal: «puede demorar hasta 48 horas»). Mientras tanto el importador ya guarda el renglón del día, pero
 * en ceros, y eso no es un dato: un día está publicado cuando alguna tienda trae pedidos, finalizados o disponibilidad.
 * Se mide sobre TODAS las sucursales del usuario, porque una sucursal sola puede tener un día sin pedidos de verdad.
 */

type Num = number | string | null | undefined;
const n = (x: Num) => (x === null || x === undefined ? 0 : Number(x));

/** Último día con dato publicado; null si ninguno. Acepta los renglones de una sucursal o las sumas por día. */
export function ultimoDiaPublicado(
  dias: { fecha: string; pedidos: Num; finalizados: Num; disponibilidad?: Num; disp_suma?: Num }[],
): string | null {
  let ultimo: string | null = null;
  for (const d of dias)
    if (n(d.pedidos) > 0 || n(d.finalizados) > 0 || n(d.disponibilidad) > 0 || n(d.disp_suma) > 0)
      if (!ultimo || d.fecha > ultimo) ultimo = d.fecha;
  return ultimo;
}

/**
 * Quita los días después de `corte` (los que Rappi aún no publica): sus ceros bajarían la disponibilidad promedio y
 * mostrarían «0 pedidos» como si fuera un dato. La conectividad no se toca: es en vivo y no depende de este retraso.
 */
export function recortarAlPublicado(rpc: RpcServicio, corte: string): RpcServicio {
  return {
    ...rpc,
    dias: rpc.dias.filter((d) => d.fecha <= corte),
    reclamos: rpc.reclamos.filter((r) => r.fecha <= corte),
  };
}

/** Lector mínimo: la RPC nacional (mismo candado sucursales_acceso), solo para saber el último día publicado. */
interface LectorRpc {
  rpc: (
    fn: 'sucursales_servicio_nacional',
    args: { p_companias: number[]; p_desde: string; p_hasta: string },
  ) => PromiseLike<{ data: unknown; error: unknown }>;
}

/**
 * Último día publicado entre las sucursales del usuario: primero la última semana y, si no hay nada, los últimos 62
 * días (el máximo de la RPC). `hoy` en hora del centro, como cuenta Rappi los días. Si la lectura falla devuelve null y
 * la pantalla se comporta como antes (sin recorte).
 */
export async function leerPublicadoHasta(
  db: LectorRpc,
  companias: number[],
  hoy: string,
): Promise<string | null> {
  if (!companias.length) return null;
  for (const atras of [6, 61]) {
    const r = await db.rpc('sucursales_servicio_nacional', {
      p_companias: companias,
      p_desde: sumarDias(hoy, -atras),
      p_hasta: hoy,
    });
    if (r.error || !r.data) return null;
    const ultimo = ultimoDiaPublicado(
      ((r.data as { por_dia?: { fecha: string; pedidos: Num; finalizados: Num; disp_suma: Num }[] })
        .por_dia ?? []) as { fecha: string; pedidos: Num; finalizados: Num; disp_suma: Num }[],
    );
    if (ultimo) return ultimo;
  }
  return null;
}
