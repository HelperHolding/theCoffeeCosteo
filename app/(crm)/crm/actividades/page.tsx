import { sesionCrm } from '@/lib/supabase/sesion';
import { puedeEditarCrm } from '@/lib/portal/modulos';
import { Encabezado } from '@/components/portal/piezas';
import { VISTAS_ACTIVIDADES, VistaActividades } from '@/components/crm/unificado/vistas/directorio';
import { Buscador, Paginacion, POR_PAGINA, paginaDe, textoBusqueda } from '@/components/crm/listas';

const VISTAS = VISTAS_ACTIVIDADES;

export default async function Actividades({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; vista?: string; pagina?: string }>;
}) {
  const { db, accesos } = await sesionCrm();
  const sp = await searchParams;
  const vista = (sp.vista && sp.vista in VISTAS ? sp.vista : 'abiertas') as keyof typeof VISTAS;
  const pagina = paginaDe(sp.pagina);
  const q = textoBusqueda(sp.q);
  const hoy = new Date().toISOString().slice(0, 10);
  const filtrar = <T extends ReturnType<typeof base>>(c: T, v: keyof typeof VISTAS) => {
    if (q) c = c.ilike('asunto', `%${q}%`) as T;
    if (v === 'abiertas') c = c.neq('estado', 'Completed') as T;
    if (v === 'completadas') c = c.eq('estado', 'Completed') as T;
    if (v === 'vencidas') c = c.neq('estado', 'Completed').lt('fecha_vencimiento', hoy) as T;
    return c;
  };
  const base = (cabeza = false) =>
    db.from('crm_actividades').select('*', { count: 'exact', head: cabeza }).is('archivado_en', null);
  const [r, ...cuentas] = await Promise.all([
    filtrar(base(), vista)
      .order('fecha_vencimiento', { ascending: vista !== 'completadas', nullsFirst: false })
      .order('id')
      .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1),
    ...(Object.keys(VISTAS) as (keyof typeof VISTAS)[]).map((v) => filtrar(base(true), v)),
  ]);
  const conteos = Object.fromEntries(
    (Object.keys(VISTAS) as (keyof typeof VISTAS)[]).map((v, i) => [v, cuentas[i].count ?? 0]),
  );
  if (r.error) throw new Error('No se pudieron consultar las actividades. Intenta de nuevo.');
  const filas = r.data ?? [];
  const ids = (k: 'tienda_id' | 'prospecto_id' | 'contacto_id' | 'franquiciatario_id') =>
    [...new Set(filas.map((f) => f[k]).filter(Boolean))] as string[];
  const [tiendas, prospectos, contactos, franquiciatarios] = await Promise.all([
    ids('tienda_id').length
      ? db.from('crm_tiendas').select('id,nombre,embudo').in('id', ids('tienda_id'))
      : { data: [] },
    ids('prospecto_id').length
      ? db.from('crm_prospectos').select('id,nombre,apellidos').in('id', ids('prospecto_id'))
      : { data: [] },
    ids('contacto_id').length
      ? db.from('crm_contactos').select('id,nombre,apellidos').in('id', ids('contacto_id'))
      : { data: [] },
    ids('franquiciatario_id').length
      ? db.from('crm_franquiciatarios').select('id,nombre').in('id', ids('franquiciatario_id'))
      : { data: [] },
  ]);
  const nombre = new Map<string, { texto: string; href: string }>([
    ...(tiendas.data ?? []).map(
      (t) =>
        [
          t.id,
          {
            texto: t.nombre,
            href:
              t.embudo === 'general'
                ? `/crm/sucursales/${t.id}?tab=actividades`
                : `/crm/tiendas/${t.id}?tab=actividades`,
          },
        ] as const,
    ),
    ...(franquiciatarios.data ?? []).map(
      (f) => [f.id, { texto: f.nombre, href: `/crm/franquiciatarios/${f.id}?tab=actividades` }] as const,
    ),
    ...(prospectos.data ?? []).map(
      (p) =>
        [
          p.id,
          { texto: [p.nombre, p.apellidos].filter(Boolean).join(' '), href: `/crm/prospectos/${p.id}` },
        ] as const,
    ),
    ...(contactos.data ?? []).map(
      (c) =>
        [
          c.id,
          { texto: [c.nombre, c.apellidos].filter(Boolean).join(' '), href: `/crm/contactos/${c.id}` },
        ] as const,
    ),
  ]);
  const editable = puedeEditarCrm(accesos);
  return (
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="Actividades"
        descripcion="Tareas de seguimiento de franquiciatarios, sucursales y contactos."
      />
      <Buscador ruta="/crm/actividades" q={sp.q} placeholder="Buscar asunto">
        <input type="hidden" name="vista" value={vista} />
      </Buscador>
      <VistaActividades
        filas={filas}
        vista={vista}
        conteos={conteos}
        enlaces={
          Object.fromEntries(
            Object.keys(VISTAS).map((v) => [
              v,
              `/crm/actividades?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), vista: v })}`,
            ]),
          ) as Record<keyof typeof VISTAS, string>
        }
        relacion={Object.fromEntries(nombre)}
        editable={editable}
      />
      <Paginacion
        ruta="/crm/actividades"
        params={{ q: sp.q, vista }}
        pagina={pagina}
        total={r.count ?? filas.length}
      />
    </>
  );
}
