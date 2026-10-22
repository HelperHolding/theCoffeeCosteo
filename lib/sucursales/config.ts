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
  /** TEMPORAL (pedido por Carlo, 2026-10-22): audio que suena en En vivo por cada pedido nuevo. */
  sonidoVenta?: string;
}

/** Rappi llega por la API con forma de pago RAPPI (visto en Rubén Darío, 2026-10-22): se excluye de Ventas POS y se consulta en el apartado Rappi. */
const ALCANCE_RAPPI =
  'Rappi se excluye de Ventas POS: la API lo marca con forma de pago RAPPI y se consulta en el apartado Rappi.';

export const sucursalesConfiguradas: ConfigSucursal[] = [
  {
    companyId: 612,
    lookerStoreId: 477,
    nombre: 'Cd. Juárez',
    ciudad: 'Ciudad Juárez',
    moneda: 'MXN',
    zona: 'America/Ciudad_Juarez',
    modoTiempo: 'local-etiquetada-z',
    sonidoVenta: '/sonidos/venta-612.mp3', // TEMPORAL: "cuac" por cada venta
    alcance: ALCANCE_RAPPI,
  },
  {
    // Validada el 2026-10-22 con scripts/sucursales/validar-sucursal.ts (docs/sucursales/10).
    // Zona distinta a la piloto: el último pedido (13:40) solo es posible en hora local de Cancún.
    companyId: 583,
    lookerStoreId: 498,
    nombre: 'Bonampak',
    ciudad: 'Cancún',
    moneda: 'MXN',
    zona: 'America/Cancun',
    modoTiempo: 'local-etiquetada-z',
    alcance: ALCANCE_RAPPI,
  },
  {
    // Validada el 2026-10-22 (docs/sucursales/11): CRM "Darío- 455" (Zapopan). Tiene Rappi por la API.
    companyId: 532,
    lookerStoreId: 455,
    nombre: 'Rubén Darío',
    ciudad: 'Zapopan',
    moneda: 'MXN',
    zona: 'America/Mexico_City',
    modoTiempo: 'local-etiquetada-z',
    alcance: ALCANCE_RAPPI,
  },
];

export const configDe = (companyId: number) =>
  sucursalesConfiguradas.find((s) => s.companyId === companyId) ?? null;

/** Versión del contrato y de la interpretación horaria; forma parte de las claves de caché. */
export const VERSION_DATOS = 'v1';
