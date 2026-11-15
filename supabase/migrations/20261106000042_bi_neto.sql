-- BI: «Ventas Netas» = neto de la API (como «Net Amount (Local)» de Zoho). La API del POS manda grossAmount (lo
-- cobrado) y netAmout (neto tras la comisión del pago: 3 % en APP - WALLET, 17.6 % en Rappi por POS). Lo cobrado sigue
-- en importe_cent; el neto va en importe_neto_cent (nulo en filas viejas: se lee con coalesce al cobrado).
-- Después de aplicar: volver a cortar las fechas del piloto para que las filas traigan el neto (docs/bi/02-CARGA.md).

alter table public.bi_lineas add column importe_neto_cent bigint;

-- Guarda un día de una tienda y fuente, reemplazando lo anterior en una sola transacción.
-- importe_neto_cent: neto de la API tras la comisión del pago (como «Net Amount (Local)» de Zoho); si no viene, se usa
-- importe_cent. La huella incluye p_lineas::text completo, así que un cambio de neto reescribe el día.
-- p_rappi_portal: la tienda tiene el portal de Rappi y el POS de ese día ya lo trae; se pasa en cada guardado 'pos'
-- de esas tiendas, para que un guardado posterior no borre la marca. La tienda debe existir en bi_tiendas.
create or replace function public.bi_guardar_dia(p_fuente text, p_company integer, p_fecha date, p_completa boolean,
  p_leido_en timestamptz, p_lineas jsonb, p_rappi_portal boolean default false) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n integer;
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
  insert into public.bi_cargas (fuente, company_id, fecha, leido_en, completa, rappi_en_pos, lineas, huella)
  values (p_fuente, p_company, p_fecha, p_leido_en, p_completa,
    p_fuente = 'pos' and (coalesce(p_rappi_portal, false)
      or exists (select 1 from jsonb_to_recordset(p_lineas) as y(canal text) where y.canal = 'rappi')),
    n, v_huella)
  on conflict (fuente, company_id, fecha) do update set leido_en = excluded.leido_en, completa = excluded.completa,
    rappi_en_pos = excluded.rappi_en_pos, lineas = excluded.lineas, huella = excluded.huella;
  return n;
end $$;

