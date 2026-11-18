-- CRM: flujo completo del documento «Desarrollo de CRM Unificado» (versión de 10 páginas) y Checkpoint C (doc 41).
-- 1) Proyectos deja de ser provisional: 7 subpasos con entregable obligatorio (26.1–26.7) y «Tienda en operación» (26.8).
-- 2) COF y contrato pasan a un carril Legal paralelo: no son columnas; la apertura exige los dos carriles completos.
-- 3) Finanzas se activa: registra y valida el apartado y la liquidación, y emite la factura.
-- 4) Avisos: 120 días vencidos a Legal, Proyectos y Finanzas (multa); transferencia a Proyectos.
-- 5) Datos fiscales y del obligado solidario, y sus documentos, solo para Ventas, Legal, Finanzas y Dirección.

-- Los cambios de configuración de esta migración quedan en la bitácora como «Sistema», no como de un usuario
-- (la reversión de la importación y de la muestra cuenta los eventos con origen 'crm').
select set_config('app.origen', 'sistema', false);

-- ── 1. Etapas ───────────────────────────────────────────────────────────────────────────────────────────────
alter table public.crm_etapas
  -- Número del subpaso de Proyectos en el documento (26.1 … 26.8).
  add column paso text,
  -- Etapas que no son columna: se registran en paralelo dentro de la sucursal.
  add column carril text check (carril in ('legal'));

-- Las provisionales se conservan inactivas (la muestra guarda su etapa de origen y la bitácora las nombra).
update public.crm_etapas set activa = false
where embudo = 'general' and provisional;

insert into public.crm_etapas (embudo, clave, numero, paso, nombre, orden, tipo, area, card) values
  ('general', 'levantamiento', null, '26.1', 'Levantamiento arquitectónico', 10, 'abierta', 'proyectos', 'sucursal'),
  ('general', 'boceto', null, '26.2', 'Elaboración de boceto', 11, 'abierta', 'proyectos', 'sucursal'),
  ('general', 'envio_brasil', null, '26.3', 'Envío a Brasil', 12, 'abierta', 'proyectos', 'sucursal'),
  ('general', 'proyecto_3d', null, '26.4', 'Recepción del proyecto 3D', 13, 'abierta', 'proyectos', 'sucursal'),
  ('general', 'proyecto_ejecutivo', null, '26.5', 'Elaboración del proyecto ejecutivo', 14, 'abierta', 'proyectos', 'sucursal'),
  ('general', 'obra', null, '26.6', 'Obra', 15, 'abierta', 'proyectos', 'sucursal'),
  ('general', 'capacitacion', null, '26.7', 'Capacitación y evidencia de apertura', 16, 'abierta', 'proyectos', 'sucursal');

update public.crm_etapas set orden = 17, carril = 'legal' where embudo = 'general' and clave = 'cof';
update public.crm_etapas set orden = 18, carril = 'legal' where embudo = 'general' and clave = 'contrato';
update public.crm_etapas set orden = 19, paso = '26.8', nombre = 'Tienda en operación', area = 'proyectos'
where embudo = 'general' and clave = 'operando';
update public.crm_etapas e set orden = v.orden
from (values ('standby', 20), ('descartada', 21), ('cancelada', 22), ('cerrada', 23)) as v(clave, orden)
where e.embudo = 'general' and e.clave = v.clave;
update public.crm_etapas set orden = 30 + orden where embudo = 'general' and provisional;

-- ── 2. Requisitos ───────────────────────────────────────────────────────────────────────────────────────────
-- Proyectos carga cada entregable y lo valida (cumple = valida: al registrarlo un integrante de Proyectos, queda validado).
insert into public.crm_requisitos
  (clave, etapa_id, orden, nombre, tipo, area_cumple, area_valida, obligatorio, campo, tipo_documento, depende_de, ayuda)
