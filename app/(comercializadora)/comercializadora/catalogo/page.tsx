import { Encabezado } from '@/components/portal/piezas';
import { Catalogo } from '@/components/comercializadora/catalogo';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { leerTodoCom } from '@/lib/comercializadora/consultas';

export interface ArticuloCatalogoFila {
  sku: string;
  nombre: string | null;
  estatus: string | null;
  zoho_vendor_name: string | null;
  zoho_lead_time: number | null;
  cantidad_por_apertura: number | null;
  minimo_compra_pzas: number | null;
  multiplo_compra: number | null;
  dias_seguridad: number | null;
}

export default async function CatalogoPagina() {
  const { db, accesos } = await sesionComercializadora();
  const [catalogo, lts, minmax] = await Promise.all([
    leerTodoCom<ArticuloCatalogoFila>(
      db,
      'com_catalogo',
      'sku,nombre,estatus,zoho_vendor_name,zoho_lead_time,cantidad_por_apertura,minimo_compra_pzas,multiplo_compra,dias_seguridad',
      'sku',
      (q) => q.neq('estatus', 'Inactivo'),
    ),
    leerTodoCom<{ sku: string; dias: number | null }>(db, 'com_lead_times', 'sku,dias', 'sku'),
    leerTodoCom<{
      sku: string;
      minimo_calc: number;
      maximo_calc: number;
      minimo_manual: number | null;
      maximo_manual: number | null;
    }>(db, 'com_minmax', 'sku,minimo_calc,maximo_calc,minimo_manual,maximo_manual', 'sku'),
  ]);
  return (
    <>
      <Encabezado
        area="Comercializadora"
        titulo="Catálogo"
        descripcion="Datos de compra de cada artículo. El costo, el proveedor y el estatus vienen de Zoho."
      />
      <Catalogo
        filas={catalogo}
        leadTimes={Object.fromEntries(lts.map((l) => [l.sku, l.dias]))}
        minmax={Object.fromEntries(minmax.map((m) => [m.sku, m]))}
        editable={puedeEditarCom(accesos)}
      />
    </>
  );
}
