// Control previo de la migración 74 (BI metas, PR #165) por la API de administración: respaldo de bi_tablero y de
// bi_metas, ensayo del archivo EXACTO con BEGIN + excepción intencional (aborta siempre) y verificación en una consulta
// nueva. No aplica nada. Uso: npx tsx scripts/franquiciatarios/ensayo-74-bi.ts <ruta del .sql>
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { leerEnvLocal } from '../zoho/cliente';

const VERSION = '20261120000074';
const ARCHIVO = process.argv[2];
if (!ARCHIVO?.endsWith(`${VERSION}_bi_metas_pe.sql`))
  throw new Error('Pasa la ruta de 20261120000074_bi_metas_pe.sql');
const RESPALDOS = 'C:/Users/carlo/Respaldos/thecoffee-supabase';
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
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 800));
  return j as Record<string, unknown>[];
};
const migracion = readFileSync(ARCHIVO, 'utf8');
const sha = createHash('sha256').update(migracion).digest('hex');

const [previo] = await sql(`select
  (select max(version) from supabase_migrations.schema_migrations) ultima,
  (select count(*)::int from supabase_migrations.schema_migrations where version in ('${VERSION}', '20261119000073')
     and name = 'bi_metas_pe') registrada,
  to_regclass('public.bi_metas_diarias') is not null tabla,
  (select count(*)::int from information_schema.columns where table_name = 'bi_metas' and column_name = 'fecha_apertura') columna`);
if (previo.registrada || previo.tabla || previo.columna)
  throw new Error(`Estado previo inesperado: ${JSON.stringify(previo)}`);

// Respaldo: definición actual de bi_tablero (la migración la reemplaza) y columnas de bi_metas.
const [fn] = await sql(`select pg_get_functiondef('public.bi_tablero(jsonb)'::regprocedure) def`);
const cols =
  await sql(`select column_name, data_type from information_schema.columns where table_schema = 'public'
  and table_name = 'bi_metas' order by ordinal_position`);
mkdirSync(RESPALDOS, { recursive: true });
const respaldo = `${RESPALDOS}/2026-11-20-migracion-74-bi-antes.sql`;
writeFileSync(
  respaldo,
  `-- Respaldo previo a la migración ${VERSION} (bi_metas_pe). sha256 del archivo ensayado: ${sha}\n` +
    `-- Última versión registrada: ${previo.ultima}. Columnas de bi_metas: ${JSON.stringify(cols)}\n` +
    `-- Reversión: drop function bi_recalcular_metas; drop table bi_metas_diarias; alter table bi_metas drop column fecha_apertura; y:\n` +
    `${fn.def};\n`,
);

let dentro: unknown = null;
try {
  await sql(`begin;
${migracion}
do $ensayo$
declare v jsonb;
begin
  select jsonb_build_object(
    'tabla', to_regclass('public.bi_metas_diarias') is not null,
    'funcion', (select count(*) from pg_proc where proname = 'bi_recalcular_metas'),
    'columna', (select count(*) from information_schema.columns where table_name = 'bi_metas' and column_name = 'fecha_apertura'),
    'metas_existentes', (select count(*) from public.bi_metas))
  into v;
  raise exception 'ENSAYO_OK %', v;
end $ensayo$;`);
  throw new Error('El ensayo no terminó con ENSAYO_OK.');
} catch (e) {
  const m = /ENSAYO_OK (\{.*?\})/.exec(String((e as Error).message).replace(/\\"/g, '"'));
  if (!m) throw e;
  dentro = JSON.parse(m[1]);
} finally {
  await sql('rollback').catch(() => {});
}

const [despues] = await sql(`select
  (select count(*)::int from supabase_migrations.schema_migrations where version = '${VERSION}') registrada,
  to_regclass('public.bi_metas_diarias') is not null tabla,
  (select count(*)::int from pg_proc where proname = 'bi_recalcular_metas') funcion,
  md5(pg_get_functiondef('public.bi_tablero(jsonb)'::regprocedure)) = md5($q$${fn.def}$q$) bi_tablero_igual`);
console.log(JSON.stringify({ archivo: ARCHIVO, sha256: sha, previo, respaldo, dentro, despues }, null, 1));
