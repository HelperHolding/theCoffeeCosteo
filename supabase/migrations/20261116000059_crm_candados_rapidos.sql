-- Migración 59: crm_v_candados tardaba 10–13 s con la sesión de un usuario y frenaba el Pipeline.
--
-- La vista llamaba crm_requisitos_de una vez por card (≈3,850). Esa función no se puede fundir con la
-- consulta, así que Postgres la planeaba y ejecutaba 3,850 veces, y en cada una evaluaba la RLS de
-- cinco tablas. Ahora la vista calcula lo mismo en una sola consulta: la RLS se evalúa una vez por
-- tabla y cumplimientos se lee por su índice (card_id).
--
-- Las reglas son las de crm_requisitos_de (migración 50) con p_todas = false:
--   - requisitos activos de las etapas del tipo de card;
--   - los de la etapa actual, más los del carril Legal desde la transferencia, si la card está en una
--     etapa abierta fuera del carril;
--   - estado de los requisitos de campo: si la card tiene el dato; el de 'contacto': si tiene correo
--     o teléfono; los demás: el cumplimiento registrado, o 'pendiente'.
-- crm_requisitos_de y las funciones que la usan (avanzar, cumplir, avisos) no cambian.
-- Columnas, nombres y permisos de la vista se conservan.

create or replace view public.crm_v_candados with (security_invoker = true) as
with c as (
  select 'franquiciatario'::text as tipo_card, f.id as card_id, f.etapa_id, to_jsonb(f) as datos
  from public.crm_franquiciatarios f
  where f.archivado_en is null
  union all
  select 'sucursal', t.id, t.etapa_id, to_jsonb(t)
  from public.crm_tiendas t
  where t.embudo = 'general' and t.archivado_en is null
), transferencia as (
  select x.orden from public.crm_etapas x where x.embudo = 'general' and x.clave = 'transferencia'
)
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
from c
left join public.crm_etapas a on a.id = c.etapa_id
left join lateral (
  select r.nombre, r.orden, r.area_cumple, r.obligatorio, e.carril,
    r.etapa_id = a.id as de_etapa_actual,
    case
      when r.campo = 'contacto' then
        case when coalesce(nullif(c.datos->>'correo', ''), nullif(c.datos->>'telefono', '')) is not null
          then 'validado' else 'pendiente' end
      when r.campo is not null then
        case when nullif(c.datos->>r.campo, '') is not null then 'validado' else 'pendiente' end
      else coalesce(cu.estado, 'pendiente')
    end as estado
  from public.crm_requisitos r
  join public.crm_etapas e on e.id = r.etapa_id and e.card = c.tipo_card
  left join public.crm_cumplimientos cu on cu.requisito_id = r.id and cu.card_id = c.card_id
  where r.activo and a.id is not null
    and (r.etapa_id = a.id
      or (e.carril = 'legal' and a.tipo = 'abierta' and a.carril is null
        and a.orden >= (select t.orden from transferencia t)))
) q on true
group by c.tipo_card, c.card_id, c.etapa_id;