revoke all on function public.bi_guardar_dia(text, integer, date, boolean, timestamptz, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.bi_guardar_dia(text, integer, date, boolean, timestamptz, jsonb, boolean)
  to service_role;


-- Cambia la firma de retorno (importe_neto_cent): hay que soltarla y crearla de nuevo. bi_tablero y bi_tendencias son
-- plpgsql (sin dependencia dura), se redefinen más abajo.
drop function public.bi_lineas_filtradas(jsonb, date, date, boolean);

-- Líneas visibles para un usuario con sus filtros: una sola definición que usan bi_tablero y bi_tendencias.
-- Los montos de venta son el NETO (importe_neto_cent, con coalesce al cobrado para filas viejas); importe_cent es lo
-- cobrado. El filtro de monto («Net Amount (Local)») va sobre el neto de la línea, como en Zoho.
-- Devuelve también el canal, para distinguir el Rappi del portal (fuente pos) del de Zoho (spec §2.3).
create function public.bi_lineas_filtradas(p jsonb, p_desde date, p_hasta date, p_con_semanas boolean)
returns table (fuente text, company_id integer, fecha date, pedido text, canal text, hora smallint, codigo text,
  nombre text, unidades numeric, importe_cent bigint, importe_neto_cent bigint, etiqueta_pago text, grupo text, categoria_master text,
  contiene_cafe text, promocion text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v integer[];
begin
  v := array(select t.company_id from public.bi_tiendas_filtradas(p) t);
  return query
  select l.fuente, l.company_id, l.fecha, l.pedido, l.canal, l.hora, l.codigo, l.nombre, l.unidades, l.importe_cent,
    coalesce(l.importe_neto_cent, l.importe_cent), coalesce(mp.etiqueta, l.metodo_pago), coalesce(cl.grupo, 'Otros'), coalesce(cl.categoria_master, 'Sin clasificar'),
    cl.contiene_cafe, coalesce(cl.promocion, 'Producto regular')
  from public.bi_lineas l
  left join public.bi_mapeo_pago mp on mp.metodo_pos = l.metodo_pago and mp.tipo_pos = l.tipo_pago and mp.smartphone = l.smartphone
  left join lateral (select c.* from public.bi_clasificacion_producto c
    where c.codigo = l.codigo and c.vigente_desde <= l.fecha order by c.vigente_desde desc limit 1) cl on true
  where l.company_id = any(v) and l.fecha between p_desde and p_hasta
    -- Rappi de Zoho solo si ese día el POS no trae Rappi.
    and (l.fuente <> 'zoho_rappi' or not exists (select 1 from public.bi_cargas k where k.fuente = 'pos'
      and k.company_id = l.company_id and k.fecha = l.fecha and k.rappi_en_pos))
    and (jsonb_array_length(coalesce(p->'dias', '[]')) = 0 or extract(dow from l.fecha)::int in (select x::int from jsonb_array_elements_text(p->'dias') x))
    and (jsonb_array_length(coalesce(p->'horas', '[]')) = 0 or l.hora in (select x::smallint from jsonb_array_elements_text(p->'horas') x))
    -- Etiqueta de Zoho «W45 2026»: sin ceros a la izquierda.
    and (not p_con_semanas or jsonb_array_length(coalesce(p->'semanas', '[]')) = 0
      or ('W' || public.bi_semana(l.fecha) || ' ' || public.bi_anio_semana(l.fecha)) in (select x from jsonb_array_elements_text(p->'semanas') x))
    and (jsonb_array_length(coalesce(p->'categorias', '[]')) = 0 or coalesce(cl.categoria_master, 'Sin clasificar') in (select x from jsonb_array_elements_text(p->'categorias') x))
    and (jsonb_array_length(coalesce(p->'grupos', '[]')) = 0 or coalesce(cl.grupo, 'Otros') in (select x from jsonb_array_elements_text(p->'grupos') x))
    and (jsonb_array_length(coalesce(p->'cafe', '[]')) = 0 or cl.contiene_cafe in (select x from jsonb_array_elements_text(p->'cafe') x))
    and (jsonb_array_length(coalesce(p->'productos', '[]')) = 0 or l.nombre in (select x from jsonb_array_elements_text(p->'productos') x))
    and (jsonb_array_length(coalesce(p->'pagos', '[]')) = 0 or coalesce(mp.etiqueta, l.metodo_pago) in (select x from jsonb_array_elements_text(p->'pagos') x))
    and (p->>'monto_min' is null or coalesce(l.importe_neto_cent, l.importe_cent) >= (p->>'monto_min')::numeric * 100)
    and (p->>'monto_max' is null or coalesce(l.importe_neto_cent, l.importe_cent) <= (p->>'monto_max')::numeric * 100);
end $$;
revoke all on function public.bi_lineas_filtradas(jsonb, date, date, boolean) from public, anon, authenticated;

create or replace function public.bi_tablero(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d date := (p->>'desde')::date;
  h date := (p->>'hasta')::date;
  v_hoy date := coalesce((p->>'hoy')::date, current_date);
  r jsonb;
begin
  if d is null or h is null or d > h or h - d > 1100 then
    raise exception 'Periodo inválido (máximo 1,100 días).';
  end if;
  with bi_f as materialized (select * from public.bi_lineas_filtradas(p, d, h, true))
  select jsonb_build_object(
    -- Solo las tiendas que pasan los filtros de tienda, y por tienda solo de su apertura a hoy (ni los días antes de
    -- abrir ni los futuros cuentan como faltantes).
    'cargas', (select jsonb_build_object('esperados', count(*), 'con_carga', count(k.*), 'incompletos', count(*) filter (where k.completa is false))
      from public.bi_tiendas_filtradas(p) c
      cross join lateral generate_series(greatest(d, c.fecha_apertura)::timestamp, least(h, v_hoy)::timestamp, interval '1 day') g(dia)
      left join public.bi_cargas k on k.fuente = 'pos' and k.company_id = c.company_id and k.fecha = g.dia::date),
    'kpis', (select jsonb_build_object('venta_cent', coalesce(sum(importe_neto_cent), 0), 'venta_bruta_cent', coalesce(sum(importe_cent), 0), 'tickets', count(distinct (fuente, company_id, fecha, pedido)),
      'lineas', count(*), 'unidades', coalesce(sum(unidades), 0)) from bi_f),
    'por_grupo', coalesce((select jsonb_agg(jsonb_build_object('grupo', grupo, 'venta_cent', s) order by s desc) from (select grupo, sum(importe_neto_cent) s from bi_f group by 1) x), '[]'),
    'por_cafe', coalesce((select jsonb_agg(jsonb_build_object('cafe', cafe, 'venta_cent', s) order by s desc) from (select coalesce(contiene_cafe, 'Sin dato') cafe, sum(importe_neto_cent) s from bi_f where grupo = 'Bebida' group by 1) x), '[]'),
    'por_master', coalesce((select jsonb_agg(jsonb_build_object('categoria', categoria_master, 'venta_cent', s) order by s desc) from (select categoria_master, sum(importe_neto_cent) s from bi_f group by 1) x), '[]'),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dow', dow, 'venta_cent', s, 'tickets', t) order by dow) from (select extract(dow from fecha)::int dow, sum(importe_neto_cent) s, count(distinct (fuente, company_id, fecha, pedido)) t from bi_f group by 1) x), '[]'),
    'por_hora', coalesce((select jsonb_agg(jsonb_build_object('hora', hora, 'venta_cent', s, 'tickets', t) order by hora) from (select hora, sum(importe_neto_cent) s, count(distinct (fuente, company_id, fecha, pedido)) t from bi_f group by 1) x), '[]'),
    'por_pago', coalesce((select jsonb_agg(jsonb_build_object('etiqueta', etiqueta_pago, 'venta_cent', s, 'tickets', t) order by s desc) from (select etiqueta_pago, sum(importe_neto_cent) s, count(distinct (fuente, company_id, fecha, pedido)) t from bi_f group by 1) x), '[]'),
    'por_pago_tienda', coalesce((select jsonb_agg(jsonb_build_object('etiqueta', etiqueta_pago, 'company_id', company_id, 'venta_cent', s) order by etiqueta_pago, s desc) from (select etiqueta_pago, company_id, sum(importe_neto_cent) s from bi_f group by 1, 2) x), '[]'),
    'por_tienda_dia', coalesce((select jsonb_agg(jsonb_build_object('company_id', company_id, 'dow', dow, 'venta_cent', s, 'tickets', t) order by company_id, dow) from (select company_id, extract(dow from fecha)::int dow, sum(importe_neto_cent) s, count(distinct (fuente, company_id, fecha, pedido)) t from bi_f group by 1, 2) x), '[]'),
    'promociones', coalesce((select jsonb_agg(jsonb_build_object('company_id', company_id, 'promocion', promocion, 'unidades', u, 'venta_cent', s) order by company_id, promocion) from (select company_id, promocion, sum(unidades) u, sum(importe_neto_cent) s from bi_f group by 1, 2) x), '[]'),
    'ranking', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre, 'mes', mes, 'unidades', u, 'venta_cent', s, 'lineas', n) order by mes, s desc, codigo) from (select codigo, min(nombre) nombre, date_trunc('month', fecha)::date mes, sum(unidades) u, sum(importe_neto_cent) s, count(*) n from bi_f group by codigo, 3) x), '[]'),
    'fuentes', coalesce((select jsonb_agg(jsonb_build_object('fuente', fuente, 'canal', canal, 'venta_cent', s) order by fuente, canal) from (select fuente, canal, sum(importe_neto_cent) s from bi_f group by 1, 2) x), '[]')
  ) into r;
  return r;
