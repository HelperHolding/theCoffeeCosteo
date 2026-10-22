-- Módulo Sucursales: acceso al módulo (perfil_modulos) + asignación explícita por sucursal.
-- Cerrado por defecto: ni admin ve sucursales sin fila. Las filas se dan de alta fuera de las
-- migraciones (SQL Editor, con autorización), igual que el acceso al CRM.

alter table public.perfil_modulos drop constraint perfil_modulos_modulo_check;
alter table public.perfil_modulos add constraint perfil_modulos_modulo_check
  check (modulo in ('crm', 'sucursales'));

-- company_id = id de la API The Coffee (/company/list/all), no el número de tienda Jestor.
create table public.perfil_sucursales (
  user_id uuid not null references public.perfiles(user_id) on delete cascade,
  company_id integer not null check (company_id > 0),
  creado_en timestamptz not null default now(),
  primary key (user_id, company_id)
);
alter table public.perfil_sucursales enable row level security;
-- Solo lectura desde el portal; nadie se asigna sucursales a sí mismo.
revoke all on public.perfil_sucursales from anon, authenticated;
grant select on public.perfil_sucursales to authenticated;
create policy lectura on public.perfil_sucursales for select to authenticated
  using (user_id = (select auth.uid()) or (select public.tiene_rol('admin')));
create policy sucursales_sin_oauth on public.perfil_sucursales as restrictive for all to authenticated
  using ((auth.jwt()->>'client_id') is null) with check ((auth.jwt()->>'client_id') is null);
create trigger perfil_sucursales_bitacora after insert or update or delete on public.perfil_sucursales
  for each row execute function public.registrar_bitacora();
