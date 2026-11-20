-- Franquiciatarios · Rutina de turno v2 (PDF «Checklist y Rutina Operativa de Turno v1.0» de Operaciones; plan en
-- docs/franquiciatarios/03-PLAN-RUTINA-Y-CONEXIONES.md).
-- - 4 fases: apertura, durante (la operación), medio (turno) y cierre. 'cambio' sigue válido para la v1.
-- - Tipo de punto: único (una vez por día) o recurrente (rondas: varias veces al día, con frecuencia opcional).
-- - Un punto puede pedir un dato corto (lo que caduca, nivel del cold brew…) o ser un corte de venta (enlaza a la tira).
-- - Firma nueva «visto_bueno» del gerente al cierre; una fase puede no llevar firmas (durante).
-- - Vigencia de un registro: un renglón vale mientras ningún otro lo corrija (corrige_id). Así funciona igual para un
--   punto único (cada cambio corrige al anterior) y para una ronda (cada ronda es un renglón propio).
-- La v1 (Excel) y sus registros se conservan: la v1 deja de ser vigente y los checklists ya empezados siguen con ella.

-- 1. Fases y firmas.
alter table public.franq_plantilla_secciones drop constraint franq_plantilla_secciones_clave_check;
alter table public.franq_plantilla_secciones add constraint franq_plantilla_secciones_clave_check
  check (clave in ('apertura', 'durante', 'cambio', 'medio', 'cierre'));
alter table public.franq_plantilla_secciones drop constraint franq_plantilla_secciones_firmas_check;
alter table public.franq_plantilla_secciones add constraint franq_plantilla_secciones_firmas_check
  check (firmas <@ array['responsable', 'entrega', 'recibe', 'visto_bueno']);
alter table public.franq_checklists drop constraint franq_checklists_seccion_check;
alter table public.franq_checklists add constraint franq_checklists_seccion_check
  check (seccion in ('apertura', 'durante', 'cambio', 'medio', 'cierre'));
alter table public.franq_firmas drop constraint franq_firmas_tipo_check;
alter table public.franq_firmas add constraint franq_firmas_tipo_check
  check (tipo in ('responsable', 'entrega', 'recibe', 'visto_bueno'));

-- 2. Puntos: tipo, frecuencia, dato y corte. Las columnas nuevas no cambian los puntos v1 (único, sin dato).
alter table public.franq_plantilla_puntos
  add column tipo text not null default 'unico' check (tipo in ('unico', 'recurrente')),
  add column cada_min integer check (cada_min between 15 and 720),
  add column margen_min integer check (margen_min between 0 and 240),
  add column dato text check (dato is null or char_length(dato) between 3 and 80),
  add column corte text check (corte in ('parcial', 'dia')),
  add constraint franq_puntos_frecuencia check (
    (cada_min is null and margen_min is null) or (tipo = 'recurrente' and cada_min is not null and margen_min is not null));

-- 3. Respuestas: el dato capturado. Un registro se corrige una sola vez: si dos dispositivos corrigen el mismo a la
--    vez, el segundo choca (23505) en lugar de dejar dos registros vigentes.
alter table public.franq_respuestas
  add column dato text check (dato is null or char_length(dato) <= 200);
drop index public.franq_respuestas_corrige;
create unique index franq_respuestas_corrige on public.franq_respuestas (corrige_id) where corrige_id is not null;

