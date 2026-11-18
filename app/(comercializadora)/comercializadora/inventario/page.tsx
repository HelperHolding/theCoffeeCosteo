import { Encabezado } from '@/components/portal/piezas';
import { Inventario } from '@/components/comercializadora/inventario';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { com, leerTodoCom } from '@/lib/comercializadora/consultas';
import {
  filasInventario,
  tresPlViejo,
  valorInventario,
  type ArticuloInventario,
  type MinMaxInventario,
} from '@/lib/comercializadora/inventario';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import type { LineaOcZoho } from '@/lib/comercializadora/tipos';

export default async function InventarioPagina() {
  const { db, accesos } = await sesionComercializadora();
  const hoy = hoyCdmx();
  const [catalogo, minmax, ventas, lineas, sync, config, aut] = await Promise.all([
    leerTodoCom<ArticuloInventario>(
      db,
      'com_catalogo',
      'sku,nombre,categoria,estatus,zoho_stock,zoho_stock_fisico,zoho_sync_at,saldo_cedis,saldo_yulius,yulius_actualizado_at,costo_unitario,zoho_vendor_id,zoho_vendor_name',
      'sku',
    ),
    leerTodoCom<MinMaxInventario>(
      db,
      'com_minmax',
      'sku,minimo,maximo,minimo_manual,maximo_manual,venta_diaria',
      'sku',
    ),
    leerTodoCom<{ id: string; sku: string; cantidad: number }>(
      db,
      'com_movimientos',
      'id,sku,cantidad',
      'id',
      (q) => q.eq('tipo', 'venta').eq('estado', 'por_enviar'),
    ),
    leerTodoCom<LineaOcZoho & { zoho_po_id: string }>(
      db,
      'com_zoho_oc_lineas',
      'zoho_po_id,sku,status,cantidad,cantidad_recibida',
      'zoho_po_id',
      (q) => q.order('sku'),
    ),
    com(db)
      .from('com_sync_log')
      .select('fin')
      .eq('proceso', 'zoho-sync')
      .eq('ok', true)
      .order('inicio', { ascending: false })
      .limit(1),
    com(db).from('com_plan_config').select('config').eq('id', 1).maybeSingle(),
    com(db).rpc('com_autorizadores'),
  ]);
  const editable = puedeEditarCom(accesos);
  return (
    <>
      <Encabezado
        area="Comercializadora"
        titulo="Inventario"
        descripcion="Existencias de Zoho (CEDIS) y del 3PL, con su cobertura y semáforo."
      />
      <Inventario
        filas={filasInventario({
          catalogo,
          minmax,
          ventas,
          lineas,
          yulius: config.data?.config?.inv?.yulius !== false,
        })}
        valor={valorInventario(catalogo)}
        viejos={catalogo.filter((c) => tresPlViejo(c, hoy)).map((c) => c.sku)}
        ultimoSync={sync.data?.[0]?.fin ?? null}
        hoy={hoy}
        editable={editable}
        autorizadores={((aut.data ?? []) as { nombre: string }[]).map((a) => a.nombre)}
        saldos3pl={Object.fromEntries(
          catalogo.map((c) => [c.sku, c.saldo_yulius == null ? null : Number(c.saldo_yulius)]),
        )}
      />
    </>
  );
}
