// Contrato de las tablas y funciones del módulo Franquiciatarios (migraciones 75 y 79).

/** Fases del checklist. v1 (Excel): apertura, cambio, cierre. v2 (PDF): apertura, durante, medio, cierre. */
export type SeccionClave = 'apertura' | 'durante' | 'cambio' | 'medio' | 'cierre';
export type TipoFirma = 'responsable' | 'entrega' | 'recibe' | 'visto_bueno';
export type TipoPunto = 'unico' | 'recurrente';
export type TipoCorte = 'parcial' | 'dia';

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
  /** unico = una vez por día; recurrente = rondas (varias veces al día). */
  tipo: TipoPunto;
  /** Frecuencia de la ronda en minutos y tolerancia antes de marcarla atrasada (null = según demanda). */
  cada_min: number | null;
  margen_min: number | null;
  /** Etiqueta del dato que pide un «Sí» (null = no pide dato). */
  dato: string | null;
  /** Punto de «enviar corte»: enlaza a la tira parcial o del día. */
  corte: TipoCorte | null;
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
  dato: string | null;
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
/** Renglón con diferencia en una recepción (migración 80). */
export interface DiferenciaRecepcion {
  nombre: string;
  sku: string | null;
  pedido: number;
  recibido: number;
}
export interface FranqRecepcion {
  id: number;
  company_id: number;
  pedido_id: string;
  folio: string | null;
  completo: boolean;
  diferencias: DiferenciaRecepcion[];
  observacion: string | null;
  barista_id: number | null;
  nombre: string;
  registrado_por: string;
  registrado_en: string;
  sesion: string | null;
  dispositivo: string | null;
}

/** Insumo a contar en la sucursal (migración 83). Sin valores: el costo nunca sale de la base. */
export interface FranqInsumo {
  id: number;
  company_id: number;
  insumo_id: string | null;
  nombre: string;
  unidad: string;
  orden: number;
  activo: boolean;
  origen: 'sugerido' | 'manual';
  creado_por: string;
  creado_en: string;
  actualizado_por: string | null;
  actualizado_en: string | null;
}
export type MomentoConteo = 'apertura' | 'medio';
/** Solo la gerencia lee los conteos (RLS). */
export interface FranqConteo {
  id: number;
  company_id: number;
  dia: string;
  momento: MomentoConteo;
  insumo_id: number;
  cantidad: number;
  barista_id: number | null;
  nombre: string;
  registrado_por: string;
  registrado_en: string;
  sesion: string | null;
  dispositivo: string | null;
  corrige_id: number | null;
}
/** Estado de un momento del día sin cantidades (lo ve también la cuenta de baristas). */
export interface EstadoConteo {
  momento: MomentoConteo;
  nombre: string;
  registrado_en: string;
  insumos: number;
}

/** Caja (migración 84): todo esto solo lo lee la gerencia. */
export interface FranqCajaConfig {
  company_id: number;
  fondo: number;
  tolerancia: number;
  actualizado_por: string;
  actualizado_en: string;
}
export type MomentoArqueo = 'medio' | 'cierre';
export interface FranqArqueo {
  id: number;
  company_id: number;
  dia: string;
  momento: MomentoArqueo;
  contado: number;
  observacion: string | null;
  barista_id: number | null;
  nombre: string;
  registrado_por: string;
  registrado_en: string;
  sesion: string | null;
  dispositivo: string | null;
  corrige_id: number | null;
}
export interface FranqGasto {
  id: number;
  company_id: number;
  dia: string;
  concepto: string | null;
  categoria: string | null;
  monto: number | null;
  en_efectivo: boolean;
  comprobante: boolean;
  nota: string | null;
  anula_id: number | null;
  nombre: string;
  registrado_por: string;
  registrado_en: string;
  sesion: string | null;
  dispositivo: string | null;
}
/** Estado de un arqueo sin montos (lo ve también la cuenta de baristas). */
export interface EstadoArqueo {
  momento: MomentoArqueo;
  nombre: string;
  registrado_en: string;
}

/** Gasto fijo mensual (migración 88): de Zoho o capturado por la gerencia; el último por concepto y mes manda. */
export interface FranqGastoFijo {
  id: number;
  company_id: number;
  mes: string;
  concepto: string;
  monto: number;
  nota: string | null;
  origen: 'manual' | 'zoho';
  nombre: string;
  registrado_por: string;
  registrado_en: string;
}

