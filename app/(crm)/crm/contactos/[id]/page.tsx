import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sesionCrm } from '@/lib/supabase/sesion';
import { puedeEditarCrm } from '@/lib/portal/modulos';
import { Encabezado } from '@/components/portal/piezas';
import { SeccionesFicha } from '@/components/crm/ficha';
import { ActividadTienda } from '@/components/crm/expediente/actividad';
import { DocumentosTienda } from '@/components/crm/expediente/documentos';
import { archivosDe } from '@/lib/crm/consultas';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FichaContacto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { db, accesos } = await sesionCrm();
  const [c, ligas, notas, historial, perfiles] = await Promise.all([
    db.from('crm_contactos').select('*').eq('id', id).maybeSingle(),
    db.from('crm_tienda_contactos').select('tienda_id').eq('contacto_id', id),
    db
      .from('crm_notas')
      .select('*')
      .eq('contacto_id', id)
      .is('archivado_en', null)
      .order('creado_en', { ascending: false }),
    db
      .from('crm_historial')
      .select('*')
      .eq('entidad', 'crm_contactos')
      .eq('entidad_id', id)
      .order('fecha', { ascending: false })
      .limit(100),
    db.from('perfiles').select('user_id,nombre'),
  ]);
  if (c.error || ligas.error || notas.error || historial.error)
    throw new Error('No se pudo consultar el contacto. Intenta de nuevo.');
  if (!c.data) notFound();
  const archivos = await archivosDe(
    db,
    'contacto_id',
    id,
    (notas.data ?? []).map((n) => n.id),
  );
  const ids = (ligas.data ?? []).map((l) => l.tienda_id);
  const tiendas = ids.length
    ? ((await db.from('crm_tiendas').select('id,nombre,ciudad').in('id', ids).is('archivado_en', null))
        .data ?? [])
    : [];
  const x = c.data;
  const nombres = Object.fromEntries((perfiles.data ?? []).map((u) => [u.user_id, u.nombre]));
  return (
    <>
      <Encabezado
        titulo={[x.nombre, x.apellidos].filter(Boolean).join(' ')}
        descripcion={[x.puesto, x.franquiciatario].filter(Boolean).join(' · ') || undefined}
        migas={[
          { href: '/crm', nombre: 'CRM' },
          { href: '/crm/contactos', nombre: 'Contactos' },
        ]}
      />
      <SeccionesFicha
        secciones={[
          {
            titulo: 'Contacto',
            campos: [
              ['Correo', x.correo],
              ['Teléfono', x.telefono],
              ['Tipo de contacto', x.tipo_contacto],
              ['Franquiciatario', x.franquiciatario],
              ['Plaza', x.plaza],
              ['Fee pagado', x.fee_pagado ? 'Sí' : 'No'],
              ['Newsletter', x.recibe_newsletter ? 'Sí' : 'No'],
              ['Comunicados', x.recibe_comunicados ? 'Sí' : 'No'],
            ],
          },
          {
            titulo: 'Tiendas',
            campos: [
              [
                'Tiendas del franquiciatario',
                tiendas.length ? (
                  <ul className="space-y-1">
                    {tiendas.map((t) => (
                      <li key={t.id}>
                        <Link href={`/crm/tiendas/${t.id}`} className="hover:underline">
                          {t.nombre}
                        </Link>
                        {t.ciudad && <span className="text-muted-foreground"> · {t.ciudad}</span>}
                      </li>
                    ))}
                  </ul>
                ) : null,
              ],
            ],
          },
        ]}
      />
      {archivos.length > 0 && (
        <section aria-labelledby="documentos-contacto" className="space-y-3">
          <h2 id="documentos-contacto" className="text-base font-semibold">
            Documentos
          </h2>
          <DocumentosTienda archivos={archivos} editable={puedeEditarCrm(accesos)} />
        </section>
      )}
      <ActividadTienda
        relacion={{ contacto_id: x.id }}
        notas={notas.data ?? []}
        historial={historial.data ?? []}
        editable={puedeEditarCrm(accesos)}
        nombres={nombres}
      />
    </>
  );
}
