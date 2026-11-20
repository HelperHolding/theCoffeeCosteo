-- Migración 79: la venta de un pedido de Rappi del portal es la de Zoho
-- (docs/superpowers/specs/2026-11-20-rappi-como-zoho-design.md): bruto menos los descuentos que paga la tienda,
-- sin restar los premios Pro Rewards («Premio The Coffee», type_description = 'order_discount').
-- Se aplica a mano en el SQL Editor y se registra:
--   insert into supabase_migrations.schema_migrations (version, name) values ('20261120000079','rappi_descuento_venta');

-- 1. Descuento que se resta de la venta. Sin detalle (descuento_aliado nulo) es 0: la venta queda en el bruto.
--    Un premio con value vacío o no numérico se ignora (no truena la lectura).
--    Ofertas repetidas en `descuentos`: manda descuento_aliado (la suma del portal). Nunca negativo ni mayor que el bruto.
create function public.rappi_descuento_venta(p public.rappi_pedidos) returns numeric
language sql stable set search_path = public, pg_temp as $$
  select least(p.bruto, greatest(coalesce(p.descuento_aliado, 0) - coalesce((
    select sum(case
      when jsonb_typeof(d->'value') = 'number' then (d->'value')::text::numeric
      when jsonb_typeof(d->'value') = 'string' and d->>'value' ~ '^[[:space:]]*-?[0-9]+([.][0-9]+)?[[:space:]]*$' then (d->>'value')::numeric
    end)
    from jsonb_array_elements(case when jsonb_typeof(p.descuentos) = 'array' then p.descuentos else '[]'::jsonb end) d
    where d->>'type_description' = 'order_discount'), 0), 0))
$$;
revoke all on function public.rappi_descuento_venta(public.rappi_pedidos) from public, anon, authenticated;
grant execute on function public.rappi_descuento_venta(public.rappi_pedidos) to service_role;

-- 2. La lectura de la pestaña Rappi (y de Ventas, Costeo y Franquiciatarios) agrega descuento_venta a cada pedido.
--    Misma definición que la migración 28; solo cambia ese campo.
create or replace function public.sucursales_rappi_portal(p_company integer, p_desde date, p_hasta date) returns jsonb
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
        'descuento_aliado', p.descuento_aliado, 'descuento_venta', public.rappi_descuento_venta(p), 'estado_anterior', p.estado_anterior, 'revisar', p.revisar,
        'cambios', (select count(*) from public.rappi_pedido_cambios c where c.rappi_pedido_id = p.rappi_pedido_id),
        'productos', coalesce((select jsonb_agg(jsonb_build_object('nombre', x.nombre, 'unidades', x.unidades,
            'precio', x.precio, 'opciones', x.opciones) order by x.linea)
          from public.rappi_pedido_productos x where x.rappi_pedido_id = p.rappi_pedido_id), '[]'))
        order by p.creado_local desc)
      from public.rappi_pedidos p
      where p.company_id = p_company and p.fecha_local between p_desde and p_hasta), '[]'));
end $$;

revoke all on function public.sucursales_rappi_portal(integer, date, date) from public, anon;
grant execute on function public.sucursales_rappi_portal(integer, date, date) to authenticated;

-- PostgREST expone la función como columna calculada `rappi_descuento_venta` (se pide con alias descuento_venta);
-- se recarga el esquema para que se vea al aplicar.
notify pgrst, 'reload schema';
