-- CRM Unificado (doc 40 §4–5): requisitos por etapa, cumplimientos, liberaciones y las funciones que
-- aplican los candados. Las escrituras de candados solo pasan por estas funciones (sin grants directos).

create table public.crm_requisitos (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  etapa_id uuid not null references public.crm_etapas(id),
  nombre text not null check (btrim(nombre) <> ''),
  tipo text not null check (tipo in ('documento', 'fecha', 'validacion', 'firma', 'dato')),
  area_cumple text not null references public.crm_areas(clave),
  area_valida text not null references public.crm_areas(clave),
  funcion_cumple text check (funcion_cumple in ('aprobacion_locales')),
  obligatorio boolean not null default true,
  -- Si tiene campo, se cumple solo cuando el dato de la card existe (sin captura aparte).
  campo text,
  tipo_documento text,
  depende_de text[] not null default '{}',
  -- Carril paralelo (Q2): se puede registrar mientras la sucursal está en etapas de Proyectos.
  anticipable boolean not null default false,
  orden smallint not null,
  ayuda text not null default '',
  activo boolean not null default true,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid,
  version integer not null default 1
);
create index crm_requisitos_etapa on public.crm_requisitos (etapa_id, orden);

-- Semilla: proceso del documento «Desarrollo de CRM Unificado» (21-oct-2026) y decisiones del 2026-11-03.
insert into public.crm_requisitos
  (clave, etapa_id, orden, nombre, tipo, area_cumple, area_valida, funcion_cumple, obligatorio, campo, tipo_documento, depende_de, anticipable, ayuda)
select r.clave, public.crm_etapa(r.etapa), r.orden, r.nombre, r.tipo, r.cumple, r.valida, r.funcion, r.obligatorio, r.campo,
  r.documento, r.depende, r.anticipable, r.ayuda
