// Prototipo del CRM Unificado (Fase A): datos SINTÉTICOS. Los nombres son inventados; los totales por
// columna son los conteos de la muestra real mapeada (doc 40 §8), sin datos personales.
import { Marco } from '../../../components/portal/marco';
import { Encabezado } from '../../../components/portal/piezas';
import { PanelCifras } from '../../../components/crm/unificado/piezas';
import { PipelineGeneral } from '../../../components/crm/unificado/pipeline';
import { ExpedienteCard, type DatosExpediente } from '../../../components/crm/unificado/expediente';
import type { CardPipeline, EtapaGeneral } from '../../../lib/crm/unificado/modelo';
import type {
  Archivo,
  Franquiciatario,
  FranquiciatarioFiscal,
  Historial,
  Nota,
  RequisitoCard,
  Tienda,
} from '../../../lib/crm/tipos';
import { VistaPanel } from '../../../components/crm/unificado/vistas/panel';
import { VistaFranquiciatarios } from '../../../components/crm/unificado/vistas/franquiciatarios';
import { VistaPendientes } from '../../../components/crm/unificado/vistas/pendientes';
import { VistaVencimientos } from '../../../components/crm/unificado/vistas/vencimientos';
import { VistaBitacora } from '../../../components/crm/unificado/vistas/bitacora';
import { VistaActividades, VistaContactos } from '../../../components/crm/unificado/vistas/directorio';
import { VistaAdmin } from '../../../components/crm/unificado/vistas/admin';
import { VistaProceso } from '../../../components/crm/unificado/vistas/proceso';
import { NuevoFranquiciatario } from '../../../components/crm/unificado/nuevo-franquiciatario';
import { VistaEntradasPipeline } from '../../../components/crm/unificado/vistas/entradas-pipeline';
import { AREAS, tramos as calcularTramos } from '../../../lib/crm/unificado/modelo';
import { VistaCarrilLegal, type FilaCarril } from '../../../components/crm/unificado/vistas/carril-legal';
import { pasosProceso, type RequisitoProceso } from '../../../lib/crm/unificado/proceso';
import { Festivos, Membresias, Requisitos as RequisitosAdmin } from '../../../components/crm/unificado/admin';
import { Tarjeta } from '../../../components/portal/piezas';
import type { Actividad, Festivo, Membresia, Requisito } from '../../../lib/crm/tipos';
import type { Aviso, VencimientoCard } from '../../../lib/crm/tipos';
import { TERRITORIOS } from '../../../lib/crm/tipos';
import '../../../app/(sucursales)/sucursales/vitrina.css';
import * as flujo from './flujo';

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
  e(5.5, 'formalizado', 'Formalizado', {
    area: 'ventas',
    card: 'franquiciatario',
    tipo: 'ganada',
  }),
  e(6, 'locales', 'Aprobación de locales', {
    numero: 6,
    area: 'ventas',
    funcion: 'Aprobación de locales',
    funcionClave: 'aprobacion_locales',
    card: 'sucursal',
  }),
  e(7, 'constancia', 'Constancia de arrendamiento', { numero: 7, area: 'legal', card: 'sucursal' }),
  e(8, 'transferencia', 'Transferencia a Proyectos', { numero: 8, area: 'legal', card: 'sucursal' }),
  e(9, 'levantamiento', 'Levantamiento arquitectónico', {
    paso: '26.1',
    area: 'proyectos',
    card: 'sucursal',
  }),
  e(10, 'boceto', 'Elaboración de boceto', { paso: '26.2', area: 'proyectos', card: 'sucursal' }),
  e(11, 'envio_brasil', 'Envío a Brasil', { paso: '26.3', area: 'proyectos', card: 'sucursal' }),
  e(12, 'proyecto_3d', 'Recepción del proyecto 3D', { paso: '26.4', area: 'proyectos', card: 'sucursal' }),
  e(13, 'proyecto_ejecutivo', 'Elaboración del proyecto ejecutivo', {
    paso: '26.5',
    area: 'proyectos',
    card: 'sucursal',
  }),
  e(14, 'obra', 'Obra', { paso: '26.6', area: 'proyectos', card: 'sucursal' }),
  e(14.5, 'capacitacion', 'Capacitación y evidencia de apertura', {
    paso: '26.7',
    area: 'proyectos',
    card: 'sucursal',
  }),
  e(15, 'cof', 'Circular Oferta de Franquicia (COF)', {
    numero: 9,
    area: 'legal',
    card: 'sucursal',
    carril: 'legal',
  }),
  e(16, 'contrato', 'Contrato de franquicia y apertura', {
    numero: 10,
    area: 'legal',
    card: 'sucursal',
    carril: 'legal',
  }),
  e(17, 'operando', 'Tienda en operación', {
    paso: '26.8',
    area: 'proyectos',
    card: 'sucursal',
    tipo: 'ganada',
  }),
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
  levantamiento: 4,
  boceto: 0,
  envio_brasil: 0,
  proyecto_3d: 3,
  proyecto_ejecutivo: 5,
  obra: 11,
  capacitacion: 1,
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
  card('levantamiento'),
  card('proyecto_3d'),
  card('proyecto_ejecutivo'),
  card('obra', {
    vencimiento: { tipo: 'cof', etiqueta: 'COF a Legal', fecha: '2026-11-15', dias: 12 },
  }),
  card('obra', {
    vencimiento: { tipo: 'cof', etiqueta: 'COF a Legal', fecha: '2026-10-30', dias: -4 },
  }),
  card('capacitacion', {
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

/** ?grabar: modo de los videos por rol (sin letrero de prototipo; agente con respuesta sintética). */
const PARAMS = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
const GRABANDO = PARAMS.has('grabar');
/** ?rol=: con quién se graba (perfil del marco, bandeja, botones de la ficha y agente). */
type RolVideo = 'legal' | 'ventas' | 'locales' | 'proyectos' | 'finanzas' | 'head';
const ROL_VIDEO = (PARAMS.get('rol') ?? 'legal') as RolVideo;
const PERFILES: Record<
  RolVideo,
  { id: string; nombre: string; marco: string; areas: ('ventas' | 'legal' | 'proyectos' | 'finanzas')[] }
> = {
  legal: { id: 'u-andres', nombre: 'Andrés', marco: 'Andrés (Legal)', areas: ['legal'] },
  ventas: { id: 'u-luis', nombre: 'Luis', marco: 'Luis (Ventas)', areas: ['ventas'] },
  locales: {
    id: 'u-sebastian',
    nombre: 'Sebastián',
    marco: 'Sebastián',
    areas: ['ventas'],
  },
  proyectos: { id: 'u-diego', nombre: 'Diego', marco: 'Diego', areas: ['proyectos'] },
  finanzas: { id: 'u-fernanda', nombre: 'Fernanda', marco: 'Fernanda', areas: ['finanzas'] },
  head: {
    id: 'u-regina',
    nombre: 'Regina',
    marco: 'Regina',
    areas: ['ventas', 'legal', 'proyectos', 'finanzas'],
  },
};
const PERFIL = PERFILES[ROL_VIDEO] ?? PERFILES.legal;
const NOMBRES: Record<string, string> = {
  'u-andres': 'Andrés',
  'u-sebastian': 'Sebastián',
  'u-luis': 'Luis',
  'u-diego': 'Diego',
  'u-fernanda': 'Fernanda',
  'u-regina': 'Regina',
  'u-valeria': 'Valeria',
};
const RESPUESTAS_AGENTE: Record<string, string> = {
  'flujo-ventas':
    '**Gabriela Méndez** va en la **etapa 4 · Perfilamiento, PLD y formalización** (5 de 6 listos).\n\n' +
    '- Falta: **Pago validado por Finanzas**\n- Lo demás ya está: Survey, PLD, instrucciones y comprobante\n\n' +
    'En cuanto Finanzas valide la liquidación, puedes avanzarla a la **etapa 5**.',
  'flujo-proyectos':
    '**Aguascalientes Altaria** va en **26.6 · Obra**.\n\n- Límite de apertura: **3 mar 2027** (le quedan **120 días**)\n' +
    '- Apertura estimada: **1 mar 2027**\n- Carril Legal: 0 de 5 (la COF debe firmarse antes del 1 ene)\n\n' +
    'Ojo: la fecha confirmada se le da a Legal por lo menos 5 días hábiles antes.',
  'legal-atorado':
    '**3 sucursales esperan a Legal:**\n\n| Sucursal | Paso | Falta |\n|---|---|---|\n' +
    '| Puebla Centro | 7 · Constancia | Constancia firmada y fecha límite |\n' +
    '| León Plaza Sur | 9 · COF | COF firmada |\n' +
    '| Mérida Altabrisa | 10 · Contrato | Contrato firmado |\n\n' +
    'La más urgente es **Puebla Centro**: su COF vence el 15 de noviembre.',
  'legal-cof':
    '**COF que vencen en noviembre:**\n\n- **Mérida Altabrisa** · 30 oct (ya venció)\n' +
    '- **Puebla Centro** · 15 nov\n\nEn diciembre sigue **Saltillo Centro** (4 dic).',
};
if (GRABANDO && typeof window !== 'undefined') {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    if (!String(input).includes('/api/chat')) return original(input, init);
    const texto =
      RESPUESTAS_AGENTE[
        PARAMS.get('respuesta') ?? (ROL_VIDEO === 'legal' ? 'legal-atorado' : `${ROL_VIDEO}`)
      ] ?? '';
    const partes = [
      { type: 'start', messageId: 'grabacion' },
      { type: 'text-start', id: 't' },
      { type: 'text-delta', id: 't', delta: texto },
      { type: 'text-end', id: 't' },
      { type: 'finish' },
    ];
    return new Response(partes.map((p) => `data: ${JSON.stringify(p)}\n\n`).join('') + 'data: [DONE]\n\n', {
      headers: { 'Content-Type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1' },
    });
  };
}

const marco = (children: React.ReactNode) => (
  <Marco
    perfil={{ nombre: PERFIL.marco, rol: 'admin' }}
    seccion="crm"
    visibles={['costeo', 'crm', 'sucursales']}
  >
    <div className="vitrina space-y-6">
      {!GRABANDO && (
        <p className="aviso">
          PROTOTIPO · DATOS SINTÉTICOS · nombres inventados; totales = muestra mapeada (doc 40)
        </p>
      )}
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
      >
        {GRABANDO && (ROL_VIDEO === 'ventas' || ROL_VIDEO === 'head') && <NuevoFranquiciatario />}
      </Encabezado>
      <PanelCifras
        cifras={[
          { etiqueta: 'Bloqueadas', valor: 41, tono: 'bad', nota: 'de las cards a la vista' },
          { etiqueta: 'Listas para avanzar', valor: 7, tono: 'ok', nota: 'todo validado' },
          { etiqueta: 'Candados liberados', valor: 2, tono: 'warn', nota: 'por consumir' },
          { etiqueta: 'Vencen en 14 días', valor: 4, nota: 'COF, 5 días hábiles, 120 días' },
        ]}
      />
      <PipelineGeneral
        etapas={ETAPAS}
        cards={GRABANDO ? [...cardsFlujo(), ...CARDS.map((c) => ({ ...c, muestra: false }))] : CARDS}
        totales={TOTALES}
        ahora={AHORA}
        editable
        movibles={
          GRABANDO && ROL_VIDEO !== 'head'
            ? ETAPAS.filter(
                (x) =>
                  PERFIL.areas.includes(x.area as 'ventas') &&
                  (x.clave !== 'locales' || ROL_VIDEO === 'locales') &&
                  (ROL_VIDEO !== 'locales' || x.card === 'sucursal'),
              ).map((x) => x.id)
            : undefined
        }
        tramoInicial={(PARAMS.get('tramo') as 'ventas' | null) ?? 'todos'}
      />
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
    de_etapa_actual: etapaClave === 'obra',
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

// Quién registra cada requisito en los casos de los videos (sintético).
const QUIEN: Record<string, string> = {
  ventas: 'u-luis',
  legal: 'u-andres',
  proyectos: 'u-diego',
  finanzas: 'u-fernanda',
};
const DE_LOCALES = new Set([
  'Lineamientos y formatos enviados',
  'Propuesta(s) de local',
  'Dictamen y resolución del Comité',
  'Dictamen firmado por el franquiciatario',
  'Contrato de arrendamiento firmado',
  'Solicitud de constancia a Legal',
]);
const CAMPO_DE: Record<string, string> = {
  'Ciudad de interés': 'ciudad_interes',
  'Origen de captación': 'origen',
  'Resultado territorial': 'territorio',
  'Fecha límite de apertura': 'fecha_limite_apertura',
  'Fecha estimada de apertura': 'fecha_estimada_apertura',
  'ID oficial en Jestor': 'numero_tienda_jestor',
  'Fecha confirmada de apertura': 'fecha_confirmada_apertura',
  'Fecha real de apertura': 'fecha_apertura',
};
const DOC_DE: Record<string, string> = {
  'Comprobante del apartado ($50,000 + IVA)': 'comprobante_apartado',
  'Survey completo y validado': 'survey',
  'Formato PLD firmado (copia digital)': 'pld',
  'Comprobante de liquidación del fee': 'comprobante_pago',
  'Solicitud de factura: CSF y datos fiscales': 'csf',
  'Carta de intención firmada': 'carta_intencion',
  'Propuesta(s) de local': 'propuesta_local',
  'Dictamen y resolución del Comité': 'dictamen',
  'Dictamen firmado por el franquiciatario': 'dictamen_firmado',
  'Contrato de arrendamiento firmado': 'contrato_arrendamiento',
};
const VALORES: Record<string, string> = {
  ciudad_interes: 'Querétaro',
  origen: 'Sitio web',
  territorio: 'disponible',
  fecha_limite_apertura: '2027-03-01',
  fecha_estimada_apertura: '2027-02-15',
  numero_tienda_jestor: '1184',
};
type Caso = {
  tipo: 'franquiciatario' | 'sucursal';
  id: string;
  nombre: string;
  franquiciatario: string;
  ciudad: string;
  etapa: string;
  listos: number[];
  carril?: number;
  limite?: string;
  vencimiento?: CardPipeline['vencimiento'];
};
const CASOS: Record<string, Caso> = {
  mariana: {
    tipo: 'franquiciatario',
    id: 'fr-mariana',
    nombre: 'Mariana Ortiz',
    franquiciatario: 'Mariana Ortiz',
    ciudad: 'Querétaro',
    etapa: 'pld',
    listos: [0, 1],
  },
  hector: {
    tipo: 'franquiciatario',
    id: 'fr-hector',
    nombre: 'Héctor Lira',
    franquiciatario: 'Héctor Lira',
    ciudad: 'Morelia',
    etapa: 'revision_contrato',
    listos: [0],
  },
  paola: {
    tipo: 'franquiciatario',
    id: 'fr-paola',
    nombre: 'Paola Garza',
    franquiciatario: 'Paola Garza',
    ciudad: 'Cancún',
    etapa: 'bienvenida',
    listos: [0, 1, 2, 3],
  },
  jorge: {
    tipo: 'franquiciatario',
    id: 'fr-jorge',
    nombre: 'Jorge Salinas',
    franquiciatario: 'Jorge Salinas',
    ciudad: 'Puebla',
    etapa: 'formalizado',
    listos: [],
  },
  morelia: {
    tipo: 'sucursal',
    id: 'suc-morelia',
    nombre: 'Morelia Centro',
    franquiciatario: 'Daniela Cruz',
    ciudad: 'Morelia',
    etapa: 'locales',
    listos: [0, 1],
  },
  saltillo: {
    tipo: 'sucursal',
    id: 'suc-saltillo',
    nombre: 'Saltillo Centro',
    franquiciatario: 'Lucía Ferrer',
    ciudad: 'Saltillo',
    etapa: 'capacitacion',
    listos: [0, 1, 2],
    carril: 3,
    limite: '2026-11-28',
    vencimiento: { tipo: 'limite_120', etiqueta: 'Límite de apertura', fecha: '2026-11-28', dias: 25 },
  },
  leon: {
    tipo: 'sucursal',
    id: 'suc-leon',
    nombre: 'León Plaza Sur',
    franquiciatario: 'Ana Guerrero',
    ciudad: 'León',
    etapa: 'locales',
    listos: [0, 1],
  },
};

/** Ficha de un caso de video: requisitos del catálogo con su estado (?listos= y ?hechos= por índice). */
function datosCaso(caso: Caso, p: URLSearchParams, yo: string): DatosExpediente {
  const et = etapa(p.get('etapa') ?? caso.etapa);
  const indices = (k: string, base: number[]) =>
    new Set((p.get(k) ?? base.join(',')).split(',').filter(Boolean).map(Number));
  const listos = indices('listos', caso.listos);
  const hechos = indices('hechos', []);
  const carril = Number(p.get('carril') ?? caso.carril ?? 0);
  const quien = (nombre: string, area: string) => (DE_LOCALES.has(nombre) ? 'u-sebastian' : QUIEN[area]);
  const visibles = CATALOGO.filter(([clave]) => {
    const x = etapa(clave);
    if (x.card !== caso.tipo) return false;
    if (x.carril) return caso.tipo === 'sucursal' && carril > 0;
    return x.orden <= et.orden;
  });
  let k = 0;
  let enCarril = 0;
  const requisitos = visibles.map(([clave, nombre, tipo, cumple, valida, obligatorio]) => {
    const x = etapa(clave);
    const actual = x.id === et.id;
    const i = actual ? k++ : -1;
    const deCarril = !!x.carril;
    const hecho = actual && hechos.has(i);
    const listo = (!actual && !deCarril) || (actual && listos.has(i)) || (deCarril && enCarril++ < carril);
    const campo = CAMPO_DE[nombre] ?? null;
    const por = hecho ? yo : quien(nombre, cumple);
    const cuando = hecho ? AHORA.toISOString() : hace(actual ? 2 : 20, 11, 5);
    return r(
      clave,
      nombre,
      tipo as RequisitoCard['tipo'],
      cumple as RequisitoCard['area_cumple'],
      hecho || listo ? 'validado' : 'pendiente',
      AYUDA[nombre] ?? 'Registra la evidencia que pide la etapa.',
      {
        area_valida: valida as RequisitoCard['area_valida'],
        obligatorio,
        de_etapa_actual: actual,
        funcion_cumple: DE_LOCALES.has(nombre) ? 'aprobacion_locales' : null,
        campo,
        tipo_documento: DOC_DE[nombre] ?? null,
        anticipable: deCarril,
        ...(hecho || listo
          ? {
              fecha: tipo === 'fecha' || tipo === 'firma' ? (hecho ? '2026-11-03' : '2026-10-27') : null,
              valor: campo ? (VALORES[campo] ?? null) : null,
              cumplido_por: por,
              cumplido_en: cuando,
              validado_por: por,
              validado_en: cuando,
            }
          : {
              cumplido_por: null,
              cumplido_en: null,
              validado_por: null,
              validado_en: null,
              cumplimiento_id: null,
            }),
      },
    );
  });
  const actuales = requisitos.filter((q) => q.de_etapa_actual && q.obligatorio);
  const hechosN = actuales.filter((q) => q.estado === 'validado').length;
  const falta = actuales.find((q) => q.estado !== 'validado');
  const card: CardPipeline = {
    ...CARDS[0],
    id: caso.id,
    tipo: caso.tipo,
    nombre: caso.nombre,
    franquiciatario: caso.tipo === 'sucursal' ? caso.franquiciatario : null,
    ciudad: caso.ciudad,
    etapaId: et.id,
    requisitos: {
      total: actuales.length,
      listos: hechosN,
      faltante: falta ? { nombre: falta.nombre, area: falta.area_cumple as 'ventas' } : null,
    },
    liberado: false,
    vencimiento: caso.vencimiento ?? null,
    muestra: false,
  };
  const limite = p.get('limite') ?? caso.limite ?? null;
  const archivosFr = [
    archivo('f1', 'survey', `Survey ${caso.nombre}.pdf`, 'u-luis', 12, 512, {
      tienda_id: null,
      franquiciatario_id: caso.id,
    }),
    archivo('f2', 'comprobante_apartado', `Comprobante apartado ${caso.nombre}.pdf`, 'u-luis', 25, 188, {
      tienda_id: null,
      franquiciatario_id: caso.id,
    }),
    ...(hechos.size && et.clave === 'pld'
      ? [
          archivo('f3', 'pld', `PLD firmado ${caso.nombre}.pdf`, 'u-luis', 0, 344, {
            tienda_id: null,
            franquiciatario_id: caso.id,
          }),
        ]
      : []),
  ];
  return {
    tipo: caso.tipo,
    card,
    franquiciatario: {
      id: caso.tipo === 'franquiciatario' ? caso.id : `fr-${caso.id}`,
      nombre: caso.franquiciatario,
      tipo_persona: 'fisica',
      correo: `${caso.franquiciatario.split(' ')[0].toLowerCase()}@ejemplo.mx`,
      telefono: '442 000 0000',
      ciudad_interes: caso.ciudad,
      estado_interes:
        caso.ciudad === 'Morelia' ? 'Michoacán' : caso.ciudad === 'Cancún' ? 'Quintana Roo' : caso.ciudad,
      origen: 'Sitio web',
      territorio: 'disponible',
      responsable_id: 'u-luis',
      formalizado_en: et.clave === 'formalizado' ? hace(40) : null,
    } as Franquiciatario,
    fiscal: {
      franquiciatario_id: caso.id,
      firmante: caso.franquiciatario,
      obligado_solidario: 'Ernesto Ortiz Luna',
      razon_social: null,
      rfc: 'XAXX010101000',
      regimen_fiscal: '612 · Actividad empresarial',
      codigo_postal_fiscal: '76000',
    } as FranquiciatarioFiscal,
    veSensibles: ROL_VIDEO !== 'proyectos',
    vendedores: [
      { id: 'u-luis', nombre: 'Luis' },
      { id: 'u-sebastian', nombre: 'Sebastián' },
      { id: 'u-valeria', nombre: 'Valeria' },
    ],
    sucursal:
      caso.tipo === 'sucursal'
        ? ({
            id: caso.id,
            nombre: caso.nombre,
            ciudad: caso.ciudad,
            direccion: 'Av. Madero 410, Centro',
            responsable_id: 'u-sebastian',
            franquiciatario_id: `fr-${caso.id}`,
            fecha_limite_apertura: limite,
            fecha_estimada_apertura: limite ? '2026-11-20' : null,
            fecha_confirmada_apertura: carril >= 3 ? '2026-11-20' : null,
            numero_tienda_jestor: limite ? 1184 : null,
            arquitecto_asignado: limite ? 'Arquitecta Prueba' : null,
          } as unknown as Tienda)
        : null,
    etapa: et,
    etapas: ETAPAS,
    requisitos,
    archivos:
      caso.tipo === 'franquiciatario'
        ? archivosFr
        : [
            archivo('m1', 'propuesta_local', `Propuesta local ${caso.nombre}.pdf`, 'u-sebastian', 8, 1840, {
              tienda_id: caso.id,
            }),
          ],
    notas:
      caso.id === 'suc-morelia'
        ? [
            {
              id: 'n1',
              titulo: null,
              contenido:
                'El Comité pidió fotos de la fachada y del acceso; el arrendador acepta 3 meses de gracia.',
              autor_id: 'u-sebastian',
              tienda_id: caso.id,
              prospecto_id: null,
              contacto_id: null,
              actividad_id: null,
              franquiciatario_id: null,
              creado_en: hace(1, 13, 10),
            } as unknown as Nota,
          ]
        : [],
    actividades:
      caso.id === 'suc-morelia'
        ? [
            actividad(91, 'Visita al local con Daniela', '2026-11-06', {
              tienda_id: caso.id,
              franquiciatario_id: null,
            }),
            actividad(92, 'Llamar al arrendador por la carta de gracia', '2026-11-10', {
              tienda_id: caso.id,
              franquiciatario_id: null,
              prioridad: 'High',
            }),
          ]
        : [],
    historial: [
      ...[...hechos].map((i, n) =>
        evento(
          80 + n,
          'requisito_validado',
          `Validado: ${actuales[i]?.nombre ?? ''}`,
          PERFIL.nombre,
          PERFIL.areas[0],
          AHORA.toISOString(),
        ),
      ),
      evento(
        70,
        'etapa',
        `Etapa: → ${et.numero ?? et.paso ?? ''} · ${et.nombre}`,
        'Luis',
        'ventas',
        hace(6, 12, 40),
      ),
      evento(69, 'creado', `Alta de ${caso.nombre}`, 'Luis', 'ventas', hace(30, 10, 5)),
    ],
    liberaciones: [],
    sucursales:
      caso.id === 'fr-jorge'
        ? [
            { id: 'suc-puebla', nombre: 'Puebla Centro', etapa: etapa('constancia') },
            { id: 'suc-angelopolis', nombre: 'Puebla Angelópolis', etapa: etapa('locales') },
          ]
        : caso.tipo === 'franquiciatario' && et.clave === 'bienvenida'
          ? []
          : [],
    nombres: NOMBRES,
  };
}
const AYUDA: Record<string, string> = {
  'Formato PLD firmado (copia digital)':
    'El original llega después a corporativo; aquí va la copia digital firmada.',
  'Pago validado por Finanzas': 'Finanzas confirma que el pago llegó completo a la cuenta.',
  'Pago del apartado validado por Finanzas': 'Finanzas confirma el depósito del apartado ($50,000 + IVA).',
  'Factura emitida': 'Finanzas sube la factura con los datos fiscales que mandó Ventas.',
  'Dictamen y resolución del Comité': 'El Comité revisa la propuesta del local y emite su resolución.',
  'Dictamen firmado por el franquiciatario': 'Sin dictamen firmado no se pide la constancia.',
  'Fecha real de apertura': 'El día que la tienda abre sus puertas.',
};

export function VistaExpedienteUnificado() {
  const parametros = new URLSearchParams(window.location.search);
  const casoVideo = CASOS[parametros.get('caso') ?? ''];
  if (flujo.FLUJO && (parametros.get('caso') === 'lead' || parametros.get('caso') === 'lead-suc')) {
    const d = datosFlujo(parametros.get('caso') === 'lead' ? 'franquiciatario' : 'sucursal');
    return marco(
      <>
        <Encabezado
          titulo={d.card.nombre}
          descripcion={
            d.tipo === 'sucursal'
              ? `Sucursal de ${d.franquiciatario?.nombre} · ${d.card.ciudad ?? ''}`
              : `${d.franquiciatario?.formalizado_en ? 'Franquiciatario' : 'Prospecto'} · ${d.card.ciudad ?? ''}`
          }
          migas={[
            { href: '/crm', nombre: 'CRM' },
            { href: '/crm/pipeline', nombre: 'Pipeline' },
          ]}
        />
        <ExpedienteCard
          datos={d}
          usuario={{
            id: PERFIL.id,
            nombre: PERFIL.nombre,
            areas: PERFIL.areas,
            funciones: ROL_VIDEO === 'locales' ? ['aprobacion_locales'] : [],
            esHead: ROL_VIDEO === 'head',
            desarrollador: ROL_VIDEO === 'head',
            editable: true,
          }}
          ahora={AHORA}
          pestana={parametros.get('tab') ?? undefined}
        />
      </>,
    );
  }
  const usuarioRol = {
    id: PERFIL.id,
    nombre: PERFIL.nombre,
    areas: PERFIL.areas,
    funciones: ROL_VIDEO === 'locales' ? ['aprobacion_locales'] : [],
    esHead: ROL_VIDEO === 'head',
    desarrollador: ROL_VIDEO === 'head',
    editable: true,
  };
  if (casoVideo) {
    const d = datosCaso(casoVideo, parametros, PERFIL.id);
    return marco(
      <>
        <Encabezado
          titulo={d.card.nombre}
          descripcion={
            d.tipo === 'sucursal'
              ? `Sucursal de ${casoVideo.franquiciatario} · ${casoVideo.ciudad}`
              : `Franquiciatario · ${casoVideo.ciudad}`
          }
          migas={[
            { href: '/crm', nombre: 'CRM' },
            { href: '/crm/pipeline', nombre: 'Pipeline' },
          ]}
        />
        <ExpedienteCard
          datos={d}
          usuario={usuarioRol}
          ahora={AHORA}
          pestana={parametros.get('tab') ?? undefined}
          liberarAbierto={parametros.has('liberar')}
        />
      </>,
    );
  }
  const sucursal: CardPipeline = {
    ...card('obra'),
    id: 'suc-juriquilla',
    nombre: 'Querétaro Juriquilla',
    franquiciatario: 'Mariana Ortiz',
    ciudad: 'Querétaro',
    etapaId: 'obra',
    requisitos: {
      total: 1,
      listos: 0,
      faltante: { nombre: 'Fotografías de terminación de obra', area: 'proyectos' },
    },
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
    etapa: etapa('obra'),
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
        'obra',
        'Fotografías de terminación de obra',
        'documento',
        'proyectos',
        'pendiente',
        'La obra la hace el franquiciatario; Proyectos da seguimiento y valida el cierre.',
      ),
      r(
        'proyecto_ejecutivo',
        'Paquete final del proyecto ejecutivo',
        'documento',
        'proyectos',
        'validado',
        'Elaborado y revisado a partir del proyecto 3D.',
        { cumplido_por: 'u-diego', validado_por: 'u-diego' },
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
      r(
        'contrato',
        'Contrato firmado por franquiciatario y obligado solidario',
        'firma',
        'legal',
        'pendiente',
        'Ninguna sucursal abre sin las dos firmas.',
        { de_etapa_actual: false, anticipable: true },
      ),
      r(
        'contrato',
        'Liberación para apertura',
        'validacion',
        'legal',
        'pendiente',
        'Con el contrato firmado, Legal libera la sucursal.',
        {
          de_etapa_actual: false,
          anticipable: true,
        },
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
  const hecho = new Set((parametros.get('hecho') ?? '').split(',').filter(Boolean));
  // Juriquilla: Legal registra la COF firmada en el carril Legal.
  if (hecho.has('fotos'))
    datos.requisitos = datos.requisitos.map((q) =>
      q.nombre === 'Fotografías de terminación de obra'
        ? {
            ...q,
            estado: 'validado',
            cumplido_por: 'u-diego',
            cumplido_en: AHORA.toISOString(),
            validado_por: 'u-diego',
            validado_en: AHORA.toISOString(),
            cumplimiento_id: 'cu-fotos',
          }
        : q,
    );
  if (hecho.has('fotos')) sucursal.requisitos = { total: 1, listos: 1, faltante: null };
  if (parametros.has('rol')) datos.nombres = NOMBRES;
  if (hecho.has('cof'))
    datos.requisitos = datos.requisitos.map((q) =>
      q.nombre === 'COF firmada y fecha de entrega'
        ? {
            ...q,
            estado: 'validado',
            fecha: '2026-11-03',
            cumplido_por: 'u-andres',
            cumplido_en: AHORA.toISOString(),
            validado_por: 'u-andres',
            validado_en: AHORA.toISOString(),
            cumplimiento_id: 'cu-cof',
          }
        : q,
    );
  if (parametros.get('caso') === 'constancia') {
    const conConstancia = hecho.has('constancia');
    const conFecha = hecho.has('fecha');
    const listos = Number(conConstancia) + Number(conFecha);
    Object.assign(sucursal, {
      ...card('constancia'),
      id: 'suc-puebla',
      nombre: 'Puebla Centro',
      franquiciatario: 'Jorge Salinas',
      ciudad: 'Puebla',
      etapaId: 'constancia',
      requisitos: {
        total: 2,
        listos,
        faltante:
          listos === 2
            ? null
            : {
                nombre: conConstancia ? 'Fecha límite de apertura' : 'Constancia de arrendamiento firmada',
                area: 'legal',
              },
      },
      vencimiento: { tipo: 'cof', etiqueta: 'COF firmada', fecha: '2026-11-15', dias: 12 },
      muestra: false,
    });
    const actual = { de_etapa_actual: true };
    const listo = (fecha: string) => ({
      fecha,
      cumplido_por: 'u-andres',
      cumplido_en: AHORA.toISOString(),
      validado_por: 'u-andres',
      validado_en: AHORA.toISOString(),
    });
    Object.assign(datos, {
      card: sucursal,
      franquiciatario: { id: 'fr-jorge', nombre: 'Jorge Salinas' } as Franquiciatario,
      sucursal: {
        id: 'suc-puebla',
        nombre: 'Puebla Centro',
        ciudad: 'Puebla',
        direccion: 'Av. Juárez 2915, La Paz',
        responsable_id: 'u-andres',
        franquiciatario_id: 'fr-jorge',
        fecha_limite_apertura: conFecha ? '2027-03-03' : null,
        fecha_estimada_apertura: null,
        fecha_confirmada_apertura: null,
        numero_tienda_jestor: null,
        arquitecto_asignado: null,
      } as Tienda,
      etapa: etapa('constancia'),
      requisitos: [
        r(
          'locales',
          'Dictamen firmado por el franquiciatario',
          'firma',
          'ventas',
          'validado',
          'Sin dictamen firmado no se pide la constancia.',
          {
            fecha: '2026-10-28',
            cumplido_por: 'u-sebastian',
            validado_por: 'u-sebastian',
          },
        ),
        r(
          'constancia',
          'Constancia de arrendamiento firmada',
          'firma',
          'legal',
          conConstancia ? 'validado' : 'pendiente',
          'Legal la firma el mismo día que se acredita el arrendamiento. Sube el PDF firmado.',
          conConstancia ? { ...actual, ...listo('2026-11-03') } : actual,
        ),
        r(
          'constancia',
          'Fecha límite de apertura',
          'dato',
          'legal',
          conFecha ? 'validado' : 'pendiente',
          'Por lo general, firma de la constancia + 120 días. Arranca el contador de apertura.',
          conFecha
            ? { ...actual, ...listo('2026-11-03'), campo: 'fecha_limite_apertura', valor: '2027-03-03' }
            : { ...actual, campo: 'fecha_limite_apertura' },
        ),
      ],
      archivos: [
        archivo('p1', 'dictamen_firmado', 'Dictamen local Puebla Centro.pdf', 'u-sebastian', 6, 744, {
          tienda_id: 'suc-puebla',
        }),
        ...(conConstancia
          ? [
              archivo('p2', 'constancia', 'Constancia Puebla Centro firmada.pdf', 'u-andres', 0, 402, {
                tienda_id: 'suc-puebla',
              }),
            ]
          : []),
      ],
      historial: [
        ...(conFecha
          ? [
              evento(
                23,
                'editado',
                'Fecha límite de apertura: 3 mar 2027',
                'Andrés',
                'legal',
                AHORA.toISOString(),
              ),
            ]
          : []),
        ...(conConstancia
          ? [
              evento(
                22,
                'requisito_validado',
                'Validado: Constancia de arrendamiento firmada',
                'Andrés',
                'legal',
                AHORA.toISOString(),
              ),
            ]
          : []),
        evento(
          21,
          'sucursal_creada',
          'Sucursal creada en 6 · Aprobación de locales',
          'Luis',
          'ventas',
          hace(9, 16, 2),
        ),
      ],
    });
  }
  return marco(
    <>
      <Encabezado
        titulo={sucursal.nombre}
        descripcion={`Sucursal de ${sucursal.franquiciatario} · ${sucursal.ciudad}`}
        migas={[
          { href: '/crm', nombre: 'CRM' },
          { href: '/crm/pipeline', nombre: 'Pipeline' },
        ]}
      />
      <ExpedienteCard
        datos={datos}
        usuario={
          parametros.has('rol')
            ? usuarioRol
            : {
                id: 'u-andres',
                nombre: 'Andrés',
                // ?como=proyectos (u otra área) muestra la ficha como miembro de esa área, sin ser head.
                areas: [(parametros.get('como') as 'legal' | null) ?? 'legal'],
                funciones: [],
                esHead: !parametros.get('como'),
                desarrollador: false,
                editable: true,
              }
        }
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
        avisos={GRABANDO && ROL_VIDEO === 'head' ? [...AVISOS, AVISO_EXTRA.multa] : AVISOS}
        areas={PERFIL.areas}
        todas
        movimientos={MOVIMIENTOS}
        ahora={AHORA}
        carril={{ total: 24, completos: 1 }}
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

const fila = (
  etapaId: string,
  nombre: string,
  faltante: { nombre: string; area: 'ventas' | 'legal' | 'proyectos' },
  extra: Partial<CardPipeline> = {},
) =>
  card(etapaId, {
    nombre,
    ciudad: CIUDAD_DE[nombre] ?? nombre.split(' ')[0],
    franquiciatario:
      ETAPAS.find((x) => x.id === etapaId)?.card === 'sucursal'
        ? (extra.franquiciatario ?? 'Daniela Cruz')
        : null,
    requisitos: { total: 4, listos: 2, faltante },
    muestra: false,
    vencimiento: null,
    ...extra,
  });
const CIUDAD_DE: Record<string, string> = {
  'Mariana Ortiz': 'Querétaro',
  'Raúl Benítez': 'Puebla',
  'Sofía Peralta': 'Mérida',
  'Héctor Lira': 'Morelia',
  'Paola Garza': 'Cancún',
  'Iván Montes': 'Toluca',
};
const AVISO_EXTRA: Record<string, Aviso> = {
  multa: {
    ...aviso(
      'a3',
      's7',
      'Cancún Centro: venció el límite de 120 días sin abrir; aplica la multa',
      'finanzas',
    ),
    tipo: 'limite_vencido',
    fecha_objetivo: '2026-10-31',
  },
  transferencia: {
    ...aviso(
      'a4',
      's6',
      'Toluca Metepec ya es de Proyectos: captura la fecha estimada de apertura',
      'proyectos',
    ),
    tipo: 'transferencia',
  },
};
/** Bandeja de Mis pendientes según ?rol= (solo en modo grabación). */
function bandejaRol() {
  const f = (n: string) => ({ nombre: n, area: 'finanzas' as unknown as 'ventas' });
  switch (ROL_VIDEO) {
    case 'ventas':
      return {
        descripcion: 'Lo que le toca a Ventas, por urgencia.',
        avisos: [],
        vencidos: [
          {
            ...venc('f9', 'Iván Montes', 'pld_original' as never, 'ventas', '2026-11-07'),
            franquiciatario_id: 'f9',
          },
        ],
        toca: [
          fila(
            'pld',
            'Mariana Ortiz',
            { nombre: 'Formato PLD firmado (copia digital)', area: 'ventas' },
            {
              requisitos: {
                total: 6,
                listos: 2,
                faltante: { nombre: 'Formato PLD firmado (copia digital)', area: 'ventas' },
              },
            },
          ),
          fila('contacto', 'Raúl Benítez', { nombre: 'Fecha de primera reunión', area: 'ventas' }),
          fila('recepcion', 'Sofía Peralta', { nombre: 'Resultado territorial', area: 'ventas' }),
          fila(
            'transferencia',
            'Toluca Metepec',
            { nombre: 'ID oficial en Jestor', area: 'ventas' },
            { franquiciatario: 'Iván Montes' },
          ),
        ],
        propias: [
          fila('pld', 'Mariana Ortiz', { nombre: 'Formato PLD firmado (copia digital)', area: 'ventas' }),
          fila('contacto', 'Raúl Benítez', { nombre: 'Fecha de primera reunión', area: 'ventas' }),
          fila('revision_contrato', 'Héctor Lira', f('Pago del apartado validado por Finanzas')),
          fila('recepcion', 'Sofía Peralta', { nombre: 'Resultado territorial', area: 'ventas' }),
        ],
        listas: [
          fila(
            'bienvenida',
            'Paola Garza',
            { nombre: '', area: 'ventas' },
            { requisitos: { total: 5, listos: 5, faltante: null } },
          ),
        ],
        vendedor: true,
      };
    case 'locales':
      return {
        descripcion: 'Lo que le toca a Aprobación de locales, por urgencia.',
        avisos: [],
        vencidos: [],
        toca: [
          fila('locales', 'Morelia Centro', { nombre: 'Dictamen y resolución del Comité', area: 'ventas' }),
          fila(
            'locales',
            'Cancún Centro',
            { nombre: 'Propuesta(s) de local', area: 'ventas' },
            { franquiciatario: 'Paola Garza' },
          ),
          fila(
            'locales',
            'Puebla Angelópolis',
            { nombre: 'Dictamen firmado por el franquiciatario', area: 'ventas' },
            {
              franquiciatario: 'Jorge Salinas',
              requisitos: {
                total: 4,
                listos: 3,
                faltante: { nombre: 'Dictamen firmado por el franquiciatario', area: 'ventas' },
              },
            },
          ),
          fila(
            'constancia',
            'Toluca Norte',
            { nombre: 'Solicitud de constancia a Legal', area: 'ventas' },
            { franquiciatario: 'Iván Montes' },
          ),
        ],
        propias: [],
        listas: [],
        vendedor: false,
      };
    case 'proyectos':
      return {
        descripcion: 'Lo que le toca a Proyectos, por urgencia.',
        avisos: [AVISOS[1], AVISO_EXTRA.transferencia],
        vencidos: [
          { ...VENCIMIENTOS[1], area: 'proyectos' as const },
          { ...VENCIMIENTOS[3], area: 'proyectos' as const },
        ],
        toca: [
          fila(
            'obra',
            'Querétaro Juriquilla',
            { nombre: 'Fotografías de terminación de obra', area: 'proyectos' },
            { franquiciatario: 'Mariana Ortiz' },
          ),
          fila(
            'transferencia',
            'Toluca Metepec',
            { nombre: 'Fecha estimada de apertura', area: 'proyectos' },
            { franquiciatario: 'Iván Montes' },
          ),
          fila(
            'levantamiento',
            'León Plaza Sur',
            { nombre: 'Documentación del levantamiento arquitectónico', area: 'proyectos' },
            { franquiciatario: 'Ana Guerrero' },
          ),
          fila(
            'capacitacion',
            'Saltillo Centro',
            { nombre: 'Fecha real de apertura', area: 'proyectos' },
            { franquiciatario: 'Lucía Ferrer' },
          ),
        ],
        propias: [],
        listas: [],
        vendedor: false,
      };
    case 'finanzas':
      return {
        descripcion: 'Lo que le toca a Finanzas, por urgencia.',
        avisos: [AVISO_EXTRA.multa],
        vencidos: [{ ...venc('s7', 'Cancún Centro', 'limite_vencido', 'finanzas', '2026-10-31') }],
        toca: [
          fila('pld', 'Mariana Ortiz', f('Pago validado por Finanzas')),
          fila('revision_contrato', 'Héctor Lira', f('Pago del apartado validado por Finanzas')),
          fila('bienvenida', 'Paola Garza', f('Factura emitida')),
        ],
        propias: [],
        listas: [],
        vendedor: false,
      };
    default:
      return null;
  }
}

export function VistaPendientesCrm() {
  const de = (clave: string) => CARDS.filter((c) => c.etapaId === clave);
  const b = GRABANDO ? (flujo.FLUJO ? pendientesFlujo() : bandejaRol()) : null;
  if (b)
    return marco(
      <>
        {encabezado('Mis pendientes', b.descripcion)}
        <VistaPendientes
          etapas={ETAPAS}
          avisos={b.avisos}
          vencidos={b.vencidos}
          porValidar={[]}
          totalPorValidar={0}
          listas={b.listas}
          totalListas={b.listas.length}
          bloqueadas={b.toca.length + 9}
          propias={b.propias}
          tocaRegistrar={b.toca}
          totalTocaRegistrar={b.toca.length}
          areas={PERFIL.areas}
          todas={false}
          vendedor={b.vendedor}
        />
      </>,
    );
  return marco(
    <>
      {encabezado('Mis pendientes', 'Lo que le toca a Legal, por urgencia.')}
      <VistaPendientes
        etapas={ETAPAS}
        avisos={AVISOS}
        vencidos={VENCIMIENTOS.filter((v) => v.dias <= 7)}
        porValidar={GRABANDO ? [] : [...de('constancia'), ...de('bienvenida')]}
        totalPorValidar={GRABANDO ? 0 : 3}
        listas={CARDS.filter((c) => c.requisitos.listos >= c.requisitos.total || c.liberado).slice(0, 8)}
        totalListas={12}
        bloqueadas={63}
        propias={[]}
        tocaRegistrar={
          GRABANDO
            ? [
                card('constancia', {
                  id: 'suc-puebla',
                  nombre: 'Puebla Centro',
                  franquiciatario: 'Jorge Salinas',
                  ciudad: 'Puebla',
                  requisitos: { total: 2, listos: 0, faltante: FALTANTE.constancia },
                  vencimiento: { tipo: 'cof', etiqueta: 'COF firmada', fecha: '2026-11-15', dias: 12 },
                  muestra: false,
                }),
                card('obra', {
                  id: 'suc-juriquilla',
                  nombre: 'Querétaro Juriquilla',
                  franquiciatario: 'Mariana Ortiz',
                  ciudad: 'Querétaro',
                  requisitos: { total: 4, listos: 1, faltante: FALTANTE.cof },
                  vencimiento: { tipo: 'cof', etiqueta: 'COF firmada', fecha: '2026-11-15', dias: 12 },
                  muestra: false,
                }),
                card('cof', {
                  nombre: 'León Plaza Sur',
                  franquiciatario: 'Ana Guerrero',
                  ciudad: 'León',
                  requisitos: { total: 2, listos: 1, faltante: FALTANTE.cof },
                  muestra: false,
                }),
                card('contrato', {
                  nombre: 'Mérida Altabrisa',
                  franquiciatario: 'Rodrigo Pech',
                  ciudad: 'Mérida',
                  requisitos: { total: 3, listos: 1, faltante: FALTANTE.contrato },
                  muestra: false,
                }),
              ]
            : CARDS.filter((c) => c.etapaId === 'obra' || c.etapaId === 'constancia')
        }
        totalTocaRegistrar={GRABANDO ? 4 : 14}
        areas={['legal']}
        todas={false}
        vendedor={!GRABANDO}
      />
    </>,
  );
}

export function VistaVencimientosCrm() {
  if (flujo.FLUJO) {
    const v = vencimientosFlujo();
    return marco(
      <>
        {encabezado(
          'Vencimientos',
          'Cuándo hay que actuar en cada sucursal. Los días hábiles saltan fines de semana y festivos.',
        )}
        <VistaVencimientos
          lista={v.lista}
          avisos={v.avisos}
          atendidos={v.atendidos}
          areas={PERFIL.areas}
          todas={false}
        />
      </>,
    );
  }
  return marco(
    <>
      {encabezado(
        'Vencimientos',
        'Cuándo hay que actuar en cada sucursal. Los días hábiles saltan fines de semana y festivos.',
      )}
      <VistaVencimientos
        lista={
          GRABANDO && ROL_VIDEO !== 'legal'
            ? [...VENCIMIENTOS, venc('s7', 'Cancún Centro', 'limite_vencido', 'finanzas', '2026-10-31')].sort(
                (a, b) => a.dias - b.dias,
              )
            : VENCIMIENTOS
        }
        avisos={
          GRABANDO && ROL_VIDEO === 'finanzas'
            ? [AVISO_EXTRA.multa]
            : GRABANDO && ROL_VIDEO === 'proyectos'
              ? [AVISOS[1], AVISO_EXTRA.transferencia]
              : AVISOS
        }
        atendidos={[
          {
            ...aviso('a0', 's1', 'Mérida Altabrisa: la COF debe estar firmada antes del 30 oct', 'legal'),
            atendido_por: 'u-andres',
            atendido_en: hace(4, 9, 20),
            quien: 'Andrés',
          },
        ]}
        areas={PERFIL.areas}
        todas={!GRABANDO || ROL_VIDEO === 'head' || ROL_VIDEO === 'legal'}
      />
    </>,
  );
}

export function VistaBitacoraCrm() {
  if (flujo.FLUJO) {
    const est = flujo.leer();
    return marco(
      <>
        {encabezado(
          'Bitácora',
          'Cada movimiento con nombre, área, fecha y hora (Ciudad de México). Nadie la puede editar ni borrar.',
        )}
        <VistaBitacora
          filas={est.historial.map((h) => ({
            ...evento(h.id, h.accion as Historial['accion'], h.resumen, h.actor, h.area, h.fecha, {
              motivo: h.motivo ?? null,
            }),
            tienda_id: h.card === flujo.SUC.id ? h.card : null,
            franquiciatario_id: h.card === flujo.LEAD.id ? h.card : null,
          }))}
          total={est.historial.length}
          pagina={1}
          paginas={1}
          p={{}}
          personas={Object.entries(NOMBRES).map(([user_id, nombre]) => ({ user_id, nombre }))}
        />
      </>,
    );
  }
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
    ...(GRABANDO
      ? [
          { user_id: 'u6', nivel: 'editor', nombre: 'Fernanda' },
          { user_id: 'u7', nivel: 'editor', nombre: 'Valeria' },
        ]
      : []),
  ];
  const m = (user_id: string, area: Membresia['area'], rol: Membresia['rol'], funciones: string[] = []) =>
    ({ user_id, area, rol, funciones, version: 1 }) as unknown as Membresia;
  const ms = [
    m('u1', 'ventas', 'head'),
    m('u4', 'ventas', 'miembro', GRABANDO ? ['aprobacion_locales'] : []),
    m('u2', 'legal', 'head'),
    m('u3', 'proyectos', 'head'),
    ...(GRABANDO ? [m('u6', 'finanzas', 'miembro'), m('u7', 'ventas', 'miembro')] : []),
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

// Catálogo de requisitos igual a la semilla (migraciones 32 y 50): [etapa, nombre, tipo, registra, valida, candado].
const CATALOGO: [string, string, string, string, string, boolean][] = [
  ['recepcion', 'Contacto (correo o teléfono)', 'dato', 'ventas', 'ventas', true],
  ['recepcion', 'Ciudad de interés', 'dato', 'ventas', 'ventas', true],
  ['recepcion', 'Origen de captación', 'dato', 'ventas', 'ventas', true],
  ['recepcion', 'Resultado territorial', 'validacion', 'ventas', 'ventas', true],
  ['recepcion', 'Vendedor asignado', 'dato', 'ventas', 'ventas', true],
  ['contacto', 'Fecha de primera reunión', 'fecha', 'ventas', 'ventas', true],
  ['contacto', 'Información comercial enviada (plantilla única)', 'fecha', 'ventas', 'ventas', true],
  ['revision_contrato', 'Comprobante del apartado ($50,000 + IVA)', 'documento', 'ventas', 'ventas', true],
  [
    'revision_contrato',
    'Pago del apartado validado por Finanzas',
    'validacion',
    'finanzas',
    'finanzas',
    true,
  ],
  ['revision_contrato', 'Solicitud a Legal del envío del contrato', 'fecha', 'ventas', 'ventas', true],
  ['revision_contrato', 'Contrato enviado al prospecto', 'fecha', 'legal', 'legal', true],
  ['pld', 'Confirmación de interés', 'fecha', 'ventas', 'ventas', true],
  ['pld', 'Survey completo y validado', 'documento', 'ventas', 'ventas', true],
  ['pld', 'Formato PLD firmado (copia digital)', 'documento', 'ventas', 'ventas', true],
  ['pld', 'Instrucciones de pago enviadas', 'fecha', 'ventas', 'ventas', true],
  ['pld', 'Comprobante de liquidación del fee', 'documento', 'ventas', 'ventas', true],
  ['pld', 'Pago validado por Finanzas', 'validacion', 'finanzas', 'finanzas', true],
  ['bienvenida', 'Correo de bienvenida enviado', 'fecha', 'ventas', 'ventas', true],
  ['bienvenida', 'Carta de intención firmada', 'firma', 'legal', 'legal', true],
  ['bienvenida', 'Solicitud de factura: CSF y datos fiscales', 'documento', 'ventas', 'ventas', true],
  ['bienvenida', 'PLD original recibido en corporativo', 'fecha', 'ventas', 'ventas', true],
  ['bienvenida', 'Factura emitida', 'documento', 'finanzas', 'finanzas', false],
  ['locales', 'Lineamientos y formatos enviados', 'fecha', 'ventas', 'ventas', true],
  ['locales', 'Propuesta(s) de local', 'documento', 'ventas', 'ventas', true],
  ['locales', 'Dictamen y resolución del Comité', 'documento', 'ventas', 'ventas', true],
  ['locales', 'Dictamen firmado por el franquiciatario', 'firma', 'ventas', 'ventas', true],
  ['constancia', 'Contrato de arrendamiento firmado', 'documento', 'ventas', 'ventas', true],
  ['constancia', 'Solicitud de constancia a Legal', 'fecha', 'ventas', 'ventas', true],
  ['constancia', 'Constancia de arrendamiento firmada', 'firma', 'legal', 'legal', true],
  ['constancia', 'Fecha límite de apertura', 'dato', 'legal', 'legal', true],
  ['transferencia', 'Transferencia a Proyectos habilitada', 'validacion', 'legal', 'legal', true],
  ['transferencia', 'Fecha estimada de apertura', 'dato', 'proyectos', 'proyectos', true],
  ['transferencia', 'ID oficial en Jestor', 'dato', 'ventas', 'ventas', true],
  [
    'levantamiento',
    'Documentación del levantamiento arquitectónico',
    'documento',
    'proyectos',
    'proyectos',
    true,
  ],
  ['boceto', 'Boceto de distribución', 'documento', 'proyectos', 'proyectos', true],
  ['envio_brasil', 'Fecha de envío a Brasil', 'fecha', 'proyectos', 'proyectos', true],
  ['envio_brasil', 'Evidencia del envío a Brasil', 'documento', 'proyectos', 'proyectos', true],
  ['proyecto_3d', 'Archivos del proyecto 3D', 'documento', 'proyectos', 'proyectos', true],
  ['proyecto_ejecutivo', 'Paquete final del proyecto ejecutivo', 'documento', 'proyectos', 'proyectos', true],
  ['obra', 'Fotografías de terminación de obra', 'documento', 'proyectos', 'proyectos', true],
  ['capacitacion', 'Viáticos y hospedaje del capacitador', 'documento', 'proyectos', 'proyectos', true],
  ['capacitacion', 'Video o fotografías de la apertura', 'documento', 'proyectos', 'proyectos', true],
  ['capacitacion', 'Fecha real de apertura', 'dato', 'proyectos', 'proyectos', true],
  ['cof', 'COF enviada al franquiciatario', 'fecha', 'legal', 'legal', true],
  ['cof', 'COF firmada y fecha de entrega', 'firma', 'legal', 'legal', true],
  ['contrato', 'Fecha confirmada de apertura', 'dato', 'proyectos', 'proyectos', true],
  ['contrato', 'Contrato firmado por franquiciatario y obligado solidario', 'firma', 'legal', 'legal', true],
  ['contrato', 'Liberación para apertura', 'validacion', 'legal', 'legal', true],
];
export const REQUISITOS_PROCESO = CATALOGO.map(([etapa_id, nombre, tipo, cumple, valida, obligatorio]) => ({
  etapa_id,
  nombre,
  tipo,
  area_cumple: cumple,
  area_valida: valida,
  obligatorio,
})) as RequisitoProceso[];

export function VistaProcesoCrm() {
  return marco(
    <>
      {encabezado(
        'Proceso',
        'Del lead a la apertura: qué se hace en cada etapa, qué se registra, quién lo hace y qué sigue.',
      )}
      <VistaProceso
        pasos={pasosProceso(ETAPAS, REQUISITOS_PROCESO, TOTALES)}
        inicial={new URLSearchParams(window.location.search).get('paso') ?? undefined}
      />
    </>,
  );
}

export function VistaCarrilLegalCrm() {
  const fila = (
    id: string,
    nombre: string,
    franq: string,
    etapaClave: string,
    estado: FilaCarril['estado'],
    fecha: string,
    fechaTexto: string,
  ): FilaCarril => ({
    id,
    nombre,
    franquiciatario: franq,
    etapa: ETAPAS.find((x) => x.clave === etapaClave)!,
    estado,
    fecha,
    fechaTexto,
    dias: Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse('2026-11-03T00:00:00Z')) / 86_400_000),
  });
  return marco(
    <>
      {encabezado(
        'COF y contrato',
        'El carril Legal de cada sucursal, en paralelo a Proyectos. Ninguna abre sin los cinco hitos.',
      )}
      <VistaCarrilLegal
        filas={[
          ...carrilFlujo(),
          fila(
            's1',
            'Mérida Altabrisa',
            'Elena Robles',
            'obra',
            'por_enviar',
            '2026-10-30',
            'COF firmada a más tardar',
          ),
          fila(
            's2',
            'Puebla Centro',
            'Raúl Benítez',
            'proyecto_ejecutivo',
            'por_enviar',
            '2026-12-20',
            'COF firmada a más tardar',
          ),
          fila(
            's3',
            'Querétaro Juriquilla',
            'Mariana Ortiz',
            'obra',
            'cof_enviada',
            '2026-11-15',
            'COF firmada a más tardar',
          ),
          fila(
            's4',
            'León Plaza Sur',
            'Jorge Salinas',
            'obra',
            'cof_firmada',
            '2027-01-15',
            'Apertura estimada',
          ),
          fila(
            's5',
            'Saltillo Centro',
            'Daniela Cruz',
            'capacitacion',
            'contrato_firmado',
            '2026-11-20',
            'Apertura confirmada',
          ),
          fila(
            's6',
            'Toluca Metepec',
            'Iván Montes',
            'capacitacion',
            'liberada',
            '2026-11-08',
            'Apertura confirmada',
          ),
          fila(
            's7',
            'Cancún Centro',
            'Paola Garza',
            'levantamiento',
            'por_enviar',
            '2027-03-01',
            'COF firmada a más tardar',
          ),
        ]}
      />
    </>,
  );
}

export function VistaEntradasPipelineCrm() {
  const entradas = calcularTramos(ETAPAS).map((t) => {
    const n = (clave: string) => TOTALES[clave] ?? 0;
    const total = t.etapas.reduce((a, e) => a + n(e.clave), 0);
    return {
      clave: t.clave,
      nombre: t.nombre,
      area: t.area,
      total,
      bloqueadas: t.clave === 'cierre' ? 0 : Math.round(total * 0.93),
      listas: t.clave === 'cierre' ? 0 : Math.round(total * 0.05),
      principales: t.etapas
        .map((e) => ({
          nombre: e.nombre,
          numero: e.numero ? String(e.numero) : (e.paso ?? ''),
          n: n(e.clave),
        }))
        .filter((e) => e.n > 0)
        .sort((a, b) => b.n - a.n)
        .slice(0, 3),
    };
  });
  return marco(
    <>
      {encabezado('Pipeline', 'Elige un tramo para ver sus cards, o abre el tablero completo.')}
      <VistaEntradasPipeline tramos={entradas} carril={{ total: 24, completos: 1 }} />
    </>,
  );
}

// ── Modo ?flujo: el lead del video general ───────────────────────────────────────────────────────────────
const CAMPO_FLUJO: Record<string, string> = {
  ...CAMPO_DE,
  'Contacto (correo o teléfono)': 'correo',
  'Vendedor asignado': 'responsable_id',
};
const AYUDA_FLUJO: Record<string, string> = {
  'Contacto (correo o teléfono)': 'Se cumple al registrar el lead con su correo o teléfono.',
  'Ciudad de interés': 'Ciudad o zona donde quiere abrir.',
  'Origen de captación': 'Por dónde llegó: sitio web, evento, referido…',
  'Resultado territorial': 'Disponible, restringida, exclusiva o bloqueada.',
  'Vendedor asignado': 'Quien registra el lead queda como vendedor.',
  'Fecha de primera reunión': 'Cuándo se presentó el modelo de franquicia.',
  'Información comercial enviada (plantilla única)': 'Correo institucional con la plantilla única.',
  'Comprobante del apartado ($50,000 + IVA)':
    'Ventas sube el comprobante; las instrucciones van con la plantilla de Finanzas.',
  'Pago del apartado validado por Finanzas': 'Finanzas confirma que el apartado llegó completo.',
  'Solicitud a Legal del envío del contrato':
    'Correo a Legal con datos, comprobante y la confirmación de Finanzas.',
  'Contrato enviado al prospecto': 'Legal envía el contrato y registra la fecha. Ventas no lo comparte.',
  'Confirmación de interés': 'El prospecto quiere liquidar el fee inicial.',
  'Survey completo y validado': 'Firmante, obligado solidario y documentos completos, legibles y vigentes.',
  'Formato PLD firmado (copia digital)': 'A puño y letra y con pluma azul. El original va al corporativo.',
  'Instrucciones de pago enviadas': 'Solo con Survey y PLD completos, con la plantilla de Finanzas.',
  'Comprobante de liquidación del fee': 'Comprobante del pago restante (o del total).',
  'Pago validado por Finanzas': 'Con la liquidación validada, el prospecto pasa a franquiciatario.',
  'Correo de bienvenida enviado': 'Con copia a Legal, Finanzas y los responsables internos.',
  'Carta de intención firmada': 'Legal la arma con el Survey y se firma el mismo día del pago.',
  'Solicitud de factura: CSF y datos fiscales': 'CSF y datos de facturación para que Finanzas facture.',
  'PLD original recibido en corporativo': 'Fecha en que llegó el original.',
  'Factura emitida': 'Finanzas sube la factura.',
  'Lineamientos y formatos enviados': 'Video tutorial y formatos oficiales para proponer locales.',
  'Propuesta(s) de local': 'Las opciones que manda el franquiciatario.',
  'Contrato de arrendamiento firmado': 'Se adjunta a la solicitud de constancia.',
  'Solicitud de constancia a Legal': 'Con dictamen firmado y contrato de arrendamiento.',
  'Constancia de arrendamiento firmada': 'Se firma el mismo día que se acredita el arrendamiento.',
  'Fecha límite de apertura': 'Por lo general, firma de la constancia + 120 días.',
  'Transferencia a Proyectos habilitada': 'Legal habilita la transferencia formal a Proyectos.',
  'Fecha estimada de apertura': 'Proyectos la registra y la mantiene actualizada.',
  'ID oficial en Jestor': 'Aprobación de locales da de alta la sucursal en Jestor.',
  'Documentación del levantamiento arquitectónico': 'Completa y suficiente para el boceto.',
  'Boceto de distribución': 'El archivo que se envía a Brasil.',
  'Fecha de envío a Brasil': 'Cuándo se mandó el boceto a Brasil.',
  'Evidencia del envío a Brasil': 'Captura o correo con la sucursal y la fecha.',
  'Archivos del proyecto 3D': 'El proyecto 3D que entregó Brasil.',
  'Viáticos y hospedaje del capacitador': 'Comprobantes de la logística de la capacitación.',
  'Video o fotografías de la apertura': 'Evidencia de la apertura.',
  'COF enviada al franquiciatario': 'Al menos dos meses antes de la apertura (LFPPI).',
  'COF firmada y fecha de entrega': 'Sin COF firmada no se envía el contrato.',
  'Fecha confirmada de apertura': 'Proyectos la confirma a Legal al menos 5 días hábiles antes.',
  'Contrato firmado por franquiciatario y obligado solidario': 'Ninguna sucursal abre sin las dos firmas.',
  'Liberación para apertura': 'Con el contrato firmado, Legal libera la sucursal.',
};
const DOC_FLUJO: Record<string, string> = {
  ...DOC_DE,
  'Factura emitida': 'factura',
  'Constancia de arrendamiento firmada': 'constancia',
  'Documentación del levantamiento arquitectónico': 'levantamiento',
  'Boceto de distribución': 'boceto',
  'Evidencia del envío a Brasil': 'evidencia_brasil',
  'Archivos del proyecto 3D': 'proyecto_3d',
  'Paquete final del proyecto ejecutivo': 'proyecto_ejecutivo',
  'Fotografías de terminación de obra': 'fotos_obra',
  'Viáticos y hospedaje del capacitador': 'viaticos_capacitador',
  'Video o fotografías de la apertura': 'evidencia_apertura',
  'COF firmada y fecha de entrega': 'cof',
  'Contrato firmado por franquiciatario y obligado solidario': 'contrato_franquicia',
};
const listoFlujo = (q: RequisitoCard) => q.estado === 'validado' || q.estado === 'no_aplica';

function requisitosFlujo(tipo: 'franquiciatario' | 'sucursal', et: EtapaGeneral, est: flujo.EstadoFlujo) {
  const conCarril = tipo === 'sucursal' && et.orden >= etapa('levantamiento').orden;
  const fuente = tipo === 'franquiciatario' ? est.campos : est.camposS;
  return CATALOGO.filter(([clave]) => {
    const x = etapa(clave);
    if (x.card !== tipo) return false;
    if (x.carril) return conCarril;
    return x.orden <= et.orden;
  }).map(([clave, nombre, tp, cumple, valida, obligatorio], i): RequisitoCard => {
    const x = etapa(clave);
    const campo = CAMPO_FLUJO[nombre] ?? null;
    const reg = est.req[nombre];
    const valor = campo ? (fuente[campo] ?? null) : null;
    const hecho = campo ? !!valor : !!reg;
    const por = campo ? (est.quienCampo[campo] ?? 'u-luis') : (reg?.por ?? null);
    const en = reg?.en ?? flujo.AHORA_FLUJO.toISOString();
    return {
      requisito_id: nombre,
      clave: nombre,
      etapa_id: x.id,
      etapa_clave: x.clave,
      etapa_orden: x.orden,
      de_etapa_actual: x.id === et.id,
      nombre,
      tipo: tp as RequisitoCard['tipo'],
      area_cumple: cumple as RequisitoCard['area_cumple'],
      area_valida: valida as RequisitoCard['area_valida'],
      funcion_cumple: DE_LOCALES.has(nombre) ? 'aprobacion_locales' : null,
      obligatorio,
      campo,
      tipo_documento: DOC_FLUJO[nombre] ?? null,
      depende_de: [],
      anticipable: !!x.carril,
      orden: i,
      ayuda: AYUDA_FLUJO[nombre] ?? AYUDA[nombre] ?? 'Registra la evidencia que pide la etapa.',
      estado: hecho ? 'validado' : 'pendiente',
      cumplimiento_id: hecho ? nombre : null,
      valor:
        campo === 'territorio' && valor
          ? (TERRITORIOS[valor as keyof typeof TERRITORIOS] ?? valor)
          : campo === 'responsable_id' && valor
            ? (NOMBRES[valor] ?? valor)
            : (valor ?? reg?.valor ?? null),
      fecha: reg?.fecha ?? null,
      archivo_id: reg?.archivo ?? null,
      nota: reg?.nota ?? null,
      cumplido_por: hecho ? por : null,
      cumplido_en: hecho ? en : null,
      validado_por: hecho ? por : null,
      validado_en: hecho ? en : null,
    } as RequisitoCard;
  });
}

const fechaCortaFlujo = (s: string) =>
  new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${s}T00:00:00Z`),
  );
const diasDe = (s: string) =>
  Math.round((Date.parse(`${s}T00:00:00Z`) - Date.parse('2026-11-03T00:00:00Z')) / 86_400_000);
const menosMeses = (s: string, m: number) => {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - m);
  return d.toISOString().slice(0, 10);
};

function cardFlujo(tipo: 'franquiciatario' | 'sucursal', est: flujo.EstadoFlujo): CardPipeline | null {
  if (!est.creado || (tipo === 'sucursal' && !est.sucursal)) return null;
  const et = etapa(tipo === 'franquiciatario' ? est.etapaF : est.etapaS!);
  const rs = requisitosFlujo(tipo, et, est);
  const actuales = rs.filter((q) => q.de_etapa_actual && q.obligatorio);
  const falta = actuales.find((q) => !listoFlujo(q));
  const limite = est.camposS.fecha_limite_apertura;
  return {
    ...CARDS[0],
    id: tipo === 'franquiciatario' ? flujo.LEAD.id : flujo.SUC.id,
    tipo,
    nombre: tipo === 'franquiciatario' ? (est.campos.nombre ?? flujo.LEAD.nombre) : est.sucursal!,
    franquiciatario: tipo === 'sucursal' ? (est.campos.nombre ?? flujo.LEAD.nombre) : null,
    ciudad: est.camposS.ciudad ?? est.campos.ciudad_interes ?? flujo.LEAD.ciudad,
    etapaId: et.id,
    requisitos: {
      total: actuales.length,
      listos: actuales.filter(listoFlujo).length,
      faltante: falta ? { nombre: falta.nombre, area: falta.area_cumple as 'ventas' } : null,
    },
    liberado: false,
    vencimiento:
      tipo === 'sucursal' && limite && et.tipo === 'abierta'
        ? { tipo: 'limite_120', etiqueta: 'Límite de apertura', fecha: limite, dias: diasDe(limite) }
        : null,
    archivos: est.archivos.filter(
      (a) => a.card === (tipo === 'franquiciatario' ? flujo.LEAD.id : flujo.SUC.id),
    ).length,
    notas: 0,
    ultimo: est.historial[0]
      ? { actor: est.historial[0].actor, fecha: est.historial[0].fecha }
      : { actor: 'Luis', fecha: flujo.AHORA_FLUJO.toISOString() },
    muestra: false,
  };
}

function cardsFlujo() {
  if (!flujo.FLUJO) return [];
  const est = flujo.leer();
  return [cardFlujo('franquiciatario', est), cardFlujo('sucursal', est)].filter(
    (c): c is CardPipeline => !!c,
  );
}

function datosFlujo(tipo: 'franquiciatario' | 'sucursal'): DatosExpediente {
  const est = flujo.leer();
  const card = cardFlujo(tipo, est)!;
  const et = etapa(card.etapaId);
  const id = card.id;
  const c = est.campos;
  const cs = est.camposS;
  return {
    tipo,
    card,
    franquiciatario: {
      id: flujo.LEAD.id,
      nombre: c.nombre ?? flujo.LEAD.nombre,
      tipo_persona: (c.tipo_persona as 'fisica') ?? null,
      correo: c.correo ?? null,
      telefono: c.telefono ?? null,
      ciudad_interes: c.ciudad_interes ?? null,
      estado_interes: c.estado_interes ?? null,
      origen: c.origen ?? null,
      territorio: (c.territorio as 'disponible') ?? null,
      responsable_id: c.responsable_id ?? 'u-luis',
      formalizado_en: est.etapaF === 'formalizado' ? flujo.AHORA_FLUJO.toISOString() : null,
    } as Franquiciatario,
    fiscal: {
      franquiciatario_id: flujo.LEAD.id,
      firmante: c.firmante ?? null,
      obligado_solidario: c.obligado_solidario ?? null,
      razon_social: c.razon_social ?? null,
      rfc: c.rfc ?? null,
      regimen_fiscal: c.regimen_fiscal ?? null,
      codigo_postal_fiscal: c.codigo_postal_fiscal ?? null,
    } as FranquiciatarioFiscal,
    veSensibles: ROL_VIDEO !== 'proyectos',
    vendedores: [
      { id: 'u-luis', nombre: 'Luis' },
      { id: 'u-valeria', nombre: 'Valeria' },
    ],
    sucursal:
      tipo === 'sucursal'
        ? ({
            id,
            nombre: card.nombre,
            ciudad: cs.ciudad ?? c.ciudad_interes ?? flujo.LEAD.ciudad,
            direccion: cs.direccion ?? null,
            responsable_id: 'u-sebastian',
            franquiciatario_id: flujo.LEAD.id,
            fecha_limite_apertura: cs.fecha_limite_apertura ?? null,
            fecha_estimada_apertura: cs.fecha_estimada_apertura ?? null,
            fecha_confirmada_apertura: cs.fecha_confirmada_apertura ?? null,
            fecha_apertura: cs.fecha_apertura ?? null,
            numero_tienda_jestor: cs.numero_tienda_jestor ?? null,
            arquitecto_asignado: cs.arquitecto_asignado ?? null,
          } as unknown as Tienda)
        : null,
    etapa: et,
    etapas: ETAPAS,
    requisitos: requisitosFlujo(tipo, et, est),
    archivos: est.archivos
      .filter((a) => a.card === id)
      .map((a) =>
        archivo(a.id, a.tipo, a.nombre, a.por, 0, 380, {
          tienda_id: tipo === 'sucursal' ? id : null,
          franquiciatario_id: tipo === 'franquiciatario' ? id : null,
          subido_en: a.en,
        }),
      ),
    notas: [],
    actividades: [],
    historial: est.historial
      .filter((h) => h.card === id)
      .map((h) =>
        evento(h.id, h.accion as Historial['accion'], h.resumen, h.actor, h.area, h.fecha, {
          motivo: h.motivo ?? null,
        }),
      ),
    liberaciones: [],
    sucursales:
      tipo === 'franquiciatario' && est.sucursal && est.etapaS
        ? [{ id: flujo.SUC.id, nombre: est.sucursal, etapa: etapa(est.etapaS) }]
        : [],
    nombres: NOMBRES,
  };
}

/** Avisos automáticos que genera el lead del video (transferencia, COF a 2 meses, 5 días hábiles). */
function avisosFlujo(est: flujo.EstadoFlujo): Aviso[] {
  const suc = est.sucursal ?? '';
  const cs = est.camposS;
  const a: Aviso[] = [];
  const nuevo = (
    id: string,
    tipo: Aviso['tipo'],
    area: Aviso['area'],
    fecha: string,
    mensaje: string,
  ): Aviso => ({
    ...aviso(id, flujo.SUC.id, mensaje, area),
    tipo,
    fecha_objetivo: fecha,
  });
  if (est.req['Transferencia a Proyectos habilitada'])
    a.push(
      nuevo(
        'af-trans',
        'transferencia',
        'proyectos',
        '2026-11-03',
        `${suc}: Legal habilitó la transferencia a Proyectos. Captura la fecha estimada de apertura.`,
      ),
    );
  if (cs.fecha_estimada_apertura) {
    const cof = menosMeses(cs.fecha_estimada_apertura, 2);
    a.push(
      nuevo(
        'af-cof',
        'cof',
        'legal',
        cof,
        `${suc}: abre el ${fechaCortaFlujo(cs.fecha_estimada_apertura)}; la COF debe firmarse antes del ${fechaCortaFlujo(cof)}`,
      ),
    );
  }
  if (cs.fecha_confirmada_apertura)
    a.push(
      nuevo(
        'af-5h',
        'apertura_5_habiles',
        'legal',
        cs.fecha_confirmada_apertura,
        `${suc}: Proyectos confirmó la apertura para el ${fechaCortaFlujo(cs.fecha_confirmada_apertura)}. Contrato y liberación antes de esa fecha.`,
      ),
    );
  return a.filter((x) => !est.atendidos.includes(x.id));
}

/** Qué del lead le toca al usuario grabado, según el documento: Ventas (franquiciatario), Aprobación de locales
 * (sucursal: etapa 6, solicitud de constancia y Jestor), Finanzas, Legal y Proyectos. */
function meTocaFlujo(q: RequisitoCard, tipo: 'franquiciatario' | 'sucursal') {
  switch (ROL_VIDEO) {
    case 'ventas':
      return tipo === 'franquiciatario' && q.area_cumple === 'ventas';
    case 'locales':
      return tipo === 'sucursal' && q.area_cumple === 'ventas';
    default:
      return q.area_cumple === ROL_VIDEO;
  }
}

function pendientesFlujo() {
  const est = flujo.leer();
  const toca: CardPipeline[] = [];
  const listas: CardPipeline[] = [];
  for (const tipo of ['franquiciatario', 'sucursal'] as const) {
    const c = cardFlujo(tipo, est);
    if (!c) continue;
    const et = etapa(c.etapaId);
    if (et.tipo !== 'abierta') continue;
    const rs = requisitosFlujo(tipo, et, est).filter(
      (q) => !listoFlujo(q) && (q.de_etapa_actual || q.anticipable) && meTocaFlujo(q, tipo),
    );
    if (rs.length)
      toca.push({
        ...c,
        requisitos: {
          ...c.requisitos,
          faltante: { nombre: rs[0].nombre, area: rs[0].area_cumple as 'ventas' },
        },
      });
    else if (
      c.requisitos.listos >= c.requisitos.total &&
      meTocaFlujo({ area_cumple: et.area } as RequisitoCard, tipo)
    )
      listas.push(c);
  }
  const area = AREAS[PERFIL.areas[0]]?.nombre ?? 'tu área';
  return {
    descripcion: `Lo que le toca a ${ROL_VIDEO === 'locales' ? 'Aprobación de locales' : area}, por urgencia.`,
    avisos: avisosFlujo(est).filter((x) => PERFIL.areas.includes(x.area as 'ventas')),
    vencidos: [] as (VencimientoCard & { dias: number })[],
    toca,
    propias:
      ROL_VIDEO === 'ventas'
        ? cardsFlujo().filter((c) => c.tipo === 'franquiciatario' && etapa(c.etapaId).tipo === 'abierta')
        : [],
    listas,
    vendedor: ROL_VIDEO === 'ventas',
  };
}

function vencimientosFlujo() {
  const est = flujo.leer();
  const suc = est.sucursal ?? '';
  const cs = est.camposS;
  const lista: (VencimientoCard & { dias: number })[] = [];
  if (cs.fecha_estimada_apertura)
    lista.push(venc(flujo.SUC.id, suc, 'cof', 'legal', menosMeses(cs.fecha_estimada_apertura, 2)));
  if (cs.fecha_confirmada_apertura)
    lista.push(venc(flujo.SUC.id, suc, 'apertura_5_habiles', 'legal', cs.fecha_confirmada_apertura));
  if (cs.fecha_limite_apertura)
    lista.push(venc(flujo.SUC.id, suc, 'limite_120', 'proyectos', cs.fecha_limite_apertura));
  const todos = avisosFlujo({ ...est, atendidos: [] });
  return {
    lista: lista.sort((a, b) => a.dias - b.dias),
    avisos: avisosFlujo(est).filter((x) => PERFIL.areas.includes(x.area as 'ventas')),
    atendidos: todos
      .filter((x) => est.atendidos.includes(x.id))
      .map((x) => ({
        ...x,
        atendido_por: PERFIL.id,
        atendido_en: flujo.AHORA_FLUJO.toISOString(),
        quien: PERFIL.nombre,
      })),
  };
}

function carrilFlujo(): FilaCarril[] {
  if (!flujo.FLUJO) return [];
  const est = flujo.leer();
  if (!est.sucursal || !est.etapaS || etapa(est.etapaS).orden < etapa('levantamiento').orden) return [];
  const r = est.req;
  const estado: FilaCarril['estado'] = r['Liberación para apertura']
    ? 'liberada'
    : r['Contrato firmado por franquiciatario y obligado solidario']
      ? 'contrato_firmado'
      : r['COF firmada y fecha de entrega']
        ? 'cof_firmada'
        : r['COF enviada al franquiciatario']
          ? 'cof_enviada'
          : 'por_enviar';
  const estimada = est.camposS.fecha_estimada_apertura ?? '2027-01-15';
  const fecha =
    estado === 'por_enviar' || estado === 'cof_enviada'
      ? menosMeses(estimada, 2)
      : (est.camposS.fecha_confirmada_apertura ?? estimada);
  return [
    {
      id: flujo.SUC.id,
      nombre: est.sucursal,
      franquiciatario: est.campos.nombre ?? flujo.LEAD.nombre,
      etapa: etapa(est.etapaS),
      estado,
      fecha,
      fechaTexto:
        estado === 'por_enviar' || estado === 'cof_enviada' ? 'COF firmada a más tardar' : 'Apertura',
      dias: diasDe(fecha),
    },
  ];
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
  proceso: VistaProcesoCrm,
  'carril-legal': VistaCarrilLegalCrm,
  'pipeline-entradas': VistaEntradasPipelineCrm,
};
