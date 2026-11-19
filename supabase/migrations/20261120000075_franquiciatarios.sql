-- Módulo Franquiciatarios (docs/franquiciatarios/01-RESULTADO.md): operación diaria por sucursal.
-- Roles externos por sucursal (franquiciatario, gerente, barista), nombres de baristas dentro de una cuenta compartida
-- por tienda, checklists de turno con plantilla versionada, firmas, incidencias y avisos.
-- Reglas: acceso cerrado por defecto (perfil_modulos + franq_miembros), sin tokens OAuth, y los registros del
-- checklist no se editan ni se borran (una corrección es un renglón nuevo ligado al anterior).

-- 1. Rol 'tienda' (cuenta compartida de baristas). Como 'franquiciado', no está en ROLES_COSTEO ni en la RLS de Costeo.
alter table public.perfiles drop constraint perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('compras', 'operaciones', 'finanzas', 'admin', 'sucursales', 'interno', 'franquiciado', 'proveedor',
                 'tienda'));

alter table public.perfil_modulos drop constraint perfil_modulos_modulo_check;
alter table public.perfil_modulos add constraint perfil_modulos_modulo_check
  check (modulo in ('crm', 'sucursales', 'sucursales_costeo', 'bi', 'comercializadora', 'franquiciatarios'));

-- 2. Membresías por sucursal. Se dan de alta fuera del portal (SQL con autorización), como perfil_sucursales.
create table public.franq_miembros (
  user_id uuid not null references public.perfiles (user_id) on delete cascade,
  company_id integer not null check (company_id > 0),
  rol text not null check (rol in ('franquiciatario', 'gerente', 'barista')),
  activo boolean not null default true,
  creado_en timestamptz not null default now(),
  primary key (user_id, company_id)
);
create index franq_miembros_company on public.franq_miembros (company_id);

-- La cuenta de baristas ('tienda') solo puede ser 'barista', y una persona nunca es 'barista'.
create function public.franq_miembros_coherente() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_rol text;
begin
  select rol into v_rol from public.perfiles where user_id = new.user_id;
  if (v_rol = 'tienda') <> (new.rol = 'barista') then
    raise exception 'La cuenta de baristas (rol tienda) solo puede tener el rol barista, y viceversa.';
  end if;
  return new;
end $$;
create trigger franq_miembros_coherente before insert or update on public.franq_miembros
  for each row execute function public.franq_miembros_coherente();

-- 3. Acceso. 'admin' = fila del módulo con nivel desarrollador (administra la plataforma y ve todas las sucursales).
--    Los demás necesitan la fila del módulo y una membresía activa en esa sucursal. Nunca con un token OAuth.
create function public.franq_rol(p_company integer) returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case when p_company is null or p_company <= 0 or (auth.jwt()->>'client_id') is not null then null else (
    select case when m.nivel = 'desarrollador' then 'admin' else fm.rol end
    from public.perfiles p
    join public.perfil_modulos m on m.user_id = p.user_id and m.modulo = 'franquiciatarios'
    left join public.franq_miembros fm on fm.user_id = p.user_id and fm.company_id = p_company and fm.activo
    where p.user_id = auth.uid() and p.activo) end
$$;
revoke all on function public.franq_rol(integer) from public, anon;
grant execute on function public.franq_rol(integer) to authenticated;

-- Para las políticas RLS: se evalúan una vez por consulta (initPlan) dentro de (select …), no por renglón.
create function public.franq_tiene_modulo() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (auth.jwt()->>'client_id') is null and exists (
    select 1 from public.perfiles p
    join public.perfil_modulos m on m.user_id = p.user_id and m.modulo = 'franquiciatarios'
    where p.user_id = auth.uid() and p.activo)
$$;
create function public.franq_es_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (auth.jwt()->>'client_id') is null and exists (
    select 1 from public.perfiles p
    join public.perfil_modulos m on m.user_id = p.user_id and m.modulo = 'franquiciatarios' and m.nivel = 'desarrollador'
    where p.user_id = auth.uid() and p.activo)
