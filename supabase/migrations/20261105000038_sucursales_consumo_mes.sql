-- Consumo nacional de ingredientes por mes (docs/sucursales/17, spec 2026-11-04-consumo-nacional-design).
-- El script scripts/sucursales/consumo-mes.ts calcula un mes cerrado por sucursal con el MISMO cálculo que la sección
-- Consumo (consumir) y lo guarda aquí con la llave de servicio. El Tablero México lo lee por dos RPC con el acceso por
-- sucursal de siempre. Solo cantidades, nunca dinero.

-- 1. Recetas para el servidor: el cuerpo de sucursales_recetas_consumo (migración 27) pasa a una función interna que
--    solo puede llamar service_role. La del portal conserva su firma, su permiso y su comportamiento.
create function public.sucursales_recetas_consumo_datos() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'enlaces', coalesce((select jsonb_agg(jsonb_build_object('codigo', e.codigo, 'receta_id', r.id, 'receta', r.nombre)
        order by e.codigo)
      from public.producto_codigo_pos e join public.recetas r on r.id = e.receta_id), '[]'),
    'unicas', coalesce((select jsonb_agg(producto_id) from (
        select pt.producto_id from public.producto_tamanos pt join public.tamanos t on t.id = pt.tamano_id
        where pt.producto_id in (select receta_id from public.producto_codigo_pos)
        group by pt.producto_id having bool_and(t.nombre = 'Único')) u), '[]'),
    'tamanos', coalesce((select jsonb_agg(jsonb_build_object('receta_id', pt.producto_id, 'tamano', t.nombre))
      from public.producto_tamanos pt join public.tamanos t on t.id = pt.tamano_id
      where pt.producto_id in (select receta_id from public.producto_codigo_pos)), '[]'),
    'insumos', coalesce((
      with recursive
      productos as (select distinct receta_id from public.producto_codigo_pos),
      directas as (
        select l.receta_id, lc.tamano_id, l.insumo_id, l.subreceta_id, lc.cantidad
        from public.receta_lineas l
        join public.linea_cantidades lc on lc.linea_id = l.id
        where l.receta_id in (select receta_id from productos) and lc.tamano_id is not null),
      expansion (receta_id, tamano_id, insumo_id, subreceta_id, cantidad) as (
        select * from directas
        union all
        select e.receta_id, e.tamano_id, l.insumo_id, l.subreceta_id, e.cantidad * lc.cantidad / r.rendimiento
        from expansion e
        join public.receta_lineas l on l.receta_id = e.subreceta_id
        join public.recetas r on r.id = l.receta_id
        join public.linea_cantidades lc on lc.linea_id = l.id),
      total as (
        select receta_id, tamano_id, insumo_id, sum(cantidad) cantidad
        from expansion where insumo_id is not null group by 1, 2, 3)
      select jsonb_agg(jsonb_build_object('receta_id', x.receta_id, 'tamano', t.nombre, 'insumo_id', i.id,
          'insumo', i.nombre, 'unidad', i.unidad, 'categoria', c.nombre, 'cantidad', x.cantidad))
      from total x
      join public.tamanos t on t.id = x.tamano_id
      join public.insumos i on i.id = x.insumo_id
      left join public.categorias_insumo c on c.id = i.categoria_id), '[]'),
    'lineas', coalesce((select jsonb_agg(jsonb_build_object('receta_id', l.receta_id, 'tamano', t.nombre,
        'insumo', i.nombre, 'cantidad', lc.cantidad) order by l.receta_id, t.nombre, i.nombre)
      from public.receta_lineas l
      join public.linea_cantidades lc on lc.linea_id = l.id and lc.tamano_id is not null
      join public.tamanos t on t.id = lc.tamano_id
      join public.insumos i on i.id = l.insumo_id
      where l.receta_id in (select receta_id from public.producto_codigo_pos)), '[]'),
    'sustitutos', coalesce((select jsonb_agg(jsonb_build_object('insumo_id', i.id, 'insumo', i.nombre,
        'unidad', i.unidad, 'categoria', c.nombre) order by i.nombre)
      from public.insumos i
      left join public.categorias_insumo c on c.id = i.categoria_id
      where i.nombre in (
        'LECHE ENTERA', 'LECHE DESLACTOSADAS', 'LECHE AVENA', 'LECHE ALMENDRA', 'LECHE COCO',
        'LECHE AVENA CALIFIA', 'LECHE ALMENDRA CALIFIA', 'LECHE COCO CALIFIA',
        'CAFÉ TOSTADO EN GRANO BLACK 1.5 KG', 'CAFÉ TOSTADO EN GRANO WHITE 1.5 KG',
        'CAFÉ TOSTADO EN GRANO KRAFT 1.5 KG', 'MIEL DE ABEJA 1 LT')), '[]'));
