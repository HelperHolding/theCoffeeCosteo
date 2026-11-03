// Prototipo del CRM Unificado (Fase A): datos SINTÉTICOS. Los nombres son inventados; los totales por
// columna son los conteos de la muestra real mapeada (doc 40 §8), sin datos personales.
import { Marco } from '../../../components/portal/marco';
import { Encabezado } from '../../../components/portal/piezas';
import { PanelCifras } from '../../../components/crm/unificado/piezas';
import { PipelineGeneral } from '../../../components/crm/unificado/pipeline';
import { ExpedienteCard, type DatosExpediente } from '../../../components/crm/unificado/expediente';
import type { CardPipeline, EtapaGeneral } from '../../../lib/crm/unificado/modelo';
import type { Archivo, Franquiciatario, Historial, RequisitoCard, Tienda } from '../../../lib/crm/tipos';
import { VistaPanel } from '../../../components/crm/unificado/vistas/panel';
import { VistaFranquiciatarios } from '../../../components/crm/unificado/vistas/franquiciatarios';
import { VistaPendientes } from '../../../components/crm/unificado/vistas/pendientes';
import { VistaVencimientos } from '../../../components/crm/unificado/vistas/vencimientos';
import { VistaBitacora } from '../../../components/crm/unificado/vistas/bitacora';
import { VistaActividades, VistaContactos } from '../../../components/crm/unificado/vistas/directorio';
import { VistaAdmin } from '../../../components/crm/unificado/vistas/admin';
import { Festivos, Membresias, Requisitos as RequisitosAdmin } from '../../../components/crm/unificado/admin';
import { Tarjeta } from '../../../components/portal/piezas';
import type { Actividad, Festivo, Membresia, Requisito } from '../../../lib/crm/tipos';
import type { Aviso, VencimientoCard } from '../../../lib/crm/tipos';
import '../../../app/(sucursales)/sucursales/vitrina.css';

// Fecha fija para que las capturas no dependan del día.
export const AHORA = new Date('2026-11-03T18:30:00Z');
const hace = (dias: number, h = 10, m = 42) => {
  const d = new Date(AHORA);
  d.setUTCDate(d.getUTCDate() - dias);
  d.setUTCHours(h + 6, m, 0, 0); // hora de México = UTC−6
  return d.toISOString();
};

const e = (
  orden: number,
  clave: string,
  nombre: string,
  extra: Partial<EtapaGeneral> & Pick<EtapaGeneral, 'area' | 'card'>,
): EtapaGeneral => ({ id: clave, clave, orden, nombre, numero: null, tipo: 'abierta', ...extra });

export const ETAPAS: EtapaGeneral[] = [
  e(1, 'recepcion', 'Recepción, clasificación y asignación', {
    numero: 1,
    area: 'ventas',
    card: 'franquiciatario',
  }),
  e(2, 'contacto', 'Contacto inicial y seguimiento', { numero: 2, area: 'ventas', card: 'franquiciatario' }),
  e(3, 'revision_contrato', 'Revisión de contrato', {
    numero: 3,
    area: 'ventas',
    card: 'franquiciatario',
    opcional: true,
  }),
  e(4, 'pld', 'Perfilamiento, PLD y formalización', { numero: 4, area: 'ventas', card: 'franquiciatario' }),
  e(5, 'bienvenida', 'Bienvenida, carta de intención y facturación', {
    numero: 5,
    area: 'ventas',
    card: 'franquiciatario',
  }),
  e(6, 'locales', 'Aprobación de locales', {
    numero: 6,
    area: 'ventas',
    funcion: 'Aprobación de locales',
    card: 'sucursal',
  }),
  e(7, 'constancia', 'Constancia de arrendamiento', { numero: 7, area: 'legal', card: 'sucursal' }),
  e(8, 'transferencia', 'Transferencia a Proyectos', { numero: 8, area: 'legal', card: 'sucursal' }),
  e(9, 'p_arquitecta', 'Arquitecta asignada', { area: 'proyectos', card: 'sucursal', provisional: true }),
  e(10, 'p_3d', 'Proyecto 3D', { area: 'proyectos', card: 'sucursal', provisional: true }),
  e(11, 'p_ejecutivo', 'Proyecto ejecutivo', { area: 'proyectos', card: 'sucursal', provisional: true }),
  e(12, 'p_remodelacion', 'En remodelación', { area: 'proyectos', card: 'sucursal', provisional: true }),
  e(13, 'p_entrega', 'Entrega de local', { area: 'proyectos', card: 'sucursal', provisional: true }),
  e(14, 'p_capacitacion', 'Agenda de capacitación', {
    area: 'proyectos',
    card: 'sucursal',
    provisional: true,
  }),
  e(15, 'cof', 'Circular Oferta de Franquicia (COF)', { numero: 9, area: 'legal', card: 'sucursal' }),
  e(16, 'contrato', 'Contrato de franquicia y apertura', { numero: 10, area: 'legal', card: 'sucursal' }),
  e(17, 'operando', 'Operando', { area: 'legal', card: 'sucursal', tipo: 'ganada' }),
  e(18, 'standby', 'Standby', { area: 'ventas', card: 'franquiciatario', tipo: 'lateral' }),
  e(19, 'descartada', 'Descartada', { area: 'ventas', card: 'franquiciatario', tipo: 'perdida' }),
  e(20, 'cancelada', 'Cancelada', { area: 'legal', card: 'sucursal', tipo: 'perdida' }),
  e(21, 'cerrada', 'Cerrada', { area: 'legal', card: 'sucursal', tipo: 'perdida' }),
];

