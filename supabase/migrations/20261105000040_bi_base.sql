-- BI «The Coffee México» (docs/superpowers/specs/2026-11-05-bi-the-coffee-mexico-design.md, docs/bi/01-BASE.md).
-- Hechos por línea de producto, sin datos de clientes. Tablas cerradas al portal: se escriben solo por RPC de
-- service_role y se leen solo por RPC con sucursales_acceso (que ya niega tokens OAuth, migración 24).

-- ===== Parte 1: tablas y guardado de un día =====

-- Contrato del código de producto: mayúsculas, sin espacios al inicio ni al final y con los espacios internos
-- (también el no separable U+00A0) colapsados a uno. Sin set search_path a propósito: es pura (no toca tablas) y así
-- el planificador puede inlinearla; todo lo que usa es de pg_catalog.
create function public.bi_codigo(p text) returns text
language sql immutable as $$
  select upper(btrim(regexp_replace(replace(p, chr(160), ' '), '\s+', ' ', 'g')));
$$;

create table public.bi_lineas (
  fuente text not null check (fuente in ('pos', 'zoho_rappi')),
  company_id integer not null check (company_id > 0),
  fecha date not null,
  pedido text not null check (btrim(pedido) <> ''),
  linea smallint not null check (linea > 0),
  hora smallint not null check (hora between 0 and 23),
  canal text not null check (canal in ('mostrador', 'app', 'rappi', 'desconocido')),
  metodo_pago text not null,
  tipo_pago text not null default '',
  smartphone boolean not null default false,
  opcion_consumo text,
  codigo text not null,
  nombre text not null,
  unidades numeric not null check (unidades >= 0),
  importe_cent bigint not null,
  descuento_cent bigint not null default 0,
  primary key (fuente, company_id, fecha, pedido, linea)
);
create index bi_lineas_fecha on public.bi_lineas (fecha, company_id);

-- Un día cargado por fuente y tienda. Sin fila = sin datos (nunca cero). rappi_en_pos: ese día el POS ya trae Rappi
-- (del portal o del propio POS); entonces el Rappi de Zoho de ese día se ignora al leer.
create table public.bi_cargas (
  fuente text not null check (fuente in ('pos', 'zoho_rappi')),
  company_id integer not null check (company_id > 0),
  fecha date not null,
  leido_en timestamptz not null,
  completa boolean not null,
  rappi_en_pos boolean not null default false,
  lineas integer not null,
  primary key (fuente, company_id, fecha)
);

create table public.bi_tiendas (
  company_id integer primary key check (company_id > 0),
  store_id integer not null unique check (store_id > 0),
  nombre text not null check (btrim(nombre) <> ''),
  franquiciatario text,
  tipo text not null check (tipo in ('Sucursales Propias', 'Franquicia')),
  fecha_apertura date,
  origen_apertura text check (origen_apertura in ('crm', 'pos', 'zoho')),
  actualizado_en timestamptz not null default now()
);

create table public.bi_clasificacion_producto (
  codigo text not null check (btrim(codigo) <> '' and codigo = public.bi_codigo(codigo)),
  vigente_desde date not null,
  categoria_master text not null,
  grupo text not null check (grupo in ('Bebida', 'Comida', 'Combo', 'Merch', 'Otros')),
  contiene_cafe text check (contiene_cafe in ('Sí', 'No')),
  promocion text not null default 'Producto regular'
    check (promocion in ('Producto regular', 'Promoción alimentos y bebidas', 'Promoción café')),
  origen text not null,
  primary key (codigo, vigente_desde)
);

create table public.bi_mapeo_pago (
  metodo_pos text not null,
  tipo_pos text not null default '',
  smartphone boolean not null,
  etiqueta text not null check (btrim(etiqueta) <> ''),
  primary key (metodo_pos, tipo_pos, smartphone)
);

create table public.bi_metas (
  company_id integer not null check (company_id > 0),
  mes date not null check (extract(day from mes) = 1),
  venta_cent bigint not null check (venta_cent >= 0),
  tickets integer not null check (tickets >= 0),
  ticket_promedio_cent bigint not null check (ticket_promedio_cent >= 0),
  actualizado_por uuid,
  actualizado_en timestamptz not null default now(),
  primary key (company_id, mes)
);

create table public.bi_punto_equilibrio (
  company_id integer not null check (company_id > 0),
  mes date not null check (extract(day from mes) = 1),
  pe_cent bigint not null check (pe_cent >= 0),
  actualizado_por uuid,
  actualizado_en timestamptz not null default now(),
  primary key (company_id, mes)
);

