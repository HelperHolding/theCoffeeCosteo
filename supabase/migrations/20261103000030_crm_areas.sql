-- CRM Unificado (doc 40 §5): áreas, membresías y funciones de permiso por área.
-- perfil_modulos sigue siendo la puerta del módulo (lectura / edicion / desarrollador); la membresía dice
-- en qué área opera cada quien y con qué rol (head / miembro / lectura) y funciones (p. ej. Aprobación de locales).

create table public.crm_areas (
  clave text primary key check (clave in ('ventas', 'legal', 'proyectos', 'finanzas')),
  nombre text not null check (btrim(nombre) <> ''),
  -- Color de identidad validado con dataviz (todos los pares, superficie blanca).
  color text not null check (color ~ '^#[0-9a-f]{6}$'),
  activa boolean not null default true,
  orden smallint not null
);
insert into public.crm_areas (clave, nombre, color, activa, orden) values
  ('ventas', 'Ventas', '#2a78d6', true, 1),
  ('legal', 'Legal', '#c2457f', true, 2),
  ('proyectos', 'Proyectos', '#d9741a', true, 3),
  -- Finanzas nace inactiva (P1): mientras tanto Ventas registra sus validaciones con evidencia.
  ('finanzas', 'Finanzas', '#6b6560', false, 4);

create table public.crm_membresias (
  user_id uuid not null references public.perfiles(user_id) on delete cascade,
  area text not null references public.crm_areas(clave),
  rol text not null check (rol in ('head', 'miembro', 'lectura')),
  funciones text[] not null default '{}' check (funciones <@ array['aprobacion_locales', 'valida_finanzas']),
  creado_en timestamptz not null default now(),
  creado_por uuid,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid,
  version integer not null default 1,
  primary key (user_id, area)
);

-- Funciones de permiso. Todas fallan cerrado: sin acceso al CRM (crm_nivel nulo, incluido OAuth) no hay área.
create function public.crm_es_desarrollador() returns boolean
language sql stable set search_path = public, pg_temp as $$
  select coalesce(public.crm_nivel() = 'desarrollador', false)
$$;

create function public.crm_es_head() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.crm_nivel() is not null and exists (
    select 1 from public.crm_membresias m where m.user_id = auth.uid() and m.rol = 'head')
$$;

-- Puede cumplir y mover en un área: necesita nivel de edición en el módulo y ser head o miembro del área
-- (o desarrollador). Un área inactiva (Finanzas) la opera quien opera el área de respaldo (Ventas, P1).
create function public.crm_puede_operar(p_area text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.crm_puede_editar(), false) and (
    public.crm_es_desarrollador()
    or exists (
      select 1 from public.crm_membresias m
      where m.user_id = auth.uid() and m.rol in ('head', 'miembro')
        and m.area = case when (select activa from public.crm_areas where clave = p_area) then p_area else 'ventas' end))
$$;

create function public.crm_tiene_funcion(p_funcion text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.crm_puede_editar(), false) and (
    public.crm_es_desarrollador()
    or exists (
      select 1 from public.crm_membresias m
      where m.user_id = auth.uid() and m.rol in ('head', 'miembro') and p_funcion = any (m.funciones)))
$$;

-- Áreas del usuario (para pantallas y para la bitácora).
create function public.crm_mis_areas() returns setof public.crm_membresias
language sql stable security definer set search_path = public, pg_temp as $$
  select m.* from public.crm_membresias m where m.user_id = auth.uid() and public.crm_nivel() is not null
$$;

revoke all on function public.crm_es_desarrollador(), public.crm_es_head(), public.crm_puede_operar(text),
  public.crm_tiene_funcion(text), public.crm_mis_areas() from public, anon;
grant execute on function public.crm_es_desarrollador(), public.crm_es_head(), public.crm_puede_operar(text),
  public.crm_tiene_funcion(text), public.crm_mis_areas() to authenticated;

-- Seguridad: catálogo de áreas de solo lectura; membresías las administra un desarrollador (con OK de Carlo).
alter table public.crm_areas enable row level security;
alter table public.crm_membresias enable row level security;
revoke all on public.crm_areas, public.crm_membresias from anon, authenticated;
grant select on public.crm_areas to authenticated;
grant select, insert, update, delete on public.crm_membresias to authenticated;
create policy lectura on public.crm_areas for select to authenticated using ((select public.crm_puede_leer()));
create policy lectura on public.crm_membresias for select to authenticated using ((select public.crm_puede_leer()));
create policy alta on public.crm_membresias for insert to authenticated
  with check ((select public.crm_es_desarrollador()));
create policy cambio on public.crm_membresias for update to authenticated
  using ((select public.crm_es_desarrollador())) with check ((select public.crm_es_desarrollador()));
create policy baja on public.crm_membresias for delete to authenticated using ((select public.crm_es_desarrollador()));
do $$
declare t text;
begin
  foreach t in array array['crm_areas', 'crm_membresias'] loop
    execute format('create policy crm_sin_oauth on public.%I as restrictive for all to authenticated '
      'using (((select auth.jwt())->>''client_id'') is null) with check (((select auth.jwt())->>''client_id'') is null)', t);
  end loop;
end $$;
create trigger crm_membresias_sellar before insert or update on public.crm_membresias
  for each row execute function public.crm_sellar();
create index crm_membresias_area on public.crm_membresias (area);
