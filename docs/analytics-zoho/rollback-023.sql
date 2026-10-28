-- Reversión del ESQUEMA de 20261027000023_analytics_ventas_diarias.sql. Solo con aprobación y TODO en una transacción.
-- No sirve para ocultar una carga: si hay filas, aborta. Primero se revierte cada carga (05 §6.3), que borra por carga_id.
-- También aborta si la versión no está registrada o si otro objeto depende de las tablas o de la vista.
begin;
do $$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261027000023') then
    raise exception 'La migración 20261027000023 no está registrada: no hay nada que revertir';
  end if;
  if to_regclass('public.analytics_lecturas') is null or to_regclass('public.analytics_ventas_kpi') is null then
    raise exception 'Los objetos de Analytics no existen completos: el estado no es el esperado';
  end if;
  if exists (select 1 from public.analytics_lecturas) or exists (select 1 from public.analytics_ventas_diarias)
     or exists (select 1 from public.analytics_tiendas) then
    raise exception 'Las tablas de Analytics tienen filas: revertir primero cada carga; no se borra el esquema con datos';
  end if;
  if exists (select 1 from pg_depend d join pg_rewrite r on r.oid = d.objid
             where d.refobjid in ('public.analytics_lecturas'::regclass, 'public.analytics_ventas_diarias'::regclass,
                                  'public.analytics_tiendas'::regclass, 'public.analytics_ventas_kpi'::regclass)
               and r.ev_class <> 'public.analytics_ventas_kpi'::regclass) then
    raise exception 'Otras vistas dependen de Analytics: revisar antes de revertir';
  end if;
end $$;
drop view public.analytics_ventas_kpi;
drop function public.analytics_guardar_lectura(jsonb);
drop table public.analytics_ventas_diarias;
drop table public.analytics_lecturas;
drop table public.analytics_tiendas;
delete from supabase_migrations.schema_migrations where version = '20261027000023';
commit;