-- 4. Responder: ronda (recurrente) = renglón nuevo; punto único = corrige al vigente. El dato es obligatorio en un «Sí»
--    cuando el punto lo pide. La hora la pone el servidor.
drop function public.franq_responder(integer, text, bigint, boolean, text, bigint, text, text);
create function public.franq_responder(p_company integer, p_seccion text, p_punto bigint, p_cumple boolean,
                                       p_observacion text, p_barista bigint, p_dispositivo text,
                                       p_motivo text default null, p_dato text default null) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  q record; v_checklist bigint; v_previa public.franq_respuestas; v_firmada boolean; v_id bigint;
  v_punto public.franq_plantilla_puntos;
  v_obs text := nullif(btrim(coalesce(p_observacion, '')), '');
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_dato text := nullif(btrim(coalesce(p_dato, '')), '');
begin
  select * into q from public.franq_quien(p_company, p_barista);
  if p_cumple is null then raise exception 'Marca Sí o No.'; end if;
  if not p_cumple and char_length(coalesce(v_obs, '')) < 3 then
    raise exception 'Todo «No» se explica en Observaciones.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_dato, '')) > 200 then
    raise exception 'El dato es demasiado largo (máximo 200 caracteres).' using errcode = 'P0001';
  end if;
  v_checklist := public.franq_checklist_hoy(p_company, p_seccion);
  select pt.* into v_punto from public.franq_plantilla_puntos pt
  join public.franq_checklists c on c.seccion_id = pt.seccion_id
  where c.id = v_checklist and pt.id = p_punto;
  if v_punto.id is null then
    raise exception 'El punto no pertenece a esta sección.';
  end if;
  if p_cumple and v_punto.dato is not null and v_dato is null then
    raise exception 'Anota %.', lower(v_punto.dato) using errcode = 'P0001';
  end if;

  if v_punto.tipo = 'recurrente' then
    -- Cada ronda es un registro propio; no corrige a la anterior y no depende de las firmas.
    insert into public.franq_respuestas (checklist_id, company_id, punto_id, cumple, observacion, dato, barista_id,
                                         nombre, registrado_por, sesion, dispositivo)
    values (v_checklist, p_company, p_punto, p_cumple, v_obs, v_dato, q.o_barista, q.o_nombre, auth.uid(),
            auth.jwt()->>'session_id', left(p_dispositivo, 300))
    returning id into v_id;
    return v_id;
  end if;

  select * into v_previa from public.franq_respuestas r
  where r.checklist_id = v_checklist and r.punto_id = p_punto
    and not exists (select 1 from public.franq_respuestas x where x.corrige_id = r.id)
  order by r.id desc limit 1;
  if v_previa.id is not null and v_previa.cumple = p_cumple
     and v_previa.observacion is not distinct from v_obs and v_previa.dato is not distinct from v_dato then
    return v_previa.id; -- sin cambios: no duplica el renglón
  end if;
  v_firmada := exists (select 1 from public.franq_firmas where checklist_id = v_checklist);
  if v_firmada then
    if q.o_rol = 'barista' then
      raise exception 'La sección ya está firmada; pide al gerente que registre la corrección.' using errcode = 'P0001';
    end if;
    if char_length(coalesce(v_motivo, '')) < 3 then
      raise exception 'Escribe el motivo de la corrección.' using errcode = 'P0001';
    end if;
  end if;
  insert into public.franq_respuestas (checklist_id, company_id, punto_id, cumple, observacion, dato, barista_id,
                                       nombre, registrado_por, sesion, dispositivo, corrige_id, motivo)
  values (v_checklist, p_company, p_punto, p_cumple, v_obs, v_dato, q.o_barista, q.o_nombre, auth.uid(),
          auth.jwt()->>'session_id', left(p_dispositivo, 300), v_previa.id, v_motivo)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.franq_responder(integer, text, bigint, boolean, text, bigint, text, text, text)
  from public, anon;
grant execute on function public.franq_responder(integer, text, bigint, boolean, text, bigint, text, text, text)
  to authenticated;

