-- Migración 76: KPI de un periodo (el anterior) para la comparación del tablero BI
-- (docs/superpowers/specs/2026-11-19-bi-estilo-metabase-design.md §5). Mismas expresiones de kpis y cargas que
-- bi_tablero (migración 74); p_hora_corte recorta solo el último día (hora < p_hora_corte).
-- Se aplica a mano en el SQL Editor y se registra:
--   insert into supabase_migrations.schema_migrations (version, name) values ('20261120000076','bi_kpis');

create function public.bi_kpis(p jsonb, p_hora_corte integer default null) returns jsonb
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
  with bi_f as materialized (
    select * from public.bi_lineas_filtradas(p, d, h, true) l
    where p_hora_corte is null or l.fecha < h or l.hora < p_hora_corte)
  select jsonb_build_object(
    'cargas', (select jsonb_build_object('esperados', count(*), 'con_carga', count(k.*), 'incompletos', count(*) filter (where k.completa is false))
      from public.bi_tiendas_filtradas(p) c
      cross join lateral generate_series(greatest(d, c.fecha_apertura)::timestamp, least(h, v_hoy)::timestamp, interval '1 day') g(dia)
      left join public.bi_cargas k on k.fuente = 'pos' and k.company_id = c.company_id and k.fecha = g.dia::date),
    'kpis', (select jsonb_build_object('venta_cent', coalesce(sum(importe_neto_cent), 0), 'venta_bruta_cent', coalesce(sum(importe_cent), 0),
      'tickets', count(distinct (fuente, company_id, fecha, pedido)), 'lineas', count(*), 'unidades', coalesce(sum(unidades), 0)) from bi_f))
  into r;
  return r;
end $$;

revoke all on function public.bi_kpis(jsonb, integer) from public, anon;
grant execute on function public.bi_kpis(jsonb, integer) to authenticated;
