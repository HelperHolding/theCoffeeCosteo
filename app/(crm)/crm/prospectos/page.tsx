import Link from 'next/link';
import { sesionCrm } from '@/lib/supabase/sesion';
import { Encabezado, Tarjeta, Vacio } from '@/components/portal/piezas';
import { Buscador, Paginacion, POR_PAGINA, paginaDe, textoBusqueda } from '@/components/crm/listas';
import { claseCampo } from '@/lib/crm/formato';

export default async function Prospectos({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; etapa?: string; pagina?: string }>;
}) {
  const { db } = await sesionCrm();
  const sp = await searchParams;
  const pagina = paginaDe(sp.pagina);
  const q = textoBusqueda(sp.q);
  const etapas = await db
    .from('crm_etapas')
    .select('id,nombre,orden')
    .eq('embudo', 'prospectos')
    .order('orden');
  let consulta = db
    .from('crm_prospectos')
    .select(
      'id,nombre,apellidos,correo,empresa,ciudad_interes,estado_interes,inversion,etapa_id,zoho_created_at,creado_en',
      {
        count: 'exact',
      },
    )
    .is('archivado_en', null);
  if (q)
    consulta = consulta.or(
      ['nombre', 'apellidos', 'correo', 'empresa', 'ciudad_interes']
        .map((c) => `${c}.ilike.*${q}*`)
        .join(','),
    );
  if (sp.etapa === 'sin') consulta = consulta.is('etapa_id', null);
  else if (sp.etapa && (etapas.data ?? []).some((e) => e.id === sp.etapa))
    consulta = consulta.eq('etapa_id', sp.etapa);
  const r = await consulta
    .order('zoho_created_at', { ascending: false, nullsFirst: false })
    .order('id')
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  if (r.error || etapas.error) throw new Error('No se pudieron consultar los prospectos. Intenta de nuevo.');
  const nombreEtapa = new Map((etapas.data ?? []).map((e) => [e.id, e.nombre]));
  const filas = r.data ?? [];
  return (
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="Prospectos"
        descripcion="Posibles franquiciatarios importados de Zoho."
      />
      <Buscador ruta="/crm/prospectos" q={sp.q} placeholder="Buscar nombre, correo, empresa o ciudad">
        <label className="sr-only" htmlFor="filtro-etapa">
          Estado
        </label>
        <select
          id="filtro-etapa"
          name="etapa"
          defaultValue={sp.etapa ?? ''}
          className={`${claseCampo} w-auto`}
        >
          <option value="">Todos los estados</option>
          <option value="sin">Sin estado</option>
          {(etapas.data ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
      </Buscador>
      {filas.length === 0 ? (
        <Tarjeta cuerpo={false}>
          <Vacio titulo={q || sp.etapa ? 'Sin resultados' : 'Aún no hay prospectos'}>
            {q || sp.etapa ? 'Prueba con otra búsqueda o estado.' : 'Se cargarán con la importación de Zoho.'}
          </Vacio>
        </Tarjeta>
      ) : (
        <div className="relative overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Prospecto</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Plaza de interés</th>
                <th className="px-4 py-3 font-medium">Inversión</th>
                <th className="px-4 py-3 font-medium">Empresa</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/crm/prospectos/${p.id}`} className="font-medium hover:underline">
                      {[p.nombre, p.apellidos].filter(Boolean).join(' ')}
                    </Link>
                    {p.correo && <p className="text-xs text-muted-foreground">{p.correo}</p>}
                  </td>
                  <td className="px-4 py-2.5">
                    {p.etapa_id ? (
                      nombreEtapa.get(p.etapa_id)
                    ) : (
                      <span className="text-muted-foreground">Sin estado</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">
                    {[p.ciudad_interes, p.estado_interes].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">{p.inversion ?? '—'}</td>
                  <td className="px-4 py-2.5 text-ink-2">{p.empresa ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacion
        ruta="/crm/prospectos"
        params={{ q: sp.q, etapa: sp.etapa }}
        pagina={pagina}
        total={r.count ?? filas.length}
      />
    </>
  );
}