$$;
create function public.franq_companias() returns integer[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(fm.company_id), '{}') from public.franq_miembros fm
  where public.franq_tiene_modulo() and fm.user_id = auth.uid() and fm.activo
$$;
revoke all on function public.franq_tiene_modulo(), public.franq_es_admin(), public.franq_companias() from public, anon;
grant execute on function public.franq_tiene_modulo(), public.franq_es_admin(), public.franq_companias() to authenticated;

create function public.franq_es_gestor(p_company integer) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.franq_rol(p_company) in ('admin', 'franquiciatario', 'gerente'), false)
$$;
revoke all on function public.franq_es_gestor(integer) from public, anon;
grant execute on function public.franq_es_gestor(integer) to authenticated;

-- Día de operación: cambia a las 4:00 de Ciudad de México (un cierre después de medianoche sigue en el día anterior).
create function public.franq_dia_operacion(p_momento timestamptz default now()) returns date
language sql stable set search_path = public, pg_temp as $$
  select ((p_momento at time zone 'America/Mexico_City') - interval '4 hours')::date
$$;

-- Rechaza cualquier UPDATE o DELETE: también para service_role y el admin.
create function public.franq_solo_insercion() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'Los registros de % no se editan ni se borran; registra una corrección.', tg_table_name;
end $$;

