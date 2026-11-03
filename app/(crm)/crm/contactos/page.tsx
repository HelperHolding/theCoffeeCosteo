import { sesionCrm } from '@/lib/supabase/sesion';
import { Encabezado } from '@/components/portal/piezas';
import { VistaContactos } from '@/components/crm/unificado/vistas/directorio';
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
      <VistaContactos filas={filas} filtrado={!!(q || sp.tipo)} />
      <Paginacion
        ruta="/crm/contactos"
        params={{ q: sp.q, tipo: sp.tipo }}
        pagina={pagina}
        total={r.count ?? filas.length}
      />
    </>
  );
}
