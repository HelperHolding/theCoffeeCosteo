import { sesionCrm } from '@/lib/supabase/sesion';
import { etapasGenerales } from '@/lib/crm/unificado/consultas';
import { pasosProceso, type RequisitoProceso } from '@/lib/crm/unificado/proceso';
import { Encabezado } from '@/components/portal/piezas';
import { VistaProceso } from '@/components/crm/unificado/vistas/proceso';

/** Mapa del proceso: qué se hace en cada etapa, qué se registra, quién, dónde y qué sigue (doc 41 §2). */
export default async function Proceso({ searchParams }: { searchParams: Promise<{ paso?: string }> }) {
  const { paso } = await searchParams;
  const { db } = await sesionCrm();
  const [etapas, requisitos, candados] = await Promise.all([
    etapasGenerales(db),
    db
      .from('crm_requisitos')
      .select('etapa_id,nombre,tipo,area_cumple,area_valida,obligatorio,orden')
      .eq('activo', true)
      .order('orden'),
    db.from('crm_v_candados').select('etapa_id').limit(20_000),
  ]);
  const porEtapa: Record<string, number> = {};
  for (const c of (candados.data ?? []) as { etapa_id: string }[])
    porEtapa[c.etapa_id] = (porEtapa[c.etapa_id] ?? 0) + 1;
  return (
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="Proceso"
        descripcion="Del lead a la apertura: qué se hace en cada etapa, qué se registra, quién lo hace y qué sigue."
      />
      <VistaProceso
        pasos={pasosProceso(etapas, (requisitos.data ?? []) as RequisitoProceso[], porEtapa)}
        inicial={paso}
      />
    </>
  );
}
