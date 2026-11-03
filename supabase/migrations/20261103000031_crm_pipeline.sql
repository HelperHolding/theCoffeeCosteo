-- CRM Unificado (doc 40 §3–4): embudo 'general', card de franquiciatario y sucursal ligada.
-- Los embudos 'tiendas' y 'prospectos' se conservan para poder revertir el mapeo de la muestra.

-- 1. Etapas: embudo general con número del documento, área que mueve, tipo de card y marcas.
alter table public.crm_etapas drop constraint crm_etapas_embudo_check;
alter table public.crm_etapas add constraint crm_etapas_embudo_check
  check (embudo in ('tiendas', 'prospectos', 'general'));
alter table public.crm_etapas
  add column clave text,
  add column numero smallint,
  add column area text references public.crm_areas(clave),
  add column funcion text check (funcion in ('aprobacion_locales')),
  -- Tipo de card que vive en la etapa; nulo = ambas (Standby).
  add column card text check (card in ('franquiciatario', 'sucursal')),
  add column opcional boolean not null default false,
  add column provisional boolean not null default false,
  add constraint crm_etapas_general check (embudo <> 'general' or (clave is not null and area is not null));
create unique index crm_etapas_clave on public.crm_etapas (embudo, clave) where clave is not null;

insert into public.crm_etapas (embudo, clave, numero, nombre, orden, tipo, area, funcion, card, opcional, provisional) values
  ('general', 'recepcion', 1, 'Recepción, clasificación y asignación', 1, 'abierta', 'ventas', null, 'franquiciatario', false, false),
  ('general', 'contacto', 2, 'Contacto inicial y seguimiento', 2, 'abierta', 'ventas', null, 'franquiciatario', false, false),
  ('general', 'revision_contrato', 3, 'Revisión de contrato', 3, 'abierta', 'ventas', null, 'franquiciatario', true, false),
  ('general', 'pld', 4, 'Perfilamiento, PLD y formalización', 4, 'abierta', 'ventas', null, 'franquiciatario', false, false),
  ('general', 'bienvenida', 5, 'Bienvenida, carta de intención y facturación', 5, 'abierta', 'ventas', null, 'franquiciatario', false, false),
  ('general', 'formalizado', null, 'Formalizado', 6, 'ganada', 'ventas', null, 'franquiciatario', false, false),
  ('general', 'locales', 6, 'Aprobación de locales', 7, 'abierta', 'ventas', 'aprobacion_locales', 'sucursal', false, false),
  ('general', 'constancia', 7, 'Constancia de arrendamiento', 8, 'abierta', 'legal', null, 'sucursal', false, false),
  ('general', 'transferencia', 8, 'Transferencia a Proyectos', 9, 'abierta', 'legal', null, 'sucursal', false, false),
  -- Provisionales de Proyectos (P3): nombres de Zoho hasta que llegue el documento de Diego.
  ('general', 'p_arquitecta', null, 'Arquitecta asignada', 10, 'abierta', 'proyectos', null, 'sucursal', false, true),
  ('general', 'p_3d', null, 'Proyecto 3D', 11, 'abierta', 'proyectos', null, 'sucursal', false, true),
  ('general', 'p_ejecutivo', null, 'Proyecto ejecutivo', 12, 'abierta', 'proyectos', null, 'sucursal', false, true),
  ('general', 'p_remodelacion', null, 'En remodelación', 13, 'abierta', 'proyectos', null, 'sucursal', false, true),
  ('general', 'p_entrega', null, 'Entrega de local', 14, 'abierta', 'proyectos', null, 'sucursal', false, true),
  ('general', 'p_capacitacion', null, 'Agenda de capacitación', 15, 'abierta', 'proyectos', null, 'sucursal', false, true),
  ('general', 'cof', 9, 'Circular Oferta de Franquicia (COF)', 16, 'abierta', 'legal', null, 'sucursal', false, false),
  ('general', 'contrato', 10, 'Contrato de franquicia y apertura', 17, 'abierta', 'legal', null, 'sucursal', false, false),
  ('general', 'operando', null, 'Operando', 18, 'ganada', 'legal', null, 'sucursal', false, false),
  ('general', 'standby', null, 'Standby', 19, 'lateral', 'ventas', null, null, false, false),
  ('general', 'descartada', null, 'Descartada', 20, 'perdida', 'ventas', null, 'franquiciatario', false, false),
  ('general', 'cancelada', null, 'Cancelada', 21, 'perdida', 'legal', null, 'sucursal', false, false),
  ('general', 'cerrada', null, 'Cerrada', 22, 'perdida', 'legal', null, 'sucursal', false, false);