from (values
  ('contacto', 'recepcion', 1, 'Contacto (correo o teléfono)', 'dato', 'ventas', 'ventas', null, true, 'contacto', null, '{}'::text[], false,
    'Se registra al prospecto con sus datos de contacto.'),
  ('ciudad_interes', 'recepcion', 2, 'Ciudad de interés', 'dato', 'ventas', 'ventas', null, true, 'ciudad_interes', null, '{}', false,
    'Ciudad o zona donde quiere abrir.'),
  ('origen', 'recepcion', 3, 'Origen de captación', 'dato', 'ventas', 'ventas', null, true, 'origen', null, '{}', false,
    'De dónde llegó el lead (sitio, evento, referido…).'),
  ('territorio', 'recepcion', 4, 'Resultado territorial', 'validacion', 'ventas', 'ventas', null, true, 'territorio', null, '{}', false,
    'Disponible, restringida, exclusiva o bloqueada. Con territorio bloqueado la card no avanza: solo Standby o Descartada.'),
  ('vendedor', 'recepcion', 5, 'Vendedor asignado', 'dato', 'ventas', 'ventas', null, true, 'responsable_id', null, '{}', false,
    'Responsable comercial que dará seguimiento.'),
  ('primera_reunion', 'contacto', 1, 'Fecha de primera reunión', 'fecha', 'ventas', 'ventas', null, true, null, null, '{}', false,
    'El vendedor presenta el modelo de franquicia.'),
  ('info_comercial', 'contacto', 2, 'Información comercial enviada (plantilla única)', 'fecha', 'ventas', 'ventas', null, true, null, null, '{}', false,
    'Correo institucional estandarizado con la información y la presentación oficial.'),
  ('apartado_comprobante', 'revision_contrato', 1, 'Comprobante del apartado ($50,000 + IVA)', 'documento', 'ventas', 'ventas', null, true, null, 'comprobante_apartado', '{}', false,
    'Las instrucciones de pago van solo por correo, con la plantilla oficial de Finanzas.'),
  ('apartado_validado', 'revision_contrato', 2, 'Pago del apartado validado por Finanzas', 'validacion', 'ventas', 'finanzas', null, true, null, null, '{apartado_comprobante}', false,
    'Mientras Finanzas no esté en el CRM, Ventas lo registra con la confirmación de Finanzas adjunta.'),
  ('solicitud_legal', 'revision_contrato', 3, 'Solicitud a Legal del envío del contrato', 'fecha', 'ventas', 'ventas', null, true, null, null, '{apartado_validado}', false,
    'Con nombre y contacto del prospecto, comprobante y confirmación de Finanzas.'),
  ('contrato_enviado', 'revision_contrato', 4, 'Contrato enviado al prospecto', 'fecha', 'legal', 'legal', null, true, null, null, '{apartado_comprobante,apartado_validado,solicitud_legal}', false,
    'Legal no envía el contrato sin comprobante y validación de Finanzas. Ventas nunca lo comparte.'),
  ('confirmacion_interes', 'pld', 1, 'Confirmación de interés', 'fecha', 'ventas', 'ventas', null, true, null, null, '{}', false,
    'El prospecto confirma que liquidará el fee inicial; empieza el expediente.'),
  ('survey', 'pld', 2, 'Survey completo y validado', 'documento', 'ventas', 'ventas', null, true, null, 'survey', '{}', false,
    'Firmante, obligado solidario y documentos completos, legibles y vigentes. Legal no volverá a pedirlos.'),
  ('pld_digital', 'pld', 3, 'Formato PLD firmado (copia digital)', 'documento', 'ventas', 'ventas', null, true, null, 'pld', '{}', false,
    'A puño y letra, firmado con pluma azul. Sin PLD no se acepta el pago.'),
  ('instrucciones_pago', 'pld', 4, 'Instrucciones de pago enviadas', 'fecha', 'ventas', 'ventas', null, true, null, null, '{survey,pld_digital}', false,
    'Solo con Survey y PLD completos; por correo, con la plantilla de Finanzas.'),
  ('liquidacion_comprobante', 'pld', 5, 'Comprobante de liquidación del fee', 'documento', 'ventas', 'ventas', null, true, null, 'comprobante_pago', '{pld_digital}', false,
    'Restante del apartado o fee completo.'),
  ('pago_validado', 'pld', 6, 'Pago validado por Finanzas', 'validacion', 'ventas', 'finanzas', null, true, null, null, '{liquidacion_comprobante}', false,
    'Con la liquidación validada, el prospecto pasa a ser franquiciatario.'),
  ('bienvenida', 'bienvenida', 1, 'Correo de bienvenida enviado', 'fecha', 'ventas', 'ventas', null, true, null, null, '{}', false,
    'Con copia a Legal, Finanzas y responsables internos.'),
  ('carta_intencion', 'bienvenida', 2, 'Carta de intención firmada', 'firma', 'legal', 'legal', null, true, null, 'carta_intencion', '{}', false,
    'Se firma el mismo día del pago del fee. Sin carta no hay búsqueda de local ni propuestas al Comité.'),
  ('factura_csf', 'bienvenida', 3, 'Solicitud de factura: CSF y datos fiscales', 'documento', 'ventas', 'ventas', null, true, null, 'csf', '{}', false,
    'El expediente debe tener CSF, datos fiscales, comprobantes, Survey y PLD.'),
  ('pld_original', 'bienvenida', 4, 'PLD original recibido en corporativo', 'fecha', 'ventas', 'ventas', null, true, null, null, '{}', false,
    'Obligatorio para tener por integrado el expediente (decisión Q1: candado de la etapa 5).'),
  ('lineamientos', 'locales', 1, 'Lineamientos y formatos enviados', 'fecha', 'ventas', 'ventas', 'aprobacion_locales', true, null, null, '{}', false,
    'Video tutorial y formatos oficiales para presentar cada propuesta de local.'),
  ('propuestas', 'locales', 2, 'Propuesta(s) de local', 'documento', 'ventas', 'ventas', 'aprobacion_locales', true, null, 'propuesta_local', '{}', false,
    'Conforme a los formatos y requisitos establecidos.'),
  ('dictamen', 'locales', 3, 'Dictamen y resolución del Comité', 'documento', 'ventas', 'ventas', 'aprobacion_locales', true, null, 'dictamen', '{propuestas}', false,
    'Aprobación de locales coordina la presentación ante el Comité de Aprobaciones.'),
  ('dictamen_firmado', 'locales', 4, 'Dictamen firmado por el franquiciatario', 'firma', 'ventas', 'ventas', 'aprobacion_locales', true, null, 'dictamen_firmado', '{dictamen}', false,
    'Sin dictamen firmado no se pide la constancia de arrendamiento.'),
  ('arrendamiento', 'constancia', 1, 'Contrato de arrendamiento firmado', 'documento', 'ventas', 'ventas', 'aprobacion_locales', true, null, 'contrato_arrendamiento', '{}', false,
    'Se adjunta con el dictamen firmado al pedir la constancia.'),
  ('solicitud_constancia', 'constancia', 2, 'Solicitud de constancia a Legal', 'fecha', 'ventas', 'ventas', 'aprobacion_locales', true, null, null, '{arrendamiento}', false,
    'Aprobación de locales la pide con el dictamen firmado y el contrato de arrendamiento.'),
  ('constancia_firmada', 'constancia', 3, 'Constancia de arrendamiento firmada', 'firma', 'legal', 'legal', null, true, null, 'constancia', '{solicitud_constancia}', false,
    'Legal la firma el mismo día que se acredita el arrendamiento.'),
  ('fecha_limite', 'constancia', 4, 'Fecha límite de apertura', 'dato', 'legal', 'legal', null, true, 'fecha_limite_apertura', null, '{}', false,
    'Por lo general, firma de la constancia + 120 días.'),
  ('transferencia_habilitada', 'transferencia', 1, 'Transferencia a Proyectos habilitada', 'validacion', 'legal', 'legal', null, true, null, null, '{}', false,
    'Ninguna ubicación pasa a Proyectos sin constancia firmada y validada por Legal.'),
  ('fecha_estimada', 'transferencia', 2, 'Fecha estimada de apertura', 'dato', 'proyectos', 'proyectos', null, true, 'fecha_estimada_apertura', null, '{}', false,
    'Proyectos la registra y la mantiene actualizada.'),
  ('jestor', 'transferencia', 3, 'ID oficial en Jestor', 'dato', 'ventas', 'ventas', null, false, 'numero_tienda_jestor', null, '{}', false,
    'Ventas lo da de alta en Jestor y lo notifica. No bloquea.'),
  ('cof_enviada', 'cof', 1, 'COF enviada al franquiciatario', 'fecha', 'legal', 'legal', null, true, null, null, '{}', true,
    'La LFPPI exige entregarla al menos 2 meses antes de celebrar el contrato de franquicia.'),
  ('cof_firmada', 'cof', 2, 'COF firmada y fecha de entrega', 'firma', 'legal', 'legal', null, true, null, 'cof', '{cof_enviada}', true,
    'Sin COF firmada no se envía el contrato. Si llega tarde, la apertura se ajusta al plazo legal.'),
  ('fecha_confirmada', 'contrato', 1, 'Fecha confirmada de apertura', 'dato', 'proyectos', 'proyectos', null, true, 'fecha_confirmada_apertura', null, '{}', true,
    'Proyectos la confirma a Legal al menos 5 días hábiles antes.'),
  ('contrato_firmado', 'contrato', 2, 'Contrato firmado por franquiciatario y obligado solidario', 'firma', 'legal', 'legal', null, true, null, 'contrato_franquicia', '{cof_firmada}', true,
    'Ninguna sucursal abre sin las dos firmas.'),
  ('liberacion_apertura', 'contrato', 3, 'Liberación para apertura', 'validacion', 'legal', 'legal', null, true, null, null, '{contrato_firmado}', false,
    'Con el contrato firmado, Legal libera la sucursal para abrir.')
) as r(clave, etapa, orden, nombre, tipo, cumple, valida, funcion, obligatorio, campo, documento, depende, anticipable, ayuda);

