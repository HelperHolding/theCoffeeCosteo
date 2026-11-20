// Contrato de las tablas y funciones del módulo Franquiciatarios (migración 75).

export type SeccionClave = 'apertura' | 'cambio' | 'cierre';
export type TipoFirma = 'responsable' | 'entrega' | 'recibe';

export interface FranqMiembro {
  user_id: string;
  company_id: number;
  rol: 'franquiciatario' | 'gerente' | 'barista';
  activo: boolean;
  creado_en: string;
}
export interface FranqBarista {
  id: number;
  company_id: number;
  nombre: string;
  activo: boolean;
  creado_por: string;
  creado_en: string;
  actualizado_por: string | null;
  actualizado_en: string | null;
}
export interface FranqPlantilla {
  id: number;
  clave: 'turno';
  company_id: number | null;
  version: number;
  vigente: boolean;
  creado_en: string;
}
export interface FranqSeccion {
  id: number;
  plantilla_id: number;
  clave: SeccionClave;
  nombre: string;
  orden: number;
  firmas: TipoFirma[];
}
export interface FranqPunto {
  id: number;
  seccion_id: number;
  orden: number;
  actividad: string;
  estandar: string;
}
export interface FranqChecklist {
  id: number;
  company_id: number;
  dia: string;
  seccion: SeccionClave;
  seccion_id: number;
  creado_en: string;
}
export interface FranqRespuesta {
  id: number;
  checklist_id: number;
  company_id: number;
  punto_id: number;
  cumple: boolean;
  observacion: string | null;
  barista_id: number | null;
  nombre: string;
  registrado_por: string;
  registrado_en: string;
  sesion: string | null;
  dispositivo: string | null;
  corrige_id: number | null;
  motivo: string | null;
}
export interface FranqFirma {
  id: number;
  checklist_id: number;
  company_id: number;
  tipo: TipoFirma;
  barista_id: number | null;
  nombre: string;
  registrado_por: string;
  registrado_en: string;
  sesion: string | null;
  dispositivo: string | null;
}
export interface FranqIncidencia {
  id: number;
  company_id: number;
  dia: string;
  texto: string;
  barista_id: number | null;
  nombre: string;
  registrado_por: string;
  registrado_en: string;
  sesion: string | null;
  dispositivo: string | null;
}
export interface FranqAviso {
  tipo: 'no' | 'incidencia';
  dia: string;
  seccion: SeccionClave | null;
  punto: string | null;
  estandar: string | null;
  observacion: string | null;
  nombre: string;
  registrado_en: string;
  respuesta_id: number | null;
}

export interface FuncionesFranq {
  franq_rol: { Args: { p_company: number }; Returns: string | null };
  franq_dia_operacion: { Args: Record<string, never>; Returns: string };
  franq_responder: {
    Args: {
      p_company: number;
      p_seccion: SeccionClave;
      p_punto: number;
      p_cumple: boolean;
      p_observacion: string | null;
      p_barista: number | null;
      p_dispositivo: string | null;
      p_motivo?: string | null;
    };
    Returns: number;
  };
  franq_corregir: {
    Args: {
      p_respuesta: number;
      p_cumple: boolean;
      p_observacion: string | null;
      p_motivo: string;
      p_dispositivo: string | null;
    };
    Returns: number;
  };
  franq_firmar: {
    Args: {
      p_company: number;
      p_seccion: SeccionClave;
      p_tipo: TipoFirma;
      p_barista: number | null;
      p_dispositivo: string | null;
    };
    Returns: number;
  };
  franq_incidencia: {
    Args: { p_company: number; p_texto: string; p_barista: number | null; p_dispositivo: string | null };
    Returns: number;
  };
  franq_barista_guardar: {
    Args: { p_company: number; p_id: number | null; p_nombre: string; p_activo: boolean };
    Returns: number;
  };
  franq_avisos: { Args: { p_company: number; p_desde: string; p_hasta: string }; Returns: FranqAviso[] };
}
