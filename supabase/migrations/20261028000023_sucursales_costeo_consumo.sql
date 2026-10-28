-- Sucursales GDL (docs/sucursales/13): perfiles solo de Sucursales, Costeo en lectura dentro de Sucursales y
-- recetas para el consumo teórico. Nada cambia para los perfiles actuales (todos tienen rol de Costeo).

-- 1. Rol 'sucursales': perfil del portal SIN Costeo (ni recetas, ni costos, ni bitácora). Entra solo a Sucursales.
alter table public.perfiles drop constraint perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('compras', 'operaciones', 'finanzas', 'admin', 'sucursales'));

-- 2. Las tablas de Costeo se leen solo con rol de Costeo (antes: cualquier perfil activo). Las vistas son
--    security_invoker, así que heredan el cambio. Perfiles: cada quien ve el suyo; los de Costeo, todos (como hoy).
do $$
declare
  t text;
begin
  foreach t in array array['parametros', 'canales', 'tamanos', 'proveedores', 'categorias_insumo', 'categorias_producto',
    'insumos', 'recetas', 'producto_tamanos', 'receta_lineas', 'linea_cantidades', 'bitacora', 'precio_canal_manual',
    'producto_codigo_pos'] loop
    execute format('alter policy lectura on public.%I using '
      '((select public.tiene_rol(''compras'', ''operaciones'', ''finanzas'', ''admin'')))', t);
  end loop;
end $$;
alter policy lectura on public.perfiles using (
  user_id = (select auth.uid()) or (select public.tiene_rol('compras', 'operaciones', 'finanzas', 'admin')));

-- 3. Módulo 'sucursales_costeo' (nivel lectura): ver el Costeo de SUS sucursales sin tener rol de Costeo.
alter table public.perfil_modulos drop constraint perfil_modulos_modulo_check;
alter table public.perfil_modulos add constraint perfil_modulos_modulo_check
  check (modulo in ('crm', 'sucursales', 'sucursales_costeo'));

-- 4. Acceso a una sucursal: perfil activo, módulo Sucursales y fila en perfil_sucursales (cerrado por defecto, ni admin
--    sin fila). Nunca por OAuth (MCP). Es el mismo criterio que aplica el portal antes de leer la API.
create function public.sucursales_acceso(p_company integer) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (auth.jwt()->>'client_id') is null and exists (
    select 1 from public.perfiles p
    join public.perfil_modulos m on m.user_id = p.user_id and m.modulo = 'sucursales'
    join public.perfil_sucursales s on s.user_id = p.user_id and s.company_id = p_company
    where p.user_id = auth.uid() and p.activo)
$$;

-- Costeo dentro de Sucursales: acceso a la sucursal Y (rol de Costeo o módulo sucursales_costeo).
create function public.sucursales_puede_costeo(p_company integer) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select public.sucursales_acceso(p_company) and (
    public.tiene_rol('compras', 'operaciones', 'finanzas', 'admin')
    or exists (select 1 from public.perfil_modulos m join public.perfiles p on p.user_id = m.user_id
               where m.user_id = auth.uid() and p.activo and m.modulo = 'sucursales_costeo'))
$$;

-- 5. Datos de Costeo para la sección Costeo de una sucursal (los mismos que leía el portal bajo RLS): enlaces POS,
--    costo actual por receta y tamaño, recetas de tamaño Único e IVA. Sin permiso devuelve null.
create function public.sucursales_datos_costeo(p_company integer) returns jsonb
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
        group by pt.producto_id having bool_and(t.nombre = 'Único')) u), '[]'));
end $$;

-- 6. Recetas para el consumo teórico: SOLO cantidades (sin costos). Por receta enlazada y tamaño, cada insumo con su
--    cantidad por unidad vendida, expandiendo sub-recetas con la misma recursión que v_costo_subreceta
--    (cantidad de la línea × cantidad del insumo en la sub-receta ÷ rendimiento). Disponible a quien ve la sucursal.
create function public.sucursales_recetas_consumo(p_company integer) returns jsonb
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
      left join public.categorias_insumo c on c.id = i.categoria_id), '[]'));
end $$;

-- 7. Nombres del POS de los enlaces (identidad de líneas sin código, PR #40/#42): igual para todo perfil que ve la
--    sucursal, para que Ventas dé las mismas cifras con o sin rol de Costeo. Solo código y nombre observado.
create function public.sucursales_catalogo_pos(p_company integer) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.sucursales_acceso(p_company) then
    return null;
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre_observado', nombre_observado)
    order by codigo) from public.producto_codigo_pos), '[]');
end $$;

revoke all on function public.sucursales_acceso(integer), public.sucursales_puede_costeo(integer),
  public.sucursales_datos_costeo(integer), public.sucursales_recetas_consumo(integer),
  public.sucursales_catalogo_pos(integer) from public, anon;
grant execute on function public.sucursales_acceso(integer), public.sucursales_puede_costeo(integer),
  public.sucursales_datos_costeo(integer), public.sucursales_recetas_consumo(integer),
  public.sucursales_catalogo_pos(integer) to authenticated;
