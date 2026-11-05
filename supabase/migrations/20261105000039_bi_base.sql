-- BI «The Coffee México» (docs/superpowers/specs/2026-11-05-bi-the-coffee-mexico-design.md, docs/bi/01-BASE.md).
-- Hechos por línea de producto, sin datos de clientes. Tablas cerradas al portal: se escriben solo por RPC de
-- service_role y se leen solo por RPC con sucursales_acceso (que ya niega tokens OAuth, migración 24).

-- ===== Parte 1: tablas y guardado de un día =====

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
  codigo text not null check (btrim(codigo) <> ''),
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
create function public.bi_guardar_dia(p_fuente text, p_company integer, p_fecha date, p_completa boolean,
  p_leido_en timestamptz, p_lineas jsonb) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n integer;
begin
  if p_fuente not in ('pos', 'zoho_rappi') then
    raise exception 'Fuente inválida: %', p_fuente;
  end if;
  delete from public.bi_lineas where fuente = p_fuente and company_id = p_company and fecha = p_fecha;
  insert into public.bi_lineas (fuente, company_id, fecha, pedido, linea, hora, canal, metodo_pago, tipo_pago,
    smartphone, opcion_consumo, codigo, nombre, unidades, importe_cent, descuento_cent)
  select p_fuente, p_company, p_fecha, x.pedido, x.linea, x.hora, x.canal, x.metodo_pago, coalesce(x.tipo_pago, ''),
    coalesce(x.smartphone, false), x.opcion_consumo, x.codigo, x.nombre, x.unidades, x.importe_cent,
    coalesce(x.descuento_cent, 0)
  from jsonb_to_recordset(p_lineas) as x(pedido text, linea smallint, hora smallint, canal text, metodo_pago text,
    tipo_pago text, smartphone boolean, opcion_consumo text, codigo text, nombre text, unidades numeric,
    importe_cent bigint, descuento_cent bigint);
  get diagnostics n = row_count;
  insert into public.bi_cargas (fuente, company_id, fecha, leido_en, completa, rappi_en_pos, lineas)
  values (p_fuente, p_company, p_fecha, p_leido_en, p_completa,
    p_fuente = 'pos' and exists (select 1 from jsonb_to_recordset(p_lineas) as y(canal text) where y.canal = 'rappi'),
    n)
  on conflict (fuente, company_id, fecha) do update set leido_en = excluded.leido_en, completa = excluded.completa,
    rappi_en_pos = excluded.rappi_en_pos, lineas = excluded.lineas;
  return n;
end $$;

revoke all on function public.bi_guardar_dia(text, integer, date, boolean, timestamptz, jsonb)
  from public, anon, authenticated;
grant execute on function public.bi_guardar_dia(text, integer, date, boolean, timestamptz, jsonb) to service_role;
