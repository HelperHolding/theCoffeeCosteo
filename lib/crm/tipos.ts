// Contrato de las tablas del CRM (supabase/migrations/20261020000014_crm_esquema.sql).
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
  embudo: 'tiendas' | 'prospectos';
  nombre: string;
  orden: number;
  tipo: TipoEtapa;
  activa: boolean;
  zoho_valor: string | null;
  creado_en: string;
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
  embudo: 'tiendas';
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
}

export interface Historial {
  id: number;
  entidad: string;
  entidad_id: string;
  tienda_id: string | null;
  accion:
    | 'creado'
    | 'editado'
    | 'etapa'
    | 'responsable'
    | 'archivado'
    | 'nota'
    | 'checklist'
    | 'archivo'
    | 'importado';
  resumen: string;
  cambios: unknown;
  actor_id: string | null;
  origen: 'crm' | 'importacion' | 'zoho';
  fecha: string;
}
