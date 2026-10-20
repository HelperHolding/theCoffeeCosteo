import Link from 'next/link';
import { sesionCrm } from '@/lib/supabase/sesion';
import { Encabezado, Tarjeta, Vacio } from '@/components/portal/piezas';
import { Buscador, Paginacion, POR_PAGINA, paginaDe, textoBusqueda } from '@/components/crm/listas';
import { claseCampo } from '@/lib/crm/formato';
import { TIPOS_CONTACTO } from '@/lib/crm/tipos';

export default async function Contactos({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string; pagina?: string }>;
}) {
  const { db } = await sesionCrm();
  const sp = await searchParams;
  const pagina = paginaDe(sp.pagina);
  const q = textoBusqueda(sp.q);
  let consulta = db
    .from('crm_contactos')
    .select('id,nombre,apellidos,correo,telefono,puesto,tipo_contacto,franquiciatario,plaza', {
      count: 'exact',
    })
    .is('archivado_en', null);
  if (q)
    consulta = consulta.or(
      ['nombre', 'apellidos', 'correo', 'franquiciatario', 'plaza'].map((c) => `${c}.ilike.*${q}*`).join(','),
    );
  if (sp.tipo && (TIPOS_CONTACTO as readonly string[]).includes(sp.tipo))
    consulta = consulta.eq('tipo_contacto', sp.tipo as (typeof TIPOS_CONTACTO)[number]);
  const r = await consulta
    .order('apellidos')
    .order('id')
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  if (r.error) throw new Error('No se pudieron consultar los contactos. Intenta de nuevo.');
  const filas = r.data ?? [];
  return (
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="Contactos"
        descripcion="Franquiciatarios y personas de contacto."
      />
      <Buscador ruta="/crm/contactos" q={sp.q} placeholder="Buscar nombre, correo, franquiciatario o plaza">
        <label className="sr-only" htmlFor="filtro-tipo-contacto">
          Tipo de contacto
        </label>
        <select
          id="filtro-tipo-contacto"
          name="tipo"
          defaultValue={sp.tipo ?? ''}
          className={`${claseCampo} w-auto`}
        >
          <option value="">Todos los tipos</option>
          {TIPOS_CONTACTO.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </Buscador>
      {filas.length === 0 ? (
        <Tarjeta cuerpo={false}>
          <Vacio titulo={q || sp.tipo ? 'Sin resultados' : 'Aún no hay contactos'}>
            {q || sp.tipo ? 'Prueba con otra búsqueda.' : 'Se cargarán con la importación de Zoho.'}
          </Vacio>
        </Tarjeta>
      ) : (
        <div className="relative overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Contacto</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Franquiciatario</th>
                <th className="px-4 py-3 font-medium">Plaza</th>
                <th className="px-4 py-3 font-medium">Teléfono</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5">
                    <Link href={`/crm/contactos/${c.id}`} className="font-medium hover:underline">
                      {[c.nombre, c.apellidos].filter(Boolean).join(' ')}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {[c.puesto, c.correo].filter(Boolean).join(' · ')}
                    </p>
                  </td>
                  <td className="px-4 py-2.5 text-ink-2">{c.tipo_contacto ?? '—'}</td>
                  <td className="px-4 py-2.5 text-ink-2">{c.franquiciatario ?? '—'}</td>
                  <td className="px-4 py-2.5 text-ink-2">{c.plaza ?? '—'}</td>
                  <td className="px-4 py-2.5 text-ink-2">{c.telefono ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Paginacion
        ruta="/crm/contactos"
        params={{ q: sp.q, tipo: sp.tipo }}
        pagina={pagina}
        total={r.count ?? filas.length}
      />
    </>
  );
}
