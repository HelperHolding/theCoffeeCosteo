// Prototipo del CRM Unificado (Fase A): datos SINTÉTICOS. Los nombres son inventados; los totales por
// columna son los conteos de la muestra real mapeada (doc 40 §8), sin datos personales.
import { Marco } from '../../../components/portal/marco';
import { Encabezado, Kpi } from '../../../components/portal/piezas';
import { PipelineGeneral } from '../../../components/crm/unificado/pipeline';
import { ExpedienteCard, type DatosExpediente } from '../../../components/crm/unificado/expediente';
import type { CardPipeline, EtapaGeneral } from '../../../lib/crm/unificado/modelo';
import type { Archivo, Franquiciatario, Historial, RequisitoCard, Tienda } from '../../../lib/crm/tipos';
import { Lock, LockOpen, CalendarClock, CircleCheck } from 'lucide-react';

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
    <p className="aviso">
      PROTOTIPO · DATOS SINTÉTICOS · nombres inventados; totales = muestra mapeada (doc 40)
    </p>
    {children}
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
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          etiqueta="Bloqueadas"
          valor={41}
          icono={Lock}
          tono="sin-precio"
          nota="faltan requisitos de su etapa"
        />
        <Kpi etiqueta="Listas para avanzar" valor={7} icono={CircleCheck} tono="ok" nota="todo validado" />
        <Kpi etiqueta="Candados liberados" valor={2} icono={LockOpen} tono="bajo" nota="últimos 30 días" />
        <Kpi
          etiqueta="Vencen en 14 días"
          valor={4}
          icono={CalendarClock}
          nota="COF, 5 días hábiles, 120 días"
        />
      </div>
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
