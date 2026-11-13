import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { leerTodoCom } from './consultas';

/**
 * Las vistas com_legado_* (puente a bliocjvq, plan 2 decisión 2) solo las lee service_role: se leen aquí, en el
 * servidor, con la llave de servicio. Nunca con la sesión del usuario ni desde el navegador.
 */
export function servicioLegado(): SupabaseClient | null {
  // `||` y no `??`: una variable vacía cuenta como faltante.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type Lectura<T> = { ok: true; datos: T } | { ok: false; error: string };
export const SIN_PUENTE =
  'No se pudieron leer los pedidos del sitio viejo. Intenta de nuevo en unos minutos.';

export interface PedidoLegado {
  id: string;
  apertura_id: string | null;
  fecha_pedido: string | null;
  status: string | null;
  monto: number | null;
  items: unknown;
  items_editados: unknown;
  shopify_order_number: string | null;
}
export interface AperturaLegado {
  id: string;
  sucursal: string | null;
  contacto: string | null;
}

const COLUMNAS = 'id,apertura_id,fecha_pedido,status,monto,items,items_editados,shopify_order_number';

/** Todos los pedidos que pasan el filtro, paginados de 1000 en 1000 (como _fetchAllRows). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pedidosLegado(filtro: (q: any) => any): Promise<Lectura<PedidoLegado[]>> {
  const db = servicioLegado();
  if (!db) return { ok: false, error: SIN_PUENTE };
  try {
    return {
      ok: true,
      datos: await leerTodoCom<PedidoLegado>(db, 'com_legado_pedidos', COLUMNAS, 'id', filtro),
    };
  } catch {
    return { ok: false, error: SIN_PUENTE };
  }
}

/** Los n pedidos más recientes, solo sus artículos (renderComMapeo: limit 500 por fecha_pedido). */
export async function ultimosPedidosLegado(
  n: number,
): Promise<Lectura<Pick<PedidoLegado, 'items' | 'items_editados'>[]>> {
  const db = servicioLegado();
  if (!db) return { ok: false, error: SIN_PUENTE };
  try {
    const r = await db
      .from('com_legado_pedidos')
      .select('items,items_editados')
      .order('fecha_pedido', { ascending: false })
      .limit(n);
    if (r.error) return { ok: false, error: SIN_PUENTE };
    return { ok: true, datos: (r.data ?? []) as Pick<PedidoLegado, 'items' | 'items_editados'>[] };
  } catch {
    return { ok: false, error: SIN_PUENTE };
  }
}

/** Sucursal y contacto de las aperturas de unos pedidos (aperturas(sucursal,contacto) del viejo). */
export async function aperturasLegado(ids: string[]): Promise<Lectura<AperturaLegado[]>> {
  if (!ids.length) return { ok: true, datos: [] };
  const db = servicioLegado();
  if (!db) return { ok: false, error: SIN_PUENTE };
  try {
    const r = await db.from('com_legado_aperturas').select('id,sucursal,contacto').in('id', ids);
    if (r.error) return { ok: false, error: SIN_PUENTE };
    return { ok: true, datos: (r.data ?? []) as AperturaLegado[] };
  } catch {
    return { ok: false, error: SIN_PUENTE };
  }
}