create table public.crm_cumplimientos (
  id uuid primary key default gen_random_uuid(),
  requisito_id uuid not null references public.crm_requisitos(id),
  franquiciatario_id uuid references public.crm_franquiciatarios(id) on delete cascade,
  tienda_id uuid references public.crm_tiendas(id) on delete cascade,
  card_id uuid generated always as (coalesce(franquiciatario_id, tienda_id)) stored,
  estado text not null check (estado in ('pendiente', 'cumplido', 'validado', 'no_aplica')),
  valor text,
  fecha date,
  archivo_id uuid references public.crm_archivos(id),
  nota text,
  cumplido_por uuid,
  cumplido_en timestamptz,
  validado_por uuid,
  validado_en timestamptz,
  actualizado_en timestamptz not null default now(),
  version integer not null default 1,
  check (num_nonnulls(franquiciatario_id, tienda_id) = 1),
  unique (requisito_id, card_id)
);
create index crm_cumplimientos_card on public.crm_cumplimientos (card_id);
create index crm_cumplimientos_archivo on public.crm_cumplimientos (archivo_id) where archivo_id is not null;

create table public.crm_liberaciones (
  id uuid primary key default gen_random_uuid(),
  franquiciatario_id uuid references public.crm_franquiciatarios(id) on delete cascade,
  tienda_id uuid references public.crm_tiendas(id) on delete cascade,
  card_id uuid generated always as (coalesce(franquiciatario_id, tienda_id)) stored,
  etapa_id uuid not null references public.crm_etapas(id),
  faltantes jsonb not null,
  motivo text not null check (length(btrim(motivo)) >= 15),
  liberado_por uuid not null,
  liberado_en timestamptz not null default now(),
  consumida_en timestamptz,
  check (num_nonnulls(franquiciatario_id, tienda_id) = 1)
);
create unique index crm_liberaciones_vigente on public.crm_liberaciones (card_id, etapa_id) where consumida_en is null;
create index crm_liberaciones_fecha on public.crm_liberaciones (liberado_en desc);

-- Seguridad: lectura con el módulo; escrituras solo por funciones. Requisitos: heads y desarrolladores.
do $$
declare t text;
begin
  foreach t in array array['crm_requisitos', 'crm_cumplimientos', 'crm_liberaciones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy lectura on public.%I for select to authenticated using ((select public.crm_puede_leer()))', t);
    execute format('create policy crm_sin_oauth on public.%I as restrictive for all to authenticated '
      'using (((select auth.jwt())->>''client_id'') is null) with check (((select auth.jwt())->>''client_id'') is null)', t);
  end loop;
end $$;
grant update (nombre, ayuda, obligatorio, orden, activo) on public.crm_requisitos to authenticated;
create policy cambio on public.crm_requisitos for update to authenticated
  using ((select public.crm_es_head() or public.crm_es_desarrollador()))
  with check ((select public.crm_es_head() or public.crm_es_desarrollador()));
create trigger crm_requisitos_sellar before update on public.crm_requisitos
  for each row execute function public.crm_sellar();

