import type { ClaveArea, EtapaGeneral } from './modelo';

// Mapa del proceso (doc 41 §2): qué se hace en cada etapa, quién, dónde y qué sigue, según el documento
// «Desarrollo de CRM Unificado» (versión completa). Lo que se REGISTRA no vive aquí: sale de crm_requisitos, el
// mismo catálogo que aplica los candados, para que el mapa (y el guion del video) no se desfasen de la base.

export type FaseProceso = 'ventas' | 'locales' | 'proyectos' | 'legal' | 'apertura';

export interface ContenidoPaso {
  /** Qué se hace, en el orden del documento (puntos 1–31). */
  hace: string[];
  /** Quién lo hace (áreas y funciones). */
  quien: string;
  /** Pantalla del CRM donde se trabaja. */
  donde: string;
  /** Qué sigue al cerrar el paso. */
  sigue: string;
  /** Condición obligatoria del documento (candado), si la hay. */
  candado?: string;
  /** Avisos que el CRM manda solo. */
  avisos?: string[];
  fase: FaseProceso;
}

export const FASES: Record<FaseProceso, { nombre: string; area: ClaveArea | null }> = {
  ventas: { nombre: 'Expansión y Ventas', area: 'ventas' },
  locales: { nombre: 'Locales y Legal', area: 'legal' },
  proyectos: { nombre: 'Proyectos', area: 'proyectos' },
  legal: { nombre: 'Carril Legal (en paralelo)', area: 'legal' },
  apertura: { nombre: 'Apertura', area: 'proyectos' },
};

