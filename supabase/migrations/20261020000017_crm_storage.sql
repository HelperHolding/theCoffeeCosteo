-- Archivos del CRM: bucket privado. Un objeto solo es legible o subible si existe su fila activa en crm_archivos
-- (la ruta la genera la base, no el usuario). Sin update ni delete para usuarios: borrar = archivar la fila.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('crm-archivos', 'crm-archivos', false, 26214400, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'application/xml', 'text/xml',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

create policy crm_archivos_leer on storage.objects for select to authenticated
  using (bucket_id = 'crm-archivos' and public.crm_puede_leer()
    and exists (select 1 from public.crm_archivos a where a.ruta = name and a.archivado_en is null));

create policy crm_archivos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'crm-archivos' and public.crm_puede_editar()
    and exists (select 1 from public.crm_archivos a where a.ruta = name and a.archivado_en is null));
