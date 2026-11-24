// Pedidos de la sucursal a la Comercializadora (sitio viejo) y su recepción. Funciones puras: el servidor lee
// (pedidos-servidor.ts) y aquí se arma lo que ve la pantalla, sin montos salvo que se pidan.
import type { FranqRecepcion } from './tipos';

export interface FilaPedidoLegado {
  id: string;
  apertura_id: string | null;
  fecha_pedido: string | null;
  status: string | null;
  monto: number | string | null;
  items: unknown;
  items_editados: unknown;
  shopify_order_number: string | null;
}

export interface LineaPedido {
  nombre: string;
  sku: string | null;
  variante: string | null;
  cantidad: number;
  /** Precio unitario cobrado a la tienda; solo con montos. */
  precio?: number;
}

export interface PedidoFranq {
  id: string;
  folio: string;
  fecha: string | null;
  estado: string;
  estadoTexto: string;
  lineas: LineaPedido[];
  piezas: number;
  /** Total cobrado a la tienda; solo con montos. */
  total?: number;
  recepcion: Pick<
    FranqRecepcion,
    'completo' | 'diferencias' | 'observacion' | 'nombre' | 'registrado_en'
  > | null;
  /** Se puede registrar su recepción (en camino o entregado, reciente y aún sin recepción). */
  recibible: boolean;
  /** Entregado o en camino, sin recepción y fuera de la ventana de DIAS_RECEPCION: ya no se recibe. */
  cerradoSinRecepcion: boolean;
}

/** Ventana de pedidos que ve la sucursal y hasta cuándo se puede registrar la recepción. */
export const DIAS_PEDIDOS = 120;
/**
 * Solo los pedidos de los últimos 14 días se reciben en el portal (decisión de Carlos, 2026-11-24): los anteriores que
 * la Comercializadora ya entregó salen como «cerrado sin recepción» y no se acumulan como pendientes.
 */
export const DIAS_RECEPCION = 14;

const ESTADOS: Record<string, string> = {
  pendiente: 'Pendiente',
  pagado: 'Pagado',
  empacado: 'Empacado',
  enviado: 'En camino',
  recibido: 'Recibido',
  entregado: 'Entregado',
  terminado: 'Entregado',
  cancelado: 'Cancelado',
  cancelacion_pendiente: 'Cancelación pendiente',
};
const RECIBIBLES = new Set(['enviado', 'recibido', 'entregado', 'terminado']);

export const estadoTexto = (s: string | null) =>
  s ? (ESTADOS[s] ?? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ')) : 'Sin estado';

/** Para comparar nombres de sucursal entre sistemas: sin acentos, mayúsculas ni espacios de más. */
export const normalizarNombre = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

const numero = (x: unknown) => {
  const v = typeof x === 'number' ? x : parseFloat(String(x ?? ''));
  return Number.isFinite(v) ? v : 0;
};

function items(x: unknown): unknown[] {
  if (typeof x === 'string') {
    try {
      x = JSON.parse(x);
    } catch {
      return [];
    }
  }
  return Array.isArray(x) ? x : [];
}

/**
 * Arma los pedidos de la sucursal: los artículos editados mandan si existen (como en Comercializadora), y la recepción
 * registrada en el portal se une por id. Sin `conMontos` no sale ningún precio ni total.
 */
export function armarPedidos(
  filas: FilaPedidoLegado[],
  recepciones: FranqRecepcion[],
  opciones: { conMontos: boolean; ahora?: Date },
): PedidoFranq[] {
  const ahora = (opciones.ahora ?? new Date()).getTime();
  const porPedido = new Map(recepciones.map((r) => [r.pedido_id, r]));
  return filas
    .map((f) => {
      const fuente = f.items_editados != null ? items(f.items_editados) : items(f.items);
      const lineas: LineaPedido[] = fuente
        .map((it) => (it && typeof it === 'object' ? (it as Record<string, unknown>) : null))
        .filter((it): it is Record<string, unknown> => Boolean(it && String(it.nombre ?? '').trim()))
        .map((it) => ({
          nombre: String(it.nombre).trim(),
          sku: it.sku ? String(it.sku) : null,
          variante: it.variante ? String(it.variante) : null,
          cantidad: numero(it.cantidad),
          ...(opciones.conMontos ? { precio: numero(it.precio) } : {}),
        }));
      const r = porPedido.get(f.id);
      const estado = f.status ?? '';
      const reciente = f.fecha_pedido
        ? ahora - Date.parse(f.fecha_pedido) <= DIAS_RECEPCION * 86_400_000
        : false;
      const calculado = lineas.reduce((s, l) => s + (l.precio ?? 0) * l.cantidad, 0);
      return {
        id: f.id,
        folio: f.shopify_order_number || `PED-${f.id.slice(-6).toUpperCase()}`,
        fecha: f.fecha_pedido,
        estado,
        estadoTexto: estadoTexto(f.status),
        lineas,
        piezas: lineas.reduce((s, l) => s + l.cantidad, 0),
        ...(opciones.conMontos ? { total: numero(f.monto) > 0 ? numero(f.monto) : calculado } : {}),
        recepcion: r
          ? {
              completo: r.completo,
              diferencias: r.diferencias,
              observacion: r.observacion,
              nombre: r.nombre,
              registrado_en: r.registrado_en,
            }
          : null,
        recibible: !r && RECIBIBLES.has(estado) && reciente,
        cerradoSinRecepcion: !r && RECIBIBLES.has(estado) && !reciente,
      };
    })
    .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));
}
