-- Tablero de ciudad (docs/sucursales/18 y 19): el Tablero Guadalajara lo ve completo todo usuario con el módulo
-- Sucursales, aunque no tenga esas sucursales asignadas (decisión de Carlos, 2026-11-27). El resto de Sucursales sigue
-- con el acceso por sucursal (perfil_sucursales): Directorio, páginas de sucursal y Tablero México no cambian.
--
-- Cómo: cada RPC agregada (tablero hoy y periodo, servicio, consumo, desglose y menú) pasa su cuerpo, sin cambios, a
-- una función «_base» interna que no filtra por usuario y que nadie del portal puede llamar. La RPC de siempre conserva
-- su firma y su filtro y llama a la base; la nueva «sucursales_ciudad_*» cruza lo pedido con las sucursales de la ciudad
-- (solo con el módulo Sucursales) y llama a la misma base. Así no se abren tablas ni el detalle de otras sucursales y no
-- se duplica SQL. Además: Costeo por mes cerrado (lo calcula el mismo script del consumo mensual).

-- 1. Sucursales de cada ciudad con tablero propio. Debe coincidir con lib/sucursales/config.ts (prueba
--    tests/db/tablero-ciudad.test.ts). Solo se lee por las funciones de abajo.
create table public.sucursales_ciudades (
  company_id integer primary key check (company_id > 0),
  ciudad text not null check (ciudad ~ '^[a-z]+(-[a-z]+)*$')
);
alter table public.sucursales_ciudades enable row level security;
revoke all on public.sucursales_ciudades from anon, authenticated;
insert into public.sucursales_ciudades (company_id, ciudad) values
  (384, 'guadalajara'), (457, 'guadalajara'), (459, 'guadalajara'), (477, 'guadalajara'), (513, 'guadalajara'),
  (514, 'guadalajara'), (515, 'guadalajara'), (518, 'guadalajara'), (532, 'guadalajara'), (567, 'guadalajara'),
  (631, 'guadalajara');

-- 2. Acceso al tablero de ciudad: sesión del portal (nunca OAuth), perfil activo y módulo Sucursales. Sin módulo, la
--    ciudad no tiene sucursales.
create function public.sucursales_modulo_lectura() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (auth.jwt()->>'client_id') is null and exists (
    select 1 from public.perfiles p
    join public.perfil_modulos m on m.user_id = p.user_id and m.modulo = 'sucursales'
    where p.user_id = auth.uid() and p.activo)
$$;

create function public.sucursales_ciudad_companias(p_ciudad text) returns integer[]
language sql stable security definer set search_path = public, pg_temp as $$
  select case when public.sucursales_modulo_lectura()
    then array(select company_id from public.sucursales_ciudades where ciudad = p_ciudad order by company_id)
    else '{}'::integer[] end
$$;

revoke all on function public.sucursales_modulo_lectura(), public.sucursales_ciudad_companias(text)
  from public, anon;
grant execute on function public.sucursales_modulo_lectura(), public.sucursales_ciudad_companias(text)
  to authenticated;