$$;

create or replace function public.sucursales_recetas_consumo(p_company integer) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.sucursales_acceso(p_company) then
    return null;
  end if;
  return public.sucursales_recetas_consumo_datos();
end $$;

revoke all on function public.sucursales_recetas_consumo_datos() from public, anon, authenticated;
grant execute on function public.sucursales_recetas_consumo_datos() to service_role;

-- 2. Tablas
create table public.sucursales_consumo_mes (
  mes date not null check (extract(day from mes) = 1),
  company_id integer not null check (company_id > 0),
  origen text not null check (origen in ('mostrador', 'app', 'rappi', 'desconocido')),
  -- Sin FK: el renglón sobrevive si el insumo se desactiva o se borra; nombre, unidad y categoría van copiados.
  insumo_id uuid not null,
  insumo text not null,
  unidad text not null,
  categoria text not null,
  cantidad numeric not null check (cantidad >= 0),
  primary key (mes, company_id, origen, insumo_id)
);

create table public.sucursales_consumo_mes_sucursal (
  mes date not null check (extract(day from mes) = 1),
  company_id integer not null check (company_id > 0),
  calculado_en timestamptz not null default now(),
  recetas_leidas_en timestamptz not null,
  completa boolean not null,
  -- Por origen: {lineas, incluidas, generico, sinCodigo, sinEnlace} (CoberturaConsumo, en unidades).
  cobertura jsonb not null,
  -- Por origen: [{nombre, unidades, sinCodigo}] (SinReceta).
  sin_receta jsonb not null,
  primary key (mes, company_id)
);

alter table public.sucursales_consumo_mes enable row level security;
alter table public.sucursales_consumo_mes_sucursal enable row level security;
revoke all on public.sucursales_consumo_mes, public.sucursales_consumo_mes_sucursal from anon, authenticated;

-- 3. Guardado atómico de un mes de una sucursal (reemplaza lo anterior). Solo service_role.
create function public.sucursales_guardar_consumo_mes(p_mes date, p_company integer, p_meta jsonb, p_insumos jsonb)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n integer;
begin
  if extract(day from p_mes) <> 1 then
    raise exception 'El mes va como su primer día (AAAA-MM-01).';
  end if;
  delete from public.sucursales_consumo_mes where mes = p_mes and company_id = p_company;
  insert into public.sucursales_consumo_mes (mes, company_id, origen, insumo_id, insumo, unidad, categoria, cantidad)
  select p_mes, p_company, x.origen, x.insumo_id, x.insumo, x.unidad, x.categoria, x.cantidad
  from jsonb_to_recordset(p_insumos)
    as x(origen text, insumo_id uuid, insumo text, unidad text, categoria text, cantidad numeric);
  get diagnostics n = row_count;
  insert into public.sucursales_consumo_mes_sucursal
    (mes, company_id, calculado_en, recetas_leidas_en, completa, cobertura, sin_receta)
  values (p_mes, p_company, now(), (p_meta->>'recetas_leidas_en')::timestamptz, (p_meta->>'completa')::boolean,
    coalesce(p_meta->'cobertura', '{}'), coalesce(p_meta->'sin_receta', '{}'))
  on conflict (mes, company_id) do update set calculado_en = excluded.calculado_en,
    recetas_leidas_en = excluded.recetas_leidas_en, completa = excluded.completa,
    cobertura = excluded.cobertura, sin_receta = excluded.sin_receta;
  return n;
