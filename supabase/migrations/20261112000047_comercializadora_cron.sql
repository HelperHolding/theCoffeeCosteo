-- Cron de Comercializadora (spec 2026-11-12, "Funciones y cron"; decisión 5 del plan 2).
-- Vault del portal (se crean a mano, nunca en el repo): 'project_url' = https://jpqkmnfjwzniptszjuli.supabase.co
-- y 'com_secreto' = el mismo valor que el secreto COM_SECRETO de las funciones.
-- plpgsql: su cuerpo no se valida al crearla, así que también se crea en PGlite (sin net ni vault).
create function public.com_invocar(fn text, body jsonb default '{}'::jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  return net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/' || fn,
    headers := pg_catalog.jsonb_build_object('Content-Type', 'application/json',
      'x-com-secreto', (select decrypted_secret from vault.decrypted_secrets where name = 'com_secreto')),
    body := body,
    timeout_milliseconds := 120000);
end $$;
revoke execute on function public.com_invocar(text, jsonb) from public, anon, authenticated;

-- Jobs creados INACTIVOS: se activan en el cutover (plan 4), nunca mientras el viejo corra en Real.
do $$
declare
  j record;
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create extension if not exists pg_cron with schema pg_catalog;
    create extension if not exists pg_net;
    perform cron.schedule('zoho-sync', '*/30 * * * *', $c$ select public.com_invocar('zoho-sync') $c$);
    perform cron.schedule('com-minmax', '30 12 * * *', $c$ select public.com_invocar('com-minmax') $c$);
    perform cron.schedule('zoho-generar-oc', '5 13 * * *',
      $c$ select public.com_invocar('zoho-generar-oc', '{"origen":"cron"}') $c$);
    for j in select jobid from cron.job where jobname in ('zoho-sync', 'com-minmax', 'zoho-generar-oc') loop
      perform cron.alter_job(j.jobid, active := false);
    end loop;
  end if;
end $$;
