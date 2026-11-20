-- Franquiciatarios · F2 Conteos de insumos críticos (docs/franquiciatarios/03-PLAN-RUTINA-Y-CONEXIONES.md).
-- - Lista por sucursal de insumos a contar (franq_insumos). Se SUGIERE desde el consumo teórico (receta × ventas,
--   sucursales_consumo_mes): los que acumulan el 80 % del valor consumido del último mes calculado, entre 10 y 20.
--   El gerente la afina después (alta manual, nombre, unidad, orden, baja). Decisión de Carlos, 2026-11-20.
-- - Conteos de apertura y de medio turno (franq_conteos, solo inserción; un recuento corrige al anterior).
-- - La cuenta de baristas captura conteos pero NO ve inventario: no lee franq_conteos (solo gestores); para saber si
--   ya se contó usa franq_conteo_estado (quién y a qué hora, sin cantidades). El valor nunca sale de la base.

-- 1. Insumos a contar por sucursal.
create table public.franq_insumos (
  id bigint generated always as identity primary key,
  company_id integer not null check (company_id > 0),
  insumo_id uuid references public.insumos (id), -- de Costeo cuando viene sugerido; null en un alta manual
  nombre text not null check (char_length(btrim(nombre)) between 2 and 120),
  unidad text not null check (char_length(btrim(unidad)) between 1 and 60),
  orden integer not null default 0,
  activo boolean not null default true,
  origen text not null check (origen in ('sugerido', 'manual')),
  creado_por uuid not null references auth.users (id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users (id),
  actualizado_en timestamptz
);
create unique index franq_insumos_costeo on public.franq_insumos (company_id, insumo_id) where insumo_id is not null;
create unique index franq_insumos_nombre on public.franq_insumos (company_id, lower(nombre)) where activo;

-- No se borran (los conteos los referencian); solo cambian nombre, unidad, orden y si está activo.
create function public.franq_insumos_guardia() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los insumos no se borran; desactívalos.';
  end if;
  if (new.id, new.company_id, new.insumo_id, new.origen, new.creado_por, new.creado_en)
     is distinct from (old.id, old.company_id, old.insumo_id, old.origen, old.creado_por, old.creado_en) then
    raise exception 'Solo cambian el nombre, la unidad, el orden y si está activo.';
  end if;
  return new;
end $$;
create trigger franq_insumos_guardia before update or delete on public.franq_insumos
  for each row execute function public.franq_insumos_guardia();

-- 2. Conteos. Uno por insumo, día y momento; un recuento es un renglón nuevo que corrige al vigente.
create table public.franq_conteos (
  id bigint generated always as identity primary key,
  company_id integer not null check (company_id > 0),
  dia date not null,
  momento text not null check (momento in ('apertura', 'medio')),
  insumo_id bigint not null references public.franq_insumos (id),
  cantidad numeric not null check (cantidad >= 0 and cantidad <= 100000),
  barista_id bigint references public.franq_baristas (id),
  nombre text not null,
  registrado_por uuid not null references auth.users (id),
  registrado_en timestamptz not null default now(),
  sesion text,
  dispositivo text check (dispositivo is null or char_length(dispositivo) <= 300),
  corrige_id bigint references public.franq_conteos (id)
);
create index franq_conteos_dia on public.franq_conteos (company_id, dia, momento);
create index franq_conteos_insumo on public.franq_conteos (insumo_id);
create index franq_conteos_barista on public.franq_conteos (barista_id);
create unique index franq_conteos_corrige on public.franq_conteos (corrige_id) where corrige_id is not null;
create trigger franq_conteos_solo_insercion before update or delete on public.franq_conteos
  for each row execute function public.franq_solo_insercion();

-- 3. RLS. La lista (sin valores) la lee toda la sucursal para poder contar; los conteos, solo la gerencia.
alter table public.franq_insumos enable row level security;
alter table public.franq_conteos enable row level security;
revoke all on public.franq_insumos, public.franq_conteos from anon, authenticated;
grant select on public.franq_insumos, public.franq_conteos to authenticated;
create policy lectura on public.franq_insumos for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias())::integer[]));
create policy lectura on public.franq_conteos for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias_gestor())::integer[]));

