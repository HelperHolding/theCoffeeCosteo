import { Encabezado, Vacio } from '@/components/portal/piezas';
import { QuePedir } from '@/components/comercializadora/que-pedir';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import {
  cierresVigentes,
  com,
  edadHoras,
  leerTodoCom,
  ultimaProyeccion,
} from '@/lib/comercializadora/consultas';
import { enCamino } from '@/lib/comercializadora/quepedir';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import type { ArticuloCatalogo, CompraProyectada, LineaOcZoho, MinMax } from '@/lib/comercializadora/tipos';

export default async function QuePedirPagina() {
  const { db } = await sesionComercializadora();
  const hoy = hoyCdmx();
  const proy = await ultimaProyeccion(db);
  const encabezado = (
    <Encabezado
      area="Comercializadora"
      titulo="Qué pedir"
      descripcion="Compras que propone la simulación diaria para cada artículo."
    />
  );
  if (!proy)
    return (
      <>
        {encabezado}
        <Vacio titulo="Todavía no hay proyección">
          Se calcula todos los días a las 06:30 (hora de Ciudad de México).
        </Vacio>
      </>
    );
  const calc = proy.resumen.calculado_at!;
  const [compras, minmax, catalogo, config, lineas, avisos] = await Promise.all([
    leerTodoCom<CompraProyectada>(
      db,
      'com_pago_proyectado',
      'id,sku,fecha_oc,cantidad,monto,adelanto_cierre,cierre_tarde,cierre_id,adelanto_minimo,bajo_minimo',
      'id',
      (q) => q.eq('calculado_at', calc).eq('tipo', 'proyectado'),
    ),
    leerTodoCom<MinMax>(db, 'com_minmax', 'sku,venta_diaria', 'sku'),
    leerTodoCom<ArticuloCatalogo>(
      db,
      'com_catalogo',
      'sku,nombre,zoho_stock,zoho_stock_fisico,zoho_sync_at,saldo_cedis,saldo_yulius,costo_unitario,zoho_vendor_id,zoho_vendor_name',
      'sku',
    ),
    com(db).from('com_plan_config').select('config').eq('id', 1).maybeSingle(),
    leerTodoCom<LineaOcZoho & { zoho_po_id: string }>(
      db,
      'com_zoho_oc_lineas',
      'zoho_po_id,sku,status,cantidad,cantidad_recibida',
      'zoho_po_id',
      (q) => q.order('sku'),
    ),
    cierresVigentes(db, hoy, proy.resumen),
  ]);
  return (
    <>
      {encabezado}
      <QuePedir
        datos={{
          catalogo,
          minmax,
          compras,
          camino: enCamino(lineas),
          yulius: config.data?.config?.inv?.yulius !== false,
          resumen: proy.resumen,
        }}
        hoy={hoy}
        edadHoras={edadHoras(calc)}
        avisos={avisos}
      />
    </>
  );
}
