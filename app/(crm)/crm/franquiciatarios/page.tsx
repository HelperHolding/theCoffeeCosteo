import Link from 'next/link';
import { Search } from 'lucide-react';
import { sesionCrm } from '@/lib/supabase/sesion';
import { etapasGenerales, nombres } from '@/lib/crm/unificado/consultas';
import { Encabezado, Tarjeta, Vacio } from '@/components/portal/piezas';
import { ChipEtapa } from '@/components/crm/unificado/card-pipeline';
import type { Franquiciatario } from '@/lib/crm/tipos';

const POR_PAGINA = 50;

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
  const r = await q.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
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
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const enlace = (n: number) =>
    `/crm/franquiciatarios?${new URLSearchParams({ ...(p.q ? { q: p.q } : {}), ...(p.estado ? { estado: p.estado } : {}), pagina: String(n) })}`;
  return (
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="Franquiciatarios"
        descripcion="Expediente por persona o empresa: Survey, datos fiscales, documentos y sus sucursales."
      />
      <form className="placa flex flex-wrap items-end gap-3 p-3">
        <label className="min-w-56 flex-1">
          <span className="sr-only">Buscar</span>
          <span className="relative block">
            <Search
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              name="q"
              type="search"
              defaultValue={p.q}
              placeholder="Nombre del franquiciatario"
              className="!pl-9"
            />
          </span>
        </label>
        <label className="w-48">
          Estado
          <select name="estado" defaultValue={p.estado ?? ''}>
            <option value="">Todos</option>
            <option value="formalizados">Formalizados</option>
            <option value="en_proceso">En proceso (etapas 1–5)</option>
          </select>
        </label>
        <button className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">Filtrar</button>
      </form>
      {filas.length === 0 ? (
        <Tarjeta cuerpo={false}>
          <Vacio titulo="Sin franquiciatarios con estos filtros">
            Prueba con otro nombre o quita el filtro de estado.
          </Vacio>
        </Tarjeta>
      ) : (
        <div className="relative overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Franquiciatario</th>
                <th className="px-4 py-2.5 font-semibold">Etapa</th>
                <th className="px-4 py-2.5 font-semibold">Sucursales</th>
                <th className="px-4 py-2.5 font-semibold">Vendedor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filas.map((f) => {
                const e = etapaDe.get(f.etapa_id);
                return (
                  <tr key={f.id}>
                    <td className="px-4 py-2.5">
                      <Link href={`/crm/franquiciatarios/${f.id}`} className="font-semibold hover:underline">
                        {f.nombre}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {[f.ciudad_interes, f.muestra ? 'muestra' : null].filter(Boolean).join(' · ') || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">{e && <ChipEtapa etapa={e} />}</td>
                    <td className="px-4 py-2.5 tabular">{porFranq.get(f.id) ?? 0}</td>
                    <td className="px-4 py-2.5 text-xs">
                      {(f.responsable_id && vendedores.get(f.responsable_id)) || 'Sin asignar'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <nav aria-label="Páginas" className="placa flex items-center justify-between gap-3 px-4 py-2 text-sm">
        <span className="text-muted-foreground tabular">
          {total.toLocaleString('es-MX')} franquiciatarios · página {pagina} de {paginas}
        </span>
        <span className="flex gap-3">
          {pagina > 1 && (
            <Link className="font-semibold hover:underline" href={enlace(pagina - 1)}>
              Anterior
            </Link>
          )}
          {pagina < paginas && (
            <Link className="font-semibold hover:underline" href={enlace(pagina + 1)}>
              Siguiente
            </Link>
          )}
        </span>
      </nav>
    </>
  );
}
