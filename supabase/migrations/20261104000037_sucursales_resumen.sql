-- Tablero de México (docs/sucursales/16): resumen de ventas por sucursal y día. Solo totales; nunca pedidos ni datos
-- de clientes. Lo escribe el corte (/api/sucursales/corte, cada 10 min, con la llave de servicio) con las mismas
-- reglas que la página de cada sucursal (POS y Rappi del portal). Se lee con sucursales_tablero_hoy y
-- sucursales_tablero_periodo, con el mismo acceso por sucursal que el resto del módulo (sucursales_acceso).

-- 1. Un renglón por sucursal y día local de la sucursal.
create table public.sucursales_resumen_dia (
  company_id integer not null check (company_id > 0),
  fecha date not null,
  leido_en timestamptz not null,
  -- Hasta qué hora local llega lo leído (segundos desde la medianoche); 86400 en un día ya cerrado.
  corte_segundo integer not null check (corte_segundo between 0 and 86400),
  -- La lectura del POS y de Rappi fue completa (si no, el tablero lo avisa; nunca se estima lo que falta).
  completa boolean not null,
  -- {origen: {pedidos, venta_cent, descuento_cent, lineas}}; origen = mostrador, app o rappi (solo los que hubo).
  origenes jsonb not null,
  -- {origen: [[pedidos ×24], [venta_cent ×24]]} por hora local.
  horas jsonb not null,
  -- {origen: [[pedidos ×144], [venta_cent ×144]]} por tramo de 10 min, para comparar con la semana pasada a la misma
  -- hora. Solo de los últimos 8 días: el corte lo borra después (las horas quedan).
  tramos jsonb,
  -- [[clave, codigo, nombre, {origen: [lineas, importe_cent]}]] por producto (identidad de metricas.productos).
  productos jsonb not null,
  primary key (company_id, fecha)
);
create index sucursales_resumen_dia_fecha on public.sucursales_resumen_dia (fecha);

-- 2. Cada corte, para saber cuándo corrió y si leyó todo.
create table public.sucursales_cortes (
  id bigint generated always as identity primary key,
  inicio timestamptz not null,
  fin timestamptz not null default now(),
  fechas text not null,
  sucursales integer not null,
  completas integer not null,
  mensaje text
);

alter table public.sucursales_resumen_dia enable row level security;
alter table public.sucursales_cortes enable row level security;
revoke all on public.sucursales_resumen_dia, public.sucursales_cortes from anon, authenticated;

-- 3. Hoy contra el mismo día de la semana pasada, por sucursal (cada una con su propia fecha local de hoy).
create function public.sucursales_tablero_hoy(p_companias integer[], p_hoys date[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if cardinality(p_companias) <> cardinality(p_hoys) or cardinality(p_companias) > 400 then
    raise exception 'Sucursales y fechas no corresponden.';
  end if;
  return jsonb_build_object(
    'ultimo_corte', (select max(c.fin) from public.sucursales_cortes c),
    'dias', coalesce((select jsonb_agg(jsonb_build_object('company_id', r.company_id, 'fecha', r.fecha,
        'hoy', r.fecha = x.hoy, 'leido_en', r.leido_en, 'corte_segundo', r.corte_segundo, 'completa', r.completa,
        'origenes', r.origenes, 'horas', r.horas, 'tramos', r.tramos) order by r.company_id, r.fecha)
      from unnest(p_companias, p_hoys) x(company_id, hoy)
      join public.sucursales_resumen_dia r on r.company_id = x.company_id and r.fecha in (x.hoy, x.hoy - 7)
      where public.sucursales_acceso(x.company_id)), '[]'));
end $$;

-- 4. Un periodo (hasta 120 días): por sucursal y semana (lunes), por día (todas juntas) y productos (todas juntas).
--    Todo separado por origen, para que el filtro Mostrador / App / Rappi se aplique sin volver a leer.
create function public.sucursales_tablero_periodo(p_companias integer[], p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v integer[];
begin
  if p_desde > p_hasta or p_hasta - p_desde > 119 then
    raise exception 'Periodo inválido (máximo 120 días).';
  end if;
  v := array(select c from unnest(p_companias) c where public.sucursales_acceso(c));
  return jsonb_build_object(
    'dias_leidos', (select count(*) from public.sucursales_resumen_dia
      where company_id = any(v) and fecha between p_desde and p_hasta),
    'incompletos', (select count(*) from public.sucursales_resumen_dia
      where company_id = any(v) and fecha between p_desde and p_hasta and not completa),
    'semanas', coalesce((select jsonb_agg(jsonb_build_object('company_id', company_id, 'semana', semana,
        'origen', origen, 'pedidos', pedidos, 'venta_cent', venta_cent, 'descuento_cent', descuento_cent,
        'lineas', lineas, 'dias', dias) order by semana, company_id, origen)
      from (
        select r.company_id, date_trunc('week', r.fecha)::date semana, o.key origen,
          sum((o.value->>'pedidos')::bigint) pedidos, sum((o.value->>'venta_cent')::bigint) venta_cent,
          sum((o.value->>'descuento_cent')::bigint) descuento_cent, sum((o.value->>'lineas')::bigint) lineas,
          count(distinct r.fecha) dias
        from public.sucursales_resumen_dia r, jsonb_each(r.origenes) o
        where r.company_id = any(v) and r.fecha between p_desde and p_hasta
        group by 1, 2, 3) s), '[]'),
    'dias', coalesce((select jsonb_agg(jsonb_build_object('fecha', fecha, 'origen', origen, 'pedidos', pedidos,
        'venta_cent', venta_cent) order by fecha, origen)
      from (
        select r.fecha, o.key origen, sum((o.value->>'pedidos')::bigint) pedidos,
          sum((o.value->>'venta_cent')::bigint) venta_cent
        from public.sucursales_resumen_dia r, jsonb_each(r.origenes) o
        where r.company_id = any(v) and r.fecha between p_desde and p_hasta
        group by 1, 2) d), '[]'),
    'productos', coalesce((select jsonb_agg(jsonb_build_object('clave', clave, 'codigo', codigo, 'nombre', nombre,
        'origen', origen, 'lineas', lineas, 'importe_cent', importe_cent, 'sucursales', sucursales)
        order by importe_cent desc, clave, origen)
      from (
        select x.*, n.sucursales
        from (
          select p->>0 clave, min(p->>1) codigo, mode() within group (order by p->>2) nombre, o.key origen,
            sum((o.value->>0)::bigint) lineas, sum((o.value->>1)::bigint) importe_cent
          from public.sucursales_resumen_dia r, jsonb_array_elements(r.productos) p, jsonb_each(p->3) o
          where r.company_id = any(v) and r.fecha between p_desde and p_hasta
          group by 1, 4) x
        -- En cuántas sucursales se vendió, con cualquier origen.
        join (
          select p->>0 clave, count(distinct r.company_id) sucursales
          from public.sucursales_resumen_dia r, jsonb_array_elements(r.productos) p
          where r.company_id = any(v) and r.fecha between p_desde and p_hasta
          group by 1) n using (clave)) y), '[]'));
end $$;

revoke all on function public.sucursales_tablero_hoy(integer[], date[]),
  public.sucursales_tablero_periodo(integer[], date, date) from public, anon;
grant execute on function public.sucursales_tablero_hoy(integer[], date[]),
  public.sucursales_tablero_periodo(integer[], date, date) to authenticated;