// Conteos de la muestra mapeada (doc 40 §8). La etapa 1 incluye la zona bloqueada (Q3 por decidir).
const TOTALES: Record<string, number> = {
  recepcion: 3025,
  contacto: 557,
  revision_contrato: 1,
  pld: 2,
  bienvenida: 2,
  locales: 65,
  constancia: 4,
  transferencia: 0,
  p_arquitecta: 4,
  p_3d: 3,
  p_ejecutivo: 5,
  p_remodelacion: 11,
  p_entrega: 0,
  p_capacitacion: 1,
  cof: 0,
  contrato: 0,
  operando: 72,
  standby: 6,
  descartada: 33,
  cancelada: 4,
  cerrada: 2,
};

const personas = [
  'Mariana Ortiz',
  'Jorge Salinas',
  'Lucía Ferrer',
  'Raúl Benítez',
  'Daniela Cruz',
  'Iván Montes',
  'Paola Garza',
  'Héctor Lira',
  'Sofía Peralta',
  'Andrés Vela',
  'Elena Robles',
  'Tomás Quiroga',
];
const ciudades = ['Querétaro', 'Puebla', 'Mérida', 'León', 'Saltillo', 'Toluca', 'Morelia', 'Cancún'];
const actores = ['Luis', 'Andrés', 'Diego', 'Sebastián', 'Carlos'];

// Primer requisito pendiente típico de cada etapa (doc 40 §4).
const FALTANTE: Record<string, { nombre: string; area: 'ventas' | 'legal' | 'proyectos' }> = {
  recepcion: { nombre: 'Resultado territorial', area: 'ventas' },
  contacto: { nombre: 'Fecha de primera reunión', area: 'ventas' },
  revision_contrato: { nombre: 'Contrato enviado', area: 'legal' },
  pld: { nombre: 'Survey validado', area: 'ventas' },
  bienvenida: { nombre: 'Carta de intención firmada', area: 'legal' },
  locales: { nombre: 'Dictamen firmado', area: 'ventas' },
  constancia: { nombre: 'Constancia firmada', area: 'legal' },
  transferencia: { nombre: 'Fecha estimada de apertura', area: 'proyectos' },
  cof: { nombre: 'COF firmada', area: 'legal' },
  contrato: { nombre: 'Contrato de franquicia firmado', area: 'legal' },
};
let n = 0;
function card(etapaId: string, extra: Partial<CardPipeline> = {}): CardPipeline {
  n += 1;
  const etapa = ETAPAS.find((x) => x.id === etapaId)!;
  const total = etapa.card === 'franquiciatario' ? [5, 2, 4, 6, 4][(etapa.numero ?? 1) - 1] : 4;
  const listos = n % 3 === 0 ? total : n % total;
  return {
    id: `c${n}`,
    tipo: etapa.card ?? 'franquiciatario',
    nombre:
      etapa.card === 'franquiciatario'
        ? personas[n % personas.length]
        : `${ciudades[n % ciudades.length]} ${['Centro', 'Plaza Sur', 'Juriquilla', 'Altabrisa'][n % 4]}`,
    franquiciatario: etapa.card === 'sucursal' ? `${personas[(n + 3) % personas.length]}` : null,
    ciudad: ciudades[(n + 1) % ciudades.length],
    etapaId,
    version: 1,
    etapaPreviaId: null,
    requisitos: {
      total,
      listos,
      faltante: listos < total ? (FALTANTE[etapaId] ?? null) : null,
    },
    liberado: false,
    vencimiento: null,
    archivos: n % 4,
    notas: (n * 3) % 5,
    ultimo: { actor: actores[n % actores.length], fecha: hace(n % 6, 9 + (n % 8), (n * 7) % 60) },
    muestra: true,
    ...extra,
  };
}

