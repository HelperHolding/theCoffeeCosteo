import type { ModoTiempo } from './tiempo';

/**
 * Sucursales operables en el portal. Solo las declaradas aquí se ofrecen como operativas:
 * además del permiso del usuario, cada una necesita moneda, zona horaria e interpretación de
 * `createdAt` revisadas. Agregar una sucursal es una decisión explícita, no una inferencia.
 */
export interface ConfigSucursal {
  /** company_id de la API The Coffee (identidad verificada contra /company/list/all). */
  companyId: number;
  /** lookerStoreId esperado (= número de tienda Jestor del CRM); se verifica contra la API. */
  lookerStoreId: number;
  nombre: string;
  ciudad: string;
  /** La API no informa moneda: se configura por sucursal. */
  moneda: 'MXN';
  /** Zona IANA de la tienda, para "hoy" y "ahora". */
  zona: string;
  /** Cómo interpretar `createdAt`. Ver docs/sucursales/03 (pendiente de confirmar con el proveedor). */
  modoTiempo: ModoTiempo;
  /** Texto del alcance de canales para esta sucursal. */
  alcance: string;
}

export const sucursalesConfiguradas: ConfigSucursal[] = [
  {
    companyId: 612,
    lookerStoreId: 477,
    nombre: 'Cd. Juárez',
    ciudad: 'Ciudad Juárez',
    moneda: 'MXN',
    zona: 'America/Ciudad_Juarez',
    modoTiempo: 'local-etiquetada-z',
    alcance:
      'Rappi fuera del alcance: la API no identifica agregadores y el CRM registra esta tienda sin Rappi.',
  },
];

export const configDe = (companyId: number) =>
  sucursalesConfiguradas.find((s) => s.companyId === companyId) ?? null;

/** Versión del contrato y de la interpretación horaria; forma parte de las claves de caché. */
export const VERSION_DATOS = 'v1';
