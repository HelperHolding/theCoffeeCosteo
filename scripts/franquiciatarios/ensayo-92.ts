// Control previo de la migración 92 (roles por posición y mermas) por la API de administración, como ensayo-91.ts:
// estado previo, ensayo del archivo EXACTO dentro de BEGIN con una excepción a propósito al final (aborta siempre) y
// verificación en una consulta nueva. Dentro del ensayo, como Carlos (admin del módulo) en Essentia: siembra la lista
// base, asigna, registra y cierra mermas. Solo crea objetos nuevos: nada que respaldar.
// No aplica nada. Uso: npx tsx scripts/franquiciatarios/ensayo-92.ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { leerEnvLocal } from '../zoho/cliente';

const VERSION = '20261120000092';
const ARCHIVO = `supabase/migrations/${VERSION}_franquiciatarios_roles_mermas.sql`;
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
  to_regclass('public.franq_mermas') is not null tabla,
  (select count(*)::int from pg_proc where proname in ('franq_roles_base', 'franq_registrar_merma')) funciones`);
// La 91 (PR de la parte A) puede no estar aplicada todavía: la 92 no depende de ella.
if (
  !['20261120000090', '20261120000091'].includes(String(previo.ultima)) ||
  previo.registrada ||
  previo.tabla ||
  previo.funciones
)
  throw new Error(`Estado previo inesperado: ${JSON.stringify(previo)}`);

let dentro: unknown = null;
try {
  await sql(`begin;
${migracion}
do $ensayo$
declare v jsonb; n_base int; v_turno bigint; v_pos bigint; v_barista bigint; v_insumo bigint; v_merma bigint;
  v_asig bigint;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', '${CARLOS}', 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', '${CARLOS}', true);
  execute 'set local role authenticated';
  n_base := public.franq_roles_base(${ESSENTIA});
  select id into v_turno from public.franq_turnos where company_id = ${ESSENTIA} order by orden limit 1;
  select id into v_pos from public.franq_posiciones where company_id = ${ESSENTIA} order by orden limit 1;
  select id into v_barista from public.franq_baristas where company_id = ${ESSENTIA} and activo order by id limit 1;
  select id into v_insumo from public.franq_insumos where company_id = ${ESSENTIA} and activo order by orden limit 1;
  if v_barista is not null then
    v_asig := public.franq_asignar(${ESSENTIA}, public.franq_dia_operacion(now()), v_turno, v_pos, v_barista, false);
  end if;
  if v_insumo is not null then
    v_merma := public.franq_registrar_merma(${ESSENTIA}, v_insumo, 1, 'caducidad', null, null, 'ensayo', null, false, null);
    perform public.franq_cerrar_mermas(${ESSENTIA}, public.franq_dia_operacion(now()));
  end if;
  execute 'reset role';
  select jsonb_build_object(
    'tablas', (select count(*) from pg_class where relname in ('franq_posiciones', 'franq_turnos', 'franq_asignaciones',
      'franq_mermas', 'franq_merma_tolerancias', 'franq_mermas_cierre') and relrowsecurity),
    'politicas', (select count(*) from pg_policies where tablename in ('franq_posiciones', 'franq_turnos',
      'franq_asignaciones', 'franq_mermas', 'franq_merma_tolerancias', 'franq_mermas_cierre')),
    'funciones', (select count(*) from pg_proc where proname in ('franq_roles_base', 'franq_posicion_guardar',
      'franq_turno_guardar', 'franq_asignar', 'franq_copiar_semana', 'franq_registrar_merma', 'franq_cerrar_mermas',
      'franq_tolerancia_guardar')),
    'base_sembrada', n_base,
    'asignacion', v_asig is not null,
    'merma', v_merma is not null,
    'cierre', (select count(*) from public.franq_mermas_cierre where company_id = ${ESSENTIA}),
    'insumos_essentia', (select count(*) from public.franq_insumos where company_id = ${ESSENTIA} and activo))
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
  to_regclass('public.franq_mermas') is not null tabla,
  (select count(*)::int from pg_proc where proname in ('franq_roles_base', 'franq_registrar_merma')) funciones`);

console.log(JSON.stringify({ archivo: ARCHIVO, sha256: sha, previo, dentro, despues }, null, 1));
