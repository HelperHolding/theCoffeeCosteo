-- Franquiciatarios · F3 Pedidos y recepciones (docs/franquiciatarios/03-PLAN-RUTINA-Y-CONEXIONES.md).
-- Los pedidos de la tienda a la Comercializadora viven en el sitio viejo (vista com_legado_pedidos, solo service_role):
-- el portal los lee en el servidor por la apertura de la sucursal. Aquí solo se guarda la RECEPCIÓN que registra la
-- tienda: quién recibió, cuándo y qué llegó distinto. Solo inserción, una por pedido y sucursal; la hora la pone el
-- servidor. No escribe nada en el sitio viejo ni en las tablas com_*.

create table public.franq_recepciones (
  id bigint generated always as identity primary key,
  company_id integer not null check (company_id > 0),
  pedido_id text not null check (pedido_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  folio text check (folio is null or char_length(folio) <= 40),
  completo boolean not null,
  -- Solo los renglones con diferencia: [{"nombre": text, "sku": text|null, "pedido": num, "recibido": num}].
  diferencias jsonb not null default '[]'::jsonb
    check (jsonb_typeof(diferencias) = 'array' and jsonb_array_length(diferencias) <= 200),
  observacion text check (observacion is null or char_length(observacion) <= 1000),
  barista_id bigint references public.franq_baristas (id),
  nombre text not null,
  registrado_por uuid not null references auth.users (id),
  registrado_en timestamptz not null default now(),
  sesion text,
  dispositivo text check (dispositivo is null or char_length(dispositivo) <= 300),
  unique (company_id, pedido_id),
  constraint franq_recepciones_coherente check (completo = (jsonb_array_length(diferencias) = 0)),
  constraint franq_recepciones_observacion check (
    completo or char_length(btrim(coalesce(observacion, ''))) >= 3)
);
create index franq_recepciones_barista on public.franq_recepciones (barista_id);

create trigger franq_recepciones_solo_insercion before update or delete on public.franq_recepciones
  for each row execute function public.franq_solo_insercion();

alter table public.franq_recepciones enable row level security;
revoke all on public.franq_recepciones from anon, authenticated;
grant select on public.franq_recepciones to authenticated;
create policy lectura on public.franq_recepciones for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias())::integer[]));

-- Registrar la recepción de un pedido. Cualquier rol de la sucursal (la cuenta de baristas con su nombre declarado).
-- p_diferencias trae solo los renglones distintos; con diferencias la observación es obligatoria.
create function public.franq_recibir(p_company integer, p_pedido text, p_folio text, p_diferencias jsonb,
                                     p_observacion text, p_barista bigint, p_dispositivo text) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q record; v_id bigint; v_dif jsonb := coalesce(p_diferencias, '[]'::jsonb); e jsonb;
  v_obs text := nullif(btrim(coalesce(p_observacion, '')), '');
begin
  select * into q from public.franq_quien(p_company, p_barista);
  if p_pedido is null or p_pedido !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'Pedido inválido.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(v_dif) <> 'array' or jsonb_array_length(v_dif) > 200 then
    raise exception 'Diferencias inválidas.' using errcode = 'P0001';
  end if;
  for e in select * from jsonb_array_elements(v_dif) loop
    -- coalesce: un campo que falta da null, y un null en la condición no debe dejarlo pasar.
    if coalesce(jsonb_typeof(e) <> 'object' or jsonb_typeof(e->'nombre') <> 'string'
       or char_length(e->>'nombre') not between 1 and 200
       or jsonb_typeof(e->'pedido') <> 'number' or jsonb_typeof(e->'recibido') <> 'number', true)
       or coalesce((e->>'pedido')::numeric < 0 or (e->>'recibido')::numeric < 0
       or (e->>'pedido')::numeric = (e->>'recibido')::numeric, true) then
      raise exception 'Cada diferencia lleva producto, cantidad pedida y recibida (distintas, sin negativos).'
        using errcode = 'P0001';
    end if;
  end loop;
  if jsonb_array_length(v_dif) > 0 and char_length(coalesce(v_obs, '')) < 3 then
    raise exception 'Explica qué pasó con lo que llegó distinto.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.franq_recepciones where company_id = p_company and pedido_id = p_pedido) then
    raise exception 'Este pedido ya tiene su recepción registrada.' using errcode = 'P0001';
  end if;
  insert into public.franq_recepciones (company_id, pedido_id, folio, completo, diferencias, observacion, barista_id,
                                        nombre, registrado_por, sesion, dispositivo)
  values (p_company, p_pedido, left(nullif(btrim(coalesce(p_folio, '')), ''), 40), jsonb_array_length(v_dif) = 0,
          v_dif, v_obs, q.o_barista, q.o_nombre, auth.uid(), auth.jwt()->>'session_id', left(p_dispositivo, 300))
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.franq_recibir(integer, text, text, jsonb, text, bigint, text) from public, anon;
grant execute on function public.franq_recibir(integer, text, text, jsonb, text, bigint, text) to authenticated;
