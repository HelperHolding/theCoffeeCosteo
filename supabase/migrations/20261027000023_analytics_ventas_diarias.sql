-- Analytics (D1): agregados diarios de ventas por tienda × fecha × fuente × canal.
-- Sin pedidos crudos ni datos personales. D4 (etapa 1): solo un admin activo lee; nadie escribe desde el
-- portal. Las cargas corren con la conexión de servicio y solo a través de analytics_guardar_lectura().
-- Rappi de Zoho queda como fuente aparte ('zoho_rappi') y fuera de los KPI (D5 pendiente).

-- Tiendas de México incluidas, por relaciones verificadas (no por nombre):
-- company_id (API POS) y store_id = lookerStoreId = "Store ID" de Zoho = número Jestor del CRM.
create table public.analytics_tiendas (
  company_id integer primary key check (company_id > 0),
  store_id integer not null unique check (store_id > 0),
  nombre text not null check (btrim(nombre) <> ''),
  -- De qué relación sale la inclusión: 'zoho' (ventas MXN en Looker Sucursales) y/o 'crm' (crm_tiendas).
  relaciones text[] not null check (relaciones <@ array['zoho', 'crm'] and cardinality(relaciones) > 0),
  verificado_en timestamptz not null
);

-- Una lectura COMPLETA de una tienda en una fecha y fuente. La ausencia de fila = "sin lectura";
-- una fila con canales en cero = "sin ventas".
create table public.analytics_lecturas (
  fuente text not null check (fuente in ('pos', 'zoho_rappi')),
  company_id integer not null references public.analytics_tiendas (company_id),
  fecha date not null,
  -- Instante de la extracción en la fuente. Una lectura nunca reemplaza a otra más reciente.
  leido_en timestamptz not null,
  -- Día aún abierto en alguna zona de México al momento de leer.
  provisional boolean not null,
  version_calculo text not null check (version_calculo ~ '^[a-z0-9_.-]+$'),
  -- Cómo se obtuvo la fecha (p. ej. createdAt del POS = hora local de la tienda etiquetada con Z).
  criterio_fecha text not null check (btrim(criterio_fecha) <> ''),
  origen text not null check (btrim(origen) <> ''),
  carga_id uuid not null,
  cargado_en timestamptz not null default now(),
  primary key (fuente, company_id, fecha)
);

create table public.analytics_ventas_diarias (
  fuente text not null,
  company_id integer not null,
  fecha date not null,
  canal text not null,
  -- Centavos MXN con IVA, ya descontados (POS: Σ grossAmount; Zoho: Σ Net Amount (Local)).
  venta_cent bigint not null check (venta_cent >= 0),
  tickets integer not null check (tickets >= 0),
  unidades integer not null check (unidades >= 0),
  primary key (fuente, company_id, fecha, canal),
  foreign key (fuente, company_id, fecha) references public.analytics_lecturas on delete cascade,
  check (
    (fuente = 'pos' and canal in ('mostrador', 'app', 'rappi', 'desconocido'))
    or (fuente = 'zoho_rappi' and canal in ('rappi', 'rappi_turbo'))
  )
);

/**
 * Guarda una lectura completa de forma atómica e idempotente. Devuelve:
 *  'insertada' | 'actualizada' | 'ignorada' (ya existe una lectura igual o más reciente).
 * Rechaza lecturas incompletas, canales incompletos o repetidos, fechas futuras y días abiertos sin marca
 * de provisional. Los canales se reemplazan juntos: nunca queda una mezcla de dos lecturas.
 */
create function public.analytics_guardar_lectura(p jsonb) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_fuente text := p->>'fuente';
  v_fecha date := (p->>'fecha')::date;
  v_company integer := (p->>'company_id')::integer;
  v_leido timestamptz := (p->>'leido_en')::timestamptz;
  v_prov boolean := (p->>'provisional')::boolean;
  v_canales text[];
  v_esperados text[];
  v_nueva boolean;
  -- Fecha local actual en cada zona de México contemplada (misma lista que ZONAS_MEXICO en lib/analytics).
  v_hoy_min date;
  v_hoy_max date;
