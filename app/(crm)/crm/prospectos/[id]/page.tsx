import { notFound } from 'next/navigation';
import { sesionCrm } from '@/lib/supabase/sesion';
import { puedeEditarCrm } from '@/lib/portal/modulos';
import { Encabezado } from '@/components/portal/piezas';
import { Pestanas } from '@/components/portal/pestanas';
import { EtapaProspecto, SeccionesFicha } from '@/components/crm/ficha';
import { ActividadTienda } from '@/components/crm/expediente/actividad';
import { DocumentosTienda } from '@/components/crm/expediente/documentos';
import { archivosDe } from '@/lib/crm/consultas';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function FichaProspecto({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const { db, accesos } = await sesionCrm();
  const [p, etapas, notas, historial, perfiles] = await Promise.all([
    db.from('crm_prospectos').select('*').eq('id', id).maybeSingle(),
    db
      .from('crm_etapas')
      .select('id,nombre,orden')
      .eq('embudo', 'prospectos')
      .eq('activa', true)
      .order('orden'),
    db
      .from('crm_notas')
      .select('*')
      .eq('prospecto_id', id)
      .is('archivado_en', null)
      .order('creado_en', { ascending: false }),
    db
      .from('crm_historial')
      .select('*')
      .eq('entidad', 'crm_prospectos')
      .eq('entidad_id', id)
      .order('fecha', { ascending: false })
      .limit(100),
    db.from('perfiles').select('user_id,nombre'),
  ]);
  if (p.error || etapas.error || notas.error || historial.error)
    throw new Error('No se pudo consultar el prospecto. Intenta de nuevo.');
  if (!p.data) notFound();
  const x = p.data;
  const archivos = await archivosDe(
    db,
    'prospecto_id',
    id,
    (notas.data ?? []).map((n) => n.id),
  );
  const nombres = Object.fromEntries((perfiles.data ?? []).map((u) => [u.user_id, u.nombre]));
  const editable = puedeEditarCrm(accesos);
  return (
    <>
      <Encabezado
        titulo={[x.nombre, x.apellidos].filter(Boolean).join(' ')}
        descripcion={[x.ciudad_interes, x.estado_interes].filter(Boolean).join(', ') || undefined}
        migas={[
          { href: '/crm', nombre: 'CRM' },
          { href: '/crm/prospectos', nombre: 'Prospectos' },
        ]}
      />
      <EtapaProspecto prospecto={x} etapas={etapas.data ?? []} editable={editable} />
      <Pestanas
        inicial={(await searchParams).tab}
        pestanas={[
          {
            id: 'datos',
            nombre: 'Información',
            contenido: (
              <SeccionesFicha
                secciones={[
                  {
                    titulo: 'Contacto',
                    campos: [
                      ['Correo', x.correo],
                      ['Teléfono', x.telefono],
                      ['Empresa', x.empresa],
                      ['Página web', x.pagina_web],
                      [
                        'Ciudad de residencia',
                        [x.ciudad_residencia, x.estado_residencia].filter(Boolean).join(', '),
                      ],
                      ['País', x.pais],
                      ['No recibir correos', x.sin_correos ? 'Sí' : 'No'],
                    ],
                  },
                  {
                    titulo: 'Interés de franquicia',
                    campos: [
                      ['Plaza de interés', [x.ciudad_interes, x.estado_interes].filter(Boolean).join(', ')],
                      ['Inversión', x.inversion],
                      ['Capital disponible', x.capital_disponible],
                      ['Fuente de capital', x.fuente_capital],
                      ['Interés en The Coffee', x.interes_en_the_coffee],
                      ['Por qué tendrá éxito en la zona', x.por_que_tendra_exito],
                      ['Plan de operación', x.plan_operacion],
                      ['Otra marca de retail o franquicia', x.involucrado_otra_marca],
                      ['Marca', x.marca_involucramiento],
                    ],
                  },
                ]}
              />
            ),
          },
          {
            id: 'documentos',
            nombre: 'Documentos',
            contador: archivos.length,
            contenido: <DocumentosTienda archivos={archivos} editable={editable} />,
          },
          {
            id: 'notas',
            nombre: 'Notas e historial',
            contador: (notas.data ?? []).length,
            contenido: (
              <ActividadTienda
                relacion={{ prospecto_id: x.id }}
                notas={notas.data ?? []}
                historial={historial.data ?? []}
                editable={editable}
                nombres={nombres}
              />
            ),
          },
        ]}
      />
    </>
  );
}
