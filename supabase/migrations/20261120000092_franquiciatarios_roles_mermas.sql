-- Franquiciatarios F6, parte B (docs/franquiciatarios/03-PLAN-RUTINA-Y-CONEXIONES.md; decisiones de Carlos del
-- 2026-11-20):
-- - Matriz de roles por posición: posiciones y turnos por sucursal (lista base editable: Caja/Mostrador, Barra
--   caliente, Barra fría, Alimentos, Rappi/Delivery; matutino 7:00–15:00 y vespertino 15:00–22:00) y asignaciones de
--   baristas por día, turno y posición. Solo inserción: quitar a alguien es un renglón que anula al vigente.
-- - Mermas: registro por insumo de la lista de conteo (cantidad en su unidad de conteo, motivo y quién), tolerancia por
--   insumo (3 % del consumo teórico si no hay otra) y cierre del día por la gerencia. La comparación contra el consumo
--   teórico se calcula en el servidor (lib/franquiciatarios/mermas.ts); la base no guarda costos.

-- 1. Posiciones y turnos. Se desactivan, nunca se borran; solo cambian nombre, orden, horas y si está activo.
create table public.franq_posiciones (
  id bigint generated always as identity primary key,
  company_id integer not null check (company_id > 0),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 60),
  orden integer not null default 0,
  activo boolean not null default true,
  creado_por uuid not null references auth.users (id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users (id),
  actualizado_en timestamptz
);
create unique index franq_posiciones_nombre on public.franq_posiciones (company_id, lower(nombre)) where activo;

create table public.franq_turnos (
  id bigint generated always as identity primary key,
  company_id integer not null check (company_id > 0),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 40),
  entrada time not null,
  salida time not null,
  orden integer not null default 0,
  activo boolean not null default true,
  creado_por uuid not null references auth.users (id),
  creado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users (id),
  actualizado_en timestamptz,
  check (entrada <> salida)
);
create unique index franq_turnos_nombre on public.franq_turnos (company_id, lower(nombre)) where activo;

create function public.franq_catalogo_guardia() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'No se borran; desactívalos.';
  end if;
  if (new.id, new.company_id, new.creado_por, new.creado_en)
     is distinct from (old.id, old.company_id, old.creado_por, old.creado_en) then
    raise exception 'Solo cambian el nombre, el orden, las horas y si está activo.';
  end if;
  return new;
end $$;
create trigger franq_posiciones_guardia before update or delete on public.franq_posiciones
  for each row execute function public.franq_catalogo_guardia();
create trigger franq_turnos_guardia before update or delete on public.franq_turnos
  for each row execute function public.franq_catalogo_guardia();

-- 2. Asignaciones: un renglón por barista en un día, turno y posición. Quitarlo = renglón con anulada que corrige al
--    vigente. Vigente = no corregido por otro y no anulado.
create table public.franq_asignaciones (
  id bigint generated always as identity primary key,
  company_id integer not null check (company_id > 0),
  dia date not null,
  turno_id bigint not null references public.franq_turnos (id),
  posicion_id bigint not null references public.franq_posiciones (id),
  barista_id bigint not null references public.franq_baristas (id),
  anulada boolean not null default false,
  corrige_id bigint references public.franq_asignaciones (id),
  registrado_por uuid not null references auth.users (id),
  registrado_en timestamptz not null default now(),
  check (anulada = (corrige_id is not null))
);
create index franq_asignaciones_dia on public.franq_asignaciones (company_id, dia);
create index franq_asignaciones_barista on public.franq_asignaciones (barista_id);
create unique index franq_asignaciones_corrige on public.franq_asignaciones (corrige_id) where corrige_id is not null;
create trigger franq_asignaciones_solo_insercion before update or delete on public.franq_asignaciones
  for each row execute function public.franq_solo_insercion();