export const CARDS: CardPipeline[] = [
  card('recepcion'),
  card('recepcion', { muestra: false, ultimo: { actor: 'Luis', fecha: hace(0, 10, 42) } }),
  card('recepcion'),
  card('contacto'),
  card('contacto', { liberado: true }),
  card('contacto'),
  card('revision_contrato'),
  card('pld', {
    nombre: 'Mariana Ortiz',
    requisitos: { total: 6, listos: 3, faltante: { nombre: 'PLD firmado (copia digital)', area: 'ventas' } },
    vencimiento: null,
    muestra: false,
    ultimo: { actor: 'Luis', fecha: hace(0, 10, 42) },
  }),
  card('pld'),
  card('bienvenida', {
    vencimiento: { tipo: 'pld_original', etiqueta: 'PLD original', fecha: '2026-11-07', dias: 4 },
  }),
  card('bienvenida', { requisitos: { total: 4, listos: 4, faltante: null } }),
  card('locales'),
  card('locales'),
  card('locales', { liberado: true }),
  card('constancia', {
    vencimiento: { tipo: 'limite_120', etiqueta: 'Límite de apertura', fecha: '2027-02-20', dias: 109 },
  }),
  card('p_arquitecta'),
  card('p_3d'),
  card('p_ejecutivo'),
  card('p_remodelacion', {
    vencimiento: { tipo: 'cof', etiqueta: 'COF a Legal', fecha: '2026-11-15', dias: 12 },
  }),
  card('p_remodelacion', {
    vencimiento: { tipo: 'cof', etiqueta: 'COF a Legal', fecha: '2026-10-30', dias: -4 },
  }),
  card('p_capacitacion', {
    vencimiento: {
      tipo: 'apertura_5_habiles',
      etiqueta: 'Fecha confirmada a Legal',
      fecha: '2026-11-06',
      dias: 3,
    },
  }),
  card('operando'),
  card('operando'),
  card('standby'),
  card('descartada'),
  card('cancelada'),
];

const marco = (children: React.ReactNode) => (
  <Marco
    perfil={{ nombre: 'Andrés (Legal)', rol: 'admin' }}
    seccion="crm"
    visibles={['costeo', 'crm', 'sucursales']}
  >
    <div className="vitrina space-y-6">
      <p className="aviso">
        PROTOTIPO · DATOS SINTÉTICOS · nombres inventados; totales = muestra mapeada (doc 40)
      </p>
      {children}
    </div>
  </Marco>
);

export function VistaPipeline() {
  return marco(
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="Pipeline"
        descripcion="De la recepción del lead a la apertura. Cada etapa se cierra con sus requisitos."
      />
      <PanelCifras
        cifras={[
          { etiqueta: 'Bloqueadas', valor: 41, tono: 'bad', nota: 'de las cards a la vista' },
          { etiqueta: 'Listas para avanzar', valor: 7, tono: 'ok', nota: 'todo validado' },
          { etiqueta: 'Candados liberados', valor: 2, tono: 'warn', nota: 'por consumir' },
          { etiqueta: 'Vencen en 14 días', valor: 4, nota: 'COF, 5 días hábiles, 120 días' },
        ]}
      />
      <PipelineGeneral etapas={ETAPAS} cards={CARDS} totales={TOTALES} ahora={AHORA} editable />
    </>,
  );
}

