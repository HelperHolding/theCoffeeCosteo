import type { Rol } from '../supabase/database.types';

/** Roles con acceso a Costeo. Cualquier otro (sucursales, interno, franquiciado, proveedor o uno nuevo) queda fuera. */
export const ROLES_COSTEO = ['compras', 'operaciones', 'finanzas', 'admin'] as const satisfies readonly Rol[];

/** Falla cerrado: solo los roles de ROLES_COSTEO entran a Costeo. La RLS aplica la misma regla (migraciones 24 y 44). */
export const tieneCosteo = (rol: string): boolean => (ROLES_COSTEO as readonly string[]).includes(rol);

/** Usuarios externos al grupo (franquiciatarios, gerentes y la cuenta de baristas): ven la marca The Coffee. */
export const ROLES_EXTERNOS = ['franquiciado', 'tienda'] as const satisfies readonly Rol[];
export const marcaDe = (rol: string): 'holding' | 'thecoffee' =>
  (ROLES_EXTERNOS as readonly string[]).includes(rol) ? 'thecoffee' : 'holding';
