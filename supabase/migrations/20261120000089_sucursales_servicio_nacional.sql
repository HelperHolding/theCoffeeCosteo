-- Nivel de servicio de Rappi para el Tablero de México (docs/rappi-portal/08, fase 3): todas las sucursales del usuario
-- en una sola llamada. Recibe las compañías y se queda solo con las que pasan sucursales_acceso (mismo patrón que
-- sucursales_tablero_periodo). Devuelve sumas, no tienda-días: el detalle por día de una sucursal está en
-- sucursales_nivel_servicio.
create function public.sucursales_servicio_nacional(p_companias integer[], p_desde date, p_hasta date) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_permitidas integer[];
begin
  if p_desde > p_hasta or p_hasta - p_desde > 61 then
    raise exception 'Periodo inválido (máximo 62 días).';
  end if;
  v_permitidas := array(select c from unnest(coalesce(p_companias, '{}')) c where public.sucursales_acceso(c));
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

revoke all on function public.sucursales_servicio_nacional(integer[], date, date) from public, anon;
grant execute on function public.sucursales_servicio_nacional(integer[], date, date) to authenticated;