const etapa = (clave: string) => ETAPAS.find((x) => x.clave === clave)!;
let nr = 0;
/** Requisito de la card de prueba con su estado (mismo contrato que crm_requisitos_de). */
const r = (
  etapaClave: string,
  nombre: string,
  tipo: RequisitoCard['tipo'],
  cumple: RequisitoCard['area_cumple'],
  estado: RequisitoCard['estado'],
  ayuda: string,
  extra: Partial<RequisitoCard> = {},
): RequisitoCard => {
  nr += 1;
  const et = etapa(etapaClave);
  return {
    requisito_id: `r${nr}`,
    clave: `r${nr}`,
    etapa_id: et.id,
    etapa_clave: et.clave,
    etapa_orden: et.orden,
    de_etapa_actual: etapaClave === 'cof',
    nombre,
    tipo,
    area_cumple: cumple,
    area_valida: cumple,
    funcion_cumple: null,
    obligatorio: true,
    campo: null,
    tipo_documento: null,
    depende_de: [],
    anticipable: false,
    orden: nr,
    ayuda,
    estado,
    cumplimiento_id: estado === 'pendiente' ? null : `cu${nr}`,
    valor: null,
    fecha: null,
    archivo_id: null,
    nota: null,
    cumplido_por: estado === 'pendiente' ? null : 'u-andres',
    cumplido_en: estado === 'pendiente' ? null : hace(14, 11, 5),
    validado_por: estado === 'validado' ? 'u-andres' : null,
    validado_en: estado === 'validado' ? hace(14, 11, 6) : null,
    ...extra,
  };
};
const archivo = (
  id: string,
  tipo: string,
  nombre: string,
  por: string,
  dias: number,
  kb: number,
  extra: Partial<Archivo> = {},
) =>
  ({
    id,
    nombre,
    mime: 'application/pdf',
    tamano: kb * 1024,
    tienda_id: 'suc-juriquilla',
    franquiciatario_id: null,
    tipo_documento: tipo,
    version_documento: 1,
    reemplaza_a: null,
    subido_por: por,
    subido_en: hace(dias),
    archivado_en: null,
    motivo_retiro: null,
    imported_at: null,
    ...extra,
  }) as Archivo;
const evento = (
  id: number,
  accion: Historial['accion'],
  resumen: string,
  actor: string,
  area: string | null,
  fecha: string,
  extra: Partial<Historial> = {},
) =>
  ({
    id,
    accion,
    resumen,
    actor_nombre: actor,
    actor_area: area,
    fecha,
    origen: 'crm',
    motivo: null,
    ...extra,
  }) as Historial;

