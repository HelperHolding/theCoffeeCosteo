// Contrato de las tablas del CRM (migraciones 14 en adelante; CRM Unificado: 30–35).
interface Auditoria {
  creado_en: string;
  actualizado_en: string;
  creado_por: string | null;
  actualizado_por: string | null;
  version: number;
  archivado_en: string | null;
}
interface Zoho {
  zoho_org_id: string | null;
  zoho_module_api_name: string | null;
  zoho_record_id: string | null;
  zoho_created_at: string | null;
  zoho_modified_at: string | null;
  imported_at: string | null;
  import_run_id: string | null;
  import_hash: string | null;
}

export type TipoEtapa = 'abierta' | 'lateral' | 'ganada' | 'perdida';
export interface Etapa {
  id: string;
  embudo: 'tiendas' | 'prospectos' | 'general';
  nombre: string;
  orden: number;
  tipo: TipoEtapa;
  activa: boolean;
  zoho_valor: string | null;
  creado_en: string;
  // Embudo general (migración 31).
  clave: string | null;
  numero: number | null;
  area: ClaveArea | null;
  funcion: 'aprobacion_locales' | null;
  card: TipoCard | null;
  opcional: boolean;
  provisional: boolean;
}

export const MARCAS_CAFETERA = ['La Marzocco', 'Victoria Arduino'] as const;
export const ESTATUS_CAFETERA = [
  'Apartada (anticipo pagado)',
  'Pagada al 100%',
  'Recibida',
  'Instalada',
] as const;
export const ESTATUS_CONTRATO = ['Pendiente', 'Firmado Digital', 'Firmado Presencial'] as const;
export const TIPOS_FRANQUICIA = {
  franquiciatario: 'Franquiciatario',
  maestra: 'Franquicia Maestra',
} as const;

export interface Tienda extends Auditoria, Zoho {
  id: string;
  nombre: string;
  embudo: 'tiendas' | 'general';
  etapa_id: string;
  posicion: number;
  responsable_id: string | null;
  franquiciatario: string | null;
  tipo_franquicia: keyof typeof TIPOS_FRANQUICIA | null;
  ciudad: string | null;
  direccion: string | null;
  numero_tienda_jestor: number | null;
  arquitecto_asignado: string | null;
  fecha_entrega_proyecto: string | null;
  fecha_aprobacion_local: string | null;
  fecha_firma_contrato: string | null;
  fecha_firma_franquicia: string | null;
  estatus_contrato_franquicia: (typeof ESTATUS_CONTRATO)[number] | null;
  fecha_vencimiento_franquicia: string | null;
  fecha_programada_arranque: string | null;
  fecha_apertura: string | null;
  marca_cafetera: (typeof MARCAS_CAFETERA)[number] | null;
  estatus_cafetera: (typeof ESTATUS_CAFETERA)[number] | null;
  rappi: boolean;
  rollout: boolean;
  correo_tienda: string | null;
  url_carpeta_contrato: string | null;
  url_dictamen_local: string | null;
  revisar: string[];
  // Sucursal del Pipeline general (migración 31).
  franquiciatario_id: string | null;
  fecha_estimada_apertura: string | null;
  fecha_confirmada_apertura: string | null;
  fecha_limite_apertura: string | null;
  etapa_previa_id: string | null;
  muestra: boolean;
  etapa_origen_id: string | null;
  archivado_por: string | null;
}

export interface Prospecto extends Auditoria, Zoho {
  id: string;
  nombre: string | null;
  apellidos: string;
  correo: string | null;
  telefono: string | null;
  embudo: 'prospectos';
  etapa_id: string | null;
  posicion: number;
  responsable_id: string | null;
  empresa: string | null;
  ciudad_interes: string | null;
  estado_interes: string | null;
  ciudad_residencia: string | null;
  estado_residencia: string | null;
  pais: string | null;
  inversion: string | null;
  capital_disponible: string | null;
  fuente_capital: string | null;
  interes_en_the_coffee: string | null;
  por_que_tendra_exito: string | null;
  plan_operacion: string | null;
  involucrado_otra_marca: string | null;
  marca_involucramiento: string | null;
  pagina_web: string | null;
  sin_correos: boolean;
}

export const TIPOS_CONTACTO = [
  'Administrativos Oficina',
  'Directores',
  'Franquiciatarios',
  'Nuevos Franquiciatarios',
  'Gerentes Operativos',
  'Contactos Marketing',
  'Newsletter',
] as const;
export interface Contacto extends Auditoria, Zoho {
  id: string;
  nombre: string | null;
  apellidos: string;
  correo: string | null;
  telefono: string | null;
  puesto: string | null;
  tipo_contacto: (typeof TIPOS_CONTACTO)[number] | null;
  franquiciatario: string | null;
  plaza: string | null;
  recibe_newsletter: boolean;
  recibe_comunicados: boolean;
  fee_pagado: boolean;
  responsable_id: string | null;
}

