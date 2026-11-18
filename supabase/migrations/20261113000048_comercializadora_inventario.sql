-- Comercializadora · plan 3b (decisiones 1, 3 y 4).

-- 1. Defecto del plan 2: en bliocjvq estas columnas son generadas (coalesce(manual, calculado)). zoho-generar-oc lee
--    minimo/maximo; como columnas normales quedaban desfasadas tras cada corrida de com-minmax.
alter table public.com_minmax drop column minimo, drop column maximo;
alter table public.com_minmax
  add column minimo numeric generated always as (coalesce(minimo_manual, minimo_calc)) stored,
  add column maximo numeric generated always as (coalesce(maximo_manual, maximo_calc)) stored;
alter table public.com_kit_apertura drop column kit;
alter table public.com_kit_apertura add column kit numeric generated always as (coalesce(manual, promedio_calc)) stored;

-- 2. Ajuste/conteo de 3PL en una sola transacción (_planConteoGuardar sin la reversa a mano). Security invoker: la RLS
--    de com_catalogo (update) y com_movimientos (insert) exige Comercializadora con edición. El saldo solo cambia si
--    sigue igual al que vio la persona; si no, se aborta todo el lote.
create function public.com_ajustar_3pl(
  p_lineas jsonb, p_realizado text, p_autorizado text, p_fecha_conteo date, p_motivo text
) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  l jsonb;
  v_sku text;
  v_actual numeric;
  v_nuevo numeric;
  v_n integer := 0;
  v_folio text := 'AJ-' || to_char(now() at time zone 'America/Mexico_City', 'YYYYMMDDHH24MISS');
begin
  if p_lineas is null or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Ninguna línea para ajustar';
  end if;
  for l in select * from jsonb_array_elements(p_lineas) loop
    v_sku := l->>'sku';
    v_actual := nullif(l->>'actual', '')::numeric;
    v_nuevo := (l->>'nuevo')::numeric;
    if v_nuevo is null or v_nuevo < 0 then
      raise exception 'El ajuste de % dejaría un saldo negativo o vacío', v_sku;
    end if;
    if coalesce(v_actual, 0) = v_nuevo then
      continue;
    end if;
    update public.com_catalogo
       set saldo_yulius = v_nuevo, yulius_actualizado_at = now()
     where sku = v_sku and saldo_yulius is not distinct from v_actual;
    if not found then
      raise exception 'El saldo de % cambió desde que lo viste; revisa y vuelve a guardar', v_sku;
    end if;
    v_n := v_n + 1;
    insert into public.com_movimientos
      (tipo, sku, folio, cantidad, cantidad_original, saldo_nuevo, origen, destino, estado, fecha, motivo,
       realizado_por, autorizado_por, fecha_conteo, costo_unitario_momento)
    values
      ('ajuste', v_sku, v_folio || '-' || v_n, v_nuevo - coalesce(v_actual, 0), coalesce(v_actual, 0), v_nuevo,
       'YULIUS', 'YULIUS', 'aplicado', (now() at time zone 'America/Mexico_City')::date, p_motivo,
       p_realizado, p_autorizado, p_fecha_conteo, nullif(l->>'costo', '')::numeric);
  end loop;
  if v_n = 0 then
    raise exception 'Ninguna línea difiere del saldo: no hay nada que ajustar';
  end if;
  return v_n;
end $$;
revoke all on function public.com_ajustar_3pl(jsonb, text, text, date, text) from public, anon;
grant execute on function public.com_ajustar_3pl(jsonb, text, text, date, text) to authenticated;

-- 3. Quién autoriza un ajuste: perfiles activos con Comercializadora edición/desarrollador (sustituye a la RPC vieja
--    com_autorizadores_inventario, que leía usuarios por rol). Solo para quien ya lee Comercializadora.
create function public.com_autorizadores() returns table (nombre text)
language sql stable security definer set search_path = public, pg_temp as $$
  select p.nombre
  from public.perfiles p
  join public.perfil_modulos pm on pm.user_id = p.user_id and pm.modulo = 'comercializadora'
  where p.activo and pm.nivel in ('desarrollador', 'edicion') and public.com_puede_leer()
  order by p.nombre
$$;
revoke all on function public.com_autorizadores() from public, anon;
grant execute on function public.com_autorizadores() to authenticated;
