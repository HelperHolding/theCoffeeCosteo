// Aplica la migración 59 en producción por la API de administración (con OK de Carlos, 2026-11-16):
// huella de la vista antes, migración + registro en schema_migrations en una transacción, y verificación.
import { readFileSync } from 'node:fs';
import { leerEnvLocal } from '../zoho/cliente';

const env = await leerEnvLocal();
const ref = new URL(env.get('NEXT_PUBLIC_SUPABASE_URL')!).hostname.split('.')[0];
const sql = async (q: string) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.get('SUPABASE_ACCESS_TOKEN')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 500));
  return j;
};
const VERSION = '20261116000059';
const NOMBRE = 'crm_candados_rapidos';
const migracion = readFileSync(`supabase/migrations/${VERSION}_${NOMBRE}.sql`, 'utf8');
const cols = 'tipo_card, card_id, etapa_id, total, listos, faltante, faltante_area, liberado, carril_total, carril_listos';
const huella = `select md5(string_agg(row(${cols})::text, '|' order by card_id)) h, count(*)::int n from crm_v_candados`;

const ya = await sql(`select count(*)::int n from supabase_migrations.schema_migrations where version = '${VERSION}'`);
if (ya[0].n) throw new Error('La migración 59 ya está registrada; no se aplica dos veces.');

const antes = (await sql(huella))[0];
const literal = migracion.replace(/'/g, "''");
await sql(`begin;
${migracion}
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('${VERSION}', '${NOMBRE}', array['${literal}']);
commit;`);
const despues = (await sql(huella))[0];

const [u] = await sql(
  `select p.user_id from perfiles p where p.activo and exists (select 1 from perfil_modulos m where m.user_id = p.user_id and m.modulo = 'crm') order by p.user_id limit 1`,
);
const plan = await sql(`begin read only;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${u.user_id}","role":"authenticated"}', true);
explain (analyze, format json) select etapa_id,total,listos,liberado,carril_total,carril_listos from crm_v_candados;`);
await sql('rollback').catch(() => {});
const ms = Math.round((plan.at(-1)?.['QUERY PLAN'] ?? plan[0]['QUERY PLAN'])[0]['Execution Time']);
const registro = await sql(
  `select count(*)::int total, max(version) ultima from supabase_migrations.schema_migrations`,
);
const definicion = await sql(`select pg_get_viewdef('crm_v_candados') like '%crm_requisitos_de%' as vieja`);

console.log(
  JSON.stringify({
    filasAntes: antes.n,
    filasDespues: despues.n,
    identicas: antes.h === despues.h,
    msComoUsuario: ms,
    vistaVieja: definicion[0].vieja,
    registro: registro[0],
  }),
);
