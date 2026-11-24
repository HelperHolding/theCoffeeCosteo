-- Menú/Carta de Rappi (docs/rappi-portal/09): productos y modificadores de cada tienda, encendidos o apagados, leídos
-- del portal de Partners cada 30 min por el mismo lector (solo el GET del menú; nunca los botones de encender, apagar,
-- publicar o borrar). Columnas acordadas con «Módulo Sucursales», que hace las lecturas (migración 94) y la pantalla.
-- Los escribe n8n con la llave de servicio por rappi_importar_menu; las tablas quedan cerradas para anon y authenticated.
-- Rappi no dice desde cuándo ni quién apagó algo: la historia son los tramos que se arman con cada foto.

-- 1. Productos vigentes por tienda. `disponible` = available Y active_state (el «apagado» del portal); `activo` =
--    active (en false es inactivo o eliminado, no el apagado del día). `sin_opcion_obligatoria`: grupos con mínimo ≥ 1
--    donde ninguna opción está disponible (el producto aparece pero no se puede pedir). Lo que deja de venir en el menú
--    se marca con `eliminado_en`.
create table public.rappi_menu_productos (
  rappi_tienda_id text not null references public.rappi_tiendas (rappi_tienda_id),
  producto_id bigint not null,
  nombre text not null,
  nombre_norm text not null,
  categoria_id bigint,
  categoria text,
  categoria_activa boolean not null default true,
  precio numeric(12, 2),
  precio_anterior numeric(12, 2),
  disponible boolean not null,
  activo boolean not null default true,
  tiene_foto boolean not null default false,
  tiene_descripcion boolean not null default false,
  sku text,
  combo boolean not null default false,
  indice integer,
  sin_opcion_obligatoria text[] not null default '{}',
  visto_en timestamptz not null,
  eliminado_en timestamptz,
  primary key (rappi_tienda_id, producto_id)
);
create index rappi_menu_productos_nombre on public.rappi_menu_productos (nombre_norm);

-- 2. Modificadores (toppings) vigentes por tienda: una vez por tienda aunque se repitan en varios productos.
create table public.rappi_menu_toppings (
  rappi_tienda_id text not null references public.rappi_tiendas (rappi_tienda_id),
  topping_id bigint not null,
  nombre text not null,
  nombre_norm text not null,
  grupo_id bigint,
  grupo text,
  grupo_minimo integer,
  grupo_maximo integer,
  precio numeric(12, 2),
  disponible boolean not null,
  activo boolean not null default true,
  productos bigint[] not null default '{}',
  visto_en timestamptz not null,
  eliminado_en timestamptz,
  primary key (rappi_tienda_id, topping_id)
);
create index rappi_menu_toppings_nombre on public.rappi_menu_toppings (nombre_norm);

-- 3. Tramos de disponibilidad (como rappi_conectividad): `desde` = primera foto con ese estado, `visto` = última que
--    lo confirmó, `hasta` = primera foto con otro estado o en la que el producto ya no estaba (null mientras sigue).
create table public.rappi_menu_tramos (
  id bigint generated always as identity primary key,
  rappi_tienda_id text not null references public.rappi_tiendas (rappi_tienda_id),
  tipo text not null check (tipo in ('producto', 'topping')),
  item_id bigint not null,
  disponible boolean not null,
  desde timestamptz not null,
  visto timestamptz not null,
  hasta timestamptz,
  check (visto >= desde and (hasta is null or hasta >= visto))
);
create unique index rappi_menu_tramos_vigente on public.rappi_menu_tramos (rappi_tienda_id, tipo, item_id)
  where hasta is null;
create index rappi_menu_tramos_tienda_desde on public.rappi_menu_tramos (rappi_tienda_id, desde);

