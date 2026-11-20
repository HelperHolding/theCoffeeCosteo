-- Franquiciatarios · F4 Arqueo y caja chica (docs/franquiciatarios/03-PLAN-RUTINA-Y-CONEXIONES.md).
-- - Arqueo CIEGO a medio turno y al cierre: quien cuenta captura el efectivo en caja sin ver lo esperado. La gerencia
--   compara contra fondo + efectivo del POS hasta esa hora − gastos de caja chica en efectivo (se calcula en el
--   servidor con los datos del POS; aquí solo se guarda lo contado).
-- - Caja chica: gastos de la sucursal (solo gerencia). No se borran: un gasto mal capturado se ANULA con motivo.
-- - Configuración de caja por sucursal: fondo y tolerancia (solo gerencia).
-- La cuenta de baristas captura arqueos pero no ve montos de caja, gastos ni P&L (decisión de Carlos, 2026-11-20).

-- 1. Configuración de caja.
create table public.franq_caja_config (
  company_id integer primary key check (company_id > 0),
  fondo numeric not null default 0 check (fondo >= 0 and fondo <= 100000),
  tolerancia numeric not null default 20 check (tolerancia >= 0 and tolerancia <= 10000),
  actualizado_por uuid not null references auth.users (id),
  actualizado_en timestamptz not null default now()
);

-- 2. Arqueos (solo inserción; un recuento del mismo momento corrige al vigente).
create table public.franq_arqueos (
  id bigint generated always as identity primary key,
  company_id integer not null check (company_id > 0),
  dia date not null,
  momento text not null check (momento in ('medio', 'cierre')),
  contado numeric not null check (contado >= 0 and contado <= 1000000),
  observacion text check (observacion is null or char_length(observacion) <= 1000),
  barista_id bigint references public.franq_baristas (id),
  nombre text not null,
  registrado_por uuid not null references auth.users (id),
  registrado_en timestamptz not null default now(),
  sesion text,
  dispositivo text check (dispositivo is null or char_length(dispositivo) <= 300),
  corrige_id bigint references public.franq_arqueos (id)
);
create index franq_arqueos_dia on public.franq_arqueos (company_id, dia);
create index franq_arqueos_barista on public.franq_arqueos (barista_id);
create unique index franq_arqueos_corrige on public.franq_arqueos (corrige_id) where corrige_id is not null;
create trigger franq_arqueos_solo_insercion before update or delete on public.franq_arqueos
  for each row execute function public.franq_solo_insercion();

-- 3. Gastos de caja chica (solo inserción; una anulación es un renglón que apunta al gasto anulado).
create table public.franq_gastos (
  id bigint generated always as identity primary key,
  company_id integer not null check (company_id > 0),
  dia date not null,
  concepto text check (concepto is null or char_length(btrim(concepto)) between 3 and 200),
  categoria text check (categoria in ('insumos', 'limpieza', 'mantenimiento', 'papeleria', 'transporte', 'otro')),
  monto numeric check (monto > 0 and monto <= 100000),
  en_efectivo boolean not null default true,
  comprobante boolean not null default false,
  nota text check (nota is null or char_length(nota) <= 1000),
  anula_id bigint references public.franq_gastos (id),
  nombre text not null,
  registrado_por uuid not null references auth.users (id),
  registrado_en timestamptz not null default now(),
  sesion text,
  dispositivo text check (dispositivo is null or char_length(dispositivo) <= 300),
  -- Un gasto trae concepto, categoría y monto; una anulación trae el gasto anulado y su motivo (nota).
  constraint franq_gastos_forma check (
    (anula_id is null and concepto is not null and categoria is not null and monto is not null)
    or (anula_id is not null and concepto is null and categoria is null and monto is null
        and char_length(btrim(coalesce(nota, ''))) >= 3))
);
create index franq_gastos_dia on public.franq_gastos (company_id, dia);
create unique index franq_gastos_anula on public.franq_gastos (anula_id) where anula_id is not null;
create trigger franq_gastos_solo_insercion before update or delete on public.franq_gastos
  for each row execute function public.franq_solo_insercion();

