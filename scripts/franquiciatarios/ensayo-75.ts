// Control previo de la migración 75 (docs/portal/MIGRACIONES-Y-DESPLIEGUE.md), por la API de administración:
// 1) respaldo de lo que cambia (definiciones de los dos checks) fuera del repo;
// 2) ensayo del archivo EXACTO dentro de BEGIN … ROLLBACK, con comprobaciones adentro;
// 3) verificación en una consulta nueva de que no persistió nada (ni objetos ni versión registrada).
// No aplica nada. Uso: npx tsx scripts/franquiciatarios/ensayo-75.ts
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { leerEnvLocal } from '../zoho/cliente';

const VERSION = '20261120000075';
const ARCHIVO = `supabase/migrations/${VERSION}_franquiciatarios.sql`;
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

// 0. Estado previo: la 75 no está registrada y no existe nada franq_.
const [previo] = await sql(`select
  (select max(version) from supabase_migrations.schema_migrations) ultima,
  (select count(*)::int from supabase_migrations.schema_migrations where version = '${VERSION}') registrada,
  (select count(*)::int from pg_class where relname like 'franq\\_%' and relnamespace = 'public'::regnamespace) tablas,
  (select count(*)::int from pg_proc where proname like 'franq\\_%') funciones`);
if (previo.registrada || previo.tablas || previo.funciones)
  throw new Error(`Estado previo inesperado: ${JSON.stringify(previo)}`);

// 1. Respaldo de lo que la migración reemplaza.
const checks = await sql(`select conname, pg_get_constraintdef(oid) definicion from pg_constraint
  where conname in ('perfiles_rol_check', 'perfil_modulos_modulo_check') order by conname`);
mkdirSync(RESPALDOS, { recursive: true });
const respaldo = `${RESPALDOS}/2026-11-20-migracion-75-antes.sql`;
writeFileSync(
  respaldo,
  [
    `-- Respaldo previo a la migración ${VERSION} (franquiciatarios). sha256 del archivo ensayado: ${sha}`,
    `-- Última versión registrada al respaldar: ${previo.ultima}`,
    `-- Reversión: borrar los objetos franq_* (tablas, funciones, triggers) y restaurar estos dos checks.`,
    ...checks.map(
      (c) =>
        `alter table public.${c.conname === 'perfiles_rol_check' ? 'perfiles' : 'perfil_modulos'} drop constraint ${c.conname};\n` +
        `alter table public.${c.conname === 'perfiles_rol_check' ? 'perfiles' : 'perfil_modulos'} add constraint ${c.conname} ${c.definicion};`,
    ),
    '',
  ].join('\n'),
);

// 2. Ensayo: el archivo exacto y, al final, una excepción a propósito con las comprobaciones. La excepción aborta la
//    transacción pase lo que pase (nada puede quedar), y su mensaje trae el resultado.
let dentro: unknown = null;
try {
  await sql(`begin;
${migracion}
do $ensayo$
declare v jsonb;
begin
  select jsonb_build_object(
    'tablas', (select count(*) from pg_class where relname like 'franq\_%' and relkind = 'r' and relnamespace = 'public'::regnamespace),
    'funciones', (select count(*) from pg_proc where proname like 'franq\_%'),
    'secciones', (select count(*) from public.franq_plantilla_secciones),
    'puntos', (select count(*) from public.franq_plantilla_puntos),
    'rol_check', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'perfiles_rol_check'),
    'modulo_check', (select pg_get_constraintdef(oid) from pg_constraint where conname = 'perfil_modulos_modulo_check'),
    'perfiles_fuera_del_check', (select count(*) from public.perfiles where rol not in
      ('compras','operaciones','finanzas','admin','sucursales','interno','franquiciado','proveedor','tienda')))
  into v;
  raise exception 'ENSAYO_OK %', v;
end $ensayo$;`);
  throw new Error('El ensayo no terminó con ENSAYO_OK: revisar (la transacción pudo no abortarse).');
} catch (e) {
  const m = /ENSAYO_OK (\{.*?\})/.exec(String((e as Error).message).replace(/\\"/g, '"'));
  if (!m) throw e;
  dentro = JSON.parse(m[1]);
} finally {
  await sql('rollback').catch(() => {});
}

// 3. Conexión nueva: nada persistió.
const [despues] = await sql(`select
  (select count(*)::int from supabase_migrations.schema_migrations where version = '${VERSION}') registrada,
  (select count(*)::int from pg_class where relname like 'franq\\_%' and relnamespace = 'public'::regnamespace) objetos,
  (select count(*)::int from pg_proc where proname like 'franq\\_%') funciones,
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'perfiles_rol_check') rol_check`);

console.log(JSON.stringify({ archivo: ARCHIVO, sha256: sha, previo, respaldo, dentro, despues }, null, 1));
