-- Revisión adversarial de la Fase 9: cierra huecos de autoría y de catálogo que la API permitía.
-- 1. Un usuario ya no puede fijar autor, quién completó ni quién archivó (ni al crear ni al editar).
-- 2. Las etapas son catálogo: solo las escribe la importación (sin sesión), no los usuarios del portal.
-- 3. Las ligas tienda-contacto creadas por usuarios siempre quedan con origen 'crm'.
-- 4. Índices de las llaves foráneas del CRM (advisor de rendimiento).

create or replace function public.crm_sellar() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare
  v jsonb := to_jsonb(new);
  o jsonb;
  usuario boolean := current_user = 'authenticated';
  parche jsonb := '{}';
  k text;
begin
  if tg_op = 'INSERT' then
    if usuario then
      parche := jsonb_build_object('creado_por', auth.uid(), 'actualizado_por', auth.uid(), 'subido_por', auth.uid(),
        'autor_id', auth.uid(), 'version', 1, 'creado_en', now(), 'actualizado_en', now(), 'subido_en', now(),
        'archivado_por', case when v->>'archivado_en' is not null then auth.uid() end,
        'completado_por', case when coalesce((v->>'hecho')::boolean, false) then auth.uid() end,
        'completado_en', case when coalesce((v->>'hecho')::boolean, false) then now() end);
      for k in select jsonb_object_keys(v) loop
        if k like 'zoho\_%' or k like 'import%' then parche := parche || jsonb_build_object(k, null); end if;
      end loop;
    end if;
    if v ? 'ruta' and (usuario or v->>'ruta' is null) then
      parche := parche || jsonb_build_object('ruta', concat(v->>'id', '/', gen_random_uuid()));
    end if;
  else
    o := to_jsonb(old);
    parche := jsonb_build_object('version', (o->>'version')::int + 1, 'actualizado_en', now());
    if usuario then
      parche := parche || jsonb_build_object('actualizado_por', auth.uid());
      for k in select jsonb_object_keys(v) loop
        if k like 'zoho\_%' or k like 'import%' or k in ('id', 'creado_en', 'creado_por', 'ruta', 'mime', 'tamano',
          'sha256', 'subido_por', 'subido_en', 'autor_id', 'completado_por', 'completado_en', 'archivado_por') then
          parche := parche || jsonb_build_object(k, o->k);
        end if;
      end loop;
    end if;
    -- Las transiciones (marcar, desmarcar, archivar, restaurar) las sella la base con el actor real.
    if v ? 'hecho' and (v->>'hecho')::boolean and not coalesce((o->>'hecho')::boolean, false) then
      parche := parche || jsonb_build_object('completado_por', auth.uid(), 'completado_en', now());
    elsif v ? 'hecho' and not (v->>'hecho')::boolean then
      parche := parche || jsonb_build_object('completado_por', null, 'completado_en', null);
    end if;
    if v ? 'archivado_por' and v->>'archivado_en' is not null and o->>'archivado_en' is null then
      parche := parche || jsonb_build_object('archivado_por', auth.uid());
    elsif v ? 'archivado_por' and v->>'archivado_en' is null then
      parche := parche || jsonb_build_object('archivado_por', null);
    end if;
  end if;
  -- Solo aplica las claves que existen en la tabla.
  parche := (select coalesce(jsonb_object_agg(key, value), '{}') from jsonb_each(parche) where v ? key);
  new := jsonb_populate_record(new, parche);
  return new;
end $$;

drop policy alta on public.crm_etapas;
drop policy cambio on public.crm_etapas;
revoke insert, update on public.crm_etapas from authenticated;

create function public.crm_origen_liga() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if current_user = 'authenticated' then new.origen := 'crm'; end if;
  return new;
end $$;
revoke all on function public.crm_origen_liga() from public, anon, authenticated;
create trigger crm_tienda_contactos_origen before insert or update on public.crm_tienda_contactos
  for each row execute function public.crm_origen_liga();

create index crm_tiendas_responsable on public.crm_tiendas (responsable_id) where responsable_id is not null;
create index crm_prospectos_responsable on public.crm_prospectos (responsable_id) where responsable_id is not null;
create index crm_contactos_responsable on public.crm_contactos (responsable_id) where responsable_id is not null;
create index crm_actividades_responsable on public.crm_actividades (responsable_id) where responsable_id is not null;
create index crm_tienda_contactos_contacto on public.crm_tienda_contactos (contacto_id);
create index crm_archivos_prospecto on public.crm_archivos (prospecto_id) where prospecto_id is not null;
create index crm_archivos_contacto on public.crm_archivos (contacto_id) where contacto_id is not null;
create index crm_archivos_nota on public.crm_archivos (nota_id) where nota_id is not null;
create index crm_notas_autor on public.crm_notas (autor_id) where autor_id is not null;
create index crm_notas_contacto on public.crm_notas (contacto_id) where contacto_id is not null;
create index crm_notas_actividad on public.crm_notas (actividad_id) where actividad_id is not null;
create index crm_etiquetas_registro_tienda on public.crm_etiquetas_registro (tienda_id) where tienda_id is not null;
create index crm_etiquetas_registro_prospecto on public.crm_etiquetas_registro (prospecto_id) where prospecto_id is not null;
create index crm_etiquetas_registro_contacto on public.crm_etiquetas_registro (contacto_id) where contacto_id is not null;
create index crm_checklists_tienda on public.crm_checklists (tienda_id) where tienda_id is not null;
create index crm_checklist_items_responsable on public.crm_checklist_items (responsable_id) where responsable_id is not null;