-- 4. RLS: todo esto es de la gerencia (la cuenta de baristas no lee montos de caja).
alter table public.franq_caja_config enable row level security;
alter table public.franq_arqueos enable row level security;
alter table public.franq_gastos enable row level security;
revoke all on public.franq_caja_config, public.franq_arqueos, public.franq_gastos from anon, authenticated;
grant select on public.franq_caja_config, public.franq_arqueos, public.franq_gastos to authenticated;
create policy lectura on public.franq_caja_config for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias_gestor())::integer[]));
create policy lectura on public.franq_arqueos for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias_gestor())::integer[]));
create policy lectura on public.franq_gastos for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias_gestor())::integer[]));

-- 5. Arqueo de HOY (cualquier rol de la sucursal; la cuenta de baristas con su nombre declarado). Ciego: no devuelve
--    nada de lo esperado.
create function public.franq_arquear(p_company integer, p_momento text, p_contado numeric, p_observacion text,
                                     p_barista bigint, p_dispositivo text) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare q record; v_dia date := public.franq_dia_operacion(now()); v_previo bigint; v_id bigint;
  v_obs text := nullif(btrim(coalesce(p_observacion, '')), '');
begin
  select * into q from public.franq_quien(p_company, p_barista);
  if p_momento not in ('medio', 'cierre') then raise exception 'Momento inválido.' using errcode = 'P0001'; end if;
  if p_contado is null or p_contado < 0 or p_contado > 1000000 then
    raise exception 'Escribe el efectivo contado (de 0 en adelante).' using errcode = 'P0001';
  end if;
  select a.id into v_previo from public.franq_arqueos a
  where a.company_id = p_company and a.dia = v_dia and a.momento = p_momento
    and not exists (select 1 from public.franq_arqueos x where x.corrige_id = a.id)
  order by a.id desc limit 1;
  insert into public.franq_arqueos (company_id, dia, momento, contado, observacion, barista_id, nombre, registrado_por,
                                    sesion, dispositivo, corrige_id)
  values (p_company, v_dia, p_momento, round(p_contado, 2), v_obs, q.o_barista, q.o_nombre, auth.uid(),
          auth.jwt()->>'session_id', left(p_dispositivo, 300), v_previo)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.franq_arquear(integer, text, numeric, text, bigint, text) from public, anon;
grant execute on function public.franq_arquear(integer, text, numeric, text, bigint, text) to authenticated;

-- Estado de los arqueos de un día SIN montos (para la cuenta de baristas): quién y a qué hora.
create function public.franq_arqueo_estado(p_company integer, p_dia date)
returns table (momento text, nombre text, registrado_en timestamptz)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public.franq_rol(p_company) is null then
    raise exception 'No tienes acceso a esta sucursal.' using errcode = '42501';
  end if;
  return query
    select a.momento, a.nombre, a.registrado_en from public.franq_arqueos a
    where a.company_id = p_company and a.dia = p_dia
      and not exists (select 1 from public.franq_arqueos x where x.corrige_id = a.id);
end $$;
revoke all on function public.franq_arqueo_estado(integer, date) from public, anon;
grant execute on function public.franq_arqueo_estado(integer, date) to authenticated;

-- 6. Gasto de caja chica de HOY. Solo gerencia (registra con el nombre de su perfil).
create function public.franq_gasto(p_company integer, p_concepto text, p_categoria text, p_monto numeric,
                                   p_en_efectivo boolean, p_comprobante boolean, p_nota text, p_dispositivo text)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare q record; v_id bigint; v_concepto text := regexp_replace(btrim(coalesce(p_concepto, '')), '\s+', ' ', 'g');
