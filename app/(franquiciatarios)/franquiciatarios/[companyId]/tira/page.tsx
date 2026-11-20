import { contextoSucursal } from '@/lib/franquiciatarios/pagina';
import { hoyLocal, sucursalInfo } from '@/lib/sucursales/datos';
import { sumarDias } from '@/lib/sucursales/tiempo';
import { DIAS_TIRA } from '@/lib/franquiciatarios/ventas';
import { diaOperacion } from '@/lib/franquiciatarios/dia';
import { Encabezado } from '@/components/portal/piezas';
import { TiraVenta } from '@/components/franquiciatarios/tira';

export default async function PaginaTira({ params }: { params: Promise<{ companyId: string }> }) {
  const c = await contextoSucursal(params);
  const hoy = hoyLocal(c.cfg).fecha;
  const todos = Array.from({ length: DIAS_TIRA }, (_, i) => sumarDias(hoy, -i));
  // Entre las 0:00 y las 4:00 la operación sigue en el día anterior: ese va primero (el cierre se imprime de noche).
  const operacion = diaOperacion();
  const dias =
    operacion < hoy && todos.includes(operacion)
      ? [operacion, ...todos.filter((d) => d !== operacion)]
      : todos;
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
