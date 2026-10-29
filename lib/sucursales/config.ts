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
  /** Ciudad (zona metropolitana) para agrupar el Directorio. */
  ciudad: string;
  /** Municipio y colonia, como apoyo para reconocer la tienda (del CRM). */
  ubicacion?: string;
  /** La API no informa moneda: se configura por sucursal. */
  moneda: 'MXN';
  /** Zona IANA de la tienda, para "hoy" y "ahora". */
  zona: string;
  /** Cómo interpretar `createdAt`. Ver docs/sucursales/03 (pendiente de confirmar con el proveedor). */
  modoTiempo: ModoTiempo;
  /** ¿Rappi llega por la API (forma de pago RAPPI)? Hoy solo 532. Sin Rappi no hay pestaña ni filtro de Rappi. */
  rappi: boolean;
  /**
   * Rappi leído del portal de Partners por el cron de n8n (docs/rappi-portal): pestaña Rappi con sus pedidos y desglose.
   * No se suma a las ventas del POS. Las tiendas de Rappi de la sucursal viven en la tabla rappi_tiendas.
   */
  rappiPortal?: boolean;
  /** Texto del alcance de canales para esta sucursal. */
  alcance: string;
  /** TEMPORAL (pedido por Carlo, 2026-10-22): audio que suena en En vivo por cada pedido nuevo. */
  sonidoVenta?: string;
}

/** Rappi llega por la API con forma de pago RAPPI (convenio): se suma a las ventas y se filtra arriba. */
const ALCANCE_RAPPI =
  'Incluye Rappi (forma de pago RAPPI en la API). Usa el filtro de origen para ver Mostrador, App o Rappi por separado.';

/** Sin Rappi en la API: solo lo que cobra el POS. No se estima lo que falta. */
const ALCANCE_POS =
  'Ventas del POS: Mostrador y App. Rappi de esta sucursal no llega por la API, así que no se incluye ni se estima.';

/** Rappi no llega por la API, pero se lee del portal de Rappi y se ve aparte, en la pestaña Rappi. */
const ALCANCE_POS_RAPPI_PORTAL =
  'Ventas del POS: Mostrador y App. Rappi de esta sucursal no llega por la API: sus pedidos se leen del portal de Rappi y se ven aparte, en la pestaña Rappi.';

/**
 * Guadalajara (docs/sucursales/13 §F1), validadas el 2026-10-28 con scripts/sucursales/validar-sucursal.ts: nombre e
 * id de la API = tienda del CRM (lookerStoreId = número Jestor), día 27 conciliado (venta = suma por productos, a lo
 * más 1 ¢ de redondeo) y hora local de Guadalajara (último pedido de hoy ≤ hora actual).
 */
const gdl = (
  companyId: number,
  lookerStoreId: number,
  nombre: string,
  ubicacion: string,
): ConfigSucursal => ({
  companyId,
  lookerStoreId,
  nombre,
  ciudad: 'Guadalajara',
  ubicacion,
  moneda: 'MXN',
  zona: 'America/Mexico_City',
  modoTiempo: 'local-etiquetada-z',
  rappi: false,
  alcance: ALCANCE_POS,
});

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
    rappi: true,
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
    rappi: true,
    alcance: ALCANCE_RAPPI,
  },
  {
    // Validada el 2026-10-22 (docs/sucursales/11): CRM "Darío- 455" (Zapopan). Tiene Rappi por la API.
    companyId: 532,
    lookerStoreId: 455,
    nombre: 'Rubén Darío',
    ciudad: 'Guadalajara',
    ubicacion: 'Providencia',
    moneda: 'MXN',
    zona: 'America/Mexico_City',
    modoTiempo: 'local-etiquetada-z',
    rappi: true,
    alcance: ALCANCE_RAPPI,
  },
  gdl(384, 301, 'Ventura', 'Zapopan · Puerta del Valle'),
  gdl(457, 355, 'Aleden', 'Zapopan · Av. Universidad'),
  gdl(459, 351, 'Legacy', 'Zapopan · Puerta de Hierro'),
  // API «The Coffee Ciudad Granja»; CRM «Granja- 382», Calz. Central 270-K01.
  gdl(477, 382, 'Granja', 'Zapopan · Granja'),
  gdl(515, 408, 'Chapu 67', 'Ladrón de Guevara'),
  // El encargo da «C. Mar Caspio 2024»; el CRM, Av. Jorge Álvarez del Castillo 1433. Ambas en Country Club; nombre y
  // Jestor 397 coinciden en API y CRM (docs/sucursales/13).
  gdl(514, 397, 'Essentia', 'Country Club'),
  // API «The Coffee Calle Otawa» (sic).
  gdl(518, 428, 'Calle Ottawa', 'Providencia'),
  // Piloto de Rappi desde el portal de Partners (docs/rappi-portal): tienda normal MX1930270777 y Turbo MX1930301156.
  { ...gdl(513, 394, 'Namóra', 'Chapultepec Sur'), rappiPortal: true, alcance: ALCANCE_POS_RAPPI_PORTAL },
  gdl(567, 475, 'Gran Plaza', 'Zapopan · Don Bosco Vallarta'),
  gdl(631, 542, 'Forum Tlaquepaque', 'Prados del Nilo'),
];

export const configDe = (companyId: number) =>
  sucursalesConfiguradas.find((s) => s.companyId === companyId) ?? null;

/** Versión del contrato y de la interpretación horaria; forma parte de las claves de caché. */
export const VERSION_DATOS = 'v1';