-- 4. Sugerido desde el consumo teórico. Solo gestores; solo si la sucursal no tiene insumos activos.
create function public.franq_sugerir_insumos(p_company integer) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_mes date; v_n integer;
begin
  if not public.franq_es_gestor(p_company) then
    raise exception 'Solo el gerente o el franquiciatario arman la lista de insumos.' using errcode = '42501';
  end if;
  if exists (select 1 from public.franq_insumos where company_id = p_company and activo) then
    raise exception 'La sucursal ya tiene su lista de insumos; ajústala desde Inventario.' using errcode = 'P0001';
  end if;
  select max(mes) into v_mes from public.sucursales_consumo_mes where company_id = p_company;
  if v_mes is null then
    raise exception 'Aún no hay consumo calculado para esta sucursal; agrega los insumos a mano.' using errcode = 'P0001';
  end if;
  with consumo as (
    select c.insumo_id, sum(c.cantidad) cantidad from public.sucursales_consumo_mes c
    where c.company_id = p_company and c.mes = v_mes group by c.insumo_id
  ), valuado as (
    select i.id, i.nombre, i.unidad::text unidad, i.presentacion, k.cantidad * coalesce(i.costo_unitario, 0) valor
    from consumo k join public.insumos i on i.id = k.insumo_id
    where i.activo and k.cantidad > 0
  ), rango as (
    select v.*, row_number() over (order by v.valor desc, v.nombre) n,
           sum(v.valor) over (order by v.valor desc, v.nombre) / nullif(sum(v.valor) over (), 0) acumulado
    from valuado v
  ), elegidos as (
    -- Pareto: hasta cubrir el 80 % del valor (incluye el que lo cruza), mínimo 10 y máximo 20.
    select * from rango r
    where r.n <= 20 and (r.n <= 10 or coalesce(r.acumulado - r.valor / nullif((select sum(valor) from valuado), 0), 0) < 0.8)
  )
  insert into public.franq_insumos (company_id, insumo_id, nombre, unidad, orden, origen, creado_por)
  select p_company, e.id, initcap(lower(e.nombre)),
         case when coalesce(e.presentacion, 1) <= 1 then e.unidad
              else 'paquete de ' || trim(to_char(e.presentacion, 'FM999999990.##')) || ' ' || e.unidad end,
         e.n, 'sugerido', auth.uid()
  from elegidos e
  on conflict do nothing;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.franq_sugerir_insumos(integer) from public, anon;
grant execute on function public.franq_sugerir_insumos(integer) to authenticated;

-- 5. Alta o edición manual de un insumo de la lista. Solo gestores.
create function public.franq_insumo_guardar(p_company integer, p_id bigint, p_nombre text, p_unidad text,
                                            p_orden integer, p_activo boolean) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint;
  v_nombre text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_unidad text := regexp_replace(btrim(coalesce(p_unidad, '')), '\s+', ' ', 'g');
begin
  if not public.franq_es_gestor(p_company) then
    raise exception 'Solo el gerente o el franquiciatario ajustan la lista de insumos.' using errcode = '42501';
  end if;
  if char_length(v_nombre) not between 2 and 120 or char_length(v_unidad) not between 1 and 60 then
    raise exception 'Escribe el nombre y la unidad en que se cuenta.' using errcode = 'P0001';
  end if;
  begin
    if p_id is null then
      insert into public.franq_insumos (company_id, nombre, unidad, orden, activo, origen, creado_por)
      values (p_company, v_nombre, v_unidad,
              coalesce(p_orden, (select coalesce(max(orden), 0) + 1 from public.franq_insumos where company_id = p_company)),
              coalesce(p_activo, true), 'manual', auth.uid())
      returning id into v_id;
    else
      update public.franq_insumos
      set nombre = v_nombre, unidad = v_unidad, orden = coalesce(p_orden, orden), activo = coalesce(p_activo, activo),
          actualizado_por = auth.uid(), actualizado_en = now()
      where id = p_id and company_id = p_company
      returning id into v_id;
      if v_id is null then raise exception 'Ese insumo no es de esta sucursal.' using errcode = 'P0001'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Ya hay un insumo activo con ese nombre.' using errcode = 'P0001';
  end;
  return v_id;
