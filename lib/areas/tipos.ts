import { z } from 'zod';

/**
 * Cuerpos de la API de Areas México (Doc Técnico v1.1, 2026-09-08, y hoja «DATOS API 1.1»). Ver
 * docs/superpowers/specs/2026-11-09-areas-api-ventas-design.md.
 */
export const COD_TPV = 'TC01';

const monto = z.number().finite();
const entero = z.number().int();

export const CabeceraEsquema = z.object({
  COD_TPV: z.string().min(1).max(20),
  NUM_SES: entero.positive(),
  NUM_TIK: entero.positive(),
  TIP_OPE: z.enum(['V', 'D']),
  MOM_OPE: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/),
  IMP_VEN: monto.min(0),
  ID_MVO_DTO: entero,
  IMP_DTG: monto.min(0),
});
export const DetalleEsquema = z.object({
  NUM_LIN: entero.positive(),
  COD_ART: entero.positive(),
  DES_ART: z.string().min(1).max(150),
  UNI_VEN: monto.positive(),
  PRE_UNI: monto.min(0),
  PRE_UNI_SIN_IVA: monto.min(0),
  PRE_UNI_SIN_IEPS: monto.min(0),
  PRE_FIN: monto.min(0),
  IMP_DTO: monto.min(0),
  POR_IVA: monto.min(0),
  BAS_IVA: monto.min(0),
  IMP_IVA: monto.min(0),
  POR_IEPS: monto.min(0),
  BAS_IEPS: monto.min(0),
  IMP_IEPS: monto.min(0),
});
export const FormaPagoEsquema = z.object({
  NUM_ORD: entero.positive(),
  COD_FPG: entero.positive(),
  COD_MON: entero.positive(),
  IMP_FPG: monto,
  IMP_DIV: monto,
  CAM_MON: monto.positive(),
});
export const TicketCompletoEsquema = z.object({
  Cabecera: CabeceraEsquema,
  Detalles: z.array(DetalleEsquema).min(1),
  FormasDePago: z.array(FormaPagoEsquema).min(1),
});
export const ArqueoCajaEsquema = z.object({
  COD_TPV: z.string().min(1).max(4),
  NUM_SES: entero.positive(),
  Fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  Hora: z.string().regex(/^\d{2}:\d{2}:\d{2}$/),
  Monto: monto,
  Descuadres: monto,
});

export type Cabecera = z.infer<typeof CabeceraEsquema>;
export type Detalle = z.infer<typeof DetalleEsquema>;
export type FormaPago = z.infer<typeof FormaPagoEsquema>;
export type TicketCompleto = z.infer<typeof TicketCompletoEsquema>;
export type ArqueoCaja = z.infer<typeof ArqueoCajaEsquema>;
