import { Encabezado } from '@/components/portal/piezas';
import { Cierres } from '@/components/comercializadora/cierres';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { leerTodoCom, ultimaProyeccion } from '@/lib/comercializadora/consultas';
import { hoyCdmx } from '@/lib/comercializadora/fechas';

export default async function ProveedoresSinStock() {
  const { db, accesos } = await sesionComercializadora();
  const hoy = hoyCdmx();
  const [cierres, proyeccion, proveedores, catalogo, minmax] = await Promise.all([
    leerTodoCom<CierreFila>(db, 'com_proveedor_cierre', '*', 'id'),
    ultimaProyeccion(db),
    leerTodoCom<{ vendor_id: string; nombre: string | null }>(
      db,
      'com_zoho_proveedor',
      'vendor_id,nombre',
      'vendor_id',
    ),
    leerTodoCom<{
      sku: string;
      nombre: string | null;
      zoho_vendor_id: string | null;
      estatus: string | null;
    }>(db, 'com_catalogo', 'sku,nombre,zoho_vendor_id,estatus', 'sku'),
    leerTodoCom<{ sku: string; lead_time: number }>(db, 'com_minmax', 'sku,lead_time', 'sku'),
  ]);
  return (
    <>
      <Encabezado
        area="Comercializadora"
        titulo="Proveedores sin stock"
        descripcion="Periodos en que un proveedor no entrega, con el último día para pedir antes del cierre."
      />
      <Cierres
        cierres={cierres}
        resumen={proyeccion?.resumen.cierres ?? []}
        proveedores={proveedores}
        catalogo={catalogo}
        leadTimes={Object.fromEntries(minmax.map((x) => [x.sku, Number(x.lead_time)]))}
        hoy={hoy}
        editable={puedeEditarCom(accesos)}
      />
    </>
  );
}

export interface CierreFila {
  id: number;
  vendor_id: string;
  vendor_name: string;
  ini: string;
  fin: string;
  motivo: string;
  skus: string[] | null;
  notas: string | null;
  cancelado: boolean;
  aviso7_at: string | null;
  aviso0_at: string | null;
}
