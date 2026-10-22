import { z } from 'zod';
import type { ConfigSucursal } from './config';
import { momentoPedido, textoHora } from './tiempo';

/**
 * Normalización de pedidos de la API. Semántica observada (docs/sucursales/03):
 * - grossAmount = importe cobrado, ya descontado = Σ items.amount + Σ itemsCustom.amount.
 * - discount del pedido = monto; discount de línea/custom = porcentaje (amount ya lo tiene aplicado).
 * - fromSmartphone = App The Coffee. No se usa paymentType ni refundId como origen.
 * netAmout se conserva como `netoCent` ("neto reportado por la API"; definición pendiente del proveedor),
 * útil en Rappi, donde es menor que lo cobrado. No se conservan percentageOfTransfer ni refundId.
 * Un registro inválido NO se convierte en cero: se excluye y la lectura se marca incompleta.
 */
const Custom = z.object({
  defaultCode: z.string().nullish(),
  productName: z.string(),
  amount: z.number(),
  discount: z.number(),
});
const Item = Custom.extend({ itemsCustom: z.array(Custom).nullish() });
const PedidoApi = z.object({
  id: z.number().int(),
  companyId: z.number().int(),
  fromSmartphone: z.boolean().nullish(),
  grossAmount: z.number(),
  netAmout: z.number().nullish(),
  discount: z.number(),
  paymentMethod: z.string().nullish(),
  paymentType: z.string().nullish(),
  items: z.array(Item),
  createdAt: z.string(),
});

/** `rappi`: forma de pago RAPPI (agregador). Fuera del alcance de Ventas POS: se excluye y se reporta aparte. */
export type Origen = 'mostrador' | 'app' | 'rappi' | 'desconocido';

export interface CustomNormal {
  codigo: string;
  nombre: string;
  importeCent: number;
  descuentoPct: number;
}
export interface LineaNormal extends CustomNormal {
  customs: CustomNormal[];
}
export interface PedidoNormal {
  id: number;
  fecha: string;
  segundo: number;
  hora: string;
  origen: Origen;
  ventaCent: number;
  /** netAmout en centavos (null si no viene). */
  netoCent: number | null;
  descuentoCent: number;
  metodo: string;
  tipo: string;
  lineas: LineaNormal[];
  /** ventaCent = Σ líneas + Σ customs. Si es false, la conciliación lo reporta (no se ajusta). */
  cuadra: boolean;
}

export const centavos = (x: number) => Math.round(x * 100);

const custom = (c: z.infer<typeof Custom>): CustomNormal => ({
  codigo: c.defaultCode || c.productName,
  nombre: c.productName,
  importeCent: centavos(c.amount),
  descuentoPct: c.discount,
});

export const importeLinea = (l: LineaNormal) =>
  l.importeCent + l.customs.reduce((s, c) => s + c.importeCent, 0);

export interface Normalizados {
  pedidos: PedidoNormal[];
  invalidos: number;
  fueraDeVentana: number;
}

export function normalizar(
  registros: Record<string, unknown>[],
  cfg: Pick<ConfigSucursal, 'companyId' | 'modoTiempo' | 'zona'>,
  ventana: { desde: string; hasta: string },
): Normalizados {
  const pedidos: PedidoNormal[] = [];
  let invalidos = 0;
  let fueraDeVentana = 0;
  for (const r of registros) {
    const p = PedidoApi.safeParse(r);
    if (!p.success || p.data.companyId !== cfg.companyId) {
      invalidos++;
      continue;
    }
    const d = p.data;
    const m = momentoPedido(d.createdAt, cfg.modoTiempo, cfg.zona);
    if (!m) {
      invalidos++;
      continue;
    }
    // Un pedido fuera de la ventana pedida delata una interpretación horaria equivocada.
    if (m.fecha < ventana.desde || m.fecha > ventana.hasta) {
      fueraDeVentana++;
      continue;
    }
    const lineas = d.items.map((i) => ({ ...custom(i), customs: (i.itemsCustom ?? []).map(custom) }));
    const ventaCent = centavos(d.grossAmount);
    pedidos.push({
      id: d.id,
      fecha: m.fecha,
      segundo: m.segundo,
      hora: textoHora(m.segundo, true),
      origen:
        d.paymentMethod === 'RAPPI'
          ? 'rappi'
          : d.fromSmartphone === true
            ? 'app'
            : d.fromSmartphone === false
              ? 'mostrador'
              : 'desconocido',
      ventaCent,
      netoCent: d.netAmout === null || d.netAmout === undefined ? null : centavos(d.netAmout),
      descuentoCent: centavos(d.discount),
      metodo: d.paymentMethod ?? '',
      tipo: d.paymentType ?? '',
      lineas,
      cuadra: lineas.reduce((s, l) => s + importeLinea(l), 0) === ventaCent,
    });
  }
  pedidos.sort((a, b) => (a.fecha === b.fecha ? b.segundo - a.segundo : a.fecha < b.fecha ? 1 : -1));
  return { pedidos, invalidos, fueraDeVentana };
}
