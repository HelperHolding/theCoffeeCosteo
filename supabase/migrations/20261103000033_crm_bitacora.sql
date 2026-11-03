-- CRM Unificado (doc 40 §6): bitácora completa e inalterable.
-- Cada evento guarda quién (id, nombre y área en ese momento), cuándo, qué, desde dónde y el motivo.
-- Triggers en INSERT, UPDATE y DELETE de todas las tablas del CRM; nadie edita ni borra eventos del CRM.

alter table public.crm_historial alter column entidad_id drop not null;
alter table public.crm_historial
  add column actor_nombre text,
  add column actor_area text,
  add column franquiciatario_id uuid,
  add column motivo text;
alter table public.crm_historial drop constraint crm_historial_accion_check;
alter table public.crm_historial add constraint crm_historial_accion_check check (accion in (
  'creado', 'editado', 'etapa', 'responsable', 'archivado', 'nota', 'checklist', 'archivo', 'importado',
  'requisito_cumplido', 'requisito_validado', 'requisito_revertido', 'requisito_no_aplica', 'candado_liberado',
  'sucursal_creada', 'archivo_version', 'archivo_retirado', 'archivo_descargado', 'acceso', 'aviso', 'eliminado',
  'liga', 'etiqueta', 'configuracion'));
alter table public.crm_historial drop constraint crm_historial_origen_check;
alter table public.crm_historial add constraint crm_historial_origen_check
  check (origen in ('crm', 'importacion', 'zoho', 'sistema', 'agente'));
create index crm_historial_franquiciatario on public.crm_historial (franquiciatario_id, fecha desc)
  where franquiciatario_id is not null;
create index crm_historial_fecha on public.crm_historial (fecha desc);
create index crm_historial_actor on public.crm_historial (actor_id, fecha desc) where actor_id is not null;

-- Nombre legible de una etapa («9 · Circular Oferta de Franquicia (COF)»).
create function public.crm_nombre_etapa(p_etapa uuid) returns text
language sql stable set search_path = public, pg_temp as $$
  select coalesce(numero || ' · ', '') || nombre from public.crm_etapas where id = p_etapa
$$;

create or replace function public.crm_registrar_historial() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  nuevo jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  viejo jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  fila jsonb := coalesce(to_jsonb(new), to_jsonb(old));
  v_actor uuid := auth.uid();
  v_origen text;
  v_id uuid;
  v_tienda uuid;
  v_franq uuid;
  v_accion text;
  v_resumen text;
  v_cambios jsonb := '{}';
  v_motivo text := nullif(current_setting('crm.motivo', true), '');
  v_req text;
  k text;