-- 3. Mermas. Cantidad en la unidad de conteo del insumo (franq_insumos.unidad). Corregir = renglón nuevo con
--    corrige_id; anular = renglón anulado que corrige al vigente.
create table public.franq_mermas (
  id bigint generated always as identity primary key,
  company_id integer not null check (company_id > 0),
  dia date not null,
  insumo_id bigint not null references public.franq_insumos (id),
  cantidad numeric not null check (cantidad > 0 and cantidad <= 100000),
  motivo text not null check (motivo in ('caducidad', 'preparacion', 'caida', 'devolucion', 'otro')),
  nota text check (nota is null or char_length(nota) <= 300),
  anulada boolean not null default false,
  corrige_id bigint references public.franq_mermas (id),
  motivo_correccion text check (motivo_correccion is null or char_length(motivo_correccion) <= 300),
  barista_id bigint references public.franq_baristas (id),
  nombre text not null,
  registrado_por uuid not null references auth.users (id),
  registrado_en timestamptz not null default now(),
  sesion text,
  dispositivo text check (dispositivo is null or char_length(dispositivo) <= 300),
  check (motivo <> 'otro' or char_length(btrim(coalesce(nota, ''))) >= 3),
  check (not anulada or corrige_id is not null)
);
create index franq_mermas_dia on public.franq_mermas (company_id, dia);
create index franq_mermas_insumo on public.franq_mermas (insumo_id);
create index franq_mermas_barista on public.franq_mermas (barista_id);
create unique index franq_mermas_corrige on public.franq_mermas (corrige_id) where corrige_id is not null;
create trigger franq_mermas_solo_insercion before update or delete on public.franq_mermas
  for each row execute function public.franq_solo_insercion();

-- Tolerancia por insumo (% del consumo teórico). El último registro manda; sin registro, 3 %.
create table public.franq_merma_tolerancias (
  id bigint generated always as identity primary key,
  company_id integer not null check (company_id > 0),
  insumo_id bigint not null references public.franq_insumos (id),
  pct numeric not null check (pct >= 0 and pct <= 100),
  registrado_por uuid not null references auth.users (id),
  registrado_en timestamptz not null default now()
);
create index franq_merma_tolerancias_insumo on public.franq_merma_tolerancias (company_id, insumo_id, id desc);
create trigger franq_merma_tolerancias_solo_insercion before update or delete on public.franq_merma_tolerancias
  for each row execute function public.franq_solo_insercion();

-- Cierre del día de mermas (uno por sucursal y día).
create table public.franq_mermas_cierre (
  company_id integer not null check (company_id > 0),
  dia date not null,
  nombre text not null,
  cerrado_por uuid not null references auth.users (id),
  cerrado_en timestamptz not null default now(),
  primary key (company_id, dia)
);
create trigger franq_mermas_cierre_solo_insercion before update or delete on public.franq_mermas_cierre
  for each row execute function public.franq_solo_insercion();

-- 4. RLS. Posiciones, turnos, asignaciones, mermas y cierres: toda la sucursal (no hay montos). Tolerancias: gestores.
alter table public.franq_posiciones enable row level security;
alter table public.franq_turnos enable row level security;
alter table public.franq_asignaciones enable row level security;
alter table public.franq_mermas enable row level security;
alter table public.franq_merma_tolerancias enable row level security;
alter table public.franq_mermas_cierre enable row level security;
revoke all on public.franq_posiciones, public.franq_turnos, public.franq_asignaciones, public.franq_mermas,
  public.franq_merma_tolerancias, public.franq_mermas_cierre from anon, authenticated;
grant select on public.franq_posiciones, public.franq_turnos, public.franq_asignaciones, public.franq_mermas,
  public.franq_merma_tolerancias, public.franq_mermas_cierre to authenticated;
create policy lectura on public.franq_posiciones for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias())::integer[]));
create policy lectura on public.franq_turnos for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias())::integer[]));
create policy lectura on public.franq_asignaciones for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias())::integer[]));
create policy lectura on public.franq_mermas for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias())::integer[]));
create policy lectura on public.franq_mermas_cierre for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias())::integer[]));
create policy lectura on public.franq_merma_tolerancias for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias_gestor())::integer[]));

-- 5. Lista base de posiciones y turnos (solo si la sucursal no tiene ninguno). Solo gestores. Devuelve cuántos sembró.
create function public.franq_roles_base(p_company integer) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer := 0; v_x integer;
begin
  if not public.franq_es_gestor(p_company) then
    raise exception 'Solo el gerente o el franquiciatario arman la matriz de roles.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('franq_roles_base:' || p_company));
  if not exists (select 1 from public.franq_posiciones where company_id = p_company) then
    insert into public.franq_posiciones (company_id, nombre, orden, creado_por)
    select p_company, x.nombre, x.orden, auth.uid()
    from (values ('Caja/Mostrador', 1), ('Barra caliente', 2), ('Barra fría', 3), ('Alimentos', 4),
                 ('Rappi/Delivery', 5)) x (nombre, orden);
    get diagnostics v_x = row_count; v_n := v_n + v_x;
  end if;
  if not exists (select 1 from public.franq_turnos where company_id = p_company) then
    insert into public.franq_turnos (company_id, nombre, entrada, salida, orden, creado_por)
    values (p_company, 'Matutino', '07:00', '15:00', 1, auth.uid()),
           (p_company, 'Vespertino', '15:00', '22:00', 2, auth.uid());
    get diagnostics v_x = row_count; v_n := v_n + v_x;
  end if;
  return v_n;
