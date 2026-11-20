-- Nivel de servicio y Conectividad de Rappi, leídos del portal de Partners por el mismo lector de pedidos
-- (docs/rappi-portal/08). Solo consultas: el lector no cambia nada en Rappi. Los escribe n8n con la llave de servicio
-- por rappi_importar_servicio; las tablas quedan cerradas para anon y authenticated (las lecturas para Sucursales y el
-- Tablero de México van en su propia migración, con el candado de sucursales_acceso).
-- Fuentes (partners-indicators y rest-aliados-state-ms; el portal manda las fechas en hora del centro):
--   v2/summary/metrics → rechazos, reclamos, disponibilidad y cocina demorada por tienda y día;
--   unavailability/metrics → minutos sin disponibilidad por tienda y día;
--   summary/sales/indicators → espera promedio del repartidor por tienda y día;
--   indicators/defects → cada reclamo; store-status-detail → estado en vivo; availability-monitoring → calor de 15 días;
--   rests-score/performance-system → categoría de Top Restaurantes.

-- 1. Indicadores por tienda y día. Cada fuente llena sus columnas; las que no vienen en un lote se conservan.
create table public.rappi_servicio_dia (
  rappi_tienda_id text not null references public.rappi_tiendas (rappi_tienda_id),
  fecha date not null,
  -- Rechazos (sobre pedidos creados): REJECTION_CBPI, _CBPR, _CLOSED_STORE, _STOCK_OUT, _DELAY_IN_STORE.
  pedidos integer check (pedidos >= 0),
  rech_cbpi integer check (rech_cbpi >= 0),
  rech_cbpr integer check (rech_cbpr >= 0),
  rech_tienda_cerrada integer check (rech_tienda_cerrada >= 0),
  rech_sin_stock integer check (rech_sin_stock >= 0),
  rech_demora integer check (rech_demora >= 0),
  -- Reclamos (sobre pedidos finalizados): ERROR_DAMAGED, ERROR_MISSING, ERROR_WRONG.
  finalizados integer check (finalizados >= 0),
  recl_mal_estado integer check (recl_mal_estado >= 0),
  recl_faltante integer check (recl_faltante >= 0),
  recl_incorrecto integer check (recl_incorrecto >= 0),
  -- Disponibilidad del día según Rappi (porcentaje 0–100).
  disponibilidad numeric(6, 2) check (disponibilidad between 0 and 100),
  indisponibilidad numeric(6, 2) check (indisponibilidad between 0 and 100),
  -- Cocina demorada: pedidos con retraso sobre los pedidos medidos.
  cocina_pedidos integer check (cocina_pedidos >= 0),
  cocina_demorada integer check (cocina_demorada >= 0),
  -- unavailability/metrics: minutos sin disponibilidad y eventos por franja (madrugada … noche).
  sin_disp_minutos integer check (sin_disp_minutos >= 0),
  sin_disp_franjas jsonb,
  -- summary/sales/indicators: espera promedio del repartidor en la tienda (minutos).
  espera_repartidor numeric(8, 2) check (espera_repartidor >= 0),
  leido_en timestamptz not null default now(),
  primary key (rappi_tienda_id, fecha)
);
create index rappi_servicio_dia_fecha on public.rappi_servicio_dia (fecha);

-- 2. Cada reclamo (indicators/defects). Sin datos del cliente: el portal no los manda; el comentario es el texto libre
--    que dejó sobre el pedido.
create table public.rappi_reclamos (
  rappi_pedido_id bigint primary key,
  rappi_tienda_id text not null references public.rappi_tiendas (rappi_tienda_id),
  fecha date not null,
  motivo text not null,
  subtipo text,
  producto text,
  comentario text,
  monto numeric(12, 2),
  leido_en timestamptz not null default now()
);
create index rappi_reclamos_tienda_fecha on public.rappi_reclamos (rappi_tienda_id, fecha);