export interface TiendaContacto {
  tienda_id: string;
  contacto_id: string;
  origen: 'crm' | 'importacion';
  creado_en: string;
}

// Valores tal cual vienen de Zoho; la etiqueta en español se muestra con ESTADOS_ACTIVIDAD.
export const ESTADOS_ACTIVIDAD = {
  'Not Started': 'Sin iniciar',
  'In Progress': 'En curso',
  'Waiting for input': 'En espera',
  Deferred: 'Pospuesta',
  Completed: 'Completada',
  Interesado: 'Interesado',
} as const;
export const PRIORIDADES = {
  Highest: 'Urgente',
  High: 'Alta',
  Normal: 'Normal',
  Low: 'Baja',
  Lowest: 'Mínima',
} as const;
export interface Actividad extends Auditoria, Zoho {
  id: string;
  asunto: string;
  fecha_vencimiento: string | null;
  estado: keyof typeof ESTADOS_ACTIVIDAD;
  prioridad: keyof typeof PRIORIDADES | null;
  descripcion: string | null;
  cerrada_en: string | null;
  recordatorio_zoho: string | null;
  responsable_id: string | null;
  tienda_id: string | null;
  prospecto_id: string | null;
  contacto_id: string | null;
  franquiciatario_id: string | null;
}

export interface Nota extends Auditoria, Zoho {
  id: string;
  titulo: string | null;
  contenido: string;
  autor_id: string | null;
  tienda_id: string | null;
  prospecto_id: string | null;
  contacto_id: string | null;
  actividad_id: string | null;
  franquiciatario_id: string | null;
}

export interface Etiqueta {
  id: string;
  nombre: string;
  color: string | null;
  creado_en: string;
}
export interface EtiquetaRegistro {
  id: string;
  etiqueta_id: string;
  tienda_id: string | null;
  prospecto_id: string | null;
  contacto_id: string | null;
  creado_en: string;
}

export interface Checklist {
  id: string;
  tienda_id: string;
  nombre: string;
  orden: number;
  creado_en: string;
  actualizado_en: string;
  creado_por: string | null;
  actualizado_por: string | null;
  version: number;
  archivado_en: string | null;
}
export interface ChecklistItem {
  id: string;
  checklist_id: string;
  texto: string;
  hecho: boolean;
  orden: number;
  responsable_id: string | null;
  fecha_limite: string | null;
  url: string | null;
  completado_por: string | null;
  completado_en: string | null;
  creado_en: string;
  actualizado_en: string;
  creado_por: string | null;
  actualizado_por: string | null;
  version: number;
}

export interface Archivo {
  id: string;
  nombre: string;
  mime: string;
  tamano: number;
  sha256: string | null;
  ruta: string;
  seccion: string;
  campo: string | null;
  tienda_id: string | null;
  prospecto_id: string | null;
  contacto_id: string | null;
  nota_id: string | null;
  subido_por: string | null;
  subido_en: string;
  archivado_en: string | null;
  archivado_por: string | null;
  version: number;
  zoho_attachment_id: string | null;
  zoho_file_id: string | null;
  zoho_org_id: string | null;
  zoho_module_api_name: string | null;
  zoho_created_at: string | null;
  imported_at: string | null;
  import_run_id: string | null;
  franquiciatario_id: string | null;
  tipo_documento: string | null;
  version_documento: number;
  reemplaza_a: string | null;
  motivo_retiro: string | null;
}

export type AccionHistorial =
  | 'creado'
  | 'editado'
  | 'etapa'
  | 'responsable'
  | 'archivado'
  | 'nota'
  | 'checklist'
  | 'archivo'
  | 'importado'
  | 'requisito_cumplido'
  | 'requisito_validado'
  | 'requisito_revertido'
  | 'requisito_no_aplica'
  | 'candado_liberado'
  | 'sucursal_creada'
  | 'archivo_version'
  | 'archivo_retirado'
  | 'archivo_descargado'
  | 'acceso'
  | 'aviso'
  | 'eliminado'
  | 'liga'
  | 'etiqueta'
  | 'configuracion';
export type OrigenHistorial = 'crm' | 'importacion' | 'zoho' | 'sistema' | 'agente';

export interface Historial {
  id: number;
  entidad: string;
  entidad_id: string | null;
  tienda_id: string | null;
  franquiciatario_id: string | null;
  accion: AccionHistorial;
  resumen: string;
  cambios: unknown;
  actor_id: string | null;
  actor_nombre: string | null;
  actor_area: string | null;
  origen: OrigenHistorial;
  motivo: string | null;
  fecha: string;
}

// CRM Unificado (migraciones 30–35, doc 40).
export type ClaveArea = 'ventas' | 'legal' | 'proyectos' | 'finanzas';
export type TipoCard = 'franquiciatario' | 'sucursal';
export type RolArea = 'head' | 'miembro' | 'lectura';
export type TipoRequisito = 'documento' | 'fecha' | 'validacion' | 'firma' | 'dato';
export type EstadoRequisito = 'pendiente' | 'cumplido' | 'validado' | 'no_aplica';
export const TERRITORIOS = {
  disponible: 'Disponible',
  restringida: 'Restringida',
  exclusiva: 'Exclusiva',
  bloqueada: 'Bloqueada',
} as const;

