-- Costeo de sucursal, etapa 1b de personalizaciones (docs/conciliacion-brasil/33): la RPC sucursales_datos_costeo
-- devuelve además, por receta enlazada y tamaño, sus líneas DIRECTAS de insumo (sin sub-recetas) con la cantidad, el
-- costo unitario actual y si el insumo está activo. Así el ajuste de una personalización (p. ej. leche deslactosada en
-- lugar de entera) se calcula en TypeScript sin otra migración. Mismo permiso que antes (migración 24); solo se
-- agrega la clave 'lineas'. Firma igual: create or replace conserva los permisos de ejecución.
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
      where l.receta_id in (select receta_id from public.producto_codigo_pos)), '[]'));
end $$;
