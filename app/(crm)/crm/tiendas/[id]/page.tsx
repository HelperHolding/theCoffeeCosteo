import { notFound } from 'next/navigation';
import { sesionCrm } from '@/lib/supabase/sesion';
import { puedeEditarCrm } from '@/lib/portal/modulos';
import { expediente } from '@/lib/crm/consultas';
import { Encabezado } from '@/components/portal/piezas';
import { Pestanas } from '@/components/portal/pestanas';
import { AccionesTienda } from '@/components/crm/expediente/encabezado';
import { DatosTienda } from '@/components/crm/expediente/datos-tienda';
import { ActividadTienda } from '@/components/crm/expediente/actividad';
import { ActividadesTienda } from '@/components/crm/expediente/actividades';
import { ChecklistsTienda } from '@/components/crm/expediente/checklists';
import { DocumentosTienda } from '@/components/crm/expediente/documentos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ExpedienteTienda({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { db, accesos } = await sesionCrm();
  const editable = puedeEditarCrm(accesos);
  const [e, perfiles] = await Promise.all([expediente(db, id), db.from('perfiles').select('user_id,nombre')]);
  if (!e) notFound();
  const nombres = Object.fromEntries((perfiles.data ?? []).map((p) => [p.user_id, p.nombre]));
  const t = e.tienda;
  const subtitulo = [t.franquiciatario, t.ciudad].filter(Boolean).join(' · ');
  return (
    <>
      <Encabezado
        titulo={t.nombre}
        descripcion={subtitulo || undefined}
        migas={[
          { href: '/crm', nombre: 'CRM' },
          { href: '/crm/tiendas', nombre: 'Tiendas' },
        ]}
      />
      <AccionesTienda tienda={t} etapas={e.etapas} editable={editable} />
      <Pestanas
        inicial={(await searchParams).tab}
        pestanas={[
          { id: 'datos', nombre: 'Información', contenido: <DatosTienda tienda={t} editable={editable} /> },
          {
            id: 'actividad',
            nombre: 'Notas e historial',
            contador: e.notas.length,
            contenido: (
              <ActividadTienda
                relacion={{ tienda_id: t.id }}
                notas={e.notas}
                historial={e.historial}
                editable={editable}
                nombres={nombres}
              />
            ),
          },
          {
            id: 'actividades',
            nombre: 'Actividades',
            contador: e.actividades.filter((a) => a.estado !== 'Completed').length,
            contenido: <ActividadesTienda tienda={t.id} actividades={e.actividades} editable={editable} />,
          },
          {
            id: 'checklists',
            nombre: 'Checklists',
            contador: e.checklists.length,
            contenido: <ChecklistsTienda tienda={t.id} listas={e.checklists} editable={editable} />,
          },
          {
            id: 'documentos',
            nombre: 'Documentos',
            contador: e.archivos.length,
            contenido: <DocumentosTienda tienda={t.id} archivos={e.archivos} editable={editable} />,
          },
          {
            id: 'contactos',
            nombre: 'Contactos',
            contador: e.contactos.length,
            contenido:
              e.contactos.length === 0 ? (
                <p className="placa px-3 py-2 text-sm text-muted-foreground">Sin contactos ligados.</p>
              ) : (
                <ul className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
                  {e.contactos.map((c) => (
                    <li key={c.id} className="px-4 py-3 text-sm">
                      <a href={`/crm/contactos/${c.id}`} className="font-medium hover:underline">
                        {[c.nombre, c.apellidos].filter(Boolean).join(' ')}
                      </a>
                      <p className="text-xs text-muted-foreground">
                        {[c.puesto, c.correo, c.telefono].filter(Boolean).join(' · ') || '—'}
                      </p>
                    </li>
                  ))}
                </ul>
              ),
          },
        ]}
      />
    </>
  );
}