export interface Area {
  clave: ClaveArea;
  nombre: string;
  color: string;
  activa: boolean;
  orden: number;
}
export interface Membresia {
  user_id: string;
  area: ClaveArea;
  rol: RolArea;
  funciones: string[];
  creado_en: string;
  creado_por: string | null;
  actualizado_en: string;
  actualizado_por: string | null;
  version: number;
}
export interface Franquiciatario {
  id: string;
  nombre: string;
  tipo_persona: 'fisica' | 'moral' | null;
  correo: string | null;
  telefono: string | null;
  ciudad_interes: string | null;
  estado_interes: string | null;
  origen: string | null;
  territorio: keyof typeof TERRITORIOS | null;
  responsable_id: string | null;
  embudo: 'general';
  etapa_id: string;
  etapa_previa_id: string | null;
  posicion: number;
  formalizado_en: string | null;
  firmante: string | null;
  obligado_solidario: string | null;
  razon_social: string | null;
  rfc: string | null;
  regimen_fiscal: string | null;
  codigo_postal_fiscal: string | null;
  prospecto_id: string | null;
  muestra: boolean;
  etapa_origen_id: string | null;
  creado_en: string;
  actualizado_en: string;
  creado_por: string | null;
  actualizado_por: string | null;
  version: number;
  archivado_en: string | null;
  archivado_por: string | null;
}
export interface Requisito {
  id: string;
  clave: string;
  etapa_id: string;
  nombre: string;
  tipo: TipoRequisito;
  area_cumple: ClaveArea;
  area_valida: ClaveArea;
  funcion_cumple: 'aprobacion_locales' | null;
  obligatorio: boolean;
  campo: string | null;
  tipo_documento: string | null;
  depende_de: string[];
  anticipable: boolean;
  orden: number;
  ayuda: string;
  activo: boolean;
  actualizado_en: string;
  actualizado_por: string | null;
  version: number;
}
export interface Cumplimiento {
  id: string;
  requisito_id: string;
  franquiciatario_id: string | null;
  tienda_id: string | null;
  card_id: string;
  estado: EstadoRequisito;
  valor: string | null;
  fecha: string | null;
  archivo_id: string | null;
  nota: string | null;
  cumplido_por: string | null;
  cumplido_en: string | null;
  validado_por: string | null;
  validado_en: string | null;
  actualizado_en: string;
  version: number;
}
export interface Liberacion {
  id: string;
  franquiciatario_id: string | null;
  tienda_id: string | null;
  card_id: string;
  etapa_id: string;
  faltantes: { clave: string; nombre: string; area: ClaveArea }[];
  motivo: string;
  liberado_por: string;
  liberado_en: string;
  consumida_en: string | null;
}
export type TipoAviso = 'cof' | 'apertura_5_habiles' | 'limite_120' | 'cof_tardia';
export interface Aviso {
  id: string;
  tipo: TipoAviso;
  tienda_id: string;
  franquiciatario_id: string | null;
  area: ClaveArea;
  fecha_objetivo: string;
  mensaje: string;
  generado_en: string;
  atendido_por: string | null;
  atendido_en: string | null;
}
export interface Festivo {
  fecha: string;
  nombre: string;
  creado_en: string;
  creado_por: string | null;
}
/** Vista crm_v_candados: candado de la etapa actual de cada card del embudo general. */
export interface CandadoCard {
  tipo_card: TipoCard;
  card_id: string;
  etapa_id: string;
  total: number;
  listos: number;
  faltante: string | null;
  faltante_area: ClaveArea | null;
  liberado: boolean;
}
/** Vista crm_v_vencimientos. */
export interface VencimientoCard {
  tienda_id: string;
  franquiciatario_id: string | null;
  nombre: string;
  tipo: TipoAviso;
  area: ClaveArea;
  fecha: string;
  aviso_desde: string;
  mensaje: string;
}
/** Función crm_requisitos_de: estado de cada requisito para una card. */
export interface RequisitoCard {
  requisito_id: string;
  clave: string;
  etapa_id: string;
  etapa_clave: string;
  etapa_orden: number;
  de_etapa_actual: boolean;
  nombre: string;
  tipo: TipoRequisito;
  area_cumple: ClaveArea;
  area_valida: ClaveArea;
  funcion_cumple: 'aprobacion_locales' | null;
  obligatorio: boolean;
  campo: string | null;
  tipo_documento: string | null;
  depende_de: string[];
  anticipable: boolean;
  orden: number;
  ayuda: string;
  estado: EstadoRequisito;
  cumplimiento_id: string | null;
  valor: string | null;
  fecha: string | null;
  archivo_id: string | null;
  nota: string | null;
  cumplido_por: string | null;
  cumplido_en: string | null;
  validado_por: string | null;
  validado_en: string | null;
}