alter table public.bi_lineas enable row level security;
alter table public.bi_cargas enable row level security;
alter table public.bi_tiendas enable row level security;
alter table public.bi_clasificacion_producto enable row level security;
alter table public.bi_mapeo_pago enable row level security;
alter table public.bi_metas enable row level security;
alter table public.bi_punto_equilibrio enable row level security;
revoke all on public.bi_lineas, public.bi_cargas, public.bi_tiendas, public.bi_clasificacion_producto,
  public.bi_mapeo_pago, public.bi_metas, public.bi_punto_equilibrio from anon, authenticated;

-- Guarda un día de una tienda y fuente, reemplazando lo anterior en una sola transacción.
-- p_rappi_portal: la tienda tiene el portal de Rappi y el POS de ese día ya lo trae; se pasa en cada guardado 'pos'
-- de esas tiendas, para que un guardado posterior no borre la marca. La tienda debe existir en bi_tiendas.
create function public.bi_guardar_dia(p_fuente text, p_company integer, p_fecha date, p_completa boolean,
  p_leido_en timestamptz, p_lineas jsonb, p_rappi_portal boolean default false) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n integer;
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
  delete from public.bi_lineas where fuente = p_fuente and company_id = p_company and fecha = p_fecha;
  insert into public.bi_lineas (fuente, company_id, fecha, pedido, linea, hora, canal, metodo_pago, tipo_pago,
    smartphone, opcion_consumo, codigo, nombre, unidades, importe_cent, descuento_cent)
  select p_fuente, p_company, p_fecha, x.pedido, x.linea, x.hora, x.canal, x.metodo_pago, coalesce(x.tipo_pago, ''),
    coalesce(x.smartphone, false), x.opcion_consumo, public.bi_codigo(x.codigo), x.nombre, x.unidades, x.importe_cent,
    coalesce(x.descuento_cent, 0)
  from jsonb_to_recordset(p_lineas) as x(pedido text, linea smallint, hora smallint, canal text, metodo_pago text,
    tipo_pago text, smartphone boolean, opcion_consumo text, codigo text, nombre text, unidades numeric,
    importe_cent bigint, descuento_cent bigint);
  get diagnostics n = row_count;
  insert into public.bi_cargas (fuente, company_id, fecha, leido_en, completa, rappi_en_pos, lineas)
  values (p_fuente, p_company, p_fecha, p_leido_en, p_completa,
    p_fuente = 'pos' and (coalesce(p_rappi_portal, false)
      or exists (select 1 from jsonb_to_recordset(p_lineas) as y(canal text) where y.canal = 'rappi')),
    n)
  on conflict (fuente, company_id, fecha) do update set leido_en = excluded.leido_en, completa = excluded.completa,
    rappi_en_pos = excluded.rappi_en_pos, lineas = excluded.lineas;
  return n;
end $$;

revoke all on function public.bi_guardar_dia(text, integer, date, boolean, timestamptz, jsonb, boolean)
  from public, anon, authenticated;
grant execute on function public.bi_guardar_dia(text, integer, date, boolean, timestamptz, jsonb, boolean)
  to service_role;

-- ===== Parte 2: semana y maduración =====

-- Las cuatro funciones siguientes son puras (no tocan tablas) y no llevan set search_path a propósito: con él el
-- planificador no puede inlinearlas y se evaluarían por cada línea.

-- Semana como la rotula Zoho. Evidencia (docs/bi/zoho/filtros.json, semana.muestras): weekofyear(Date,2) de Zoho
-- coincide con la semana ISO (empieza en lunes; la semana 1 contiene el primer jueves del año).
create function public.bi_semana(p date) returns integer
language sql immutable as $$
  select extract(week from p)::int;
$$;

-- Año de la etiqueta «W{semana} {año}». Zoho usa el año CALENDARIO de la fecha, no el año ISO: el 2025-12-31 cae
-- en la semana 1 y Zoho lo rotula «W1 2025» (y no «W1 2026»). Se replica tal cual, aunque sea una rareza.
create function public.bi_anio_semana(p date) returns integer
language sql immutable as $$
  select extract(year from p)::int;
$$;

-- Meses completos entre la apertura (primera transacción de la tienda) y la fecha de referencia.
create function public.bi_meses_operando(p_apertura date, p_ref date) returns integer
language sql immutable as $$
  select (extract(year from age(p_ref, p_apertura)) * 12 + extract(month from age(p_ref, p_apertura)))::int;
$$;