-- 4. Cada lectura del menú: para «última lectura hace X min» y para saber si vino completa.
create table public.rappi_menu_corridas (
  id bigint generated always as identity primary key,
  inicio timestamptz not null,
  fin timestamptz not null default now(),
  tiendas integer not null default 0,
  leidas integer not null default 0,
  fallidas integer not null default 0,
  completa boolean not null default false,
  detalle jsonb
);
create index rappi_menu_corridas_inicio on public.rappi_menu_corridas (inicio desc);

do $$
declare t text;
begin
  foreach t in array array['rappi_menu_productos', 'rappi_menu_toppings', 'rappi_menu_tramos', 'rappi_menu_corridas']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- 5. Importación de una lectura (solo service_role, desde n8n). Por conjuntos: ~17 mil renglones cada 30 min.
--    Formato: { momento, tiendas: [{ tienda, productos: [...], toppings: [...] }], fallidas: [{ tienda, motivo }] }.
--    Solo cambia las tiendas que vinieron bien: una tienda que falló conserva su último estado (y sus tramos siguen
--    abiertos con su último `visto`). Una tienda sin alta en rappi_tiendas se ignora y se reporta. Una foto más vieja
--    que la última guardada de esa tienda se ignora.
create function public.rappi_importar_menu(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_momento timestamptz := coalesce((p->>'momento')::timestamptz, now());
  v_enviadas text[];
  v_leidas text[];
  v_ignoradas text[];
  v_viejas text[];
  v_fallidas integer := coalesce(jsonb_array_length(p->'fallidas'), 0);
  v_productos integer := 0;
  v_toppings integer := 0;
  v_eliminados integer := 0;
  v_abiertos integer := 0;
  v_cerrados integer := 0;
  v_n integer;
begin
  -- Las corridas que no leen el menú (3 de cada 6) mandan {"p": null}: no son una lectura, no se registran.
  if p is null or jsonb_typeof(p) <> 'object'
     or (coalesce(jsonb_array_length(p->'tiendas'), 0) = 0 and coalesce(jsonb_array_length(p->'fallidas'), 0) = 0) then
    return jsonb_build_object('sin_menu', true);
  end if;
  v_enviadas := array(select distinct x->>'tienda' from jsonb_array_elements(coalesce(p->'tiendas', '[]')) x);
  v_ignoradas := array(select t from unnest(v_enviadas) t
    where not exists (select 1 from public.rappi_tiendas r where r.rappi_tienda_id = t));
  v_viejas := array(select t from unnest(v_enviadas) t
    where exists (select 1 from public.rappi_menu_productos m where m.rappi_tienda_id = t and m.visto_en >= v_momento));
  v_leidas := array(select t from unnest(v_enviadas) t where t <> all (v_ignoradas) and t <> all (v_viejas));

  -- Productos vigentes.
  insert into public.rappi_menu_productos as m (rappi_tienda_id, producto_id, nombre, nombre_norm, categoria_id,
    categoria, categoria_activa, precio, precio_anterior, disponible, activo, tiene_foto, tiene_descripcion, sku, combo,
    indice, sin_opcion_obligatoria, visto_en, eliminado_en)
  select distinct on (x->>'tienda', y.producto_id) x->>'tienda', y.producto_id, coalesce(y.nombre, ''),
    coalesce(y.nombre_norm, ''), y.categoria_id, y.categoria, coalesce(y.categoria_activa, true), y.precio,
    y.precio_anterior, coalesce(y.disponible, false), coalesce(y.activo, true), coalesce(y.tiene_foto, false),
    coalesce(y.tiene_descripcion, false), y.sku, coalesce(y.combo, false), y.indice,
    coalesce(y.sin_opcion_obligatoria, '{}'), v_momento, null
  from jsonb_array_elements(coalesce(p->'tiendas', '[]')) x,
    jsonb_to_recordset(coalesce(x->'productos', '[]')) as y(producto_id bigint, nombre text, nombre_norm text,
      categoria_id bigint, categoria text, categoria_activa boolean, precio numeric, precio_anterior numeric,
      disponible boolean, activo boolean, tiene_foto boolean, tiene_descripcion boolean, sku text, combo boolean,
      indice integer, sin_opcion_obligatoria text[])
  where x->>'tienda' = any (v_leidas) and y.producto_id is not null
  order by x->>'tienda', y.producto_id
  on conflict (rappi_tienda_id, producto_id) do update set nombre = excluded.nombre,
    nombre_norm = excluded.nombre_norm, categoria_id = excluded.categoria_id, categoria = excluded.categoria,
    categoria_activa = excluded.categoria_activa, precio = excluded.precio, precio_anterior = excluded.precio_anterior,
    disponible = excluded.disponible, activo = excluded.activo, tiene_foto = excluded.tiene_foto,
    tiene_descripcion = excluded.tiene_descripcion, sku = excluded.sku, combo = excluded.combo,
    indice = excluded.indice, sin_opcion_obligatoria = excluded.sin_opcion_obligatoria, visto_en = excluded.visto_en,
    eliminado_en = null;
  get diagnostics v_productos = row_count;

  -- Toppings vigentes.
  insert into public.rappi_menu_toppings as m (rappi_tienda_id, topping_id, nombre, nombre_norm, grupo_id, grupo,
    grupo_minimo, grupo_maximo, precio, disponible, activo, productos, visto_en, eliminado_en)
  select distinct on (x->>'tienda', y.topping_id) x->>'tienda', y.topping_id, coalesce(y.nombre, ''),
    coalesce(y.nombre_norm, ''), y.grupo_id, y.grupo, y.grupo_minimo, y.grupo_maximo, y.precio,
    coalesce(y.disponible, false), coalesce(y.activo, true), coalesce(y.productos, '{}'), v_momento, null
  from jsonb_array_elements(coalesce(p->'tiendas', '[]')) x,
    jsonb_to_recordset(coalesce(x->'toppings', '[]')) as y(topping_id bigint, nombre text, nombre_norm text,
      grupo_id bigint, grupo text, grupo_minimo integer, grupo_maximo integer, precio numeric, disponible boolean,
      activo boolean, productos bigint[])
  where x->>'tienda' = any (v_leidas) and y.topping_id is not null
  order by x->>'tienda', y.topping_id
  on conflict (rappi_tienda_id, topping_id) do update set nombre = excluded.nombre, nombre_norm = excluded.nombre_norm,
    grupo_id = excluded.grupo_id, grupo = excluded.grupo, grupo_minimo = excluded.grupo_minimo,
    grupo_maximo = excluded.grupo_maximo, precio = excluded.precio, disponible = excluded.disponible,
    activo = excluded.activo, productos = excluded.productos, visto_en = excluded.visto_en, eliminado_en = null;
  get diagnostics v_toppings = row_count;

  -- Lo que ya no vino en el menú de una tienda leída.
  update public.rappi_menu_productos set eliminado_en = v_momento
  where rappi_tienda_id = any (v_leidas) and eliminado_en is null and visto_en < v_momento;
  get diagnostics v_n = row_count;
  v_eliminados := v_n;
  update public.rappi_menu_toppings set eliminado_en = v_momento
  where rappi_tienda_id = any (v_leidas) and eliminado_en is null and visto_en < v_momento;
  get diagnostics v_n = row_count;
  v_eliminados := v_eliminados + v_n;

  -- Tramos: se cierran los que cambiaron de estado o cuyo item desapareció…
  update public.rappi_menu_tramos t set hasta = v_momento
  from public.rappi_menu_productos m
  where t.hasta is null and t.tipo = 'producto' and t.rappi_tienda_id = m.rappi_tienda_id
    and t.item_id = m.producto_id and m.rappi_tienda_id = any (v_leidas)
    and (m.eliminado_en = v_momento or (m.visto_en = v_momento and m.disponible <> t.disponible));
  get diagnostics v_n = row_count;
  v_cerrados := v_n;
  update public.rappi_menu_tramos t set hasta = v_momento
  from public.rappi_menu_toppings m
  where t.hasta is null and t.tipo = 'topping' and t.rappi_tienda_id = m.rappi_tienda_id
    and t.item_id = m.topping_id and m.rappi_tienda_id = any (v_leidas)
    and (m.eliminado_en = v_momento or (m.visto_en = v_momento and m.disponible <> t.disponible));
  get diagnostics v_n = row_count;
  v_cerrados := v_cerrados + v_n;

  -- …se extienden los que siguen igual…
  update public.rappi_menu_tramos t set visto = v_momento
  from public.rappi_menu_productos m
  where t.hasta is null and t.tipo = 'producto' and t.rappi_tienda_id = m.rappi_tienda_id
    and t.item_id = m.producto_id and m.visto_en = v_momento and m.disponible = t.disponible and t.visto < v_momento;
  update public.rappi_menu_tramos t set visto = v_momento
  from public.rappi_menu_toppings m
  where t.hasta is null and t.tipo = 'topping' and t.rappi_tienda_id = m.rappi_tienda_id
    and t.item_id = m.topping_id and m.visto_en = v_momento and m.disponible = t.disponible and t.visto < v_momento;

  -- …y se abren los nuevos (primera foto, cambio de estado o reaparición).
  insert into public.rappi_menu_tramos (rappi_tienda_id, tipo, item_id, disponible, desde, visto)
  select m.rappi_tienda_id, 'producto', m.producto_id, m.disponible, v_momento, v_momento
  from public.rappi_menu_productos m
  where m.rappi_tienda_id = any (v_leidas) and m.visto_en = v_momento
    and not exists (select 1 from public.rappi_menu_tramos t where t.hasta is null and t.tipo = 'producto'
      and t.rappi_tienda_id = m.rappi_tienda_id and t.item_id = m.producto_id);
  get diagnostics v_n = row_count;
  v_abiertos := v_n;
  insert into public.rappi_menu_tramos (rappi_tienda_id, tipo, item_id, disponible, desde, visto)
  select m.rappi_tienda_id, 'topping', m.topping_id, m.disponible, v_momento, v_momento
  from public.rappi_menu_toppings m
  where m.rappi_tienda_id = any (v_leidas) and m.visto_en = v_momento
    and not exists (select 1 from public.rappi_menu_tramos t where t.hasta is null and t.tipo = 'topping'
      and t.rappi_tienda_id = m.rappi_tienda_id and t.item_id = m.topping_id);
  get diagnostics v_n = row_count;
  v_abiertos := v_abiertos + v_n;

  insert into public.rappi_menu_corridas (inicio, fin, tiendas, leidas, fallidas, completa, detalle)
  values (v_momento, now(), coalesce(array_length(v_enviadas, 1), 0) + v_fallidas,
    coalesce(array_length(v_leidas, 1), 0),
    v_fallidas + coalesce(array_length(v_ignoradas, 1), 0) + coalesce(array_length(v_viejas, 1), 0),
    v_fallidas = 0 and coalesce(array_length(v_ignoradas, 1), 0) = 0 and coalesce(array_length(v_viejas, 1), 0) = 0,
    jsonb_build_object('fallidas', coalesce(p->'fallidas', '[]'), 'ignoradas', to_jsonb(v_ignoradas),
      'viejas', to_jsonb(v_viejas)));

  return jsonb_build_object('tiendas', coalesce(array_length(v_leidas, 1), 0), 'productos', v_productos,
    'toppings', v_toppings, 'eliminados', v_eliminados, 'tramos_abiertos', v_abiertos, 'tramos_cerrados', v_cerrados,
    'fallidas', v_fallidas, 'ignoradas', to_jsonb(v_ignoradas), 'viejas', to_jsonb(v_viejas));
end $$;

revoke all on function public.rappi_importar_menu(jsonb) from public, anon, authenticated;
grant execute on function public.rappi_importar_menu(jsonb) to service_role;