-- Etapa por clave (embudo general), para funciones y semillas.
create function public.crm_etapa(p_clave text) returns uuid
language sql stable set search_path = public, pg_temp as $$
  select id from public.crm_etapas where embudo = 'general' and clave = p_clave
$$;

-- 2. Card de franquiciatario (etapas 1–5). Nace del prospecto o se captura en el CRM.
create table public.crm_franquiciatarios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  tipo_persona text check (tipo_persona in ('fisica', 'moral')),
  correo text,
  telefono text,
  ciudad_interes text,
  estado_interes text,
  origen text,
  territorio text check (territorio in ('disponible', 'restringida', 'exclusiva', 'bloqueada')),
  -- Vendedor asignado.
  responsable_id uuid references auth.users(id) on delete set null,
  embudo text not null default 'general' check (embudo = 'general'),
  etapa_id uuid not null,
  -- Etapa a la que regresa al salir de Standby.
  etapa_previa_id uuid references public.crm_etapas(id),
  posicion double precision not null default 0,
  formalizado_en timestamptz,
  -- Datos del Survey que Legal usa sin volver a pedirlos.
  firmante text,
  obligado_solidario text,
  razon_social text,
  rfc text,
  regimen_fiscal text,
  codigo_postal_fiscal text,
  prospecto_id uuid unique references public.crm_prospectos(id),
  muestra boolean not null default false,
  etapa_origen_id uuid references public.crm_etapas(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_por uuid,
  version integer not null default 1,
  archivado_en timestamptz,
  archivado_por uuid,
  foreign key (etapa_id, embudo) references public.crm_etapas(id, embudo)
);
create index crm_franquiciatarios_etapa on public.crm_franquiciatarios (etapa_id, actualizado_en desc) where archivado_en is null;
create index crm_franquiciatarios_responsable on public.crm_franquiciatarios (responsable_id) where responsable_id is not null;
create index crm_franquiciatarios_muestra on public.crm_franquiciatarios (muestra) where muestra;

-- 3. Sucursal = crm_tiendas en el embudo general, ligada a su franquiciatario.
alter table public.crm_tiendas drop constraint crm_tiendas_embudo_check;
alter table public.crm_tiendas add constraint crm_tiendas_embudo_check check (embudo in ('tiendas', 'general'));
alter table public.crm_tiendas
  add column franquiciatario_id uuid references public.crm_franquiciatarios(id),
  add column fecha_estimada_apertura date,
  add column fecha_confirmada_apertura date,
  add column fecha_limite_apertura date,
  add column etapa_previa_id uuid references public.crm_etapas(id),
  add column muestra boolean not null default false,
  add column etapa_origen_id uuid references public.crm_etapas(id),
  add column archivado_por uuid;
create index crm_tiendas_franquiciatario on public.crm_tiendas (franquiciatario_id) where franquiciatario_id is not null;

-- 4. Notas, actividades y archivos también cuelgan del franquiciatario.
alter table public.crm_notas add column franquiciatario_id uuid references public.crm_franquiciatarios(id);
alter table public.crm_notas drop constraint crm_notas_check;
alter table public.crm_notas add constraint crm_notas_check
  check (num_nonnulls(tienda_id, prospecto_id, contacto_id, actividad_id, franquiciatario_id) = 1);
alter table public.crm_actividades add column franquiciatario_id uuid references public.crm_franquiciatarios(id);
alter table public.crm_actividades drop constraint crm_actividades_check;
alter table public.crm_actividades add constraint crm_actividades_check
  check (num_nonnulls(tienda_id, prospecto_id, franquiciatario_id) <= 1);
alter table public.crm_archivos
  add column franquiciatario_id uuid references public.crm_franquiciatarios(id),
  add column tipo_documento text,
  -- Versión del documento (la columna `version` es la de concurrencia optimista).
  add column version_documento integer not null default 1,
  add column reemplaza_a uuid references public.crm_archivos(id),
  add column motivo_retiro text;