export const CONTENIDO: Record<string, ContenidoPaso> = {
  recepcion: {
    fase: 'ventas',
    hace: [
      'Registrar al prospecto con sus datos de contacto, ciudad de interés y origen.',
      'Validar si la zona está disponible, restringida, en exclusiva o bloqueada.',
      'Asignar al vendedor que lo acompañará en la venta.',
    ],
    quien: 'Expansión y Ventas',
    donde: 'Pipeline → «Registrar lead» y la ficha del franquiciatario',
    sigue: 'Contacto inicial (etapa 2)',
    candado: 'Con territorio bloqueado no avanza: solo Standby o Descartada.',
  },
  contacto: {
    fase: 'ventas',
    hace: [
      'Primera reunión: presentar el modelo de franquicia.',
      'Enviar la información comercial con la plantilla única para todos los vendedores.',
    ],
    quien: 'Vendedor asignado',
    donde: 'Ficha del franquiciatario → Requisitos',
    sigue: 'Revisión de contrato (3) si la pide; si no, Perfilamiento y PLD (4)',
  },
  revision_contrato: {
    fase: 'ventas',
    hace: [
      'Solo si el prospecto quiere revisar el contrato antes de liquidar.',
      'Ventas cobra el apartado de $50,000 + IVA (instrucciones por correo, plantilla de Finanzas).',
      'Finanzas confirma el pago; Ventas pide a Legal el envío del contrato.',
      'Legal envía el contrato y registra la fecha.',
    ],
    quien: 'Ventas, Finanzas y Legal',
    donde: 'Ficha del franquiciatario → Requisitos y Documentos',
    sigue: 'Perfilamiento, PLD y formalización (4)',
    candado: 'Legal no envía el contrato sin comprobante y validación de Finanzas. Ventas nunca lo comparte.',
  },
  pld: {
    fase: 'ventas',
    hace: [
      'Confirmar el interés y empezar el expediente.',
      'Survey completo: firmante, obligado solidario y documentos legibles y vigentes.',
      'Formato PLD a puño y letra, firmado con pluma azul; el original va al corporativo.',
      'Enviar instrucciones de pago (solo con Survey y PLD completos).',
      'Recibir la liquidación; Finanzas la valida.',
    ],
    quien: 'Ventas y Finanzas',
    donde: 'Ficha del franquiciatario → Resumen (datos del Survey) y Requisitos',
    sigue: 'Bienvenida, carta de intención y factura (5). Con el pago validado ya es franquiciatario.',
    candado: 'Sin Survey validado y PLD firmado no se recibe la liquidación.',
  },
  bienvenida: {
    fase: 'ventas',
    hace: [
      'Correo de bienvenida con copia a Legal, Finanzas y responsables internos.',
      'Legal elabora la carta de intención con los datos del Survey y la firma el día del pago.',
      'Se pide la factura a Finanzas (CSF y datos fiscales en el expediente).',
      'Registrar la llegada del PLD original al corporativo.',
    ],
    quien: 'Ventas, Legal y Finanzas',
    donde: 'Ficha del franquiciatario → Requisitos',
    sigue: 'Se formaliza y nace la sucursal en Aprobación de locales (6)',
    candado: 'Sin carta de intención firmada no hay búsqueda de local ni propuestas al Comité.',
  },
  locales: {
    fase: 'locales',
    hace: [
      'Compartir el video tutorial y los formatos para proponer locales.',
      'Recibir las propuestas del franquiciatario.',
      'Evaluar y presentar ante el Comité de Aprobaciones.',
      'Registrar el dictamen y la resolución; el franquiciatario firma el dictamen.',
    ],
    quien: 'Aprobación de Locales (Sebastián) y Comité de Aprobaciones',
    donde: 'Ficha de la sucursal → Requisitos y Documentos',
    sigue: 'Constancia de arrendamiento (7)',
    candado: 'Sin dictamen firmado no se pide la constancia a Legal.',
  },
  constancia: {
    fase: 'locales',
    hace: [
      'Con el local aprobado y el contrato de arrendamiento firmado, Aprobación de Locales pide la constancia.',
      'Legal la elabora y la firma el mismo día; registra la fecha límite de apertura (por lo general, 120 días).',
    ],
    quien: 'Aprobación de Locales y Legal',
    donde: 'Ficha de la sucursal → Requisitos',
    sigue: 'Transferencia a Proyectos (8)',
    candado: 'Ninguna ubicación pasa a Proyectos sin la constancia firmada.',
    avisos: [
      'Empieza la cuenta de 120 días. 14 días antes avisa a Proyectos y Legal.',
      'Si vence sin abrir, avisa a Legal, Proyectos y Finanzas para cobrar la multa.',
    ],
  },
  transferencia: {
    fase: 'locales',
    hace: [
      'Legal habilita la transferencia del expediente a Proyectos.',
      'Expansión / Aprobación de Locales da de alta la sucursal en Jestor y genera su ID.',
      'Proyectos recibe el expediente y registra la fecha estimada de apertura.',
    ],
    quien: 'Legal, Aprobación de Locales y Proyectos',
    donde: 'Ficha de la sucursal → Requisitos y Resumen',
    sigue: 'Levantamiento arquitectónico (26.1). Se abre el carril Legal (COF y contrato).',
    avisos: ['Al habilitar la transferencia, Proyectos recibe un aviso.'],
  },
  levantamiento: {
    fase: 'proyectos',
    hace: ['Recibir del franquiciatario el levantamiento y revisar que alcance para el boceto.'],
    quien: 'Proyectos',
    donde: 'Ficha de la sucursal → Requisitos',
    sigue: 'Elaboración de boceto (26.2)',
    candado: 'Si está incompleto, la sucursal se queda aquí hasta registrar lo faltante.',
  },
  boceto: {
    fase: 'proyectos',
    hace: ['Elaborar el boceto de distribución con base en el levantamiento.'],
    quien: 'Proyectos',
    donde: 'Ficha de la sucursal → Requisitos',
    sigue: 'Envío a Brasil (26.3)',
  },
  envio_brasil: {
    fase: 'proyectos',
    hace: ['Enviar el boceto y la información al equipo de Brasil para el proyecto 3D.'],
    quien: 'Proyectos',
    donde: 'Ficha de la sucursal → Requisitos',
    sigue: 'Recepción del proyecto 3D (26.4)',
  },
  proyecto_3d: {
    fase: 'proyectos',
    hace: ['Recibir el proyecto 3D de Brasil e incorporarlo al expediente.'],
    quien: 'Proyectos',
    donde: 'Ficha de la sucursal → Documentos',
    sigue: 'Proyecto ejecutivo (26.5)',
  },
  proyecto_ejecutivo: {
    fase: 'proyectos',
    hace: ['Coordinar la elaboración y revisión del proyecto ejecutivo.'],
    quien: 'Proyectos',
    donde: 'Ficha de la sucursal → Documentos',
    sigue: 'Obra (26.6)',
  },
  obra: {
    fase: 'proyectos',
    hace: ['El franquiciatario ejecuta la obra; Proyectos da seguimiento con el proyecto ejecutivo.'],
    quien: 'Franquiciatario y Proyectos',
    donde: 'Ficha de la sucursal → Requisitos',
    sigue: 'Capacitación y evidencia de apertura (26.7)',
  },
  capacitacion: {
    fase: 'proyectos',
    hace: [
      'Coordinar la capacitación y registrar la logística del capacitador.',
      'Concentrar la evidencia de apertura y registrar la fecha real.',
    ],
    quien: 'Proyectos',
    donde: 'Ficha de la sucursal → Requisitos',
    sigue: 'Tienda en operación (26.8)',
    candado: 'No abre sin la liberación de Legal (carril Legal completo).',
  },
  cof: {
    fase: 'legal',
    hace: [
      'A dos meses de la apertura estimada, el CRM avisa a Legal.',
      'Legal envía la COF y recaba la firma del franquiciatario.',
    ],
    quien: 'Proyectos (fecha estimada) y Legal',
    donde: 'Ficha de la sucursal → Carril Legal, y el tablero «COF y contrato»',
    sigue: 'Contrato de franquicia (10)',
    candado: 'Sin COF firmada no se envía el contrato. Si llega tarde, la apertura se ajusta al plazo legal.',
    avisos: ['COF a 2 meses de la apertura estimada.', 'COF tardía: sugiere la fecha mínima legal.'],
  },
  contrato: {
    fase: 'legal',
    hace: [
      'Proyectos confirma la fecha de apertura al menos 5 días hábiles antes.',
      'Legal envía el contrato y recaba la firma del franquiciatario y del obligado solidario.',
      'Legal libera la sucursal para abrir.',
    ],
    quien: 'Proyectos y Legal',
    donde: 'Ficha de la sucursal → Carril Legal, y el tablero «COF y contrato»',
    sigue: 'Tienda en operación (26.8)',
    candado: 'Ninguna sucursal abre sin contrato firmado por el franquiciatario y el obligado solidario.',
    avisos: ['5 días hábiles antes de la apertura confirmada (salta festivos).'],
  },
  operando: {
    fase: 'apertura',
    hace: [
      'Con la capacitación cerrada, la apertura documentada y la liberación de Legal, la sucursal abre.',
      'La ficha conserva el expediente completo: entregables, responsables y fechas de todas las áreas.',
    ],
    quien: 'Proyectos',
    donde: 'Ficha de la sucursal',
    sigue: 'Fin del proceso',
  },
};

