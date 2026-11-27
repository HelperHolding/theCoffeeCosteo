import { sucursalesAccesibles } from './acceso';
import { sucursalesConfiguradas, type ConfigSucursal } from './config';

/**
 * Alcance de un tablero (docs/sucursales/19): el de México suma las sucursales del usuario (perfil_sucursales); el de
 * una ciudad suma TODAS las de esa ciudad para cualquier usuario con el módulo Sucursales (decisión de Carlos,
 * 2026-11-27). La lista sale de la config y la base vuelve a exigir el módulo (migración 99, sucursales_ciudad_*): aquí
 * no se abre nada que la base no permita.
 */
export const CIUDADES_TABLERO = { guadalajara: 'Guadalajara' } as const;
export type ClaveCiudad = keyof typeof CIUDADES_TABLERO;
/** Lo que una vista de tablero necesita de su ciudad. */
export interface CiudadTablero {
  clave: ClaveCiudad;
  nombre: string;
}
export const esCiudadTablero = (x: string): x is ClaveCiudad => Object.hasOwn(CIUDADES_TABLERO, x);

/** Sucursales configuradas de la ciudad (ciudad de la config, la misma que agrupa el Directorio). */
export const sucursalesDeCiudad = (clave: ClaveCiudad): ConfigSucursal[] =>
  sucursalesConfiguradas.filter((s) => s.ciudad === CIUDADES_TABLERO[clave]);

export type Alcance =
  | { tipo: 'pais'; sucursales: ConfigSucursal[] }
  | { tipo: 'ciudad'; clave: ClaveCiudad; nombre: string; sucursales: ConfigSucursal[] };

/** `?ciudad=` de la consulta: sin él, las sucursales del usuario; con una ciudad desconocida, error 404. */
export function alcanceDe(
  q: URLSearchParams,
  companias: number[],
): Alcance | { error: string; status: number } {
  const c = q.get('ciudad');
  if (c === null) return { tipo: 'pais', sucursales: sucursalesAccesibles(companias) };
  if (!esCiudadTablero(c)) return { error: 'Tablero no disponible.', status: 404 };
  return { tipo: 'ciudad', clave: c, nombre: CIUDADES_TABLERO[c], sucursales: sucursalesDeCiudad(c) };
}

/** RPC agregadas y su versión de ciudad (misma base en SQL; la de ciudad recibe además p_ciudad). */
const EN_CIUDAD = {
  sucursales_tablero_hoy: 'sucursales_ciudad_tablero_hoy',
  sucursales_tablero_periodo: 'sucursales_ciudad_tablero_periodo',
  sucursales_servicio_nacional: 'sucursales_ciudad_servicio',
  sucursales_consumo_nacional: 'sucursales_ciudad_consumo',
  sucursales_consumo_desglose: 'sucursales_ciudad_consumo_desglose',
  sucursales_menu_nacional: 'sucursales_ciudad_menu',
} as const;
export type RpcAgregada = keyof typeof EN_CIUDAD;

/** Lo único que se usa del cliente de Supabase: rpc con nombre y argumentos. */
export interface ClienteRpc {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
}

/** Llama la RPC del alcance: la de siempre para México o la de la ciudad (con p_ciudad), con la sesión del usuario. */
export function rpcDelAlcance(db: unknown, alcance: Alcance, fn: RpcAgregada, args: Record<string, unknown>) {
  const c = db as ClienteRpc;
  return alcance.tipo === 'pais'
    ? c.rpc(fn, args)
    : c.rpc(EN_CIUDAD[fn], { p_ciudad: alcance.clave, ...args });
}

/** Texto para mensajes: «tus sucursales» o «las sucursales de Guadalajara». */
export const vacioDe = (a: Alcance) =>
  a.tipo === 'pais' ? 'Sin sucursales asignadas.' : `Sin sucursales en ${a.nombre}.`;
