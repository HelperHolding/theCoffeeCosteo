-- CRM por rol (doc 43 §5, decisiones de Carlo del 2026-11-15):
-- 1) Los datos que cumplen un requisito (fecha límite, fechas de apertura, ID de Jestor, territorio…) solo los
--    captura el área que cumple ese requisito, o un head. Antes cualquier editor podía capturarlos desde Resumen.
--    Quién y cuándo ya queda en la bitácora (crm_historial.cambios); la ficha lo muestra junto al requisito.
-- 2) Reasignar el vendedor de un lead: solo un head, con motivo, y el nuevo vendedor debe ser de Ventas.
--    Un lead sin vendedor lo puede tomar cualquiera de Ventas.
-- Sin cambios de datos.

create function public.crm_campos_por_area() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  nuevo jsonb := to_jsonb(new);
  viejo jsonb := to_jsonb(old);
  r record;
begin
  -- Procesos del sistema, importaciones y funciones que ya validan permisos (reasignar vendedor).
  if auth.uid() is null
    or current_setting('app.origen', true) in ('sistema', 'importacion', 'zoho')
    or current_setting('crm.campo_libre', true) = 'si' then
    return new;
  end if;
  if public.crm_es_head() then return new; end if;
  -- Tomar un lead sin vendedor lo hace Ventas; cambiar uno que ya tiene vendedor, solo un head (crm_reasignar_vendedor).
  if tg_table_name = 'crm_franquiciatarios' and (viejo->'responsable_id') is distinct from (nuevo->'responsable_id') then
    if jsonb_typeof(viejo->'responsable_id') <> 'null' then
      raise exception 'El vendedor lo reasigna un head, con motivo' using errcode = '42501';
    elsif not public.crm_puede_operar('ventas') then
      raise exception 'Este dato lo captura Ventas' using errcode = '42501';
    end if;
  end if;
  for r in
    select distinct q.campo, q.area_cumple, q.funcion_cumple
    from public.crm_requisitos q
    join public.crm_etapas e on e.id = q.etapa_id
    where q.activo and q.campo is not null and q.campo not in ('contacto', 'responsable_id')
      and e.card = case tg_table_name when 'crm_franquiciatarios' then 'franquiciatario' else 'sucursal' end
  loop
    if (viejo->r.campo) is distinct from (nuevo->r.campo)
      and not (public.crm_puede_operar(r.area_cumple)
        and (r.funcion_cumple is null or public.crm_tiene_funcion(r.funcion_cumple))) then
      raise exception 'Este dato lo captura %', public.crm_nombre_area(r.area_cumple) using errcode = '42501';
    end if;
  end loop;
  return new;
end $$;
revoke all on function public.crm_campos_por_area() from public, anon, authenticated;

create trigger crm_franquiciatarios_campos_por_area before update on public.crm_franquiciatarios
  for each row execute function public.crm_campos_por_area();
create trigger crm_tiendas_campos_por_area before update on public.crm_tiendas
  for each row when (new.embudo = 'general') execute function public.crm_campos_por_area();

create function public.crm_reasignar_vendedor(p_franquiciatario uuid, p_vendedor uuid, p_motivo text)
returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.crm_es_head() then
    raise exception 'Solo un head reasigna el vendedor' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 15 then
    raise exception 'Escribe el motivo (al menos 15 caracteres)' using errcode = '22023';
  end if;
  if not exists (select 1 from public.crm_membresias m
      where m.user_id = p_vendedor and m.area = 'ventas' and m.rol in ('head', 'miembro')) then
    raise exception 'El vendedor debe ser de Ventas' using errcode = '22023';
  end if;
  perform set_config('crm.campo_libre', 'si', true);
  perform set_config('crm.motivo', btrim(p_motivo), true);
  update public.crm_franquiciatarios set responsable_id = p_vendedor
  where id = p_franquiciatario and archivado_en is null;
  if not found then raise exception 'No existe ese franquiciatario' using errcode = '22023'; end if;
  perform set_config('crm.campo_libre', '', true);
  perform set_config('crm.motivo', '', true);
end $$;
revoke all on function public.crm_reasignar_vendedor(uuid, uuid, text) from public, anon;
grant execute on function public.crm_reasignar_vendedor(uuid, uuid, text) to authenticated;
