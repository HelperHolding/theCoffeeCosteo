-- Franquiciatarios F6, parte A (docs/franquiciatarios/03-PLAN-RUTINA-Y-CONEXIONES.md, F6; decisiones de Carlos del
-- 2026-11-20): ficha de receta SIN costo para toda la sucursal y nivel de servicio de Rappi por día para los gestores.
-- Solo lectura: no crea tablas.

-- 1. Ficha de receta: productos con código POS, sus tamaños y sus líneas (insumo o sub-receta, unidad y cantidad), más
--    las sub-recetas que usan, con su rendimiento y sus líneas por lote. LISTA CERRADA de columnas: nunca costos ni
--    precios (insumos.costo_*, producto_tamanos.precio_lista, v_costo_*, v_resumen, canales, precio_canal_manual).
--    La ve cualquiera con rol en la sucursal (barista incluido): franq_rol ya excluye OAuth y a quien no es miembro.
create function public.franq_ficha_recetas(p_company integer) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if public.franq_rol(p_company) is null then
    return null;
  end if;
  return (
    with recursive
    productos as (
      select distinct r.id, r.nombre, cp.nombre categoria, cp.orden orden_categoria
      from public.producto_codigo_pos e
      join public.recetas r on r.id = e.receta_id and r.tipo = 'producto' and r.activo
      left join public.categorias_producto cp on cp.id = r.categoria_id),
    subs (id) as (
      select distinct l.subreceta_id from public.receta_lineas l
      where l.receta_id in (select id from productos) and l.subreceta_id is not null
      union
      select l.subreceta_id from public.receta_lineas l join subs s on l.receta_id = s.id
      where l.subreceta_id is not null)
    select jsonb_build_object(
      'productos', coalesce((select jsonb_agg(jsonb_build_object(
          'id', p.id, 'nombre', p.nombre, 'categoria', p.categoria,
          'tamanos', coalesce((select jsonb_agg(t.nombre order by t.orden)
            from public.producto_tamanos pt join public.tamanos t on t.id = pt.tamano_id
            where pt.producto_id = p.id), '[]'))
        order by p.orden_categoria nulls last, p.categoria, p.nombre) from productos p), '[]'),
      'subrecetas', coalesce((select jsonb_agg(jsonb_build_object(
          'id', r.id, 'nombre', r.nombre, 'rendimiento', r.rendimiento, 'unidad', r.unidad_rendimiento)
        order by r.nombre)
        from public.recetas r where r.id in (select id from subs)), '[]'),
      -- tamano null = línea de una sub-receta (cantidad por lote).
      'lineas', coalesce((select jsonb_agg(jsonb_build_object(
          'receta_id', l.receta_id, 'tamano', t.nombre, 'orden', l.orden,
          'insumo', i.nombre, 'subreceta_id', l.subreceta_id, 'subreceta', s.nombre,
          'unidad', coalesce(i.unidad, s.unidad_rendimiento), 'cantidad', lc.cantidad)
        order by l.receta_id, t.orden, l.orden, coalesce(i.nombre, s.nombre))
        from public.receta_lineas l
        join public.linea_cantidades lc on lc.linea_id = l.id
        left join public.tamanos t on t.id = lc.tamano_id
        left join public.insumos i on i.id = l.insumo_id
        left join public.recetas s on s.id = l.subreceta_id
        where (l.receta_id in (select id from productos) and lc.tamano_id is not null)
           or (l.receta_id in (select id from subs) and lc.tamano_id is null)), '[]')));
end $$;
revoke all on function public.franq_ficha_recetas(integer) from public, anon;
grant execute on function public.franq_ficha_recetas(integer) to authenticated;

-- 2. Nivel de servicio de Rappi por tienda y día (rappi_servicio_dia, migración 81): los mismos renglones que
--    sucursales_nivel_servicio (migración 87), para que el módulo calcule las tasas con las mismas funciones
--    (lib/sucursales/servicio.ts). Solo gestores de la sucursal; máximo 62 días. Sin reclamos ni comentarios de clientes.
create function public.franq_nivel_servicio(p_company integer, p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.franq_es_gestor(p_company) then
    return null;
  end if;
  if p_desde is null or p_hasta is null or p_desde > p_hasta or p_hasta - p_desde > 61 then
    raise exception 'Periodo inválido (máximo 62 días).';
  end if;
  return jsonb_build_object(
    'tiendas', (select count(*) from public.rappi_tiendas where company_id = p_company and activa),
    'actualizado_hasta', (select max(d.fecha) from public.rappi_servicio_dia d
      join public.rappi_tiendas t using (rappi_tienda_id) where t.company_id = p_company),
    'dias', coalesce((select jsonb_agg(jsonb_build_object('tienda', d.rappi_tienda_id, 'fecha', d.fecha,
        'pedidos', d.pedidos, 'rech_cbpi', d.rech_cbpi, 'rech_cbpr', d.rech_cbpr,
        'rech_tienda_cerrada', d.rech_tienda_cerrada, 'rech_sin_stock', d.rech_sin_stock, 'rech_demora', d.rech_demora,
        'finalizados', d.finalizados, 'recl_mal_estado', d.recl_mal_estado, 'recl_faltante', d.recl_faltante,
        'recl_incorrecto', d.recl_incorrecto, 'disponibilidad', d.disponibilidad,
        'indisponibilidad', d.indisponibilidad, 'cocina_pedidos', d.cocina_pedidos,
        'cocina_demorada', d.cocina_demorada, 'sin_disp_minutos', d.sin_disp_minutos,
        'espera_repartidor', d.espera_repartidor) order by d.fecha, d.rappi_tienda_id)
      from public.rappi_servicio_dia d join public.rappi_tiendas t using (rappi_tienda_id)
      where t.company_id = p_company and d.fecha between p_desde and p_hasta), '[]'));
end $$;
revoke all on function public.franq_nivel_servicio(integer, date, date) from public, anon;
grant execute on function public.franq_nivel_servicio(integer, date, date) to authenticated;