-- 4. Nombres de baristas: se desactivan, nunca se borran. company_id, autor y fecha de alta no cambian.
create table public.franq_baristas (
  id bigint generated always as identity primary key,
  company_id integer not null check (company_id > 0),
  nombre text not null check (char_length(nombre) between 2 and 60 and nombre = btrim(nombre)),
  activo boolean not null default true,
  creado_por uuid not null references auth.users (id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users (id),
  actualizado_en timestamptz
);
create unique index franq_baristas_nombre_activo on public.franq_baristas (company_id, lower(nombre)) where activo;
create index franq_baristas_company on public.franq_baristas (company_id);

create function public.franq_baristas_guardia() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los nombres de baristas no se borran; desactívalos.';
  end if;
  if new.company_id <> old.company_id or new.creado_por <> old.creado_por or new.creado_en <> old.creado_en then
    raise exception 'Solo cambian el nombre y si está activo.';
  end if;
  return new;
end $$;
create trigger franq_baristas_guardia before update or delete on public.franq_baristas
  for each row execute function public.franq_baristas_guardia();

-- 5. Plantillas versionadas. Una versión no se edita: un cambio es una versión nueva (solo cambia «vigente»).
--    company_id nulo = plantilla general.
create table public.franq_plantillas (
  id bigint generated always as identity primary key,
  clave text not null default 'turno' check (clave = 'turno'),
  company_id integer check (company_id > 0),
  version integer not null check (version > 0),
  vigente boolean not null default true,
  creado_en timestamptz not null default now(),
  unique nulls not distinct (clave, company_id, version)
);
create table public.franq_plantilla_secciones (
  id bigint generated always as identity primary key,
  plantilla_id bigint not null references public.franq_plantillas (id),
  clave text not null check (clave in ('apertura', 'cambio', 'cierre')),
  nombre text not null,
  orden integer not null,
  firmas text[] not null check (cardinality(firmas) > 0 and firmas <@ array['responsable', 'entrega', 'recibe']),
  unique (plantilla_id, clave)
);
create table public.franq_plantilla_puntos (
  id bigint generated always as identity primary key,
  seccion_id bigint not null references public.franq_plantilla_secciones (id),
  orden integer not null,
  actividad text not null,
  estandar text not null,
  unique (seccion_id, orden)
);

create function public.franq_plantillas_guardia() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' and (new.clave, new.company_id, new.version, new.creado_en)
                          is not distinct from (old.clave, old.company_id, old.version, old.creado_en) then
    return new;
  end if;
  raise exception 'Una versión de plantilla no se edita ni se borra; crea una versión nueva.';
end $$;
create trigger franq_plantillas_guardia before update or delete on public.franq_plantillas
  for each row execute function public.franq_plantillas_guardia();
create trigger franq_secciones_solo_insercion before update or delete on public.franq_plantilla_secciones
  for each row execute function public.franq_solo_insercion();
create trigger franq_puntos_solo_insercion before update or delete on public.franq_plantilla_puntos
  for each row execute function public.franq_solo_insercion();

-- Plantilla vigente de la sucursal: la propia más reciente; si no tiene, la general más reciente.
create function public.franq_plantilla_vigente(p_company integer) returns bigint
language sql stable security definer set search_path = public, pg_temp as $$
  select id from public.franq_plantillas
  where clave = 'turno' and vigente and (company_id = p_company or company_id is null)
  order by (company_id is null), version desc
  limit 1
$$;
revoke all on function public.franq_plantilla_vigente(integer) from public, anon, authenticated;

-- 6. Registros del día. Todo es solo inserción.
create table public.franq_checklists (
  id bigint generated always as identity primary key,
  company_id integer not null check (company_id > 0),
  dia date not null,
  seccion text not null check (seccion in ('apertura', 'cambio', 'cierre')),
  seccion_id bigint not null references public.franq_plantilla_secciones (id),
  creado_en timestamptz not null default now(),
  unique (company_id, dia, seccion)
);

create table public.franq_respuestas (
  id bigint generated always as identity primary key,
  checklist_id bigint not null references public.franq_checklists (id),
  company_id integer not null check (company_id > 0),
  punto_id bigint not null references public.franq_plantilla_puntos (id),
  cumple boolean not null,
  observacion text check (observacion is null or char_length(observacion) <= 1000),
  barista_id bigint references public.franq_baristas (id),
  nombre text not null,
  registrado_por uuid not null references auth.users (id),
  registrado_en timestamptz not null default now(),
  sesion text,
  dispositivo text check (dispositivo is null or char_length(dispositivo) <= 300),
  corrige_id bigint references public.franq_respuestas (id),
  motivo text check (motivo is null or char_length(motivo) <= 500),
  constraint franq_respuestas_observacion_no check (cumple or char_length(btrim(coalesce(observacion, ''))) >= 3)
);
create index franq_respuestas_punto on public.franq_respuestas (checklist_id, punto_id, id desc);
create index franq_respuestas_company on public.franq_respuestas (company_id, registrado_en);
create index franq_respuestas_corrige on public.franq_respuestas (corrige_id);
create index franq_respuestas_barista on public.franq_respuestas (barista_id);

create table public.franq_firmas (
  id bigint generated always as identity primary key,
  checklist_id bigint not null references public.franq_checklists (id),
  company_id integer not null check (company_id > 0),
  tipo text not null check (tipo in ('responsable', 'entrega', 'recibe')),
  barista_id bigint references public.franq_baristas (id),
  nombre text not null,
  registrado_por uuid not null references auth.users (id),
  registrado_en timestamptz not null default now(),
  sesion text,
  dispositivo text check (dispositivo is null or char_length(dispositivo) <= 300),
  unique (checklist_id, tipo)
);
create index franq_firmas_company on public.franq_firmas (company_id);
create index franq_firmas_barista on public.franq_firmas (barista_id);

create table public.franq_incidencias (
  id bigint generated always as identity primary key,
  company_id integer not null check (company_id > 0),
  dia date not null,
  texto text not null check (char_length(btrim(texto)) between 3 and 2000),
  barista_id bigint references public.franq_baristas (id),
  nombre text not null,
  registrado_por uuid not null references auth.users (id),
  registrado_en timestamptz not null default now(),
  sesion text,
  dispositivo text check (dispositivo is null or char_length(dispositivo) <= 300)
);
create index franq_incidencias_dia on public.franq_incidencias (company_id, dia);
create index franq_incidencias_barista on public.franq_incidencias (barista_id);

create trigger franq_checklists_solo_insercion before update or delete on public.franq_checklists
  for each row execute function public.franq_solo_insercion();
create trigger franq_respuestas_solo_insercion before update or delete on public.franq_respuestas
  for each row execute function public.franq_solo_insercion();
create trigger franq_firmas_solo_insercion before update or delete on public.franq_firmas
  for each row execute function public.franq_solo_insercion();
create trigger franq_incidencias_solo_insercion before update or delete on public.franq_incidencias
  for each row execute function public.franq_solo_insercion();

-- 7. RLS: lectura por sucursal; escritura solo por las funciones de abajo. Ningún token OAuth.
alter table public.franq_miembros enable row level security;
alter table public.franq_baristas enable row level security;
alter table public.franq_plantillas enable row level security;
alter table public.franq_plantilla_secciones enable row level security;
alter table public.franq_plantilla_puntos enable row level security;
alter table public.franq_checklists enable row level security;
alter table public.franq_respuestas enable row level security;
alter table public.franq_firmas enable row level security;
alter table public.franq_incidencias enable row level security;

revoke all on public.franq_miembros, public.franq_baristas, public.franq_plantillas, public.franq_plantilla_secciones,
  public.franq_plantilla_puntos, public.franq_checklists, public.franq_respuestas, public.franq_firmas,
  public.franq_incidencias from anon, authenticated;
grant select on public.franq_miembros, public.franq_baristas, public.franq_plantillas, public.franq_plantilla_secciones,
  public.franq_plantilla_puntos, public.franq_checklists, public.franq_respuestas, public.franq_firmas,
  public.franq_incidencias to authenticated;

create policy lectura on public.franq_miembros for select to authenticated
  using (user_id = (select auth.uid()) and ((select auth.jwt()) ->> 'client_id') is null);
-- Por sucursal: el admin del módulo todas; los demás, las de sus membresías activas (con el módulo y sin OAuth).
create policy lectura on public.franq_baristas for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias())::integer[]));
create policy lectura on public.franq_checklists for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias())::integer[]));
create policy lectura on public.franq_respuestas for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias())::integer[]));
create policy lectura on public.franq_firmas for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias())::integer[]));
create policy lectura on public.franq_incidencias for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias())::integer[]));
-- Plantillas: cualquiera con el módulo (no tienen datos de sucursal).
create policy lectura on public.franq_plantillas for select to authenticated
  using ((select public.franq_tiene_modulo()));