export function VistaExpedienteUnificado() {
  const parametros = new URLSearchParams(window.location.search);
  const sucursal: CardPipeline = {
    ...card('cof'),
    id: 'suc-juriquilla',
    nombre: 'Querétaro Juriquilla',
    franquiciatario: 'Mariana Ortiz',
    ciudad: 'Querétaro',
    etapaId: 'cof',
    requisitos: { total: 2, listos: 1, faltante: { nombre: 'COF firmada', area: 'legal' } },
    vencimiento: { tipo: 'cof', etiqueta: 'COF firmada', fecha: '2026-11-15', dias: 12 },
    muestra: false,
  };
  const datos: DatosExpediente = {
    tipo: 'sucursal',
    card: sucursal,
    franquiciatario: { id: 'fr-mariana', nombre: 'Mariana Ortiz' } as Franquiciatario,
    sucursal: {
      id: 'suc-juriquilla',
      nombre: 'Querétaro Juriquilla',
      ciudad: 'Querétaro',
      direccion: null,
      responsable_id: 'u-andres',
      franquiciatario_id: 'fr-mariana',
      fecha_limite_apertura: '2027-01-16',
      fecha_estimada_apertura: '2027-01-15',
      fecha_confirmada_apertura: null,
      numero_tienda_jestor: null,
      arquitecto_asignado: 'Arquitecta Prueba',
    } as Tienda,
    etapa: etapa('cof'),
    etapas: ETAPAS,
    requisitos: [
      r(
        'locales',
        'Lineamientos y formatos enviados',
        'fecha',
        'ventas',
        'validado',
        'Video tutorial y formatos oficiales.',
        { fecha: '2026-07-02', cumplido_por: 'u-sebastian', validado_por: 'u-sebastian' },
      ),
      r(
        'locales',
        'Dictamen firmado por el franquiciatario',
        'firma',
        'ventas',
        'validado',
        'Sin dictamen firmado no se pide la constancia.',
        { fecha: '2026-07-28', cumplido_por: 'u-sebastian', validado_por: 'u-sebastian' },
      ),
      r(
        'constancia',
        'Constancia de arrendamiento firmada',
        'firma',
        'legal',
        'validado',
        'Legal la firma el mismo día que se acredita el arrendamiento.',
        { fecha: '2026-09-18' },
      ),
      r(
        'constancia',
        'Fecha límite de apertura',
        'dato',
        'legal',
        'validado',
        'Por lo general, firma + 120 días.',
        { campo: 'fecha_limite_apertura', valor: '2027-01-16' },
      ),
      r(
        'cof',
        'COF enviada al franquiciatario',
        'fecha',
        'legal',
        'validado',
        'La LFPPI exige entregarla al menos 2 meses antes del contrato.',
        { fecha: '2026-10-20' },
      ),
      r(
        'cof',
        'COF firmada y fecha de entrega',
        'firma',
        'legal',
        'pendiente',
        'Sin COF firmada no se envía el contrato. Si llega tarde, la apertura se ajusta al plazo legal.',
      ),
      r(
        'contrato',
        'Fecha confirmada de apertura',
        'dato',
        'proyectos',
        'pendiente',
        'Proyectos la confirma a Legal al menos 5 días hábiles antes.',
        { campo: 'fecha_confirmada_apertura', de_etapa_actual: false, anticipable: true },
      ),
    ],
    archivos: [
      archivo('d1', 'dictamen_firmado', 'Dictamen local Juriquilla.pdf', 'u-sebastian', 98, 812),
      archivo('d0', 'contrato_arrendamiento', 'Arrendamiento Juriquilla.pdf', 'u-sebastian', 95, 2210),
      archivo(
        'd2',
        'contrato_arrendamiento',
        'Arrendamiento Juriquilla firmado.pdf',
        'u-sebastian',
        93,
        2304,
        { version_documento: 2, reemplaza_a: 'd0' },
      ),
      archivo('d3', 'constancia', 'Constancia Juriquilla.pdf', 'u-andres', 46, 356),
      archivo('d4', 'cof', 'COF enviada Juriquilla.pdf', 'u-andres', 14, 1290),
    ],
    notas: [],
    actividades: [],
    historial: [
      evento(
        6,
        'requisito_validado',
        'Validado: COF enviada al franquiciatario',
        'Andrés',
        'legal',
        hace(14, 11, 5),
      ),
      evento(
        5,
        'etapa',
        'Etapa: Agenda de capacitación → 9 · Circular Oferta de Franquicia (COF)',
        'Diego',
        'proyectos',
        hace(16, 17, 20),
      ),
      evento(
        4,
        'aviso',
        'COF de Querétaro Juriquilla: apertura estimada 15/01/2027; debe firmarse a más tardar el 15/11/2026',
        'Sistema',
        null,
        hace(19, 7, 0),
        { origen: 'sistema' },
      ),
      evento(
        3,
        'candado_liberado',
        'Candado liberado en 8 · Transferencia a Proyectos',
        'Andrés',
        'legal',
        hace(44, 13, 15),
        { motivo: 'El ID de Jestor se da de alta esta semana; Dirección autorizó iniciar arquitectura.' },
      ),
      evento(
        2,
        'archivo_version',
        'Nueva versión 2 de contrato_arrendamiento (la anterior se conserva)',
        'Sebastián',
        'ventas',
        hace(93, 12, 2),
      ),
      evento(
        1,
        'sucursal_creada',
        'Sucursal creada en 6 · Aprobación de locales',
        'Luis',
        'ventas',
        hace(130, 16, 48),
      ),
    ],
    liberaciones: [],
    sucursales: [],
    nombres: { 'u-andres': 'Andrés', 'u-sebastian': 'Sebastián' },
  };
  return marco(
    <>
      <Encabezado
        titulo={sucursal.nombre}
        descripcion="Sucursal de Mariana Ortiz · Querétaro"
        migas={[
          { href: '/crm', nombre: 'CRM' },
          { href: '/crm/pipeline', nombre: 'Pipeline' },
        ]}
      />
      <ExpedienteCard
        datos={datos}
        usuario={{
          id: 'u-andres',
          nombre: 'Andrés',
          areas: ['legal'],
          funciones: [],
          esHead: true,
          desarrollador: false,
          editable: true,
        }}
        ahora={AHORA}
        pestana={parametros.get('tab') ?? undefined}
        liberarAbierto={parametros.has('liberar')}
      />
    </>,
  );
}

