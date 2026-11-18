import { Encabezado } from '@/components/portal/piezas';
import { PiezasApertura } from '@/components/comercializadora/piezas-apertura';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { com, leerTodoCom } from '@/lib/comercializadora/consultas';
import { aperturasPlanLegado, pedidosAperturaLegado, pedidosPlanLegado } from '@/lib/comercializadora/legado';
import { normalizarAperturas } from '@/lib/comercializadora/motor';
import { normalizarCfgMotor } from '@/lib/comercializadora/indicadores';
import { planPzasApCalc } from '@/lib/comercializadora/piezas';

export default async function PiezasAperturaPagina({
  searchParams,
}: {
  searchParams: Promise<{ n?: string }>;
}) {
  const { db, accesos } = await sesionComercializadora();
  const sp = await searchParams;
  const n = Math.max(3, Math.min(200, Math.round(Number(sp.n)) || 20));
  const [cat, map, cfg, pedidos, aperturas, pedAper] = await Promise.all([
    leerTodoCom<{ sku: string; nombre: string | null; cantidad_por_apertura: number | null }>(
      db,
      'com_catalogo',
      'sku,nombre,cantidad_por_apertura',
      'sku',
      (q) => q.neq('estatus', 'Inactivo'),
    ),
    leerTodoCom<{ shopify_nombre: string; sku: string }>(
      db,
      'com_sku_mapping',
      'shopify_nombre,sku',
      'shopify_nombre',
    ),
    com(db).from('com_plan_config').select('config').eq('id', 1).maybeSingle(),
    // Todo el historial (no solo la ventana): los kits de las aperturas más recientes pueden ser de hace meses.
    pedidosPlanLegado(),
    aperturasPlanLegado(),
    pedidosAperturaLegado(),
  ]);
  const res = planPzasApCalc(
    pedidos.ok ? pedidos.datos : [],
    {
      aperturas: normalizarAperturas(aperturas.ok ? aperturas.datos : []),
      pedAper: pedAper.ok ? pedAper.datos : [],
      map,
      cat,
    },
    normalizarCfgMotor(cfg.data?.config ?? null),
    n,
  );
  return (
    <>
      <Encabezado
        area="Comercializadora"
        titulo="Sugerir piezas por apertura"
        descripcion="Cuántas piezas pidió cada apertura reciente en su kit. El plan reserva ese número por cada apertura que viene."
        migas={[{ href: '/comercializadora/catalogo', nombre: 'Catálogo' }]}
      />
      <PiezasApertura
        res={res}
        n={n}
        editable={puedeEditarCom(accesos)}
        aviso={pedidos.ok ? null : pedidos.error}
        degradado={!aperturas.ok || !pedAper.ok || (aperturas.ok && !aperturas.datos.length)}
      />
    </>
  );
}
