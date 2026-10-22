import type { NivelModulo } from '../supabase/database.types';

/** Módulos del portal. Para agregar uno: una entrada aquí, su route group y su navegación. */
export type IdModulo = 'costeo' | 'crm' | 'sucursales';
/** Accesos explícitos por módulo (tabla perfil_modulos). Costeo no la necesita. */
export type Accesos = Partial<Record<'crm' | 'sucursales', NivelModulo>>;

export interface Modulo {
  id: IdModulo;
  nombre: string;
  descripcion: string;
  href: string;
  acceso: (accesos: Accesos) => boolean;
}

export const modulos: Modulo[] = [
  {
    id: 'costeo',
    nombre: 'Costeo',
    descripcion: 'Recetas, insumos, márgenes y precios por canal.',
    href: '/costeo',
    // Cualquier perfil activo entra, como hasta ahora; sus permisos siguen saliendo de perfiles.rol.
    acceso: () => true,
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
    descripcion: 'Ventas POS en vivo por sucursal: venta, pedidos, productos y pagos.',
    href: '/sucursales',
    // Además del módulo, cada sucursal requiere asignación explícita (perfil_sucursales).
    acceso: (a) => a.sucursales !== undefined,
  },
];

export const modulosVisibles = (accesos: Accesos): IdModulo[] =>
  modulos.filter((m) => m.acceso(accesos)).map((m) => m.id);

export const puedeEditarCrm = (accesos: Accesos) =>
  accesos.crm === 'desarrollador' || accesos.crm === 'edicion';
