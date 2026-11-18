import { Encabezado } from '@/components/portal/piezas';
import { Envios } from '@/components/comercializadora/envios';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { leerTodoCom } from '@/lib/comercializadora/consultas';
import { agruparVentas, type MovVenta } from '@/lib/comercializadora/envios';

export default async function EnviosPagina() {
  const { db, accesos } = await sesionComercializadora();
  const filas = await leerTodoCom<MovVenta>(
    db,
    'com_movimientos',
    'id,folio,sucursal,fecha,fecha_envio,sku,cantidad,estado',
    'id',
    (q) => q.eq('tipo', 'venta'),
  );
  return (
    <>
      <Encabezado
        area="Comercializadora"
        titulo="Envíos"
        descripcion="Pedidos de sucursales pagados que salen del CEDIS. Al marcar enviado dejan de contar como comprometidos."
      />
      <Envios grupos={agruparVentas(filas)} editable={puedeEditarCom(accesos)} />
    </>
  );
}