-- 5. Corregir (gerente, franquiciatario o admin; con motivo): solo un registro vigente (que nadie haya corregido).
--    Sirve igual para una ronda que para un punto único. Sin p_dato se conserva el dato anterior.
drop function public.franq_corregir(bigint, boolean, text, text, text);
create function public.franq_corregir(p_respuesta bigint, p_cumple boolean, p_observacion text, p_motivo text,
                                      p_dispositivo text, p_dato text default null) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_previa public.franq_respuestas; v_id bigint; q record;
  v_obs text := nullif(btrim(coalesce(p_observacion, '')), '');
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_dato text := nullif(btrim(coalesce(p_dato, '')), '');
begin
  select * into v_previa from public.franq_respuestas where id = p_respuesta;
  if v_previa.id is null or not public.franq_es_gestor(v_previa.company_id) then
    raise exception 'Solo el gerente o el franquiciatario corrigen registros.' using errcode = '42501';
  end if;
  if exists (select 1 from public.franq_respuestas where corrige_id = v_previa.id) then
    raise exception 'Ese registro ya tiene una corrección; corrige el más reciente.' using errcode = 'P0001';
  end if;
  if p_cumple is null or (not p_cumple and char_length(coalesce(v_obs, '')) < 3) then
    raise exception 'Todo «No» se explica en Observaciones.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_motivo, '')) < 3 then
    raise exception 'Escribe el motivo de la corrección.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_dato, '')) > 200 then
    raise exception 'El dato es demasiado largo (máximo 200 caracteres).' using errcode = 'P0001';
  end if;
  select * into q from public.franq_quien(v_previa.company_id, null);
  insert into public.franq_respuestas (checklist_id, company_id, punto_id, cumple, observacion, dato, barista_id,
                                       nombre, registrado_por, sesion, dispositivo, corrige_id, motivo)
  values (v_previa.checklist_id, v_previa.company_id, v_previa.punto_id, p_cumple, v_obs,
          coalesce(v_dato, v_previa.dato), null, q.o_nombre, auth.uid(), auth.jwt()->>'session_id',
          left(p_dispositivo, 300), v_previa.id, v_motivo)
  returning id into v_id;
  return v_id;
end $$;
revoke all on function public.franq_corregir(bigint, boolean, text, text, text, text) from public, anon;
grant execute on function public.franq_corregir(bigint, boolean, text, text, text, text) to authenticated;

-- 6. Firmar: faltantes = puntos ÚNICOS sin respuesta (las rondas no bloquean). «Visto bueno» solo lo da un gestor y
--    después de la firma del responsable.
create or replace function public.franq_firmar(p_company integer, p_seccion text, p_tipo text, p_barista bigint,
                                               p_dispositivo text) returns bigint
language plpgsql security definer set search_path = public, pg_temp as $$
declare q record; v_checklist bigint; v_firmas text[]; v_faltan integer; v_entrega public.franq_firmas; v_id bigint;
begin
  select * into q from public.franq_quien(p_company, p_barista);
  v_checklist := public.franq_checklist_hoy(p_company, p_seccion);
  select s.firmas into v_firmas from public.franq_checklists c join public.franq_plantilla_secciones s on s.id = c.seccion_id
  where c.id = v_checklist;
  if not (p_tipo = any (v_firmas)) then
    raise exception 'Esta sección no lleva la firma «%».', p_tipo;
  end if;
  if p_tipo = 'visto_bueno' then
    if q.o_rol = 'barista' then
      raise exception 'El visto bueno lo da el gerente o el franquiciatario.' using errcode = '42501';
    end if;
    if not exists (select 1 from public.franq_firmas where checklist_id = v_checklist and tipo = 'responsable') then
      raise exception 'Primero firma el responsable del cierre.' using errcode = 'P0001';
    end if;
  else
    select count(*) into v_faltan from public.franq_plantilla_puntos pt
    join public.franq_checklists c on c.seccion_id = pt.seccion_id
    where c.id = v_checklist and pt.tipo = 'unico'
      and not exists (select 1 from public.franq_respuestas r where r.checklist_id = c.id and r.punto_id = pt.id);
    if v_faltan > 0 then
      raise exception 'Faltan % puntos por responder antes de firmar.', v_faltan using errcode = 'P0001';
    end if;
  end if;
  if p_tipo = 'recibe' then
    select * into v_entrega from public.franq_firmas where checklist_id = v_checklist and tipo = 'entrega';
    if v_entrega.id is null then
      raise exception 'Primero firma quien entrega el turno.' using errcode = 'P0001';
    end if;
    if lower(v_entrega.nombre) = lower(q.o_nombre) then
      raise exception 'Recibe el turno una persona distinta de quien lo entrega.' using errcode = 'P0001';
    end if;
  end if;
  if exists (select 1 from public.franq_firmas where checklist_id = v_checklist and tipo = p_tipo) then
    raise exception 'Esta firma ya está registrada.' using errcode = 'P0001';
  end if;
  insert into public.franq_firmas (checklist_id, company_id, tipo, barista_id, nombre, registrado_por, sesion,
                                   dispositivo)
  values (v_checklist, p_company, p_tipo, q.o_barista, q.o_nombre, auth.uid(), auth.jwt()->>'session_id',
          left(p_dispositivo, 300))
  returning id into v_id;
  return v_id;
