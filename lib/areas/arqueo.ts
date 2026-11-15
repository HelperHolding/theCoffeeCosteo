import { COD_TPV, type ArqueoCaja, type TicketCompleto } from './tipos';

/**
 * Nuestro POS no tiene corte Z: un arqueo por día, sin conteo físico (Descuadres 0). NUM_SES va en 0 porque Areas asigna
 * sus consecutivos, y la Hora lleva fecha y hora del último ticket (correo de Areas, 2026-11-11).
 */
export function aArqueo(fecha: string, tickets: TicketCompleto[]): ArqueoCaja {
  const horas = tickets.map((t) => t.Cabecera.MOM_OPE.slice(11)).sort();
  const cent = tickets.reduce((s, t) => s + Math.round(t.Cabecera.IMP_VEN * 100), 0);
  return {
    COD_TPV,
    NUM_SES: 0,
    Fecha: fecha,
    Hora: `${fecha}T${horas.at(-1) ?? '00:00:00'}`,
    Monto: cent / 100,
    Descuadres: 0,
  };
}