-- 3. Conectividad: tramos de estado por tienda armados con la foto de cada corrida (Rappi no guarda historia).
--    `desde` = primera foto con ese estado; `visto` = última foto que lo confirmó; `hasta` = primera foto con otro
--    estado (null mientras sigue). Entre fotos no se sabe nada: si el lector se detiene, `visto` lo dice.
create table public.rappi_conectividad (
  id bigint generated always as identity primary key,
  rappi_tienda_id text not null references public.rappi_tiendas (rappi_tienda_id),
  estado text not null,
  motivo text,
  cierre_texto text,
  cierra timestamptz,
  desde timestamptz not null,
  visto timestamptz not null,
  hasta timestamptz,
  check (visto >= desde and (hasta is null or hasta >= visto))
);
create unique index rappi_conectividad_vigente on public.rappi_conectividad (rappi_tienda_id) where hasta is null;
create index rappi_conectividad_tienda_desde on public.rappi_conectividad (rappi_tienda_id, desde);

-- 4. «Promedio en 15 días» (availability-monitoring): fracción del tiempo disponible por hora y día de la semana,
--    una foto por tienda y día de lectura. matriz = {"06:00": {"mon": 0.0, …, "sun": 1.0}, …}.
create table public.rappi_disponibilidad_semana (
  rappi_tienda_id text not null references public.rappi_tiendas (rappi_tienda_id),
  fecha date not null,
  matriz jsonb not null,
  leido_en timestamptz not null default now(),
  primary key (rappi_tienda_id, fecha)
);

-- 5. Categoría de Top Restaurantes por tienda y día de lectura (actual y la próxima que calcula Rappi).
create table public.rappi_top_restaurantes (
  rappi_tienda_id text not null references public.rappi_tiendas (rappi_tienda_id),
  fecha date not null,
  categoria text not null,
  proxima text,
  leido_en timestamptz not null default now(),
  primary key (rappi_tienda_id, fecha)
);