end $$;

-- 7. Avisos: todos los «No» vigentes (también los de cada ronda) e incidencias. Mismo contrato que en la migración 75.
create or replace function public.franq_avisos(p_company integer, p_desde date, p_hasta date)
returns table (tipo text, dia date, seccion text, punto text, estandar text, observacion text, nombre text,
               registrado_en timestamptz, respuesta_id bigint)
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.franq_es_gestor(p_company) then
    raise exception 'Solo el gerente o el franquiciatario ven los avisos.' using errcode = '42501';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 62 then
    raise exception 'Periodo inválido (máximo 62 días).' using errcode = 'P0001';
  end if;
  return query
    select 'no'::text, c.dia, c.seccion, pt.actividad, pt.estandar, r.observacion, r.nombre, r.registrado_en, r.id
    from public.franq_checklists c
    join public.franq_respuestas r on r.checklist_id = c.id
    join public.franq_plantilla_puntos pt on pt.id = r.punto_id
    where c.company_id = p_company and c.dia between p_desde and p_hasta and not r.cumple
      and not exists (select 1 from public.franq_respuestas x where x.corrige_id = r.id)
    union all
    select 'incidencia', i.dia, null, null, null, i.texto, i.nombre, i.registrado_en, null
    from public.franq_incidencias i
    where i.company_id = p_company and i.dia between p_desde and p_hasta
    order by 2 desc, 8 desc;
end $$;

