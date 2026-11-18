import { Encabezado } from '@/components/portal/piezas';
import { Kit } from '@/components/comercializadora/kit';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { leerTodoCom } from '@/lib/comercializadora/consultas';

export interface KitFila {
  sku: string;
  promedio_calc: number;
  aperturas_muestra: number;
  manual: number | null;
  kit: number | null;
  calculado_at: string;
}

export default async function KitPagina() {
  const { db, accesos } = await sesionComercializadora();
  const [kits, catalogo] = await Promise.all([
    leerTodoCom<KitFila>(
      db,
      'com_kit_apertura',
      'sku,promedio_calc,aperturas_muestra,manual,kit,calculado_at',
      'sku',
    ),
    leerTodoCom<{ sku: string; nombre: string | null }>(db, 'com_catalogo', 'sku,nombre', 'sku'),
  ]);
  return (
    <>
      <Encabezado
        area="Comercializadora"
        titulo="Kit de apertura"
        descripcion="Piezas que se mandan a cada apertura: el promedio calculado o el manual."
      />
      <Kit
        kits={kits}
        nombres={Object.fromEntries(catalogo.map((c) => [c.sku, c.nombre ?? '']))}
        editable={puedeEditarCom(accesos)}
      />
    </>
  );
}
