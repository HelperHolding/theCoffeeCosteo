-- CRM Unificado (doc 40 §7, Q5 autorizado por Carlo el 2026-11-03): avisos diarios con pg_cron a las 07:00
-- de la Ciudad de México (13:00 UTC; México no tiene horario de verano desde 2022).
-- Solo corre donde pg_cron existe (Supabase); en PGlite se omite.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('crm-avisos-diarios', '0 13 * * *', 'select public.crm_generar_avisos()');
  end if;
end $$;