select r.clave, public.crm_etapa(r.etapa), r.orden, r.nombre, r.tipo, 'proyectos', 'proyectos', true, r.campo, r.documento,
  r.depende, r.ayuda
from (values
  ('levantamiento_doc', 'levantamiento', 1, 'Documentación del levantamiento arquitectónico', 'documento', null, 'levantamiento', '{}'::text[],
    'La envía el franquiciatario. Revisa que esté completa y alcance para el boceto; si falta algo, la sucursal se queda aquí.'),
  ('boceto_doc', 'boceto', 1, 'Boceto de distribución', 'documento', null, 'boceto', '{}',
    'El archivo que se enviará a Brasil, hecho con base en el levantamiento.'),
  ('brasil_fecha', 'envio_brasil', 1, 'Fecha de envío a Brasil', 'fecha', null, null, '{}',
    'Día en que se envió el boceto y la información para el proyecto 3D.'),
  ('brasil_evidencia', 'envio_brasil', 2, 'Evidencia del envío a Brasil', 'documento', null, 'evidencia_brasil', '{}',
    'Captura o correo que permita identificar la sucursal y la fecha.'),
  ('proyecto_3d_doc', 'proyecto_3d', 1, 'Archivos del proyecto 3D', 'documento', null, 'proyecto_3d', '{}',
    'El proyecto 3D que entregó Brasil.'),
  ('ejecutivo_doc', 'proyecto_ejecutivo', 1, 'Paquete final del proyecto ejecutivo', 'documento', null, 'proyecto_ejecutivo', '{}',
    'Elaborado y revisado a partir del proyecto 3D. Sin él no empieza la obra.'),
  ('obra_fotos', 'obra', 1, 'Fotografías de terminación de obra', 'documento', null, 'fotos_obra', '{}',
    'La obra la hace el franquiciatario; Proyectos da seguimiento y valida el cierre.'),
  ('capacitador_viaticos', 'capacitacion', 1, 'Viáticos y hospedaje del capacitador', 'documento', null, 'viaticos_capacitador', '{}',
    'Capturas o comprobantes de la logística de la capacitación.'),
  ('apertura_evidencia', 'capacitacion', 2, 'Video o fotografías de la apertura', 'documento', null, 'evidencia_apertura', '{}',
    'Evidencia de la apertura de la sucursal.'),
  ('apertura_real', 'capacitacion', 3, 'Fecha real de apertura', 'dato', 'fecha_apertura', null, '{}',
    'Se registra al abrir. La apertura exige además el carril Legal completo (COF, contrato y liberación).')
) as r(clave, etapa, orden, nombre, tipo, campo, documento, depende, ayuda);

-- Carril Legal: todos sus requisitos se registran mientras la sucursal está de la etapa 8 en adelante.
update public.crm_requisitos set anticipable = true
where etapa_id in (public.crm_etapa('cof'), public.crm_etapa('contrato'));

-- Finanzas registra y valida sus pagos (ya no lo cubre Ventas, P1).
update public.crm_areas set activa = true where clave = 'finanzas';
update public.crm_requisitos set area_cumple = 'finanzas',
  ayuda = 'Finanzas confirma que recibió el apartado. Legal no envía el contrato sin esta validación.'
where clave = 'apartado_validado';
update public.crm_requisitos set area_cumple = 'finanzas',
  ayuda = 'Finanzas confirma la liquidación. Con ella, el prospecto pasa a ser franquiciatario.'
where clave = 'pago_validado';
insert into public.crm_requisitos
  (clave, etapa_id, orden, nombre, tipo, area_cumple, area_valida, obligatorio, tipo_documento, depende_de, ayuda)
values ('factura_emitida', public.crm_etapa('bienvenida'), 5, 'Factura emitida', 'documento', 'finanzas', 'finanzas', false,
  'factura', '{factura_csf}', 'Finanzas la emite en el hilo de bienvenida. No bloquea el avance.');

