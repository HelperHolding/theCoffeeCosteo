/** Datos leídos de Zoho Books ya mapeados (spec §3). Fechas en ISO YYYY-MM-DD; '' si Zoho no la trae. */
export type Factura = {
  numero: string; ov: string; fecha: string; vence: string; cliente: string;
  sucursal: string; tipoEnvio: string; total: number; saldo: number; estado: string;
};
/** Un paquete de una OV; `envio` = shipment_date o '' si no ha salido. */
export type Paquete = { ov: string; fecha: string; envio: string };
export type Ov = {
  id: string; numero: string; fecha: string; cliente: string; sucursal: string; tipoEnvio: string;
  incidencia: string; resolucion: string; estado: string; estadoEnvio: string;
};
export type NotaCredito = {
  numero: string; fecha: string; cliente: string; sucursal: string; total: number; estado: string; descripcion: string;
};
export type Seccion<T> = { ok: true; datos: T } | { ok: false; error: string };