/** F6 (migración 92): posición de la barra y turno de la sucursal. Se desactivan, nunca se borran. */
export interface FranqPosicion {
  id: number;
  company_id: number;
  nombre: string;
  orden: number;
  activo: boolean;
}
export interface FranqTurno {
  id: number;
  company_id: number;
  nombre: string;
  /** HH:MM:SS */
  entrada: string;
  salida: string;
  orden: number;
  activo: boolean;
}
/** Asignación de un barista a un día, turno y posición; quitarla = renglón anulado que la corrige. */
export interface FranqAsignacion {
  id: number;
  company_id: number;
  dia: string;
  turno_id: number;
  posicion_id: number;
  barista_id: number;
  anulada: boolean;
  corrige_id: number | null;
  registrado_por: string;
  registrado_en: string;
}
export type MotivoMerma = 'caducidad' | 'preparacion' | 'caida' | 'devolucion' | 'otro';
/** Merma registrada (cantidad en la unidad de conteo del insumo). Solo inserción. */
export interface FranqMerma {
  id: number;
  company_id: number;
  dia: string;
  insumo_id: number;
  cantidad: number;
  motivo: MotivoMerma;
  nota: string | null;
  anulada: boolean;
  corrige_id: number | null;
  motivo_correccion: string | null;
  barista_id: number | null;
  nombre: string;
  registrado_por: string;
  registrado_en: string;
}
export interface FranqMermaTolerancia {
  id: number;
  company_id: number;
  insumo_id: number;
  pct: number;
  registrado_por: string;
  registrado_en: string;
}
export interface FranqMermasCierre {
  company_id: number;
  dia: string;
  nombre: string;
  cerrado_por: string;
  cerrado_en: string;
}
/** Existencias (migración 96): lo que entra a la sucursal, en la unidad de conteo del insumo. Solo inserción. */
export type OrigenEntrada = 'pedido' | 'proveedor';
export interface FranqEntrada {
  id: number;
  company_id: number;
  dia: string;
  insumo_id: number;
  cantidad: number;
  origen: OrigenEntrada;
  recepcion_id: number | null;
  sku: string | null;
  proveedor: string | null;
  nota: string | null;
  anulada: boolean;
  corrige_id: number | null;
  motivo_correccion: string | null;
  barista_id: number | null;
  nombre: string;
  registrado_por: string;
  registrado_en: string;
}
/** Entrada de un pedido, ya convertida a la unidad de la lista (la arma el servidor al recibir). */
export interface EntradaPedido {
  insumo: number;
  cantidad: number;
  sku: string | null;
}

export interface FuncionesFranq {
  franq_ficha_recetas: { Args: { p_company: number }; Returns: unknown };
  franq_nivel_servicio: { Args: { p_company: number; p_desde: string; p_hasta: string }; Returns: unknown };
  franq_roles_base: { Args: { p_company: number }; Returns: number };
  franq_posicion_guardar: {
    Args: { p_company: number; p_id: number | null; p_nombre: string; p_orden: number | null; p_activo: boolean };
    Returns: number;
  };
  franq_turno_guardar: {
    Args: {
      p_company: number;
      p_id: number | null;
      p_nombre: string;
      p_entrada: string;
      p_salida: string;
      p_activo: boolean;
    };
    Returns: number;
  };
  franq_asignar: {
    Args: {
      p_company: number;
      p_dia: string;
      p_turno: number;
      p_posicion: number;
      p_barista: number;
      p_quitar: boolean;
    };
    Returns: number | null;
  };
  franq_copiar_semana: { Args: { p_company: number; p_lunes: string }; Returns: number };
  franq_registrar_merma: {
    Args: {
      p_company: number;
      p_insumo: number | null;
      p_cantidad: number | null;
      p_motivo: string | null;
      p_nota: string | null;
      p_barista: number | null;
      p_dispositivo: string | null;
      p_corrige: number | null;
      p_anular: boolean;
      p_motivo_correccion: string | null;
    };
    Returns: number;
  };
  franq_cerrar_mermas: { Args: { p_company: number; p_dia: string }; Returns: undefined };
  franq_tolerancia_guardar: { Args: { p_company: number; p_insumo: number; p_pct: number }; Returns: number };
  franq_gasto_fijo: {
    Args: { p_company: number; p_mes: string; p_concepto: string; p_monto: number; p_nota: string | null };
    Returns: number;
  };
  franq_arquear: {
    Args: {
      p_company: number;
      p_momento: MomentoArqueo;
      p_contado: number;
      p_observacion: string | null;
      p_barista: number | null;
      p_dispositivo: string | null;
    };
    Returns: number;
  };
  franq_arqueo_estado: { Args: { p_company: number; p_dia: string }; Returns: EstadoArqueo[] };
  franq_gasto: {
    Args: {
      p_company: number;
      p_concepto: string;
      p_categoria: string;
      p_monto: number;
      p_en_efectivo: boolean;
      p_comprobante: boolean;
      p_nota: string | null;
      p_dispositivo: string | null;
    };
    Returns: number;
  };
  franq_gasto_anular: {
    Args: { p_gasto: number; p_motivo: string; p_dispositivo: string | null };
    Returns: number;
  };
  franq_caja_configurar: {
    Args: { p_company: number; p_fondo: number; p_tolerancia: number };
    Returns: undefined;
  };
  franq_sugerir_insumos: { Args: { p_company: number }; Returns: number };
  franq_insumo_guardar: {
    Args: {
      p_company: number;
      p_id: number | null;
      p_nombre: string;
      p_unidad: string;
      p_orden: number | null;
      p_activo: boolean;
    };
    Returns: number;
  };
  franq_contar: {
    Args: {
      p_company: number;
      p_momento: MomentoConteo;
      p_conteos: { insumo: number; cantidad: number }[];
      p_barista: number | null;
      p_dispositivo: string | null;
    };
    Returns: number;
  };
  franq_conteo_estado: { Args: { p_company: number; p_dia: string }; Returns: EstadoConteo[] };
  franq_recibir: {
    Args: {
      p_company: number;
      p_pedido: string;
      p_folio: string | null;
      p_diferencias: DiferenciaRecepcion[];
      p_observacion: string | null;
      p_barista: number | null;
      p_dispositivo: string | null;
      p_entradas?: EntradaPedido[];
    };
    Returns: number;
  };
  franq_registrar_entrada: {
    Args: {
      p_company: number;
      p_insumo: number | null;
      p_cantidad: number | null;
      p_proveedor: string | null;
      p_nota: string | null;
      p_barista: number | null;
      p_dispositivo: string | null;
      p_corrige: number | null;
      p_anular: boolean;
      p_motivo_correccion: string | null;
    };
    Returns: number;
  };
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
      p_dato?: string | null;
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
      p_dato?: string | null;
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
