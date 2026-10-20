-- CRM: grants, RLS, bloqueo de tokens OAuth, sello de auditoría, historial y movimiento del Kanban.

-- 1. Grants: lectura/alta/cambio en tablas principales (sin delete: se archiva); delete solo en ligas e ítems.
do $$
declare t text;
begin
  foreach t in array array['crm_etapas', 'crm_tiendas', 'crm_prospectos', 'crm_contactos', 'crm_tienda_contactos',
    'crm_actividades', 'crm_notas', 'crm_etiquetas', 'crm_etiquetas_registro', 'crm_checklists',
    'crm_checklist_items', 'crm_archivos', 'crm_historial'] loop
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy lectura on public.%I for select to authenticated using (public.crm_puede_leer())', t);
    -- Defensa en profundidad: crm_nivel() ya es nulo para OAuth; esto lo bloquea aunque cambie una política.
    execute format('create policy crm_sin_oauth on public.%I as restrictive for all to authenticated '
      'using ((auth.jwt()->>''client_id'') is null) with check ((auth.jwt()->>''client_id'') is null)', t);
  end loop;
  foreach t in array array['crm_etapas', 'crm_tiendas', 'crm_prospectos', 'crm_contactos', 'crm_actividades',
    'crm_notas', 'crm_etiquetas', 'crm_checklists', 'crm_archivos'] loop
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create policy alta on public.%I for insert to authenticated with check (public.crm_puede_editar())', t);
    execute format('create policy cambio on public.%I for update to authenticated '
      'using (public.crm_puede_editar()) with check (public.crm_puede_editar())', t);
  end loop;
  foreach t in array array['crm_tienda_contactos', 'crm_etiquetas_registro', 'crm_checklist_items'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy alta on public.%I for insert to authenticated with check (public.crm_puede_editar())', t);
    execute format('create policy cambio on public.%I for update to authenticated '
      'using (public.crm_puede_editar()) with check (public.crm_puede_editar())', t);
    execute format('create policy baja on public.%I for delete to authenticated using (public.crm_puede_editar())', t);
  end loop;
end $$;
grant select on public.crm_historial to authenticated;

-- 2. Sello: autoría, versión y procedencia Zoho que un usuario no puede falsificar.
create function public.crm_sellar() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v jsonb := to_jsonb(new);
  usuario boolean := current_user = 'authenticated';
  parche jsonb := '{}';
  k text;
begin
  if tg_op = 'INSERT' then
    if usuario then
      parche := jsonb_build_object('creado_por', auth.uid(), 'actualizado_por', auth.uid(), 'subido_por', auth.uid(),
        'version', 1, 'creado_en', now(), 'actualizado_en', now(), 'subido_en', now());
      for k in select jsonb_object_keys(v) loop
        if k like 'zoho\_%' or k like 'import%' then parche := parche || jsonb_build_object(k, null); end if;
      end loop;
    end if;
    if v ? 'ruta' and (usuario or v->>'ruta' is null) then
      parche := parche || jsonb_build_object('ruta', concat(v->>'id', '/', gen_random_uuid()));
    end if;
  else
    parche := jsonb_build_object('version', (to_jsonb(old)->>'version')::int + 1, 'actualizado_en', now());
    if usuario then
      parche := parche || jsonb_build_object('actualizado_por', auth.uid());
      for k in select jsonb_object_keys(v) loop
        if k like 'zoho\_%' or k like 'import%' or k in ('id', 'creado_en', 'creado_por', 'ruta', 'mime', 'tamano',
          'sha256', 'subido_por', 'subido_en') then
          parche := parche || jsonb_build_object(k, to_jsonb(old)->k);
        end if;
      end loop;
    end if;
    if v ? 'hecho' and (v->>'hecho')::boolean and not coalesce((to_jsonb(old)->>'hecho')::boolean, false) then
      parche := parche || jsonb_build_object('completado_por', auth.uid(), 'completado_en', now());
    elsif v ? 'hecho' and not (v->>'hecho')::boolean then
      parche := parche || jsonb_build_object('completado_por', null, 'completado_en', null);
    end if;
    if v ? 'archivado_por' and v->>'archivado_en' is not null and to_jsonb(old)->>'archivado_en' is null then
      parche := parche || jsonb_build_object('archivado_por', auth.uid());
    end if;
  end if;
  -- Solo aplica las claves que existen en la tabla.
  parche := (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(parche) where v ? key);
  new := jsonb_populate_record(new, parche);
  return new;
end $$;

-- 3. Historial: actor, fecha y resumen seguro (sin contenido de notas ni de archivos).
create function public.crm_registrar_historial() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  nuevo jsonb := to_jsonb(new);
  viejo jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) end;
  -- Un usuario del portal siempre deja origen 'crm'; la importación corre sin sesión.
  v_origen text := case when auth.uid() is not null then 'crm'
    else coalesce(nullif(current_setting('app.origen', true), ''), 'crm') end;
  v_tienda uuid;
  v_accion text;
  v_resumen text;
  v_cambios jsonb := '{}';
  k text;
