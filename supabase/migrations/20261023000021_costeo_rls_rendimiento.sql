-- Rendimiento de RLS de Costeo (como la migración 18 del CRM): misma lógica de acceso, pero rol_actual(),
-- tiene_rol(...) y auth.jwt() se evalúan una vez por consulta (initPlan) y no por fila. Ninguna depende de la fila:
-- rol_actual() solo lee auth.uid(); tiene_rol recibe literales; auth.jwt() es constante en la sentencia.
-- Medido en producción (docs/conciliacion-brasil/07): v_resumen bajo RLS 103 ms / 8,763 buffers frente a 21 ms sin RLS.
do $$
declare
  t text;
  escritura constant jsonb := '{
    "proveedores": ["compras", "admin"], "categorias_insumo": ["compras", "admin"], "insumos": ["compras", "admin"],
    "categorias_producto": ["operaciones", "admin"], "recetas": ["operaciones", "admin"],
    "receta_lineas": ["operaciones", "admin"], "linea_cantidades": ["operaciones", "admin"],
    "parametros": ["finanzas", "admin"], "canales": ["finanzas", "admin"], "tamanos": ["finanzas", "admin"],
    "perfiles": ["admin"], "precio_canal_manual": ["finanzas", "admin"]}';
  cond text;
begin
  foreach t in array array['parametros', 'canales', 'tamanos', 'proveedores', 'categorias_insumo', 'categorias_producto',
    'insumos', 'recetas', 'producto_tamanos', 'receta_lineas', 'linea_cantidades', 'perfiles', 'bitacora',
    'precio_canal_manual'] loop
    execute format('alter policy lectura on public.%I using ((select public.rol_actual()) is not null)', t);
    execute format('alter policy oauth_sin_altas on public.%I with check (((select auth.jwt())->>''client_id'') is null)', t);
    execute format('alter policy oauth_sin_cambios on public.%I using (((select auth.jwt())->>''client_id'') is null) '
      'with check (((select auth.jwt())->>''client_id'') is null)', t);
    execute format('alter policy oauth_sin_bajas on public.%I using (((select auth.jwt())->>''client_id'') is null)', t);
  end loop;

  for t in select jsonb_object_keys(escritura) loop
    cond := format('(select public.tiene_rol(variadic %L::text[]))',
      (select array_agg(r) from jsonb_array_elements_text(escritura -> t) r));
    execute format('alter policy alta on public.%I with check (%s)', t, cond);
    execute format('alter policy cambio on public.%I using (%s) with check (%s)', t, cond, cond);
  end loop;
  foreach t in array array['receta_lineas', 'linea_cantidades', 'precio_canal_manual'] loop
    execute format('alter policy baja on public.%I using ((select public.tiene_rol(variadic %L::text[])))', t,
      (select array_agg(r) from jsonb_array_elements_text(escritura -> t) r));
  end loop;
end $$;

-- producto_tamanos: Operaciones da de alta/baja tamaños; Finanzas también cambia (el precio lo vigila un trigger).
alter policy alta on public.producto_tamanos with check ((select public.tiene_rol('operaciones', 'admin')));
alter policy baja on public.producto_tamanos using ((select public.tiene_rol('operaciones', 'admin')));
alter policy cambio on public.producto_tamanos
  using ((select public.tiene_rol('operaciones', 'finanzas', 'admin')))
  with check ((select public.tiene_rol('operaciones', 'finanzas', 'admin')));

alter policy oauth_perfil_propio on public.perfiles
  using (((select auth.jwt())->>'client_id') is null or user_id = (select auth.uid()));
alter policy oauth_sin_bitacora on public.bitacora using (((select auth.jwt())->>'client_id') is null);
alter policy sucursales_sin_oauth on public.perfil_sucursales
  using (((select auth.jwt())->>'client_id') is null) with check (((select auth.jwt())->>'client_id') is null);

-- Endurecimiento (lints 0011 y 0028): search_path fijo y sin ejecución para anon (las políticas son solo de authenticated).
alter function public.tiene_rol(variadic text[]) set search_path = public, pg_temp;
revoke execute on function public.rol_actual() from public, anon;
grant execute on function public.rol_actual() to authenticated;
revoke execute on function public.registrar_bitacora() from public, anon;
grant execute on function public.registrar_bitacora() to authenticated;
