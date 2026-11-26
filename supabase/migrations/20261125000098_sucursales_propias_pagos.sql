-- Pagos de Sucursales propias: conciliación masiva Banregio → Zoho Books (org Sucursales The Coffee – GDL).
-- Spec: docs/superpowers/specs/2026-11-25-sucursales-propias-pagos-design.md (§3 permisos, §6 datos).

-- 1. Acceso nuevo 'sucursales_pagos' (lectura = ver; edicion/desarrollador = subir y aplicar). Solo empleados Holding.
alter table public.perfil_modulos drop constraint perfil_modulos_modulo_check;
alter table public.perfil_modulos add constraint perfil_modulos_modulo_check
  check (modulo in ('crm', 'sucursales', 'sucursales_costeo', 'bi', 'comercializadora', 'franquiciatarios',
                    'sucursales_pagos'));

create function public.suc_pagos_nivel() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select pm.nivel
  from public.perfil_modulos pm
  join public.perfiles p on p.user_id = pm.user_id
  where pm.user_id = auth.uid() and pm.modulo = 'sucursales_pagos' and p.activo
    and p.rol in ('compras', 'operaciones', 'finanzas', 'admin', 'sucursales', 'interno')
    and (auth.jwt()->>'client_id') is null
$$;
create function public.suc_pagos_puede_leer() returns boolean
language sql stable set search_path = public, pg_temp as $$
  select public.suc_pagos_nivel() is not null
$$;
create function public.suc_pagos_puede_editar() returns boolean
language sql stable set search_path = public, pg_temp as $$
  select coalesce(public.suc_pagos_nivel() in ('desarrollador', 'edicion'), false)
$$;
revoke all on function public.suc_pagos_nivel(), public.suc_pagos_puede_leer(), public.suc_pagos_puede_editar()
  from public, anon;
grant execute on function public.suc_pagos_nivel(), public.suc_pagos_puede_leer(), public.suc_pagos_puede_editar()
  to authenticated;

-- 2. Tablas.
create table public.suc_pago_corrida (
  id bigint generated always as identity primary key,
  archivo text not null,
  subido_por uuid not null default auth.uid() references public.perfiles (user_id),
  subido_en timestamptz not null default now(),
  n_resumen integer,
  total_resumen numeric(14, 2),
  n_recibos integer not null,
  total_recibos numeric(14, 2) not null,
  avisos jsonb not null default '[]'::jsonb
);

create table public.suc_pago_transferencia (
  id bigint generated always as identity primary key,
  corrida_id bigint not null references public.suc_pago_corrida (id) on delete cascade,
  -- Clave de rastreo SPEI, o BRG-<fecha>-<últimos 4>-<monto> para traspasos Banregio sin clave.
  llave text not null unique,
  tipo text not null check (tipo in ('SPEI', 'Banregio')),
  clabe text check (clabe ~ '^[0-9]{18}$'),
  alias text not null,
  concepto text not null default '',
  monto numeric(14, 2) not null check (monto > 0),
  fecha_operacion date not null,
  archivo_pdf text not null,
  proveedor_zoho_id text,
  proveedor_nombre text,
  sugerido boolean not null default false,
  estado text not null check (estado in ('cuadra', 'no_cuadra', 'desconocido', 'sin_facturas', 'aplicando',
                                         'aplicada', 'aplicada_sin_adjunto', 'error', 'ya_aplicada')),
  error text,
  zoho_vendorpayment_id text,
  adjunto_ok boolean not null default false,
  aplicado_por uuid references public.perfiles (user_id),
  aplicado_en timestamptz,
  actualizado_en timestamptz not null default now()
);
create index suc_pago_transferencia_corrida on public.suc_pago_transferencia (corrida_id);

create table public.suc_pago_asignacion (
  transferencia_id bigint not null references public.suc_pago_transferencia (id) on delete cascade,
  bill_id text not null,
  bill_numero text not null,
  ubicacion text not null default '',
  fecha date,
  saldo numeric(14, 2) not null,
  monto numeric(14, 2) not null check (monto > 0),
  primary key (transferencia_id, bill_id)
);

create table public.suc_proveedor_clabe (
  clabe text primary key check (clabe ~ '^[0-9]{18}$'),
  proveedor_zoho_id text not null,
  proveedor_nombre text not null,
  creado_por uuid default auth.uid() references public.perfiles (user_id),
  creado_en timestamptz not null default now()
);

create table public.suc_pago_config (
  id integer primary key default 1 check (id = 1),
  cuenta_nombre text not null default 'BANREGIO - CONSOLIDADO SUCURSALES PROPIAS',
  cuenta_zoho_id text
);
insert into public.suc_pago_config default values;

-- 3. Privilegios y RLS. El resultado de Zoho (estado aplicada, ids, aplicado_*) solo lo escribe la Edge Function.
alter table public.suc_pago_corrida enable row level security;
alter table public.suc_pago_transferencia enable row level security;
alter table public.suc_pago_asignacion enable row level security;
alter table public.suc_proveedor_clabe enable row level security;
alter table public.suc_pago_config enable row level security;

