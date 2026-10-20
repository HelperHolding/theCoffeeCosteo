-- CRM Franquicias: tablas (seguridad en la migración siguiente). Mapeo aprobado en docs/zoho/CRM-SCOPE-DECISIONS.md.

create table public.crm_etapas (
  id uuid primary key default gen_random_uuid(),
  embudo text not null check (embudo in ('tiendas', 'prospectos')),
  nombre text not null check (btrim(nombre) <> ''),
  orden integer not null,
  tipo text not null default 'abierta' check (tipo in ('abierta', 'lateral', 'ganada', 'perdida')),
  activa boolean not null default true,
  zoho_valor text,
  creado_en timestamptz not null default now(),
  unique (embudo, nombre),
  unique (id, embudo)
);

-- Etapas de tiendas aprobadas en la Fase 4 (orden del flujo observado en Zoho).
insert into public.crm_etapas (embudo, nombre, orden, tipo, zoho_valor) values
  ('tiendas', 'Firma de contrato', 1, 'abierta', 'Firma de contrato'),
  ('tiendas', 'En búsqueda de local', 2, 'abierta', 'En búsqueda de local'),
  ('tiendas', 'Local aprobado por México', 3, 'abierta', 'Local aprobado por México'),
  ('tiendas', 'Local aprobado por Brasil', 4, 'abierta', 'Local aprobado por Brasil'),
  ('tiendas', 'Arquitecta Asignada', 5, 'abierta', 'Arquitecta Asignada'),
  ('tiendas', 'Proyecto 3D Entregado', 6, 'abierta', 'Proyecto 3D Entregado'),
  ('tiendas', 'Proyecto Ejecutivo Entregado', 7, 'abierta', 'Proyecto Ejecutivo Entregado'),
  ('tiendas', 'En remodelación', 8, 'abierta', 'En remodelación'),
  ('tiendas', 'Entrega de local', 9, 'abierta', 'Entrega de local'),
  ('tiendas', 'Agenda de capacitación', 10, 'abierta', 'Agenda de capacitación'),
  ('tiendas', 'Operando', 11, 'ganada', 'Operando'),
  ('tiendas', 'Standby', 12, 'lateral', 'Standby'),
  ('tiendas', 'Modificaciones pendientes', 13, 'lateral', 'Modificaciones pendientes'),
  ('tiendas', 'Cancelada', 14, 'perdida', 'Cancelada'),
  ('tiendas', 'Cerrada', 15, 'perdida', 'Cerrada');

create table public.crm_tiendas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  embudo text not null default 'tiendas' check (embudo = 'tiendas'),
  etapa_id uuid not null,
  posicion double precision not null default 0,
  responsable_id uuid references auth.users(id) on delete set null,
  franquiciatario text,
  tipo_franquicia text check (tipo_franquicia in ('franquiciatario', 'maestra')),
  ciudad text,
  direccion text,
  numero_tienda_jestor integer,
  arquitecto_asignado text,
  fecha_entrega_proyecto date,
  fecha_aprobacion_local date,
  fecha_firma_contrato date,
  fecha_firma_franquicia date,
  estatus_contrato_franquicia text check (estatus_contrato_franquicia in ('Pendiente', 'Firmado Digital', 'Firmado Presencial')),
  fecha_vencimiento_franquicia date,
  fecha_programada_arranque date,
  fecha_apertura date,
  marca_cafetera text check (marca_cafetera in ('La Marzocco', 'Victoria Arduino')),
  estatus_cafetera text check (estatus_cafetera in ('Apartada (anticipo pagado)', 'Pagada al 100%', 'Recibida', 'Instalada')),
  rappi boolean not null default false,
  rollout boolean not null default false,
  correo_tienda text,
  url_carpeta_contrato text,
  url_dictamen_local text,
  revisar text[] not null default '{}',
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_por uuid,
  version integer not null default 1,
  archivado_en timestamptz,
  zoho_org_id text,
  zoho_module_api_name text,
  zoho_record_id text unique,
  zoho_created_at timestamptz,
  zoho_modified_at timestamptz,
  imported_at timestamptz,
  import_run_id uuid,
  import_hash text,
  foreign key (etapa_id, embudo) references public.crm_etapas(id, embudo)
);
create index crm_tiendas_kanban on public.crm_tiendas (etapa_id, posicion) where archivado_en is null;

