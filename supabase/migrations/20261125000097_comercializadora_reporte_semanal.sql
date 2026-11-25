-- supabase/migrations/20261125000097_comercializadora_reporte_semanal.sql
-- Reporte semanal en vivo desde Zoho (spec 2026-11-25-reporte-semanal-comercializadora-design.md §2 y §5).
-- Solo la Edge Function zoho-reporte-semanal (service role) escribe caché y fotos; la configuración la editan los editores.

create table public.com_reporte_config (
  id int primary key default 1 check (id = 1),
  config jsonb not null default '{}'::jsonb,
  actualizado_por uuid,
  actualizado_at timestamptz not null default now()
);
insert into public.com_reporte_config (id) values (1);

create function public.com_reporte_config_sello() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.actualizado_por := auth.uid();
  new.actualizado_at := now();
  return new;
end $$;
create trigger com_reporte_config_sello before update on public.com_reporte_config
  for each row execute function public.com_reporte_config_sello();

create table public.com_reporte_semanal_cache (
  semana date primary key,
  datos jsonb not null,
  leido_en timestamptz not null default now()
);

-- Foto de saldos tomada la primera vez que se lee el reporte en cada semana (semana = lunes del día de lectura).
create table public.com_reporte_saldos (
  semana date primary key,
  externos numeric not null,
  creditos numeric not null,
  interna numeric not null,
  guardado_en timestamptz not null default now()
);

alter table public.com_reporte_config enable row level security;
alter table public.com_reporte_semanal_cache enable row level security;
alter table public.com_reporte_saldos enable row level security;
revoke all on public.com_reporte_config, public.com_reporte_semanal_cache, public.com_reporte_saldos from anon, authenticated;
grant all on public.com_reporte_config, public.com_reporte_semanal_cache, public.com_reporte_saldos to service_role;
grant select on public.com_reporte_config, public.com_reporte_semanal_cache, public.com_reporte_saldos to authenticated;
grant update (config) on public.com_reporte_config to authenticated;
create policy lectura on public.com_reporte_config for select to authenticated using ((select public.com_puede_leer()));
create policy edicion on public.com_reporte_config for update to authenticated
  using ((select public.com_puede_editar())) with check ((select public.com_puede_editar()));
create policy lectura on public.com_reporte_semanal_cache for select to authenticated using ((select public.com_puede_leer()));
create policy lectura on public.com_reporte_saldos for select to authenticated using ((select public.com_puede_leer()));
