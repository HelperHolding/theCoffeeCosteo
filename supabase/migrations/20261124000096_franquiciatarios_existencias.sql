-- Franquiciatarios · Existencias (pedido de Carlos, 2026-11-24): lo que se recibe entra al inventario.
-- Existencia esperada = último conteo de apertura + entradas − consumo teórico (recetas × ventas) − mermas; el
-- siguiente conteo de apertura se compara contra lo esperado (faltante o sobrante). El cálculo vive en la app
-- (lib/franquiciatarios/existencias.ts); aquí solo se guardan las ENTRADAS, con la misma regla de no borrar:
--   - 'pedido': la recepción de un pedido a la Comercializadora (gestores), convertida a insumos de la lista con la
--     equivalencia de la OV sugerida (com_insumo_sku); se guarda en la misma transacción que la recepción.
--   - 'proveedor': lo que llega de otro proveedor (leche, pan…). Cualquier rol de la sucursal, con su nombre.
-- La cantidad va en la unidad de la lista (la misma del conteo). Una corrección o anulación es un renglón nuevo.

create table public.franq_entradas (
  id bigint generated always as identity primary key,
  company_id integer not null check (company_id > 0),
  dia date not null,
  insumo_id bigint not null references public.franq_insumos (id),
  cantidad numeric not null check (cantidad > 0 and cantidad <= 100000),
  origen text not null check (origen in ('pedido', 'proveedor')),
  recepcion_id bigint references public.franq_recepciones (id),
  sku text check (sku is null or char_length(sku) <= 60),
  proveedor text check (proveedor is null or char_length(proveedor) <= 120),
  nota text check (nota is null or char_length(nota) <= 300),
  anulada boolean not null default false,
  corrige_id bigint references public.franq_entradas (id),
  motivo_correccion text check (motivo_correccion is null or char_length(motivo_correccion) <= 300),
  barista_id bigint references public.franq_baristas (id),
  nombre text not null,
  registrado_por uuid not null references auth.users (id),
  registrado_en timestamptz not null default now(),
  sesion text,
  dispositivo text check (dispositivo is null or char_length(dispositivo) <= 300),
  check ((origen = 'pedido') = (recepcion_id is not null)),
  check (origen <> 'proveedor' or char_length(btrim(coalesce(proveedor, ''))) >= 2),
  check (not anulada or corrige_id is not null)
);
create index franq_entradas_dia on public.franq_entradas (company_id, dia);
create index franq_entradas_insumo on public.franq_entradas (insumo_id);
create index franq_entradas_recepcion on public.franq_entradas (recepcion_id);
create index franq_entradas_barista on public.franq_entradas (barista_id);
create unique index franq_entradas_corrige on public.franq_entradas (corrige_id) where corrige_id is not null;
create trigger franq_entradas_solo_insercion before update or delete on public.franq_entradas
  for each row execute function public.franq_solo_insercion();

-- Toda la sucursal la lee (no hay montos), como las mermas.
alter table public.franq_entradas enable row level security;
revoke all on public.franq_entradas from anon, authenticated;
grant select on public.franq_entradas to authenticated;
create policy lectura on public.franq_entradas for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias())::integer[]));

-- Entrada de otro proveedor, o corrección / anulación de una entrada vigente (`p_corrige`). Cualquier rol de la
-- sucursal; una entrada de otro día o de un pedido solo la corrige la gerencia, con motivo.
create function public.franq_registrar_entrada(p_company integer, p_insumo bigint, p_cantidad numeric,
                                               p_proveedor text, p_nota text, p_barista bigint, p_dispositivo text,
                                               p_corrige bigint, p_anular boolean, p_motivo_correccion text)
returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare q record; v_dia date := public.franq_dia_operacion(now()); v_id bigint; o record;
  v_gestor boolean := public.franq_es_gestor(p_company);
  v_motivo_corr text := nullif(btrim(coalesce(p_motivo_correccion, '')), '');
  v_prov text := nullif(btrim(coalesce(p_proveedor, '')), '');
  v_de_pedido boolean := false;
