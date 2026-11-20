// Control previo de la migración 79 (rutina de turno v2) por la API de administración, igual que ensayo-75.ts:
// 1) respaldo fuera del repo de lo que cambia (4 checks, 3 funciones y el estado de las plantillas);
// 2) ensayo del archivo EXACTO dentro de BEGIN y una excepción a propósito al final (aborta siempre);
// 3) verificación en una consulta nueva de que no persistió nada.
// No aplica nada. Uso: npx tsx scripts/franquiciatarios/ensayo-79.ts
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { leerEnvLocal } from '../zoho/cliente';

const VERSION = '20261120000079';
const ARCHIVO = `supabase/migrations/${VERSION}_franquiciatarios_rutina_v2.sql`;
const RESPALDOS = 'C:/Users/carlo/Respaldos/thecoffee-supabase';
const CHECKS = [
  ['franq_plantilla_secciones', 'franq_plantilla_secciones_clave_check'],
  ['franq_plantilla_secciones', 'franq_plantilla_secciones_firmas_check'],
  ['franq_checklists', 'franq_checklists_seccion_check'],
  ['franq_firmas', 'franq_firmas_tipo_check'],
] as const;

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

// 0. Estado previo: la 79 no está registrada, la 75 sí, y solo existe la plantilla v1.
const [previo] = await sql(`select
  (select max(version) from supabase_migrations.schema_migrations) ultima,
  (select count(*)::int from supabase_migrations.schema_migrations where version = '${VERSION}') registrada,
  (select count(*)::int from supabase_migrations.schema_migrations where version = '20261120000075') con_75,
  (select count(*)::int from public.franq_plantillas) plantillas,
  (select count(*)::int from public.franq_respuestas) respuestas,
  (select count(*)::int from public.franq_checklists) checklists,
  (select count(*)::int from information_schema.columns where table_name = 'franq_plantilla_puntos'
     and column_name = 'tipo') columna_tipo`);
if (previo.registrada || !previo.con_75 || previo.plantillas !== 1 || previo.columna_tipo)
  throw new Error(`Estado previo inesperado: ${JSON.stringify(previo)}`);

// 1. Respaldo: checks y funciones que se reemplazan.
const checks = await sql(`select conrelid::regclass::text tabla, conname, pg_get_constraintdef(oid) definicion
  from pg_constraint where conname in (${CHECKS.map(([, c]) => `'${c}'`).join(',')}) order by conname`);
if (checks.length !== CHECKS.length) throw new Error(`Faltan checks esperados: ${JSON.stringify(checks)}`);
const funciones =
  await sql(`select p.oid::regprocedure::text firma, pg_get_functiondef(p.oid) def from pg_proc p
  where p.proname in ('franq_responder', 'franq_corregir', 'franq_firmar', 'franq_avisos') order by 1`);
mkdirSync(RESPALDOS, { recursive: true });
const respaldo = `${RESPALDOS}/2026-11-20-migracion-79-antes.sql`;
writeFileSync(
  respaldo,
  [
    `-- Respaldo previo a la migración ${VERSION} (rutina v2). sha256 del archivo ensayado: ${sha}`,
    `-- Estado: ${JSON.stringify(previo)}`,
    `-- Reversión: borrar la plantilla v2 (secciones/puntos sin registros), volver vigente la v1, quitar las columnas`,
    `-- nuevas (tipo, cada_min, margen_min, dato, corte en puntos; dato en respuestas), drop de las funciones nuevas`,
    `-- (firmas con p_dato) y restaurar lo siguiente:`,
    ...checks.map(
      (c) =>
        `alter table ${c.tabla} drop constraint ${c.conname};\nalter table ${c.tabla} add constraint ${c.conname} ${c.definicion};`,
    ),
    ...funciones.map((f) => `-- ${f.firma}\n${f.def};`),
    '',
  ].join('\n'),
);

// 2. Ensayo con comprobaciones adentro; la excepción aborta la transacción pase lo que pase.
let dentro: unknown = null;
try {
  await sql(`begin;
${migracion}
do $ensayo$
declare v jsonb;
begin
  select jsonb_build_object(
    'plantillas', (select jsonb_agg(jsonb_build_object('version', version, 'vigente', vigente) order by version)
                   from public.franq_plantillas),
    'puntos_v2', (select jsonb_object_agg(s.clave, (select count(*) from public.franq_plantilla_puntos pt
                   where pt.seccion_id = s.id)) from public.franq_plantilla_secciones s
                   join public.franq_plantillas pl on pl.id = s.plantilla_id where pl.version = 2),
    'recurrentes', (select count(*) from public.franq_plantilla_puntos where tipo = 'recurrente'),
    'puntos_v1_unico', (select count(*) from public.franq_plantilla_puntos pt join public.franq_plantilla_secciones s
                   on s.id = pt.seccion_id join public.franq_plantillas pl on pl.id = s.plantilla_id
                   where pl.version = 1 and pt.tipo = 'unico'),
    'respuestas', (select count(*) from public.franq_respuestas),
    'responder', (select count(*) from pg_proc where proname = 'franq_responder'),
    'corregir', (select count(*) from pg_proc where proname = 'franq_corregir'))
  into v;
  raise exception 'ENSAYO_OK %', v;
end $ensayo$;`);
  throw new Error('El ensayo no terminó con ENSAYO_OK: revisar (la transacción pudo no abortarse).');
} catch (e) {
  // El objeto termina donde empieza el CONTEXT del error de Postgres (puede traer llaves anidadas).
  const m = /ENSAYO_OK (\{.*?\})(?:\\n|\s*CONTEXT)/.exec(String((e as Error).message).replace(/\\"/g, '"'));
  if (!m) throw e;
  dentro = JSON.parse(m[1]);
} finally {
  await sql('rollback').catch(() => {});
}

// 3. Consulta nueva: nada persistió.
const [despues] = await sql(`select
  (select count(*)::int from supabase_migrations.schema_migrations where version = '${VERSION}') registrada,
  (select count(*)::int from public.franq_plantillas) plantillas,
  (select count(*)::int from information_schema.columns where table_name = 'franq_plantilla_puntos'
     and column_name = 'tipo') columna_tipo,
  (select pg_get_constraintdef(oid) from pg_constraint where conname = 'franq_firmas_tipo_check') firmas_check,
  (select count(*)::int from pg_proc where proname = 'franq_responder') responder`);

console.log(JSON.stringify({ archivo: ARCHIVO, sha256: sha, previo, respaldo, dentro, despues }, null, 1));