begin
  if not public.franq_es_gestor(p_company) then
    raise exception 'Solo el gerente o el franquiciatario registran gastos.' using errcode = '42501';
  end if;
  select * into q from public.franq_quien(p_company, null);
  if char_length(v_concepto) not between 3 and 200 then
    raise exception 'Describe el gasto.' using errcode = 'P0001';
  end if;
  if p_categoria not in ('insumos', 'limpieza', 'mantenimiento', 'papeleria', 'transporte', 'otro') then
    raise exception 'Elige la categoría del gasto.' using errcode = 'P0001';
  end if;
  if p_monto is null or p_monto <= 0 or p_monto > 100000 then
    raise exception 'Escribe el monto del gasto.' using errcode = 'P0001';
  end if;
  insert into public.franq_gastos (company_id, dia, concepto, categoria, monto, en_efectivo, comprobante, nota, nombre,
                                   registrado_por, sesion, dispositivo)
  values (p_company, public.franq_dia_operacion(now()), v_concepto, p_categoria, round(p_monto, 2),
          coalesce(p_en_efectivo, true), coalesce(p_comprobante, false), nullif(btrim(coalesce(p_nota, '')), ''),
          q.o_nombre, auth.uid(), auth.jwt()->>'session_id', left(p_dispositivo, 300))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.franq_gasto(integer, text, text, numeric, boolean, boolean, text, text) from public, anon;
grant execute on function public.franq_gasto(integer, text, text, numeric, boolean, boolean, text, text) to authenticated;

-- Anular un gasto (gerencia, con motivo). Queda el original y la anulación.
create function public.franq_gasto_anular(p_gasto bigint, p_motivo text, p_dispositivo text) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_gasto public.franq_gastos; q record; v_id bigint; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  select * into v_gasto from public.franq_gastos where id = p_gasto;
  if v_gasto.id is null or not public.franq_es_gestor(v_gasto.company_id) then
    raise exception 'Solo el gerente o el franquiciatario anulan gastos.' using errcode = '42501';
  end if;
  if v_gasto.anula_id is not null then
    raise exception 'Eso ya es una anulación.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.franq_gastos where anula_id = v_gasto.id) then
    raise exception 'Ese gasto ya está anulado.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_motivo, '')) < 3 then
    raise exception 'Escribe por qué se anula.' using errcode = 'P0001';
  end if;
  select * into q from public.franq_quien(v_gasto.company_id, null);
  insert into public.franq_gastos (company_id, dia, anula_id, nota, en_efectivo, nombre, registrado_por, sesion,
                                   dispositivo)
  values (v_gasto.company_id, v_gasto.dia, v_gasto.id, v_motivo, v_gasto.en_efectivo, q.o_nombre, auth.uid(),
          auth.jwt()->>'session_id', left(p_dispositivo, 300))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.franq_gasto_anular(bigint, text, text) from public, anon;
grant execute on function public.franq_gasto_anular(bigint, text, text) to authenticated;

-- 7. Fondo y tolerancia de caja (gerencia).
create function public.franq_caja_configurar(p_company integer, p_fondo numeric, p_tolerancia numeric)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.franq_es_gestor(p_company) then
    raise exception 'Solo el gerente o el franquiciatario configuran la caja.' using errcode = '42501';
  end if;
  if p_fondo is null or p_fondo < 0 or p_fondo > 100000 or p_tolerancia is null or p_tolerancia < 0
     or p_tolerancia > 10000 then
    raise exception 'Revisa el fondo y la tolerancia.' using errcode = 'P0001';
  end if;
  insert into public.franq_caja_config (company_id, fondo, tolerancia, actualizado_por, actualizado_en)
  values (p_company, round(p_fondo, 2), round(p_tolerancia, 2), auth.uid(), now())
  on conflict (company_id) do update
    set fondo = excluded.fondo, tolerancia = excluded.tolerancia, actualizado_por = excluded.actualizado_por,
        actualizado_en = excluded.actualizado_en;
end $$;
revoke all on function public.franq_caja_configurar(integer, numeric, numeric) from public, anon;
grant execute on function public.franq_caja_configurar(integer, numeric, numeric) to authenticated;