end $$;

revoke all on function public.sucursales_guardar_consumo_mes(date, integer, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.sucursales_guardar_consumo_mes(date, integer, jsonb, jsonb) to service_role;

-- 4. Lectura nacional (ligera): meses, cobertura por sucursal, consumo sumado por insumo y origen y el mes anterior
--    (solo de las sucursales del usuario que lo tienen calculado).
create function public.sucursales_consumo_nacional(p_mes date, p_companias integer[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v integer[];
  ant date := (p_mes - interval '1 month')::date;
begin
  v := array(select c from unnest(p_companias) c where public.sucursales_acceso(c));
  return jsonb_build_object(
    'meses', coalesce((select jsonb_agg(m order by m desc) from (
        select distinct mes m from public.sucursales_consumo_mes_sucursal where company_id = any(v)) x), '[]'),
    'sucursales', coalesce((select jsonb_agg(jsonb_build_object('company_id', s.company_id,
        'calculado_en', s.calculado_en, 'recetas_leidas_en', s.recetas_leidas_en, 'completa', s.completa,
        'cobertura', s.cobertura, 'sin_receta', s.sin_receta) order by s.company_id)
      from public.sucursales_consumo_mes_sucursal s where s.mes = p_mes and s.company_id = any(v)), '[]'),
    'insumos', coalesce((select jsonb_agg(jsonb_build_object('insumo_id', x.insumo_id, 'insumo', x.insumo,
        'unidad', x.unidad, 'categoria', x.categoria, 'presentacion', i.presentacion, 'origen', x.origen,
        'cantidad', x.cantidad, 'sucursales', x.sucursales) order by x.categoria, x.insumo, x.origen)
      from (
        select insumo_id, origen, max(insumo) insumo, max(unidad) unidad, max(categoria) categoria,
          sum(cantidad) cantidad, count(distinct company_id) sucursales
        from public.sucursales_consumo_mes where mes = p_mes and company_id = any(v)
        group by insumo_id, origen) x
      left join public.insumos i on i.id = x.insumo_id), '[]'),
    'anterior', coalesce((select jsonb_agg(jsonb_build_object('insumo_id', insumo_id, 'origen', origen,
        'cantidad', cantidad) order by insumo_id, origen)
      from (
        select insumo_id, origen, sum(cantidad) cantidad
        from public.sucursales_consumo_mes where mes = ant and company_id = any(v)
        group by 1, 2) a), '[]'),
    'sucursales_anterior', (select count(*) from public.sucursales_consumo_mes_sucursal
      where mes = ant and company_id = any(v)));
end $$;

-- 5. Desglose por sucursal: un insumo (al abrirlo en el tablero) o todos con p_insumo nulo (exportar).
create function public.sucursales_consumo_desglose(p_mes date, p_companias integer[], p_insumo uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v integer[];
begin
  v := array(select c from unnest(p_companias) c where public.sucursales_acceso(c));
  return coalesce((select jsonb_agg(jsonb_build_object('company_id', company_id, 'insumo_id', insumo_id,
      'origen', origen, 'cantidad', cantidad) order by company_id, insumo_id, origen)
    from public.sucursales_consumo_mes
    where mes = p_mes and company_id = any(v) and (p_insumo is null or insumo_id = p_insumo)), '[]');
end $$;

revoke all on function public.sucursales_consumo_nacional(date, integer[]),
  public.sucursales_consumo_desglose(date, integer[], uuid) from public, anon;
grant execute on function public.sucursales_consumo_nacional(date, integer[]),
  public.sucursales_consumo_desglose(date, integer[], uuid) to authenticated;