end $$;

-- Alta o edición de una posición o de un turno. Solo gestores.
create function public.franq_posicion_guardar(p_company integer, p_id bigint, p_nombre text, p_orden integer,
                                              p_activo boolean) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_nombre text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
begin
  if not public.franq_es_gestor(p_company) then
    raise exception 'Solo el gerente o el franquiciatario editan las posiciones.' using errcode = '42501';
  end if;
  if char_length(v_nombre) not between 2 and 60 then
    raise exception 'Escribe el nombre de la posición.' using errcode = 'P0001';
  end if;
  begin
    if p_id is null then
      insert into public.franq_posiciones (company_id, nombre, orden, activo, creado_por)
      values (p_company, v_nombre,
              coalesce(p_orden, (select coalesce(max(orden), 0) + 1 from public.franq_posiciones where company_id = p_company)),
              coalesce(p_activo, true), auth.uid())
      returning id into v_id;
    else
      update public.franq_posiciones
      set nombre = v_nombre, orden = coalesce(p_orden, orden), activo = coalesce(p_activo, activo),
          actualizado_por = auth.uid(), actualizado_en = now()
      where id = p_id and company_id = p_company returning id into v_id;
      if v_id is null then raise exception 'Esa posición no es de esta sucursal.' using errcode = 'P0001'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Ya hay una posición activa con ese nombre.' using errcode = 'P0001';
  end;
  return v_id;
end $$;

create function public.franq_turno_guardar(p_company integer, p_id bigint, p_nombre text, p_entrada time,
                                           p_salida time, p_activo boolean) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_nombre text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
begin
  if not public.franq_es_gestor(p_company) then
    raise exception 'Solo el gerente o el franquiciatario editan los turnos.' using errcode = '42501';
  end if;
  if char_length(v_nombre) not between 2 and 40 or p_entrada is null or p_salida is null or p_entrada = p_salida then
    raise exception 'Escribe el nombre del turno y sus horas de entrada y salida.' using errcode = 'P0001';
  end if;
  begin
    if p_id is null then
      insert into public.franq_turnos (company_id, nombre, entrada, salida, orden, activo, creado_por)
      values (p_company, v_nombre, p_entrada, p_salida,
              (select coalesce(max(orden), 0) + 1 from public.franq_turnos where company_id = p_company),
              coalesce(p_activo, true), auth.uid())
      returning id into v_id;
    else
      update public.franq_turnos
      set nombre = v_nombre, entrada = p_entrada, salida = p_salida, activo = coalesce(p_activo, activo),
          actualizado_por = auth.uid(), actualizado_en = now()
      where id = p_id and company_id = p_company returning id into v_id;
      if v_id is null then raise exception 'Ese turno no es de esta sucursal.' using errcode = 'P0001'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Ya hay un turno activo con ese nombre.' using errcode = 'P0001';
  end;
  return v_id;
end $$;

-- 6. Asignar o quitar a un barista. Solo gestores; de hoy en adelante (o hasta 7 días atrás, para corregir).
create function public.franq_asignar(p_company integer, p_dia date, p_turno bigint, p_posicion bigint,
                                     p_barista bigint, p_quitar boolean) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint; v_previo bigint; v_hoy date := public.franq_dia_operacion(now());