revoke all on public.suc_pago_corrida, public.suc_pago_transferencia, public.suc_pago_asignacion,
  public.suc_proveedor_clabe, public.suc_pago_config from anon, authenticated;
grant all on public.suc_pago_corrida, public.suc_pago_transferencia, public.suc_pago_asignacion,
  public.suc_proveedor_clabe, public.suc_pago_config to service_role;

grant select, insert on public.suc_pago_corrida to authenticated;
grant update (avisos) on public.suc_pago_corrida to authenticated;
grant select on public.suc_pago_transferencia to authenticated;
-- Insert solo de las columnas que fija la RPC: aplicado_*, error, ids de Zoho quedan fuera.
grant insert (corrida_id, llave, tipo, clabe, alias, concepto, monto, fecha_operacion, archivo_pdf,
  proveedor_zoho_id, proveedor_nombre, sugerido, estado) on public.suc_pago_transferencia to authenticated;
grant update (proveedor_zoho_id, proveedor_nombre, sugerido, estado, error, actualizado_en)
  on public.suc_pago_transferencia to authenticated;
grant select, insert, delete on public.suc_pago_asignacion to authenticated;
grant select, insert, update on public.suc_proveedor_clabe to authenticated;
grant select on public.suc_pago_config to authenticated;

create policy leer on public.suc_pago_corrida for select to authenticated
  using ((select public.suc_pagos_puede_leer()));
create policy subir on public.suc_pago_corrida for insert to authenticated
  with check ((select public.suc_pagos_puede_editar()) and subido_por = (select auth.uid()));
create policy avisos on public.suc_pago_corrida for update to authenticated
  using ((select public.suc_pagos_puede_editar())) with check ((select public.suc_pagos_puede_editar()));

create policy leer on public.suc_pago_transferencia for select to authenticated
  using ((select public.suc_pagos_puede_leer()));
create policy registrar on public.suc_pago_transferencia for insert to authenticated
  with check ((select public.suc_pagos_puede_editar())
    and estado in ('cuadra', 'no_cuadra', 'desconocido', 'sin_facturas')
    and zoho_vendorpayment_id is null and aplicado_por is null and not adjunto_ok
    -- La ruta del recibo la fija la base: el bucket confía en archivo_pdf.
    and archivo_pdf = corrida_id || '/' || md5(llave) || '.pdf');
create policy revisar on public.suc_pago_transferencia for update to authenticated
  using ((select public.suc_pagos_puede_editar()) and estado in ('cuadra', 'no_cuadra', 'desconocido', 'sin_facturas'))
  with check ((select public.suc_pagos_puede_editar()) and estado in ('cuadra', 'no_cuadra', 'desconocido', 'sin_facturas'));

create policy leer on public.suc_pago_asignacion for select to authenticated
  using ((select public.suc_pagos_puede_leer()));
create policy agregar on public.suc_pago_asignacion for insert to authenticated
  with check ((select public.suc_pagos_puede_editar()) and exists (
    select 1 from public.suc_pago_transferencia t
    where t.id = transferencia_id and t.estado in ('cuadra', 'no_cuadra', 'desconocido', 'sin_facturas')));
create policy quitar on public.suc_pago_asignacion for delete to authenticated
  using ((select public.suc_pagos_puede_editar()) and exists (
    select 1 from public.suc_pago_transferencia t
    where t.id = transferencia_id and t.estado in ('cuadra', 'no_cuadra', 'desconocido', 'sin_facturas')));

create policy leer on public.suc_proveedor_clabe for select to authenticated
  using ((select public.suc_pagos_puede_leer()));
create policy agregar on public.suc_proveedor_clabe for insert to authenticated
  with check ((select public.suc_pagos_puede_editar()));
create policy cambiar on public.suc_proveedor_clabe for update to authenticated
  using ((select public.suc_pagos_puede_editar())) with check ((select public.suc_pagos_puede_editar()));

create policy leer on public.suc_pago_config for select to authenticated
  using ((select public.suc_pagos_puede_leer()));