end $$;

-- Ventas por Año y por Semana (R9 y R10 de Zoho): ignoran Fecha Relativa, Rango de Fechas y Semanas;
-- aplican los demás filtros, de 2024-01-01 a hoy.
create or replace function public.bi_tendencias(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_hoy date := coalesce((p->>'hoy')::date, current_date);
  r jsonb;
begin
  with bi_f as materialized (select * from public.bi_lineas_filtradas(p, date '2024-01-01', v_hoy, false))
  select jsonb_build_object(
    'por_mes', coalesce((select jsonb_agg(jsonb_build_object('anio', a, 'mes', m, 'venta_cent', s) order by a, m)
      from (select extract(year from fecha)::int a, extract(month from fecha)::int m, sum(importe_neto_cent) s from bi_f group by 1, 2) x), '[]'),
    'por_semana', coalesce((select jsonb_agg(jsonb_build_object('anio', a, 'semana', w, 'venta_cent', s) order by a, w)
      from (select public.bi_anio_semana(fecha) a, public.bi_semana(fecha) w, sum(importe_neto_cent) s from bi_f group by 1, 2) x), '[]')
  ) into r;
  return r;
end $$;

revoke all on function public.bi_tablero(jsonb) from public, anon;
revoke all on function public.bi_tendencias(jsonb) from public, anon;
grant execute on function public.bi_tablero(jsonb) to authenticated;
grant execute on function public.bi_tendencias(jsonb) to authenticated;