-- Etapa 8: el alta en Jestor es obligatoria (doc completo, punto 26).
update public.crm_requisitos set obligatorio = true,
  ayuda = 'Expansión / Aprobación de Locales da de alta la sucursal en Jestor y genera su ID oficial.'
where clave = 'jestor';
-- Etapa 4: el PLD se valida contra la forma (decisión del Checkpoint C).
update public.crm_requisitos set
  ayuda = 'Valida que venga a puño y letra y firmado con pluma azul. El original se envía al corporativo. Sin PLD no se acepta el pago.'
where clave = 'pld_digital';

-- ── 3. Mover las sucursales de las provisionales a los subpasos ───────────────────────────────────────────────
-- Sin usuario (migración): la bitácora lo registra como «Sistema» con el motivo.
do $$
begin
  perform set_config('crm.avance', 'si', true);
  perform set_config('crm.motivo', 'Migración 50: Proyectos pasa a los subpasos 26.1–26.8 del documento completo', true);
  update public.crm_tiendas t set etapa_id = public.crm_etapa(m.destino)
  from (values ('p_arquitecta', 'levantamiento'), ('p_3d', 'proyecto_3d'), ('p_ejecutivo', 'proyecto_ejecutivo'),
    ('p_remodelacion', 'obra'), ('p_entrega', 'obra'), ('p_capacitacion', 'capacitacion'),
    -- COF y contrato ya no son columnas: esas sucursales ya habían pasado por Proyectos.
    ('cof', 'capacitacion'), ('contrato', 'capacitacion')) as m(origen, destino)
  where t.embudo = 'general' and t.etapa_id = public.crm_etapa(m.origen);
  update public.crm_tiendas t set etapa_previa_id = public.crm_etapa(m.destino)
  from (values ('p_arquitecta', 'levantamiento'), ('p_3d', 'proyecto_3d'), ('p_ejecutivo', 'proyecto_ejecutivo'),
    ('p_remodelacion', 'obra'), ('p_entrega', 'obra'), ('p_capacitacion', 'capacitacion'),
    ('cof', 'capacitacion'), ('contrato', 'capacitacion')) as m(origen, destino)
  where t.embudo = 'general' and t.etapa_previa_id = public.crm_etapa(m.origen);
  perform set_config('crm.avance', '', true);
  perform set_config('crm.motivo', '', true);
end $$;

-- ── 4. Estado de requisitos: carril Legal visible desde la etapa 8 ────────────────────────────────────────────
create or replace function public.crm_requisitos_de(p_tipo text, p_card uuid, p_todas boolean default false)
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
    -- Carril Legal (COF y contrato): de la transferencia (etapa 8) hasta la apertura, en paralelo a Proyectos.
    or (e.carril = 'legal' and a.tipo = 'abierta' and a.carril is null
      and a.orden >= (select x.orden from public.crm_etapas x where x.embudo = 'general' and x.clave = 'transferencia'))
    or (p_todas and e.orden < a.orden)
$$;

-- Candado de la etapa actual y avance del carril Legal (columnas nuevas al final).
create or replace view public.crm_v_candados with (security_invoker = true) as
select c.tipo_card, c.card_id, c.etapa_id,
  count(*) filter (where q.de_etapa_actual and q.obligatorio)::int as total,
  count(*) filter (where q.de_etapa_actual and q.obligatorio and q.estado in ('validado', 'no_aplica'))::int as listos,
  (array_agg(q.nombre order by q.orden) filter (where q.de_etapa_actual and q.obligatorio
    and q.estado not in ('validado', 'no_aplica')))[1] as faltante,
  (array_agg(q.area_cumple order by q.orden) filter (where q.de_etapa_actual and q.obligatorio
    and q.estado not in ('validado', 'no_aplica')))[1] as faltante_area,
  exists (select 1 from public.crm_liberaciones l
    where l.card_id = c.card_id and l.etapa_id = c.etapa_id and l.consumida_en is null) as liberado,
  count(*) filter (where q.carril = 'legal' and q.obligatorio)::int as carril_total,
  count(*) filter (where q.carril = 'legal' and q.obligatorio and q.estado in ('validado', 'no_aplica'))::int as carril_listos