-- 4. RPC: registrar una corrida completa (corrida + transferencias + asignaciones) en una sola transacción.
create function public.suc_pagos_registrar_corrida(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_corrida bigint;
  v_t jsonb;
  v_id bigint;
  v_ruta text;
  v_rutas jsonb := '[]'::jsonb;
begin
  if not public.suc_pagos_puede_editar() then
    raise exception 'Tu acceso a Pagos es de solo lectura.' using errcode = '42501';
  end if;
  insert into public.suc_pago_corrida (archivo, n_resumen, total_resumen, n_recibos, total_recibos, avisos)
  values (p->>'archivo', (p->>'n_resumen')::integer, (p->>'total_resumen')::numeric, (p->>'n_recibos')::integer,
          (p->>'total_recibos')::numeric, coalesce(p->'avisos', '[]'::jsonb))
  returning id into v_corrida;
  for v_t in select value from jsonb_array_elements(coalesce(p->'transferencias', '[]'::jsonb)) loop
    v_ruta := v_corrida || '/' || md5(v_t->>'llave') || '.pdf';
    insert into public.suc_pago_transferencia (corrida_id, llave, tipo, clabe, alias, concepto, monto, fecha_operacion,
      archivo_pdf, proveedor_zoho_id, proveedor_nombre, sugerido, estado)
    values (v_corrida, v_t->>'llave', v_t->>'tipo', nullif(v_t->>'clabe', ''), v_t->>'alias',
      coalesce(v_t->>'concepto', ''), (v_t->>'monto')::numeric, (v_t->>'fecha_operacion')::date, v_ruta,
      v_t->>'proveedor_zoho_id', v_t->>'proveedor_nombre', coalesce((v_t->>'sugerido')::boolean, false), v_t->>'estado')
    returning id into v_id;
    insert into public.suc_pago_asignacion (transferencia_id, bill_id, bill_numero, ubicacion, fecha, saldo, monto)
    select v_id, a->>'bill_id', a->>'bill_numero', coalesce(a->>'ubicacion', ''), nullif(a->>'fecha', '')::date,
           (a->>'saldo')::numeric, (a->>'monto')::numeric
    from jsonb_array_elements(coalesce(v_t->'asignaciones', '[]'::jsonb)) a;
    v_rutas := v_rutas || jsonb_build_array(jsonb_build_object('llave', v_t->>'llave', 'ruta', v_ruta));
  end loop;
  return jsonb_build_object('corrida_id', v_corrida, 'rutas', v_rutas);
end $$;

-- 5. RPC: cambiar proveedor/asignaciones de una transferencia que todavía no se aplica.
create function public.suc_pagos_reemplazar_asignaciones(p_id bigint, p_estado text, p_proveedor_id text,
  p_proveedor_nombre text, p_sugerido boolean, p_asig jsonb) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if not public.suc_pagos_puede_editar() then
    raise exception 'Tu acceso a Pagos es de solo lectura.' using errcode = '42501';
  end if;
  if p_estado not in ('cuadra', 'no_cuadra', 'sin_facturas') then
    raise exception 'Estado no válido: %', p_estado;
  end if;
  update public.suc_pago_transferencia
     set estado = p_estado, proveedor_zoho_id = p_proveedor_id, proveedor_nombre = p_proveedor_nombre,
         sugerido = p_sugerido, error = null, actualizado_en = now()
   where id = p_id and estado in ('cuadra', 'no_cuadra', 'desconocido', 'sin_facturas');
  if not found then
    raise exception 'La transferencia ya no se puede cambiar (¿ya se aplicó?).';
  end if;
  delete from public.suc_pago_asignacion where transferencia_id = p_id;
  insert into public.suc_pago_asignacion (transferencia_id, bill_id, bill_numero, ubicacion, fecha, saldo, monto)
  select p_id, a->>'bill_id', a->>'bill_numero', coalesce(a->>'ubicacion', ''), nullif(a->>'fecha', '')::date,
         (a->>'saldo')::numeric, (a->>'monto')::numeric
  from jsonb_array_elements(coalesce(p_asig, '[]'::jsonb)) a;
  -- Una transferencia 'cuadra' solo si lo asignado es exactamente su monto.
  if p_estado = 'cuadra' and (
    select coalesce(sum(a.monto), 0) from public.suc_pago_asignacion a where a.transferencia_id = p_id
  ) <> (select t.monto from public.suc_pago_transferencia t where t.id = p_id) then
    raise exception 'Lo asignado no es igual a la transferencia.';
  end if;
end $$;

revoke all on function public.suc_pagos_registrar_corrida(jsonb),
  public.suc_pagos_reemplazar_asignaciones(bigint, text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.suc_pagos_registrar_corrida(jsonb),
  public.suc_pagos_reemplazar_asignaciones(bigint, text, text, text, boolean, jsonb) to authenticated;

-- 6. Recibos PDF: bucket privado; un objeto solo existe si su transferencia está registrada (la ruta la genera la base).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('suc-pagos-recibos', 'suc-pagos-recibos', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy suc_pagos_recibos_leer on storage.objects for select to authenticated
  using (bucket_id = 'suc-pagos-recibos' and (select public.suc_pagos_puede_leer())
    and exists (select 1 from public.suc_pago_transferencia t where t.archivo_pdf = name));
create policy suc_pagos_recibos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'suc-pagos-recibos' and (select public.suc_pagos_puede_editar())
    and exists (select 1 from public.suc_pago_transferencia t
                where t.archivo_pdf = name and t.estado in ('cuadra', 'no_cuadra', 'desconocido', 'sin_facturas')));