-- Estado de cada requisito para una card (las de su etapa actual o, con p_todas, todas hasta ella).
create function public.crm_requisitos_de(p_tipo text, p_card uuid, p_todas boolean default false)
returns table (
  requisito_id uuid, clave text, etapa_id uuid, etapa_clave text, etapa_orden integer, de_etapa_actual boolean,
  nombre text, tipo text, area_cumple text, area_valida text, funcion_cumple text, obligatorio boolean,
  campo text, tipo_documento text, depende_de text[], anticipable boolean, orden smallint, ayuda text,
  estado text, cumplimiento_id uuid, valor text, fecha date, archivo_id uuid, nota text,
  cumplido_por uuid, cumplido_en timestamptz, validado_por uuid, validado_en timestamptz)
language sql stable set search_path = public, pg_temp as $$
  with card as (
    select f.etapa_id, to_jsonb(f) as datos from public.crm_franquiciatarios f where p_tipo = 'franquiciatario' and f.id = p_card
    union all
    select t.etapa_id, to_jsonb(t) from public.crm_tiendas t where p_tipo = 'sucursal' and t.id = p_card
  ), actual as (
    select e.*, c.datos from card c join public.crm_etapas e on e.id = c.etapa_id
  )
  select r.id, r.clave, r.etapa_id, e.clave, e.orden, r.etapa_id = a.id, r.nombre, r.tipo, r.area_cumple, r.area_valida,
    r.funcion_cumple, r.obligatorio, r.campo, r.tipo_documento, r.depende_de, r.anticipable, r.orden, r.ayuda,
    case
      when r.campo = 'contacto' then
        case when coalesce(nullif(a.datos->>'correo', ''), nullif(a.datos->>'telefono', '')) is not null then 'validado' else 'pendiente' end
      when r.campo is not null then case when nullif(a.datos->>r.campo, '') is not null then 'validado' else 'pendiente' end
      else coalesce(cu.estado, 'pendiente')
    end,
    cu.id, case when r.campo is not null and r.campo <> 'contacto' then a.datos->>r.campo else cu.valor end,
    cu.fecha, cu.archivo_id, cu.nota, cu.cumplido_por, cu.cumplido_en, cu.validado_por, cu.validado_en
  from actual a
  join public.crm_requisitos r on r.activo
  join public.crm_etapas e on e.id = r.etapa_id and e.card = p_tipo
  left join public.crm_cumplimientos cu on cu.requisito_id = r.id and cu.card_id = p_card
  where r.etapa_id = a.id
    -- Carril paralelo: con la sucursal en Proyectos (o en la transferencia) se ven los de COF y contrato.
    or (r.anticipable and a.tipo = 'abierta' and (a.provisional or a.clave = 'transferencia') and e.orden > a.orden)
    or (p_todas and e.orden < a.orden)
$$;

-- Candado de la etapa actual de cada card del embudo general (Pipeline, Panel y agente).
create view public.crm_v_candados with (security_invoker = true) as
select c.tipo_card, c.card_id, c.etapa_id,
  count(*) filter (where q.de_etapa_actual and q.obligatorio)::int as total,
  count(*) filter (where q.de_etapa_actual and q.obligatorio and q.estado in ('validado', 'no_aplica'))::int as listos,
  (array_agg(q.nombre order by q.orden) filter (where q.de_etapa_actual and q.obligatorio
    and q.estado not in ('validado', 'no_aplica')))[1] as faltante,
  (array_agg(q.area_cumple order by q.orden) filter (where q.de_etapa_actual and q.obligatorio
    and q.estado not in ('validado', 'no_aplica')))[1] as faltante_area,
  exists (select 1 from public.crm_liberaciones l
    where l.card_id = c.card_id and l.etapa_id = c.etapa_id and l.consumida_en is null) as liberado
from (
  select 'franquiciatario'::text as tipo_card, f.id as card_id, f.etapa_id from public.crm_franquiciatarios f
  where f.archivado_en is null
  union all
  select 'sucursal', t.id, t.etapa_id from public.crm_tiendas t where t.embudo = 'general' and t.archivado_en is null
) c
left join lateral public.crm_requisitos_de(c.tipo_card, c.card_id) q on true
group by c.tipo_card, c.card_id, c.etapa_id;
grant select on public.crm_v_candados to authenticated;

-- Área que valida en la práctica: un área inactiva (Finanzas) la cubre Ventas con evidencia (P1).
create function public.crm_area_efectiva(p_area text) returns text
language sql stable set search_path = public, pg_temp as $$
  select case when (select activa from public.crm_areas where clave = p_area) then p_area else 'ventas' end
$$;

create function public.crm_nombre_area(p_area text) returns text
language sql stable set search_path = public, pg_temp as $$
  select nombre from public.crm_areas where clave = p_area
$$;

-- Bloquea la card (franquiciatario o sucursal) y devuelve su etapa y versión.
create function public.crm_bloquear_card(p_tipo text, p_card uuid, out etapa_id uuid, out version integer,
  out etapa_previa_id uuid, out territorio text)
