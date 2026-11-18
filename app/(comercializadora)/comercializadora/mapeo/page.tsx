import { Encabezado } from '@/components/portal/piezas';
import { Mapeo } from '@/components/comercializadora/mapeo';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { leerTodoCom } from '@/lib/comercializadora/consultas';
import { ultimosPedidosLegado } from '@/lib/comercializadora/legado';
import { filasMapeo, nombresDePedidos, type Mapeo as FilaBase } from '@/lib/comercializadora/mapeo';

export default async function MapeoPagina() {
  const { db, accesos } = await sesionComercializadora();
  const [mapeos, catalogo, pedidos] = await Promise.all([
    leerTodoCom<FilaBase>(db, 'com_sku_mapping', 'shopify_nombre,sku,notas', 'shopify_nombre'),
    leerTodoCom<{ sku: string; nombre: string | null; categoria: string | null }>(
      db,
      'com_catalogo',
      'sku,nombre,categoria',
      'sku',
    ),
    ultimosPedidosLegado(500),
  ]);
  const nombres = pedidos.ok ? nombresDePedidos(pedidos.datos) : [];
  return (
    <>
      <Encabezado
        area="Comercializadora"
        titulo="Mapeo SKU"
        descripcion="Nombre del producto en los pedidos → artículo del catálogo."
      />
      <Mapeo
        filas={filasMapeo(nombres, mapeos, catalogo)}
        catalogo={catalogo}
        editable={puedeEditarCom(accesos)}
        aviso={pedidos.ok ? null : pedidos.error}
      />
    </>
  );
}