create table public.crm_prospectos (
  id uuid primary key default gen_random_uuid(),
  nombre text,
  apellidos text not null check (btrim(apellidos) <> ''),
  correo text,
  telefono text,
  embudo text not null default 'prospectos' check (embudo = 'prospectos'),
  etapa_id uuid,
  posicion double precision not null default 0,
  responsable_id uuid references auth.users(id) on delete set null,
  empresa text,
  ciudad_interes text,
  estado_interes text,
  ciudad_residencia text,
  estado_residencia text,
  pais text,
  inversion text,
  capital_disponible text,
  fuente_capital text,
  interes_en_the_coffee text,
  por_que_tendra_exito text,
  plan_operacion text,
  involucrado_otra_marca text,
  marca_involucramiento text,
  pagina_web text,
  sin_correos boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_por uuid,
  version integer not null default 1,
  archivado_en timestamptz,
  zoho_org_id text,
  zoho_module_api_name text,
  zoho_record_id text unique,
  zoho_created_at timestamptz,
  zoho_modified_at timestamptz,
  imported_at timestamptz,
  import_run_id uuid,
  import_hash text,
  foreign key (etapa_id, embudo) references public.crm_etapas(id, embudo)
);
create index crm_prospectos_etapa on public.crm_prospectos (etapa_id, posicion) where archivado_en is null;

create table public.crm_contactos (
  id uuid primary key default gen_random_uuid(),
  nombre text,
  apellidos text not null check (btrim(apellidos) <> ''),
  correo text,
  telefono text,
  puesto text,
  tipo_contacto text check (tipo_contacto in ('Administrativos Oficina', 'Directores', 'Franquiciatarios',
    'Nuevos Franquiciatarios', 'Gerentes Operativos', 'Contactos Marketing', 'Newsletter')),
  franquiciatario text,
  plaza text,
  recibe_newsletter boolean not null default false,
  recibe_comunicados boolean not null default false,
  fee_pagado boolean not null default false,
  responsable_id uuid references auth.users(id) on delete set null,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_por uuid,
  version integer not null default 1,
  archivado_en timestamptz,
  zoho_org_id text,
  zoho_module_api_name text,
  zoho_record_id text unique,
  zoho_created_at timestamptz,
  zoho_modified_at timestamptz,
  imported_at timestamptz,
  import_run_id uuid,
  import_hash text
);

-- Sustituye a la liga con Cuentas: tienda y contacto compartían franquiciatario en Zoho.
create table public.crm_tienda_contactos (
  tienda_id uuid not null references public.crm_tiendas(id) on delete cascade,
  contacto_id uuid not null references public.crm_contactos(id) on delete cascade,
  origen text not null default 'crm' check (origen in ('crm', 'importacion')),
  creado_en timestamptz not null default now(),
  primary key (tienda_id, contacto_id)
);