-- 8. Plantilla general v2 (PDF de Operaciones, noviembre 2026). La v1 deja de ser vigente; sus registros se conservan.
do $$
declare v_plantilla bigint; v_seccion bigint;
begin
  update public.franq_plantillas set vigente = false where clave = 'turno' and company_id is null and version = 1;
  insert into public.franq_plantillas (clave, company_id, version) values ('turno', null, 2) returning id into v_plantilla;

  insert into public.franq_plantilla_secciones (plantilla_id, clave, nombre, orden, firmas)
  values (v_plantilla, 'apertura', 'Apertura', 1, array['responsable']) returning id into v_seccion;
  insert into public.franq_plantilla_puntos (seccion_id, orden, actividad, estandar, dato) values
    (v_seccion, 1, 'Encender equipos', 'Maquinaria · espresso y periféricos: encendido y calibración térmica', null),
    (v_seccion, 2, 'Revisar etiquetas y caducidades', 'Inocuidad · control de insumos: fechas de vencimiento revisadas',
     'Qué caduca hoy o mañana (o «nada»)'),
    (v_seccion, 3, 'Hacer PEPS', 'Inventario · almacenamiento: rotación de leche, granos y jarabes', null),
    (v_seccion, 4, 'Colocar sanitizantes', 'Higiene · estaciones de trabajo: soluciones desinfectantes preparadas', null),
    (v_seccion, 5, 'Verificar limpieza de tienda', 'Imagen · salón y barra: superficies e insumos limpios', null),
    (v_seccion, 6, 'Revisar existencias y actualizar tabletas',
     'Digital · stock y POS: conteo rápido y sincronización en App/POS', null),
    (v_seccion, 7, 'Realizar conteos y llenar bitácoras', 'Inventario · registro: insumos críticos capturados',
     'Insumos críticos contados'),
    (v_seccion, 8, 'Encender música', 'Ambiente · experiencia de cliente: playlist y volumen oficial', null);

  insert into public.franq_plantilla_secciones (plantilla_id, clave, nombre, orden, firmas)
  values (v_plantilla, 'durante', 'Durante la operación', 2, array[]::text[]) returning id into v_seccion;
  insert into public.franq_plantilla_puntos (seccion_id, orden, actividad, estandar, tipo, cada_min, margen_min, dato)
  values
    (v_seccion, 1, 'Reabastecer barra', 'Logística · insumos de barra: desechables, leches y café; según demanda',
     'recurrente', null, null, null),
    (v_seccion, 2, 'Hacer previas', 'Preparación · mise en place: jarabes, toppings y bases; según consumo',
     'recurrente', null, null, null),
    (v_seccion, 3, 'Hacer preparados', 'Producción · recetas base: mezclas estándar de la casa; por lote o demanda',
     'recurrente', null, null, 'Qué se preparó'),
    (v_seccion, 4, 'Revisar cold brew', 'Calidad · bebidas frías: tiempo de extracción y nivel; cada 2 a 4 horas',
     'recurrente', 120, 120, 'Inicio de extracción y nivel'),
    (v_seccion, 5, 'Cambiar sanitizantes', 'Higiene · inocuidad: reemplazo total de la solución; cada 2 horas',
     'recurrente', 120, 15, null),
    (v_seccion, 6, 'Revisar baños', 'Servicio · experiencia de cliente: limpieza, papel y jabón; cada hora',
     'recurrente', 60, 15, null);

  insert into public.franq_plantilla_secciones (plantilla_id, clave, nombre, orden, firmas)
  values (v_plantilla, 'medio', 'Medio turno', 3, array['entrega', 'recibe']) returning id into v_seccion;
  insert into public.franq_plantilla_puntos (seccion_id, orden, actividad, estandar, dato, corte) values
    (v_seccion, 1, 'Limpieza de tienda', 'Mantenimiento · salón y barra: sanitización rápida de mesas y barra', null,
     null),
    (v_seccion, 2, 'Reabastecer barra', 'Logística · insumos: reabastecimiento general para el turno vespertino', null,
     null),
    (v_seccion, 3, 'Enviar corte de medio día', 'Administración · ventas: reporte de caja/POS generado y enviado', null,
     'parcial'),
    (v_seccion, 4, 'Revisar y cambiar bolsas de basura', 'Higiene · residuos: botes vaciados y bolsas reemplazadas',
     null, null),
    (v_seccion, 5, 'Lavar loza', 'Sanidad · utensilios: loza acumulada lavada y desinfectada', null, null),
    (v_seccion, 6, 'Conteos', 'Inventario · control parcial: existencias de alto valor y rotación auditadas',
     'Insumos contados', null),
    (v_seccion, 7, 'Revisar baños', 'Servicio · mantenimiento: inspección profunda y limpieza', null, null);

  insert into public.franq_plantilla_secciones (plantilla_id, clave, nombre, orden, firmas)
  values (v_plantilla, 'cierre', 'Fin de turno', 4, array['responsable', 'visto_bueno']) returning id into v_seccion;
  insert into public.franq_plantilla_puntos (seccion_id, orden, actividad, estandar, corte) values
    (v_seccion, 1, 'Limpieza de equipos', 'Mantenimiento · maquinaria: purga, backflush de espresso y molinos', null),
    (v_seccion, 2, 'Lavar loza', 'Sanidad · utensilios: lavado total y secado de loza y jarras', null),
    (v_seccion, 3, 'Limpieza de áreas de preparación', 'Sanitización · superficies: barras y tarjas a fondo', null),
    (v_seccion, 4, 'Limpieza de tienda', 'Mantenimiento · general: pisos barridos y trapeados, salón barrido', null),
    (v_seccion, 5, 'Apagar música', 'Operaciones · cierre: sistema de audio desconectado', null),
    (v_seccion, 6, 'Apagar equipos', 'Mantenimiento · ahorro de energía: maquinaria desconectada', null),
    (v_seccion, 7, 'Enviar corte del día', 'Administración · conciliación: cierre de caja y métricas enviados', 'dia'),
    (v_seccion, 8, 'Revisar baños', 'Higiene · entrega de instalaciones: limpieza profunda y desinfección final', null),
    (v_seccion, 9, 'Apagar luces y guardar mobiliario', 'Seguridad · resguardo: terraza, mobiliario y luces', null),
    (v_seccion, 10, 'Sacar basura y cambiar bolsas', 'Residuos · sanidad: depósito final en contenedor externo', null),
    (v_seccion, 11, 'Cerrar', 'Seguridad · protocolo de entrega: accesos asegurados y alarma activada', null);
end $$;
