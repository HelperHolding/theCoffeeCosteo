import { sesionCrm } from '@/lib/supabase/sesion';
import { etapasGenerales, nombres } from '@/lib/crm/unificado/consultas';
import { Encabezado } from '@/components/portal/piezas';
import { VistaFranquiciatarios } from '@/components/crm/unificado/vistas/franquiciatarios';
import type { Franquiciatario } from '@/lib/crm/tipos';

// Múltiplo de 2 y 3 para que la cuadrícula de fichas cierre completa.
const POR_PAGINA = 48;

export default async function Franquiciatarios({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string; pagina?: string }>;
}) {
  const p = await searchParams;
  const { db } = await sesionCrm();
  const etapas = await etapasGenerales(db);
  const pagina = Math.max(1, Number(p.pagina) || 1);
  let q = db
    .from('crm_franquiciatarios')
    .select('*', { count: 'exact' })
    .is('archivado_en', null)
    .order('formalizado_en', { ascending: false, nullsFirst: false })
    .order('actualizado_en', { ascending: false });
  if (p.estado === 'formalizados') q = q.not('formalizado_en', 'is', null);
  if (p.estado === 'en_proceso') q = q.is('formalizado_en', null);
  if (p.q?.trim()) q = q.ilike('nombre', `%${p.q.trim().replace(/[%_,()"]/g, ' ')}%`);
  const contar = (f?: 'formalizados' | 'en_proceso') => {
    let c = db
      .from('crm_franquiciatarios')
      .select('id', { count: 'exact', head: true })
      .is('archivado_en', null);
    if (f === 'formalizados') c = c.not('formalizado_en', 'is', null);
    if (f === 'en_proceso') c = c.is('formalizado_en', null);
    if (p.q?.trim()) c = c.ilike('nombre', `%${p.q.trim().replace(/[%_,()"]/g, ' ')}%`);
    return c;
  };
  const [r, todos, formalizados, enProceso] = await Promise.all([
    q.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1),
    contar(),
    contar('formalizados'),
    contar('en_proceso'),
  ]);
  const filas = (r.data ?? []) as Franquiciatario[];
  const total = r.count ?? 0;
  const [sucursales, vendedores] = await Promise.all([
    filas.length
      ? db
          .from('crm_tiendas')
          .select('franquiciatario_id')
          .in(
            'franquiciatario_id',
            filas.map((f) => f.id),
          )
          .is('archivado_en', null)
      : Promise.resolve({ data: [] as { franquiciatario_id: string | null }[] }),
    nombres(
      db,
      filas.map((f) => f.responsable_id),
    ),
  ]);
  const porFranq = new Map<string, number>();
  for (const s of (sucursales.data ?? []) as { franquiciatario_id: string | null }[])
    if (s.franquiciatario_id)
      porFranq.set(s.franquiciatario_id, (porFranq.get(s.franquiciatario_id) ?? 0) + 1);
  const etapaDe = new Map(etapas.map((e) => [e.id, e]));
  const estado = p.estado === 'formalizados' || p.estado === 'en_proceso' ? p.estado : '';
  return (
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="Franquiciatarios"
        descripcion="Expediente por persona o empresa: Survey, datos fiscales, documentos y sus sucursales."
      />
      <VistaFranquiciatarios
        filas={filas.map((f) => ({
          id: f.id,
          nombre: f.nombre,
          ciudad: f.ciudad_interes,
          etapa: etapaDe.get(f.etapa_id) ?? null,
          sucursales: porFranq.get(f.id) ?? 0,
          vendedor: (f.responsable_id && vendedores.get(f.responsable_id)) || null,
          muestra: f.muestra,
          formalizado: !!f.formalizado_en,
        }))}
        q={p.q}
        estado={estado}
        conteos={{
          todos: todos.count ?? 0,
          formalizados: formalizados.count ?? 0,
          en_proceso: enProceso.count ?? 0,
        }}
        total={total}
        pagina={pagina}
        paginas={Math.max(1, Math.ceil(total / POR_PAGINA))}
      />
    </>
  );
}
