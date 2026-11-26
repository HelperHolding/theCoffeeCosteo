-- Sincronización de compras desde Zoho (spec 2026-11-25-compras-tablero-y-descargas-design.md §2).
-- Solo la Edge Function zoho-compras-sync (service role) escribe; Comercializadora lee.

create table public.com_compras_oc (
  zoho_po_id text primary key,
  folio text not null,
  proveedor text not null default '',
  vendor_id text not null default '',
  comprador text not null default 'Sin comprador',
  emision date not null,
  arribo date,
  estado text not null default '',
  received_status text not null default '',
  moneda text not null default 'MXN',
  total numeric not null default 0,
  monto_ins numeric not null default 0,
  por_categoria jsonb not null default '{}'::jsonb,
  es_registro boolean not null default false,
  factura_previa date,
  zoho_modificado timestamptz,
  actualizado_at timestamptz not null default now()
);
create index com_compras_oc_emision on public.com_compras_oc (emision);

create table public.com_compras_recepcion (
  zoho_receive_id text primary key,
  zoho_po_id text not null references public.com_compras_oc (zoho_po_id) on delete cascade,
  folio_oc text not null,
  fecha date not null,
  monto numeric not null default 0,
  por_categoria jsonb not null default '{}'::jsonb
);
create index com_compras_recepcion_fecha on public.com_compras_recepcion (fecha);
create index com_compras_recepcion_po on public.com_compras_recepcion (zoho_po_id);

create table public.com_compras_factura (
  zoho_invoice_id text primary key,
  fecha date not null,
  cliente text not null default '',
  estado text not null default '',
  total numeric not null default 0,
  por_categoria_ci jsonb not null default '{}'::jsonb,
  zoho_modificado timestamptz
);
create index com_compras_factura_fecha on public.com_compras_factura (fecha);

create table public.com_compras_venta_semana (
  semana date primary key,
  venta_total_ci numeric not null default 0,
  facturas int not null default 0,
  por_categoria_ci jsonb not null default '{}'::jsonb,
  calculado_at timestamptz not null default now()
);

create table public.com_compras_sync_estado (
  id int primary key default 1 check (id = 1),
  oc_modificado_hasta timestamptz,
  oc_ids_en_marca text[] not null default '{}',
  factura_modificado_hasta timestamptz,
  factura_ids_en_marca text[] not null default '{}'
);
insert into public.com_compras_sync_estado (id) values (1);

alter table public.com_compras_oc enable row level security;
alter table public.com_compras_recepcion enable row level security;
alter table public.com_compras_factura enable row level security;
alter table public.com_compras_venta_semana enable row level security;
alter table public.com_compras_sync_estado enable row level security;
revoke all on public.com_compras_oc, public.com_compras_recepcion, public.com_compras_factura,
  public.com_compras_venta_semana, public.com_compras_sync_estado from anon, authenticated;
grant all on public.com_compras_oc, public.com_compras_recepcion, public.com_compras_factura,
  public.com_compras_venta_semana, public.com_compras_sync_estado to service_role;
grant select on public.com_compras_oc, public.com_compras_recepcion, public.com_compras_factura,
  public.com_compras_venta_semana, public.com_compras_sync_estado to authenticated;
create policy lectura on public.com_compras_oc for select to authenticated using ((select public.com_puede_leer()));
create policy lectura on public.com_compras_recepcion for select to authenticated using ((select public.com_puede_leer()));
create policy lectura on public.com_compras_factura for select to authenticated using ((select public.com_puede_leer()));
create policy lectura on public.com_compras_venta_semana for select to authenticated using ((select public.com_puede_leer()));
create policy lectura on public.com_compras_sync_estado for select to authenticated using ((select public.com_puede_leer()));

-- Cada 15 minutos. Se crea INACTIVO (como los demás jobs de Comercializadora): se activa después del despliegue,
-- de ampliar el token con ZohoBooks.purchaseorders.READ y de una corrida forzada que salga bien.
do $$
declare
  j record;
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    perform cron.schedule('zoho-compras-sync', '7,22,37,52 * * * *', $c$ select public.com_invocar('zoho-compras-sync') $c$);
    for j in select jobid from cron.job where jobname = 'zoho-compras-sync' loop
      perform cron.alter_job(j.jobid, active := false);
    end loop;
  end if;
end $$;
