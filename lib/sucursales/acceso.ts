import { configDe, type ConfigSucursal } from './config';

/**
 * Resuelve la sucursal de una URL: entero positivo, asignada al usuario Y configurada como operable.
 * Cualquier otro caso devuelve null y la ruta responde 404 genérico, sin consultar caché ni proveedor
 * y sin revelar si la sucursal existe.
 */
export function resolverSucursal(raw: string, companias: number[]): ConfigSucursal | null {
  if (!/^[1-9]\d{0,8}$/.test(raw)) return null;
  const id = Number(raw);
  return companias.includes(id) ? configDe(id) : null;
}

/** Sucursales que el usuario puede abrir: asignadas y configuradas. */
export const sucursalesAccesibles = (companias: number[]) =>
  companias.map(configDe).filter((c): c is ConfigSucursal => c !== null);
