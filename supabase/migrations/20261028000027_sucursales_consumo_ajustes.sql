-- Consumo de sucursal con los ajustes de personalizaciones de la etapa 1b (docs/conciliacion-brasil/35): la RPC
-- sucursales_recetas_consumo devuelve además, SOLO CANTIDADES (sin costos):
-- - 'lineas': por receta enlazada y tamaño, sus líneas DIRECTAS de insumo (nombre y cantidad), las mismas sobre las
--   que Costeo calcula el ajuste (migración 25). Así Consumo mueve la misma cantidad que Costeo.
-- - 'sustitutos': id, nombre, unidad y categoría de la MISMA lista cerrada de la migración 26 (leches, granos, miel),
--   para el insumo nuevo cuando la receta no lo lleva. Cambiar la lista exige otra migración en las dos funciones.
-- Mismo permiso (quien ve la sucursal) y misma firma que la migración 24: create or replace conserva los permisos.
create or replace function public.sucursales_recetas_consumo(p_company integer) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.sucursales_acceso(p_company) then
    return null;
  end if;
  return jsonb_build_object(
    'enlaces', coalesce((select jsonb_agg(jsonb_build_object('codigo', e.codigo, 'receta_id', r.id, 'receta', r.nombre)
        order by e.codigo)
      from public.producto_codigo_pos e join public.recetas r on r.id = e.receta_id), '[]'),
    'unicas', coalesce((select jsonb_agg(producto_id) from (
        select pt.producto_id from public.producto_tamanos pt join public.tamanos t on t.id = pt.tamano_id
        where pt.producto_id in (select receta_id from public.producto_codigo_pos)
        group by pt.producto_id having bool_and(t.nombre = 'Único')) u), '[]'),
    'tamanos', coalesce((select jsonb_agg(jsonb_build_object('receta_id', pt.producto_id, 'tamano', t.nombre))
      from public.producto_tamanos pt join public.tamanos t on t.id = pt.tamano_id
      where pt.producto_id in (select receta_id from public.producto_codigo_pos)), '[]'),
    'insumos', coalesce((
      with recursive
      productos as (select distinct receta_id from public.producto_codigo_pos),
      directas as (
        select l.receta_id, lc.tamano_id, l.insumo_id, l.subreceta_id, lc.cantidad
        from public.receta_lineas l
        join public.linea_cantidades lc on lc.linea_id = l.id
        where l.receta_id in (select receta_id from productos) and lc.tamano_id is not null),
      expansion (receta_id, tamano_id, insumo_id, subreceta_id, cantidad) as (
        select * from directas
        union all
        select e.receta_id, e.tamano_id, l.insumo_id, l.subreceta_id, e.cantidad * lc.cantidad / r.rendimiento
        from expansion e
        join public.receta_lineas l on l.receta_id = e.subreceta_id
        join public.recetas r on r.id = l.receta_id
        join public.linea_cantidades lc on lc.linea_id = l.id),
      total as (
        select receta_id, tamano_id, insumo_id, sum(cantidad) cantidad
        from expansion where insumo_id is not null group by 1, 2, 3)
      select jsonb_agg(jsonb_build_object('receta_id', x.receta_id, 'tamano', t.nombre, 'insumo_id', i.id,
          'insumo', i.nombre, 'unidad', i.unidad, 'categoria', c.nombre, 'cantidad', x.cantidad))
      from total x
      join public.tamanos t on t.id = x.tamano_id
      join public.insumos i on i.id = x.insumo_id
      left join public.categorias_insumo c on c.id = i.categoria_id), '[]'),
    'lineas', coalesce((select jsonb_agg(jsonb_build_object('receta_id', l.receta_id, 'tamano', t.nombre,
        'insumo', i.nombre, 'cantidad', lc.cantidad) order by l.receta_id, t.nombre, i.nombre)
      from public.receta_lineas l
      join public.linea_cantidades lc on lc.linea_id = l.id and lc.tamano_id is not null
      join public.tamanos t on t.id = lc.tamano_id
      join public.insumos i on i.id = l.insumo_id
      where l.receta_id in (select receta_id from public.producto_codigo_pos)), '[]'),
    'sustitutos', coalesce((select jsonb_agg(jsonb_build_object('insumo_id', i.id, 'insumo', i.nombre,
        'unidad', i.unidad, 'categoria', c.nombre) order by i.nombre)
      from public.insumos i
      left join public.categorias_insumo c on c.id = i.categoria_id
      where i.nombre in (
        'LECHE ENTERA', 'LECHE DESLACTOSADAS', 'LECHE AVENA', 'LECHE ALMENDRA', 'LECHE COCO',
        'LECHE AVENA CALIFIA', 'LECHE ALMENDRA CALIFIA', 'LECHE COCO CALIFIA',
        'CAFÉ TOSTADO EN GRANO BLACK 1.5 KG', 'CAFÉ TOSTADO EN GRANO WHITE 1.5 KG',
        'CAFÉ TOSTADO EN GRANO KRAFT 1.5 KG', 'MIEL DE ABEJA 1 LT')), '[]'));
end $$;
