-- Migración 61: candados de todas las cards en una sola respuesta.
--
-- Panel, Pipeline, Proceso y Mis pendientes leían crm_v_candados con `.limit(20000)`, pero PostgREST corta toda
-- respuesta en max_rows (1,000): con ~3,850 cards los conteos salían recortados (Pendientes mostraba «Bloqueadas
-- 1,000» cuando eran 3,680). Leer por páginas lo corrige, pero cada página recalcula la vista completa con la RLS
-- (~1 s cada una). Esta función la calcula una vez y la devuelve como un solo jsonb, que max_rows no corta.
--
-- security invoker: la RLS de cada tabla decide qué cards ve quien llama, igual que al leer la vista.
-- Solo columnas que usan los conteos (sin `faltante`, el texto largo).
create or replace function public.crm_candados_todos()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'tipo_card', c.tipo_card,
        'card_id', c.card_id,
        'etapa_id', c.etapa_id,
        'total', c.total,
        'listos', c.listos,
        'faltante_area', c.faltante_area,
        'liberado', c.liberado,
        'carril_total', c.carril_total,
        'carril_listos', c.carril_listos
      )
      order by c.card_id
    ),
    '[]'::jsonb
  )
  from public.crm_v_candados c;
$$;

revoke all on function public.crm_candados_todos() from public, anon;
grant execute on function public.crm_candados_todos() to authenticated;
