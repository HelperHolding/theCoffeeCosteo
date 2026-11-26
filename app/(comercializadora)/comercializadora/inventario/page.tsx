import { Encabezado } from '@/components/portal/piezas';
import { Inventario } from '@/components/comercializadora/inventario';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { com, leerTodoCom } from '@/lib/comercializadora/consultas';
import {
  conCoberturaAperturas,
  conVentaContable,
  filasInventario,
  tresPlViejo,
  valorInventario,
  ventaDiaria30,
  type ArticuloInventario,
  type MinMaxInventario,
} from '@/lib/comercializadora/inventario';
import { memoMotor, motorPlan } from '@/lib/comercializadora/motor';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import { leadTimePorSku, llegadaEnCamino } from '@/lib/comercializadora/quepedir';
import type { LineaOcZoho } from '@/lib/comercializadora/tipos';

export default async function InventarioPagina() {
  const { db, accesos } = await sesionComercializadora();
  const hoy = hoyCdmx();
  // Venta/día = lo vendido en 30 días ÷ 30, sin aperturas, con los pedidos que el motor ya tiene en caché (plan 3d).
  const motor = motorPlan(db);
  const [catalogo, minmax, ventas, lineas, sync, config, aut, kits, leadTimes] = await Promise.all([
    leerTodoCom<ArticuloInventario>(
      db,
      'com_catalogo',
      'sku,nombre,categoria,estatus,zoho_stock,zoho_stock_fisico,zoho_sync_at,saldo_cedis,saldo_yulius,yulius_actualizado_at,costo_unitario,zoho_vendor_id,zoho_vendor_name,zoho_lead_time',
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
      'zoho_po_id,po_number,sku,status,cantidad,cantidad_recibida,fecha_oc,fecha_entrega',
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
    // Kit por apertura (manual o promedio) para la cobertura con aperturas.
    leerTodoCom<{ sku: string; kit: number | null }>(db, 'com_kit_apertura', 'sku,kit', 'sku'),
    // Lead times para estimar la llegada de lo en camino cuando la OC no trae fecha de entrega.
    leerTodoCom<{ sku: string; dias: number | null }>(db, 'com_lead_times', 'sku,dias', 'sku'),
  ]);
  const llegadas = llegadaEnCamino(
    lineas,
    leadTimePorSku(catalogo, leadTimes, Number(config.data?.config?.compra?.lt_default) || 7),
    hoy,
    { sinBorradores: true },
  );
  const editable = puedeEditarCom(accesos);
  const aperturasMes = Number(config.data?.config?.aper?.por_mes) || 0;
  const kit = Object.fromEntries(kits.map((k) => [k.sku, Number(k.kit) || 0]));
  const m = await motor;
  const venta30 = m.ok
    ? memoMotor(m, 'venta30', () =>
        ventaDiaria30({
          cfg: m.cfg,
          hoy: m.R.hoy,
          catalogo: m.R.cat,
          mapa: m.R.map,
          pedidosApertura: m.R.pedAper,
          aperturas: m.R.aperturas,
          pedidos: m.R.pedidos,
        }),
      )
    : null;
  return (
    <>
      <Encabezado
        area="Comercializadora"
        titulo="Inventario"
        descripcion="Inventario contable de Zoho, venta diaria de los últimos 30 días (sin aperturas) y su cobertura, sin y con aperturas."
      />
      <Inventario
        filas={conCoberturaAperturas(
          conVentaContable(
            filasInventario({
              catalogo,
              minmax,
              ventas,
              lineas,
              llegadas,
              yulius: config.data?.config?.inv?.yulius !== false,
            }),
            venta30,
          ),
          kit,
          aperturasMes,
        )}
        aperturasMes={aperturasMes}
        ventaAviso={m.ok ? null : m.error}
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
