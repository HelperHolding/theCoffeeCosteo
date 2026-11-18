-- OVs desde los pedidos (plan 4, decisión 1). Sustituye a _comSyncPedidoPagado, _comSyncPedidoEnviado y
-- _comLiberarComprometido del HTML viejo: el portal deriva las filas com_movimientos tipo 'venta' de los pedidos
-- que lee por el puente (com_legado_*), con el mapeo del portal (com_sku_mapping).
-- Reglas (las del viejo, salvo lo marcado):
--   * Entran los pedidos con apertura_id y status pagado/empacado (por_enviar), enviado/entregado/terminado (enviado)
--     o cancelado (cancelado). 'empacado' es nuevo: en el viejo un pedido pasaba por 'pagado' antes de empacarse.
--   * Folio = shopify_order_number o 'PED-' + los últimos 6 caracteres del id. Renglones = items_editados si no es
--     null, si no items; cada artículo con nombre y (sku o mapeo exacto por nombre) da una fila; cantidad = it.cantidad||1.
--   * Un folio sin filas venta se inserta (por_enviar o enviado) si el pedido es de los últimos p_ventana_dias días.
--   * Un folio con filas solo avanza: por_enviar → enviado → cancelado. Nunca regresa (respeta "Marcar enviado"
--     del portal); un cancelado que vuelve a pagado se reporta como 'reabierto' y no se toca.
--   * Dos pedidos con el mismo folio se reportan como 'ambiguo' y no se tocan.
-- Las funciones son security invoker y nadie más que postgres/service_role las ejecuta: leen pedidos del puente.

