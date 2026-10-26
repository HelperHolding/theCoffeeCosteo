-- Reversión del ESQUEMA de 20261024000022_producto_codigo_pos.sql. Solo con aprobación y TODO en una transacción.
-- No sirve para ocultar una carga: si la tabla tiene filas, aborta (primero se revierte la carga por ejecución con
-- scripts/conciliacion/enlaces-pos-aplicar.ts --revertir --carga <id>, que deja su bitácora). También aborta si la
-- versión no está registrada, si otro objeto depende de la tabla o si sus políticas no son exactamente las 7 de la migración.
begin;
do $$
declare
  v_politicas text;
  v_huella text;
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261024000022') then
    raise exception 'La migración 20261024000022 no está registrada: no hay nada que revertir';
  end if;
  if to_regclass('public.producto_codigo_pos') is null then
    raise exception 'La tabla producto_codigo_pos no existe: el estado no es el esperado';
  end if;
  if exists (select 1 from public.producto_codigo_pos) then
    raise exception 'producto_codigo_pos tiene filas: revertir primero cada carga; no se borra el esquema con datos';
  end if;
  if exists (select 1 from pg_constraint where confrelid = 'public.producto_codigo_pos'::regclass)
     or exists (select 1 from pg_depend d join pg_rewrite r on r.oid = d.objid
                where d.refobjid = 'public.producto_codigo_pos'::regclass and d.classid = 'pg_rewrite'::regclass) then
    raise exception 'Otros objetos dependen de producto_codigo_pos (llaves foráneas o vistas): revisar antes de revertir';
  end if;
  -- Huella de la definición completa de las 7 políticas (nombre, comando, tipo, roles, using y with check).
  select string_agg(policyname, ',' order by policyname),
         md5(string_agg(concat_ws('|', policyname, cmd, permissive, roles::text, coalesce(qual, ''), coalesce(with_check, '')),
                        E'\n' order by policyname))
    into v_politicas, v_huella
    from pg_policies where schemaname = 'public' and tablename = 'producto_codigo_pos';
  if v_huella is distinct from '9c551a9824fefa77bab72b4eea28df1b' then
    raise exception 'Las políticas de producto_codigo_pos cambiaron desde la migración (%): revisar antes de revertir', v_politicas;
  end if;
end $$;
drop table public.producto_codigo_pos;
drop function public.validar_producto_codigo_pos();
delete from supabase_migrations.schema_migrations where version = '20261024000022';
commit;
