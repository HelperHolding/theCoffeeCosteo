import type { NivelModulo } from '../supabase/database.types';

/** Módulos del portal. Para agregar uno: una entrada aquí, su route group y su navegación. */
export type IdModulo = 'costeo' | 'crm' | 'sucursales';
/**
 * Accesos explícitos por módulo (tabla perfil_modulos). Costeo no la necesita (sale de perfiles.rol).
 * 'sucursales_costeo': ver el Costeo de sus sucursales dentro de Sucursales, sin entrar al módulo Costeo.
 */
export type Accesos = Partial<Record<'crm' | 'sucursales' | 'sucursales_costeo', NivelModulo>>;

export interface Modulo {
  id: IdModulo;
  nombre: string;
  descripcion: string;
  href: string;
  acceso: (accesos: Accesos, rol: string) => boolean;
}

export const modulos: Modulo[] = [
  {
    id: 'costeo',
    nombre: 'Costeo',
    descripcion: 'Recetas, insumos, márgenes y precios por canal.',
    href: '/costeo',
    // Cualquier perfil activo con rol de Costeo; el rol 'sucursales' (migración 24) no entra.
    acceso: (_, rol) => rol !== 'sucursales',
  },
  {
    id: 'crm',
    nombre: 'CRM Franquicias',
    descripcion: 'Pipeline de tiendas, prospectos, contactos y actividades.',
    href: '/crm',
    acceso: (a) => a.crm !== undefined,
  },
  {
    id: 'sucursales',
    nombre: 'Sucursales',
    descripcion: 'Ventas en vivo por sucursal (mostrador, app y Rappi): venta, pedidos, productos y pagos.',
    href: '/sucursales',
    // Además del módulo, cada sucursal requiere asignación explícita (perfil_sucursales).
    acceso: (a) => a.sucursales !== undefined,
  },
];

export const modulosVisibles = (accesos: Accesos, rol: string): IdModulo[] =>
  modulos.filter((m) => m.acceso(accesos, rol)).map((m) => m.id);

export const puedeEditarCrm = (accesos: Accesos) =>
  accesos.crm === 'desarrollador' || accesos.crm === 'edicion';
