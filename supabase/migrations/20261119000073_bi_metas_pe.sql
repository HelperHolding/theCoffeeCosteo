-- BI F5 (docs/bi/04-METAS-PE.md): metas de venta y punto de equilibrio en el tablero.
-- La meta mensual (bi_metas) se reparte por día con factores de día de la semana por tienda, como la QT de Zoho
-- «Meta de Venta por Día de la semana», pero con los factores FIJOS por mes: salen de las 12 semanas completas
-- (lunes a domingo) antes de la semana del día 1, no de las 12 semanas antes de hoy. Así la meta de un día no cambia
-- cada semana. El P.E. diario es el P.E. del mes ÷ días del mes (QT «Abraham Punto de Equilibrio Diario»).

-- 1. Fecha de apertura de la meta: antes de ella la meta diaria es 0 y el mes se reparte entre los días abiertos.
alter table public.bi_metas add column fecha_apertura date;

-- 2. Meta diaria por tienda (la escribe bi_recalcular_metas; nadie más).
create table public.bi_metas_diarias (
  company_id integer not null check (company_id > 0),
  fecha date not null,
  venta_cent bigint not null check (venta_cent >= 0),
  tickets numeric(12, 2) not null check (tickets >= 0),
  factor_venta numeric(6, 2) not null,
  factor_tickets numeric(6, 2) not null,
  ventana_desde date not null,
  ventana_hasta date not null,
  primary key (company_id, fecha)
);
alter table public.bi_metas_diarias enable row level security;
revoke all on public.bi_metas_diarias from anon, authenticated;

-- 3. Reparte las metas de un mes por día. Idempotente: borra y reescribe el mes completo.
--    Factor del día = venta promedio de ese día de la semana ÷ venta promedio diaria de la tienda en la ventana,
--    redondeado a 2 decimales (igual con tickets). Solo cuentan los días con venta, como en Zoho. Sin historia en la
--    ventana (tienda nueva) el factor es 1. Antes de la apertura de la meta la meta es 0.
create function public.bi_recalcular_metas(p_mes date) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_ancla date;
  v_fin date;
  n integer;
begin
  if p_mes is null or extract(day from p_mes) <> 1 then
    raise exception 'p_mes debe ser el día 1 de un mes.';
  end if;
  v_ancla := p_mes - (extract(isodow from p_mes)::int - 1);
  v_fin := (p_mes + interval '1 month - 1 day')::date;
  delete from public.bi_metas_diarias where fecha between p_mes and v_fin;
  with m as (select * from public.bi_metas where mes = p_mes),
  dia as (
    select l.company_id, l.fecha, sum(coalesce(l.importe_neto_cent, l.importe_cent))::numeric venta,
      count(distinct (l.fuente, l.pedido))::numeric tickets
    from public.bi_lineas l
    where l.company_id in (select company_id from m) and l.fecha >= v_ancla - 84 and l.fecha < v_ancla
      and (l.fuente <> 'zoho_rappi' or not exists (select 1 from public.bi_cargas k where k.fuente = 'pos'
        and k.company_id = l.company_id and k.fecha = l.fecha and k.rappi_en_pos))
    group by 1, 2),
  glob as (select company_id, avg(venta) gv, avg(tickets) gt from dia group by 1),
  fac as (
    select x.company_id, x.dow,
      case when g.gv = 0 then 0 else round(x.pv / g.gv, 2) end fv,
      case when g.gt = 0 then 0 else round(x.pt / g.gt, 2) end ft
    from (select company_id, extract(isodow from fecha)::int dow, avg(venta) pv, avg(tickets) pt from dia group by 1, 2) x
    join glob g using (company_id)),
  cal as (
    select m.company_id, g.dia::date fecha, m.venta_cent, m.tickets, g.dia::date >= coalesce(m.fecha_apertura, p_mes) abierto,
      coalesce(f.fv, 1) fv, coalesce(f.ft, 1) ft
    from m
    cross join lateral generate_series(p_mes::timestamp, v_fin::timestamp, interval '1 day') g(dia)
    left join fac f on f.company_id = m.company_id and f.dow = extract(isodow from g.dia)::int),
  peso as (select company_id, sum(fv) filter (where abierto) pv, sum(ft) filter (where abierto) pt from cal group by 1)
  insert into public.bi_metas_diarias (company_id, fecha, venta_cent, tickets, factor_venta, factor_tickets, ventana_desde, ventana_hasta)
  select c.company_id, c.fecha,
    case when not c.abierto or coalesce(w.pv, 0) <= 0 then 0 else round(c.venta_cent * c.fv / w.pv) end,
    case when not c.abierto or coalesce(w.pt, 0) <= 0 then 0 else round(c.tickets * c.ft / w.pt, 2) end,
    c.fv, c.ft, v_ancla - 84, v_ancla - 1
  from cal c join peso w using (company_id);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.bi_recalcular_metas(date) from public, anon, authenticated;
grant execute on function public.bi_recalcular_metas(date) to service_role;

