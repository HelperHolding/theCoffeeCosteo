import type { Rol } from '../supabase/database.types';

/** Roles con acceso a Costeo. Cualquier otro (sucursales, interno, franquiciado, proveedor o uno nuevo) queda fuera. */
export const ROLES_COSTEO = ['compras', 'operaciones', 'finanzas', 'admin'] as const satisfies readonly Rol[];

/** Falla cerrado: solo los roles de ROLES_COSTEO entran a Costeo. La RLS aplica la misma regla (migraciones 24 y 44). */
export const tieneCosteo = (rol: string): boolean => (ROLES_COSTEO as readonly string[]).includes(rol);