create function public.com_ov_cantidad(v jsonb) returns numeric
language sql immutable set search_path = '' as $$
  -- Number(it.cantidad || 1) de JS: falsy → 1; texto numérico → número; texto vacío de espacios → 0; otro → null.
  select case
    when v is null or v in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb) then 1::numeric
    when v = 'true'::jsonb then 1::numeric
    when pg_catalog.jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
    when pg_catalog.jsonb_typeof(v) = 'string' and pg_catalog.btrim(v #>> '{}') = '' then 0::numeric
    when pg_catalog.jsonb_typeof(v) = 'string'
         and pg_catalog.btrim(v #>> '{}') ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?$'
      then pg_catalog.btrim(v #>> '{}')::numeric
    else null
  end
$$;

create function public.com_ov_plan(p_existentes jsonb, p_ventana_dias integer default 45)
returns table (accion text, folio text, sku text, cantidad numeric, estado_antes text, estado text,
               movimiento_id text, pedido_id uuid, renglon bigint, sucursal text, fecha date)
language sql stable set search_path = '' as $$
  with ped as (
    select p.id, p.fecha_pedido,
           coalesce(nullif(p.shopify_order_number, ''), 'PED-' || right(p.id::text, 6)) as folio,
           coalesce(a.sucursal, '') as sucursal,
           case when p.items_editados is not null and pg_catalog.jsonb_typeof(p.items_editados) <> 'null'
                then p.items_editados else p.items end as items,
           case when p.status in ('pagado', 'empacado') then 'por_enviar'
                when p.status in ('enviado', 'entregado', 'terminado') then 'enviado'
                else 'cancelado' end as estado
    from public.com_legado_pedidos p
    left join public.com_legado_aperturas a on a.id = p.apertura_id
    where coalesce(p.apertura_id, '') <> ''
      and p.status in ('pagado', 'empacado', 'enviado', 'entregado', 'terminado', 'cancelado')),
  folios as (
    select f.folio, count(*) as n
    from ped f group by f.folio),
  unicos as (
    select p.* from ped p join folios f on f.folio = p.folio and f.n = 1),
  ex as (
    select e ->> 'id' as id, e ->> 'folio' as folio, e ->> 'estado' as estado
    from pg_catalog.jsonb_array_elements(coalesce(p_existentes, '[]'::jsonb)) e
    where coalesce(e ->> 'folio', '') <> ''),
  rango(estado, r) as (values ('por_enviar', 1), ('enviado', 2), ('cancelado', 3)),
  renglones as (
    select u.id, u.folio, u.sucursal, u.estado, u.fecha_pedido, it.n,
           coalesce(nullif(it.v ->> 'sku', ''), m.sku) as sku,
           public.com_ov_cantidad(it.v -> 'cantidad') as cantidad
    from unicos u
    cross join lateral pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(u.items) = 'array' then u.items else '[]'::jsonb end) with ordinality it(v, n)
    left join public.com_sku_mapping m on m.shopify_nombre = it.v ->> 'nombre'
    where coalesce(it.v ->> 'nombre', '') <> ''
      and coalesce(nullif(it.v ->> 'sku', ''), m.sku) is not null)
  select 'insertar', r.folio, r.sku, r.cantidad, null::text, r.estado, null::text, r.id, r.n, r.sucursal,
         coalesce((r.fecha_pedido at time zone 'UTC')::date, (now() at time zone 'UTC')::date)
  from renglones r
  where r.estado in ('por_enviar', 'enviado')
    and (r.fecha_pedido is null or r.fecha_pedido >= now() - pg_catalog.make_interval(days => p_ventana_dias))
    and not exists (select 1 from ex where ex.folio = r.folio)
  union all
  select 'avanzar', x.folio, null, null, x.estado, u.estado, x.id, u.id, null, null, null
  from ex x
  join unicos u on u.folio = x.folio
  join rango ra on ra.estado = x.estado
  join rango rb on rb.estado = u.estado
  where rb.r > ra.r
  union all
  select 'reabierto', u.folio, null, null, 'cancelado', u.estado, null, u.id, null, null, null
  from unicos u
  where u.estado <> 'cancelado'
    and exists (select 1 from ex where ex.folio = u.folio and ex.estado = 'cancelado')
  union all
  select 'ambiguo', f.folio, null, null, null, null, null, null, null, null, null
  from folios f where f.n > 1
$$;

create function public.com_derivar_ov(p_aplicar boolean default false, p_ventana_dias integer default 45)
returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_log bigint;
  v_res jsonb;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('com-ov-pedidos')) then
    return pg_catalog.jsonb_build_object('ok', true, 'omitida', 'otra corrida en curso');
  end if;
  insert into public.com_sync_log (proceso) values ('com-ov-pedidos') returning id into v_log;
  begin
    with plan as materialized (
      select * from public.com_ov_plan(
        (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', m.id, 'folio', m.folio, 'estado', m.estado)), '[]'::jsonb)
         from public.com_movimientos m where m.tipo = 'venta' and m.folio is not null),
        p_ventana_dias)),
    ins as (
      insert into public.com_movimientos
        (tipo, folio, sku, cantidad, cantidad_original, sucursal, fecha_envio, fecha, estado, realizado_por)
      select 'venta', p.folio, p.sku, p.cantidad, p.cantidad, p.sucursal, p.fecha, p.fecha, p.estado, 'com-ov-pedidos'
      from plan p where p_aplicar and p.accion = 'insertar'
      order by p.folio, p.renglon
      returning 1),
    upd as (
      update public.com_movimientos m set estado = p.estado
      from plan p
      where p_aplicar and p.accion = 'avanzar' and m.id = p.movimiento_id and m.estado = p.estado_antes
      returning 1)
    select pg_catalog.jsonb_build_object(
      'ok', true,
      'modo', case when p_aplicar then 'aplicar' else 'registrar' end,
      'insertar', (select count(*) from plan where accion = 'insertar'),
      'folios_insertar', (select count(distinct folio) from plan where accion = 'insertar'),
      'avanzar', (select count(*) from plan where accion = 'avanzar'),
      'insertadas', (select count(*) from ins),
      'avanzadas', (select count(*) from upd),
      'reabiertos', coalesce((select pg_catalog.jsonb_agg(distinct folio) from plan where accion = 'reabierto'), '[]'::jsonb),
      'ambiguos', coalesce((select pg_catalog.jsonb_agg(distinct folio) from plan where accion = 'ambiguo'), '[]'::jsonb),
      'muestra', coalesce((select pg_catalog.jsonb_agg(x) from (
          select pg_catalog.jsonb_build_object('accion', accion, 'folio', folio, 'sku', sku, 'estado', estado) x
          from plan where accion in ('insertar', 'avanzar') order by folio, sku limit 20) s), '[]'::jsonb))
    into v_res;
    update public.com_sync_log set fin = now(), ok = true, resumen = v_res where id = v_log;
    return v_res;
  exception when others then
    update public.com_sync_log set fin = now(), ok = false, error = sqlerrm where id = v_log;
    return pg_catalog.jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
end $$;

revoke execute on function public.com_ov_cantidad(jsonb) from public, anon, authenticated;
revoke execute on function public.com_ov_plan(jsonb, integer) from public, anon, authenticated;
revoke execute on function public.com_derivar_ov(boolean, integer) from public, anon, authenticated;
grant execute on function public.com_ov_cantidad(jsonb), public.com_ov_plan(jsonb, integer),
  public.com_derivar_ov(boolean, integer) to service_role;

-- Job creado INACTIVO, como los de la migración 47: se activa en el cutover (plan 4, Tarea 9).
do $$
declare
  j record;
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    perform cron.schedule('com-ov-pedidos', '10,40 * * * *', $c$ select public.com_derivar_ov(true) $c$);
    for j in select jobid from cron.job where jobname = 'com-ov-pedidos' loop
      perform cron.alter_job(j.jobid, active := false);
    end loop;
  end if;
end $$;
