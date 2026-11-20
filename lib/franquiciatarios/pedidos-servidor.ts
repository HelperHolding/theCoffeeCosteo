import 'server-only';
import { servicioLegado } from '../comercializadora/legado';
import type { ConfigSucursal } from '../sucursales/config';
import { DIAS_PEDIDOS, normalizarNombre, type FilaPedidoLegado } from './pedidos';

export type LecturaPedidos =
  { ok: true; apertura: string; filas: FilaPedidoLegado[] } | { ok: false; error: string };

export const SIN_VINCULO = 'Esta sucursal todavía no está vinculada con sus pedidos a la Comercializadora.';
const SIN_LECTURA = 'No se pudieron leer los pedidos. Intenta de nuevo en unos minutos.';

/**
 * Pedidos de UNA sucursal en el sitio viejo, leídos con la llave de servicio (las vistas com_legado_* solo las lee
 * service_role). Quien llama ya autorizó al usuario para esta sucursal (contextoSucursal / franq_rol).
 * Candado: la apertura es el número de tienda (lookerStoreId) y solo se usa si su nombre en el sitio viejo coincide
 * con el de la sucursal; si no, no se lee nada (nunca pedidos de otra tienda).
 */
export async function leerPedidosSucursal(
  cfg: ConfigSucursal,
  ahora = new Date(),
  /** Rango ISO [desde, hasta) en lugar de los últimos 120 días (lo usa el P&L para un mes). */
  rango?: { desde: string; hasta: string },
): Promise<LecturaPedidos> {
  const db = servicioLegado();
  if (!db) return { ok: false, error: SIN_LECTURA };
  const apertura = String(cfg.lookerStoreId);
  try {
    const a = await db.from('com_legado_aperturas').select('id,sucursal').eq('id', apertura).maybeSingle();
    if (a.error) return { ok: false, error: SIN_LECTURA };
    if (!a.data || normalizarNombre(a.data.sucursal) !== normalizarNombre(cfg.nombre))
      return { ok: false, error: SIN_VINCULO };
    const desde = rango?.desde ?? new Date(ahora.getTime() - DIAS_PEDIDOS * 86_400_000).toISOString();
    let q = db
      .from('com_legado_pedidos')
      .select('id,apertura_id,fecha_pedido,status,monto,items,items_editados,shopify_order_number')
      .eq('apertura_id', apertura)
      .gte('fecha_pedido', desde);
    if (rango) q = q.lt('fecha_pedido', rango.hasta);
    const p = await q.order('fecha_pedido', { ascending: false }).limit(200);
    if (p.error) return { ok: false, error: SIN_LECTURA };
    // Doble candado: aunque el filtro falle, solo pasan los de esta apertura.
    const filas = ((p.data ?? []) as FilaPedidoLegado[]).filter((f) => String(f.apertura_id) === apertura);
    return { ok: true, apertura, filas };
  } catch {
    return { ok: false, error: SIN_LECTURA };
  }
}
