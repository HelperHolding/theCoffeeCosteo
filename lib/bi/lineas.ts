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
  importe_cent: number;
  descuento_cent: number;
}

/** El POS manda el importe ya descontado y el descuento de línea como porcentaje: se deriva el monto. */
const descuentoCent = (importeCent: number, pct: number) =>
  pct > 0 && pct < 100 ? Math.round(importeCent / (1 - pct / 100)) - importeCent : 0;

export function lineasBi(pedidos: PedidoNormal[]): LineaBi[] {
  return pedidos.flatMap((p) =>
    p.lineas.map((l, i) => ({
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
      importe_cent: importeLinea(l),
      descuento_cent: descuentoCent(l.importeCent, l.descuentoPct),
    })),
  );
}
