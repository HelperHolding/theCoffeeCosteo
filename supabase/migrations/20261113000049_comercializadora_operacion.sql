-- Comercializadora · plan 3c (decisiones 4 y 5).

-- 1. Puente: Inicio necesita el monto y el número de cada pedido, y la sucursal de su apertura. En bliocjvq el rol
--    portal_puente tiene grants por columna: el grant de estas cuatro va ANTES de aplicar esta migración
--    (docs/migracion/comercializadora.md, sección 10). En PGlite legado.* son tablas locales.
do $$
begin
  if exists (select 1 from pg_foreign_table ft join pg_class c on c.oid = ft.ftrelid
             join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'legado' and c.relname = 'pedidos') then
    alter foreign table legado.pedidos add column monto numeric, add column shopify_order_number text;
    alter foreign table legado.aperturas add column sucursal text, add column contacto text;
  else
    alter table legado.pedidos add column monto numeric, add column shopify_order_number text;
    alter table legado.aperturas add column sucursal text, add column contacto text;
  end if;
end $$;

-- Las columnas nuevas van al final: create or replace view solo permite agregar columnas al final, y conserva los grants.
create or replace view public.com_legado_pedidos with (security_invoker = true) as
  select id, apertura_id, fecha_pedido, status, items, items_editados, franquiciatario_email, notas_shopify,
         es_llenado_canal, marketing_proyecto_id, monto, shopify_order_number
  from legado.pedidos;
create or replace view public.com_legado_aperturas with (security_invoker = true) as
  select id, estatus, fecha, sucursal, contacto from legado.aperturas;

-- 2. Ingreso de un traspaso en una sola transacción (_comGuardarIngreso sin la lectura-modificación-escritura del saldo
--    desde el navegador). Security invoker: la RLS de com_movimientos y com_catalogo (update) exige edición.
--    Solo líneas 'ordenado': un segundo ingreso del mismo folio no encuentra nada y aborta.
create function public.com_ingresar_traspaso(p_folio text, p_recibido jsonb) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  r record;
  v_cant numeric;
  v_n integer := 0;
begin
  for r in
    select id, sku, cantidad, cantidad_original, destino
      from public.com_movimientos
     where tipo = 'traspaso' and folio = p_folio and estado = 'ordenado'
     order by id
       for update
  loop
    v_cant := (p_recibido ->> r.id)::numeric;
    if v_cant is null or v_cant < 0 then
      raise exception 'Falta la cantidad recibida de % (no puede ser negativa)', r.sku;
    end if;
    update public.com_movimientos
       set cantidad = v_cant, cantidad_original = coalesce(r.cantidad_original, r.cantidad), estado = 'ingresado'
     where id = r.id;
    -- Igual que el viejo: solo el 3PL se suma aquí; el CEDIS lo manda Zoho (COM_ZOHO_MANDA). El origen no se resta.
    if lower(coalesce(r.destino, '')) = 'yulius' and v_cant <> 0 then
      update public.com_catalogo
         set saldo_yulius = coalesce(saldo_yulius, 0) + v_cant, yulius_actualizado_at = now()
       where sku = r.sku;
    end if;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    raise exception 'El traspaso % ya se ingresó o no existe; recarga la página', p_folio;
  end if;
  return v_n;
end $$;
revoke all on function public.com_ingresar_traspaso(text, jsonb) from public, anon;
grant execute on function public.com_ingresar_traspaso(text, jsonb) to authenticated;
