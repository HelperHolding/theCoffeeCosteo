import { sesion } from '@/lib/supabase/sesion';
import { todas } from '@/lib/portal/consultas';
import { TablaResumen } from '@/components/portal/tabla-resumen';
import { AvisoComision } from '@/components/portal/aviso-comision';
import { Encabezado } from '@/components/portal/piezas';
export default async function ResumenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { db } = await sesion();
  const [filas, alertas, canales] = await Promise.all([
    todas(db, 'v_resumen', 'producto_id,tamano_id,canal_id'),
    todas(db, 'v_alerta_producto_canal', 'producto_id,canal_id'),
    todas(db, 'canales', 'orden,id'),
  ]);
  return (
    <>
      <Encabezado
        area="Análisis"
        titulo="Resumen de costeo"
        descripcion="Costo, precio y margen de cada producto por tamaño y canal. Ordena por columna o cambia a la vista por producto para comparar canales lado a lado."
      />
      <AvisoComision pendiente={canales.some((c) => !c.comision_confirmada)} />
      <TablaResumen filas={filas} alertas={alertas} filtros={await searchParams} />
    </>
  );
}