alter table public.crm_archivos drop constraint crm_archivos_check;
alter table public.crm_archivos add constraint crm_archivos_check
  check (num_nonnulls(tienda_id, prospecto_id, contacto_id, nota_id, franquiciatario_id) = 1);
create index crm_notas_franquiciatario on public.crm_notas (franquiciatario_id) where franquiciatario_id is not null;
create index crm_actividades_franquiciatario on public.crm_actividades (franquiciatario_id) where franquiciatario_id is not null;
create index crm_archivos_franquiciatario on public.crm_archivos (franquiciatario_id) where franquiciatario_id is not null;
create index crm_archivos_reemplaza on public.crm_archivos (reemplaza_a) where reemplaza_a is not null;

-- 5. Seguridad de la tabla nueva: mismo patrón que el resto del CRM (cerrado por defecto, sin OAuth).
alter table public.crm_franquiciatarios enable row level security;
revoke all on public.crm_franquiciatarios from anon, authenticated;
grant select, insert, update on public.crm_franquiciatarios to authenticated;
create policy lectura on public.crm_franquiciatarios for select to authenticated using ((select public.crm_puede_leer()));
create policy alta on public.crm_franquiciatarios for insert to authenticated with check ((select public.crm_puede_editar()));
create policy cambio on public.crm_franquiciatarios for update to authenticated
  using ((select public.crm_puede_editar())) with check ((select public.crm_puede_editar()));
create policy crm_sin_oauth on public.crm_franquiciatarios as restrictive for all to authenticated
  using (((select auth.jwt())->>'client_id') is null) with check (((select auth.jwt())->>'client_id') is null);
create trigger crm_franquiciatarios_sellar before insert or update on public.crm_franquiciatarios
  for each row execute function public.crm_sellar();

-- 6. Candado de etapa: en el embudo general la etapa solo cambia por crm_avanzar (marca crm.avance).
-- Un usuario que crea un franquiciatario siempre empieza en la etapa 1; las sucursales las crea la base.
create function public.crm_guardar_etapa() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  por_funcion boolean := current_setting('crm.avance', true) = 'si';
begin
  if current_user <> 'authenticated' or por_funcion then return new; end if;
  if tg_op = 'INSERT' then
    if new.embudo = 'general' then
      if tg_table_name = 'crm_franquiciatarios' then
        new := jsonb_populate_record(new, jsonb_build_object('etapa_id', public.crm_etapa('recepcion'),
          'muestra', false, 'formalizado_en', null));
      else
        raise exception 'Las sucursales se crean desde el franquiciatario' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;
  -- El Kanban viejo (embudo 'tiendas') sigue igual hasta que se mapee la muestra.
  if old.embudo <> 'general' and new.embudo <> 'general' then return new; end if;
  if new.etapa_id is distinct from old.etapa_id or new.embudo is distinct from old.embudo
    or new.etapa_previa_id is distinct from old.etapa_previa_id
    or new.muestra is distinct from old.muestra or new.etapa_origen_id is distinct from old.etapa_origen_id then
    raise exception 'La etapa solo cambia con «Avanzar» (revisa candados y permisos)' using errcode = '42501';
  end if;
  -- Acceso por JSON: PL/pgSQL valida el campo del registro aunque la otra condición sea falsa.
  if tg_table_name = 'crm_franquiciatarios'
    and to_jsonb(new)->>'formalizado_en' is distinct from to_jsonb(old)->>'formalizado_en' then
    raise exception 'La formalización la registra la base al cerrar la etapa 5' using errcode = '42501';
  end if;
  if tg_table_name = 'crm_tiendas' and old.embudo = 'general'
    and to_jsonb(new)->>'franquiciatario_id' is distinct from to_jsonb(old)->>'franquiciatario_id' then
    raise exception 'Una sucursal no cambia de franquiciatario' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function public.crm_guardar_etapa() from public, anon, authenticated;
create trigger crm_franquiciatarios_etapa before insert or update on public.crm_franquiciatarios
  for each row execute function public.crm_guardar_etapa();
create trigger crm_tiendas_etapa before insert or update on public.crm_tiendas
  for each row execute function public.crm_guardar_etapa();