-- 3. Cuerpos «_base», copiados tal cual de su migración vigente (073, 089, 038, 094 y 026) sin el filtro por usuario.
--    Solo service_role (para cotejar) y las funciones de este archivo.
create function public.sucursales_tablero_hoy_base(p_companias integer[], p_hoys date[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if cardinality(p_companias) <> cardinality(p_hoys) or cardinality(p_companias) > 400 then
    raise exception 'Sucursales y fechas no corresponden.';
  end if;
  return jsonb_build_object(
    'ultimo_corte', (select max(c.fin) from public.sucursales_cortes c),
    'dias', coalesce((select jsonb_agg(jsonb_build_object('company_id', r.company_id, 'fecha', r.fecha,
        'hoy', r.fecha = x.hoy, 'leido_en', r.leido_en, 'corte_segundo', r.corte_segundo, 'completa', r.completa,
        'origenes', r.origenes, 'horas', r.horas, 'tramos', r.tramos) order by r.company_id, r.fecha)
      from unnest(p_companias, p_hoys) x(company_id, hoy)
      join public.sucursales_resumen_dia r on r.company_id = x.company_id and r.fecha in (x.hoy, x.hoy - 7)), '[]'));
end $$;

create function public.sucursales_tablero_periodo_base(p_companias integer[], p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v integer[];
begin
  if p_desde > p_hasta or p_hasta - p_desde > 119 then
    raise exception 'Periodo inválido (máximo 120 días).';
  end if;
  v := coalesce(p_companias, '{}');
  return jsonb_build_object(
    'dias_leidos', (select count(*) from public.sucursales_resumen_dia
      where company_id = any(v) and fecha between p_desde and p_hasta),
    'incompletos', (select count(*) from public.sucursales_resumen_dia
      where company_id = any(v) and fecha between p_desde and p_hasta and not completa),
    'semanas', coalesce((select jsonb_agg(jsonb_build_object('company_id', company_id, 'semana', semana,
        'origen', origen, 'pedidos', pedidos, 'venta_cent', venta_cent, 'descuento_cent', descuento_cent,
        'lineas', lineas, 'dias', dias) order by semana, company_id, origen)
      from (
        select r.company_id, date_trunc('week', r.fecha)::date semana, o.key origen,
          sum((o.value->>'pedidos')::bigint) pedidos, sum((o.value->>'venta_cent')::bigint) venta_cent,
          sum((o.value->>'descuento_cent')::bigint) descuento_cent, sum((o.value->>'lineas')::bigint) lineas,
          count(distinct r.fecha) dias
        from public.sucursales_resumen_dia r, jsonb_each(r.origenes) o
        where r.company_id = any(v) and r.fecha between p_desde and p_hasta
        group by 1, 2, 3) s), '[]'),
    'dias', coalesce((select jsonb_agg(jsonb_build_object('fecha', fecha, 'origen', origen, 'pedidos', pedidos,
        'venta_cent', venta_cent) order by fecha, origen)
      from (
        select r.fecha, o.key origen, sum((o.value->>'pedidos')::bigint) pedidos,
          sum((o.value->>'venta_cent')::bigint) venta_cent
        from public.sucursales_resumen_dia r, jsonb_each(r.origenes) o
        where r.company_id = any(v) and r.fecha between p_desde and p_hasta
        group by 1, 2) d), '[]'),
    'productos', coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'codigo', codigo, 'nombre', nombre,
        'origen', origen, 'lineas', lineas, 'importe_cent', importe_cent, 'sucursales', sucursales)
        order by importe_cent desc, clave, origen)
      from (
        select x.*, n.sucursales
        from (
          select p->>0 clave, min(p->>1) codigo, mode() within group (order by p->>2) nombre, o.key origen,
            sum((o.value->>0)::bigint) lineas, sum((o.value->>1)::bigint) importe_cent
          from public.sucursales_resumen_dia r, jsonb_array_elements(r.productos) p, jsonb_each(p->3) o
          where r.company_id = any(v) and r.fecha between p_desde and p_hasta
          group by 1, 4) x
        -- En cuántas sucursales se vendió, con cualquier origen.
        join (
          select p->>0 clave, count(distinct r.company_id) sucursales
          from public.sucursales_resumen_dia r, jsonb_array_elements(r.productos) p
          where r.company_id = any(v) and r.fecha between p_desde and p_hasta
          group by 1) n using (clave)) y), '[]'));
end $$;