// ── Rediseño 2026-11-03: vistas por apartado con datos sintéticos ─────────────────────────────────
const venc = (
  tienda: string,
  nombre: string,
  tipo: VencimientoCard['tipo'],
  area: VencimientoCard['area'],
  fecha: string,
): VencimientoCard & { dias: number } => ({
  tienda_id: tienda,
  franquiciatario_id: null,
  nombre,
  tipo,
  area,
  fecha,
  aviso_desde: fecha,
  mensaje: '',
  dias: Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse('2026-11-03T00:00:00Z')) / 86_400_000),
});
export const VENCIMIENTOS = [
  venc('s1', 'Mérida Altabrisa', 'cof', 'legal', '2026-10-30'),
  venc('s2', 'Querétaro Juriquilla', 'apertura_5_habiles', 'legal', '2026-11-06'),
  venc('s3', 'Puebla Centro', 'cof', 'legal', '2026-11-15'),
  venc('s4', 'León Plaza Sur', 'limite_120', 'legal', '2026-11-17'),
  venc('s5', 'Saltillo Centro', 'cof', 'legal', '2026-12-04'),
  venc('s6', 'Toluca Metepec', 'limite_120', 'legal', '2027-02-20'),
];
const aviso = (id: string, tienda: string, mensaje: string, area: Aviso['area']): Aviso => ({
  id,
  tipo: 'cof',
  tienda_id: tienda,
  franquiciatario_id: null,
  area,
  fecha_objetivo: '2026-11-15',
  mensaje,
  generado_en: hace(0, 7, 0),
  atendido_por: null,
  atendido_en: null,
});
export const AVISOS = [
  aviso('a1', 's3', 'Puebla Centro: la COF debe estar firmada antes del 15 nov', 'legal'),
  aviso(
    'a2',
    's2',
    'Querétaro Juriquilla: confirma la fecha de apertura a Legal (5 días hábiles)',
    'proyectos',
  ),
];
export const MOVIMIENTOS: Historial[] = [
  evento(
    9001,
    'etapa',
    'Mariana Ortiz pasó a «Perfilamiento, PLD y formalización»',
    'Luis',
    'ventas',
    hace(0, 10, 42),
  ),
  evento(
    9002,
    'candado_liberado',
    'Candado liberado en León Plaza Sur (Aprobación de locales)',
    'Andrés',
    'legal',
    hace(0, 9, 15),
    {
      motivo: 'El dictamen llega firmado el lunes; el local no se puede perder.',
    },
  ),
  evento(
    9003,
    'requisito_cumplido',
    'Constancia de arrendamiento firmada en Puebla Centro',
    'Andrés',
    'legal',
    hace(1, 17, 5),
  ),
  evento(
    9004,
    'archivo',
    'Render 3D v2 subido a Querétaro Juriquilla',
    'Diego',
    'proyectos',
    hace(1, 12, 30),
  ),
  evento(9005, 'requisito_validado', 'Survey validado para Jorge Salinas', 'Luis', 'ventas', hace(2, 11, 0)),
];
const POR_ETAPA = Object.fromEntries(Object.entries(TOTALES));

export function VistaPanelCrm() {
  return marco(
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="Panel"
        descripcion="El proceso de hoy: qué está bloqueado, qué vence y quién movió qué."
      />
      <VistaPanel
        etapas={ETAPAS}
        porEtapa={POR_ETAPA}
        candados={{ bloqueadas: 3656, listas: 9, liberadas: 3 }}
        liberados30={3}
        proximos={VENCIMIENTOS.filter((v) => v.dias <= 14)}
        avisos={AVISOS}
        areas={['legal']}
        todas
        movimientos={MOVIMIENTOS}
        ahora={AHORA}
      />
    </>,
  );
}

const encabezado = (titulo: string, descripcion: string) => (
  <Encabezado area="CRM Franquicias" titulo={titulo} descripcion={descripcion} />
);