-- 4. bi_tablero: misma definición que la 43 más «metas». La meta y el P.E. son de la tienda completa y respetan
--    solo los filtros de tienda, día de la semana y semana; la pantalla no los compara si hay filtros de producto,
--    pago, hora o monto. «Corriente» = solo los días de tienda con carga del POS (y la venta de esos mismos días).
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
    'por_fecha', coalesce((select jsonb_agg(jsonb_build_object('fecha', f, 'venta_cent', s, 'tickets', t) order by f) from (select fecha f, sum(importe_neto_cent) s, count(distinct (fuente, company_id, fecha, pedido)) t from bi_f group by 1) x), '[]'),
    'metas', (
      with t as (select c.company_id, c.fecha_apertura from public.bi_tiendas_filtradas(p) c),
      cal as (
        select t.company_id, g.dia::date fecha, g.dia::date >= coalesce(t.fecha_apertura, d) abierta
        from t cross join lateral generate_series(d::timestamp, h::timestamp, interval '1 day') g(dia)
        where (jsonb_array_length(coalesce(p->'dias', '[]')) = 0 or extract(dow from g.dia)::int in (select x::int from jsonb_array_elements_text(p->'dias') x))
          and (jsonb_array_length(coalesce(p->'semanas', '[]')) = 0
            or ('W' || public.bi_semana(g.dia::date) || ' ' || public.bi_anio_semana(g.dia::date)) in (select x from jsonb_array_elements_text(p->'semanas') x))),
      cg as (
        select cal.*, exists (select 1 from public.bi_cargas k where k.fuente = 'pos' and k.company_id = cal.company_id and k.fecha = cal.fecha) cargado
        from cal),
      v as (select company_id, fecha, sum(importe_neto_cent) s, count(distinct (fuente, pedido)) tk from bi_f group by 1, 2),
      md as (
        select cg.company_id, cg.fecha, cg.cargado, m.venta_cent meta, m.tickets meta_tk, coalesce(v.s, 0) venta, coalesce(v.tk, 0) tk
        from cg join public.bi_metas_diarias m on m.company_id = cg.company_id and m.fecha = cg.fecha
        left join v on v.company_id = cg.company_id and v.fecha = cg.fecha),
      pd as (
        select cg.company_id, cg.fecha, cg.cargado,
          e.pe_cent::numeric / extract(day from (e.mes + interval '1 month - 1 day')) pe, coalesce(v.s, 0) venta
        from cg join public.bi_punto_equilibrio e on e.company_id = cg.company_id and e.mes = date_trunc('month', cg.fecha)::date
        left join v on v.company_id = cg.company_id and v.fecha = cg.fecha),
      mt as (
        select company_id, sum(meta) meta, sum(meta_tk) meta_tk,
          coalesce(sum(meta) filter (where cargado), 0) meta_c, coalesce(sum(meta_tk) filter (where cargado), 0) meta_tk_c,
          coalesce(sum(venta) filter (where cargado), 0) venta_c, coalesce(sum(tk) filter (where cargado), 0) tk_c
        from md group by 1),
      pt as (
        select company_id, sum(pe) pe, coalesce(sum(pe) filter (where cargado), 0) pe_c,
          coalesce(sum(venta) filter (where cargado), 0) venta_c
        from pd group by 1)
      select jsonb_build_object(
        'tiendas', (select count(*) from t),
        'tiendas_con_meta', (select count(*) from mt),
        -- Días de tienda abiertos (por la apertura real) del periodo sin meta cargada; incluye días futuros.
        'dias_sin_meta', (select count(*) from cal where abierta
          and not exists (select 1 from md where md.company_id = cal.company_id and md.fecha = cal.fecha)),
        'meta_cent', round(coalesce((select sum(meta) from mt), 0)),
        'meta_tickets', round(coalesce((select sum(meta_tk) from mt), 0), 2),
        'meta_corriente_cent', round(coalesce((select sum(meta_c) from mt), 0)),
        'meta_tickets_corriente', round(coalesce((select sum(meta_tk_c) from mt), 0), 2),
        'venta_corriente_cent', coalesce((select sum(venta_c) from mt), 0),
        'tickets_corriente', coalesce((select sum(tk_c) from mt), 0),
        'por_tienda', coalesce((select jsonb_agg(jsonb_build_object('company_id', company_id, 'meta_cent', round(meta),
          'meta_corriente_cent', round(meta_c), 'venta_corriente_cent', venta_c) order by company_id) from mt), '[]'),
        'tiendas_con_pe', (select count(*) from pt),
        'pe_cent', round(coalesce((select sum(pe) from pt), 0)),
        'pe_corriente_cent', round(coalesce((select sum(pe_c) from pt), 0)),
        'venta_pe_corriente_cent', coalesce((select sum(venta_c) from pt), 0),
        'pe_por_tienda', coalesce((select jsonb_agg(jsonb_build_object('company_id', company_id, 'pe_cent', round(pe),
          'pe_corriente_cent', round(pe_c), 'venta_corriente_cent', venta_c) order by company_id) from pt), '[]')
      ))
  ) into r;
  return r;
end $$;

revoke all on function public.bi_tablero(jsonb) from public, anon;
grant execute on function public.bi_tablero(jsonb) to authenticated;