create function public.sucursales_servicio_nacional_base(p_companias integer[], p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_permitidas integer[];
begin
  if p_desde > p_hasta or p_hasta - p_desde > 61 then
    raise exception 'Periodo inválido (máximo 62 días).';
  end if;
  v_permitidas := coalesce(p_companias, '{}');
  return jsonb_build_object(
    'tiendas', coalesce((select jsonb_agg(jsonb_build_object('id', rappi_tienda_id, 'company_id', company_id,
        'nombre', nombre, 'canal', canal) order by company_id, canal)
      from public.rappi_tiendas where company_id = any (v_permitidas) and activa), '[]'),
    -- Sumas por tienda en el periodo (mismas claves que SumaServicio en lib/sucursales/servicio.ts).
    'por_tienda', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select d.rappi_tienda_id as tienda, count(*) as dias, sum(coalesce(d.pedidos, 0)) as pedidos,
        sum(coalesce(d.rech_cbpi, 0)) as rech_cbpi, sum(coalesce(d.rech_cbpr, 0)) as rech_cbpr,
        sum(coalesce(d.rech_tienda_cerrada, 0)) as rech_tienda_cerrada,
        sum(coalesce(d.rech_sin_stock, 0)) as rech_sin_stock, sum(coalesce(d.rech_demora, 0)) as rech_demora,
        sum(coalesce(d.finalizados, 0)) as finalizados, sum(coalesce(d.recl_mal_estado, 0)) as recl_mal_estado,
        sum(coalesce(d.recl_faltante, 0)) as recl_faltante, sum(coalesce(d.recl_incorrecto, 0)) as recl_incorrecto,
        sum(coalesce(d.cocina_pedidos, 0)) as cocina_pedidos, sum(coalesce(d.cocina_demorada, 0)) as cocina_demorada,
        sum(d.sin_disp_minutos) as sin_disp_minutos,
        coalesce(sum(d.disponibilidad), 0) as disp_suma, count(d.disponibilidad) as disp_n,
        coalesce(sum(d.espera_repartidor * d.finalizados) filter (where d.finalizados > 0), 0) as espera_suma,
        coalesce(sum(d.finalizados) filter (where d.espera_repartidor is not null and d.finalizados > 0), 0)
          as espera_peso
      from public.rappi_servicio_dia d join public.rappi_tiendas t using (rappi_tienda_id)
      where t.company_id = any (v_permitidas) and d.fecha between p_desde and p_hasta
      group by d.rappi_tienda_id) x), '[]'),
    -- Sumas por día de todas las tiendas permitidas.
    'por_dia', coalesce((select jsonb_agg(to_jsonb(x) order by x.fecha) from (
      select d.fecha, count(*) as dias, sum(coalesce(d.pedidos, 0)) as pedidos,
        sum(coalesce(d.rech_cbpi, 0)) as rech_cbpi, sum(coalesce(d.rech_cbpr, 0)) as rech_cbpr,
        sum(coalesce(d.rech_tienda_cerrada, 0)) as rech_tienda_cerrada,
        sum(coalesce(d.rech_sin_stock, 0)) as rech_sin_stock, sum(coalesce(d.rech_demora, 0)) as rech_demora,
        sum(coalesce(d.finalizados, 0)) as finalizados, sum(coalesce(d.recl_mal_estado, 0)) as recl_mal_estado,
        sum(coalesce(d.recl_faltante, 0)) as recl_faltante, sum(coalesce(d.recl_incorrecto, 0)) as recl_incorrecto,
        sum(coalesce(d.cocina_pedidos, 0)) as cocina_pedidos, sum(coalesce(d.cocina_demorada, 0)) as cocina_demorada,
        sum(d.sin_disp_minutos) as sin_disp_minutos,
        coalesce(sum(d.disponibilidad), 0) as disp_suma, count(d.disponibilidad) as disp_n,
        coalesce(sum(d.espera_repartidor * d.finalizados) filter (where d.finalizados > 0), 0) as espera_suma,
        coalesce(sum(d.finalizados) filter (where d.espera_repartidor is not null and d.finalizados > 0), 0)
          as espera_peso
      from public.rappi_servicio_dia d join public.rappi_tiendas t using (rappi_tienda_id)
      where t.company_id = any (v_permitidas) and d.fecha between p_desde and p_hasta
      group by d.fecha) x), '[]'),
    'reclamos', coalesce((select jsonb_agg(jsonb_build_object('pedido', r.rappi_pedido_id::text,
        'tienda', r.rappi_tienda_id, 'fecha', r.fecha, 'motivo', r.motivo, 'subtipo', r.subtipo,
        'producto', r.producto, 'comentario', r.comentario, 'monto', r.monto) order by r.fecha desc, r.rappi_pedido_id)
      from public.rappi_reclamos r join public.rappi_tiendas t using (rappi_tienda_id)
      where t.company_id = any (v_permitidas) and r.fecha between p_desde and p_hasta), '[]'),
    'vigente', coalesce((select jsonb_agg(jsonb_build_object('tienda', c.rappi_tienda_id, 'estado', c.estado,
        'motivo', c.motivo, 'cierra', c.cierra, 'desde', c.desde, 'visto', c.visto))
      from public.rappi_conectividad c join public.rappi_tiendas t using (rappi_tienda_id)
      where t.company_id = any (v_permitidas) and c.hasta is null), '[]'),
    'top', coalesce((select jsonb_agg(jsonb_build_object('tienda', x.rappi_tienda_id, 'fecha', x.fecha,
        'categoria', x.categoria, 'proxima', x.proxima))
      from (select distinct on (x.rappi_tienda_id) x.* from public.rappi_top_restaurantes x
        join public.rappi_tiendas t using (rappi_tienda_id) where t.company_id = any (v_permitidas)
        order by x.rappi_tienda_id, x.fecha desc) x), '[]'),
    'leido_en', (select max(d.leido_en) from public.rappi_servicio_dia d join public.rappi_tiendas t
      using (rappi_tienda_id) where t.company_id = any (v_permitidas)));
