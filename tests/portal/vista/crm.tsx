import { Marco } from '../../../components/portal/marco';
import { Encabezado, Kpi } from '../../../components/portal/piezas';
import { Pestanas } from '../../../components/portal/pestanas';
import { TableroTiendas } from '../../../components/crm/tablero-tiendas';
import { AccionesTienda } from '../../../components/crm/expediente/encabezado';
import { DatosTienda } from '../../../components/crm/expediente/datos-tienda';
import { ActividadTienda } from '../../../components/crm/expediente/actividad';
import { ChecklistsTienda } from '../../../components/crm/expediente/checklists';
import { DocumentosTienda } from '../../../components/crm/expediente/documentos';
import { ActividadesTienda } from '../../../components/crm/expediente/actividades';
import type { TarjetaTienda } from '../../../lib/crm/kanban';
import type { Tienda } from '../../../lib/crm/tipos';
import { Store, CircleCheck, CirclePause, CircleX } from 'lucide-react';

const nombres = [
  'Firma de contrato',
  'En búsqueda de local',
  'Local aprobado por México',
  'Local aprobado por Brasil',
  'Arquitecta Asignada',
  'Proyecto 3D Entregado',
  'Proyecto Ejecutivo Entregado',
  'En remodelación',
  'Entrega de local',
  'Agenda de capacitación',
  'Operando',
  'Standby',
  'Modificaciones pendientes',
  'Cancelada',
  'Cerrada',
];
const etapas = nombres.map((nombre, i) => ({
  id: `e${i}`,
  nombre,
  orden: i + 1,
  tipo: (i === 10 ? 'ganada' : i > 12 ? 'perdida' : i > 10 ? 'lateral' : 'abierta') as
    'abierta' | 'ganada' | 'lateral' | 'perdida',
}));
const ciudades = ['Querétaro', 'CDMX', 'Monterrey', 'Guadalajara', 'Puebla', 'Mérida'];
const tarjetas: TarjetaTienda[] = Array.from({ length: 16 }, (_, i) => ({
  id: `t${i}`,
  nombre: `Tienda Prueba ${i + 1}`,
  etapa_id: `e${[0, 0, 0, 1, 2, 4, 5, 7, 7, 9, 10, 10, 10, 11, 13, 14][i]}`,
  posicion: 1024 * (i + 1),
  version: 1,
  franquiciatario: `Franquiciatario ${String.fromCharCode(65 + (i % 5))}`,
  ciudad: ciudades[i % ciudades.length],
  tipo_franquicia: i % 4 === 0 ? 'maestra' : 'franquiciatario',
  fecha_programada_arranque: i < 3 ? `2027-0${i + 2}-15` : null,
  revisar: i === 6 ? ['fecha_apertura'] : [],
  notas: i % 3,
  archivos: i % 2,
  checklist: i % 2 ? { hechos: 2, total: 5 } : { hechos: 0, total: 0 },
  actividadesAbiertas: i % 4,
}));
const ahora = new Date().toISOString();
const tienda = {
  id: 't6',
  nombre: 'Tienda Prueba 7',
  etapa_id: 'e5',
  version: 1,
  revisar: ['fecha_apertura'],
  embudo: 'tiendas',
  posicion: 1,
  responsable_id: null,
  franquiciatario: 'Franquiciatario B',
  tipo_franquicia: 'franquiciatario',
  ciudad: 'Querétaro',
  direccion: 'Av. Ficticia 123',
  numero_tienda_jestor: 42,
  arquitecto_asignado: 'Arquitecta Prueba',
  fecha_entrega_proyecto: '2026-03-01',
  fecha_aprobacion_local: '2026-01-15',
  fecha_firma_contrato: '2025-11-02',
  fecha_firma_franquicia: '2025-12-10',
  estatus_contrato_franquicia: 'Firmado Digital',
  fecha_vencimiento_franquicia: '2030-12-10',
  fecha_programada_arranque: '2026-11-20',
  fecha_apertura: null,
  marca_cafetera: 'La Marzocco',
  estatus_cafetera: 'Pagada al 100%',
  rappi: false,
  rollout: true,
  correo_tienda: null,
  url_carpeta_contrato: 'https://example.com/carpeta',
  url_dictamen_local: null,
  creado_en: ahora,
  actualizado_en: ahora,
  creado_por: null,
  actualizado_por: null,
  archivado_en: null,
  zoho_org_id: null,
  zoho_module_api_name: 'Franquicias',
  zoho_record_id: 'z',
  zoho_created_at: ahora,
  zoho_modified_at: ahora,
  imported_at: ahora,
  import_run_id: null,
  import_hash: null,
} as unknown as Tienda;

const marco = (children: React.ReactNode) => (
  <Marco perfil={{ nombre: 'Usuario Prueba', rol: 'admin' }} seccion="crm" visibles={['costeo', 'crm']}>
    <p className="aviso">PRUEBA VISUAL · DATOS SINTÉTICOS · Sin Auth ni conexión a bases de datos</p>
    {children}
  </Marco>
);