language plpgsql set search_path = public, pg_temp as $$
begin
  if p_tipo = 'franquiciatario' then
    select f.etapa_id, f.version, f.etapa_previa_id, f.territorio into etapa_id, version, etapa_previa_id, territorio
    from public.crm_franquiciatarios f where f.id = p_card and f.archivado_en is null for update;
  elsif p_tipo = 'sucursal' then
    select t.etapa_id, t.version, t.etapa_previa_id, null into etapa_id, version, etapa_previa_id, territorio
    from public.crm_tiendas t where t.id = p_card and t.embudo = 'general' and t.archivado_en is null for update;
  else
    raise exception 'Tipo de card no válido' using errcode = '22023';
  end if;
  if etapa_id is null then raise exception 'La card no existe o está archivada' using errcode = 'P0002'; end if;
end $$;

-- Puede mover la etapa: su área (y función, si la etapa la pide), un head o un desarrollador.
create function public.crm_puede_mover(p_etapa public.crm_etapas) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select public.crm_es_head() or (public.crm_puede_operar(p_etapa.area)
    and (p_etapa.funcion is null or public.crm_tiene_funcion(p_etapa.funcion)))
$$;

-- Registrar el cumplimiento de un requisito. Si quien cumple también valida, queda validado.
create function public.crm_cumplir(p_tipo text, p_card uuid, p_requisito uuid, p_valor text default null,
  p_fecha date default null, p_archivo uuid default null, p_nota text default null)
returns public.crm_cumplimientos
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record;
  dep text;
  valida text;
  fila public.crm_cumplimientos;
  auto boolean;
begin
  if not coalesce(public.crm_puede_editar(), false) then
    raise exception 'Sin permiso de edición en el CRM' using errcode = '42501';
  end if;
  select q.* into r from public.crm_requisitos_de(p_tipo, p_card) q where q.requisito_id = p_requisito;
  if not found then
    raise exception 'Ese requisito no es de la etapa actual de esta card' using errcode = '22023';
  end if;
  if r.campo is not null then
    raise exception 'Este requisito se cumple al capturar el dato en la card' using errcode = '22023';
  end if;
  if r.estado = 'validado' then
    raise exception 'Ya está validado; si hay que corregirlo, primero reviértelo' using errcode = '22023';
  end if;
  if not (public.crm_es_head() or (public.crm_puede_operar(r.area_cumple)
    and (r.funcion_cumple is null or public.crm_tiene_funcion(r.funcion_cumple)))) then
    raise exception 'Este requisito lo registra %', public.crm_nombre_area(r.area_cumple) using errcode = '42501';
  end if;
  foreach dep in array r.depende_de loop
    if not exists (select 1 from public.crm_requisitos_de(p_tipo, p_card, true) d
      where d.clave = dep and d.estado in ('validado', 'no_aplica')) then
      raise exception 'Primero: %', (select nombre from public.crm_requisitos where clave = dep) using errcode = '22023';
    end if;
  end loop;
  valida := public.crm_area_efectiva(r.area_valida);
  if r.tipo in ('documento', 'firma') or (r.area_valida <> valida) then
    -- Documento, firma o validación registrada por otra área (P1): siempre con evidencia del expediente.
    if p_archivo is null then raise exception 'Adjunta el documento' using errcode = '22023'; end if;
    if not exists (select 1 from public.crm_archivos a where a.id = p_archivo and a.archivado_en is null
      and coalesce(a.franquiciatario_id, a.tienda_id) = p_card) then
      raise exception 'El documento no es de esta card' using errcode = '22023';
    end if;
  end if;
  if r.tipo in ('fecha', 'firma') and p_fecha is null then
    raise exception 'Indica la fecha' using errcode = '22023';
  end if;
  auto := valida = public.crm_area_efectiva(r.area_cumple) and (public.crm_es_head() or public.crm_puede_operar(valida));
  insert into public.crm_cumplimientos (requisito_id, franquiciatario_id, tienda_id, estado, valor, fecha, archivo_id, nota,
    cumplido_por, cumplido_en, validado_por, validado_en)
  values (p_requisito, case when p_tipo = 'franquiciatario' then p_card end, case when p_tipo = 'sucursal' then p_card end,
    case when auto then 'validado' else 'cumplido' end, nullif(btrim(p_valor), ''), p_fecha, p_archivo,
    coalesce(nullif(btrim(p_nota), ''), case when r.area_valida <> valida
      then format('Validado por %s (registrado por %s)', public.crm_nombre_area(r.area_valida),
        (select nombre from public.perfiles where user_id = auth.uid())) end),
    auth.uid(), now(), case when auto then auth.uid() end, case when auto then now() end)
  on conflict (requisito_id, card_id) do update set
    estado = excluded.estado, valor = excluded.valor, fecha = excluded.fecha, archivo_id = excluded.archivo_id,
    nota = excluded.nota, cumplido_por = excluded.cumplido_por, cumplido_en = excluded.cumplido_en,
    validado_por = excluded.validado_por, validado_en = excluded.validado_en, actualizado_en = now(),
    version = crm_cumplimientos.version + 1
  returning * into fila;
  if p_archivo is not null and r.tipo_documento is not null then
    update public.crm_archivos set tipo_documento = r.tipo_documento where id = p_archivo and tipo_documento is null;
  end if;
  return fila;
end $$;