-- Tramos de filtros.json (maduracion). En Zoho se mide contra hoy: quien llama pasa current_date como p_ref.
create function public.bi_maduracion(p_apertura date, p_ref date) returns text
language sql immutable as $$
  select case
    when p_apertura is null or p_ref is null then null
    when public.bi_meses_operando(p_apertura, p_ref) < 3 then 'Menor de 3 meses'
    else 'Mayor de 3 meses'
  end;
$$;

-- ===== Parte 3: lectura del tablero con los filtros =====

-- Tiendas visibles para un usuario con los filtros que dependen solo de la tienda (franquiciatarios, tipos, comparable,
-- años operando y maduración), resueltos UNA vez por consulta y no por línea. Sin duplicados aunque p repita una
-- compañía. Comparable, Años Operando y Maduración se miden contra HOY (no la fecha de la venta), como en Zoho
-- (docs/bi/zoho/filtros.json). La clave opcional «hoy» de p existe para que las pruebas sean fijas.
create function public.bi_tiendas_filtradas(p jsonb)
returns table (company_id integer, fecha_apertura date)
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct t.company_id, t.fecha_apertura
  from jsonb_array_elements_text(coalesce(p->'companias', '[]'::jsonb)) c
  join public.bi_tiendas t on t.company_id = c::integer
  where public.sucursales_acceso(t.company_id)
    and (jsonb_array_length(coalesce(p->'franquiciatarios', '[]')) = 0 or t.franquiciatario in (select x from jsonb_array_elements_text(p->'franquiciatarios') x))
    and (jsonb_array_length(coalesce(p->'tipos', '[]')) = 0 or t.tipo in (select x from jsonb_array_elements_text(p->'tipos') x))
    and (jsonb_array_length(coalesce(p->'anios_operando', '[]')) = 0
      or (public.bi_meses_operando(t.fecha_apertura, coalesce((p->>'hoy')::date, current_date)) / 12) in (select x::int from jsonb_array_elements_text(p->'anios_operando') x))
    and (p->'comparable' is null or jsonb_typeof(p->'comparable') = 'null'
      or (coalesce(public.bi_meses_operando(t.fecha_apertura, coalesce((p->>'hoy')::date, current_date)) >= 12, false) = (p->>'comparable')::boolean))
    and (jsonb_array_length(coalesce(p->'maduracion', '[]')) = 0
      or public.bi_maduracion(t.fecha_apertura, coalesce((p->>'hoy')::date, current_date)) in (select x from jsonb_array_elements_text(p->'maduracion') x));
$$;
revoke all on function public.bi_tiendas_filtradas(jsonb) from public, anon, authenticated;

-- Líneas visibles para un usuario con sus filtros: una sola definición que usan bi_tablero y bi_tendencias.
-- Devuelve también el canal, para distinguir el Rappi del portal (fuente pos) del de Zoho (spec §2.3).
create function public.bi_lineas_filtradas(p jsonb, p_desde date, p_hasta date, p_con_semanas boolean)
returns table (fuente text, company_id integer, fecha date, pedido text, canal text, hora smallint, codigo text,
  nombre text, unidades numeric, importe_cent bigint, etiqueta_pago text, grupo text, categoria_master text,
  contiene_cafe text, promocion text)
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v integer[];
begin
  v := array(select t.company_id from public.bi_tiendas_filtradas(p) t);
  return query
  select l.fuente, l.company_id, l.fecha, l.pedido, l.canal, l.hora, l.codigo, l.nombre, l.unidades, l.importe_cent,
    coalesce(mp.etiqueta, l.metodo_pago), coalesce(cl.grupo, 'Otros'), coalesce(cl.categoria_master, 'Sin clasificar'),
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
    and (p->>'monto_min' is null or l.importe_cent >= (p->>'monto_min')::numeric * 100)
    and (p->>'monto_max' is null or l.importe_cent <= (p->>'monto_max')::numeric * 100);
end $$;
revoke all on function public.bi_lineas_filtradas(jsonb, date, date, boolean) from public, anon, authenticated;

