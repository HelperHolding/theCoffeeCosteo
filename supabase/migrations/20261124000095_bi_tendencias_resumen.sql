-- Tendencias del BI sin recorrer bi_lineas completa.
--
-- Medido el 2026-11-24 en producción, como usuario del portal (límite de 8 s por consulta): bi_tendencias tardaba
-- de 3.9 a 8.7 s (hasta 30 s con la caché fría) porque suma, línea por línea y con todos los filtros, las 588 mil
-- líneas del histórico en cada consulta. La pestaña mostraba «No se pudieron leer las ventas».
--
-- 1. bi_cargas.venta_neto_cent: la venta neta de cada carga (fuente × tienda × día), la misma suma que da
--    bi_lineas_filtradas (coalesce(importe_neto_cent, importe_cent)). La escribe bi_guardar_dia, la única que escribe
--    bi_lineas, en la misma transacción.
-- 2. bi_tendencias: sin filtros por línea (horas, categorías, grupos, café, productos, pagos, montos) suma bi_cargas,
--    unas 7 mil filas; el filtro de días se aplica a la fecha. Como antes, un mes o una semana sale solo si tiene líneas. Con filtros por línea sigue como antes. Misma regla de
--    Rappi de Zoho y mismas tiendas (bi_tiendas_filtradas, con ventas_lectura).

-- 1. Columna y relleno. Se rellena antes del not null: las cargas sin líneas quedan en 0.
alter table public.bi_cargas add column venta_neto_cent bigint;

update public.bi_cargas k set venta_neto_cent = coalesce(s.v, 0)
from (select fuente, company_id, fecha, sum(coalesce(importe_neto_cent, importe_cent)) v
      from public.bi_lineas group by 1, 2, 3) s
where s.fuente = k.fuente and s.company_id = k.company_id and s.fecha = k.fecha;
update public.bi_cargas set venta_neto_cent = 0 where venta_neto_cent is null;

alter table public.bi_cargas alter column venta_neto_cent set default 0, alter column venta_neto_cent set not null;

-- 2. bi_guardar_dia: igual que en la migración 42, más la venta del día en bi_cargas. Con la misma huella las líneas
--    no cambian, así que la venta tampoco.
create or replace function public.bi_guardar_dia(p_fuente text, p_company integer, p_fecha date, p_completa boolean,
  p_leido_en timestamptz, p_lineas jsonb, p_rappi_portal boolean default false) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n integer;
  v_venta bigint;
  v_huella text;
  v_previa text;
begin
  if p_fuente not in ('pos', 'zoho_rappi') then
    raise exception 'Fuente inválida: %', p_fuente;
  end if;
  -- Un nulo o un no-arreglo es un error del llamador: sin esto se registraría un día vacío como cargado.
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' then
    raise exception 'p_lineas debe ser un arreglo JSON (no nulo)';
  end if;
  -- Sin fila en bi_tiendas la tienda desaparecería de la lectura y aun así figuraría como cargada.
  if not exists (select 1 from public.bi_tiendas where company_id = p_company) then
    raise exception 'La tienda % no está en bi_tiendas; dala de alta antes de cargar', p_company;
  end if;
  -- El cierre de las 5:30 y el corte de cada 10 minutos pueden chocar en el mismo día: se serializan.
  perform pg_advisory_xact_lock(hashtext(p_fuente || ':' || p_company || ':' || p_fecha));
  -- Si el día ya está guardado igual (misma huella), solo se renueva leido_en: el corte de cada 10 minutos no debe
  -- borrar e insertar de nuevo un día que no cambió (filas muertas). rappi_en_pos no cambia con la misma huella.
  v_huella := md5(p_lineas::text || p_completa::text || coalesce(p_rappi_portal, false)::text);
  select huella into v_previa from public.bi_cargas
    where fuente = p_fuente and company_id = p_company and fecha = p_fecha;
  if v_previa is not null and v_previa = v_huella then
    update public.bi_cargas set leido_en = p_leido_en
      where fuente = p_fuente and company_id = p_company and fecha = p_fecha
      returning lineas into n;
    return n;
  end if;
  delete from public.bi_lineas where fuente = p_fuente and company_id = p_company and fecha = p_fecha;
  insert into public.bi_lineas (fuente, company_id, fecha, pedido, linea, hora, canal, metodo_pago, tipo_pago,
    smartphone, opcion_consumo, codigo, nombre, unidades, importe_cent, importe_neto_cent, descuento_cent)
  select p_fuente, p_company, p_fecha, x.pedido, x.linea, x.hora, x.canal, x.metodo_pago, coalesce(x.tipo_pago, ''),
    coalesce(x.smartphone, false), x.opcion_consumo, public.bi_codigo(x.codigo), x.nombre, x.unidades, x.importe_cent,
    coalesce(x.importe_neto_cent, x.importe_cent), coalesce(x.descuento_cent, 0)
  from jsonb_to_recordset(p_lineas) as x(pedido text, linea smallint, hora smallint, canal text, metodo_pago text,
    tipo_pago text, smartphone boolean, opcion_consumo text, codigo text, nombre text, unidades numeric,
    importe_cent bigint, importe_neto_cent bigint, descuento_cent bigint);
  get diagnostics n = row_count;
  -- Lo que se acaba de guardar, con la misma suma que bi_lineas_filtradas.
  select coalesce(sum(coalesce(importe_neto_cent, importe_cent)), 0) into v_venta from public.bi_lineas
    where fuente = p_fuente and company_id = p_company and fecha = p_fecha;
  insert into public.bi_cargas (fuente, company_id, fecha, leido_en, completa, rappi_en_pos, lineas, huella,
    venta_neto_cent)
  values (p_fuente, p_company, p_fecha, p_leido_en, p_completa,
    p_fuente = 'pos' and (coalesce(p_rappi_portal, false)
      or exists (select 1 from jsonb_to_recordset(p_lineas) as y(canal text) where y.canal = 'rappi')),
    n, v_huella, v_venta)
  on conflict (fuente, company_id, fecha) do update set leido_en = excluded.leido_en, completa = excluded.completa,
    rappi_en_pos = excluded.rappi_en_pos, lineas = excluded.lineas, huella = excluded.huella,
    venta_neto_cent = excluded.venta_neto_cent;
  return n;
