-- Lectura de Nivel de servicio y Conectividad de Rappi para la sección «Nivel de servicio» de una sucursal
-- (docs/rappi-portal/08, fase 2). Mismo candado que el resto de Sucursales: sin acceso a la sucursal devuelve null.
-- Las tablas (migración 81) siguen cerradas; esta función es la única puerta para el portal.
create function public.sucursales_nivel_servicio(p_company integer, p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  -- Los tramos se cortan en la zona de la sucursal en la app; aquí se toma un día de margen a cada lado.
  v_ini timestamptz := (p_desde - 1)::timestamp at time zone 'America/Mexico_City';
  v_fin timestamptz := (p_hasta + 2)::timestamp at time zone 'America/Mexico_City';
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
    'dias', coalesce((select jsonb_agg(jsonb_build_object('tienda', d.rappi_tienda_id, 'fecha', d.fecha,
        'pedidos', d.pedidos, 'rech_cbpi', d.rech_cbpi, 'rech_cbpr', d.rech_cbpr,
        'rech_tienda_cerrada', d.rech_tienda_cerrada, 'rech_sin_stock', d.rech_sin_stock, 'rech_demora', d.rech_demora,
        'finalizados', d.finalizados, 'recl_mal_estado', d.recl_mal_estado, 'recl_faltante', d.recl_faltante,
        'recl_incorrecto', d.recl_incorrecto, 'disponibilidad', d.disponibilidad,
        'indisponibilidad', d.indisponibilidad, 'cocina_pedidos', d.cocina_pedidos,
        'cocina_demorada', d.cocina_demorada, 'sin_disp_minutos', d.sin_disp_minutos,
        'espera_repartidor', d.espera_repartidor) order by d.fecha, d.rappi_tienda_id)
      from public.rappi_servicio_dia d join public.rappi_tiendas t using (rappi_tienda_id)
      where t.company_id = p_company and d.fecha between p_desde and p_hasta), '[]'),
    'reclamos', coalesce((select jsonb_agg(jsonb_build_object('pedido', r.rappi_pedido_id::text,
        'tienda', r.rappi_tienda_id, 'fecha', r.fecha, 'motivo', r.motivo, 'subtipo', r.subtipo,
        'producto', r.producto, 'comentario', r.comentario, 'monto', r.monto) order by r.fecha desc, r.rappi_pedido_id)
      from public.rappi_reclamos r join public.rappi_tiendas t using (rappi_tienda_id)
      where t.company_id = p_company and r.fecha between p_desde and p_hasta), '[]'),
    'conectividad', coalesce((select jsonb_agg(jsonb_build_object('tienda', c.rappi_tienda_id, 'estado', c.estado,
        'motivo', c.motivo, 'cierra', c.cierra, 'desde', c.desde, 'visto', c.visto, 'hasta', c.hasta)
        order by c.desde)
      from public.rappi_conectividad c join public.rappi_tiendas t using (rappi_tienda_id)
      where t.company_id = p_company and c.desde < v_fin and coalesce(c.hasta, c.visto) >= v_ini), '[]'),
    -- Estado vigente aunque el periodo sea viejo: la tarjeta «Ahora en Rappi» siempre muestra lo último.
    'vigente', coalesce((select jsonb_agg(jsonb_build_object('tienda', c.rappi_tienda_id, 'estado', c.estado,
        'motivo', c.motivo, 'cierra', c.cierra, 'desde', c.desde, 'visto', c.visto))
      from public.rappi_conectividad c join public.rappi_tiendas t using (rappi_tienda_id)
      where t.company_id = p_company and c.hasta is null), '[]'),
    'primera_foto', (select min(c.desde) from public.rappi_conectividad c join public.rappi_tiendas t
      using (rappi_tienda_id) where t.company_id = p_company),
    'semana', coalesce((select jsonb_agg(jsonb_build_object('tienda', s.rappi_tienda_id, 'fecha', s.fecha,
        'matriz', s.matriz))
      from (select distinct on (s.rappi_tienda_id) s.* from public.rappi_disponibilidad_semana s
        join public.rappi_tiendas t using (rappi_tienda_id) where t.company_id = p_company
        order by s.rappi_tienda_id, s.fecha desc) s), '[]'),
    'top', coalesce((select jsonb_agg(jsonb_build_object('tienda', x.rappi_tienda_id, 'fecha', x.fecha,
        'categoria', x.categoria, 'proxima', x.proxima))
      from (select distinct on (x.rappi_tienda_id) x.* from public.rappi_top_restaurantes x
        join public.rappi_tiendas t using (rappi_tienda_id) where t.company_id = p_company
        order by x.rappi_tienda_id, x.fecha desc) x), '[]'),
    'leido_en', (select max(d.leido_en) from public.rappi_servicio_dia d join public.rappi_tiendas t
      using (rappi_tienda_id) where t.company_id = p_company));
end $$;

revoke all on function public.sucursales_nivel_servicio(integer, date, date) from public, anon;
grant execute on function public.sucursales_nivel_servicio(integer, date, date) to authenticated;
