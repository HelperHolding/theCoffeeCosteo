-- Códigos del POS de Brasil (items.defaultCode de la API de pedidos) ligados a recetas de Costeo.
-- Identidad estable para cruzar ventas con costeo SIN depender del nombre (docs/conciliacion-brasil/15).
-- Un código liga una sola receta; una receta puede tener varios códigos (canales, renombres). No sustituye ni
-- modifica recetas.nombre. El mapeo de tamaños (Regular/Large ↔ Chica/Grande) queda fuera: es por producto (B5).
create table public.producto_codigo_pos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique check (codigo = btrim(codigo) and codigo <> '' and codigo <> 'GENERIC'),
  receta_id uuid not null references public.recetas(id) on delete restrict,
  -- productName tal como llegó en los pedidos usados como evidencia (no es el nombre vigente del catálogo).
  nombre_observado text not null check (btrim(nombre_observado) <> ''),
  evidencia text not null check (btrim(evidencia) <> ''),
  creado_en timestamptz not null default now(),
  creado_por uuid default auth.uid()
);
create index producto_codigo_pos_receta on public.producto_codigo_pos (receta_id);

-- Solo productos (no sub-recetas).
create function public.validar_producto_codigo_pos() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.recetas where id = new.receta_id and tipo = 'producto') then
    raise exception 'El código % debe ligarse a un producto, no a una sub-receta', new.codigo;
  end if;
  return new;
end $$;
create trigger producto_codigo_pos_validar before insert or update on public.producto_codigo_pos
  for each row execute function public.validar_producto_codigo_pos();
create trigger producto_codigo_pos_bitacora after insert or update or delete on public.producto_codigo_pos
  for each row execute function public.registrar_bitacora();

-- Permisos: lectura para todo perfil activo; altas/cambios/bajas para operaciones y admin; nunca con OAuth (MCP).
alter table public.producto_codigo_pos enable row level security;
revoke all on public.producto_codigo_pos from anon, authenticated;
grant select, insert, update, delete on public.producto_codigo_pos to authenticated;
create policy lectura on public.producto_codigo_pos for select to authenticated
  using ((select public.rol_actual()) is not null);
create policy alta on public.producto_codigo_pos for insert to authenticated
  with check ((select public.tiene_rol('operaciones', 'admin')));
create policy cambio on public.producto_codigo_pos for update to authenticated
  using ((select public.tiene_rol('operaciones', 'admin'))) with check ((select public.tiene_rol('operaciones', 'admin')));
create policy baja on public.producto_codigo_pos for delete to authenticated
  using ((select public.tiene_rol('operaciones', 'admin')));
create policy oauth_sin_altas on public.producto_codigo_pos as restrictive for insert to authenticated
  with check (((select auth.jwt())->>'client_id') is null);
create policy oauth_sin_cambios on public.producto_codigo_pos as restrictive for update to authenticated
  using (((select auth.jwt())->>'client_id') is null) with check (((select auth.jwt())->>'client_id') is null);
create policy oauth_sin_bajas on public.producto_codigo_pos as restrictive for delete to authenticated
  using (((select auth.jwt())->>'client_id') is null);
