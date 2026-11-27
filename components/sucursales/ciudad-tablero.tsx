'use client';
import { createContext, useContext, type ReactNode } from 'react';
import type { CiudadTablero } from '@/lib/sucursales/alcance';

/**
 * Ciudad del tablero (docs/sucursales/19): las vistas del Tablero de México (Consumo, Nivel de servicio, Menú) la leen
 * para pedir a su API las sucursales de esa ciudad (`?ciudad=`). Sin proveedor, es el Tablero de México de siempre.
 */
const Ciudad = createContext<CiudadTablero | null>(null);

export function ProveedorCiudad({ ciudad, children }: { ciudad: CiudadTablero | null; children: ReactNode }) {
  return <Ciudad.Provider value={ciudad}>{children}</Ciudad.Provider>;
}

export const useCiudadTablero = () => useContext(Ciudad);

/** La URL de una API nacional con la ciudad del tablero, si la hay. */
export const conCiudad = (url: string, ciudad: CiudadTablero | null) =>
  ciudad ? `${url}${url.includes('?') ? '&' : '?'}ciudad=${ciudad.clave}` : url;