create function public.crm_validar(p_cumplimiento uuid, p_nota text default null)
returns public.crm_cumplimientos
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.crm_cumplimientos;
  r public.crm_requisitos;
begin
  select * into c from public.crm_cumplimientos where id = p_cumplimiento for update;
  if not found or c.estado <> 'cumplido' then
    raise exception 'No hay nada por validar' using errcode = '22023';
  end if;
  select * into r from public.crm_requisitos where id = c.requisito_id;
  if not (public.crm_es_head() or public.crm_puede_operar(public.crm_area_efectiva(r.area_valida))) then
    raise exception 'Este requisito lo valida %', public.crm_nombre_area(r.area_valida) using errcode = '42501';
  end if;
  update public.crm_cumplimientos set estado = 'validado', validado_por = auth.uid(), validado_en = now(),
    nota = coalesce(nullif(btrim(p_nota), ''), nota), actualizado_en = now(), version = version + 1
  where id = p_cumplimiento returning * into c;
  return c;
end $$;

-- Corregir: regresa un requisito a pendiente, con motivo (queda en la bitácora).
create function public.crm_revertir_requisito(p_cumplimiento uuid, p_motivo text)
returns public.crm_cumplimientos
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  c public.crm_cumplimientos;
  r public.crm_requisitos;
  tipo text;
begin
  if length(btrim(coalesce(p_motivo, ''))) < 10 then
    raise exception 'Escribe el motivo (al menos 10 caracteres)' using errcode = '22023';
  end if;
  select * into c from public.crm_cumplimientos where id = p_cumplimiento for update;
  if not found then raise exception 'No existe' using errcode = 'P0002'; end if;
  select * into r from public.crm_requisitos where id = c.requisito_id;
  tipo := case when c.franquiciatario_id is not null then 'franquiciatario' else 'sucursal' end;
  if not exists (select 1 from public.crm_requisitos_de(tipo, c.card_id) q where q.requisito_id = r.id) then
    raise exception 'Solo se corrigen requisitos de la etapa actual' using errcode = '22023';
  end if;
  if not (public.crm_es_head() or public.crm_puede_operar(r.area_cumple)
    or public.crm_puede_operar(public.crm_area_efectiva(r.area_valida))) then
    raise exception 'Sin permiso para corregir este requisito' using errcode = '42501';
  end if;
  perform set_config('crm.motivo', btrim(p_motivo), true);
  update public.crm_cumplimientos set estado = 'pendiente', validado_por = null, validado_en = null,
    actualizado_en = now(), version = version + 1
  where id = p_cumplimiento returning * into c;
  perform set_config('crm.motivo', '', true);
  return c;
end $$;

-- Liberar candado (D4): solo heads, con motivo; se consume en el siguiente avance.
create function public.crm_liberar_candado(p_tipo text, p_card uuid, p_motivo text)
returns public.crm_liberaciones
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_card record;
  faltan jsonb;
  fila public.crm_liberaciones;
begin
  if not public.crm_es_head() then
    raise exception 'Solo un head (Legal, Ventas o Proyectos) puede liberar un candado' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 15 then
    raise exception 'Escribe el motivo (al menos 15 caracteres)' using errcode = '22023';
  end if;
  select * into v_card from public.crm_bloquear_card(p_tipo, p_card);
  select coalesce(jsonb_agg(jsonb_build_object('clave', q.clave, 'nombre', q.nombre, 'area', q.area_cumple) order by q.orden), '[]')
  into faltan from public.crm_requisitos_de(p_tipo, p_card) q
  where q.de_etapa_actual and q.obligatorio and q.estado not in ('validado', 'no_aplica');
  if faltan = '[]' and coalesce(v_card.territorio, '') <> 'bloqueada' then
    raise exception 'La card no tiene candado en esta etapa' using errcode = '22023';
  end if;
  if v_card.territorio = 'bloqueada' then
    faltan := faltan || jsonb_build_array(jsonb_build_object('clave', 'territorio_bloqueado', 'nombre', 'Territorio bloqueado', 'area', 'ventas'));
  end if;
  insert into public.crm_liberaciones (franquiciatario_id, tienda_id, etapa_id, faltantes, motivo, liberado_por)
  values (case when p_tipo = 'franquiciatario' then p_card end, case when p_tipo = 'sucursal' then p_card end,
    v_card.etapa_id, faltan, btrim(p_motivo), auth.uid())
  on conflict (card_id, etapa_id) where consumida_en is null do nothing
  returning * into fila;
  if fila.id is null then raise exception 'Ya hay un candado liberado en esta etapa' using errcode = '22023'; end if;
  return fila;
end $$;

-- Crea una sucursal (card nueva en la etapa 6) para un franquiciatario formalizado.
create function public.crm_crear_sucursal(p_franquiciatario uuid, p_nombre text, p_ciudad text default null)
returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  f public.crm_franquiciatarios;
  nueva uuid;
