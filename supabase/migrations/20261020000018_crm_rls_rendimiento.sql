-- Rendimiento de RLS del CRM: misma lógica de acceso, pero las funciones se evalúan una vez por consulta
-- (initPlan) y no por fila. Medido en producción: contar 3,621 prospectos pasó de 1,100 ms a 3 ms.
do $$
declare t text;
begin
  foreach t in array array['crm_etapas', 'crm_tiendas', 'crm_prospectos', 'crm_contactos', 'crm_tienda_contactos',
    'crm_actividades', 'crm_notas', 'crm_etiquetas', 'crm_etiquetas_registro', 'crm_checklists',
    'crm_checklist_items', 'crm_archivos', 'crm_historial'] loop
    execute format('alter policy lectura on public.%I using ((select public.crm_puede_leer()))', t);
    execute format('alter policy crm_sin_oauth on public.%I '
      'using (((select auth.jwt())->>''client_id'') is null) with check (((select auth.jwt())->>''client_id'') is null)', t);
  end loop;
  foreach t in array array['crm_etapas', 'crm_tiendas', 'crm_prospectos', 'crm_contactos', 'crm_actividades',
    'crm_notas', 'crm_etiquetas', 'crm_checklists', 'crm_archivos',
    'crm_tienda_contactos', 'crm_etiquetas_registro', 'crm_checklist_items'] loop
    execute format('alter policy alta on public.%I with check ((select public.crm_puede_editar()))', t);
    execute format('alter policy cambio on public.%I using ((select public.crm_puede_editar())) '
      'with check ((select public.crm_puede_editar()))', t);
  end loop;
  foreach t in array array['crm_tienda_contactos', 'crm_etiquetas_registro', 'crm_checklist_items'] loop
    execute format('alter policy baja on public.%I using ((select public.crm_puede_editar()))', t);
  end loop;
end $$;

alter policy lectura on public.perfil_modulos
  using (user_id = (select auth.uid()) or (select public.tiene_rol('admin')));
alter policy crm_sin_oauth on public.perfil_modulos
  using (((select auth.jwt())->>'client_id') is null) with check (((select auth.jwt())->>'client_id') is null);

alter policy crm_archivos_leer on storage.objects
  using (bucket_id = 'crm-archivos' and (select public.crm_puede_leer())
    and exists (select 1 from public.crm_archivos a where a.ruta = name and a.archivado_en is null));
alter policy crm_archivos_subir on storage.objects
  with check (bucket_id = 'crm-archivos' and (select public.crm_puede_editar())
    and exists (select 1 from public.crm_archivos a where a.ruta = name and a.archivado_en is null));
