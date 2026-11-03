-- CRM Unificado (doc 40 §7): vencimientos (COF a 2 meses, 5 días hábiles, límite de 120 días) y avisos.

create table public.crm_festivos (
  fecha date primary key,
  nombre text not null check (btrim(nombre) <> ''),
  creado_en timestamptz not null default now(),
  creado_por uuid
);
-- Descanso obligatorio (art. 74 LFT), 2026–2027. Editable desde Administración.
insert into public.crm_festivos (fecha, nombre) values
  ('2026-01-01', 'Año Nuevo'), ('2026-02-02', 'Día de la Constitución'), ('2026-03-16', 'Natalicio de Benito Juárez'),
  ('2026-05-01', 'Día del Trabajo'), ('2026-09-16', 'Día de la Independencia'), ('2026-11-16', 'Día de la Revolución'),
  ('2026-12-25', 'Navidad'),
  ('2027-01-01', 'Año Nuevo'), ('2027-02-01', 'Día de la Constitución'), ('2027-03-15', 'Natalicio de Benito Juárez'),
  ('2027-05-01', 'Día del Trabajo'), ('2027-09-16', 'Día de la Independencia'), ('2027-11-15', 'Día de la Revolución'),
  ('2027-12-25', 'Navidad');

-- Resta n días hábiles (lunes a viernes, sin festivos) a una fecha.
create function public.crm_restar_dias_habiles(p_fecha date, p_dias integer) returns date
language plpgsql stable set search_path = public, pg_temp as $$
declare
  f date := p_fecha;
  n integer := 0;
begin
  if p_fecha is null then return null; end if;
  while n < p_dias loop
    f := f - 1;
    if extract(isodow from f) < 6 and not exists (select 1 from public.crm_festivos where fecha = f) then
      n := n + 1;
    end if;
  end loop;
  return f;
end $$;

-- Hoy en la Ciudad de México.
create function public.crm_hoy() returns date
language sql stable set search_path = public, pg_temp as $$
  select (now() at time zone 'America/Mexico_City')::date
$$;

-- Vencimientos de las sucursales en proceso. `fecha` = cuándo hay que actuar; `aviso_desde` = desde cuándo se avisa.
create view public.crm_v_vencimientos with (security_invoker = true) as
with s as (
  select t.id as tienda_id, t.franquiciatario_id, t.nombre, t.fecha_estimada_apertura, t.fecha_confirmada_apertura,
    t.fecha_limite_apertura, e.clave as etapa_clave, e.tipo as etapa_tipo,
    (select q.estado from public.crm_requisitos_de('sucursal', t.id) q where q.clave = 'cof_firmada') as cof_estado,
    (select cu.fecha from public.crm_cumplimientos cu join public.crm_requisitos r on r.id = cu.requisito_id
      where cu.card_id = t.id and r.clave = 'cof_firmada' and cu.estado = 'validado') as cof_fecha
  from public.crm_tiendas t join public.crm_etapas e on e.id = t.etapa_id
  where t.embudo = 'general' and t.archivado_en is null and e.tipo in ('abierta', 'lateral')
)
select tienda_id, franquiciatario_id, nombre, 'cof'::text as tipo, 'legal'::text as area,
  (fecha_estimada_apertura - interval '2 months')::date as fecha,
  (fecha_estimada_apertura - interval '2 months')::date as aviso_desde,
  format('COF de %s: apertura estimada %s; debe firmarse a más tardar el %s', nombre,
    to_char(fecha_estimada_apertura, 'DD/MM/YYYY'), to_char(fecha_estimada_apertura - interval '2 months', 'DD/MM/YYYY')) as mensaje
from s where fecha_estimada_apertura is not null and coalesce(cof_estado, 'pendiente') not in ('validado', 'no_aplica')
union all
select tienda_id, franquiciatario_id, nombre, 'apertura_5_habiles', 'legal',
  public.crm_restar_dias_habiles(fecha_confirmada_apertura, 5),
  public.crm_restar_dias_habiles(fecha_confirmada_apertura, 5),
  format('Apertura confirmada de %s el %s: Legal debe tenerla al menos 5 días hábiles antes (%s)', nombre,
    to_char(fecha_confirmada_apertura, 'DD/MM/YYYY'),
    to_char(public.crm_restar_dias_habiles(fecha_confirmada_apertura, 5), 'DD/MM/YYYY'))
from s where fecha_confirmada_apertura is not null and etapa_clave <> 'operando'
union all
select tienda_id, franquiciatario_id, nombre, 'limite_120', 'proyectos', fecha_limite_apertura, fecha_limite_apertura - 14,
  format('Fecha límite de apertura de %s: %s', nombre, to_char(fecha_limite_apertura, 'DD/MM/YYYY'))