export interface RequisitoProceso {
  etapa_id: string;
  nombre: string;
  tipo: string;
  area_cumple: ClaveArea;
  area_valida: ClaveArea;
  obligatorio: boolean;
}

export interface PasoProceso {
  etapa: EtapaGeneral;
  contenido: ContenidoPaso;
  requisitos: RequisitoProceso[];
  /** Cards que hoy están en la etapa (las del carril se cuentan aparte). */
  cards: number;
}

/** Pasos del proceso en orden (1–5, 6–8, 26.1–26.7, carril Legal, 26.8) con lo que registra cada uno. */
export function pasosProceso(
  etapas: EtapaGeneral[],
  requisitos: RequisitoProceso[],
  porEtapa: Record<string, number> = {},
): PasoProceso[] {
  const orden: FaseProceso[] = ['ventas', 'locales', 'proyectos', 'legal', 'apertura'];
  return etapas
    .filter((e) => CONTENIDO[e.clave])
    .map((e) => ({
      etapa: e,
      contenido: CONTENIDO[e.clave],
      requisitos: requisitos.filter((r) => r.etapa_id === e.id),
      cards: porEtapa[e.id] ?? 0,
    }))
    .sort(
      (a, b) =>
        orden.indexOf(a.contenido.fase) - orden.indexOf(b.contenido.fase) || a.etapa.orden - b.etapa.orden,
    );
}

/** Etiqueta corta del paso: «4», «26.3»… */
export const numeroPaso = (e: Pick<EtapaGeneral, 'numero' | 'paso'>) =>
  e.numero ? String(e.numero) : (e.paso ?? '');