begin
  select min((now() at time zone z)::date), max((now() at time zone z)::date) into v_hoy_min, v_hoy_max
  from unnest(array['America/Bahia_Banderas', 'America/Cancun', 'America/Chihuahua', 'America/Ciudad_Juarez',
    'America/Hermosillo', 'America/Matamoros', 'America/Mazatlan', 'America/Merida', 'America/Mexico_City',
    'America/Monterrey', 'America/Ojinaga', 'America/Tijuana']) z;
  if coalesce((p->>'completa')::boolean, false) is not true then
    raise exception 'analytics: solo se guardan lecturas completas';
  end if;
  -- Futura: aún no empieza en ninguna zona.
  if v_fecha > v_hoy_max then
    raise exception 'analytics: fecha futura %', v_fecha;
  end if;
  -- Abierta: en alguna zona todavía no termina; solo se acepta como provisional.
  if v_fecha >= v_hoy_min and v_prov is not true then
    raise exception 'analytics: el día % sigue abierto y debe ser provisional', v_fecha;
  end if;
  if v_leido > now() + interval '5 minutes' then
    raise exception 'analytics: leido_en en el futuro';
  end if;
  select array_agg(c->>'canal' order by c->>'canal') into v_canales from jsonb_array_elements(p->'canales') c;
  v_esperados := case v_fuente
    when 'pos' then array['app', 'desconocido', 'mostrador', 'rappi']
    when 'zoho_rappi' then array['rappi', 'rappi_turbo']
  end;
  if v_canales is distinct from v_esperados then
    raise exception 'analytics: la lectura % necesita exactamente los canales %', v_fuente, v_esperados;
  end if;

  insert into public.analytics_lecturas as l
    (fuente, company_id, fecha, leido_en, provisional, version_calculo, criterio_fecha, origen, carga_id)
  values (v_fuente, v_company, v_fecha, v_leido, v_prov, p->>'version_calculo', p->>'criterio_fecha',
          p->>'origen', (p->>'carga_id')::uuid)
  on conflict (fuente, company_id, fecha) do update set
    leido_en = excluded.leido_en, provisional = excluded.provisional,
    version_calculo = excluded.version_calculo, criterio_fecha = excluded.criterio_fecha,
    origen = excluded.origen, carga_id = excluded.carga_id, cargado_en = now()
  where l.leido_en < excluded.leido_en
  returning (xmax = 0) into v_nueva;

  if v_nueva is null then
    return 'ignorada';
  end if;
  delete from public.analytics_ventas_diarias
    where fuente = v_fuente and company_id = v_company and fecha = v_fecha;
  insert into public.analytics_ventas_diarias (fuente, company_id, fecha, canal, venta_cent, tickets, unidades)
  select v_fuente, v_company, v_fecha, c->>'canal', (c->>'venta_cent')::bigint, (c->>'tickets')::integer,
         (c->>'unidades')::integer
  from jsonb_array_elements(p->'canales') c;
  return case when v_nueva then 'insertada' else 'actualizada' end;
end;
$$;
revoke all on function public.analytics_guardar_lectura(jsonb) from public, anon, authenticated;

-- Lo único que consume el dashboard: POS, mostrador + app. Rappi (de cualquier fuente) y los pedidos sin
-- origen quedan en columnas aparte para mostrarlos como excluidos, nunca sumados.
create view public.analytics_ventas_kpi with (security_invoker = true) as
select
  l.company_id, t.store_id, t.nombre as tienda, l.fecha, l.provisional, l.leido_en,
  coalesce(sum(v.venta_cent) filter (where v.canal in ('mostrador', 'app')), 0)::bigint as venta_cent,
  coalesce(sum(v.tickets) filter (where v.canal in ('mostrador', 'app')), 0)::integer as tickets,
  coalesce(sum(v.unidades) filter (where v.canal in ('mostrador', 'app')), 0)::integer as unidades,
  coalesce(sum(v.venta_cent) filter (where v.canal = 'mostrador'), 0)::bigint as mostrador_cent,
  coalesce(sum(v.venta_cent) filter (where v.canal = 'app'), 0)::bigint as app_cent,
  coalesce(sum(v.tickets) filter (where v.canal = 'rappi'), 0)::integer as rappi_pos_tickets,
  coalesce(sum(v.venta_cent) filter (where v.canal = 'rappi'), 0)::bigint as rappi_pos_cent,
  coalesce(sum(v.tickets) filter (where v.canal = 'desconocido'), 0)::integer as sin_origen_tickets
from public.analytics_lecturas l
join public.analytics_tiendas t using (company_id)
join public.analytics_ventas_diarias v using (fuente, company_id, fecha)
where l.fuente = 'pos'
group by l.company_id, t.store_id, t.nombre, l.fecha, l.provisional, l.leido_en;

alter table public.analytics_tiendas enable row level security;
alter table public.analytics_lecturas enable row level security;
alter table public.analytics_ventas_diarias enable row level security;
revoke all on public.analytics_tiendas, public.analytics_lecturas, public.analytics_ventas_diarias,
  public.analytics_ventas_kpi from anon, authenticated;
grant select on public.analytics_tiendas, public.analytics_lecturas, public.analytics_ventas_diarias,
  public.analytics_ventas_kpi to authenticated;

create policy lectura_admin on public.analytics_tiendas for select to authenticated
  using ((select public.tiene_rol('admin')));
create policy lectura_admin on public.analytics_lecturas for select to authenticated
  using ((select public.tiene_rol('admin')));
create policy lectura_admin on public.analytics_ventas_diarias for select to authenticated
  using ((select public.tiene_rol('admin')));
create policy analytics_sin_oauth on public.analytics_tiendas as restrictive for all to authenticated
  using (((select auth.jwt())->>'client_id') is null);
create policy analytics_sin_oauth on public.analytics_lecturas as restrictive for all to authenticated
  using (((select auth.jwt())->>'client_id') is null);
create policy analytics_sin_oauth on public.analytics_ventas_diarias as restrictive for all to authenticated
  using (((select auth.jwt())->>'client_id') is null);

comment on table public.analytics_lecturas is
  'Lecturas completas por tienda/fecha/fuente. Sin fila = sin lectura; canales en cero = sin ventas.';
comment on table public.analytics_ventas_diarias is
  'Centavos MXN con IVA. zoho_rappi y el canal rappi del POS NO entran en los KPI (D5); no deduplicables por agregado.';
