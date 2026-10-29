-- Rappi desde el portal de Partners (docs/rappi-portal/01 y 02). Piloto: Namóra (513), tienda normal y Turbo.
-- Pedidos SIN datos personales (ni nombre ni ID del cliente). Los escribe n8n con la llave de servicio por
-- rappi_importar; el portal los lee por sucursales_rappi_portal, con el mismo acceso que el resto de Sucursales.
-- Las tablas quedan cerradas para anon y authenticated.

-- 1. Tiendas de Rappi por sucursal. Cada sucursal tiene una tienda normal (marca «The Coffee») y una Turbo
--    («The Coffee - Turbo»). Agregar una sucursal es una fila aquí (con evidencia), no un cambio de código.
create table public.rappi_tiendas (
  rappi_tienda_id text primary key check (rappi_tienda_id ~ '^MX[0-9]+$'),
  company_id integer not null check (company_id > 0),
  nombre text not null,
  canal text not null check (canal in ('normal', 'turbo')),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  unique (company_id, canal)
);

-- 2. Cada corrida del cron (también las fallidas: sesión caducada, error, ocupado).
create table public.rappi_corridas (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('vivo', 'cierre', 'repaso', 'manual')),
  inicio timestamptz not null default now(),
  desde date not null,
  hasta date not null,
  estado text not null check (estado in ('ok', 'sin_ordenes', 'error', 'sesion_expirada', 'ocupado')),
  leidos integer not null default 0,
  nuevos integer not null default 0,
  cambiados integer not null default 0,
  desaparecidos integer not null default 0,
  mensaje text,
  check (desde <= hasta)
);

-- 3. Último conteo del portal por tienda y día: total_rows que reporta el listado frente a los pedidos que devuelve
--    (el listado se salta algunos; doc 01 §3).
create table public.rappi_conteos (
  rappi_tienda_id text not null references public.rappi_tiendas,
  fecha date not null,
  total_rows integer not null check (total_rows >= 0),
  devueltos integer not null check (devueltos >= 0),
  corrida_id bigint not null references public.rappi_corridas,
  primary key (rappi_tienda_id, fecha)
);

-- 4. Pedidos. created_at del portal es hora local con etiqueta +00:00: se guarda como hora local, igual que el POS.
create table public.rappi_pedidos (
  rappi_pedido_id bigint primary key check (rappi_pedido_id > 0),
  rappi_tienda_id text not null references public.rappi_tiendas,
  company_id integer not null,
  creado_local timestamp not null,
  fecha_local date generated always as (creado_local::date) stored,
  estado text not null,
  estado_nombre text not null,
  en_disputa boolean not null default false,
  estado_disputa text,
  metodo_pago text,
  prime boolean,
  -- order_product_total_price: suma de productos antes de descuentos.
  bruto numeric(12, 2) not null check (bruto >= 0),
  -- discount_info del detalle; null mientras no se haya leído el detalle.
  descuento_aliado numeric(12, 2),
  descuentos jsonb,
  -- Hash de estado + disputa + bruto + productos: si cambia, el pedido cambió.
  huella text not null,
  estado_anterior text,
  corrida_cambio bigint references public.rappi_corridas,
  corrida_ultima bigint references public.rappi_corridas,
  visto_primero timestamptz not null default now(),
  visto_ultimo timestamptz not null default now(),
  -- Ya no apareció al releer su día: no se borra, se marca para revisión.
  revisar boolean not null default false
);
create index rappi_pedidos_company_fecha on public.rappi_pedidos (company_id, fecha_local);

-- 5. Productos por pedido; se reemplazan completos cuando el pedido cambia. Las opciones (toppings) van como JSON:
--    [{categoria, descripcion, precio, unidades}], en el orden del portal.
create table public.rappi_pedido_productos (
  rappi_pedido_id bigint not null references public.rappi_pedidos on delete cascade,
  linea integer not null check (linea > 0),
  rappi_producto_id text,
  nombre text not null,
  unidades integer not null check (unidades > 0),
  precio numeric(12, 2) not null,
  precio_con_desc_aliado numeric(12, 2),
  descuento_rappi_pct numeric(6, 2),
  opciones jsonb not null default '[]',
  primary key (rappi_pedido_id, linea)
);