begin
  select * into q from public.franq_quien(p_company, p_barista);
  if p_corrige is not null then
    select * into o from public.franq_entradas e where e.id = p_corrige and e.company_id = p_company and not e.anulada
      and not exists (select 1 from public.franq_entradas x where x.corrige_id = e.id);
    if o.id is null then
      raise exception 'Ese registro ya no está vigente.' using errcode = 'P0001';
    end if;
    if (o.dia <> v_dia or o.origen = 'pedido') and not v_gestor then
      raise exception 'Solo la gerencia corrige entradas de otro día o de un pedido.' using errcode = '42501';
    end if;
    if (o.dia <> v_dia or o.origen = 'pedido') and v_motivo_corr is null then
      raise exception 'Escribe el motivo de la corrección.' using errcode = 'P0001';
    end if;
    v_dia := o.dia;
    v_de_pedido := o.origen = 'pedido';
  end if;
  if coalesce(p_anular, false) then
    if p_corrige is null then raise exception 'Indica qué registro se anula.' using errcode = 'P0001'; end if;
    insert into public.franq_entradas (company_id, dia, insumo_id, cantidad, origen, recepcion_id, sku, proveedor,
                                       nota, anulada, corrige_id, motivo_correccion, barista_id, nombre,
                                       registrado_por, sesion, dispositivo)
    values (p_company, v_dia, o.insumo_id, o.cantidad, o.origen, o.recepcion_id, o.sku, o.proveedor, o.nota, true,
            p_corrige, v_motivo_corr, q.o_barista, q.o_nombre, auth.uid(), auth.jwt()->>'session_id',
            left(p_dispositivo, 300))
    returning id into v_id;
    return v_id;
  end if;
  if not exists (select 1 from public.franq_insumos where id = p_insumo and company_id = p_company and activo) then
    raise exception 'Ese insumo no está en la lista de esta sucursal.' using errcode = 'P0001';
  end if;
  if p_cantidad is null or p_cantidad <= 0 or p_cantidad > 100000 then
    raise exception 'La cantidad va de más de 0 en adelante.' using errcode = 'P0001';
  end if;
  -- Una corrección de un pedido conserva su origen y su recepción; lo demás es de otro proveedor.
  if v_de_pedido then
    insert into public.franq_entradas (company_id, dia, insumo_id, cantidad, origen, recepcion_id, sku, proveedor,
                                       nota, corrige_id, motivo_correccion, barista_id, nombre, registrado_por,
                                       sesion, dispositivo)
    values (p_company, v_dia, p_insumo, p_cantidad, 'pedido', o.recepcion_id, o.sku, null,
            nullif(btrim(coalesce(p_nota, '')), ''), p_corrige, v_motivo_corr, q.o_barista, q.o_nombre, auth.uid(),
            auth.jwt()->>'session_id', left(p_dispositivo, 300))
    returning id into v_id;
    return v_id;
  end if;
  if char_length(coalesce(v_prov, '')) < 2 then
    raise exception 'Escribe de qué proveedor llegó.' using errcode = 'P0001';
  end if;
  insert into public.franq_entradas (company_id, dia, insumo_id, cantidad, origen, proveedor, nota, corrige_id,
                                     motivo_correccion, barista_id, nombre, registrado_por, sesion, dispositivo)
  values (p_company, v_dia, p_insumo, p_cantidad, 'proveedor', left(v_prov, 120),
          nullif(btrim(coalesce(p_nota, '')), ''), p_corrige, v_motivo_corr, q.o_barista, q.o_nombre, auth.uid(),
          auth.jwt()->>'session_id', left(p_dispositivo, 300))
  returning id into v_id;
  return v_id;
end $$;

-- Recepción de un pedido con sus entradas: la versión de 7 argumentos (migración 82) se reemplaza por una que además
-- recibe p_entradas = [{"insumo": bigint, "cantidad": numeric, "sku": text}], ya convertidas por el servidor a la
-- unidad de la lista. Recepción y entradas quedan en la misma transacción.
drop function public.franq_recibir(integer, text, text, jsonb, text, bigint, text);
create function public.franq_recibir(p_company integer, p_pedido text, p_folio text, p_diferencias jsonb,
                                     p_observacion text, p_barista bigint, p_dispositivo text,
                                     p_entradas jsonb default '[]'::jsonb) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q record; v_id bigint; v_dif jsonb := coalesce(p_diferencias, '[]'::jsonb); e jsonb;
  v_ent jsonb := coalesce(p_entradas, '[]'::jsonb);
  v_obs text := nullif(btrim(coalesce(p_observacion, '')), '');
begin
  if not public.franq_es_gestor(p_company) then
    raise exception 'Solo el gerente o el franquiciatario registran recepciones.' using errcode = '42501';
  end if;
  select * into q from public.franq_quien(p_company, null);
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
  if jsonb_typeof(v_ent) <> 'array' or jsonb_array_length(v_ent) > 200 then
    raise exception 'Entradas inválidas.' using errcode = 'P0001';
  end if;
  for e in select * from jsonb_array_elements(v_ent) loop
    if coalesce(jsonb_typeof(e) <> 'object' or jsonb_typeof(e->'insumo') <> 'number'
       or jsonb_typeof(e->'cantidad') <> 'number'
       or (e ? 'sku' and jsonb_typeof(e->'sku') not in ('string', 'null')), true)
       or coalesce((e->>'cantidad')::numeric <= 0 or (e->>'cantidad')::numeric > 100000, true)
       or not exists (select 1 from public.franq_insumos i where i.id = (e->>'insumo')::bigint
                      and i.company_id = p_company) then
      raise exception 'Cada entrada lleva un insumo de la lista y una cantidad mayor que 0.' using errcode = 'P0001';
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
          v_dif, v_obs, null, q.o_nombre, auth.uid(), auth.jwt()->>'session_id', left(p_dispositivo, 300))
  returning id into v_id;
  insert into public.franq_entradas (company_id, dia, insumo_id, cantidad, origen, recepcion_id, sku, nombre,
                                     registrado_por, sesion, dispositivo)
  select p_company, public.franq_dia_operacion(now()), (x->>'insumo')::bigint, (x->>'cantidad')::numeric, 'pedido',
         v_id, left(x->>'sku', 60), q.o_nombre, auth.uid(), auth.jwt()->>'session_id', left(p_dispositivo, 300)
  from jsonb_array_elements(v_ent) x;
  return v_id;
end $$;

revoke all on function public.franq_registrar_entrada(integer, bigint, numeric, text, text, bigint, text, bigint,
  boolean, text), public.franq_recibir(integer, text, text, jsonb, text, bigint, text, jsonb) from public, anon;
grant execute on function public.franq_registrar_entrada(integer, bigint, numeric, text, text, bigint, text, bigint,
  boolean, text), public.franq_recibir(integer, text, text, jsonb, text, bigint, text, jsonb) to authenticated;
