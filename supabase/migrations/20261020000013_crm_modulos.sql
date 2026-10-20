-- Acceso por módulo. Costeo sigue igual (cualquier perfil activo, permisos por perfiles.rol).
-- El CRM exige una fila explícita aquí; las filas se dan de alta fuera de las migraciones.
create table public.perfil_modulos (
  user_id uuid not null references public.perfiles(user_id) on delete cascade,
  modulo text not null check (modulo in ('crm')),
  nivel text not null check (nivel in ('desarrollador', 'edicion', 'lectura')),
  creado_en timestamptz not null default now(),
  primary key (user_id, modulo)
);
alter table public.perfil_modulos enable row level security;
revoke all on public.perfil_modulos from anon, authenticated;
grant select on public.perfil_modulos to authenticated;
create policy lectura on public.perfil_modulos for select to authenticated
  using (user_id = auth.uid() or public.tiene_rol('admin'));
create policy crm_sin_oauth on public.perfil_modulos as restrictive for all to authenticated
  using ((auth.jwt()->>'client_id') is null) with check ((auth.jwt()->>'client_id') is null);
create trigger perfil_modulos_bitacora after insert or update or delete on public.perfil_modulos
  for each row execute function public.registrar_bitacora();

-- Nivel del usuario en el CRM; nulo si no tiene acceso, su perfil está inactivo o la sesión es un token OAuth.
create function public.crm_nivel() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select pm.nivel
  from public.perfil_modulos pm
  join public.perfiles p on p.user_id = pm.user_id
  where pm.user_id = auth.uid() and pm.modulo = 'crm' and p.activo
    and (auth.jwt()->>'client_id') is null
$$;
create function public.crm_puede_leer() returns boolean
language sql stable set search_path = public, pg_temp as $$
  select public.crm_nivel() is not null
$$;
create function public.crm_puede_editar() returns boolean
language sql stable set search_path = public, pg_temp as $$
  select coalesce(public.crm_nivel() in ('desarrollador', 'edicion'), false)
$$;
revoke all on function public.crm_nivel(), public.crm_puede_leer(), public.crm_puede_editar() from public, anon;
grant execute on function public.crm_nivel(), public.crm_puede_leer(), public.crm_puede_editar() to authenticated;