create function public.bi_tablero(p jsonb) returns jsonb
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
    'kpis', (select jsonb_build_object('venta_cent', coalesce(sum(importe_cent), 0), 'tickets', count(distinct (fuente, company_id, fecha, pedido)),
      'lineas', count(*), 'unidades', coalesce(sum(unidades), 0)) from bi_f),
    'por_grupo', coalesce((select jsonb_agg(jsonb_build_object('grupo', grupo, 'venta_cent', s) order by s desc) from (select grupo, sum(importe_cent) s from bi_f group by 1) x), '[]'),
    'por_cafe', coalesce((select jsonb_agg(jsonb_build_object('cafe', cafe, 'venta_cent', s) order by s desc) from (select coalesce(contiene_cafe, 'Sin dato') cafe, sum(importe_cent) s from bi_f where grupo = 'Bebida' group by 1) x), '[]'),
    'por_master', coalesce((select jsonb_agg(jsonb_build_object('categoria', categoria_master, 'venta_cent', s) order by s desc) from (select categoria_master, sum(importe_cent) s from bi_f group by 1) x), '[]'),
    'por_dia', coalesce((select jsonb_agg(jsonb_build_object('dow', dow, 'venta_cent', s, 'tickets', t) order by dow) from (select extract(dow from fecha)::int dow, sum(importe_cent) s, count(distinct (fuente, company_id, fecha, pedido)) t from bi_f group by 1) x), '[]'),
    'por_hora', coalesce((select jsonb_agg(jsonb_build_object('hora', hora, 'venta_cent', s, 'tickets', t) order by hora) from (select hora, sum(importe_cent) s, count(distinct (fuente, company_id, fecha, pedido)) t from bi_f group by 1) x), '[]'),
    'por_pago', coalesce((select jsonb_agg(jsonb_build_object('etiqueta', etiqueta_pago, 'venta_cent', s, 'tickets', t) order by s desc) from (select etiqueta_pago, sum(importe_cent) s, count(distinct (fuente, company_id, fecha, pedido)) t from bi_f group by 1) x), '[]'),
    'por_pago_tienda', coalesce((select jsonb_agg(jsonb_build_object('etiqueta', etiqueta_pago, 'company_id', company_id, 'venta_cent', s) order by etiqueta_pago, s desc) from (select etiqueta_pago, company_id, sum(importe_cent) s from bi_f group by 1, 2) x), '[]'),
    'por_tienda_dia', coalesce((select jsonb_agg(jsonb_build_object('company_id', company_id, 'dow', dow, 'venta_cent', s, 'tickets', t) order by company_id, dow) from (select company_id, extract(dow from fecha)::int dow, sum(importe_cent) s, count(distinct (fuente, company_id, fecha, pedido)) t from bi_f group by 1, 2) x), '[]'),
    'promociones', coalesce((select jsonb_agg(jsonb_build_object('company_id', company_id, 'promocion', promocion, 'unidades', u, 'venta_cent', s) order by company_id, promocion) from (select company_id, promocion, sum(unidades) u, sum(importe_cent) s from bi_f group by 1, 2) x), '[]'),
    'ranking', coalesce((select jsonb_agg(jsonb_build_object('codigo', codigo, 'nombre', nombre, 'mes', mes, 'unidades', u, 'venta_cent', s, 'lineas', n) order by mes, s desc, codigo) from (select codigo, min(nombre) nombre, date_trunc('month', fecha)::date mes, sum(unidades) u, sum(importe_cent) s, count(*) n from bi_f group by codigo, 3) x), '[]'),
    'fuentes', coalesce((select jsonb_agg(jsonb_build_object('fuente', fuente, 'canal', canal, 'venta_cent', s) order by fuente, canal) from (select fuente, canal, sum(importe_cent) s from bi_f group by 1, 2) x), '[]')
  ) into r;
  return r;
end $$;

-- Ventas por Año y por Semana (R9 y R10 de Zoho): ignoran Fecha Relativa, Rango de Fechas y Semanas;
-- aplican los demás filtros, de 2024-01-01 a hoy.
create function public.bi_tendencias(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_hoy date := coalesce((p->>'hoy')::date, current_date);
  r jsonb;
begin
  with bi_f as materialized (select * from public.bi_lineas_filtradas(p, date '2024-01-01', v_hoy, false))
  select jsonb_build_object(
    'por_mes', coalesce((select jsonb_agg(jsonb_build_object('anio', a, 'mes', m, 'venta_cent', s) order by a, m)
      from (select extract(year from fecha)::int a, extract(month from fecha)::int m, sum(importe_cent) s from bi_f group by 1, 2) x), '[]'),
    'por_semana', coalesce((select jsonb_agg(jsonb_build_object('anio', a, 'semana', w, 'venta_cent', s) order by a, w)
      from (select public.bi_anio_semana(fecha) a, public.bi_semana(fecha) w, sum(importe_cent) s from bi_f group by 1, 2) x), '[]')
  ) into r;
  return r;
end $$;

revoke all on function public.bi_tablero(jsonb) from public, anon;
revoke all on function public.bi_tendencias(jsonb) from public, anon;
grant execute on function public.bi_tablero(jsonb) to authenticated;
grant execute on function public.bi_tendencias(jsonb) to authenticated;