create policy lectura on public.franq_plantilla_secciones for select to authenticated
  using ((select public.franq_tiene_modulo()));
create policy lectura on public.franq_plantilla_puntos for select to authenticated
  using ((select public.franq_tiene_modulo()));

-- 8. Quién registra: la cuenta de baristas debe declarar un nombre activo de SU sucursal; un gerente, franquiciatario
--    o admin registra con el nombre de su perfil.
create function public.franq_quien(p_company integer, p_barista bigint, out o_rol text, out o_barista bigint,
                                   out o_nombre text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  o_rol := public.franq_rol(p_company);
  if o_rol is null then
    raise exception 'No tienes acceso a esta sucursal.' using errcode = '42501';
  end if;
  if o_rol = 'barista' then
    select b.id, b.nombre into o_barista, o_nombre from public.franq_baristas b
    where b.id = p_barista and b.company_id = p_company and b.activo;
    if o_barista is null then
      raise exception 'Elige tu nombre antes de registrar (el nombre ya no está activo).' using errcode = 'P0001';
    end if;
  else
    select p.nombre into o_nombre from public.perfiles p where p.user_id = auth.uid();
    o_barista := null;
  end if;
end $$;
revoke all on function public.franq_quien(integer, bigint) from public, anon, authenticated;

-- Checklist del día de operación para una sección (lo crea con la plantilla vigente si no existe).
create function public.franq_checklist_hoy(p_company integer, p_seccion text) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_seccion bigint; v_dia date := public.franq_dia_operacion(now());
begin
  select id into v_id from public.franq_checklists where company_id = p_company and dia = v_dia and seccion = p_seccion;
  if v_id is not null then return v_id; end if;
  select s.id into v_seccion from public.franq_plantilla_secciones s
  where s.plantilla_id = public.franq_plantilla_vigente(p_company) and s.clave = p_seccion;
  if v_seccion is null then
    raise exception 'No hay plantilla vigente para la sección %.', p_seccion;
  end if;
  insert into public.franq_checklists (company_id, dia, seccion, seccion_id)
  values (p_company, v_dia, p_seccion, v_seccion)
  on conflict (company_id, dia, seccion) do nothing;
  select id into v_id from public.franq_checklists where company_id = p_company and dia = v_dia and seccion = p_seccion;
  return v_id;
end $$;
revoke all on function public.franq_checklist_hoy(integer, text) from public, anon, authenticated;

-- 9. Responder un punto del checklist de HOY. Cambiar una respuesta = renglón nuevo con corrige_id.
--    Con la sección ya firmada (cualquier firma), solo un gerente, franquiciatario o admin corrige, con motivo.
create function public.franq_responder(p_company integer, p_seccion text, p_punto bigint, p_cumple boolean,
                                       p_observacion text, p_barista bigint, p_dispositivo text,
                                       p_motivo text default null) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q record; v_checklist bigint; v_previa public.franq_respuestas; v_firmada boolean; v_id bigint;
  v_obs text := nullif(btrim(coalesce(p_observacion, '')), '');
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into q from public.franq_quien(p_company, p_barista);
  if p_cumple is null then raise exception 'Marca Sí o No.'; end if;
  if not p_cumple and char_length(coalesce(v_obs, '')) < 3 then
    raise exception 'Todo «No» se explica en Observaciones.' using errcode = 'P0001';
  end if;
  v_checklist := public.franq_checklist_hoy(p_company, p_seccion);
  if not exists (select 1 from public.franq_plantilla_puntos pt join public.franq_checklists c on c.seccion_id = pt.seccion_id
                 where c.id = v_checklist and pt.id = p_punto) then
    raise exception 'El punto no pertenece a esta sección.';
  end if;
  select * into v_previa from public.franq_respuestas
  where checklist_id = v_checklist and punto_id = p_punto order by id desc limit 1;
  if v_previa.id is not null and v_previa.cumple = p_cumple
     and v_previa.observacion is not distinct from v_obs then
    return v_previa.id; -- sin cambios: no duplica el renglón
  end if;
  v_firmada := exists (select 1 from public.franq_firmas where checklist_id = v_checklist);
  if v_firmada then
    if q.o_rol = 'barista' then
      raise exception 'La sección ya está firmada; pide al gerente que registre la corrección.' using errcode = 'P0001';
    end if;
    if char_length(coalesce(v_motivo, '')) < 3 then
      raise exception 'Escribe el motivo de la corrección.' using errcode = 'P0001';
    end if;
  end if;
  insert into public.franq_respuestas (checklist_id, company_id, punto_id, cumple, observacion, barista_id, nombre,
                                       registrado_por, sesion, dispositivo, corrige_id, motivo)
  values (v_checklist, p_company, p_punto, p_cumple, v_obs, q.o_barista, q.o_nombre, auth.uid(),
          auth.jwt()->>'session_id', left(p_dispositivo, 300), v_previa.id, v_motivo)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.franq_responder(integer, text, bigint, boolean, text, bigint, text, text)
  from public, anon;
grant execute on function public.franq_responder(integer, text, bigint, boolean, text, bigint, text, text)
  to authenticated;

-- Corrección de un día anterior (o de hoy) por un gerente, franquiciatario o admin: siempre con motivo.
create function public.franq_corregir(p_respuesta bigint, p_cumple boolean, p_observacion text, p_motivo text,
                                      p_dispositivo text) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_previa public.franq_respuestas; v_vigente bigint; v_id bigint; q record;
  v_obs text := nullif(btrim(coalesce(p_observacion, '')), '');
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into v_previa from public.franq_respuestas where id = p_respuesta;
  if v_previa.id is null or not public.franq_es_gestor(v_previa.company_id) then
    raise exception 'Solo el gerente o el franquiciatario corrigen registros.' using errcode = '42501';
  end if;
  select id into v_vigente from public.franq_respuestas
  where checklist_id = v_previa.checklist_id and punto_id = v_previa.punto_id order by id desc limit 1;
  if v_vigente <> v_previa.id then
    raise exception 'Ese registro ya tiene una corrección; corrige el más reciente.' using errcode = 'P0001';
  end if;
  if p_cumple is null or (not p_cumple and char_length(coalesce(v_obs, '')) < 3) then
    raise exception 'Todo «No» se explica en Observaciones.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_motivo, '')) < 3 then
    raise exception 'Escribe el motivo de la corrección.' using errcode = 'P0001';
  end if;
  select * into q from public.franq_quien(v_previa.company_id, null);
  insert into public.franq_respuestas (checklist_id, company_id, punto_id, cumple, observacion, barista_id, nombre,
                                       registrado_por, sesion, dispositivo, corrige_id, motivo)
  values (v_previa.checklist_id, v_previa.company_id, v_previa.punto_id, p_cumple, v_obs, null, q.o_nombre,
          auth.uid(), auth.jwt()->>'session_id', left(p_dispositivo, 300), v_previa.id, v_motivo)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.franq_corregir(bigint, boolean, text, text, text) from public, anon;
grant execute on function public.franq_corregir(bigint, boolean, text, text, text) to authenticated;

-- 10. Firmar una sección de HOY: con todos sus puntos respondidos; «recibe» va después de «entrega» y por otra persona.
create function public.franq_firmar(p_company integer, p_seccion text, p_tipo text, p_barista bigint,
                                    p_dispositivo text) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare q record; v_checklist bigint; v_firmas text[]; v_faltan integer; v_entrega public.franq_firmas; v_id bigint;
begin
  select * into q from public.franq_quien(p_company, p_barista);
  v_checklist := public.franq_checklist_hoy(p_company, p_seccion);
  select s.firmas into v_firmas from public.franq_checklists c join public.franq_plantilla_secciones s on s.id = c.seccion_id
  where c.id = v_checklist;
  if not (p_tipo = any (v_firmas)) then
    raise exception 'Esta sección no lleva la firma «%».', p_tipo;
  end if;
  select count(*) into v_faltan from public.franq_plantilla_puntos pt
  join public.franq_checklists c on c.seccion_id = pt.seccion_id
  where c.id = v_checklist
    and not exists (select 1 from public.franq_respuestas r where r.checklist_id = c.id and r.punto_id = pt.id);
  if v_faltan > 0 then
    raise exception 'Faltan % puntos por responder antes de firmar.', v_faltan using errcode = 'P0001';
  end if;
  if p_tipo = 'recibe' then
    select * into v_entrega from public.franq_firmas where checklist_id = v_checklist and tipo = 'entrega';
    if v_entrega.id is null then
      raise exception 'Primero firma quien entrega el turno.' using errcode = 'P0001';
    end if;
    if lower(v_entrega.nombre) = lower(q.o_nombre) then
      raise exception 'Recibe el turno una persona distinta de quien lo entrega.' using errcode = 'P0001';
    end if;
  end if;
  if exists (select 1 from public.franq_firmas where checklist_id = v_checklist and tipo = p_tipo) then
    raise exception 'Esta firma ya está registrada.' using errcode = 'P0001';
  end if;
  insert into public.franq_firmas (checklist_id, company_id, tipo, barista_id, nombre, registrado_por, sesion,
                                   dispositivo)
  values (v_checklist, p_company, p_tipo, q.o_barista, q.o_nombre, auth.uid(), auth.jwt()->>'session_id',
          left(p_dispositivo, 300))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.franq_firmar(integer, text, text, bigint, text) from public, anon;
grant execute on function public.franq_firmar(integer, text, text, bigint, text) to authenticated;

-- 11. Incidencias y pendientes del día de operación.
create function public.franq_incidencia(p_company integer, p_texto text, p_barista bigint, p_dispositivo text)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare q record; v_id bigint; v_texto text := btrim(coalesce(p_texto, ''));
begin
  select * into q from public.franq_quien(p_company, p_barista);
  if char_length(v_texto) < 3 then raise exception 'Describe la incidencia.' using errcode = 'P0001'; end if;
  insert into public.franq_incidencias (company_id, dia, texto, barista_id, nombre, registrado_por, sesion, dispositivo)
  values (p_company, public.franq_dia_operacion(now()), v_texto, q.o_barista, q.o_nombre, auth.uid(),
          auth.jwt()->>'session_id', left(p_dispositivo, 300))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.franq_incidencia(integer, text, bigint, text) from public, anon;
grant execute on function public.franq_incidencia(integer, text, bigint, text) to authenticated;

-- 12. Alta, edición y baja (desactivación) de nombres: solo gerente, franquiciatario o admin de esa sucursal.
create function public.franq_barista_guardar(p_company integer, p_id bigint, p_nombre text, p_activo boolean)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_nombre text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
begin
  if not public.franq_es_gestor(p_company) then
    raise exception 'Solo el gerente o el franquiciatario administran los nombres.' using errcode = '42501';
  end if;
  if char_length(v_nombre) not between 2 and 60 then
    raise exception 'El nombre debe tener entre 2 y 60 caracteres.' using errcode = 'P0001';
  end if;
  begin
    if p_id is null then
      insert into public.franq_baristas (company_id, nombre, activo, creado_por)
      values (p_company, v_nombre, coalesce(p_activo, true), auth.uid())
      returning id into v_id;
    else
      update public.franq_baristas
      set nombre = v_nombre, activo = coalesce(p_activo, activo), actualizado_por = auth.uid(), actualizado_en = now()
      where id = p_id and company_id = p_company
      returning id into v_id;
      if v_id is null then raise exception 'No existe ese nombre en esta sucursal.' using errcode = 'P0001'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Ya hay un barista activo con ese nombre.' using errcode = 'P0001';
  end;
  return v_id;
end $$;
revoke all on function public.franq_barista_guardar(integer, bigint, text, boolean) from public, anon;
grant execute on function public.franq_barista_guardar(integer, bigint, text, boolean) to authenticated;

-- 13. Avisos para gerente y franquiciatario: «No» vigentes (la última respuesta de cada punto) e incidencias.
create function public.franq_avisos(p_company integer, p_desde date, p_hasta date)
returns table (tipo text, dia date, seccion text, punto text, estandar text, observacion text, nombre text,
               registrado_en timestamptz, respuesta_id bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.franq_es_gestor(p_company) then
    raise exception 'Solo el gerente o el franquiciatario ven los avisos.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 62 then
    raise exception 'Periodo inválido (máximo 62 días).' using errcode = 'P0001';
  end if;
  return query
    select 'no'::text, c.dia, c.seccion, pt.actividad, pt.estandar, r.observacion, r.nombre, r.registrado_en, r.id
    from public.franq_checklists c
    join lateral (select distinct on (x.punto_id) x.* from public.franq_respuestas x
                  where x.checklist_id = c.id order by x.punto_id, x.id desc) r on true
    join public.franq_plantilla_puntos pt on pt.id = r.punto_id
    where c.company_id = p_company and c.dia between p_desde and p_hasta and not r.cumple
    union all
    select 'incidencia', i.dia, null, null, null, i.texto, i.nombre, i.registrado_en, null
    from public.franq_incidencias i
    where i.company_id = p_company and i.dia between p_desde and p_hasta
    order by 2 desc, 8 desc;
end $$;
revoke all on function public.franq_avisos(integer, date, date) from public, anon;
grant execute on function public.franq_avisos(integer, date, date) to authenticated;

-- 14. Plantilla general v1: Check List de Turno Operativo (Excel de Operaciones, 2026-11-19).
do $$
declare v_plantilla bigint; v_seccion bigint;
begin
  insert into public.franq_plantillas (clave, company_id, version) values ('turno', null, 1) returning id into v_plantilla;

  insert into public.franq_plantilla_secciones (plantilla_id, clave, nombre, orden, firmas)
  values (v_plantilla, 'apertura', 'Apertura', 1, array['responsable']) returning id into v_seccion;
  insert into public.franq_plantilla_puntos (seccion_id, orden, actividad, estandar) values
    (v_seccion, 1, 'Registro de entrada', 'Todo el personal checó entrada a tiempo'),
    (v_seccion, 2, 'Recorrido de seguridad', 'Accesos, alarma, gas, luz y agua sin incidencias'),
    (v_seccion, 3, 'Sistemas y delivery', 'POS, tablets y apps operando; tienda abierta en plataformas'),
    (v_seccion, 4, 'Arqueo de caja', 'Fondo completo; cambio solicitado si aplica'),
    (v_seccion, 5, 'Montado de barra', 'Insumos a la mano y espresso calibrado'),
    (v_seccion, 6, 'Conteo de inventario', 'Registrado en libro de control de turno'),
    (v_seccion, 7, 'Inocuidad alimentaria', 'Retenes a concentración, temperaturas, etiquetado y PEPS'),
    (v_seccion, 8, 'Baños', 'Limpios, surtidos (papel, jabón, toallas) y bitácora de baño llenada'),
    (v_seccion, 9, 'Comedor', 'Mesas, sillas, cristales y piso limpios, sin huellas ni marcas'),
    (v_seccion, 10, 'Vitrina', 'Limpia, mejor pan al frente, preparados antojables'),
    (v_seccion, 11, 'Imagen de personal', 'Todo el equipo con uniforme completo'),
    (v_seccion, 12, 'Junta de arranque', 'Posiciones, metas y pendientes del día comunicados');

  insert into public.franq_plantilla_secciones (plantilla_id, clave, nombre, orden, firmas)
  values (v_plantilla, 'cambio', 'Cambio de turno', 2, array['entrega', 'recibe']) returning id into v_seccion;
  insert into public.franq_plantilla_puntos (seccion_id, orden, actividad, estandar) values
    (v_seccion, 1, 'Conteo de cambio de turno', 'Registrado en libro de control de turno'),
    (v_seccion, 2, 'Arqueo y corte parcial', 'Caja cuadrada, diferencias reportadas'),
    (v_seccion, 3, 'Delivery', 'Conectividad y cancelaciones revisadas'),
    (v_seccion, 4, 'Re-stock de barra', 'Productos, previas e insumos completos'),
    (v_seccion, 5, 'Inocuidad alimentaria', 'Retenes a concentración, temperaturas, etiquetado y PEPS'),
    (v_seccion, 6, 'Comedor y baños', 'Barra de servicio surtida, baño limpio y surtido, piso y mesas'),
    (v_seccion, 7, 'Vitrina', 'Limpia y surtida con el mejor pan al frente'),
    (v_seccion, 8, 'Imagen de personal', 'Todo el equipo con uniforme completo'),
    (v_seccion, 9, 'Mermas del turno', 'Capturadas en formato de mermas'),
    (v_seccion, 10, 'Entrega de turno', 'Pendientes e incidencias comunicadas al turno entrante');

  insert into public.franq_plantilla_secciones (plantilla_id, clave, nombre, orden, firmas)
  values (v_plantilla, 'cierre', 'Cierre', 3, array['responsable']) returning id into v_seccion;
  insert into public.franq_plantilla_puntos (seccion_id, orden, actividad, estandar) values
    (v_seccion, 1, 'Conteo de cierre', 'Registrado en libro de control de turno'),
    (v_seccion, 2, 'Arqueo y corte de turno', 'Caja cuadrada y efectivo resguardado'),
    (v_seccion, 3, 'Plataformas y tablets', 'Delivery cerrado y tablets apagadas o cargando'),
    (v_seccion, 4, 'Mermas del día', 'Capturadas en formato de mermas'),
    (v_seccion, 5, 'Barra y bodega', 'Limpias; insumos acomodados por PEPS'),
    (v_seccion, 6, 'Limpieza de equipos', 'Según calendario de limpieza profunda'),
    (v_seccion, 7, 'Temperaturas', 'Tomadas y registradas en bitácora'),
    (v_seccion, 8, 'Baño y comedor', 'Limpieza profunda realizada'),
    (v_seccion, 9, 'Listo para apertura', 'Basura retirada, áreas ordenadas y surtidas'),
    (v_seccion, 10, 'Registro de salida', 'Todo el personal checó salida'),
    (v_seccion, 11, 'Cierre de la unidad', 'Equipos apagados, gas, luz, puertas y alarma');
end $$;
