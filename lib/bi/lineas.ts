import { importeLinea, type PedidoNormal } from '../sucursales/normalizar';

/**
 * Ventas por línea para el BI (docs/bi/01-BASE.md, «Contrato de carga (F2)»): una fila por línea del pedido, con el
 * importe de la línea más sus modificadores (IVA incluido, como «Net Amount (Local)» de Zoho). Sin datos de clientes.
 * La base normaliza el código (bi_codigo); aquí va tal como lo dio el POS (defaultCode o, si falta, productName).
 */
export interface LineaBi {
  pedido: string;
  linea: number;
  hora: number;
  canal: 'mostrador' | 'app' | 'rappi' | 'desconocido';
  metodo_pago: string;
  tipo_pago: string;
  smartphone: boolean;
  opcion_consumo: null;
  codigo: string;
  nombre: string;
  unidades: number;
  /** Lo cobrado (grossAmount repartido por línea). */
  importe_cent: number;
  /** Neto de la API tras la comisión del pago (netAmout), prorrateado por línea: es la «Venta Neta» de Zoho. */
  importe_neto_cent: number;
  descuento_cent: number;
}

/** El POS manda el importe ya descontado y el descuento de línea como porcentaje: se deriva el monto. */
const descuentoCent = (importeCent: number, pct: number) =>
  pct > 0 && pct < 100 ? Math.round(importeCent / (1 - pct / 100)) - importeCent : 0;

/**
 * Neto de cada línea de un pedido. Factor f = netoCent / ventaCent; sin neto (p. ej. Rappi del portal) o sin venta,
 * f = 1 y el neto es lo cobrado. Si el pedido cuadra y trae neto, la última línea absorbe el redondeo para que la suma
 * de netos sea exactamente netoCent; si no cuadra, solo se redondea por línea.
 */
function netosDelPedido(p: PedidoNormal, importes: number[]): number[] {
  const hayNeto = p.netoCent != null && p.ventaCent > 0;
  const f = hayNeto ? p.netoCent! / p.ventaCent : 1;
  const netos = importes.map((i) => Math.round(i * f));
  if (hayNeto && p.cuadra && netos.length > 0) {
    const previas = netos.slice(0, -1).reduce((s, n) => s + n, 0);
    netos[netos.length - 1] = p.netoCent! - previas;
  }
  return netos;
}

export function lineasBi(pedidos: PedidoNormal[]): LineaBi[] {
  return pedidos.flatMap((p) => {
    const importes = p.lineas.map(importeLinea);
    const netos = netosDelPedido(p, importes);
    return p.lineas.map((l, i) => ({
      pedido: String(p.id),
      linea: i + 1,
      hora: Math.min(23, Math.floor(p.segundo / 3600)),
      canal: p.origen,
      metodo_pago: p.metodo || 'SIN_DATO',
      tipo_pago: p.tipo || '',
      smartphone: p.origen === 'app',
      opcion_consumo: null,
      codigo: l.codigo,
      nombre: l.nombre,
      unidades: 1,
      importe_cent: importes[i],
      importe_neto_cent: netos[i],
      descuento_cent: descuentoCent(l.importeCent, l.descuentoPct),
    }));
  });
}