export function VistaTiendas() {
  return marco(
    <>
      <Encabezado area="CRM Franquicias" titulo="Tiendas" descripcion="Pipeline de apertura de tiendas." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi etiqueta="En proceso" valor={10} icono={Store} nota="63 % de 16 tiendas" />
        <Kpi etiqueta="Operando" valor={3} icono={CircleCheck} tono="ok" nota="19 % de 16 tiendas" />
        <Kpi etiqueta="En pausa" valor={1} icono={CirclePause} tono="bajo" nota="6 % de 16 tiendas" />
        <Kpi etiqueta="Cerradas" valor={2} icono={CircleX} tono="sin-precio" nota="13 % de 16 tiendas" />
      </div>
      <TableroTiendas etapas={etapas} tarjetas={tarjetas} editable />
    </>,
  );
}

export function VistaExpediente() {
  return marco(
    <>
      <Encabezado
        titulo={tienda.nombre}
        descripcion="Franquiciatario B · Querétaro"
        migas={[
          { href: '/crm', nombre: 'CRM' },
          { href: '/crm/tiendas', nombre: 'Tiendas' },
        ]}
      />
      <AccionesTienda tienda={tienda} etapas={etapas} editable />
      <Pestanas
        pestanas={[
          { id: 'datos', nombre: 'Información', contenido: <DatosTienda tienda={tienda} editable /> },
          {
            id: 'actividad',
            nombre: 'Notas e historial',
            contador: 2,
            contenido: (
              <ActividadTienda
                relacion={{ tienda_id: tienda.id }}
                editable
                nombres={{}}
                notas={[
                  {
                    id: 'n1',
                    titulo: null,
                    contenido: 'Se revisó el local con la arquitecta. Pendiente el dictamen.',
                    autor_id: null,
                    creado_en: ahora,
                    zoho_created_at: '2026-02-03T17:00:00Z',
                    imported_at: ahora,
                  } as never,
                ]}
                historial={[
                  {
                    id: 2,
                    accion: 'etapa',
                    resumen: 'Etapa: Arquitecta Asignada → Proyecto 3D Entregado',
                    actor_id: null,
                    origen: 'zoho',
                    fecha: '2026-02-20T16:00:00Z',
                  } as never,
                  {
                    id: 1,
                    accion: 'importado',
                    resumen: 'Importado de Zoho',
                    actor_id: null,
                    origen: 'importacion',
                    fecha: ahora,
                  } as never,
                ]}
              />
            ),
          },
          {
            id: 'actividades',
            nombre: 'Actividades',
            contador: 1,
            contenido: (
              <ActividadesTienda
                tienda={tienda.id}
                editable
                actividades={[
                  {
                    id: 'a1',
                    asunto: 'Enviar dictamen de local',
                    estado: 'Not Started',
                    prioridad: 'High',
                    fecha_vencimiento: '2026-01-10',
                    version: 1,
                  } as never,
                  {
                    id: 'a2',
                    asunto: 'Kickoff de arquitectura',
                    estado: 'Completed',
                    prioridad: 'Normal',
                    fecha_vencimiento: '2025-12-01',
                    version: 1,
                  } as never,
                ]}
              />
            ),
          },
          {
            id: 'checklists',
            nombre: 'Checklists',
            contador: 1,
            contenido: (
              <ChecklistsTienda
                tienda={tienda.id}
                editable
                listas={[
                  {
                    id: 'c1',
                    nombre: 'Apertura',
                    items: [
                      { id: 'i1', texto: 'Alta en Google Maps', hecho: true, url: null },
                      { id: 'i2', texto: 'Configuración Partoo', hecho: false, url: null },
                      {
                        id: 'i3',
                        texto: 'Checklist pre-apertura',
                        hecho: false,
                        url: 'https://example.com/checklist',
                      },
                    ],
                  } as never,
                ]}
              />
            ),
          },
          {
            id: 'documentos',
            nombre: 'Documentos',
            contador: 2,
            contenido: (
              <DocumentosTienda
                tienda={tienda.id}
                editable
                archivos={[
                  {
                    id: 'f1',
                    nombre: 'proyecto-3d.pdf',
                    mime: 'application/pdf',
                    tamano: 2301135,
                    seccion: 'Información Proyecto',
                    campo: 'Proyecto_3D',
                    subido_en: ahora,
                    zoho_created_at: ahora,
                  } as never,
                  {
                    id: 'f2',
                    nombre: 'contrato.pdf',
                    mime: 'application/pdf',
                    tamano: 412000,
                    seccion: 'adjuntos',
                    campo: null,
                    subido_en: ahora,
                    zoho_created_at: null,
                  } as never,
                ]}
              />
            ),
          },
        ]}
      />
    </>,
  );
}