-- 6. Bitácora de correcciones: qué cambió de cada pedido y en qué corrida.
create table public.rappi_pedido_cambios (
  id bigint generated always as identity primary key,
  rappi_pedido_id bigint not null references public.rappi_pedidos on delete cascade,
  corrida_id bigint not null references public.rappi_corridas,
  campo text not null,
  antes text,
  despues text,
  en timestamptz not null default now()
);
create index rappi_pedido_cambios_pedido on public.rappi_pedido_cambios (rappi_pedido_id);

do $$
declare t text;
begin
  foreach t in array array['rappi_tiendas', 'rappi_corridas', 'rappi_conteos', 'rappi_pedidos',
                           'rappi_pedido_productos', 'rappi_pedido_cambios'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- 7. Importación de una corrida (solo service_role, desde n8n). Idempotente: upsert por pedido y reemplazo de sus
--    productos; reprocesar el mismo lote no cambia nada. Formato del lote: docs/rappi-portal/02 §5.
create function public.rappi_huella(p jsonb) returns text
language sql immutable set search_path = public, pg_temp as $$
  select md5(jsonb_build_object(
    'estado', p->>'estado',
    'en_disputa', coalesce((p->>'en_disputa')::boolean, false),
    'estado_disputa', coalesce(p->>'estado_disputa', ''),
    'bruto', (p->>'bruto')::numeric,
    'productos', coalesce(p->'productos', '[]'::jsonb))::text)
$$;

create function public.rappi_importar(p_lote jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_corrida bigint;
  v_estado text := coalesce(p_lote->>'estado', 'ok');
  v_desde date := (p_lote->>'desde')::date;
  v_hasta date := (p_lote->>'hasta')::date;
  v_tiendas text[] := array(select jsonb_array_elements(coalesce(p_lote->'tiendas', '[]'))->>'rappi_tienda_id');
  v_ped jsonb;
  v_tienda public.rappi_tiendas;
  v_actual public.rappi_pedidos;
  v_id bigint;
  v_huella text;
  v_ids bigint[] := '{}';
  v_nuevos integer := 0;
  v_cambiados integer := 0;
  v_desaparecidos integer := 0;
  v_cambios jsonb := '[]';
  t jsonb;
  d record;
begin
  if (select count(*) from public.rappi_tiendas where rappi_tienda_id = any(v_tiendas)) <> cardinality(v_tiendas) then
    raise exception 'Tienda de Rappi no registrada en rappi_tiendas: %', v_tiendas;
  end if;
  insert into public.rappi_corridas (tipo, desde, hasta, estado, mensaje)
  values (coalesce(p_lote->>'tipo', 'manual'), v_desde, v_hasta, v_estado, p_lote->>'mensaje')
  returning id into v_corrida;
  -- Una corrida fallida solo deja constancia: no toca pedidos.
  if v_estado not in ('ok', 'sin_ordenes') then
    return jsonb_build_object('corrida_id', v_corrida, 'estado', v_estado);
  end if;

  for t in select * from jsonb_array_elements(coalesce(p_lote->'tiendas', '[]')) loop
    for d in select key::date fecha, value from jsonb_each(coalesce(t->'por_dia', '{}')) loop
      insert into public.rappi_conteos (rappi_tienda_id, fecha, total_rows, devueltos, corrida_id)
      values (t->>'rappi_tienda_id', d.fecha, (d.value->>'total_rows')::integer, (d.value->>'devueltos')::integer,
              v_corrida)
      on conflict (rappi_tienda_id, fecha) do update
        set total_rows = excluded.total_rows, devueltos = excluded.devueltos, corrida_id = excluded.corrida_id;
    end loop;
  end loop;

  for v_ped in select * from jsonb_array_elements(coalesce(p_lote->'pedidos', '[]')) loop
    select * into v_tienda from public.rappi_tiendas where rappi_tienda_id = v_ped->>'tienda';
    if not found or not (v_tienda.rappi_tienda_id = any(v_tiendas)) then
      raise exception 'Pedido % de una tienda fuera del lote: %', v_ped->>'id', v_ped->>'tienda';
    end if;
    v_id := (v_ped->>'id')::bigint;
    v_ids := v_ids || v_id;
    v_huella := public.rappi_huella(v_ped);
    select * into v_actual from public.rappi_pedidos where rappi_pedido_id = v_id;
    if not found then
      insert into public.rappi_pedidos (rappi_pedido_id, rappi_tienda_id, company_id, creado_local, estado,
        estado_nombre, en_disputa, estado_disputa, metodo_pago, prime, bruto, descuento_aliado, descuentos, huella,
        corrida_ultima)
      values (v_id, v_tienda.rappi_tienda_id, v_tienda.company_id, (v_ped->>'creado')::timestamp, v_ped->>'estado',
        v_ped->>'estado_nombre', coalesce((v_ped->>'en_disputa')::boolean, false),
        nullif(v_ped->>'estado_disputa', ''), v_ped->>'metodo_pago', (v_ped->>'prime')::boolean,
        (v_ped->>'bruto')::numeric, (v_ped->>'descuento_aliado')::numeric, v_ped->'descuentos', v_huella, v_corrida);
      v_nuevos := v_nuevos + 1;
    elsif v_actual.huella <> v_huella then
      insert into public.rappi_pedido_cambios (rappi_pedido_id, corrida_id, campo, antes, despues)
      select v_id, v_corrida, c.campo, c.antes, c.despues
      from (values
        ('estado', v_actual.estado, v_ped->>'estado'),
        ('en_disputa', v_actual.en_disputa::text, coalesce((v_ped->>'en_disputa')::boolean, false)::text),
        ('estado_disputa', coalesce(v_actual.estado_disputa, ''), coalesce(v_ped->>'estado_disputa', '')),
        ('bruto', v_actual.bruto::text, ((v_ped->>'bruto')::numeric(12, 2))::text)) c(campo, antes, despues)
      where c.antes is distinct from c.despues;
      if not exists (select 1 from public.rappi_pedido_cambios where rappi_pedido_id = v_id and corrida_id = v_corrida)
      then
        insert into public.rappi_pedido_cambios (rappi_pedido_id, corrida_id, campo, antes, despues)
        values (v_id, v_corrida, 'productos', null, null);
      end if;
      update public.rappi_pedidos set
        estado = v_ped->>'estado', estado_nombre = v_ped->>'estado_nombre',
        en_disputa = coalesce((v_ped->>'en_disputa')::boolean, false),
        estado_disputa = nullif(v_ped->>'estado_disputa', ''), metodo_pago = v_ped->>'metodo_pago',
        prime = (v_ped->>'prime')::boolean, bruto = (v_ped->>'bruto')::numeric,
        descuento_aliado = coalesce((v_ped->>'descuento_aliado')::numeric, descuento_aliado),
        descuentos = coalesce(v_ped->'descuentos', descuentos), huella = v_huella,
        estado_anterior = case when estado <> v_ped->>'estado' then estado else estado_anterior end,
        corrida_cambio = v_corrida, corrida_ultima = v_corrida, visto_ultimo = now(), revisar = false
      where rappi_pedido_id = v_id;
      delete from public.rappi_pedido_productos where rappi_pedido_id = v_id;
      v_cambiados := v_cambiados + 1;
      v_cambios := v_cambios || jsonb_build_object('id', v_id, 'de', v_actual.estado, 'a', v_ped->>'estado',
        'fecha', v_actual.fecha_local);
    else
      update public.rappi_pedidos set
        descuento_aliado = coalesce((v_ped->>'descuento_aliado')::numeric, descuento_aliado),
        descuentos = coalesce(v_ped->'descuentos', descuentos),
        corrida_ultima = v_corrida, visto_ultimo = now(), revisar = false
      where rappi_pedido_id = v_id;
      continue;
    end if;
    insert into public.rappi_pedido_productos (rappi_pedido_id, linea, rappi_producto_id, nombre, unidades, precio,
      precio_con_desc_aliado, descuento_rappi_pct, opciones)
    select v_id, (p->>'linea')::integer, p->>'rappi_producto_id', p->>'nombre', (p->>'unidades')::integer,
      (p->>'precio')::numeric, (p->>'precio_con_desc_aliado')::numeric, (p->>'descuento_rappi_pct')::numeric,
      coalesce(p->'opciones', '[]')
    from jsonb_array_elements(coalesce(v_ped->'productos', '[]')) p;
  end loop;

  -- Pedidos guardados de la ventana que ya no aparecen: se marcan, nunca se borran.
  with marcados as (
    update public.rappi_pedidos set revisar = true
    where rappi_tienda_id = any(v_tiendas) and fecha_local between v_desde and v_hasta
      and not (rappi_pedido_id = any(v_ids)) and not revisar
    returning 1)
  select count(*) into v_desaparecidos from marcados;

  update public.rappi_corridas set leidos = cardinality(v_ids), nuevos = v_nuevos, cambiados = v_cambiados,
    desaparecidos = v_desaparecidos
  where id = v_corrida;
  return jsonb_build_object('corrida_id', v_corrida, 'estado', v_estado, 'leidos', cardinality(v_ids),
    'nuevos', v_nuevos, 'cambiados', v_cambiados, 'desaparecidos', v_desaparecidos, 'cambios', v_cambios);
end $$;

-- 8. Lectura para la pestaña Rappi de una sucursal (hasta 62 días). Sin acceso a la sucursal devuelve null.
create function public.sucursales_rappi_portal(p_company integer, p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.sucursales_acceso(p_company) then
    return null;
  end if;
  if p_desde > p_hasta or p_hasta - p_desde > 61 then
    raise exception 'Periodo inválido (máximo 62 días).';
  end if;
  return jsonb_build_object(
    'tiendas', coalesce((select jsonb_agg(jsonb_build_object('id', rappi_tienda_id, 'nombre', nombre, 'canal', canal)
      order by canal) from public.rappi_tiendas where company_id = p_company and activa), '[]'),
    'ultima_corrida', (select jsonb_build_object('inicio', c.inicio, 'tipo', c.tipo, 'estado', c.estado,
        'mensaje', c.mensaje)
      from public.rappi_corridas c order by c.id desc limit 1),
    'ultima_ok', (select max(c.inicio) from public.rappi_corridas c where c.estado in ('ok', 'sin_ordenes')),
    'conteos', coalesce((select jsonb_agg(jsonb_build_object('tienda', n.rappi_tienda_id, 'fecha', n.fecha,
        'total_rows', n.total_rows, 'devueltos', n.devueltos) order by n.fecha, n.rappi_tienda_id)
      from public.rappi_conteos n join public.rappi_tiendas t using (rappi_tienda_id)
      where t.company_id = p_company and n.fecha between p_desde and p_hasta), '[]'),
    'pedidos', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.rappi_pedido_id::text, 'tienda', p.rappi_tienda_id, 'creado', p.creado_local, 'fecha', p.fecha_local,
        'estado', p.estado, 'estado_nombre', p.estado_nombre, 'en_disputa', p.en_disputa,
        'estado_disputa', p.estado_disputa, 'metodo_pago', p.metodo_pago, 'bruto', p.bruto,
        'descuento_aliado', p.descuento_aliado, 'estado_anterior', p.estado_anterior, 'revisar', p.revisar,
        'cambios', (select count(*) from public.rappi_pedido_cambios c where c.rappi_pedido_id = p.rappi_pedido_id),
        'productos', coalesce((select jsonb_agg(jsonb_build_object('nombre', x.nombre, 'unidades', x.unidades,
            'precio', x.precio, 'opciones', x.opciones) order by x.linea)
          from public.rappi_pedido_productos x where x.rappi_pedido_id = p.rappi_pedido_id), '[]'))
        order by p.creado_local desc)
      from public.rappi_pedidos p
      where p.company_id = p_company and p.fecha_local between p_desde and p_hasta), '[]'));
end $$;

revoke all on function public.rappi_huella(jsonb), public.rappi_importar(jsonb) from public, anon, authenticated;
grant execute on function public.rappi_huella(jsonb), public.rappi_importar(jsonb) to service_role;
revoke all on function public.sucursales_rappi_portal(integer, date, date) from public, anon;
grant execute on function public.sucursales_rappi_portal(integer, date, date) to authenticated;

-- 9. Piloto: Namóra (company_id 513). IDs leídos del portal el 2026-10-29 (doc 01).
insert into public.rappi_tiendas (rappi_tienda_id, company_id, nombre, canal) values
  ('MX1930270777', 513, 'The Coffee Namóra', 'normal'),
  ('MX1930301156', 513, 'The Coffee Namóra - Turbo', 'turbo');
