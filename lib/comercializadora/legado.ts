import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { leerTodoCom } from './consultas';
import type { PedidoPlan } from '../../supabase/functions/_shared/planEngine.ts';

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

// ── Plan 3d: lo que lee el motor de planeación (_planDatCargar) ──────────────────────────────────────────────────

const COLUMNAS_PLAN =
  'id,apertura_id,franquiciatario_email,fecha_pedido,status,items,items_editados,notas_shopify,es_llenado_canal,marketing_proyecto_id';
const CANCELADOS = ['cancelado', 'cancelacion_pendiente'];
/** `.not('status','in','("cancelado","cancelacion_pendiente")')` del viejo: en SQL, un status nulo tampoco pasa. */
export const pedidoVigente = (p: { status?: string | null }) =>
  p.status != null && !CANCELADOS.includes(p.status);

async function leerPuente<T>(fn: (db: SupabaseClient) => Promise<T>): Promise<Lectura<T>> {
  const db = servicioLegado();
  if (!db) return { ok: false, error: SIN_PUENTE };
  try {
    return { ok: true, datos: await fn(db) };
  } catch {
    return { ok: false, error: SIN_PUENTE };
  }
}

/** Pedidos vigentes (sin cancelados ni status nulo) con las columnas del plan, paginados. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pedidosPlanLegado(filtro?: (q: any) => any): Promise<Lectura<PedidoPlan[]>> {
  return leerPuente(async (db) =>
    (await leerTodoCom<PedidoPlan>(db, 'com_legado_pedidos', COLUMNAS_PLAN, 'id', filtro)).filter(
      pedidoVigente,
    ),
  );
}

/** Fecha del primer pedido de la base: el motor nunca ve más historia que la que existe. */
export function primerPedidoLegado(): Promise<Lectura<string | null>> {
  return leerPuente(async (db) => {
    const r = await db
      .from('com_legado_pedidos')
      .select('fecha_pedido')
      .order('fecha_pedido', { ascending: true })
      .limit(1);
    if (r.error) throw r.error;
    return ((r.data?.[0] as { fecha_pedido?: string } | undefined)?.fecha_pedido ?? null) as string | null;
  });
}

export interface AperturaPlan {
  id: string;
  estatus: string | null;
  fecha: string | null;
  sucursal: string | null;
}
export function aperturasPlanLegado(): Promise<Lectura<AperturaPlan[]>> {
  return leerPuente((db) =>
    leerTodoCom<AperturaPlan>(db, 'com_legado_aperturas', 'id,estatus,fecha,sucursal', 'id'),
  );
}

export function pedidosAperturaLegado(): Promise<Lectura<{ pedido_id: string }[]>> {
  return leerPuente(async (db) =>
    (
      await leerTodoCom<{ pedido_id: string | null }>(
        db,
        'com_legado_pedidos_apertura',
        'pedido_id',
        'pedido_id',
      )
    ).filter((p): p is { pedido_id: string } => p.pedido_id != null),
  );
}

/** De `ids`, las aperturas que ya tienen algún pedido vigente (ya hicieron su kit). En lotes de 80, como el viejo. */
export function aperturasConPedidoLegado(ids: string[]): Promise<Lectura<string[]>> {
  return leerPuente(async (db) => {
    const con = new Set<string>();
    for (let i = 0; i < ids.length; i += 80) {
      const lote = ids.slice(i, i + 80);
      const filas = await leerTodoCom<{ apertura_id: string; status: string | null }>(
        db,
        'com_legado_pedidos',
        'id,apertura_id,status',
        'id',
        (q) => q.in('apertura_id', lote),
      );
      filas.filter(pedidoVigente).forEach((p) => con.add(p.apertura_id));
    }
    return [...con];
  });
}
