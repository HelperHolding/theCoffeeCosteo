-- Puente de solo lectura a pedidos y aperturas de bliocjvq (spec 2026-11-12, "Puente de lectura legado";
-- decisión 2 del plan 2). com-minmax los lee hasta que se migre Pedidos.
-- En Supabase: tablas foráneas (postgres_fdw) en el esquema privado legado. El user mapping (con la clave del
-- rol portal_puente de bliocjvq) NO va aquí: se crea a mano (docs/migracion/comercializadora.md).
-- En PGlite (pruebas): tablas locales vacías con el mismo formato.
create schema legado;
revoke all on schema legado from public, anon, authenticated;
grant usage on schema legado to service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'postgres_fdw')
     and exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create extension if not exists postgres_fdw;
    create server legado foreign data wrapper postgres_fdw
      options (host 'aws-1-us-east-2.pooler.supabase.com', port '5432', dbname 'postgres', fetch_size '1000');
    create foreign table legado.pedidos (
      id uuid, apertura_id text, fecha_pedido timestamptz, status text, items jsonb, items_editados jsonb,
      franquiciatario_email text, notas_shopify text, es_llenado_canal boolean, marketing_proyecto_id uuid
    ) server legado options (schema_name 'public', table_name 'pedidos');
    create foreign table legado.pedidos_apertura (pedido_id uuid)
      server legado options (schema_name 'public', table_name 'pedidos_apertura');
    create foreign table legado.aperturas (id text, estatus text, fecha date)
      server legado options (schema_name 'public', table_name 'aperturas');
  else
    create table legado.pedidos (
      id uuid, apertura_id text, fecha_pedido timestamptz, status text, items jsonb, items_editados jsonb,
      franquiciatario_email text, notas_shopify text, es_llenado_canal boolean, marketing_proyecto_id uuid
    );
    create table legado.pedidos_apertura (pedido_id uuid);
    create table legado.aperturas (id text, estatus text, fecha date);
  end if;
end $$;
revoke all on all tables in schema legado from public, anon, authenticated;
grant select on all tables in schema legado to service_role;

-- PostgREST solo alcanza esquemas expuestos: las vistas van en public, pero solo service_role las lee.
create view public.com_legado_pedidos with (security_invoker = true) as
  select id, apertura_id, fecha_pedido, status, items, items_editados, franquiciatario_email, notas_shopify,
         es_llenado_canal, marketing_proyecto_id
  from legado.pedidos;
create view public.com_legado_pedidos_apertura with (security_invoker = true) as
  select pedido_id from legado.pedidos_apertura;
create view public.com_legado_aperturas with (security_invoker = true) as
  select id, estatus, fecha from legado.aperturas;
revoke all on public.com_legado_pedidos, public.com_legado_pedidos_apertura, public.com_legado_aperturas
  from public, anon, authenticated;
grant select on public.com_legado_pedidos, public.com_legado_pedidos_apertura, public.com_legado_aperturas
  to service_role;
