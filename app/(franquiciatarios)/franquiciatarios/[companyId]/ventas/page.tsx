import { contextoSucursal } from '@/lib/franquiciatarios/pagina';
import { sucursalInfo } from '@/lib/sucursales/datos';
import { Encabezado } from '@/components/portal/piezas';
import { VentasFranq } from '@/components/franquiciatarios/ventas';

export default async function PaginaVentas({ params }: { params: Promise<{ companyId: string }> }) {
  const c = await contextoSucursal(params);
  const s = sucursalInfo(c.cfg);
  return (
    <>
      <Encabezado
        area={c.cfg.nombre}
        titulo="Ventas y pedidos"
        descripcion="Las mismas cifras que el reporte de la sucursal: venta del día, por origen y forma de pago, y el desglose de cada pedido."
      />
      <VentasFranq companyId={c.companyId} zona={s.zona} rappi={s.rappi} alcance={s.alcance} />
    </>
  );
}