end $$;
revoke all on function public.franq_insumo_guardar(integer, bigint, text, text, integer, boolean) from public, anon;
grant execute on function public.franq_insumo_guardar(integer, bigint, text, text, integer, boolean) to authenticated;

-- 6. Capturar el conteo de un momento de HOY: todos los insumos activos de la lista, con cantidad. Cualquier rol de la
--    sucursal (la cuenta de baristas con su nombre declarado). Un recuento del mismo día corrige al anterior.
create function public.franq_contar(p_company integer, p_momento text, p_conteos jsonb, p_barista bigint,
                                    p_dispositivo text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare q record; v_dia date := public.franq_dia_operacion(now()); e jsonb; v_insumo bigint; v_cant numeric;
  v_previo bigint; v_n integer := 0; v_faltan integer;
begin
  select * into q from public.franq_quien(p_company, p_barista);
  if p_momento not in ('apertura', 'medio') then raise exception 'Momento inválido.' using errcode = 'P0001'; end if;
  if jsonb_typeof(coalesce(p_conteos, 'null'::jsonb)) <> 'array' or jsonb_array_length(p_conteos) > 300 then
    raise exception 'Conteo inválido.' using errcode = 'P0001';
  end if;
  for e in select * from jsonb_array_elements(p_conteos) loop
    if coalesce(jsonb_typeof(e->'insumo') <> 'number' or jsonb_typeof(e->'cantidad') <> 'number', true) then
      raise exception 'Cada renglón lleva insumo y cantidad.' using errcode = 'P0001';
    end if;
    v_insumo := (e->>'insumo')::bigint;
    v_cant := (e->>'cantidad')::numeric;
    if v_cant < 0 or v_cant > 100000 then
      raise exception 'Las cantidades van de 0 en adelante.' using errcode = 'P0001';
    end if;
    if not exists (select 1 from public.franq_insumos where id = v_insumo and company_id = p_company and activo) then
      raise exception 'Un insumo del conteo no está en la lista de esta sucursal.' using errcode = 'P0001';
    end if;
    select c.id into v_previo from public.franq_conteos c
    where c.company_id = p_company and c.dia = v_dia and c.momento = p_momento and c.insumo_id = v_insumo
      and not exists (select 1 from public.franq_conteos x where x.corrige_id = c.id)
    order by c.id desc limit 1;
    insert into public.franq_conteos (company_id, dia, momento, insumo_id, cantidad, barista_id, nombre, registrado_por,
                                      sesion, dispositivo, corrige_id)
    values (p_company, v_dia, p_momento, v_insumo, v_cant, q.o_barista, q.o_nombre, auth.uid(),
            auth.jwt()->>'session_id', left(p_dispositivo, 300), v_previo);
    v_n := v_n + 1;
  end loop;
  -- Completo: ningún insumo activo sin conteo vigente hoy en este momento.
  select count(*) into v_faltan from public.franq_insumos i
  where i.company_id = p_company and i.activo
    and not exists (select 1 from public.franq_conteos c where c.company_id = p_company and c.dia = v_dia
                    and c.momento = p_momento and c.insumo_id = i.id);
  if v_faltan > 0 then
    raise exception 'Faltan % insumos por contar.', v_faltan using errcode = 'P0001';
  end if;
  return v_n;
end $$;
revoke all on function public.franq_contar(integer, text, jsonb, bigint, text) from public, anon;
grant execute on function public.franq_contar(integer, text, jsonb, bigint, text) to authenticated;

-- 7. Estado de los conteos de un día SIN cantidades (lo usa también la cuenta de baristas): quién y a qué hora.
create function public.franq_conteo_estado(p_company integer, p_dia date)
returns table (momento text, nombre text, registrado_en timestamptz, insumos integer)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public.franq_rol(p_company) is null then
    raise exception 'No tienes acceso a esta sucursal.' using errcode = '42501';
  end if;
  return query
    select c.momento, (array_agg(c.nombre order by c.id desc))[1], max(c.registrado_en),
           count(distinct c.insumo_id)::integer
    from public.franq_conteos c
    where c.company_id = p_company and c.dia = p_dia
    group by c.momento;
end $$;
revoke all on function public.franq_conteo_estado(integer, date) from public, anon;
grant execute on function public.franq_conteo_estado(integer, date) to authenticated;
