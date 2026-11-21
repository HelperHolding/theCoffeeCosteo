// Control previo de la migración 91 (ficha de receta sin costo y nivel de servicio) por la API de administración, como
// ensayo-88.ts: estado previo, ensayo del archivo EXACTO dentro de BEGIN con una excepción a propósito al final (aborta
// siempre) y verificación en una consulta nueva. Dentro del ensayo se llama a las dos funciones como Carlos (admin del
// módulo) para Essentia y se compara la ficha contra las tablas de Costeo. Solo crea funciones: nada que respaldar.
// No aplica nada. Uso: npx tsx scripts/franquiciatarios/ensayo-91.ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { leerEnvLocal } from '../zoho/cliente';

const VERSION = '20261120000091';
const ARCHIVO = `supabase/migrations/${VERSION}_franquiciatarios_recetas_servicio.sql`;
const CARLOS = '63e994a6-5cbc-4605-b0d0-78bde4264890';
const ESSENTIA = 514;

const env = await leerEnvLocal();
const ref = new URL(env.get('NEXT_PUBLIC_SUPABASE_URL')!).hostname.split('.')[0];
const sql = async (q: string) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.get('SUPABASE_ACCESS_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: q }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 6000));
  return j as Record<string, unknown>[];
};

const migracion = readFileSync(ARCHIVO, 'utf8');
const sha = createHash('sha256').update(migracion).digest('hex');

const [previo] = await sql(`select
  (select max(version) from supabase_migrations.schema_migrations) ultima,
  (select count(*)::int from supabase_migrations.schema_migrations where version = '${VERSION}') registrada,
  (select count(*)::int from pg_proc where proname in ('franq_ficha_recetas', 'franq_nivel_servicio')) funciones`);
if (previo.ultima !== '20261120000090' || previo.registrada || previo.funciones)
  throw new Error(`Estado previo inesperado: ${JSON.stringify(previo)}`);

let dentro: unknown = null;
try {
  await sql(`begin;
${migracion}
do $ensayo$
declare f jsonb; s jsonb; costeo int; v jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', '${CARLOS}', 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', '${CARLOS}', true);
  execute 'set local role authenticated';
  f := public.franq_ficha_recetas(${ESSENTIA});
  s := public.franq_nivel_servicio(${ESSENTIA}, current_date - 34, current_date);
  execute 'reset role';
  -- Líneas de producto (con tamaño) que hay en Costeo para los productos activos con código POS.
  select count(*) into costeo from public.receta_lineas l
    join public.linea_cantidades lc on lc.linea_id = l.id and lc.tamano_id is not null
    join public.recetas r on r.id = l.receta_id and r.activo
    where l.receta_id in (select receta_id from public.producto_codigo_pos);
  select jsonb_build_object(
    'productos', jsonb_array_length(f->'productos'),
    'subrecetas', jsonb_array_length(f->'subrecetas'),
    'lineas_producto', (select count(*) from jsonb_array_elements(f->'lineas') x where x->>'tamano' is not null),
    'lineas_costeo', costeo,
    'lineas_lote', (select count(*) from jsonb_array_elements(f->'lineas') x where x->>'tamano' is null),
    'sin_costos', f::text !~* 'costo|precio|margen',
    'ejemplo', (select jsonb_agg(x) from (select x from jsonb_array_elements(f->'lineas') x
      where x->>'receta_id' = (select p->>'id' from jsonb_array_elements(f->'productos') p
        where p->>'nombre' ilike 'iced latte%' limit 1) and x->>'tamano' is not null limit 3) e),
    'servicio_tiendas', s->'tiendas',
    'servicio_hasta', s->'actualizado_hasta',
    'servicio_renglones', jsonb_array_length(s->'dias'))
  into v;
  raise exception 'ENSAYO_OK %', v;
end $ensayo$;`);
  throw new Error('El ensayo no terminó con ENSAYO_OK: revisar (la transacción pudo no abortarse).');
} catch (e) {
  const m = /ENSAYO_OK (\{.*?\})(?:\\n|\s*CONTEXT|"\})/.exec(
    String((e as Error).message).replace(/\\"/g, '"'),
  );
  if (!m) throw e;
  dentro = JSON.parse(m[1]);
} finally {
  await sql('rollback').catch(() => {});
}

const [despues] = await sql(`select
  (select count(*)::int from supabase_migrations.schema_migrations where version = '${VERSION}') registrada,
  (select count(*)::int from pg_proc where proname in ('franq_ficha_recetas', 'franq_nivel_servicio')) funciones`);

console.log(JSON.stringify({ archivo: ARCHIVO, sha256: sha, previo, dentro, despues }, null, 1));
