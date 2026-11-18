// Aplica la migración 61 en producción por la API de administración (con OK de Carlos, 2026-11-17):
// migración + registro en schema_migrations en una transacción, y verificación como usuario del CRM:
// la función devuelve las mismas cards que la vista.
import { readFileSync } from 'node:fs';
import { leerEnvLocal } from '../zoho/cliente';

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
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 500));
  return j;
};
const VERSION = '20261117000061';
const NOMBRE = 'crm_candados_todos';
const migracion = readFileSync(`supabase/migrations/${VERSION}_${NOMBRE}.sql`, 'utf8');

const [previo] = await sql(
  `select max(version) ultima, count(*) filter (where version = '${VERSION}')::int ya from supabase_migrations.schema_migrations`,
);
if (previo.ya) throw new Error('La migración 61 ya está registrada; no se aplica dos veces.');
if (previo.ultima !== '20261117000060')
  throw new Error(`La última registrada es ${previo.ultima}, se esperaba la 60.`);

const literal = migracion.replace(/'/g, "''");
await sql(`begin;
${migracion}
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('${VERSION}', '${NOMBRE}', array['${literal}']);
commit;`);
await sql(`notify pgrst, 'reload schema';`);

const [u] = await sql(
  `select p.user_id from perfiles p where p.activo and exists (select 1 from perfil_modulos m where m.user_id = p.user_id and m.modulo = 'crm') order by p.user_id limit 1`,
);
const comoUsuario = (q: string) =>
  sql(`begin read only;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${u.user_id}","role":"authenticated"}', true);
${q}`).finally(() => sql('rollback').catch(() => {}));
const cuenta = await comoUsuario(
  `select jsonb_array_length(crm_candados_todos()) funcion, (select count(*)::int from crm_v_candados) vista;`,
);
const plan = await comoUsuario(`explain (analyze, format json) select crm_candados_todos();`);
const ms = Math.round((plan.at(-1)?.['QUERY PLAN'] ?? plan[0]['QUERY PLAN'])[0]['Execution Time']);
const [registro] = await sql(
  `select count(*)::int total, max(version) ultima from supabase_migrations.schema_migrations`,
);
console.log(JSON.stringify({ comoUsuario: cuenta.at(-1), msFuncion: ms, registro }));
