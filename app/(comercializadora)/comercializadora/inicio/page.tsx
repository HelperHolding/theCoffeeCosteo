import { Encabezado } from '@/components/portal/piezas';
import { Inicio } from '@/components/comercializadora/inicio';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { leerTodoCom } from '@/lib/comercializadora/consultas';
import { hoyCdmx, masDias } from '@/lib/comercializadora/fechas';
import { aperturasLegado, pedidosLegado } from '@/lib/comercializadora/legado';
import {
  armarInicio,
  diaCdmx,
  mesesHasta,
  montoPedido,
  type ArticuloInicio,
  type PedidoActivo,
  type VentaMov,
} from '@/lib/comercializadora/inicio';
import type { MovCompra } from '@/lib/comercializadora/ordenes';
import { indicadoresMotor, motorPlan } from '@/lib/comercializadora/motor';
import { riesgoInicio, type RiesgoInicio } from '@/lib/comercializadora/doh';

const VENTA = 'id,folio,sku,cantidad,estado,fecha_envio';

export default async function InicioPagina() {
  const { db } = await sesionComercializadora();
  const hoy = hoyCdmx();
  const desde5 = `${mesesHasta(hoy, 5)[0]}-01`;
  const [catalogo, porEnviar, ventas90, compras, leadTimes, mermas, pedidosMes, activos] = await Promise.all([
    leerTodoCom<ArticuloInicio>(
      db,
      'com_catalogo',
      'sku,nombre,estatus,categoria,created_at,costo_unitario,saldo_cedis,zoho_stock,zoho_stock_fisico,zoho_sync_at',
      'sku',
    ),
    leerTodoCom<VentaMov>(db, 'com_movimientos', VENTA, 'id', (q) =>
      q.eq('tipo', 'venta').eq('estado', 'por_enviar'),
    ),
    leerTodoCom<VentaMov>(db, 'com_movimientos', VENTA, 'id', (q) =>
      q.eq('tipo', 'venta').gte('fecha_envio', masDias(hoy, -90)),
    ),
    leerTodoCom<MovCompra>(
      db,
      'com_movimientos',
      'id,folio,fecha,sku,cantidad,cantidad_recibida,monto,destino,fecha_arribo,proveedor,estado',
      'id',
      (q) => q.eq('tipo', 'compra'),
    ),
    leerTodoCom<{ sku: string; dias: number | null }>(db, 'com_lead_times', 'sku,dias', 'sku'),
    leerTodoCom<{ cantidad: number | null; costo_unitario_momento: number | null }>(
      db,
      'com_movimientos',
      'id,cantidad,costo_unitario_momento',
      'id',
      (q) =>
        q
          .eq('tipo', 'ajuste')
          .eq('motivo', 'Merma')
          .gte('fecha', `${hoy.slice(0, 7)}-01`),
    ),
    // El día 1 a las 00:00 de CDMX ya es 06:00 UTC: se piden 2 días antes y tendencia() filtra por día de CDMX.
    pedidosLegado((q) => q.gte('fecha_pedido', masDias(desde5, -2)).neq('status', 'cancelado')),
    pedidosLegado((q) => q.neq('status', 'cancelado').neq('status', 'terminado')),
  ]);

  let pedidos: { total: number; top: PedidoActivo[] } | null = null;
  if (activos.ok) {
    const top = [...activos.datos]
      .sort((a, b) => String(b.fecha_pedido).localeCompare(String(a.fecha_pedido)))
      .slice(0, 10);
    const ap = await aperturasLegado([
      ...new Set(top.map((p) => p.apertura_id).filter((x): x is string => !!x)),
    ]);
    const porId = new Map((ap.ok ? ap.datos : []).map((a) => [a.id, a]));
    pedidos = {
      total: activos.datos.length,
      top: top.map((p) => {
        const a = p.apertura_id ? porId.get(p.apertura_id) : undefined;
        return {
          id: p.id,
          numero: p.shopify_order_number || p.id.slice(0, 8),
          status: p.status ?? '',
          sucursal: a?.sucursal || a?.contacto || '—',
          monto: montoPedido(p),
          fecha: p.fecha_pedido ? diaCdmx(p.fecha_pedido) : null,
        };
      }),
    };
  }

  const r = armarInicio({
    hoy,
    catalogo,
    porEnviar,
    ventas90,
    compras,
    leadTimes,
    mermas,
    pedidos: pedidosMes.ok ? pedidosMes.datos : null,
  });
  // Plan 3d: el riesgo de quiebre sale del motor (la misma cuenta que DOH e Indicadores). Si no se puede, se dice.
  let riesgo: RiesgoInicio | null = null;
  try {
    const m = await motorPlan(db);
    if (m.ok) riesgo = riesgoInicio(indicadoresMotor(m).riesgo);
  } catch {
    riesgo = null;
  }
  return (
    <>
      <Encabezado
        area="Comercializadora"
        titulo="Inicio"
        descripcion="El día de la Comercializadora: dinero del mes, compras en camino e inventario que pide atención."
      />
      <Inicio r={r} ventas={pedidosMes.ok} pedidos={pedidos} hoy={hoy} riesgo={riesgo} />
    </>
  );
}