do $$
declare t text;
begin
  foreach t in array array['rappi_servicio_dia', 'rappi_reclamos', 'rappi_conectividad',
                           'rappi_disponibilidad_semana', 'rappi_top_restaurantes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- 6. Importación (solo service_role, desde n8n). Idempotente. Formato (docs/rappi-portal/08 §3):
--   { momento, conectividad: [{tienda, estado, motivo, cierre}], dias: [{tienda, fecha, …columnas de 1}],
--     reclamos: [{pedido, tienda, fecha, motivo, subtipo, producto, comentario, monto}],
--     disponibilidad_semana: [{tienda, fecha, matriz}], top: [{tienda, fecha, categoria, proxima}] }
-- Una tienda que no está en rappi_tiendas se cuenta en `ignoradas` (no rompe el lote).
create function public.rappi_importar_servicio(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_momento timestamptz := coalesce((p->>'momento')::timestamptz, now());
  v jsonb;
  v_abierto public.rappi_conectividad;
  v_cierra timestamptz;
  v_m text[];
  v_dias integer := 0;
  v_reclamos integer := 0;
  v_cambios integer := 0;
  v_fotos integer := 0;
  v_semana integer := 0;
  v_top integer := 0;
  v_ignoradas text[] := '{}';
begin
  -- Tiendas que no están dadas de alta: se reportan y se saltan.
  v_ignoradas := array(
    select distinct x->>'tienda'
    from jsonb_array_elements(coalesce(p->'conectividad', '[]') || coalesce(p->'dias', '[]')
      || coalesce(p->'reclamos', '[]') || coalesce(p->'disponibilidad_semana', '[]') || coalesce(p->'top', '[]')) x
    where not exists (select 1 from public.rappi_tiendas t where t.rappi_tienda_id = x->>'tienda'));

  -- Indicadores por día: solo se pisan las columnas que trae el lote.
  for v in select * from jsonb_array_elements(coalesce(p->'dias', '[]')) loop
    continue when (v->>'tienda') = any (v_ignoradas);
    insert into public.rappi_servicio_dia as d (rappi_tienda_id, fecha, pedidos, rech_cbpi, rech_cbpr,
      rech_tienda_cerrada, rech_sin_stock, rech_demora, finalizados, recl_mal_estado, recl_faltante, recl_incorrecto,
      disponibilidad, indisponibilidad, cocina_pedidos, cocina_demorada, sin_disp_minutos, sin_disp_franjas,
      espera_repartidor, leido_en)
    values (v->>'tienda', (v->>'fecha')::date, (v->>'pedidos')::integer, (v->>'rech_cbpi')::integer,
      (v->>'rech_cbpr')::integer, (v->>'rech_tienda_cerrada')::integer, (v->>'rech_sin_stock')::integer,
      (v->>'rech_demora')::integer, (v->>'finalizados')::integer, (v->>'recl_mal_estado')::integer,
      (v->>'recl_faltante')::integer, (v->>'recl_incorrecto')::integer, (v->>'disponibilidad')::numeric,
      (v->>'indisponibilidad')::numeric, (v->>'cocina_pedidos')::integer, (v->>'cocina_demorada')::integer,
      (v->>'sin_disp_minutos')::integer, v->'sin_disp_franjas', (v->>'espera_repartidor')::numeric, now())
    on conflict (rappi_tienda_id, fecha) do update set
      pedidos = case when v ? 'pedidos' then excluded.pedidos else d.pedidos end,
      rech_cbpi = case when v ? 'rech_cbpi' then excluded.rech_cbpi else d.rech_cbpi end,
      rech_cbpr = case when v ? 'rech_cbpr' then excluded.rech_cbpr else d.rech_cbpr end,
      rech_tienda_cerrada = case when v ? 'rech_tienda_cerrada' then excluded.rech_tienda_cerrada
        else d.rech_tienda_cerrada end,
      rech_sin_stock = case when v ? 'rech_sin_stock' then excluded.rech_sin_stock else d.rech_sin_stock end,
      rech_demora = case when v ? 'rech_demora' then excluded.rech_demora else d.rech_demora end,
      finalizados = case when v ? 'finalizados' then excluded.finalizados else d.finalizados end,
      recl_mal_estado = case when v ? 'recl_mal_estado' then excluded.recl_mal_estado else d.recl_mal_estado end,
      recl_faltante = case when v ? 'recl_faltante' then excluded.recl_faltante else d.recl_faltante end,
      recl_incorrecto = case when v ? 'recl_incorrecto' then excluded.recl_incorrecto else d.recl_incorrecto end,
      disponibilidad = case when v ? 'disponibilidad' then excluded.disponibilidad else d.disponibilidad end,
      indisponibilidad = case when v ? 'indisponibilidad' then excluded.indisponibilidad else d.indisponibilidad end,
      cocina_pedidos = case when v ? 'cocina_pedidos' then excluded.cocina_pedidos else d.cocina_pedidos end,
      cocina_demorada = case when v ? 'cocina_demorada' then excluded.cocina_demorada else d.cocina_demorada end,
      sin_disp_minutos = case when v ? 'sin_disp_minutos' then excluded.sin_disp_minutos else d.sin_disp_minutos end,
      sin_disp_franjas = case when v ? 'sin_disp_franjas' then excluded.sin_disp_franjas else d.sin_disp_franjas end,
      espera_repartidor = case when v ? 'espera_repartidor' then excluded.espera_repartidor
        else d.espera_repartidor end,
      leido_en = now();
    v_dias := v_dias + 1;
  end loop;

  -- Reclamos: upsert por pedido (Rappi puede cambiar el monto compensado).
  for v in select * from jsonb_array_elements(coalesce(p->'reclamos', '[]')) loop
    continue when (v->>'tienda') = any (v_ignoradas);
    insert into public.rappi_reclamos (rappi_pedido_id, rappi_tienda_id, fecha, motivo, subtipo, producto,
      comentario, monto, leido_en)
    values ((v->>'pedido')::bigint, v->>'tienda', (v->>'fecha')::date, v->>'motivo', nullif(v->>'subtipo', ''),
      nullif(v->>'producto', ''), nullif(btrim(v->>'comentario'), ''), (v->>'monto')::numeric, now())
    on conflict (rappi_pedido_id) do update set rappi_tienda_id = excluded.rappi_tienda_id, fecha = excluded.fecha,
      motivo = excluded.motivo, subtipo = excluded.subtipo, producto = excluded.producto,
      comentario = excluded.comentario, monto = excluded.monto, leido_en = now();
    v_reclamos := v_reclamos + 1;
  end loop;

  -- Conectividad: la foto extiende el tramo vigente o abre uno nuevo. Fotos más viejas que la última se ignoran.
  for v in select * from jsonb_array_elements(coalesce(p->'conectividad', '[]')) loop
    continue when (v->>'tienda') = any (v_ignoradas) or coalesce(v->>'estado', '') = '';
    v_fotos := v_fotos + 1;
    -- «Until 20/11/2026 - 20:30:00» es hora del centro.
    v_m := regexp_match(coalesce(v->>'cierre', ''), '(\d{2}/\d{2}/\d{4}) - (\d{2}:\d{2}:\d{2})');
    v_cierra := case when v_m is null then null
      else (to_timestamp(v_m[1] || ' ' || v_m[2], 'DD/MM/YYYY HH24:MI:SS')::timestamp
        at time zone 'America/Mexico_City') end;
    select * into v_abierto from public.rappi_conectividad
      where rappi_tienda_id = v->>'tienda' and hasta is null for update;
    if found and v_momento <= v_abierto.visto then
      continue;
    elsif found and v_abierto.estado = v->>'estado' and v_abierto.motivo is not distinct from nullif(v->>'motivo', '')
    then
      update public.rappi_conectividad set visto = v_momento, cierre_texto = nullif(v->>'cierre', ''),
        cierra = v_cierra where id = v_abierto.id;
    else
      if found then
        update public.rappi_conectividad set hasta = v_momento where id = v_abierto.id;
      end if;
      insert into public.rappi_conectividad (rappi_tienda_id, estado, motivo, cierre_texto, cierra, desde, visto)
      values (v->>'tienda', v->>'estado', nullif(v->>'motivo', ''), nullif(v->>'cierre', ''), v_cierra,
        v_momento, v_momento);
      v_cambios := v_cambios + 1;
    end if;
  end loop;

  for v in select * from jsonb_array_elements(coalesce(p->'disponibilidad_semana', '[]')) loop
    continue when (v->>'tienda') = any (v_ignoradas);
    insert into public.rappi_disponibilidad_semana (rappi_tienda_id, fecha, matriz, leido_en)
    values (v->>'tienda', (v->>'fecha')::date, v->'matriz', now())
    on conflict (rappi_tienda_id, fecha) do update set matriz = excluded.matriz, leido_en = now();
    v_semana := v_semana + 1;
  end loop;

  for v in select * from jsonb_array_elements(coalesce(p->'top', '[]')) loop
    continue when (v->>'tienda') = any (v_ignoradas) or coalesce(v->>'categoria', '') = '';
    insert into public.rappi_top_restaurantes (rappi_tienda_id, fecha, categoria, proxima, leido_en)
    values (v->>'tienda', (v->>'fecha')::date, v->>'categoria', nullif(v->>'proxima', ''), now())
    on conflict (rappi_tienda_id, fecha) do update set categoria = excluded.categoria, proxima = excluded.proxima,
      leido_en = now();
    v_top := v_top + 1;
  end loop;

  return jsonb_build_object('dias', v_dias, 'reclamos', v_reclamos, 'fotos', v_fotos, 'cambios_conectividad',
    v_cambios, 'disponibilidad_semana', v_semana, 'top', v_top, 'ignoradas', to_jsonb(v_ignoradas));
end $$;

revoke all on function public.rappi_importar_servicio(jsonb) from public, anon, authenticated;
grant execute on function public.rappi_importar_servicio(jsonb) to service_role;
