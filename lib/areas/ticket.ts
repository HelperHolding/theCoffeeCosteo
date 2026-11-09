import { importeLinea, type PedidoNormal } from '../sucursales/normalizar';
import type { Catalogo } from './catalogo';
import { codigoPago } from './pagos';
import { COD_TPV, type TicketCompleto } from './tipos';

export type ResultadoTicket = { ok: true; ticket: TicketCompleto } | { ok: false; motivo: string };

const IVA = 0.16;
const pesos = (c: number) => Math.round(c) / 100;
/** Nuestro POS no tiene corte Z: la sesión es el día (AAAAMMDD). */
export const sesionDe = (fecha: string) => Number(fecha.replaceAll('-', ''));

/**
 * Un pedido del POS (o de Rappi del portal) como TicketCompleto de Areas. Montos en centavos hasta el final. Precio
 * antes del descuento de línea e IVA sobre ese precio, como el ejemplo del Doc Técnico (BAS_IVA 600 = 2 × 300 con
 * IMP_DTO aparte). Spec: docs/superpowers/specs/2026-11-09-areas-api-ventas-design.md §3.
 */
export function aTicket(p: PedidoNormal, catalogo: Catalogo): ResultadoTicket {
  const fpg = codigoPago(p);
  if (fpg === null) return { ok: false, motivo: `Forma de pago sin mapeo: ${p.metodo} / ${p.tipo}` };
  if (!p.lineas.length) return { ok: false, motivo: 'Sin líneas' };

  const lineas = p.lineas.map((l) => {
    const importe = importeLinea(l);
    const preUni =
      l.descuentoPct >= 100
        ? Math.round((catalogo.precioDe(l.codigo) ?? 0) * 100)
        : Math.round(importe / (1 - l.descuentoPct / 100));
    const bas = Math.round(preUni / (1 + IVA));
    return { l, preUni, dto: preUni - importe, bas };
  });
  const dtg = lineas.reduce((s, x) => s + x.preUni, 0) - p.ventaCent;
  // dif = Σ importe − cobrado: positivo es un descuento de pedido; negativo, líneas que no alcanzan lo cobrado.
  const dif = dtg - lineas.reduce((s, x) => s + x.dto, 0);
  if (dif < -100 || dtg < 0)
    return {
      ok: false,
      motivo: `Las líneas suman $${(-Math.min(dif, dtg) / 100).toFixed(2)} menos que lo cobrado`,
    };

  const venta = pesos(p.ventaCent);
  return {
    ok: true,
    ticket: {
      Cabecera: {
        COD_TPV,
        NUM_SES: sesionDe(p.fecha),
        NUM_TIK: p.id,
        TIP_OPE: 'V',
        MOM_OPE: `${p.fecha} ${p.hora}`,
        IMP_VEN: venta,
        ID_MVO_DTO: 0,
        IMP_DTG: pesos(dtg),
      },
      Detalles: lineas.map((x, i) => ({
        NUM_LIN: i + 1,
        COD_ART: catalogo.codArt(x.l.codigo, x.l.nombre),
        DES_ART: x.l.nombre.trim().slice(0, 150),
        UNI_VEN: 1,
        PRE_UNI: pesos(x.preUni),
        PRE_UNI_SIN_IVA: pesos(x.bas),
        PRE_UNI_SIN_IEPS: pesos(x.bas),
        PRE_FIN: pesos(x.preUni),
        IMP_DTO: pesos(x.dto),
        POR_IVA: 16,
        BAS_IVA: pesos(x.bas),
        IMP_IVA: pesos(x.preUni - x.bas),
        POR_IEPS: 0,
        BAS_IEPS: 0,
        IMP_IEPS: 0,
      })),
      FormasDePago: [{ NUM_ORD: 1, COD_FPG: fpg, COD_MON: 1, IMP_FPG: venta, IMP_DIV: venta, CAM_MON: 1 }],
    },
  };
}
