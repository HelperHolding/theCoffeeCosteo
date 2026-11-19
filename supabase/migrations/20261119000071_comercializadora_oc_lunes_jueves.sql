-- Pedido del usuario (2026-11-18), igual que en el sitio viejo:
-- 1) OCs automáticas solo lunes y jueves a las 08:00 de CDMX (14:00 UTC; CDMX no tiene horario de verano). No cambia si el
--    job está activo (en sombra lo está; en modo Real lo decide el cutover). com-minmax sigue diario a las 06:30 y desde ahí
--    sale el aviso de OCs en borrador con 2 días o más.
-- 2) Stock de seguridad: 20 días para lo local; 45 días por artículo para lo importado
--    (lead time mayor a la entrega máxima nacional de Configuración, 45 días). Con historial.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.alter_job((select jobid from cron.job where jobname = 'zoho-generar-oc'), schedule := '0 14 * * 1,4');
  end if;
end $$;

insert into public.com_plan_config_historial (ambito, clave, valor_anterior, valor_nuevo, modificado_por)
select 'config', 'seg.dias', config #> '{seg,dias}', '20'::jsonb, 'Claude (20 días de seguridad para lo local)'
from public.com_plan_config where id = 1 and (config #>> '{seg,dias}') is distinct from '20';
update public.com_plan_config
set config = jsonb_set(config, '{seg,dias}', '20'::jsonb), version = version + 1
where id = 1 and (config #>> '{seg,dias}') is distinct from '20';

create temp table com_importados_71 on commit drop as
select c.sku, c.dias_seguridad as antes
from public.com_catalogo c left join public.com_lead_times l using (sku)
where c.estatus <> 'Inactivo'
  and coalesce(c.zoho_lead_time, l.dias, 0) > (select coalesce((config #>> '{compra,entrega_max}')::int, 45) from public.com_plan_config where id = 1)
  and c.dias_seguridad is distinct from 45;
insert into public.com_plan_config_historial (ambito, clave, valor_anterior, valor_nuevo, modificado_por)
select 'dias_seguridad', sku, to_jsonb(antes), '45'::jsonb, 'Claude (45 días de seguridad para importados)' from com_importados_71;
update public.com_catalogo c set dias_seguridad = 45 from com_importados_71 i where i.sku = c.sku;
drop table com_importados_71;