begin
  -- perfil_modulos es compartido: solo los accesos al CRM van a esta bitácora.
  if tg_table_name = 'perfil_modulos' and fila->>'modulo' <> 'crm' then return null; end if;
  -- Consumir una liberación no es un evento propio (el cambio de etapa ya lo registra).
  if tg_table_name = 'crm_liberaciones' and tg_op = 'UPDATE' then return null; end if;

  v_origen := case
    when current_setting('app.origen', true) in ('sistema', 'agente') then current_setting('app.origen', true)
    when v_actor is not null then 'crm'
    else coalesce(nullif(current_setting('app.origen', true), ''), 'crm') end;
  if v_origen not in ('crm', 'importacion', 'zoho', 'sistema', 'agente') then v_origen := 'crm'; end if;

  v_id := case when fila->>'id' ~ '^[0-9a-f-]{36}$' then (fila->>'id')::uuid end;
  v_tienda := case tg_table_name
    when 'crm_tiendas' then v_id
    when 'crm_checklist_items' then (select tienda_id from public.crm_checklists where id = (fila->>'checklist_id')::uuid)
    else case when fila ? 'tienda_id' then nullif(fila->>'tienda_id', '')::uuid end
  end;
  v_franq := case
    when tg_table_name = 'crm_franquiciatarios' then v_id
    when fila ? 'franquiciatario_id' and nullif(fila->>'franquiciatario_id', '') is not null then (fila->>'franquiciatario_id')::uuid
    when v_tienda is not null then (select franquiciatario_id from public.crm_tiendas where id = v_tienda)
  end;
  if tg_table_name = 'crm_cumplimientos' then
    v_req := (select nombre from public.crm_requisitos where id = (fila->>'requisito_id')::uuid);
  end if;

  if tg_op = 'INSERT' then
    v_accion := case tg_table_name
      when 'crm_notas' then 'nota'
      when 'crm_checklist_items' then 'checklist'
      when 'crm_checklists' then 'checklist'
      when 'crm_archivos' then case when fila->>'reemplaza_a' is not null then 'archivo_version' else 'archivo' end
      when 'crm_cumplimientos' then case fila->>'estado' when 'validado' then 'requisito_validado'
        when 'no_aplica' then 'requisito_no_aplica' else 'requisito_cumplido' end
      when 'crm_liberaciones' then 'candado_liberado'
      when 'crm_tienda_contactos' then 'liga'
      when 'crm_etiquetas_registro' then 'etiqueta'
      when 'crm_etiquetas' then 'etiqueta'
      when 'crm_membresias' then 'acceso'
      when 'perfil_modulos' then 'acceso'
      when 'crm_avisos' then 'aviso'
      when 'crm_festivos' then 'configuracion'
      else case
        when tg_table_name = 'crm_tiendas' and fila->>'franquiciatario_id' is not null and v_origen = 'crm' then 'sucursal_creada'
        when v_origen = 'crm' then 'creado' else 'importado' end
    end;
    v_resumen := case v_accion
      when 'nota' then 'Nota agregada'
      when 'checklist' then case when tg_table_name = 'crm_checklists'
        then format('Checklist «%s» creado', fila->>'nombre') else 'Elemento de checklist agregado' end
      when 'archivo' then format('Archivo agregado: %s (%s, %s KB)', coalesce(fila->>'tipo_documento', 'adjunto'),
        fila->>'mime', ceil((fila->>'tamano')::numeric / 1024))
      when 'archivo_version' then format('Nueva versión %s de %s (la anterior se conserva)', fila->>'version_documento',
        coalesce(fila->>'tipo_documento', 'un documento'))
      when 'requisito_validado' then format('Validado: %s', v_req)
      when 'requisito_cumplido' then format('Registrado (por validar): %s', v_req)
      when 'requisito_no_aplica' then format('No aplica: %s', v_req)
      when 'candado_liberado' then format('Candado liberado en %s', public.crm_nombre_etapa((fila->>'etapa_id')::uuid))
      when 'liga' then 'Contacto ligado'
      when 'etiqueta' then case when tg_table_name = 'crm_etiquetas'
        then format('Etiqueta creada «%s»', fila->>'nombre') else 'Etiqueta asignada' end
      when 'acceso' then case when tg_table_name = 'perfil_modulos' then format('Acceso al CRM: %s', fila->>'nivel')
        else format('Área %s: %s', public.crm_nombre_area(fila->>'area'), fila->>'rol') end
      when 'aviso' then fila->>'mensaje'
      when 'configuracion' then format('Festivo agregado: %s', fila->>'fecha')
      when 'sucursal_creada' then format('Sucursal creada en %s', public.crm_nombre_etapa((fila->>'etapa_id')::uuid))
      when 'importado' then 'Importado de Zoho'
      else 'Creado'
    end;
    if tg_table_name = 'crm_liberaciones' then v_motivo := fila->>'motivo'; end if;
  elsif tg_op = 'DELETE' then
    v_accion := case tg_table_name
      when 'crm_tienda_contactos' then 'liga' when 'crm_etiquetas_registro' then 'etiqueta'
      when 'crm_checklist_items' then 'checklist' when 'crm_membresias' then 'acceso' when 'perfil_modulos' then 'acceso'
      when 'crm_festivos' then 'configuracion' else 'eliminado' end;
    v_resumen := case tg_table_name
      when 'crm_tienda_contactos' then 'Contacto desligado'
      when 'crm_etiquetas_registro' then 'Etiqueta quitada'
      when 'crm_checklist_items' then 'Elemento de checklist eliminado'
      when 'crm_membresias' then format('Área %s retirada', public.crm_nombre_area(fila->>'area'))
      when 'perfil_modulos' then 'Acceso al CRM retirado'
      when 'crm_festivos' then format('Festivo quitado: %s', fila->>'fecha')
      else format('Eliminado (%s)', replace(tg_table_name, 'crm_', '')) end;
  else
    for k in select jsonb_object_keys(nuevo) loop
      continue when k = any (array['actualizado_en', 'actualizado_por', 'version', 'posicion', 'import_hash',
        'imported_at', 'import_run_id', 'zoho_modified_at', 'completado_por', 'completado_en', 'archivado_por',
        'etapa_previa_id', 'cumplido_por', 'cumplido_en', 'validado_por', 'validado_en']);
      if (viejo->k) is distinct from (nuevo->k) then
        v_cambios := v_cambios || jsonb_build_object(k, case
          when k in ('contenido', 'descripcion') then jsonb_build_object('cambio', true)
          else jsonb_build_object('antes', viejo->k, 'despues', nuevo->k) end);
      end if;
    end loop;
    if v_cambios = '{}' then return null; end if;
    if tg_table_name = 'crm_cumplimientos' then
      v_accion := case nuevo->>'estado' when 'validado' then 'requisito_validado' when 'pendiente' then 'requisito_revertido'
        when 'no_aplica' then 'requisito_no_aplica' else 'requisito_cumplido' end;
      v_resumen := case v_accion when 'requisito_validado' then format('Validado: %s', v_req)
        when 'requisito_revertido' then format('Regresó a pendiente: %s', v_req)
        when 'requisito_no_aplica' then format('No aplica: %s', v_req)
        else format('Registrado (por validar): %s', v_req) end;
    elsif tg_table_name in ('crm_membresias', 'perfil_modulos') then
      v_accion := 'acceso';
      v_resumen := 'Acceso cambiado';
    elsif v_cambios ? 'etapa_id' then
      v_accion := 'etapa';
      v_resumen := format('Etapa: %s → %s',
        coalesce(public.crm_nombre_etapa((viejo->>'etapa_id')::uuid), 'sin etapa'),
        coalesce(public.crm_nombre_etapa((nuevo->>'etapa_id')::uuid), 'sin etapa'));
    elsif v_cambios ? 'archivado_en' and nuevo->>'archivado_en' is not null then
      v_accion := case when tg_table_name = 'crm_archivos' then 'archivo_retirado' else 'archivado' end;
      v_resumen := case when tg_table_name = 'crm_archivos' then 'Archivo retirado' else 'Archivado' end;
      v_motivo := coalesce(v_motivo, nuevo->>'motivo_retiro');
    elsif v_cambios ? 'responsable_id' then
      v_accion := 'responsable';
      v_resumen := 'Cambio de responsable';
    else
      v_accion := case tg_table_name when 'crm_notas' then 'nota' when 'crm_checklist_items' then 'checklist'
        when 'crm_checklists' then 'checklist' when 'crm_archivos' then 'archivo'
        when 'crm_requisitos' then 'configuracion' else 'editado' end;
      v_resumen := 'Editado: ' || (select string_agg(key, ', ' order by key) from jsonb_object_keys(v_cambios) key);
    end if;
  end if;

  insert into public.crm_historial (entidad, entidad_id, tienda_id, franquiciatario_id, accion, resumen, cambios,
    actor_id, actor_nombre, actor_area, origen, motivo)
  values (tg_table_name, v_id, v_tienda, v_franq, v_accion, v_resumen, nullif(v_cambios, '{}'), v_actor,
    case when v_origen = 'sistema' then 'Sistema'
      else (select nombre from public.perfiles where user_id = v_actor) end,
    (select string_agg(m.area, ',' order by m.area) from public.crm_membresias m where m.user_id = v_actor),
    v_origen, v_motivo);
  return null;
