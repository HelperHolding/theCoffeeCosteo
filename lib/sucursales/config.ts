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
  /**
   * ¿Rappi por la API del POS (forma de pago RAPPI)? Desde el 2026-11-15 ninguna: ese Rappi no cuenta (conRappi) y el
   * Rappi viene solo del portal (rappiPortal). Sin Rappi no hay pestaña ni filtro de Rappi.
   */
  rappi: boolean;
  /**
   * Rappi leído del portal de Partners por el cron de n8n (docs/rappi-portal): se suma a Ventas, Costeo y Consumo con
   * las mismas reglas que el POS (lib/sucursales/rappi-pos.ts). Sus tiendas de Rappi viven en la tabla rappi_tiendas.
   */
  rappiPortal?: boolean;
  /** Texto del alcance de canales para esta sucursal. */
  alcance: string;
  /** TEMPORAL (pedido por Carlo, 2026-10-22): audio que suena en En vivo por cada pedido nuevo. */
  sonidoVenta?: string;
}

/** Rappi no llega por la API del POS: se lee del portal de Rappi (docs/rappi-portal) y se suma a las ventas. */
const ALCANCE_POS_RAPPI_PORTAL =
  'Incluye Rappi, leído del portal de Rappi (tienda normal y Turbo) cada 10 minutos. Usa el filtro de origen para ver Mostrador, App o Rappi por separado.';

/** Sin Rappi en la API y todavía sin sus tiendas del portal: solo lo que cobra el POS. No se estima lo que falta. */
const ALCANCE_POS =
  'Ventas del POS: Mostrador y App. El Rappi de esta sucursal todavía no se lee del portal de Rappi, así que no se incluye ni se estima.';

/**
 * Sucursales que se dan de alta por lotes de 10 (docs/sucursales/15). En cada una, antes de entrar:
 * - nombre e id de la API = tienda del CRM (lookerStoreId = número Jestor);
 * - un día cerrado conciliado (venta = suma por productos, a lo más 2 ¢ de redondeo del proveedor);
 * - horario de sus pedidos posible en su zona (scripts/sucursales/validar-sucursal.ts).
 * Entran solo con el POS; su Rappi del portal se prende por lote (rappiPortal) cuando sus tiendas y su historial estén
 * cargados.
 */
const delPos =
  (ciudad: string, zona = 'America/Mexico_City') =>
  (companyId: number, lookerStoreId: number, nombre: string, ubicacion: string): ConfigSucursal => ({
    companyId,
    lookerStoreId,
    nombre,
    ciudad,
    ubicacion,
    moneda: 'MXN',
    zona,
    modoTiempo: 'local-etiquetada-z',
    rappi: false,
    alcance: ALCANCE_POS,
  });
const cdmx = delPos('Ciudad de México');
/** Zona metropolitana de Toluca (Toluca y Metepec). */
const toluca = delPos('Toluca');
const queretaro = delPos('Querétaro');
const aguascalientes = delPos('Aguascalientes');
const sanLuis = delPos('San Luis Potosí');
const colima = delPos('Colima');
const vallarta = delPos('Puerto Vallarta');
/** Zona metropolitana de Veracruz: Veracruz y Boca del Río. */
const veracruz = delPos('Veracruz');
const cancun = delPos('Cancún', 'America/Cancun');
const merida = delPos('Mérida', 'America/Merida');
const durango = delPos('Durango', 'America/Monterrey');
const leon = delPos('León');
/** Rappi del portal prendido en una sucursal del lote, con sus tiendas en rappi_tiendas y su historial cargados. */
const conPortal = (c: ConfigSucursal): ConfigSucursal => ({
  ...c,
  rappiPortal: true,
  alcance: ALCANCE_POS_RAPPI_PORTAL,
});

