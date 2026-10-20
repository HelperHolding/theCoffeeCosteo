import Link from 'next/link';
import { cn } from 'cn';
import { sesionCrm } from '@/lib/supabase/sesion';
import { puedeEditarCrm } from '@/lib/portal/modulos';
import { Encabezado, Tarjeta, Vacio } from '@/components/portal/piezas';
import { Buscador, Paginacion, POR_PAGINA, paginaDe, textoBusqueda } from '@/components/crm/listas';
import { claseCampo } from '@/components/crm/nueva-tienda';
import { EstadoActividad, fechaCorta, vencida } from '@/components/crm/expediente/actividades';
import { PRIORIDADES } from '@/lib/crm/tipos';

const VISTAS = {
  abiertas: 'Abiertas',
  vencidas: 'Vencidas',
  completadas: 'Completadas',
  todas: 'Todas',
} as const;

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
  let consulta = db.from('crm_actividades').select('*', { count: 'exact' }).is('archivado_en', null);
  if (q) consulta = consulta.ilike('asunto', `%${q}%`);
  if (vista === 'abiertas') consulta = consulta.neq('estado', 'Completed');
  if (vista === 'completadas') consulta = consulta.eq('estado', 'Completed');
  if (vista === 'vencidas') consulta = consulta.neq('estado', 'Completed').lt('fecha_vencimiento', hoy);
  const r = await consulta
    .order('fecha_vencimiento', { ascending: vista !== 'completadas', nullsFirst: false })
    .order('id')
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1);
  if (r.error) throw new Error('No se pudieron consultar las actividades. Intenta de nuevo.');
  const filas = r.data ?? [];
  const ids = (k: 'tienda_id' | 'prospecto_id' | 'contacto_id') =>
    [...new Set(filas.map((f) => f[k]).filter(Boolean))] as string[];
  const [tiendas, prospectos, contactos] = await Promise.all([
    ids('tienda_id').length
      ? db.from('crm_tiendas').select('id,nombre').in('id', ids('tienda_id'))
      : { data: [] },
    ids('prospecto_id').length
      ? db.from('crm_prospectos').select('id,nombre,apellidos').in('id', ids('prospecto_id'))
      : { data: [] },
    ids('contacto_id').length
      ? db.from('crm_contactos').select('id,nombre,apellidos').in('id', ids('contacto_id'))
      : { data: [] },
  ]);
  const nombre = new Map<string, { texto: string; href: string }>([
    ...(tiendas.data ?? []).map(
      (t) => [t.id, { texto: t.nombre, href: `/crm/tiendas/${t.id}?tab=actividades` }] as const,
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
        descripcion="Tareas de seguimiento de tiendas, prospectos y contactos."
      />
      <Buscador ruta="/crm/actividades" q={sp.q} placeholder="Buscar asunto">
        <label className="sr-only" htmlFor="filtro-vista">
          Vista
        </label>
        <select id="filtro-vista" name="vista" defaultValue={vista} className={`${claseCampo} w-auto`}>
          {Object.entries(VISTAS).map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
      </Buscador>
      {filas.length === 0 ? (
        <Tarjeta cuerpo={false}>
          <Vacio titulo="Sin actividades">No hay actividades en esta vista.</Vacio>
        </Tarjeta>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
          {filas.map((a) => {
            const rel = nombre.get(a.tienda_id ?? a.prospecto_id ?? a.contacto_id ?? '');
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{a.asunto}</p>
                  <p
                    className={cn('text-xs', vencida(a) ? 'font-semibold text-bad' : 'text-muted-foreground')}
                  >
                    {a.fecha_vencimiento ? `Vence ${fechaCorta(a.fecha_vencimiento)}` : 'Sin fecha'}
                    {vencida(a) && ' · vencida'}
                    {a.prioridad && ` · ${PRIORIDADES[a.prioridad]}`}
                    {rel && (
                      <>
                        {' · '}
                        <Link href={rel.href} className="underline">
                          {rel.texto}
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                <EstadoActividad actividad={a} editable={editable} />
              </li>
            );
          })}
        </ul>
      )}
      <Paginacion
        ruta="/crm/actividades"
        params={{ q: sp.q, vista }}
        pagina={pagina}
        total={r.count ?? filas.length}
      />
    </>
  );
}
