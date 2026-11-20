-- OC emitida → PDF por WhatsApp al proveedor (spec 2026-11-20-oc-whatsapp-proveedor-design.md, §3).
-- n8n orquesta; la Edge Function com-oc-whatsapp (secreto propio) es la única que escribe aquí.
-- Una fila por OC de Zoho: la llave primaria es la reserva, así una OC se manda una sola vez.
create table public.com_oc_whatsapp (
  zoho_po_id text primary key,
  po_number text not null,
  vendor_id text,
  vendor_name text,
  telefono text,
  estado text not null check (estado in ('reservado', 'enviado', 'entregado', 'leido', 'fallido', 'sin_numero', 'omitido')),
  wa_message_id text unique,
  error text,
  reservado_at timestamptz not null default now(),
  enviado_at timestamptz,
  entregado_at timestamptz,
  leido_at timestamptz,
  actualizado_at timestamptz not null default now()
);
create index com_oc_whatsapp_po_number on public.com_oc_whatsapp (po_number);
create index com_oc_whatsapp_telefono on public.com_oc_whatsapp (telefono, enviado_at desc);

alter table public.com_oc_whatsapp enable row level security;
revoke all on public.com_oc_whatsapp from anon, authenticated;
grant all on public.com_oc_whatsapp to service_role;
grant select on public.com_oc_whatsapp to authenticated;
create policy lectura on public.com_oc_whatsapp for select to authenticated using ((select public.com_puede_leer()));

-- Reintento desde Órdenes: borra la fila para que el siguiente webhook de Zoho la vuelva a reservar.
-- Nunca borra un envío que sí salió; un reservado solo si lleva más de 30 minutos sin resultado.
create function public.com_oc_whatsapp_reintentar(p_zoho_po_id text) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.com_puede_editar() then
    raise exception 'sin permiso de edición' using errcode = '42501';
  end if;
  delete from public.com_oc_whatsapp
  where zoho_po_id = p_zoho_po_id
    and (estado in ('fallido', 'sin_numero', 'omitido')
         -- n8n falló sin avisar (Zoho caído, error a media corrida): tras 30 min se puede liberar.
         -- Quien reintenta revisa antes en WhatsApp que no haya salido.
         or (estado = 'reservado' and reservado_at < now() - interval '30 minutes'));
  return found;
end $$;
revoke all on function public.com_oc_whatsapp_reintentar(text) from public, anon;
grant execute on function public.com_oc_whatsapp_reintentar(text) to authenticated;
