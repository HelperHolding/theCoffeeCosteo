-- Costeo de sucursal, etapa 1b de personalizaciones (docs/conciliacion-brasil/35): la RPC sucursales_datos_costeo
-- devuelve además el costo unitario actual de una lista CERRADA de insumos sustitutos (leches, granos de café y miel).
-- Una personalización que cambia un insumo de la receta por otro (p. ej. leche deslactosada en lugar de entera) necesita
-- el costo del insumo nuevo, que no está en las líneas de la receta (migración 25). Solo estos insumos: quien ve el
-- Costeo de una sucursal no recibe el resto de la lista de compras. Cambiar la lista exige otra migración.
-- Mismo permiso y misma firma que la migración 25: create or replace conserva los permisos de ejecución.
create or replace function public.sucursales_datos_costeo(p_company integer) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.sucursales_puede_costeo(p_company) then
    return null;
  end if;
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