begin
  select * into f from public.crm_franquiciatarios where id = p_franquiciatario and archivado_en is null;
  if not found then raise exception 'El franquiciatario no existe' using errcode = 'P0002'; end if;
  if f.formalizado_en is null then
    raise exception 'Primero se cierra la etapa 5 (carta de intención firmada)' using errcode = '22023';
  end if;
  if not (public.crm_es_head() or public.crm_puede_operar('ventas')) then
    raise exception 'Las sucursales las crea Ventas' using errcode = '42501';
  end if;
  perform set_config('crm.avance', 'si', true);
  insert into public.crm_tiendas (nombre, embudo, etapa_id, franquiciatario_id, franquiciatario, ciudad, responsable_id, muestra,
    creado_por, actualizado_por)
  values (coalesce(nullif(btrim(p_nombre), ''), f.nombre || ' · ' || coalesce(f.ciudad_interes, 'nueva sucursal')), 'general',
    public.crm_etapa('locales'), f.id, f.nombre, coalesce(nullif(btrim(p_ciudad), ''), f.ciudad_interes), f.responsable_id,
    false, auth.uid(), auth.uid())
  returning id into nueva;
  perform set_config('crm.avance', '', true);
  return nueva;
end $$;

-- Avanzar o mover una card de etapa: revisa permisos, orden del proceso, candados y versión.
create function public.crm_avanzar(p_tipo text, p_card uuid, p_destino text, p_version integer,
  p_motivo text default null, p_nombre_sucursal text default null)
returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_card record;
  cur public.crm_etapas;
  dst public.crm_etapas;
  nxt public.crm_etapas;
  despues public.crm_etapas;
  faltan integer;
  lib uuid;
  motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  previa uuid;
  nueva uuid;
  ver integer;
  omitida boolean := false;
begin
  if not coalesce(public.crm_puede_editar(), false) then
    raise exception 'Sin permiso de edición en el CRM' using errcode = '42501';
  end if;
  select * into v_card from public.crm_bloquear_card(p_tipo, p_card);
  if v_card.version <> p_version then
    raise exception 'La card cambió mientras la veías; recarga' using errcode = '40001';
  end if;
  select * into cur from public.crm_etapas where id = v_card.etapa_id;
  select * into dst from public.crm_etapas where embudo = 'general' and clave = p_destino and activa;
  if dst.id is null then raise exception 'Etapa destino no válida' using errcode = '22023'; end if;
  if dst.id = cur.id then raise exception 'La card ya está en esa etapa' using errcode = '22023'; end if;
  if dst.card is not null and dst.card <> p_tipo then
    raise exception 'Esa etapa no es de una card de %', p_tipo using errcode = '22023';
  end if;
  if not public.crm_puede_mover(cur) then
    raise exception 'Esta etapa la mueve %', coalesce(case cur.funcion when 'aprobacion_locales' then 'Aprobación de locales' end,
      public.crm_nombre_area(cur.area)) using errcode = '42501';
  end if;
  previa := v_card.etapa_previa_id;

  if dst.tipo = 'lateral' then
    if cur.tipo <> 'abierta' then raise exception 'Solo una card en proceso pasa a Standby' using errcode = '22023'; end if;
    if motivo is null then raise exception 'Escribe el motivo' using errcode = '22023'; end if;
    previa := cur.id;
  elsif dst.tipo = 'perdida' then
    if cur.tipo in ('perdida', 'ganada') then raise exception 'La card ya está cerrada' using errcode = '22023'; end if;
    if motivo is null then raise exception 'Escribe el motivo' using errcode = '22023'; end if;
    if p_tipo = 'franquiciatario' and exists (select 1 from public.crm_tiendas t join public.crm_etapas e on e.id = t.etapa_id
      where t.franquiciatario_id = p_card and t.archivado_en is null and e.tipo in ('abierta', 'lateral')) then
      raise exception 'Tiene sucursales en proceso; un head puede cancelarlas en cascada' using errcode = '22023';
    end if;
    previa := null;
  elsif cur.tipo = 'lateral' then
    if dst.id is distinct from v_card.etapa_previa_id then
      raise exception 'De Standby regresa a la etapa donde estaba' using errcode = '22023';
    end if;
    previa := null;
  elsif cur.tipo <> 'abierta' then
    raise exception 'La card ya está cerrada' using errcode = '22023';
  elsif dst.orden < cur.orden then
    if dst.tipo <> 'abierta' then raise exception 'Etapa destino no válida' using errcode = '22023'; end if;
    if motivo is null then raise exception 'Para regresar de etapa escribe el motivo' using errcode = '22023'; end if;
  else
    select * into nxt from public.crm_etapas where embudo = 'general' and activa and card = p_tipo
      and tipo in ('abierta', 'ganada') and orden > cur.orden order by orden limit 1;
    if dst.id = nxt.id then
      null;
    elsif nxt.opcional then
      select * into despues from public.crm_etapas where embudo = 'general' and activa and card = p_tipo
        and tipo in ('abierta', 'ganada') and orden > nxt.orden order by orden limit 1;
      if dst.id is distinct from despues.id then
        raise exception 'Solo puede avanzar a la siguiente etapa' using errcode = '22023';
      end if;
      if motivo is null then raise exception 'Para omitir «%» escribe por qué no aplica', nxt.nombre using errcode = '22023'; end if;
      omitida := true;
    elsif cur.provisional and dst.provisional then
      null;
    elsif cur.provisional and dst.clave = 'cof' then
      null;
    else
      raise exception 'Solo puede avanzar a la siguiente etapa' using errcode = '22023';
    end if;
    -- Candado de salida de la etapa actual.
    select count(*) into faltan from public.crm_requisitos_de(p_tipo, p_card) q
    where q.de_etapa_actual and q.obligatorio and q.estado not in ('validado', 'no_aplica');
    if v_card.territorio = 'bloqueada' then faltan := faltan + 1; end if;
    if faltan > 0 then
      update public.crm_liberaciones set consumida_en = now()
      where card_id = p_card and etapa_id = cur.id and consumida_en is null returning id into lib;
      if lib is null then
        raise exception 'Bloqueada: faltan % requisito(s) de «%»', faltan, cur.nombre using errcode = '23514';
      end if;
    end if;
  end if;

  perform set_config('crm.avance', 'si', true);
  perform set_config('crm.motivo', coalesce(motivo, ''), true);
  if omitida then
    insert into public.crm_cumplimientos (requisito_id, franquiciatario_id, tienda_id, estado, nota, cumplido_por, cumplido_en)
    select r.id, case when p_tipo = 'franquiciatario' then p_card end, case when p_tipo = 'sucursal' then p_card end,
      'no_aplica', 'Etapa omitida: ' || motivo, auth.uid(), now()
    from public.crm_requisitos r where r.etapa_id = nxt.id and r.activo
    on conflict (requisito_id, card_id) do nothing;
  end if;
  if p_tipo = 'franquiciatario' then
    update public.crm_franquiciatarios set etapa_id = dst.id, etapa_previa_id = previa,
      formalizado_en = case when dst.clave = 'formalizado' then now() else formalizado_en end
    where id = p_card returning version into ver;
    if dst.clave = 'formalizado' then
      nueva := public.crm_crear_sucursal(p_card, p_nombre_sucursal);
    end if;
  else
    update public.crm_tiendas set etapa_id = dst.id, etapa_previa_id = previa where id = p_card returning version into ver;
  end if;
  perform set_config('crm.avance', '', true);
  perform set_config('crm.motivo', '', true);
  return jsonb_build_object('etapa', dst.clave, 'version', ver, 'sucursal_id', nueva, 'liberacion', lib, 'omitida', omitida);