begin
  if not public.franq_es_gestor(p_company) then
    raise exception 'Solo el gerente o el franquiciatario asignan posiciones.' using errcode = '42501';
  end if;
  if p_dia is null or p_dia < v_hoy - 7 or p_dia > v_hoy + 62 then
    raise exception 'Se asigna de 7 días atrás a 2 meses adelante.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.franq_turnos where id = p_turno and company_id = p_company and activo)
     or not exists (select 1 from public.franq_posiciones where id = p_posicion and company_id = p_company and activo)
     or not exists (select 1 from public.franq_baristas where id = p_barista and company_id = p_company and activo) then
    raise exception 'Turno, posición o barista no válidos en esta sucursal.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('franq_asignar:' || p_company || ':' || p_dia));
  select a.id into v_previo from public.franq_asignaciones a
  where a.company_id = p_company and a.dia = p_dia and a.turno_id = p_turno and a.posicion_id = p_posicion
    and a.barista_id = p_barista and not a.anulada
    and not exists (select 1 from public.franq_asignaciones x where x.corrige_id = a.id)
  order by a.id desc limit 1;
  if coalesce(p_quitar, false) then
    if v_previo is null then return null; end if;
    insert into public.franq_asignaciones (company_id, dia, turno_id, posicion_id, barista_id, anulada, corrige_id,
                                           registrado_por)
    values (p_company, p_dia, p_turno, p_posicion, p_barista, true, v_previo, auth.uid())
    returning id into v_id;
    return v_id;
  end if;
  if v_previo is not null then return v_previo; end if;
  insert into public.franq_asignaciones (company_id, dia, turno_id, posicion_id, barista_id, registrado_por)
  values (p_company, p_dia, p_turno, p_posicion, p_barista, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- Copia las asignaciones vigentes de la semana anterior a los días de la semana de p_lunes que no tienen ninguna.
-- Solo turnos, posiciones y baristas que siguen activos. Devuelve cuántas copió.
create function public.franq_copiar_semana(p_company integer, p_lunes date) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_n integer;
begin
  if not public.franq_es_gestor(p_company) then
    raise exception 'Solo el gerente o el franquiciatario asignan posiciones.' using errcode = '42501';
  end if;
  if p_lunes is null or extract(isodow from p_lunes) <> 1
     or p_lunes < public.franq_dia_operacion(now()) - 7 or p_lunes > public.franq_dia_operacion(now()) + 62 then
    raise exception 'Elige el lunes de una semana actual o futura.' using errcode = 'P0001';
  end if;
  perform pg_advisory_xact_lock(hashtext('franq_copiar_semana:' || p_company));
  insert into public.franq_asignaciones (company_id, dia, turno_id, posicion_id, barista_id, registrado_por)
  select p_company, a.dia + 7, a.turno_id, a.posicion_id, a.barista_id, auth.uid()
  from public.franq_asignaciones a
  join public.franq_turnos t on t.id = a.turno_id and t.activo
  join public.franq_posiciones p on p.id = a.posicion_id and p.activo
  join public.franq_baristas b on b.id = a.barista_id and b.activo
  where a.company_id = p_company and a.dia between p_lunes - 7 and p_lunes - 1 and not a.anulada
    and not exists (select 1 from public.franq_asignaciones x where x.corrige_id = a.id)
    and not exists (select 1 from public.franq_asignaciones y where y.company_id = p_company and y.dia = a.dia + 7
                    and not y.anulada and not exists (select 1 from public.franq_asignaciones z where z.corrige_id = y.id));
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 7. Registrar, corregir o anular una merma de HOY. Cualquier rol de la sucursal (la cuenta de baristas con su nombre
--    declarado). Con el día cerrado, solo un gestor y con motivo de corrección. Corregir o anular un registro de otro
--    día: solo un gestor, con motivo.
create function public.franq_registrar_merma(p_company integer, p_insumo bigint, p_cantidad numeric, p_motivo text,
                                             p_nota text, p_barista bigint, p_dispositivo text, p_corrige bigint,
                                             p_anular boolean, p_motivo_correccion text) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare q record; v_dia date := public.franq_dia_operacion(now()); v_id bigint; o record;
  v_gestor boolean := public.franq_es_gestor(p_company);
  v_motivo_corr text := nullif(btrim(coalesce(p_motivo_correccion, '')), '');
begin
  select * into q from public.franq_quien(p_company, p_barista);
  if p_corrige is not null then
    select * into o from public.franq_mermas m where m.id = p_corrige and m.company_id = p_company and not m.anulada
      and not exists (select 1 from public.franq_mermas x where x.corrige_id = m.id);
    if o.id is null then
      raise exception 'Ese registro ya no está vigente.' using errcode = 'P0001';
    end if;
    v_dia := o.dia;
    if v_dia <> public.franq_dia_operacion(now()) and not v_gestor then
      raise exception 'Solo la gerencia corrige mermas de otro día.' using errcode = '42501';
    end if;
  end if;
  if exists (select 1 from public.franq_mermas_cierre where company_id = p_company and dia = v_dia) then
    if not v_gestor then
      raise exception 'Las mermas de hoy ya se cerraron; pide a la gerencia que lo registre.' using errcode = '42501';
    end if;
    if v_motivo_corr is null then
      raise exception 'El día ya se cerró: escribe el motivo del cambio.' using errcode = 'P0001';
    end if;
  end if;
  if p_corrige is not null and v_dia <> public.franq_dia_operacion(now()) and v_motivo_corr is null then
    raise exception 'Escribe el motivo de la corrección.' using errcode = 'P0001';
  end if;
  if coalesce(p_anular, false) then
    if p_corrige is null then raise exception 'Indica qué registro se anula.' using errcode = 'P0001'; end if;
    insert into public.franq_mermas (company_id, dia, insumo_id, cantidad, motivo, nota, anulada, corrige_id,
                                     motivo_correccion, barista_id, nombre, registrado_por, sesion, dispositivo)
    values (p_company, v_dia, o.insumo_id, o.cantidad, o.motivo, o.nota, true, p_corrige, v_motivo_corr,
            q.o_barista, q.o_nombre, auth.uid(), auth.jwt()->>'session_id', left(p_dispositivo, 300))
    returning id into v_id;
    return v_id;
  end if;
  if not exists (select 1 from public.franq_insumos where id = p_insumo and company_id = p_company and activo) then
    raise exception 'Ese insumo no está en la lista de esta sucursal.' using errcode = 'P0001';
  end if;
  if p_cantidad is null or p_cantidad <= 0 or p_cantidad > 100000 then
    raise exception 'La cantidad va de más de 0 en adelante.' using errcode = 'P0001';
  end if;
  if p_motivo is null or p_motivo not in ('caducidad', 'preparacion', 'caida', 'devolucion', 'otro') then
    raise exception 'Elige el motivo.' using errcode = 'P0001';
  end if;
  if p_motivo = 'otro' and char_length(btrim(coalesce(p_nota, ''))) < 3 then
    raise exception 'Con «Otro», escribe qué pasó.' using errcode = 'P0001';
  end if;
  insert into public.franq_mermas (company_id, dia, insumo_id, cantidad, motivo, nota, corrige_id, motivo_correccion,
                                   barista_id, nombre, registrado_por, sesion, dispositivo)
  values (p_company, v_dia, p_insumo, p_cantidad, p_motivo, nullif(btrim(coalesce(p_nota, '')), ''), p_corrige,
          v_motivo_corr, q.o_barista, q.o_nombre, auth.uid(), auth.jwt()->>'session_id', left(p_dispositivo, 300))
  returning id into v_id;
  return v_id;
end $$;

-- Cerrar las mermas de un día (hoy o anterior). Solo gestores; una vez.
create function public.franq_cerrar_mermas(p_company integer, p_dia date) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.franq_es_gestor(p_company) then
    raise exception 'Solo el gerente o el franquiciatario cierran las mermas.' using errcode = '42501';
  end if;
  if p_dia is null or p_dia > public.franq_dia_operacion(now()) then
    raise exception 'Solo se cierra hoy o un día anterior.' using errcode = 'P0001';
  end if;
  insert into public.franq_mermas_cierre (company_id, dia, nombre, cerrado_por)
  values (p_company, p_dia, coalesce((select nombre from public.perfiles where user_id = auth.uid()), 'Gerencia'),
          auth.uid())
  on conflict (company_id, dia) do nothing;
end $$;

-- Tolerancia de un insumo. Solo gestores.
create function public.franq_tolerancia_guardar(p_company integer, p_insumo bigint, p_pct numeric) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_id bigint;
begin
  if not public.franq_es_gestor(p_company) then
    raise exception 'Solo el gerente o el franquiciatario ajustan la tolerancia.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.franq_insumos where id = p_insumo and company_id = p_company) then
    raise exception 'Ese insumo no está en la lista de esta sucursal.' using errcode = 'P0001';
  end if;
  if p_pct is null or p_pct < 0 or p_pct > 100 then
    raise exception 'La tolerancia va de 0 a 100 %%.' using errcode = 'P0001';
  end if;
  insert into public.franq_merma_tolerancias (company_id, insumo_id, pct, registrado_por)
  values (p_company, p_insumo, p_pct, auth.uid()) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.franq_roles_base(integer), public.franq_posicion_guardar(integer, bigint, text, integer, boolean),
  public.franq_turno_guardar(integer, bigint, text, time, time, boolean),
  public.franq_asignar(integer, date, bigint, bigint, bigint, boolean), public.franq_copiar_semana(integer, date),
  public.franq_registrar_merma(integer, bigint, numeric, text, text, bigint, text, bigint, boolean, text),
  public.franq_cerrar_mermas(integer, date), public.franq_tolerancia_guardar(integer, bigint, numeric)
  from public, anon;
grant execute on function public.franq_roles_base(integer), public.franq_posicion_guardar(integer, bigint, text, integer, boolean),
  public.franq_turno_guardar(integer, bigint, text, time, time, boolean),
  public.franq_asignar(integer, date, bigint, bigint, bigint, boolean), public.franq_copiar_semana(integer, date),
  public.franq_registrar_merma(integer, bigint, numeric, text, text, bigint, text, bigint, boolean, text),
  public.franq_cerrar_mermas(integer, date), public.franq_tolerancia_guardar(integer, bigint, numeric)
  to authenticated;