export function VistaFranquiciatariosCrm() {
  const etapaDe = (c: string) => ETAPAS.find((x) => x.clave === c)!;
  const claves = [
    'recepcion',
    'contacto',
    'pld',
    'bienvenida',
    'formalizado',
    'contacto',
    'recepcion',
    'pld',
    'formalizado',
  ];
  return marco(
    <>
      {encabezado(
        'Franquiciatarios',
        'Expediente por persona o empresa: Survey, datos fiscales, documentos y sus sucursales.',
      )}
      <VistaFranquiciatarios
        filas={claves.map((c, i) => ({
          id: `f${i}`,
          nombre: personas[i % personas.length],
          ciudad: i === 3 ? null : ciudades[i % ciudades.length],
          etapa: ETAPAS.find((x) => x.clave === c) ?? etapaDe('recepcion'),
          sucursales: c === 'formalizado' ? (i % 3) + 1 : 0,
          vendedor: i % 4 === 2 ? null : actores[i % actores.length],
          muestra: i % 2 === 0,
          formalizado: c === 'formalizado',
        }))}
        estado=""
        conteos={{ todos: 3674, formalizados: 94, en_proceso: 3580 }}
        total={3674}
        pagina={1}
        paginas={77}
      />
    </>,
  );
}

export function VistaPendientesCrm() {
  const de = (clave: string) => CARDS.filter((c) => c.etapaId === clave);
  return marco(
    <>
      {encabezado('Mis pendientes', 'Lo que le toca a Legal, por urgencia.')}
      <VistaPendientes
        etapas={ETAPAS}
        avisos={AVISOS}
        vencidos={VENCIMIENTOS.filter((v) => v.dias <= 7)}
        porValidar={[...de('constancia'), ...de('bienvenida')]}
        totalPorValidar={3}
        listas={CARDS.filter((c) => c.requisitos.listos >= c.requisitos.total || c.liberado).slice(0, 8)}
        totalListas={12}
        bloqueadas={63}
        propias={[]}
        areas={['legal']}
        todas={false}
      />
    </>,
  );
}

export function VistaVencimientosCrm() {
  return marco(
    <>
      {encabezado(
        'Vencimientos',
        'Cuándo hay que actuar en cada sucursal. Los días hábiles saltan fines de semana y festivos.',
      )}
      <VistaVencimientos lista={VENCIMIENTOS} avisos={AVISOS} areas={['legal']} todas />
    </>,
  );
}

export function VistaBitacoraCrm() {
  return marco(
    <>
      {encabezado(
        'Bitácora',
        'Cada movimiento con nombre, área, fecha y hora (Ciudad de México). Nadie la puede editar ni borrar.',
      )}
      <VistaBitacora
        filas={[
          ...MOVIMIENTOS.map((m) => ({ ...m, tienda_id: 's1', franquiciatario_id: null })),
          evento(
            9006,
            'aviso',
            'Aviso automático: COF de Mérida Altabrisa vencida',
            'Sistema',
            null,
            hace(2, 7, 0),
            { origen: 'sistema', actor_nombre: null },
          ),
          evento(9007, 'creado', 'Alta de franquiciatario Sofía Peralta', 'Luis', 'ventas', hace(3, 16, 20)),
        ]}
        total={128}
        pagina={1}
        paginas={3}
        p={{}}
        personas={[{ user_id: 'u1', nombre: 'Luis' }]}
      />
    </>,
  );
}

export function VistaContactosCrm() {
  return marco(
    <>
      {encabezado('Contactos', 'Franquiciatarios y personas de contacto.')}
      <VistaContactos
        filtrado={false}
        filas={personas.slice(0, 7).map((x, i) => {
          const [nombre, apellidos] = x.split(' ');
          return {
            id: `k${i}`,
            nombre,
            apellidos,
            correo: i % 3 === 2 ? null : `${nombre.toLowerCase()}@ejemplo.mx`,
            telefono: i % 2 ? '442 000 0000' : null,
            puesto: ['Socia', 'Gerente', null, 'Contador'][i % 4],
            tipo_contacto: ['Franquiciatario', 'Proveedor', null][i % 3],
            franquiciatario: personas[(i + 2) % personas.length],
            plaza: ciudades[i % ciudades.length],
          };
        })}
      />
    </>,
  );
}

const actividad = (i: number, asunto: string, fecha: string | null, extra: Partial<Actividad> = {}) =>
  ({
    id: `act${i}`,
    asunto,
    fecha_vencimiento: fecha,
    estado: 'Not Started',
    prioridad: 'Normal',
    descripcion: null,
    cerrada_en: null,
    tienda_id: i % 2 ? 's1' : null,
    franquiciatario_id: i % 2 ? null : 'f1',
    prospecto_id: null,
    contacto_id: null,
    version: 1,
    ...extra,
  }) as Actividad;

