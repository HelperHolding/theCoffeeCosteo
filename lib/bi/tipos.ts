// Contratos de las RPC del tablero BI y de las rutas que las sirven.

export interface RpcTablero {
  cargas: { esperados: number; con_carga: number; incompletos: number };
  kpis: { venta_cent: number; venta_bruta_cent: number; tickets: number; lineas: number; unidades: number };
  por_grupo: { grupo: string; venta_cent: number }[];
  por_cafe: { cafe: string; venta_cent: number }[];
  por_master: { categoria: string; venta_cent: number }[];
  por_fecha: { fecha: string; venta_cent: number; tickets: number }[];
  por_dia: { dow: number; venta_cent: number; tickets: number }[];
  por_hora: { hora: number; venta_cent: number; tickets: number }[];
  por_pago: { etiqueta: string; venta_cent: number; tickets: number }[];
  por_pago_tienda: { etiqueta: string; company_id: number; venta_cent: number }[];
  por_tienda_dia: { company_id: number; dow: number; venta_cent: number; tickets: number }[];
  promociones: { company_id: number; promocion: string; unidades: number; venta_cent: number }[];
  ranking: { codigo: string; nombre: string; mes: string; unidades: number; venta_cent: number; lineas: number }[];
  fuentes: { fuente: string; canal: string; venta_cent: number }[];
  /** Desde la migración 74; sin ella (base anterior) no llega y la pantalla dice «sin datos». */
  metas?: RpcMetas;
}

/** bi_kpis (migración 76): los mismos kpis y cargas de bi_tablero para otro periodo. */
export interface RpcKpis {
  kpis: RpcTablero['kpis'];
  cargas: RpcTablero['cargas'];
}

/** /api/bi/kpis: KPI del periodo anterior. Con filtro de semanas no hay periodo anterior claro. */
export type RespuestaKpis =
  | { sinComparacion: 'semanas' }
  | {
      periodo: { desde: string; hasta: string };
      horaCorte: number | null;
      kpis: RpcKpis['kpis'] | null;
      cargas: RpcKpis['cargas'] | null;
    };

/**
 * Metas y P.E. de las tiendas filtradas (solo filtros de tienda, día de la semana y semana). «Corriente» = solo los
 * días de tienda con carga del POS, con la venta de esos mismos días.
 */
export interface RpcMetas {
  tiendas: number;
  tiendas_con_meta: number;
  dias_sin_meta: number;
  meta_cent: number;
  meta_tickets: number;
  meta_corriente_cent: number;
  meta_tickets_corriente: number;
  venta_corriente_cent: number;
  tickets_corriente: number;
  por_tienda: { company_id: number; meta_cent: number; meta_corriente_cent: number; venta_corriente_cent: number }[];
  tiendas_con_pe: number;
  pe_cent: number;
  pe_corriente_cent: number;
  venta_pe_corriente_cent: number;
  pe_por_tienda: { company_id: number; pe_cent: number; pe_corriente_cent: number; venta_corriente_cent: number }[];
}

export interface TiendaBi {
  company_id: number;
  store_id: number;
  nombre: string;
  franquiciatario: string | null;
  tipo: string;
}

export interface RpcOpciones {
  tiendas: TiendaBi[];
  franquiciatarios: string[];
  tipos: string[];
  categorias: string[];
  grupos: string[];
  productos: string[];
  pagos: string[];
  semanas: string[];
  ultimo_corte: string | null;
  tiendas_sin_rappi: number;
}

export interface RpcTendencias {
  por_mes: { anio: number; mes: number; venta_cent: number }[];
  por_semana: { anio: number; semana: number; venta_cent: number }[];
}

// `tablero` y `tendencias` son null cuando ninguna tienda pasa los filtros.
export interface RespuestaTablero {
  periodo: { desde: string; hasta: string };
  hoy: string;
  tablero: RpcTablero | null;
  opciones: RpcOpciones;
}

export interface RespuestaTendencias {
  hoy: string;
  tendencias: RpcTendencias | null;
}