from (
  select 'franquiciatario'::text as tipo_card, f.id as card_id, f.etapa_id from public.crm_franquiciatarios f
  where f.archivado_en is null
  union all
  select 'sucursal', t.id, t.etapa_id from public.crm_tiendas t where t.embudo = 'general' and t.archivado_en is null
) c
left join lateral (
  select d.*, e.carril from public.crm_requisitos_de(c.tipo_card, c.card_id) d
  join public.crm_etapas e on e.id = d.etapa_id
) q on true
group by c.tipo_card, c.card_id, c.etapa_id;

-- ── 5. Avanzar: subpasos de Proyectos y carril Legal ────────────────────────────────────────────────────────
create or replace function public.crm_avanzar(p_tipo text, p_card uuid, p_destino text, p_version integer,
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
  faltan_legal integer;
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
  if dst.carril is not null then
    raise exception 'COF y contrato se registran en el carril Legal de la sucursal; no son una etapa' using errcode = '22023';
  end if;
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
    select * into nxt from public.crm_etapas where embudo = 'general' and activa and carril is null and card = p_tipo
      and tipo in ('abierta', 'ganada') and orden > cur.orden order by orden limit 1;
    if dst.id = nxt.id then
      null;
    elsif nxt.opcional then
      select * into despues from public.crm_etapas where embudo = 'general' and activa and carril is null and card = p_tipo
        and tipo in ('abierta', 'ganada') and orden > nxt.orden order by orden limit 1;
      if dst.id is distinct from despues.id then
        raise exception 'Solo puede avanzar a la siguiente etapa' using errcode = '22023';
      end if;
      if motivo is null then raise exception 'Para omitir «%» escribe por qué no aplica', nxt.nombre using errcode = '22023'; end if;
      omitida := true;
    else
      raise exception 'Solo puede avanzar a la siguiente etapa' using errcode = '22023';
    end if;
    -- Candado de salida de la etapa actual.
    select count(*) into faltan from public.crm_requisitos_de(p_tipo, p_card) q
    where q.de_etapa_actual and q.obligatorio and q.estado not in ('validado', 'no_aplica');
    if v_card.territorio = 'bloqueada' then faltan := faltan + 1; end if;
    -- La apertura exige además el carril Legal completo. Ninguna liberación lo cubre: sin contrato firmado
    -- por el franquiciatario y el obligado solidario no abre ninguna sucursal.
    if dst.clave = 'operando' then
      select count(*) into faltan_legal from public.crm_requisitos_de(p_tipo, p_card) q
      join public.crm_etapas e on e.id = q.etapa_id
      where e.carril = 'legal' and q.obligatorio and q.estado not in ('validado', 'no_aplica');
      if faltan_legal > 0 then
        raise exception 'Bloqueada: el carril Legal no está completo (faltan % de COF, contrato o liberación)', faltan_legal
          using errcode = '23514';
      end if;
    end if;
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

-- ── 6. Avisos ───────────────────────────────────────────────────────────────────────────────────────────────
-- Un aviso puede ir a varias áreas (la multa de 120 días va a Legal, Proyectos y Finanzas).
alter table public.crm_avisos drop constraint crm_avisos_tipo_check;
alter table public.crm_avisos add constraint crm_avisos_tipo_check
  check (tipo in ('cof', 'apertura_5_habiles', 'limite_120', 'cof_tardia', 'limite_vencido', 'transferencia'));
alter table public.crm_avisos drop constraint crm_avisos_tipo_tienda_id_fecha_objetivo_key;
alter table public.crm_avisos add constraint crm_avisos_unico unique (tipo, tienda_id, fecha_objetivo, area);

create or replace view public.crm_v_vencimientos with (security_invoker = true) as
with s as (
  select t.id as tienda_id, t.franquiciatario_id, t.nombre, t.fecha_estimada_apertura, t.fecha_confirmada_apertura,
    t.fecha_limite_apertura, e.clave as etapa_clave, e.tipo as etapa_tipo,
    (select q.estado from public.crm_requisitos_de('sucursal', t.id) q where q.clave = 'cof_firmada') as cof_estado,
    (select cu.fecha from public.crm_cumplimientos cu join public.crm_requisitos r on r.id = cu.requisito_id
      where cu.card_id = t.id and r.clave = 'cof_firmada' and cu.estado = 'validado') as cof_fecha,
    (select (cu.validado_en at time zone 'America/Mexico_City')::date from public.crm_cumplimientos cu
      join public.crm_requisitos r on r.id = cu.requisito_id
      where cu.card_id = t.id and r.clave = 'transferencia_habilitada' and cu.estado = 'validado') as transferida
  from public.crm_tiendas t join public.crm_etapas e on e.id = t.etapa_id
  where t.embudo = 'general' and t.archivado_en is null and e.tipo in ('abierta', 'lateral')
)
select tienda_id, franquiciatario_id, nombre, 'cof'::text as tipo, 'legal'::text as area,
  (fecha_estimada_apertura - interval '2 months')::date as fecha,
  (fecha_estimada_apertura - interval '2 months')::date as aviso_desde,
  format('COF de %s: apertura estimada %s; debe firmarse a más tardar el %s', nombre,
    to_char(fecha_estimada_apertura, 'DD/MM/YYYY'), to_char(fecha_estimada_apertura - interval '2 months', 'DD/MM/YYYY')) as mensaje
from s where fecha_estimada_apertura is not null and coalesce(cof_estado, 'pendiente') not in ('validado', 'no_aplica')
union all
select tienda_id, franquiciatario_id, nombre, 'apertura_5_habiles', 'legal',
  public.crm_restar_dias_habiles(fecha_confirmada_apertura, 5),
  public.crm_restar_dias_habiles(fecha_confirmada_apertura, 5),
  format('Apertura confirmada de %s el %s: Legal debe tenerla al menos 5 días hábiles antes (%s)', nombre,
    to_char(fecha_confirmada_apertura, 'DD/MM/YYYY'),
    to_char(public.crm_restar_dias_habiles(fecha_confirmada_apertura, 5), 'DD/MM/YYYY'))
from s where fecha_confirmada_apertura is not null and etapa_clave <> 'operando'
union all
-- Límite de 120 días: 14 días antes, a Proyectos y a Legal.
select tienda_id, franquiciatario_id, nombre, 'limite_120', a.area, fecha_limite_apertura, fecha_limite_apertura - 14,
  format('Fecha límite de apertura de %s: %s', nombre, to_char(fecha_limite_apertura, 'DD/MM/YYYY'))
from s cross join (values ('proyectos'), ('legal')) as a(area)
where fecha_limite_apertura is not null and etapa_clave <> 'operando'
union all
-- Límite vencido sin abrir: multa; a Legal, Proyectos y Finanzas (nota del documento para el CRM).
select tienda_id, franquiciatario_id, nombre, 'limite_vencido', a.area, fecha_limite_apertura + 1, fecha_limite_apertura + 1,
  format('%s no abrió dentro del plazo (límite %s): inicia el cobro de la multa', nombre,
    to_char(fecha_limite_apertura, 'DD/MM/YYYY'))
from s cross join (values ('legal'), ('proyectos'), ('finanzas')) as a(area)
where fecha_limite_apertura is not null and etapa_clave <> 'operando'
union all
-- COF firmada tarde: la apertura mínima legal es la entrega + 2 meses (la UI la sugiere, no la cambia).
select tienda_id, franquiciatario_id, nombre, 'cof_tardia', 'proyectos', (cof_fecha + interval '2 months')::date, cof_fecha,
  format('COF de %s firmada el %s: la apertura no puede ser antes del %s', nombre, to_char(cof_fecha, 'DD/MM/YYYY'),
    to_char(cof_fecha + interval '2 months', 'DD/MM/YYYY'))
from s where cof_fecha is not null and fecha_estimada_apertura is not null
  and fecha_estimada_apertura < (cof_fecha + interval '2 months')::date
union all
-- Transferencia habilitada por Legal: Proyectos recibe el expediente y registra la fecha estimada.
select tienda_id, franquiciatario_id, nombre, 'transferencia', 'proyectos', transferida, transferida,
  format('Legal habilitó la transferencia de %s a Proyectos: recibe el expediente y registra la fecha estimada de apertura', nombre)
from s where transferida is not null and etapa_clave = 'transferencia';

create or replace function public.crm_generar_avisos(p_hoy date default null) returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n integer;
begin
  if auth.uid() is not null and not coalesce(public.crm_puede_leer(), false) then
    raise exception 'Sin acceso al CRM' using errcode = '42501';
  end if;
  perform set_config('app.origen', 'sistema', true);
  insert into public.crm_avisos (tipo, tienda_id, franquiciatario_id, area, fecha_objetivo, mensaje)
  select v.tipo, v.tienda_id, v.franquiciatario_id, v.area, v.fecha, v.mensaje
  from public.crm_v_vencimientos v
  where v.aviso_desde <= coalesce(p_hoy, public.crm_hoy())
  on conflict (tipo, tienda_id, fecha_objetivo, area) do nothing;
  get diagnostics n = row_count;
  perform set_config('app.origen', '', true);
  return n;
end $$;

-- ── 7. Datos sensibles ──────────────────────────────────────────────────────────────────────────────────────
-- Ven datos fiscales, del firmante y del obligado solidario (y sus documentos): Ventas, Legal, Finanzas y Dirección
-- (nivel desarrollador). Proyectos, Aprobación de Locales sin área de Ventas y el Comité no los ven.
create function public.crm_ve_sensibles() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(public.crm_puede_leer(), false) and (
    public.crm_es_desarrollador()
    or exists (select 1 from public.crm_membresias m
      where m.user_id = auth.uid() and m.area in ('ventas', 'legal', 'finanzas')))
$$;
revoke all on function public.crm_ve_sensibles() from public, anon;
grant execute on function public.crm_ve_sensibles() to authenticated;

-- Tipos de documento sensibles (Survey, PLD, CSF, comprobantes y factura).
create function public.crm_documento_sensible(p_tipo text) returns boolean
language sql immutable set search_path = public, pg_temp as $$
  select coalesce(p_tipo in ('survey', 'pld', 'csf', 'comprobante_apartado', 'comprobante_pago', 'factura'), false)
$$;
grant execute on function public.crm_documento_sensible(text) to authenticated;

create table public.crm_franquiciatario_fiscal (
  franquiciatario_id uuid primary key references public.crm_franquiciatarios(id) on delete cascade,
  firmante text,
  obligado_solidario text,
  razon_social text,
  rfc text,
  regimen_fiscal text,
  codigo_postal_fiscal text,
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid,
  version integer not null default 1
);
insert into public.crm_franquiciatario_fiscal (franquiciatario_id, firmante, obligado_solidario, razon_social, rfc,
  regimen_fiscal, codigo_postal_fiscal)
select id, firmante, obligado_solidario, razon_social, rfc, regimen_fiscal, codigo_postal_fiscal
from public.crm_franquiciatarios
where num_nonnulls(firmante, obligado_solidario, razon_social, rfc, regimen_fiscal, codigo_postal_fiscal) > 0;
alter table public.crm_franquiciatarios
  drop column firmante, drop column obligado_solidario, drop column razon_social, drop column rfc,
  drop column regimen_fiscal, drop column codigo_postal_fiscal;

create function public.crm_sellar_fiscal() returns trigger
language plpgsql set search_path = public, pg_temp as $$
begin
  new.actualizado_en := now();
  new.actualizado_por := auth.uid();
  if tg_op = 'UPDATE' then new.version := old.version + 1; end if;
  return new;
end $$;
revoke all on function public.crm_sellar_fiscal() from public, anon, authenticated;
create trigger crm_franquiciatario_fiscal_sellar before insert or update on public.crm_franquiciatario_fiscal
  for each row execute function public.crm_sellar_fiscal();

-- Bitácora sin valores: queda quién cambió qué campo, nunca el RFC ni los nombres.
create function public.crm_historial_fiscal() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  nuevo jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  viejo jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  franq uuid := coalesce(new.franquiciatario_id, old.franquiciatario_id);
  cambios jsonb := '{}';
  k text;
begin
  for k in select jsonb_object_keys(coalesce(nuevo, viejo)) loop
    continue when k in ('franquiciatario_id', 'actualizado_en', 'actualizado_por', 'version');
    -- Al crear o borrar solo cuentan los campos con valor.
    if coalesce(viejo->k, 'null') is distinct from coalesce(nuevo->k, 'null') then
      cambios := cambios || jsonb_build_object(k, jsonb_build_object('cambio', true));
    end if;
  end loop;
  if cambios = '{}' then return null; end if;
  insert into public.crm_historial (entidad, entidad_id, tienda_id, franquiciatario_id, accion, resumen, cambios,
    actor_id, actor_nombre, actor_area, origen, motivo)
  values ('crm_franquiciatario_fiscal', franq, null, franq, case when tg_op = 'DELETE' then 'eliminado' else 'editado' end,
    'Datos fiscales y del obligado solidario: ' || (select string_agg(key, ', ' order by key) from jsonb_object_keys(cambios) key),
    cambios, auth.uid(), coalesce((select nombre from public.perfiles where user_id = auth.uid()), 'Sistema'),
    (select string_agg(m.area, ',' order by m.area) from public.crm_membresias m where m.user_id = auth.uid()),
    case when auth.uid() is null then 'sistema' else 'crm' end, nullif(current_setting('crm.motivo', true), ''));
  return null;
end $$;
revoke all on function public.crm_historial_fiscal() from public, anon, authenticated;
create trigger crm_franquiciatario_fiscal_historial after insert or update or delete on public.crm_franquiciatario_fiscal
  for each row execute function public.crm_historial_fiscal();

alter table public.crm_franquiciatario_fiscal enable row level security;
revoke all on public.crm_franquiciatario_fiscal from anon, authenticated;
grant select, insert, update on public.crm_franquiciatario_fiscal to authenticated;
create policy lectura on public.crm_franquiciatario_fiscal for select to authenticated
  using ((select public.crm_ve_sensibles()));
create policy alta on public.crm_franquiciatario_fiscal for insert to authenticated
  with check ((select public.crm_ve_sensibles()) and (select public.crm_puede_editar()));
create policy cambio on public.crm_franquiciatario_fiscal for update to authenticated
  using ((select public.crm_ve_sensibles()) and (select public.crm_puede_editar()))
  with check ((select public.crm_ve_sensibles()) and (select public.crm_puede_editar()));
create policy crm_sin_oauth on public.crm_franquiciatario_fiscal as restrictive for all to authenticated
  using (((select auth.jwt())->>'client_id') is null) with check (((select auth.jwt())->>'client_id') is null);

-- Documentos sensibles: la fila (y por lo tanto el objeto en Storage) solo la ve quien ve datos sensibles.
create policy sensibles on public.crm_archivos as restrictive for select to authenticated
  using (not public.crm_documento_sensible(tipo_documento) or (select public.crm_ve_sensibles()));

select set_config('app.origen', '', false);