from s where fecha_limite_apertura is not null and etapa_clave <> 'operando'
union all
-- COF firmada tarde: la apertura mínima legal es la entrega + 2 meses (la UI la sugiere, no la cambia).
select tienda_id, franquiciatario_id, nombre, 'cof_tardia', 'proyectos', (cof_fecha + interval '2 months')::date, cof_fecha,
  format('COF de %s firmada el %s: la apertura no puede ser antes del %s', nombre, to_char(cof_fecha, 'DD/MM/YYYY'),
    to_char(cof_fecha + interval '2 months', 'DD/MM/YYYY'))
from s where cof_fecha is not null and fecha_estimada_apertura is not null
  and fecha_estimada_apertura < (cof_fecha + interval '2 months')::date;

create table public.crm_avisos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('cof', 'apertura_5_habiles', 'limite_120', 'cof_tardia')),
  tienda_id uuid not null references public.crm_tiendas(id) on delete cascade,
  franquiciatario_id uuid references public.crm_franquiciatarios(id) on delete cascade,
  area text not null references public.crm_areas(clave),
  fecha_objetivo date not null,
  mensaje text not null,
  generado_en timestamptz not null default now(),
  atendido_por uuid,
  atendido_en timestamptz,
  unique (tipo, tienda_id, fecha_objetivo)
);
create index crm_avisos_pendientes on public.crm_avisos (area, fecha_objetivo) where atendido_en is null;

-- Idempotente: genera los avisos que ya entraron en su ventana. Lo corre pg_cron (07:00 MX) y el Panel.
create function public.crm_generar_avisos(p_hoy date default null) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n integer;
begin
  if auth.uid() is not null and not coalesce(public.crm_puede_leer(), false) then
    raise exception 'Sin acceso al CRM' using errcode = '42501';
  end if;
  perform set_config('app.origen', 'sistema', true);
  insert into public.crm_avisos (tipo, tienda_id, franquiciatario_id, area, fecha_objetivo, mensaje)
  select v.tipo, v.tienda_id, v.franquiciatario_id, v.area, v.fecha, v.mensaje
  from public.crm_v_vencimientos v
  where v.aviso_desde <= coalesce(p_hoy, public.crm_hoy())
  on conflict (tipo, tienda_id, fecha_objetivo) do nothing;
  get diagnostics n = row_count;
  perform set_config('app.origen', '', true);
  return n;
end $$;

create function public.crm_atender_aviso(p_aviso uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.crm_avisos;
begin
  select * into a from public.crm_avisos where id = p_aviso for update;
  if not found then raise exception 'El aviso no existe' using errcode = 'P0002'; end if;
  if not (public.crm_es_head() or public.crm_puede_operar(a.area)) then
    raise exception 'Este aviso lo atiende %', public.crm_nombre_area(a.area) using errcode = '42501';
  end if;
  update public.crm_avisos set atendido_por = auth.uid(), atendido_en = now() where id = p_aviso and atendido_en is null;
end $$;

-- Seguridad.
alter table public.crm_festivos enable row level security;
alter table public.crm_avisos enable row level security;
revoke all on public.crm_festivos, public.crm_avisos from anon, authenticated;
grant select, insert, delete on public.crm_festivos to authenticated;
grant select on public.crm_avisos to authenticated;
grant select on public.crm_v_vencimientos to authenticated;
create policy lectura on public.crm_festivos for select to authenticated using ((select public.crm_puede_leer()));
create policy alta on public.crm_festivos for insert to authenticated
  with check ((select public.crm_es_head() or public.crm_es_desarrollador()));
create policy baja on public.crm_festivos for delete to authenticated
  using ((select public.crm_es_head() or public.crm_es_desarrollador()));
create policy lectura on public.crm_avisos for select to authenticated using ((select public.crm_puede_leer()));
do $$
declare t text;
begin
  foreach t in array array['crm_festivos', 'crm_avisos'] loop
    execute format('create policy crm_sin_oauth on public.%I as restrictive for all to authenticated '
      'using (((select auth.jwt())->>''client_id'') is null) with check (((select auth.jwt())->>''client_id'') is null)', t);
    execute format('create trigger %I after insert or update or delete on public.%I '
      'for each row execute function public.crm_registrar_historial()', t || '_historial', t);
  end loop;
end $$;
revoke all on function public.crm_restar_dias_habiles(date, integer), public.crm_hoy(),
  public.crm_generar_avisos(date), public.crm_atender_aviso(uuid) from public, anon;
grant execute on function public.crm_restar_dias_habiles(date, integer), public.crm_hoy(),
  public.crm_generar_avisos(date), public.crm_atender_aviso(uuid) to authenticated;
