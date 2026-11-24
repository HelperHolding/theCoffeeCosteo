-- Migración 94 (docs/rappi-portal/09): lectura del Menú/Carta de Rappi para Sucursales, sobre las tablas de la 93
-- (lector de n8n). Mismo candado que el resto de Sucursales: sin sucursales_acceso devuelve null; la nacional filtra.
-- Las tablas siguen cerradas (RLS sin políticas); estas funciones son la única puerta para el portal.

-- Desde cuándo está cada artículo en su estado actual: el tramo abierto (hasta is null).
create function public.sucursales_menu_rappi(p_company integer) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.sucursales_acceso(p_company) then
    return null;
  end if;
  return jsonb_build_object(
    'tiendas', coalesce((select jsonb_agg(jsonb_build_object('id', rappi_tienda_id, 'nombre', nombre, 'canal', canal)
      order by canal) from public.rappi_tiendas where company_id = p_company and activa), '[]'),
    'productos', coalesce((select jsonb_agg(jsonb_build_object(
        'tienda', p.rappi_tienda_id, 'id', p.producto_id::text, 'nombre', p.nombre, 'nombre_norm', p.nombre_norm,
        'categoria', p.categoria, 'categoria_activa', p.categoria_activa, 'precio', p.precio,
        'precio_anterior', p.precio_anterior, 'disponible', p.disponible, 'activo', p.activo,
        'tiene_foto', p.tiene_foto, 'tiene_descripcion', p.tiene_descripcion,
        'sin_opcion_obligatoria', p.sin_opcion_obligatoria, 'desde', m.desde)
        order by p.rappi_tienda_id, p.indice)
      from public.rappi_menu_productos p
      join public.rappi_tiendas t using (rappi_tienda_id)
      left join public.rappi_menu_tramos m on m.rappi_tienda_id = p.rappi_tienda_id and m.tipo = 'producto'
        and m.item_id = p.producto_id and m.hasta is null
      where t.company_id = p_company and t.activa and p.eliminado_en is null), '[]'),
    'toppings', coalesce((select jsonb_agg(jsonb_build_object(
        'tienda', x.rappi_tienda_id, 'id', x.topping_id::text, 'nombre', x.nombre, 'nombre_norm', x.nombre_norm,
        'grupo', x.grupo, 'grupo_minimo', x.grupo_minimo, 'precio', x.precio, 'disponible', x.disponible,
        'activo', x.activo, 'productos', coalesce(cardinality(x.productos), 0), 'desde', m.desde)
        order by x.rappi_tienda_id, x.grupo, x.nombre)
      from public.rappi_menu_toppings x
      join public.rappi_tiendas t using (rappi_tienda_id)
      left join public.rappi_menu_tramos m on m.rappi_tienda_id = x.rappi_tienda_id and m.tipo = 'topping'
        and m.item_id = x.topping_id and m.hasta is null
      where t.company_id = p_company and t.activa and x.eliminado_en is null), '[]'),
    'primera_lectura', (select min(m.desde) from public.rappi_menu_tramos m
      join public.rappi_tiendas t using (rappi_tienda_id) where t.company_id = p_company),
    'corrida', (select jsonb_build_object('inicio', c.inicio, 'fin', c.fin, 'tiendas', c.tiendas, 'leidas', c.leidas,
        'fallidas', c.fallidas, 'completa', c.completa, 'detalle', c.detalle)
      from public.rappi_menu_corridas c where c.fin is not null order by c.fin desc limit 1),
    'cambios', coalesce((select jsonb_agg(jsonb_build_object('tienda', m.rappi_tienda_id, 'tipo', m.tipo,
        'item_id', m.item_id::text, 'disponible', m.disponible, 'desde', m.desde, 'hasta', m.hasta) order by m.desde desc)
      from public.rappi_menu_tramos m join public.rappi_tiendas t using (rappi_tienda_id)
      where t.company_id = p_company and m.desde >= now() - interval '7 days'), '[]'));
end $$;

