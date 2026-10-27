import type { CosteoProducto, CosteoResumen } from './costeo';
import type { FiltroOrigen, Insight, ProductoResumen, Resumen } from './metricas';
import type { Origen } from './normalizar';

/** Contratos JSON entre los route handlers de Sucursales y el navegador. Sin datos crudos del proveedor. */
export interface SucursalInfo {
  companyId: number;
  nombre: string;
  ciudad: string;
  moneda: string;
  zona: string;
  alcance: string;
  sonidoVenta: string | null;
}

export interface LecturaInfo {
  desde: string;
  hasta: string;
  /** epoch ms de la lectura al proveedor (puede venir de caché). */
  leidoEn: number;
  estado: 'completa' | 'parcial' | 'error';
  error: string | null;
  avisos: string[];
  totalDeclarado: number | null;
  pedidos: number;
}

export interface PedidoVista {
  id: number;
  fecha: string;
  hora: string;
  ventaCent: number;
  descuentoCent: number;
  origen: Origen;
  pago: string;
  /** Código de la API (CARTAO, DINHEIRO…), para el color de la etiqueta. */
  metodo: string;
  /** Orden en Rappi (validada en el servidor); null fuera de Rappi o si la API no la trae. */
  numeroPedidoRappi: string | null;
  lineas: {
    codigo: string;
    nombre: string;
    importeCent: number;
    descuentoPct: number;
    customs: { codigo: string; nombre: string; importeCent: number; descuentoPct: number }[];
  }[];
}

export interface Conciliacion {
  ventaCent: number;
  productosCent: number;
  diferenciaCent: number;
  pedidosNoCuadran: number;
  /** Todas las diferencias son de ±1 centavo por pedido (redondeo del proveedor). */
  soloRedondeo: boolean;
  /** Pedidos Rappi sin número de orden válido: detecta si el proveedor cambia el contenido de refundId. */
  rappiSinNumeroOrden: number;
}

export interface RespuestaVivo {
  sucursal: SucursalInfo;
  origen: FiltroOrigen;
  /** Instante de corte común a KPIs, curva e insights: segundo local inclusivo. */
  corte: { fecha: string; segundo: number; hora: string; generadoEn: number };
  base: { fecha: string; dia: string };
  lecturas: { hoy: LecturaInfo; base: LecturaInfo };
  kpis: Resumen;
  kpisBase: Resumen | null;
  comparativo: { venta: number | null; pedidos: number | null; ticket: number | null } | null;
  /** Venta acumulada por hora: hoy hasta la hora del corte (null después); base el día completo. */
  curva: { hoy: (number | null)[]; base: number[] | null };
  /** Pedidos y venta por hora: hoy hasta el corte; base el día completo (null si la base no es completa). */
  porHora: {
    hoy: { pedidos: number; ventaCent: number }[];
    base: { pedidos: number; ventaCent: number }[] | null;
  };
  /** Desglose del conjunto de hoy por origen (siempre sobre todos los orígenes). */
  origenes: { origen: Origen; pedidos: number; ventaCent: number; participacion: number | null }[];
  ritmo: { ultimos15: number; ultimos60: number };
  ultimoPedido: { hora: string; haceSeg: number } | null;
  posterioresAlCorte: number;
  productosTop: ProductoResumen[];
  ultimosPedidos: PedidoVista[];
  pagos: {
    metodo: string;
    etiqueta: string;
    pedidos: number;
    ventaCent: number;
    participacion: number | null;
  }[];
  insights: Insight[];
  conciliacion: Conciliacion;
}

export interface RespuestaProductos {
  sucursal: SucursalInfo;
  origen: FiltroOrigen;
  lectura: LecturaInfo;
  totales: Resumen;
  /** `costeo` solo viene si el usuario puede ver costos (se decide en el servidor). */
  productos: (ProductoResumen & { costeo?: CosteoProducto })[];
  personalizaciones: { nombre: string; veces: number; importeCent: number }[];
  conciliacion: Conciliacion;
  /** Cobertura y costeo con el costo ACTUAL de Costeo; ausente para usuarios sin permiso de costos. */
  costeo?: CosteoResumen;
}

export interface RespuestaPedidos {
  sucursal: SucursalInfo;
  origen: FiltroOrigen;
  pago: string | null;
  lectura: LecturaInfo;
  total: number;
  pagina: number;
  paginas: number;
  porPagina: number;
  pedidos: PedidoVista[];
  metodos: { metodo: string; etiqueta: string }[];
}

export interface RespuestaError {
  error: string;
}

export interface SemanaTendencia {
  desde: string;
  hasta: string;
  lectura: LecturaInfo;
  /** null si la lectura de la semana no está completa (nunca se presenta como dato definitivo). */
  kpis: Resumen | null;
  pagos: {
    metodo: string;
    etiqueta: string;
    pedidos: number;
    ventaCent: number;
    participacion: number | null;
  }[];
  origenes: { origen: Origen; pedidos: number; ventaCent: number; participacion: number | null }[];
  /** Venta contra la semana anterior; null sin base comparable o con alguna lectura incompleta. */
  variacionVenta: number | null;
}

export interface RespuestaTendencias {
  sucursal: SucursalInfo;
  origen: FiltroOrigen;
  semanas: SemanaTendencia[];
  semanasCompletas: number;
  /** Totales solo de semanas completas. */
  totales: Resumen;
  /**
   * Pedidos promedio por día (lunes = 0) y hora sobre las semanas completas.
   * null si no hay ninguna semana completa (sin datos); 0 = la tienda no tuvo pedidos en esa celda.
   */
  mapa: (number | null)[][];
  conciliacion: Conciliacion;
}