end $$;

-- Cancelación en cascada (head): franquiciatario Descartado y sus sucursales en proceso Canceladas.
create function public.crm_cancelar_cascada(p_franquiciatario uuid, p_motivo text) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n integer;
begin
  if not public.crm_es_head() then raise exception 'Solo un head puede cancelar en cascada' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_motivo, ''))) < 15 then
    raise exception 'Escribe el motivo (al menos 15 caracteres)' using errcode = '22023';
  end if;
  perform set_config('crm.avance', 'si', true);
  perform set_config('crm.motivo', btrim(p_motivo), true);
  update public.crm_tiendas t set etapa_id = public.crm_etapa('cancelada'), etapa_previa_id = null
  from public.crm_etapas e
  where e.id = t.etapa_id and t.franquiciatario_id = p_franquiciatario and t.archivado_en is null
    and e.tipo in ('abierta', 'lateral');
  get diagnostics n = row_count;
  update public.crm_franquiciatarios set etapa_id = public.crm_etapa('descartada'), etapa_previa_id = null
  where id = p_franquiciatario and archivado_en is null;
  perform set_config('crm.avance', '', true);
  perform set_config('crm.motivo', '', true);
  return n;
end $$;

revoke all on function public.crm_requisitos_de(text, uuid, boolean), public.crm_area_efectiva(text),
  public.crm_nombre_area(text), public.crm_bloquear_card(text, uuid), public.crm_puede_mover(public.crm_etapas),
  public.crm_cumplir(text, uuid, uuid, text, date, uuid, text), public.crm_validar(uuid, text),
  public.crm_revertir_requisito(uuid, text), public.crm_liberar_candado(text, uuid, text),
  public.crm_crear_sucursal(uuid, text, text), public.crm_avanzar(text, uuid, text, integer, text, text),
  public.crm_cancelar_cascada(uuid, text), public.crm_etapa(text) from public, anon;
grant execute on function public.crm_requisitos_de(text, uuid, boolean), public.crm_area_efectiva(text),
  public.crm_nombre_area(text), public.crm_cumplir(text, uuid, uuid, text, date, uuid, text), public.crm_validar(uuid, text),
  public.crm_revertir_requisito(uuid, text), public.crm_liberar_candado(text, uuid, text),
  public.crm_crear_sucursal(uuid, text, text), public.crm_avanzar(text, uuid, text, integer, text, text),
  public.crm_cancelar_cascada(uuid, text), public.crm_etapa(text) to authenticated;
-- crm_bloquear_card y crm_puede_mover solo se usan dentro de las funciones anteriores.
revoke all on function public.crm_bloquear_card(text, uuid), public.crm_puede_mover(public.crm_etapas) from authenticated;
