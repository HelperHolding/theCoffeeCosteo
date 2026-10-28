// Contrato basado en las migraciones locales. numeric llega como número vía PostgREST.
import type * as Crm from '../crm/tipos';
export type Rol = 'compras' | 'operaciones' | 'finanzas' | 'admin';
export type Unidad = 'gr' | 'ml' | 'pza';
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json | undefined };
export interface Catalogo {
  id: string;
  nombre: string;
  activo: boolean;
}
export interface Perfil {
  user_id: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
}
export type NivelModulo = 'desarrollador' | 'edicion' | 'lectura';
export interface PerfilModulo {
  user_id: string;
  modulo: 'crm' | 'sucursales';
  nivel: NivelModulo;
  creado_en: string;
}
export interface Receta {
  id: string;
  nombre: string;
  tipo: 'producto' | 'subreceta';
  categoria_id: string | null;
  rendimiento: number | null;
  unidad_rendimiento: Unidad | null;
  activo: boolean;
  version: number;
  updated_at: string;
  updated_by: string | null;
}
export interface Insumo extends Catalogo {
  proveedor_id: string;
  categoria_id: string;
  costo_paquete: number;
  presentacion: number;
  unidad: Unidad;
  costo_unitario: number;
  updated_at: string;
  updated_by: string | null;
}
export interface Linea {
  id: string;
  receta_id: string;
  insumo_id: string | null;
  subreceta_id: string | null;
  orden: number;
}
export interface Cantidad {
  linea_id: string;
  tamano_id: string | null;
  cantidad: number;
}
export interface Tamano {
  id: string;
  nombre: string;
  orden: number;
}
export interface ProductoTamano {
  producto_id: string;
  tamano_id: string;
  precio_lista: number | null;
}
/** Enlace código POS → receta (migración 22). */
export interface ProductoCodigoPos {
  id: string;
  codigo: string;
  receta_id: string;
  nombre_observado: string;
  evidencia: string;
  carga_id: string | null;
  creado_en: string;
  creado_por: string | null;
}
export interface Canal {
  id: string;
  nombre: string;
  regla_precio: 'mostrador' | 'castigado';
  comision_pct: number;
  comision_confirmada: boolean;
  costo_envase: number;
  markup_max_pct: number | null;
  orden: number;
  updated_at: string;
  updated_by: string | null;
}
export interface Parametros {
  id: number;
  iva: number;
  margen_objetivo: number;
  updated_at: string;
  updated_by: string | null;
}
export interface Manual {
  producto_id: string;
  tamano_id: string;
  canal_id: string;
  precio: number;
  nota: string | null;
}
export interface Resumen {
  producto_id: string;
  producto: string;
  activo: boolean;
  categoria_id: string;
  categoria: string;
  tamano_id: string;
  tamano: string;
  tamano_orden: number;
  canal_id: string;
  canal: string;
  canal_orden: number;
  regla_precio: string;
  comision_pct: number;
  comision_confirmada: boolean;
  costo_envase: number;
  markup_max_pct: number | null;
  precio_lista: number | null;
  costo: number;
  usa_inactivo: boolean;
  iva: number;
  margen_objetivo: number;
  precio_calculado: number | null;
  precio_manual: number | null;
  precio_canal: number | null;
  venta_neta: number | null;
  food_cost: number | null;
  margen: number | null;
  margen_pct: number | null;
  markup: number | null;
  margen_bruto: number | null;
  margen_bruto_pct: number | null;
  comision: number | null;
}
export interface Alerta {
  producto_id: string;
  producto: string;
  categoria: string;
  canal_id: string;
  canal: string;
  canal_orden: number;
  alerta: string | null;
}
/** Sucursal de la API The Coffee (company_id) asignada explícitamente a un usuario. */
export interface PerfilSucursal {
  user_id: string;
  company_id: number;
  creado_en: string;
}
/** Analytics (migración 23): tiendas de México incluidas y agregados diarios. Solo lectura desde el portal. */
export interface AnalyticsTienda {
  company_id: number;
  store_id: number;
  nombre: string;
  relaciones: string[];
  verificado_en: string;
}
export interface AnalyticsLectura {
  fuente: string;
  company_id: number;
  fecha: string;
  leido_en: string;
  provisional: boolean;
  version_calculo: string;
  criterio_fecha: string;
  origen: string;
  carga_id: string;
  cargado_en: string;
}
export interface AnalyticsVentaDiaria {
  fuente: string;
  company_id: number;
  fecha: string;
  canal: string;
  venta_cent: number;
  tickets: number;
  unidades: number;
}
export interface AnalyticsVentaKpi {
  company_id: number;
  store_id: number;
  tienda: string;
  fecha: string;
  provisional: boolean;
  leido_en: string;
  venta_cent: number;
  tickets: number;
  unidades: number;
  mostrador_cent: number;
  app_cent: number;
  rappi_pos_tickets: number;
  rappi_pos_cent: number;
  sin_origen_tickets: number;
}
export interface Bitacora {
  id: number;
  tabla: string;
  registro_id: string | null;
  receta_id: string | null;
  campo: string | null;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  nota: string | null;
  usuario_id: string | null;
  fecha: string;
  origen: string;
}
type Registro<R> = { [K in keyof R]: R[K] };
type Tabla<R> = {
  Row: Registro<R>;
  Insert: Partial<Registro<R>>;
  Update: Partial<Registro<R>>;
  Relationships: [];
};
export interface Database {
  public: {
    Tables: {
      perfiles: Tabla<Perfil>;
      perfil_modulos: Tabla<PerfilModulo>;
      perfil_sucursales: Tabla<PerfilSucursal>;
      analytics_tiendas: Tabla<AnalyticsTienda>;
      analytics_lecturas: Tabla<AnalyticsLectura>;
      analytics_ventas_diarias: Tabla<AnalyticsVentaDiaria>;
      recetas: Tabla<Receta>;
      insumos: Tabla<Insumo>;
      proveedores: Tabla<Catalogo>;
      categorias_insumo: Tabla<Catalogo>;
      categorias_producto: Tabla<Catalogo & { orden: number }>;
      tamanos: Tabla<Tamano>;
      canales: Tabla<Canal>;
      parametros: Tabla<Parametros>;
      receta_lineas: Tabla<Linea>;
      linea_cantidades: Tabla<Cantidad>;
      producto_tamanos: Tabla<ProductoTamano>;
      producto_codigo_pos: Tabla<ProductoCodigoPos>;
      precio_canal_manual: Tabla<Manual>;
      bitacora: Tabla<Bitacora>;
      crm_etapas: Tabla<Crm.Etapa>;
      crm_tiendas: Tabla<Crm.Tienda>;
      crm_prospectos: Tabla<Crm.Prospecto>;
      crm_contactos: Tabla<Crm.Contacto>;
      crm_tienda_contactos: Tabla<Crm.TiendaContacto>;
      crm_actividades: Tabla<Crm.Actividad>;
      crm_notas: Tabla<Crm.Nota>;
      crm_etiquetas: Tabla<Crm.Etiqueta>;
      crm_etiquetas_registro: Tabla<Crm.EtiquetaRegistro>;
      crm_checklists: Tabla<Crm.Checklist>;
      crm_checklist_items: Tabla<Crm.ChecklistItem>;
      crm_archivos: Tabla<Crm.Archivo>;
      crm_historial: Tabla<Crm.Historial>;
    };
    Views: {
      analytics_ventas_kpi: { Row: Registro<AnalyticsVentaKpi>; Relationships: [] };
      v_resumen: { Row: Registro<Resumen>; Relationships: [] };
      v_alerta_producto_canal: { Row: Registro<Alerta>; Relationships: [] };
      v_costo_producto: {
        Row: { producto_id: string; tamano_id: string; costo: number; usa_inactivo: boolean };
        Relationships: [];
      };
      v_costo_subreceta: {
        Row: { subreceta_id: string; costo_unitario: number; usa_inactivo: boolean };
        Relationships: [];
      };
    };
    Functions: {
      guardar_receta: { Args: { p_datos: Json }; Returns: Json };
      mcp_lectura_habilitada: { Args: Record<string, never>; Returns: boolean };
      reservar_consulta_chat: { Args: Record<string, never>; Returns: boolean };
      crm_mover_tienda: {
        Args: { p_tienda: string; p_etapa: string; p_posicion: number; p_version: number };
        Returns: Crm.Tienda;
      };
      crm_renumerar_etapa: { Args: { p_etapa: string }; Returns: number };
    };
    Enums: { unidad: Unidad };
    CompositeTypes: Record<string, never>;
  };
}
