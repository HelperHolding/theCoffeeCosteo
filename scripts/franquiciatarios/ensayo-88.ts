// Control previo de la migración 80 (gastos fijos del P&L) por la API de administración, como ensayo-79.ts:
// estado previo, ensayo del archivo EXACTO dentro de BEGIN con una excepción a propósito al final (aborta siempre) y
// verificación en una consulta nueva. La migración solo crea objetos nuevos: no hay nada que respaldar.
// No aplica nada. Uso: npx tsx scripts/franquiciatarios/ensayo-88.ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { leerEnvLocal } from '../zoho/cliente';

const VERSION = '20261120000088';
const ARCHIVO = `supabase/migrations/${VERSION}_franquiciatarios_gastos_fijos.sql`;

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
  to_regclass('public.franq_gastos_fijos') is not null tabla,
  (select count(*)::int from pg_proc where proname = 'franq_gasto_fijo') funcion`);
if (previo.ultima !== '20261120000087' || previo.registrada || previo.tabla || previo.funcion)
  throw new Error(`Estado previo inesperado: ${JSON.stringify(previo)}`);

let dentro: unknown = null;
try {
  await sql(`begin;
${migracion}
do $ensayo$
declare v jsonb;
begin
  select jsonb_build_object(
    'tabla', to_regclass('public.franq_gastos_fijos') is not null,
    'rls', (select relrowsecurity from pg_class where oid = 'public.franq_gastos_fijos'::regclass),
    'politicas', (select count(*) from pg_policies where tablename = 'franq_gastos_fijos'),
    'funcion', (select count(*) from pg_proc where proname = 'franq_gasto_fijo'),
    'trigger', (select count(*) from pg_trigger where tgrelid = 'public.franq_gastos_fijos'::regclass and not tgisinternal))
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
  to_regclass('public.franq_gastos_fijos') is not null tabla,
  (select count(*)::int from pg_proc where proname = 'franq_gasto_fijo') funcion`);

console.log(JSON.stringify({ archivo: ARCHIVO, sha256: sha, previo, dentro, despues }, null, 1));