end $$;

create function public.sucursales_consumo_nacional_base(p_mes date, p_companias integer[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v integer[];
  ant date := (p_mes - interval '1 month')::date;
  comunes integer[];
begin
  v := coalesce(p_companias, '{}');
  comunes := array(
    select a.company_id from public.sucursales_consumo_mes_sucursal a
    join public.sucursales_consumo_mes_sucursal b on b.company_id = a.company_id and b.mes = ant
    where a.mes = p_mes and a.company_id = any(v));
  return jsonb_build_object(
    'meses', coalesce((select jsonb_agg(m order by m desc) from (
        select distinct mes m from public.sucursales_consumo_mes_sucursal where company_id = any(v)) x), '[]'),
    'sucursales', coalesce((select jsonb_agg(jsonb_build_object('company_id', s.company_id,
        'calculado_en', s.calculado_en, 'recetas_leidas_en', s.recetas_leidas_en, 'completa', s.completa,
        'cobertura', s.cobertura, 'sin_receta', s.sin_receta) order by s.company_id)
      from public.sucursales_consumo_mes_sucursal s where s.mes = p_mes and s.company_id = any(v)), '[]'),
    'insumos', coalesce((select jsonb_agg(jsonb_build_object('insumo_id', x.insumo_id, 'insumo', x.insumo,
        'unidad', x.unidad, 'categoria', x.categoria, 'presentacion', i.presentacion, 'origen', x.origen,
        'cantidad', x.cantidad) order by x.categoria, x.insumo, x.origen)
      from (
        select insumo_id, origen, max(insumo) insumo, max(unidad) unidad, max(categoria) categoria,
          sum(cantidad) cantidad
        from public.sucursales_consumo_mes where mes = p_mes and company_id = any(v)
        group by insumo_id, origen) x
      left join public.insumos i on i.id = x.insumo_id), '[]'),
    'anterior', coalesce((select jsonb_agg(jsonb_build_object('insumo_id', insumo_id, 'origen', origen,
        'cantidad', cantidad) order by insumo_id, origen)
      from (
        select insumo_id, origen, sum(cantidad) cantidad
        from public.sucursales_consumo_mes where mes = ant and company_id = any(comunes)
        group by 1, 2) a), '[]'),
    'actual_comun', coalesce((select jsonb_agg(jsonb_build_object('insumo_id', insumo_id, 'origen', origen,
        'cantidad', cantidad) order by insumo_id, origen)
      from (
        select insumo_id, origen, sum(cantidad) cantidad
        from public.sucursales_consumo_mes where mes = p_mes and company_id = any(comunes)
        group by 1, 2) a), '[]'),
    'sucursales_anterior', coalesce(array_length(comunes, 1), 0));
end $$;

create function public.sucursales_consumo_desglose_base(p_mes date, p_companias integer[], p_insumo uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v integer[];
begin
  v := coalesce(p_companias, '{}');
  return coalesce((select jsonb_agg(jsonb_build_object('company_id', company_id, 'insumo_id', insumo_id,
      'origen', origen, 'cantidad', cantidad) order by company_id, insumo_id, origen)
    from public.sucursales_consumo_mes
    where mes = p_mes and company_id = any(v) and (p_insumo is null or insumo_id = p_insumo)), '[]');
end $$;

create function public.sucursales_menu_nacional_base(p_companias integer[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_permitidas integer[];
begin
  v_permitidas := coalesce(p_companias, '{}');
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

create function public.sucursales_datos_costeo_datos() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return jsonb_build_object(
    'iva', (select iva from public.parametros limit 1),
    'enlaces', coalesce((select jsonb_agg(jsonb_build_object('codigo', e.codigo, 'receta_id', r.id, 'receta', r.nombre)
        order by e.codigo)
      from public.producto_codigo_pos e join public.recetas r on r.id = e.receta_id), '[]'),
    'costos', coalesce((select jsonb_agg(jsonb_build_object('receta_id', c.producto_id, 'tamano', t.nombre,
        'costo', c.costo, 'usa_inactivo', c.usa_inactivo))
      from public.v_costo_producto c join public.tamanos t on t.id = c.tamano_id
      where c.producto_id in (select receta_id from public.producto_codigo_pos)), '[]'),
    'unicas', coalesce((select jsonb_agg(producto_id) from (
        select pt.producto_id from public.producto_tamanos pt join public.tamanos t on t.id = pt.tamano_id
        where pt.producto_id in (select receta_id from public.producto_codigo_pos)
        group by pt.producto_id having bool_and(t.nombre = 'Único')) u), '[]'),
    'lineas', coalesce((select jsonb_agg(jsonb_build_object('receta_id', l.receta_id, 'tamano', t.nombre,
        'linea_id', l.id, 'insumo_id', i.id, 'insumo', i.nombre, 'unidad', i.unidad, 'cantidad', lc.cantidad,
        'costo_unitario', i.costo_unitario, 'activo', i.activo) order by l.receta_id, t.nombre, i.nombre)
      from public.receta_lineas l
      join public.linea_cantidades lc on lc.linea_id = l.id and lc.tamano_id is not null
      join public.tamanos t on t.id = lc.tamano_id
      join public.insumos i on i.id = l.insumo_id
      where l.receta_id in (select receta_id from public.producto_codigo_pos)), '[]'),
    'sustitutos', coalesce((select jsonb_agg(jsonb_build_object('insumo_id', i.id, 'insumo', i.nombre,
        'unidad', i.unidad, 'costo_unitario', i.costo_unitario, 'activo', i.activo) order by i.nombre)
      from public.insumos i
      where i.nombre in (
        'LECHE ENTERA', 'LECHE DESLACTOSADAS', 'LECHE AVENA', 'LECHE ALMENDRA', 'LECHE COCO',
        'LECHE AVENA CALIFIA', 'LECHE ALMENDRA CALIFIA', 'LECHE COCO CALIFIA',
        'CAFÉ TOSTADO EN GRANO BLACK 1.5 KG', 'CAFÉ TOSTADO EN GRANO WHITE 1.5 KG',
        'CAFÉ TOSTADO EN GRANO KRAFT 1.5 KG', 'MIEL DE ABEJA 1 LT')), '[]'));
end $$;

revoke all on function public.sucursales_tablero_hoy_base(integer[], date[]),
  public.sucursales_tablero_periodo_base(integer[], date, date),
  public.sucursales_servicio_nacional_base(integer[], date, date),
  public.sucursales_consumo_nacional_base(date, integer[]),
  public.sucursales_consumo_desglose_base(date, integer[], uuid),
  public.sucursales_menu_nacional_base(integer[]),
  public.sucursales_datos_costeo_datos() from public, anon, authenticated;
grant execute on function public.sucursales_tablero_hoy_base(integer[], date[]),
  public.sucursales_tablero_periodo_base(integer[], date, date),
  public.sucursales_servicio_nacional_base(integer[], date, date),
  public.sucursales_consumo_nacional_base(date, integer[]),
  public.sucursales_consumo_desglose_base(date, integer[], uuid),
  public.sucursales_menu_nacional_base(integer[]),
  public.sucursales_datos_costeo_datos() to service_role;

-- 4. Las RPC de siempre: misma firma, mismo filtro, mismo resultado; ahora llaman a su base. create or replace
--    conserva sus permisos de ejecución.
create or replace function public.sucursales_tablero_hoy(p_companias integer[], p_hoys date[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_c integer[];
  v_h date[];
begin
  if cardinality(p_companias) <> cardinality(p_hoys) or cardinality(p_companias) > 400 then
    raise exception 'Sucursales y fechas no corresponden.';
  end if;
  select coalesce(array_agg(x.c order by x.i), '{}'), coalesce(array_agg(x.h order by x.i), '{}') into v_c, v_h
  from unnest(p_companias, p_hoys) with ordinality x(c, h, i)
  where public.ventas_lectura(x.c, 'sucursales');
  return public.sucursales_tablero_hoy_base(v_c, v_h);
end $$;

create or replace function public.sucursales_tablero_periodo(p_companias integer[], p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_desde > p_hasta or p_hasta - p_desde > 119 then
    raise exception 'Periodo inválido (máximo 120 días).';
  end if;
  return public.sucursales_tablero_periodo_base(
    array(select c from unnest(p_companias) c where public.ventas_lectura(c, 'sucursales')), p_desde, p_hasta);
end $$;

create or replace function public.sucursales_servicio_nacional(p_companias integer[], p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_desde > p_hasta or p_hasta - p_desde > 61 then
    raise exception 'Periodo inválido (máximo 62 días).';
  end if;
  return public.sucursales_servicio_nacional_base(
    array(select c from unnest(coalesce(p_companias, '{}')) c where public.sucursales_acceso(c)), p_desde, p_hasta);
end $$;

create or replace function public.sucursales_consumo_nacional(p_mes date, p_companias integer[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return public.sucursales_consumo_nacional_base(p_mes,
    array(select c from unnest(p_companias) c where public.sucursales_acceso(c)));
end $$;

create or replace function public.sucursales_consumo_desglose(p_mes date, p_companias integer[], p_insumo uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return public.sucursales_consumo_desglose_base(p_mes,
    array(select c from unnest(p_companias) c where public.sucursales_acceso(c)), p_insumo);
end $$;

create or replace function public.sucursales_menu_nacional(p_companias integer[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  return public.sucursales_menu_nacional_base(
    array(select c from unnest(coalesce(p_companias, '{}')) c where public.sucursales_acceso(c)));
end $$;

create or replace function public.sucursales_datos_costeo(p_company integer) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.sucursales_puede_costeo(p_company) then
    return null;
  end if;
  return public.sucursales_datos_costeo_datos();
end $$;

-- 5. Tablero de ciudad: lo pedido ∩ sucursales de la ciudad (vacío sin el módulo), con la misma base.
create function public.sucursales_ciudad_tablero_hoy(p_ciudad text, p_companias integer[], p_hoys date[])
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ciudad integer[] := public.sucursales_ciudad_companias(p_ciudad);
  v_c integer[];
  v_h date[];
begin
  if cardinality(p_companias) <> cardinality(p_hoys) or cardinality(p_companias) > 400 then
    raise exception 'Sucursales y fechas no corresponden.';
  end if;
  select coalesce(array_agg(x.c order by x.i), '{}'), coalesce(array_agg(x.h order by x.i), '{}') into v_c, v_h
  from unnest(p_companias, p_hoys) with ordinality x(c, h, i)
  where x.c = any (v_ciudad);
  return public.sucursales_tablero_hoy_base(v_c, v_h);
end $$;

create function public.sucursales_ciudad_tablero_periodo(p_ciudad text, p_companias integer[], p_desde date,
  p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ciudad integer[] := public.sucursales_ciudad_companias(p_ciudad);
begin
  if p_desde > p_hasta or p_hasta - p_desde > 119 then
    raise exception 'Periodo inválido (máximo 120 días).';
  end if;
  return public.sucursales_tablero_periodo_base(
    array(select c from unnest(p_companias) c where c = any (v_ciudad)), p_desde, p_hasta);
end $$;

create function public.sucursales_ciudad_servicio(p_ciudad text, p_companias integer[], p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ciudad integer[] := public.sucursales_ciudad_companias(p_ciudad);
begin
  if p_desde > p_hasta or p_hasta - p_desde > 61 then
    raise exception 'Periodo inválido (máximo 62 días).';
  end if;
  return public.sucursales_servicio_nacional_base(
    array(select c from unnest(coalesce(p_companias, '{}')) c where c = any (v_ciudad)), p_desde, p_hasta);
end $$;

create function public.sucursales_ciudad_consumo(p_ciudad text, p_mes date, p_companias integer[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ciudad integer[] := public.sucursales_ciudad_companias(p_ciudad);
begin
  return public.sucursales_consumo_nacional_base(p_mes,
    array(select c from unnest(p_companias) c where c = any (v_ciudad)));
end $$;

create function public.sucursales_ciudad_consumo_desglose(p_ciudad text, p_mes date, p_companias integer[],
  p_insumo uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ciudad integer[] := public.sucursales_ciudad_companias(p_ciudad);
begin
  return public.sucursales_consumo_desglose_base(p_mes,
    array(select c from unnest(p_companias) c where c = any (v_ciudad)), p_insumo);
end $$;

create function public.sucursales_ciudad_menu(p_ciudad text, p_companias integer[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_ciudad integer[] := public.sucursales_ciudad_companias(p_ciudad);
begin
  return public.sucursales_menu_nacional_base(
    array(select c from unnest(coalesce(p_companias, '{}')) c where c = any (v_ciudad)));
end $$;

-- 6. Costeo por mes cerrado (docs/sucursales/19): scripts/sucursales/consumo-mes.ts lo calcula con la misma lectura del
--    consumo y el mismo costear() de la sección Costeo, con los costos del día en que se calcula.
create table public.sucursales_costeo_mes_sucursal (
  mes date not null check (extract(day from mes) = 1),
  company_id integer not null check (company_id > 0),
  calculado_en timestamptz not null default now(),
  costos_leidos_en timestamptz not null,
  completa boolean not null,
  -- Por origen (todos, mostrador, app, rappi): CosteoResumen de lib/sucursales/costeo.ts.
  resumen jsonb not null,
  -- Productos del mes, todos los orígenes: [{clave, codigo, nombre, importeCent, lineas, costeo}].
  productos jsonb not null,
  primary key (mes, company_id)
);
alter table public.sucursales_costeo_mes_sucursal enable row level security;
revoke all on public.sucursales_costeo_mes_sucursal from anon, authenticated;

create function public.sucursales_guardar_costeo_mes(p_mes date, p_company integer, p jsonb) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if extract(day from p_mes) <> 1 then
    raise exception 'El mes va como su primer día (AAAA-MM-01).';
  end if;
  insert into public.sucursales_costeo_mes_sucursal
    (mes, company_id, calculado_en, costos_leidos_en, completa, resumen, productos)
  values (p_mes, p_company, now(), (p->>'costos_leidos_en')::timestamptz, (p->>'completa')::boolean,
    coalesce(p->'resumen', '{}'), coalesce(p->'productos', '[]'))
  on conflict (mes, company_id) do update set calculado_en = excluded.calculado_en,
    costos_leidos_en = excluded.costos_leidos_en, completa = excluded.completa, resumen = excluded.resumen,
    productos = excluded.productos;
end $$;
revoke all on function public.sucursales_guardar_costeo_mes(date, integer, jsonb) from public, anon, authenticated;
grant execute on function public.sucursales_guardar_costeo_mes(date, integer, jsonb) to service_role;

-- Costeo de la ciudad: módulo Sucursales (vía la ciudad) Y permiso de Costeo (rol de Costeo o módulo
-- sucursales_costeo), la regla de sucursales_puede_costeo sin la asignación por sucursal. Sin permiso, null. Sin mes,
-- el último calculado.
create function public.sucursales_ciudad_costeo(p_ciudad text, p_mes date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v integer[] := public.sucursales_ciudad_companias(p_ciudad);
  v_mes date;
begin
  if cardinality(v) = 0 or not (
    public.tiene_rol('compras', 'operaciones', 'finanzas', 'admin')
    or exists (select 1 from public.perfil_modulos m join public.perfiles p on p.user_id = m.user_id
               where m.user_id = auth.uid() and p.activo and m.modulo = 'sucursales_costeo')) then
    return null;
  end if;
  v_mes := coalesce(p_mes, (select max(mes) from public.sucursales_costeo_mes_sucursal where company_id = any (v)));
  return jsonb_build_object(
    'mes', v_mes,
    'meses', coalesce((select jsonb_agg(m order by m desc) from (
        select distinct mes m from public.sucursales_costeo_mes_sucursal where company_id = any (v)) x), '[]'),
    'sucursales', coalesce((select jsonb_agg(jsonb_build_object('company_id', s.company_id,
        'calculado_en', s.calculado_en, 'costos_leidos_en', s.costos_leidos_en, 'completa', s.completa,
        'resumen', s.resumen, 'productos', s.productos) order by s.company_id)
      from public.sucursales_costeo_mes_sucursal s where s.mes = v_mes and s.company_id = any (v)), '[]'));
end $$;

revoke all on function public.sucursales_ciudad_tablero_hoy(text, integer[], date[]),
  public.sucursales_ciudad_tablero_periodo(text, integer[], date, date),
  public.sucursales_ciudad_servicio(text, integer[], date, date),
  public.sucursales_ciudad_consumo(text, date, integer[]),
  public.sucursales_ciudad_consumo_desglose(text, date, integer[], uuid),
  public.sucursales_ciudad_menu(text, integer[]),
  public.sucursales_ciudad_costeo(text, date) from public, anon;
grant execute on function public.sucursales_ciudad_tablero_hoy(text, integer[], date[]),
  public.sucursales_ciudad_tablero_periodo(text, integer[], date, date),
  public.sucursales_ciudad_servicio(text, integer[], date, date),
  public.sucursales_ciudad_consumo(text, date, integer[]),
  public.sucursales_ciudad_consumo_desglose(text, date, integer[], uuid),
  public.sucursales_ciudad_menu(text, integer[]),
  public.sucursales_ciudad_costeo(text, date) to authenticated;
