-- Franquiciatarios · F5 P&L de la sucursal (docs/franquiciatarios/03-PLAN-RUTINA-Y-CONEXIONES.md).
-- Gastos fijos mensuales por sucursal. Fuente principal: Zoho Analytics, tabla «Gastos Sucursales» (renta, labor
-- cost, POS fee, suscripciones, agua y teléfono, energía), cargada con scripts/franquiciatarios/zoho-gastos-fijos.ts
-- (origen 'zoho'). La gerencia puede capturar o corregir cualquier concepto (origen 'manual'). Solo inserción: el
-- último registro de un concepto y mes es el vigente y queda el historial. El P&L lo ven gerente, franquiciatario y
-- admin; la cuenta de baristas no (decisión de Carlos, 2026-11-20).

create table public.franq_gastos_fijos (
  id bigint generated always as identity primary key,
  company_id integer not null check (company_id > 0),
  mes date not null check (extract(day from mes) = 1),
  concepto text not null check (concepto in ('renta', 'nomina', 'energia', 'servicios', 'pos', 'suscripciones',
                                             'regalias', 'marketing', 'mantenimiento', 'otros')),
  monto numeric not null check (monto >= 0 and monto <= 10000000),
  nota text check (nota is null or char_length(nota) <= 500),
  origen text not null default 'manual' check (origen in ('manual', 'zoho')),
  nombre text not null,
  registrado_por uuid not null references auth.users (id),
  registrado_en timestamptz not null default now()
);
create index franq_gastos_fijos_mes on public.franq_gastos_fijos (company_id, mes, concepto, id desc);
create trigger franq_gastos_fijos_solo_insercion before update or delete on public.franq_gastos_fijos
  for each row execute function public.franq_solo_insercion();

alter table public.franq_gastos_fijos enable row level security;
revoke all on public.franq_gastos_fijos from anon, authenticated;
grant select on public.franq_gastos_fijos to authenticated;
create policy lectura on public.franq_gastos_fijos for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias_gestor())::integer[]));

-- Capturar (o recapturar) un gasto fijo del mes. Solo gerencia; hasta el mes siguiente al actual.
create function public.franq_gasto_fijo(p_company integer, p_mes date, p_concepto text, p_monto numeric,
                                        p_nota text) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare q record; v_id bigint; v_mes date := date_trunc('month', p_mes)::date;
begin
  if not public.franq_es_gestor(p_company) then
    raise exception 'Solo el gerente o el franquiciatario capturan los gastos fijos.' using errcode = '42501';
  end if;
  select * into q from public.franq_quien(p_company, null);
  if p_mes is null or v_mes > (date_trunc('month', public.franq_dia_operacion(now())) + interval '1 month')::date
     or v_mes < date '2024-01-01' then
    raise exception 'Mes inválido.' using errcode = 'P0001';
  end if;
  if p_concepto not in ('renta', 'nomina', 'energia', 'servicios', 'pos', 'suscripciones', 'regalias', 'marketing',
                        'mantenimiento', 'otros') then
    raise exception 'Concepto inválido.' using errcode = 'P0001';
  end if;
  if p_monto is null or p_monto < 0 or p_monto > 10000000 then
    raise exception 'Escribe el monto (de 0 en adelante).' using errcode = 'P0001';
  end if;
  insert into public.franq_gastos_fijos (company_id, mes, concepto, monto, nota, nombre, registrado_por)
  values (p_company, v_mes, p_concepto, round(p_monto, 2), nullif(btrim(coalesce(p_nota, '')), ''), q.o_nombre,
          auth.uid())
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.franq_gasto_fijo(integer, date, text, numeric, text) from public, anon;
grant execute on function public.franq_gasto_fijo(integer, date, text, numeric, text) to authenticated;