begin
  if v_origen not in ('crm', 'importacion', 'zoho') then v_origen := 'crm'; end if;
  v_tienda := case tg_table_name
    when 'crm_tiendas' then (nuevo->>'id')::uuid
    when 'crm_checklist_items' then (select tienda_id from public.crm_checklists where id = (nuevo->>'checklist_id')::uuid)
    else (nuevo->>'tienda_id')::uuid
  end;
  if tg_op = 'INSERT' then
    v_accion := case tg_table_name when 'crm_notas' then 'nota' when 'crm_checklist_items' then 'checklist'
      when 'crm_archivos' then 'archivo' else case when v_origen = 'crm' then 'creado' else 'importado' end end;
    v_resumen := case tg_table_name
      when 'crm_notas' then 'Nota agregada'
      when 'crm_checklist_items' then 'Elemento de checklist agregado'
      when 'crm_archivos' then format('Archivo agregado (%s, %s KB)', nuevo->>'mime', ceil((nuevo->>'tamano')::numeric / 1024))
      else case when v_accion = 'importado' then 'Importado de Zoho' else 'Creado' end
    end;
  else
    for k in select jsonb_object_keys(nuevo) loop
      continue when k = any (array['actualizado_en', 'actualizado_por', 'version', 'posicion', 'import_hash',
        'imported_at', 'import_run_id', 'zoho_modified_at', 'completado_por', 'completado_en', 'archivado_por']);
      if (viejo->k) is distinct from (nuevo->k) then
        v_cambios := v_cambios || jsonb_build_object(k, case
          when k in ('contenido', 'descripcion') then jsonb_build_object('cambio', true)
          else jsonb_build_object('antes', viejo->k, 'despues', nuevo->k) end);
      end if;
    end loop;
    if v_cambios = '{}' then return null; end if;
    if v_cambios ? 'etapa_id' then
      v_accion := 'etapa';
      v_resumen := format('Etapa: %s → %s',
        coalesce((select nombre from public.crm_etapas where id = (viejo->>'etapa_id')::uuid), 'sin etapa'),
        coalesce((select nombre from public.crm_etapas where id = (nuevo->>'etapa_id')::uuid), 'sin etapa'));
    elsif v_cambios ? 'archivado_en' and nuevo->>'archivado_en' is not null then
      v_accion := 'archivado';
      v_resumen := 'Archivado';
    elsif v_cambios ? 'responsable_id' then
      v_accion := 'responsable';
      v_resumen := 'Cambio de responsable';
    else
      v_accion := case tg_table_name when 'crm_notas' then 'nota' when 'crm_checklist_items' then 'checklist'
        when 'crm_archivos' then 'archivo' else 'editado' end;
      v_resumen := 'Editado: ' || (select string_agg(key, ', ' order by key) from jsonb_object_keys(v_cambios) key);
    end if;
  end if;
  insert into public.crm_historial (entidad, entidad_id, tienda_id, accion, resumen, cambios, actor_id, origen)
  values (tg_table_name, (nuevo->>'id')::uuid, v_tienda, v_accion, v_resumen, nullif(v_cambios, '{}'), auth.uid(), v_origen);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['crm_tiendas', 'crm_prospectos', 'crm_contactos', 'crm_actividades', 'crm_notas',
    'crm_checklists', 'crm_checklist_items', 'crm_archivos'] loop
    execute format('create trigger %I before insert or update on public.%I for each row execute function public.crm_sellar()',
      t || '_sellar', t);
  end loop;
  foreach t in array array['crm_tiendas', 'crm_prospectos', 'crm_contactos', 'crm_actividades', 'crm_notas',
    'crm_checklist_items', 'crm_archivos'] loop
    execute format('create trigger %I after insert or update on public.%I for each row execute function public.crm_registrar_historial()',
      t || '_historial', t);
  end loop;
end $$;
revoke all on function public.crm_sellar(), public.crm_registrar_historial() from public, anon, authenticated;

-- 4. Kanban: mover con concurrencia optimista (RLS del invocador) y renumerar una columna.
create function public.crm_mover_tienda(p_tienda uuid, p_etapa uuid, p_posicion double precision, p_version integer)
returns public.crm_tiendas
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  fila public.crm_tiendas;
begin
  update public.crm_tiendas set etapa_id = p_etapa, posicion = p_posicion
  where id = p_tienda and version = p_version and archivado_en is null
  returning * into fila;
  if not found then
    raise exception 'La tienda cambió o ya no está disponible; recarga el tablero' using errcode = '40001';
  end if;
  return fila;
end $$;

create function public.crm_renumerar_etapa(p_etapa uuid) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  n integer;
begin
  update public.crm_tiendas t set posicion = o.n * 1024
  from (select id, row_number() over (order by posicion, creado_en, id) n
        from public.crm_tiendas where etapa_id = p_etapa and archivado_en is null) o
  where t.id = o.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.crm_mover_tienda(uuid, uuid, double precision, integer), public.crm_renumerar_etapa(uuid)
  from public, anon;
grant execute on function public.crm_mover_tienda(uuid, uuid, double precision, integer), public.crm_renumerar_etapa(uuid)
  to authenticated;
