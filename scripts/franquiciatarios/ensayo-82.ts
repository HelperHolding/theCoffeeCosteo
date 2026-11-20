// Control previo de la migración 82 (recepciones solo para gerencia) por la API de administración, como ensayo-80.ts:
// respaldo fuera del repo de la política y la función que cambian, ensayo del archivo EXACTO dentro de BEGIN con una
// excepción a propósito al final (aborta siempre) y verificación en una consulta nueva.
// No aplica nada. Uso: npx tsx scripts/franquiciatarios/ensayo-82.ts
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { leerEnvLocal } from '../zoho/cliente';

const VERSION = '20261120000082';
const ARCHIVO = `supabase/migrations/${VERSION}_franquiciatarios_pedidos_gestores.sql`;
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
  (select count(*)::int from supabase_migrations.schema_migrations where version = '${VERSION}') registrada,
  (select count(*)::int from supabase_migrations.schema_migrations where version = '20261120000080') con_80,
  (select count(*)::int from pg_proc where proname = 'franq_companias_gestor') funcion_nueva,
  (select count(*)::int from public.franq_recepciones) recepciones`);
if (previo.registrada || !previo.con_80 || previo.funcion_nueva)
  throw new Error(`Estado previo inesperado: ${JSON.stringify(previo)}`);

const [pol] = await sql(
  `select qual from pg_policies where tablename = 'franq_recepciones' and policyname = 'lectura'`,
);
const [fn] = await sql(
  `select pg_get_functiondef('public.franq_recibir(integer,text,text,jsonb,text,bigint,text)'::regprocedure) def`,
);
mkdirSync(RESPALDOS, { recursive: true });
const respaldo = `${RESPALDOS}/2026-11-20-migracion-82-antes.sql`;
writeFileSync(
  respaldo,
  [
    `-- Respaldo previo a la migración ${VERSION} (recepciones solo gerencia). sha256 del archivo ensayado: ${sha}`,
    `-- Estado: ${JSON.stringify(previo)}`,
    `-- Reversión: drop function franq_companias_gestor; restaurar la política y la función:`,
    `drop policy lectura on public.franq_recepciones;`,
    `create policy lectura on public.franq_recepciones for select to authenticated using (${pol.qual});`,
    `${fn.def};`,
    '',
  ].join('\n'),
);

let dentro: unknown = null;
try {
  await sql(`begin;
${migracion}
do $ensayo$
declare v jsonb;
begin
  select jsonb_build_object(
    'funcion_nueva', (select count(*) from pg_proc where proname = 'franq_companias_gestor'),
    'politica', (select qual from pg_policies where tablename = 'franq_recepciones' and policyname = 'lectura'),
    'recibir_exige_gestor', (select prosrc like '%franq_es_gestor(p_company)%' from pg_proc where proname = 'franq_recibir'),
    'recepciones', (select count(*) from public.franq_recepciones))
  into v;
  raise exception 'ENSAYO_OK %', v;
end $ensayo$;`);
  throw new Error('El ensayo no terminó con ENSAYO_OK: revisar (la transacción pudo no abortarse).');
} catch (e) {
  const m = /ENSAYO_OK (\{.*?\})(?:\\n|\s*CONTEXT)/.exec(String((e as Error).message).replace(/\\"/g, '"'));
  if (!m) throw e;
  dentro = JSON.parse(m[1]);
} finally {
  await sql('rollback').catch(() => {});
}

const [despues] = await sql(`select
  (select count(*)::int from supabase_migrations.schema_migrations where version = '${VERSION}') registrada,
  (select count(*)::int from pg_proc where proname = 'franq_companias_gestor') funcion_nueva,
  (select qual from pg_policies where tablename = 'franq_recepciones' and policyname = 'lectura') politica`);

console.log(JSON.stringify({ archivo: ARCHIVO, sha256: sha, previo, respaldo, dentro, despues }, null, 1));