/**
 * Guadalajara (docs/sucursales/13 §F1), validadas el 2026-10-28 con scripts/sucursales/validar-sucursal.ts: nombre e
 * id de la API = tienda del CRM (lookerStoreId = número Jestor), día 27 conciliado (venta = suma por productos, a lo
 * más 1 ¢ de redondeo) y hora local de Guadalajara (último pedido de hoy ≤ hora actual).
 * Rappi no llega por la API del POS: se lee del portal de Partners (docs/rappi-portal; tiendas en el doc 07). Piloto
 * Namóra el 2026-10-29; las demás desde el 2026-11-02, con sus tiendas comprobadas en el filtro del portal.
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
  rappiPortal: true,
  alcance: ALCANCE_POS_RAPPI_PORTAL,
});

export const sucursalesConfiguradas: ConfigSucursal[] = [
  {
    companyId: 612,
    lookerStoreId: 477,
    nombre: 'Cd. Juárez',
    ciudad: 'Ciudad Juárez',
    moneda: 'MXN',
    // UTC−6 fijo: el POS no cambió de horario el 1 de noviembre de 2026 (EE. UU. sí). Desde ese día los pedidos llegan
    // una hora adelante de la hora local (3-nov: último pedido 17:25 a las 17:05 locales; apertura 8:35 en lugar de
    // 7:40). En verano UTC−6 es la hora local; en invierno el día del portal es el de los tickets (docs/sucursales/15).
    zona: 'Etc/GMT+6',
    modoTiempo: 'local-etiquetada-z',
    sonidoVenta: '/sonidos/venta-612.mp3', // TEMPORAL: "cuac" por cada venta
    // Rappi solo del portal desde el 2026-11-15 (Carlo): el de la API del POS ya no cuenta (conRappi).
    rappi: false,
    rappiPortal: true,
    alcance: ALCANCE_POS_RAPPI_PORTAL,
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
    // Rappi solo del portal desde el 2026-11-15 (Carlo): tienda normal y Turbo; el de la API del POS ya no cuenta.
    rappi: false,
    rappiPortal: true,
    alcance: ALCANCE_POS_RAPPI_PORTAL,
  },
  {
    // Validada el 2026-10-22 (docs/sucursales/11): CRM "Darío- 455" (Zapopan). Su POS cobra Rappi (forma de pago RAPPI)
    // como «Generic»; desde el 2026-11-15 ese Rappi del POS no cuenta y solo se suma el del portal (conRappi).
    companyId: 532,
    lookerStoreId: 455,
    nombre: 'Rubén Darío',
    ciudad: 'Guadalajara',
    ubicacion: 'Providencia',
    moneda: 'MXN',
    zona: 'America/Mexico_City',
    modoTiempo: 'local-etiquetada-z',
    rappi: false,
    rappiPortal: true,
    alcance: ALCANCE_POS_RAPPI_PORTAL,
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
  gdl(513, 394, 'Namóra', 'Chapultepec Sur'),
  gdl(567, 475, 'Gran Plaza', 'Zapopan · Don Bosco Vallarta'),
  gdl(631, 542, 'Forum Tlaquepaque', 'Prados del Nilo'),
  // Lote 1, Ciudad de México: validadas con el 2 de noviembre (Polanco y Patio Universidad con 2 y 1 ¢ de redondeo).
  // Ubicación tomada de la dirección del CRM.
  conPortal(cdmx(519, 411, 'La Mexicana', 'Cuajimalpa · Santa Fe')),
  conPortal(cdmx(546, 453, 'Plaza Carso', 'Miguel Hidalgo · Ampliación Granada')),
  conPortal(cdmx(545, 432, 'Polanco', 'Av. Horacio')),
  // Roma Sur: sin tiendas en la cuenta del portal de Rappi (2026-11-03), queda solo con el POS.
  cdmx(469, 363, 'Roma Sur', 'Cuauhtémoc · Roma Sur'),
  conPortal(cdmx(670, 556, 'Reforma', 'Miguel Hidalgo · Lomas de Chapultepec')),
  conPortal(cdmx(460, 354, 'Pasaje Parián', 'Av. Álvaro Obregón')),
  conPortal(cdmx(626, 540, 'Patio Universidad', 'Benito Juárez · Xoco')),
  conPortal(cdmx(607, 472, 'Santa Fe', 'Vasco de Quiroga')),
  conPortal(cdmx(507, 402, 'Hamburgo', 'Cuauhtémoc · Juárez')),
  conPortal(cdmx(625, 539, 'Plaza Samara', 'Álvaro Obregón · Santa Fe')),
  // Lote 2, Ciudad de México y Toluca: validadas con el 2 de noviembre (Tecnológico con 1 ¢ de redondeo). Interlomas y
  // Satélite van en la zona metropolitana de la Ciudad de México. Tecnológico (Metepec) y Patio Toluca van en Toluca,
  // aunque el CRM las ponga en «Ciudad de México». Puerta Polanco cierra a distinta hora según el día (16, 17 o 20 h).
  conPortal(cdmx(642, 555, 'Puerta Polanco', 'Miguel Hidalgo · Polanco')),
  conPortal(cdmx(608, 473, 'Interlomas', 'Interlomas')),
  conPortal(cdmx(606, 478, 'Satélite', 'Ciudad Satélite')),
  conPortal(cdmx(506, 387, 'Portales Norte', 'Benito Juárez · Portales Norte')),
  conPortal(cdmx(550, 424, 'Río Nazas', 'Cuauhtémoc')),
  conPortal(cdmx(611, 490, 'Insurgentes', 'Benito Juárez · Del Valle')),
  conPortal(cdmx(549, 404, 'La del Valle', 'Benito Juárez · Del Valle')),
  conPortal(cdmx(643, 554, 'Patio Santa Fe', 'Álvaro Obregón · Santa Fe')),
  conPortal(toluca(610, 476, 'Tecnológico', 'Metepec · Plaza Tecnológico')),
  conPortal(toluca(646, 560, 'Patio Toluca', 'Toluca · Vértice')),
  // Lote 3, centro y Bajío: validadas con el 2 de noviembre (Los Arcos con 1 ¢ de redondeo).
  conPortal(toluca(520, 420, 'Galerías Metepec', 'Metepec · Galerías')),
  conPortal(toluca(743, 618, 'Townsquare', 'Metepec · La Providencia')),
  conPortal(delPos('Valle de Bravo')(463, 347, 'Avándaro', 'Avándaro')),
  conPortal(delPos('Pachuca')(616, 529, 'Colosio Pachuca', 'Punta Azul')),
  conPortal(delPos('Puebla')(761, 617, 'Centro Histórico Puebla', 'Centro Histórico')),
  conPortal(queretaro(509, 401, 'Los Arcos', 'Jardines de Querétaro')),
  conPortal(queretaro(734, 650, 'UpTown Juriquilla', 'Juriquilla')),
  conPortal(delPos('San Miguel de Allende')(466, 379, 'Canal 16', 'Centro')),
  conPortal(leon(614, 527, 'Torre Visu', 'Lomas del Campestre')),
  conPortal(delPos('Silao')(615, 525, 'Paseo MS', 'El Progreso')),
  // Lote 4, centro-norte y occidente: validadas con el 2 de noviembre (Centro con 1 ¢ de redondeo).
  conPortal(aguascalientes(551, 433, 'Colosio Aguascalientes', 'Blvd. Colosio')),
  conPortal(aguascalientes(674, 587, 'Garza Sada', 'Av. Garza Sada')),
  conPortal(delPos('Zacatecas')(593, 474, 'Zacatecas', 'Centro')),
  conPortal(sanLuis(718, 574, 'Trendy San Luis', 'Lomas del Tecnológico')),
  conPortal(sanLuis(763, 619, 'Covalia', 'Covalia')),
  // Tepatitlán: sin tienda en la cuenta del portal de Rappi (2026-11-15), queda solo con el POS.
  delPos('Tepatitlán')(508, 399, 'Tepatitlán', 'La Gloria'),
  conPortal(colima(721, 638, 'Constitución', 'Jardines Vista Hermosa')),
  conPortal(colima(553, 468, 'Colima', 'Av. Venustiano Carranza')),
  conPortal(vallarta(582, 505, 'Centro Puerto Vallarta', 'Centro')),
  conPortal(vallarta(478, 373, 'Versalles', 'Versalles')),
  // Lote 5, golfo, sur y norte: validadas con el 2 de noviembre (Ávila Camacho y Andamar con 1 ¢ de redondeo).
  // Andamar está en Boca del Río aunque el CRM diga «Córdoba». Aeropuerto Chiapas abre a las 4 h (aeropuerto).
  // Fluvial: sin tienda en la cuenta del portal de Rappi (2026-11-15), queda solo con el POS.
  vallarta(584, 504, 'Fluvial', 'Las Gaviotas'),
  conPortal(veracruz(705, 612, 'Ávila Camacho', 'Boca del Río · Costa de Oro')),
  conPortal(veracruz(590, 501, 'Andamar', 'Boca del Río · Andamar')),
  conPortal(delPos('Oaxaca')(645, 558, 'Oaxaca', 'Centro')),
  // Aeropuerto Chiapas: sin tienda en la cuenta del portal de Rappi (2026-11-15), queda solo con el POS.
  delPos('Tuxtla Gutiérrez')(781, 496, 'Aeropuerto Chiapas', 'Aeropuerto'),
  conPortal(durango(632, 547, 'Durango', 'Juan de la Barrera')),
  conPortal(delPos('Torreón', 'America/Monterrey')(558, 451, 'Distrito Independencia', 'Blvd. Independencia')),
  // UTC−7 fijo, como Cd. Juárez: el POS no cambió de horario el 1 de noviembre (3-nov: último pedido 16:47 a las 16:04
  // de Tijuana). En verano es la hora local.
  conPortal(delPos('Tijuana', 'Etc/GMT+7')(613, 482, 'Tijuana', 'Las Américas')),
  conPortal(delPos('Hermosillo', 'America/Hermosillo')(664, 561, 'Andenes Hermosillo', 'Santa Fe')),
  // Lote 6, sureste: validadas con el 2 de noviembre y el último pedido de hoy en su hora local (Puerto Cancún y Scala
  // Huayacan con 3 y 1 ¢ de redondeo). Tulum, Mayab y Hermosillo vendieron poco el 2-nov; sus otros días son normales.
  conPortal(cancun(552, 466, 'Puerto Cancún', 'Puerto Juárez')),
  conPortal(cancun(679, 593, 'Scala Huayacan', 'Av. Huayacán')),
  conPortal(cancun(644, 557, 'Malecón Cancún', 'Plaza Las Américas')),
  // Tulum: sin tienda en la cuenta del portal de Rappi (2026-11-15), queda solo con el POS.
  delPos('Tulum', 'America/Cancun')(462, 360, 'Tulum', 'Zona Hotelera'),
  // Mayab: sin tienda en la cuenta del portal de Rappi (2026-11-15), queda solo con el POS.
  merida(627, 538, 'Mayab', 'Cordemex'),
  conPortal(merida(601, 452, 'Calle 47', 'Centro')),
  conPortal(merida(655, 566, 'Arthouse Mérida', 'Altabrisa')),
  // Lote 7: en el CRM el número Jestor viene en el nombre («Plaza Cantabria - 632») y el campo está vacío; el número
  // del nombre es el lookerStoreId de la API. El Campanario: la API dice 438 y el CRM «El Campanario - 348» (dígitos
  // invertidos; ninguna otra sucursal de la API usa 348): se usa el de la API. Validadas con el 2 de noviembre (Plaza
  // Norte con 1 ¢ de redondeo). Plaza Cantabria es de Ciudad Juárez: UTC−6 fijo como 612 (3-nov: último pedido 18:00 a
  // las 17:10 de Juárez). Plaza Cumbres, de la ciudad de Chihuahua: su hora coincide con America/Chihuahua.
  conPortal(delPos('Ciudad Juárez', 'Etc/GMT+6')(717, 632, 'Plaza Cantabria', 'Plaza Cantabria')),
  conPortal(leon(733, 649, 'Plaza Norte', 'Jardines del Moral')),
  conPortal(queretaro(547, 438, 'El Campanario', 'Hacienda El Campanario')),
  conPortal(cdmx(754, 662, 'Tampico 33', 'Cuauhtémoc · Roma Norte')),
  conPortal(cdmx(719, 634, 'Nuevo León', 'Cuauhtémoc · Hipódromo')),
  conPortal(durango(715, 625, 'Durango Centro', 'Centro')),
  conPortal(vallarta(771, 675, 'Marina Vallarta', 'Marina Vallarta')),
  conPortal(cdmx(735, 651, 'Uruguay 20', 'Cuauhtémoc · Centro Histórico')),
  conPortal(delPos('Chihuahua', 'America/Chihuahua')(716, 629, 'Plaza Cumbres', 'Plaza Cumbres')),
  conPortal(cdmx(770, 676, 'Puente Churubusco', 'Coyoacán · Del Carmen')),
  // Lote 8 (2026-11-20): las 4 que Zoho ya cuenta y el portal no tenía (eran −$54,163 y −335 tickets contra Zoho el
  // 19-nov). Validadas con el 19 de noviembre (scripts/sucursales/validar-sucursal.ts): venta = suma por productos al
  // centavo y horario posible en su zona. Puerto Paraíso (Los Cabos): último pedido del 20-nov 10:31 a las 10:37 de
  // Mazatlán. San Felipe (Chihuahua): coincide con America/Chihuahua. Plaza Toscana (Querétaro) y Guadalupe (Zacatecas),
  // hora del centro. Rappi del portal en las 3 con tienda (migración 86, una tienda normal cada una, sin Turbo).
  // San Felipe: sin tienda en la cuenta del portal de Rappi (2026-11-20), queda solo con el POS.
  conPortal(delPos('Zacatecas')(681, 594, 'Guadalupe Zacatecas', 'Guadalupe')),
  conPortal(queretaro(777, 680, 'Plaza Toscana', 'Plaza Toscana')),
  conPortal(delPos('Los Cabos', 'America/Mazatlan')(690, 602, 'Puerto Paraíso', 'Cabo San Lucas')),
  delPos('Chihuahua', 'America/Chihuahua')(795, 702, 'San Felipe', 'San Felipe'),
];

export const configDe = (companyId: number) =>
  sucursalesConfiguradas.find((s) => s.companyId === companyId) ?? null;

/** Versión del contrato y de la interpretación horaria; forma parte de las claves de caché. */
export const VERSION_DATOS = 'v1';