create table public.crm_actividades (
  id uuid primary key default gen_random_uuid(),
  asunto text not null check (btrim(asunto) <> ''),
  fecha_vencimiento date,
  estado text not null default 'Not Started'
    check (estado in ('Not Started', 'Deferred', 'In Progress', 'Completed', 'Waiting for input', 'Interesado')),
  prioridad text check (prioridad in ('Highest', 'High', 'Normal', 'Low', 'Lowest')),
  descripcion text,
  cerrada_en timestamptz,
  recordatorio_zoho text,
  responsable_id uuid references auth.users(id) on delete set null,
  tienda_id uuid references public.crm_tiendas(id),
  prospecto_id uuid references public.crm_prospectos(id),
  contacto_id uuid references public.crm_contactos(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_por uuid,
  version integer not null default 1,
  archivado_en timestamptz,
  zoho_org_id text,
  zoho_module_api_name text,
  zoho_record_id text unique,
  zoho_created_at timestamptz,
  zoho_modified_at timestamptz,
  imported_at timestamptz,
  import_run_id uuid,
  import_hash text,
  -- Relacionada con a lo más una tienda o un prospecto; el contacto puede acompañar.
  check (num_nonnulls(tienda_id, prospecto_id) <= 1)
);
create index crm_actividades_tienda on public.crm_actividades (tienda_id) where tienda_id is not null;
create index crm_actividades_prospecto on public.crm_actividades (prospecto_id) where prospecto_id is not null;
create index crm_actividades_contacto on public.crm_actividades (contacto_id) where contacto_id is not null;

create table public.crm_notas (
  id uuid primary key default gen_random_uuid(),
  titulo text,
  contenido text not null,
  autor_id uuid references auth.users(id) on delete set null,
  tienda_id uuid references public.crm_tiendas(id),
  prospecto_id uuid references public.crm_prospectos(id),
  contacto_id uuid references public.crm_contactos(id),
  actividad_id uuid references public.crm_actividades(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_por uuid,
  version integer not null default 1,
  archivado_en timestamptz,
  zoho_org_id text,
  zoho_module_api_name text,
  zoho_record_id text unique,
  zoho_created_at timestamptz,
  zoho_modified_at timestamptz,
  imported_at timestamptz,
  import_run_id uuid,
  import_hash text,
  check (num_nonnulls(tienda_id, prospecto_id, contacto_id, actividad_id) = 1)
);
create index crm_notas_tienda on public.crm_notas (tienda_id) where tienda_id is not null;
create index crm_notas_prospecto on public.crm_notas (prospecto_id) where prospecto_id is not null;

create table public.crm_etiquetas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique check (btrim(nombre) <> ''),
  color text,
  creado_en timestamptz not null default now()
);
create table public.crm_etiquetas_registro (
  id uuid primary key default gen_random_uuid(),
  etiqueta_id uuid not null references public.crm_etiquetas(id) on delete cascade,
  tienda_id uuid references public.crm_tiendas(id) on delete cascade,
  prospecto_id uuid references public.crm_prospectos(id) on delete cascade,
  contacto_id uuid references public.crm_contactos(id) on delete cascade,
  creado_en timestamptz not null default now(),
  check (num_nonnulls(tienda_id, prospecto_id, contacto_id) = 1)
);
create unique index crm_etiquetas_tienda on public.crm_etiquetas_registro (etiqueta_id, tienda_id) where tienda_id is not null;
create unique index crm_etiquetas_prospecto on public.crm_etiquetas_registro (etiqueta_id, prospecto_id) where prospecto_id is not null;
create unique index crm_etiquetas_contacto on public.crm_etiquetas_registro (etiqueta_id, contacto_id) where contacto_id is not null;

create table public.crm_checklists (
  id uuid primary key default gen_random_uuid(),
  tienda_id uuid not null references public.crm_tiendas(id),
  nombre text not null check (btrim(nombre) <> ''),
  orden double precision not null default 0,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_por uuid,
  version integer not null default 1,
  archivado_en timestamptz
);
create table public.crm_checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.crm_checklists(id) on delete cascade,
  texto text not null check (btrim(texto) <> ''),
  hecho boolean not null default false,
  orden double precision not null default 0,
  responsable_id uuid references auth.users(id) on delete set null,
  fecha_limite date,
  url text,
  completado_por uuid,
  completado_en timestamptz,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_por uuid,
  version integer not null default 1
);
create index crm_checklist_items_lista on public.crm_checklist_items (checklist_id, orden);

create table public.crm_archivos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  mime text not null,
  tamano bigint not null check (tamano >= 0),
  sha256 text,
  ruta text not null unique,
  seccion text not null default 'adjuntos',
  campo text,
  tienda_id uuid references public.crm_tiendas(id),
  prospecto_id uuid references public.crm_prospectos(id),
  contacto_id uuid references public.crm_contactos(id),
  nota_id uuid references public.crm_notas(id),
  subido_por uuid,
  subido_en timestamptz not null default now(),
  archivado_en timestamptz,
  archivado_por uuid,
  version integer not null default 1,
  zoho_attachment_id text unique,
  zoho_file_id text,
  zoho_org_id text,
  zoho_module_api_name text,
  zoho_created_at timestamptz,
  imported_at timestamptz,
  import_run_id uuid,
  check (num_nonnulls(tienda_id, prospecto_id, contacto_id, nota_id) = 1)
);
create index crm_archivos_tienda on public.crm_archivos (tienda_id) where tienda_id is not null;

-- Bitácora del CRM (separada de `bitacora`, cuya lógica es de recetas).
create table public.crm_historial (
  id bigint generated always as identity primary key,
  entidad text not null,
  entidad_id uuid not null,
  tienda_id uuid,
  accion text not null check (accion in ('creado', 'editado', 'etapa', 'responsable', 'archivado',
    'nota', 'checklist', 'archivo', 'importado')),
  resumen text not null,
  cambios jsonb,
  actor_id uuid,
  origen text not null default 'crm' check (origen in ('crm', 'importacion', 'zoho')),
  fecha timestamptz not null default now()
);
create index crm_historial_entidad on public.crm_historial (entidad, entidad_id, fecha desc);
create index crm_historial_tienda on public.crm_historial (tienda_id, fecha desc) where tienda_id is not null;