export function VistaActividadesCrm() {
  return marco(
    <>
      {encabezado('Actividades', 'Tareas de seguimiento de franquiciatarios, sucursales y contactos.')}
      <VistaActividades
        vista="abiertas"
        conteos={{ abiertas: 14, vencidas: 3, completadas: 220, todas: 234 }}
        enlaces={{ abiertas: '#', vencidas: '#', completadas: '#', todas: '#' }}
        relacion={{ s1: { texto: 'Mérida Altabrisa', href: '#' }, f1: { texto: 'Mariana Ortiz', href: '#' } }}
        editable
        filas={[
          actividad(1, 'Llamar para confirmar firma de COF', '2026-10-30', { prioridad: 'High' }),
          actividad(2, 'Enviar formatos de lineamientos', '2026-11-05'),
          actividad(3, 'Revisar render 3D con la arquitecta', '2026-11-12', { estado: 'In Progress' }),
          actividad(4, 'Agendar capacitación del equipo', null, { prioridad: null }),
        ]}
      />
    </>,
  );
}

export function VistaAdminCrm() {
  const gente = [
    { user_id: 'u1', nivel: 'editor', nombre: 'Luis' },
    { user_id: 'u2', nivel: 'editor', nombre: 'Andrés' },
    { user_id: 'u3', nivel: 'editor', nombre: 'Diego' },
    { user_id: 'u4', nivel: 'editor', nombre: 'Sebastián' },
    { user_id: 'u5', nivel: 'lectura', nombre: 'Carlos' },
  ];
  const m = (user_id: string, area: Membresia['area'], rol: Membresia['rol']) =>
    ({ user_id, area, rol, funciones: [], version: 1 }) as unknown as Membresia;
  const ms = [
    m('u1', 'ventas', 'head'),
    m('u4', 'ventas', 'miembro'),
    m('u2', 'legal', 'head'),
    m('u3', 'proyectos', 'head'),
  ];
  const req = (i: number, etapa: string, nombre: string, activo = true) =>
    ({
      id: `rq${i}`,
      clave: `rq${i}`,
      etapa_id: etapa,
      nombre,
      tipo: 'documento',
      area_cumple: 'ventas',
      area_valida: 'ventas',
      funcion_cumple: null,
      obligatorio: true,
      campo: null,
      tipo_documento: null,
      depende_de: [],
      anticipable: false,
      orden: i,
      ayuda: '',
      activo,
      version: 1,
    }) as unknown as Requisito;
  const reqs = [
    req(1, 'recepcion', 'Resultado territorial'),
    req(2, 'contacto', 'Fecha de primera reunión'),
    req(3, 'pld', 'Survey validado'),
    req(4, 'pld', 'PLD firmado', false),
  ];
  const fs = [
    { fecha: '2026-11-16', nombre: 'Revolución Mexicana' },
    { fecha: '2026-12-25', nombre: 'Navidad' },
  ] as Festivo[];
  return marco(
    <>
      {encabezado(
        'Administración',
        'Usuarios por área, requisitos por etapa y festivos. Cada cambio queda en la bitácora.',
      )}
      <VistaAdmin
        personas={gente}
        membresias={ms}
        requisitosActivos={3}
        requisitosTotal={4}
        festivosAnio={2}
        usuarios={
          <Tarjeta titulo="Usuarios por área" cuerpo={false}>
            <Membresias personas={gente} membresias={ms} puede />
          </Tarjeta>
        }
        requisitos={
          <Tarjeta titulo="Requisitos por etapa" cuerpo={false}>
            <RequisitosAdmin requisitos={reqs} etapas={ETAPAS} puede />
          </Tarjeta>
        }
        festivos={
          <Tarjeta titulo="Festivos" cuerpo={false}>
            <Festivos festivos={fs} puede />
          </Tarjeta>
        }
      />
    </>,
  );
}

/** Vistas del rediseño por `?vista-crm=<clave>`. */
export const VISTAS_CRM: Record<string, () => React.ReactNode> = {
  panel: VistaPanelCrm,
  franquiciatarios: VistaFranquiciatariosCrm,
  pendientes: VistaPendientesCrm,
  vencimientos: VistaVencimientosCrm,
  bitacora: VistaBitacoraCrm,
  contactos: VistaContactosCrm,
  actividades: VistaActividadesCrm,
  admin: VistaAdminCrm,
};
