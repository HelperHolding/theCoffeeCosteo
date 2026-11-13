import type { NivelModulo } from '../supabase/database.types';
import { tieneCosteo } from './roles';

/** Módulos del portal. Para agregar uno: una entrada aquí, su route group y su navegación. */
export type IdModulo = 'costeo' | 'crm' | 'sucursales' | 'bi' | 'comercializadora';
/**
 * Accesos explícitos por módulo (tabla perfil_modulos). Costeo no la necesita (sale de perfiles.rol).
 * 'sucursales_costeo': ver el Costeo de sus sucursales dentro de Sucursales, sin entrar al módulo Costeo.
 */
export type Accesos = Partial<
  Record<'crm' | 'sucursales' | 'sucursales_costeo' | 'bi' | 'comercializadora', NivelModulo>
>;

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
    // Solo roles de Costeo (falla cerrado): sucursales, interno, franquiciado y proveedor no entran.
    acceso: (_, rol) => tieneCosteo(rol),
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
  {
    id: 'bi',
    nombre: 'BI',
    descripcion: 'Tableros de la red (los de Zoho Analytics): ventas, mezcla, pagos, productos y tendencias.',
    href: '/bi',
    // Además del módulo, cada sucursal requiere asignación explícita (perfil_sucursales); lo exige bi_acceso.
    acceso: (a) => a.bi !== undefined,
  },
  {
    id: 'comercializadora',
    nombre: 'Comercializadora',
    descripcion: 'Qué pedir, órdenes de compra, mínimos, proveedores sin stock y pagos.',
    href: '/comercializadora',
    acceso: (a) => a.comercializadora !== undefined,
  },
];

export const modulosVisibles = (accesos: Accesos, rol: string): IdModulo[] =>
  modulos.filter((m) => m.acceso(accesos, rol)).map((m) => m.id);

export const puedeEditarCrm = (accesos: Accesos) =>
  accesos.crm === 'desarrollador' || accesos.crm === 'edicion';

export const puedeEditarCom = (accesos: Accesos) =>
  accesos.comercializadora === 'desarrollador' || accesos.comercializadora === 'edicion';
