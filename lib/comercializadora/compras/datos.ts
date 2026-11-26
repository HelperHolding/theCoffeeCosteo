// lib/comercializadora/compras/datos.ts
import 'server-only';
import { com, leerTodoCom } from '@/lib/comercializadora/consultas';
import type { DatosCompras, LineaAbierta, OcT, RecT, VentaT } from '../../../supabase/functions/_shared/compras/tablero.ts';

const n = (x: unknown) => Number(x) || 0;

export function lineasAbiertas(
  lineas: { zoho_po_id: string; sku: string; cantidad: number; cantidad_recibida: number }[],
  nombres: Map<string, string>,
): LineaAbierta[] {
  return lineas.map((l) => ({
    zoho_po_id: String(l.zoho_po_id), sku: String(l.sku), nombre: nombres.get(String(l.sku)) || String(l.sku),
    pendiente: Math.max(0, n(l.cantidad) - n(l.cantidad_recibida)),
  }));
}

/** Todo lo que el tablero lee de Supabase (spec §3: la página no lee Zoho). Lanza con un mensaje claro si algo falla. */
export async function leerDatosCompras(db: unknown): Promise<{ datos: DatosCompras; ultimaSync: string | null }> {
  const [ocs, recs, ventas, lineas, cat, log] = await Promise.all([
    leerTodoCom<OcT>(db, 'com_compras_oc', 'zoho_po_id,folio,proveedor,comprador,emision,arribo,estado,received_status,monto_ins,por_categoria,es_registro', 'zoho_po_id'),
    leerTodoCom<RecT>(db, 'com_compras_recepcion', 'zoho_receive_id,zoho_po_id,fecha,monto,por_categoria', 'zoho_receive_id'),
    leerTodoCom<VentaT>(db, 'com_compras_venta_semana', 'semana,venta_total_ci,por_categoria_ci', 'semana'),
    leerTodoCom<{ zoho_po_id: string; sku: string; cantidad: number; cantidad_recibida: number }>(db, 'com_zoho_oc_lineas', 'zoho_po_id,sku,cantidad,cantidad_recibida', 'zoho_po_id', (q) => q.order('sku')),
    leerTodoCom<{ sku: string; nombre: string | null }>(db, 'com_catalogo', 'sku,nombre', 'sku'),
    com(db).from('com_sync_log').select('fin').eq('proceso', 'zoho-compras-sync').eq('ok', true).not('fin', 'is', null)
      .order('fin', { ascending: false }).limit(1),
  ]);
  const nombres = new Map(cat.map((c) => [c.sku, c.nombre || c.sku]));
  return {
    datos: {
      ocs: ocs.map((o) => ({ ...o, monto_ins: n(o.monto_ins), por_categoria: o.por_categoria ?? {}, comprador: o.comprador || 'Sin comprador' })),
      recepciones: recs.map((r) => ({ zoho_po_id: r.zoho_po_id, fecha: r.fecha, monto: n(r.monto), por_categoria: r.por_categoria ?? {} })),
      ventas: ventas.map((v) => ({ semana: v.semana, venta_total_ci: n(v.venta_total_ci), por_categoria_ci: v.por_categoria_ci ?? {} })),
      lineas: lineasAbiertas(lineas, nombres),
    },
    ultimaSync: (log?.data?.[0]?.fin as string | undefined) ?? null,
  };
}
