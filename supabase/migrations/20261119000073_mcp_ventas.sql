-- Ventas de solo lectura para clientes OAuth autorizados (Grok): docs/superpowers/specs/2026-11-19-mcp-ventas-grok-design.md §5.1.
-- sucursales_acceso y bi_acceso NO cambian: también protegen RPC de escritura y siguen negando todo token OAuth.

-- 1. Lista blanca de clientes OAuth que pueden leer ventas (el administrador la llena desde el editor SQL).
create table public.mcp_ventas_clientes (
  client_id text primary key check (length(client_id) between 1 and 200),
  nombre text not null,
  creado_en timestamptz not null default now()
);
alter table public.mcp_ventas_clientes enable row level security;
revoke all on public.mcp_ventas_clientes from anon, authenticated;

-- 2. Predicado de LECTURA de ventas: sesión normal = sucursales_acceso / bi_acceso; token OAuth = cliente en la
--    lista blanca + perfil activo + módulo + sucursal asignada.
create function public.ventas_lectura(p_company integer, p_modulo text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when coalesce(p_modulo, '') not in ('sucursales', 'bi') then false
    when (auth.jwt()->>'client_id') is null then
      case p_modulo when 'sucursales' then public.sucursales_acceso(p_company) else public.bi_acceso(p_company) end
    else exists (select 1 from public.mcp_ventas_clientes k where k.client_id = auth.jwt()->>'client_id')
      and exists (
        select 1 from public.perfiles p
        join public.perfil_modulos m on m.user_id = p.user_id and m.modulo = p_modulo
        join public.perfil_sucursales s on s.user_id = p.user_id and s.company_id = p_company
        where p.user_id = auth.uid() and p.activo)
  end
$$;
revoke all on function public.ventas_lectura(integer, text) from public, anon;
grant execute on function public.ventas_lectura(integer, text) to authenticated;

-- 3. Tablero de México: mismas funciones que la migración 37, con ventas_lectura en lugar de sucursales_acceso.
create or replace function public.sucursales_tablero_hoy(p_companias integer[], p_hoys date[]) returns jsonb
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
      where public.ventas_lectura(x.company_id, 'sucursales')), '[]'));
end $$;

create or replace function public.sucursales_tablero_periodo(p_companias integer[], p_desde date, p_hasta date)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v integer[];
begin
  if p_desde > p_hasta or p_hasta - p_desde > 119 then
    raise exception 'Periodo inválido (máximo 120 días).';
  end if;
  v := array(select c from unnest(p_companias) c where public.ventas_lectura(c, 'sucursales'));
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

-- 4. BI: mismas funciones que la migración 43, con ventas_lectura en lugar de bi_acceso.
create or replace function public.bi_tiendas_filtradas(p jsonb)
returns table (company_id integer, fecha_apertura date)
language sql stable security definer set search_path = public, pg_temp as $$
  select distinct t.company_id, t.fecha_apertura
  from jsonb_array_elements_text(coalesce(p->'companias', '[]'::jsonb)) c
  join public.bi_tiendas t on t.company_id = c::integer
  where public.ventas_lectura(t.company_id, 'bi')
    and (jsonb_array_length(coalesce(p->'franquiciatarios', '[]')) = 0 or t.franquiciatario in (select x from jsonb_array_elements_text(p->'franquiciatarios') x))
    and (jsonb_array_length(coalesce(p->'tipos', '[]')) = 0 or t.tipo in (select x from jsonb_array_elements_text(p->'tipos') x))
    and (jsonb_array_length(coalesce(p->'anios_operando', '[]')) = 0
      or (public.bi_meses_operando(t.fecha_apertura, coalesce((p->>'hoy')::date, current_date)) / 12) in (select x::int from jsonb_array_elements_text(p->'anios_operando') x))
    and (p->'comparable' is null or jsonb_typeof(p->'comparable') = 'null'
      or (coalesce(public.bi_meses_operando(t.fecha_apertura, coalesce((p->>'hoy')::date, current_date)) >= 12, false) = (p->>'comparable')::boolean))
    and (jsonb_array_length(coalesce(p->'maduracion', '[]')) = 0
      or public.bi_maduracion(t.fecha_apertura, coalesce((p->>'hoy')::date, current_date)) in (select x from jsonb_array_elements_text(p->'maduracion') x));
$$;

create or replace function public.bi_opciones(p jsonb) returns jsonb
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
  v := array(select t.company_id from public.bi_tiendas t where public.ventas_lectura(t.company_id, 'bi'));
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

-- 5. Sucursales con ventas visibles para la cuenta, y si el cliente OAuth está autorizado (para el mensaje del MCP).
create function public.mcp_ventas_sucursales() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'client_id', auth.jwt()->>'client_id',
    'autorizado', (auth.jwt()->>'client_id') is null
      or exists (select 1 from public.mcp_ventas_clientes k where k.client_id = auth.jwt()->>'client_id'),
    'sucursales', coalesce((
      select jsonb_agg(jsonb_build_object('company_id', x.company_id, 'nombre_bi', t.nombre,
        'modulos', to_jsonb(x.modulos)) order by x.company_id)
      from (
        select s.company_id, array_remove(array[
          case when public.ventas_lectura(s.company_id, 'sucursales') then 'sucursales' end,
          case when public.ventas_lectura(s.company_id, 'bi') then 'bi' end], null) modulos
        from public.perfil_sucursales s where s.user_id = auth.uid()) x
      left join public.bi_tiendas t on t.company_id = x.company_id
      where cardinality(x.modulos) > 0), '[]'))
$$;

-- 6. Totales por sucursal y día (y por hora si se piden), de los renglones que guarda el corte.
create function public.mcp_ventas_dias(p_companias integer[], p_desde date, p_hasta date, p_horas boolean)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_desde is null or p_hasta is null or p_desde > p_hasta or p_hasta - p_desde > 119 then
    raise exception 'Periodo inválido (máximo 120 días).';
  end if;
  if coalesce(p_horas, false) and p_hasta - p_desde > 6 then
    raise exception 'Periodo inválido con horas (máximo 7 días).';
  end if;
  if coalesce(cardinality(p_companias), 0) > 400 then
    raise exception 'Demasiadas sucursales (máximo 400).';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('company_id', r.company_id, 'fecha', r.fecha, 'completa', r.completa,
        'corte_segundo', r.corte_segundo, 'origenes', r.origenes)
      || case when coalesce(p_horas, false) then jsonb_build_object('horas', r.horas) else '{}'::jsonb end
      order by r.fecha, r.company_id)
    from public.sucursales_resumen_dia r
    where r.company_id = any(array(
        select c from unnest(p_companias) c where public.ventas_lectura(c, 'sucursales')))
      and r.fecha between p_desde and p_hasta), '[]');
end $$;

revoke all on function public.mcp_ventas_sucursales(),
  public.mcp_ventas_dias(integer[], date, date, boolean) from public, anon;
grant execute on function public.mcp_ventas_sucursales(),
  public.mcp_ventas_dias(integer[], date, date, boolean) to authenticated;
