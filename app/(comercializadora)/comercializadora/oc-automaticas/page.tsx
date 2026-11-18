import { Encabezado, Vacio } from '@/components/portal/piezas';
import { OcAutomaticas } from '@/components/comercializadora/oc-automaticas';
import { AvisosCierre } from '@/components/comercializadora/avisos-cierre';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { cierresVigentes, com, ultimaProyeccion } from '@/lib/comercializadora/consultas';
import { corridasOcAuto, type OcAutoFila } from '@/lib/comercializadora/ocauto';
import { hoyCdmx } from '@/lib/comercializadora/fechas';

export default async function OcAutomaticasPagina() {
  const { db, accesos } = await sesionComercializadora();
  const hoy = hoyCdmx();
  const [ocs, config, proy] = await Promise.all([
    com(db).from('com_oc_auto').select('*').order('creada_at', { ascending: false }).limit(200),
    com(db).from('com_plan_config').select('config').eq('id', 1).maybeSingle(),
    ultimaProyeccion(db),
  ]);
  if (ocs.error) throw new Error('No se pudieron leer las OCs automáticas. Intenta de nuevo.');
  const avisos = await cierresVigentes(db, hoy, proy?.resumen ?? null);
  const corridas = corridasOcAuto(ocs.data as OcAutoFila[]);
  return (
    <>
      <Encabezado
        area="Comercializadora"
        titulo="OC automáticas"
        descripcion="Borradores de órdenes de compra que se generan todos los días a las 07:05."
      />
      <AvisosCierre avisos={avisos} hoy={hoy} />
      {corridas.length === 0 ? (
        <Vacio titulo="Todavía no hay corridas" />
      ) : (
        <OcAutomaticas
          corridas={corridas}
          modo={config.data?.config?.auto?.modo === 'real' ? 'real' : 'simulacion'}
          editable={puedeEditarCom(accesos)}
        />
      )}
    </>
  );
}