end $$;

-- 3. bi_tendencias: atajo por bi_cargas cuando ningún filtro necesita las líneas.
create or replace function public.bi_tendencias(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_hoy date := coalesce((p->>'hoy')::date, current_date);
  v integer[];
  r jsonb;
begin
  if jsonb_array_length(coalesce(p->'horas', '[]')) = 0
    and jsonb_array_length(coalesce(p->'categorias', '[]')) = 0
    and jsonb_array_length(coalesce(p->'grupos', '[]')) = 0
    and jsonb_array_length(coalesce(p->'cafe', '[]')) = 0
    and jsonb_array_length(coalesce(p->'productos', '[]')) = 0
    and jsonb_array_length(coalesce(p->'pagos', '[]')) = 0
    and p->>'monto_min' is null and p->>'monto_max' is null
  then
    v := array(select t.company_id from public.bi_tiendas_filtradas(p) t);
    with bi_f as materialized (
      select k.fecha, sum(k.venta_neto_cent) s, sum(k.lineas) n
      from public.bi_cargas k
      where k.company_id = any(v) and k.fecha between date '2024-01-01' and v_hoy
        -- Rappi de Zoho solo si ese día el POS no trae Rappi (como bi_lineas_filtradas).
        and (k.fuente <> 'zoho_rappi' or not exists (select 1 from public.bi_cargas x where x.fuente = 'pos'
          and x.company_id = k.company_id and x.fecha = k.fecha and x.rappi_en_pos))
        and (jsonb_array_length(coalesce(p->'dias', '[]')) = 0
          or extract(dow from k.fecha)::int in (select x::int from jsonb_array_elements_text(p->'dias') x))
      group by k.fecha)
    select jsonb_build_object(
      'por_mes', coalesce((select jsonb_agg(jsonb_build_object('anio', a, 'mes', m, 'venta_cent', s) order by a, m)
        from (select extract(year from fecha)::int a, extract(month from fecha)::int m, sum(s) s from bi_f
          group by 1, 2 having sum(n) > 0) x), '[]'),
      'por_semana', coalesce((select jsonb_agg(jsonb_build_object('anio', a, 'semana', w, 'venta_cent', s) order by a, w)
        from (select public.bi_anio_semana(fecha) a, public.bi_semana(fecha) w, sum(s) s from bi_f
          group by 1, 2 having sum(n) > 0) x), '[]')
    ) into r;
    return r;
  end if;

  with bi_f as materialized (select * from public.bi_lineas_filtradas(p, date '2024-01-01', v_hoy, false))
  select jsonb_build_object(
    'por_mes', coalesce((select jsonb_agg(jsonb_build_object('anio', a, 'mes', m, 'venta_cent', s) order by a, m)
      from (select extract(year from fecha)::int a, extract(month from fecha)::int m, sum(importe_neto_cent) s from bi_f group by 1, 2) x), '[]'),
    'por_semana', coalesce((select jsonb_agg(jsonb_build_object('anio', a, 'semana', w, 'venta_cent', s) order by a, w)
      from (select public.bi_anio_semana(fecha) a, public.bi_semana(fecha) w, sum(importe_neto_cent) s from bi_f group by 1, 2) x), '[]')
  ) into r;
  return r;
end $$;
