export interface ArticuloCatalogo {
  sku: string;
  nombre: string | null;
  zoho_stock: number | null;
  zoho_stock_fisico: number | null;
  zoho_sync_at: string | null;
  saldo_cedis: number | null;
  saldo_yulius: number | null;
  costo_unitario: number | null;
  zoho_vendor_id: string | null;
  zoho_vendor_name: string | null;
  estatus?: string | null;
}
export interface CompraProyectada {
  sku: string;
  fecha_oc: string;
  cantidad: number;
  monto: number;
  adelanto_cierre?: boolean;
  cierre_tarde?: boolean;
  adelanto_minimo?: boolean;
  bajo_minimo?: boolean;
  cierre_id?: number | null;
}
export interface LineaOcZoho {
  sku: string;
  status: string | null;
  cantidad: number | null;
  cantidad_recibida: number | null;
}
export interface MinMax {
  sku: string;
  venta_diaria: number | null;
}
export interface ResumenProyeccion {
  calculado_at?: string;
  sinCosto?: string[];
  sinProveedor?: string[];
  cierres?: { id: number; u: string | null; ini: string; fin: string; monto_adelanto?: number }[];
  filas?: number;
}