-- Tablero de México: sumas por tienda, la lista de apagados, los que no se pueden pedir y en cuántas tiendas existe cada
-- producto (para «apagado en N sucursales» y la alerta de abasto). Nunca el menú completo.
create function public.sucursales_menu_nacional(p_companias integer[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_permitidas integer[];
begin
  v_permitidas := array(select c from unnest(coalesce(p_companias, '{}')) c where public.sucursales_acceso(c));
  return jsonb_build_object(
    'tiendas', coalesce((select jsonb_agg(jsonb_build_object('id', rappi_tienda_id, 'company_id', company_id,
        'nombre', nombre, 'canal', canal) order by company_id, canal)
      from public.rappi_tiendas where company_id = any (v_permitidas) and activa), '[]'),
    'por_tienda', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select t.rappi_tienda_id as tienda,
        (select count(*) from public.rappi_menu_productos p where p.rappi_tienda_id = t.rappi_tienda_id
          and p.activo and p.eliminado_en is null) as productos,
        (select count(*) from public.rappi_menu_productos p where p.rappi_tienda_id = t.rappi_tienda_id
          and p.activo and p.eliminado_en is null and not p.disponible) as apagados,
        (select count(*) from public.rappi_menu_toppings x where x.rappi_tienda_id = t.rappi_tienda_id
          and x.activo and x.eliminado_en is null) as toppings,
        (select count(*) from public.rappi_menu_toppings x where x.rappi_tienda_id = t.rappi_tienda_id
          and x.activo and x.eliminado_en is null and not x.disponible) as toppings_apagados,
        (select count(*) from public.rappi_menu_productos p where p.rappi_tienda_id = t.rappi_tienda_id
          and p.activo and p.eliminado_en is null and p.disponible
          and coalesce(cardinality(p.sin_opcion_obligatoria), 0) > 0) as sin_opcion,
        (select count(*) from public.rappi_menu_productos p where p.rappi_tienda_id = t.rappi_tienda_id
          and p.activo and p.eliminado_en is null and not p.tiene_foto) as sin_foto,
        (select count(*) from public.rappi_menu_productos p where p.rappi_tienda_id = t.rappi_tienda_id
          and p.activo and p.eliminado_en is null and not p.tiene_descripcion) as sin_descripcion
      from public.rappi_tiendas t
      where t.company_id = any (v_permitidas) and t.activa
        and exists (select 1 from public.rappi_menu_productos p where p.rappi_tienda_id = t.rappi_tienda_id)) x), '[]'),
    'apagados', coalesce((select jsonb_agg(to_jsonb(a)) from (
      select p.rappi_tienda_id as tienda, 'producto' as tipo, p.producto_id::text as id, p.nombre, p.nombre_norm,
        p.categoria, m.desde
      from public.rappi_menu_productos p join public.rappi_tiendas t using (rappi_tienda_id)
      left join public.rappi_menu_tramos m on m.rappi_tienda_id = p.rappi_tienda_id and m.tipo = 'producto'
        and m.item_id = p.producto_id and m.hasta is null
      where t.company_id = any (v_permitidas) and t.activa and p.activo and p.eliminado_en is null and not p.disponible
      union all
      select x.rappi_tienda_id, 'topping', x.topping_id::text, x.nombre, x.nombre_norm, x.grupo, m.desde
      from public.rappi_menu_toppings x join public.rappi_tiendas t using (rappi_tienda_id)
      left join public.rappi_menu_tramos m on m.rappi_tienda_id = x.rappi_tienda_id and m.tipo = 'topping'
        and m.item_id = x.topping_id and m.hasta is null
      where t.company_id = any (v_permitidas) and t.activa and x.activo and x.eliminado_en is null
        and not x.disponible) a), '[]'),
    'sin_opcion', coalesce((select jsonb_agg(jsonb_build_object('tienda', p.rappi_tienda_id, 'nombre', p.nombre,
        'categoria', p.categoria, 'grupos', p.sin_opcion_obligatoria))
      from public.rappi_menu_productos p join public.rappi_tiendas t using (rappi_tienda_id)
      where t.company_id = any (v_permitidas) and t.activa and p.activo and p.eliminado_en is null and p.disponible
        and coalesce(cardinality(p.sin_opcion_obligatoria), 0) > 0), '[]'),
    'presencia', coalesce((select jsonb_agg(jsonb_build_object('nombre_norm', nombre_norm, 'tiendas', n)) from (
      select p.nombre_norm, count(distinct p.rappi_tienda_id) as n
      from public.rappi_menu_productos p join public.rappi_tiendas t using (rappi_tienda_id)
      where t.company_id = any (v_permitidas) and t.activa and p.activo and p.eliminado_en is null
      group by p.nombre_norm) y), '[]'),
    'primera_lectura', (select min(m.desde) from public.rappi_menu_tramos m
      join public.rappi_tiendas t using (rappi_tienda_id) where t.company_id = any (v_permitidas)),
    'corrida', (select jsonb_build_object('inicio', c.inicio, 'fin', c.fin, 'tiendas', c.tiendas, 'leidas', c.leidas,
        'fallidas', c.fallidas, 'completa', c.completa, 'detalle', c.detalle)
      from public.rappi_menu_corridas c where c.fin is not null order by c.fin desc limit 1));
end $$;

revoke all on function public.sucursales_menu_rappi(integer), public.sucursales_menu_nacional(integer[])
  from public, anon;
grant execute on function public.sucursales_menu_rappi(integer), public.sucursales_menu_nacional(integer[])
  to authenticated;
