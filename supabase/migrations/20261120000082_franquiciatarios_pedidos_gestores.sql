-- Franquiciatarios · decisión de Carlos (2026-11-20): los pedidos a la Comercializadora, sus montos y recepciones son
-- del gerente y del franquiciatario (y del admin). La cuenta de baristas no ve pedidos, inventario ni P&L.
-- Esta migración cierra las recepciones a los gestores en la base (lectura y registro), además de la pantalla.

-- Sucursales donde el usuario es gerente o franquiciatario (para RLS, evaluada una vez por consulta).
create function public.franq_companias_gestor() returns integer[]
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(array_agg(fm.company_id), '{}') from public.franq_miembros fm
  where public.franq_tiene_modulo() and fm.user_id = auth.uid() and fm.activo
    and fm.rol in ('franquiciatario', 'gerente')
$$;
revoke all on function public.franq_companias_gestor() from public, anon;
grant execute on function public.franq_companias_gestor() to authenticated;

drop policy lectura on public.franq_recepciones;
create policy lectura on public.franq_recepciones for select to authenticated
  using ((select public.franq_es_admin()) or company_id = any ((select public.franq_companias_gestor())::integer[]));

-- Registrar una recepción: solo gerente, franquiciatario o admin de esa sucursal (registra con el nombre de su perfil).
create or replace function public.franq_recibir(p_company integer, p_pedido text, p_folio text, p_diferencias jsonb,
                                                p_observacion text, p_barista bigint, p_dispositivo text) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q record; v_id bigint; v_dif jsonb := coalesce(p_diferencias, '[]'::jsonb); e jsonb;
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
  return v_id;
end $$;