end $$;

-- Triggers de bitácora en todas las tablas del CRM, ahora también en DELETE.
do $$
declare t text;
begin
  foreach t in array array['crm_tiendas', 'crm_prospectos', 'crm_contactos', 'crm_actividades', 'crm_notas',
    'crm_checklist_items', 'crm_archivos'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_historial', t);
  end loop;
  foreach t in array array['crm_tiendas', 'crm_prospectos', 'crm_contactos', 'crm_actividades', 'crm_notas',
    'crm_checklists', 'crm_checklist_items', 'crm_archivos', 'crm_tienda_contactos', 'crm_etiquetas',
    'crm_etiquetas_registro', 'crm_franquiciatarios', 'crm_cumplimientos', 'crm_liberaciones', 'crm_membresias',
    'crm_requisitos'] loop
    execute format('create trigger %I after insert or update or delete on public.%I '
      'for each row execute function public.crm_registrar_historial()', t || '_historial', t);
  end loop;
end $$;
create trigger perfil_modulos_crm_historial after insert or update or delete on public.perfil_modulos
  for each row execute function public.crm_registrar_historial();

-- Inalterable: nadie edita eventos; los eventos del CRM tampoco se borran. Solo el dueño de la base puede
-- limpiar filas de la importación de Zoho (origen importacion/zoho), como hacía el importador antes del corte.
create function public.crm_historial_inalterable() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'DELETE' and current_user not in ('authenticated', 'anon') and old.origen in ('importacion', 'zoho') then
    return old;
  end if;
  raise exception 'La bitácora del CRM no se edita ni se borra' using errcode = '42501';
end $$;
create function public.crm_historial_sin_truncate() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  raise exception 'La bitácora del CRM no se vacía' using errcode = '42501';
end $$;
revoke all on function public.crm_historial_inalterable(), public.crm_historial_sin_truncate(),
  public.crm_nombre_etapa(uuid) from public, anon;
grant execute on function public.crm_nombre_etapa(uuid) to authenticated;
create trigger crm_historial_inalterable before update or delete on public.crm_historial
  for each row execute function public.crm_historial_inalterable();
create trigger crm_historial_sin_truncate before truncate on public.crm_historial
  for each statement execute function public.crm_historial_sin_truncate();

-- Retirar un archivo siempre lleva motivo (también por API).
create function public.crm_archivo_retiro() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' and new.archivado_en is not null and old.archivado_en is null
    and nullif(btrim(coalesce(new.motivo_retiro, '')), '') is null then
    raise exception 'Para retirar un archivo escribe el motivo' using errcode = '22023';
  end if;
  return new;
end $$;
-- Una versión nueva hereda la card y el tipo, y numera la versión.
create function public.crm_archivo_version() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  previo public.crm_archivos;
begin
  if new.reemplaza_a is null then return new; end if;
  select * into previo from public.crm_archivos where id = new.reemplaza_a;
  if not found then raise exception 'El archivo a reemplazar no existe' using errcode = 'P0002'; end if;
  new.version_documento := previo.version_documento + 1;
  new.tipo_documento := coalesce(new.tipo_documento, previo.tipo_documento);
  if coalesce(new.franquiciatario_id, new.tienda_id, new.prospecto_id, new.contacto_id, new.nota_id)
    is distinct from coalesce(previo.franquiciatario_id, previo.tienda_id, previo.prospecto_id, previo.contacto_id, previo.nota_id) then
    raise exception 'La nueva versión debe ser de la misma card' using errcode = '22023';
  end if;
  return new;
end $$;
revoke all on function public.crm_archivo_retiro(), public.crm_archivo_version() from public, anon, authenticated;
create trigger crm_archivos_retiro before update on public.crm_archivos
  for each row execute function public.crm_archivo_retiro();
create trigger crm_archivos_version before insert on public.crm_archivos
  for each row execute function public.crm_archivo_version();

-- Descargas: se registran antes de firmar la URL (la firma la genera el servidor tras validar la sesión).
create function public.crm_registrar_descarga(p_archivo uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  a public.crm_archivos;
begin
  if not coalesce(public.crm_puede_leer(), false) then
    raise exception 'Sin acceso al CRM' using errcode = '42501';
  end if;
  select * into a from public.crm_archivos where id = p_archivo and archivado_en is null;
  if not found then raise exception 'El archivo no existe' using errcode = 'P0002'; end if;
  insert into public.crm_historial (entidad, entidad_id, tienda_id, franquiciatario_id, accion, resumen, actor_id,
    actor_nombre, actor_area, origen)
  values ('crm_archivos', a.id, a.tienda_id,
    coalesce(a.franquiciatario_id, (select franquiciatario_id from public.crm_tiendas where id = a.tienda_id)),
    'archivo_descargado', format('Descargó: %s', coalesce(a.tipo_documento, 'adjunto')), auth.uid(),
    (select nombre from public.perfiles where user_id = auth.uid()),
    (select string_agg(m.area, ',' order by m.area) from public.crm_membresias m where m.user_id = auth.uid()), 'crm');
end $$;
revoke all on function public.crm_registrar_descarga(uuid) from public, anon;
grant execute on function public.crm_registrar_descarga(uuid) to authenticated;
