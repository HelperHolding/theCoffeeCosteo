-- BI F4 (docs/superpowers/specs/2026-11-05-bi-f4-tablero-design.md §2.2): módulo bi, acceso por bi_acceso,
-- etiqueta de pago por fecha (Zoho llamaba «WALLET» a WALLET_BALANCE hasta el 2026-02-28), venta por fecha y opciones
-- de los filtros.

-- 1. Módulo bi.
alter table public.perfil_modulos drop constraint perfil_modulos_modulo_check;
alter table public.perfil_modulos add constraint perfil_modulos_modulo_check
  check (modulo in ('crm', 'sucursales', 'sucursales_costeo', 'bi'));

-- 2. Acceso al BI: módulo bi + sucursal asignada + perfil activo; sin tokens OAuth (MCP).
create function public.bi_acceso(p_company integer) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (auth.jwt()->>'client_id') is null and exists (
    select 1 from public.perfiles p
    join public.perfil_modulos m on m.user_id = p.user_id and m.modulo = 'bi'
    join public.perfil_sucursales s on s.user_id = p.user_id and s.company_id = p_company
    where p.user_id = auth.uid() and p.activo)
$$;
revoke all on function public.bi_acceso(integer) from public, anon;
grant execute on function public.bi_acceso(integer) to authenticated;

-- 3. bi_tiendas_filtradas: misma definición que la 40, con bi_acceso en lugar de sucursales_acceso.
create or replace function public.bi_tiendas_filtradas(p jsonb)
returns table (company_id integer, fecha_apertura date)
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct t.company_id, t.fecha_apertura
  from jsonb_array_elements_text(coalesce(p->'companias', '[]'::jsonb)) c
  join public.bi_tiendas t on t.company_id = c::integer
  where public.bi_acceso(t.company_id)
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

-- 4. Pago por fecha.
alter table public.bi_mapeo_pago add column vigente_desde date not null default '2000-01-01';
alter table public.bi_mapeo_pago add column vigente_hasta date;
alter table public.bi_mapeo_pago drop constraint bi_mapeo_pago_pkey;
alter table public.bi_mapeo_pago add primary key (metodo_pos, tipo_pos, smartphone, vigente_desde);
alter table public.bi_mapeo_pago add constraint bi_mapeo_pago_vigencia
  check (vigente_hasta is null or vigente_hasta >= vigente_desde);
update public.bi_mapeo_pago set vigente_desde = '2026-03-01'
  where metodo_pos = 'WALLET_BALANCE' and tipo_pos = 'WALLET' and smartphone;
insert into public.bi_mapeo_pago (metodo_pos, tipo_pos, smartphone, etiqueta, vigente_desde, vigente_hasta)
  values ('WALLET_BALANCE', 'WALLET', true, 'WALLET', '2000-01-01', '2026-02-28');

-- 5. bi_lineas_filtradas: misma definición que la 42; el join del mapeo de pago agrega la vigencia por fecha.
create or replace function public.bi_lineas_filtradas(p jsonb, p_desde date, p_hasta date, p_con_semanas boolean)
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
    and l.fecha >= mp.vigente_desde and (mp.vigente_hasta is null or l.fecha <= mp.vigente_hasta)
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

-- 6. bi_tablero: misma definición que la 42 más por_fecha (venta neta y tickets por día).
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
    'fuentes', coalesce((select jsonb_agg(jsonb_build_object('fuente', fuente, 'canal', canal, 'venta_cent', s) order by fuente, canal) from (select fuente, canal, sum(importe_neto_cent) s from bi_f group by 1, 2) x), '[]'),
    'por_fecha', coalesce((select jsonb_agg(jsonb_build_object('fecha', f, 'venta_cent', s, 'tickets', t) order by f) from (select fecha f, sum(importe_neto_cent) s, count(distinct (fuente, company_id, fecha, pedido)) t from bi_f group by 1) x), '[]')
  ) into r;
  return r;
end $$;

revoke all on function public.bi_tablero(jsonb) from public, anon;
grant execute on function public.bi_tablero(jsonb) to authenticated;

-- 7. Opciones de los filtros: solo de tiendas con bi_acceso.
create function public.bi_opciones(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d date := (p->>'desde')::date;
  h date := (p->>'hasta')::date;
  v integer[];
  r jsonb;
begin
  if d is null or h is null or d > h or h - d > 1100 then
    raise exception 'Periodo inválido (máximo 1,100 días).';
  end if;
  v := array(select t.company_id from public.bi_tiendas t where public.bi_acceso(t.company_id));
  select jsonb_build_object(
    'tiendas', coalesce((select jsonb_agg(jsonb_build_object('company_id', t.company_id, 'store_id', t.store_id,
        'nombre', t.nombre, 'franquiciatario', t.franquiciatario, 'tipo', t.tipo) order by t.nombre)
      from public.bi_tiendas t where t.company_id = any(v)), '[]'),
    'franquiciatarios', coalesce((select jsonb_agg(x order by x) from (select distinct franquiciatario x
      from public.bi_tiendas where company_id = any(v) and franquiciatario is not null) y), '[]'),
    'tipos', coalesce((select jsonb_agg(x order by x) from (select distinct tipo x
      from public.bi_tiendas where company_id = any(v)) y), '[]'),
    'categorias', (select jsonb_agg(x order by x) from (select distinct categoria_master x
      from public.bi_clasificacion_producto union select 'Sin clasificar') y),
    'grupos', (select jsonb_agg(x order by x) from (select distinct grupo x
      from public.bi_clasificacion_producto union select 'Otros') y),
    'productos', coalesce((select jsonb_agg(x order by x) from (select distinct l.nombre x from public.bi_lineas l
      where l.company_id = any(v) and l.fecha between d and h) y), '[]'),
    'pagos', coalesce((select jsonb_agg(x order by x) from (select distinct coalesce(mp.etiqueta, l.metodo_pago) x
      from public.bi_lineas l
      left join public.bi_mapeo_pago mp on mp.metodo_pos = l.metodo_pago and mp.tipo_pos = l.tipo_pago
        and mp.smartphone = l.smartphone and l.fecha >= mp.vigente_desde
        and (mp.vigente_hasta is null or l.fecha <= mp.vigente_hasta)
      where l.company_id = any(v) and l.fecha between d and h) y), '[]'),
    'semanas', coalesce((select jsonb_agg(w order by a, s) from (select distinct public.bi_anio_semana(l.fecha) a,
        public.bi_semana(l.fecha) s, 'W' || public.bi_semana(l.fecha) || ' ' || public.bi_anio_semana(l.fecha) w
      from public.bi_lineas l where l.company_id = any(v) and l.fecha between d and h) y), '[]'),
    'ultimo_corte', (select max(k.leido_en) from public.bi_cargas k
      where k.fuente = 'pos' and k.company_id = any(v) and k.fecha between d and h),
    -- Tiendas con venta en el periodo y algún día sin Rappi del POS: hasta F3 su Rappi (de Zoho) falta.
    'tiendas_sin_rappi', (select count(distinct k.company_id) from public.bi_cargas k
      where k.fuente = 'pos' and k.company_id = any(v) and k.fecha between d and h and not k.rappi_en_pos)
  ) into r;
  return r;
end $$;
revoke all on function public.bi_opciones(jsonb) from public, anon;
grant execute on function public.bi_opciones(jsonb) to authenticated;
