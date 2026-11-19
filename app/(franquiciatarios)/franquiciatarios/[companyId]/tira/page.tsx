import { contextoSucursal } from '@/lib/franquiciatarios/pagina';
import { hoyLocal, sucursalInfo } from '@/lib/sucursales/datos';
import { sumarDias } from '@/lib/sucursales/tiempo';
import { DIAS_TIRA } from '@/lib/franquiciatarios/ventas';
import { Encabezado } from '@/components/portal/piezas';
import { TiraVenta } from '@/components/franquiciatarios/tira';

export default async function PaginaTira({ params }: { params: Promise<{ companyId: string }> }) {
  const c = await contextoSucursal(params);
  const hoy = hoyLocal(c.cfg).fecha;
  const dias = Array.from({ length: DIAS_TIRA }, (_, i) => sumarDias(hoy, -i));
  return (
    <>
      <Encabezado
        area={c.cfg.nombre}
        titulo="Tira de venta"
        descripcion="Resumen del día tipo ticket para imprimir o guardar en PDF. Mientras el día no cierre, sale marcada como parcial."
      />
      <TiraVenta companyId={c.companyId} dias={dias} rappi={sucursalInfo(c.cfg).rappi} />
    </>
  );
}
