// Ensayo de la migración 59 con ROLLBACK: aplica, mide la vista como un usuario real del CRM y revierte.
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
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 400));
  return j;
};
const migracion = readFileSync('supabase/migrations/20261116000059_crm_candados_rapidos.sql', 'utf8');
const [u] = await sql(`select p.user_id from perfiles p where p.activo and exists (select 1 from perfil_modulos m where m.user_id = p.user_id and m.modulo = 'crm') order by p.user_id limit 1`);
const comoUsuario = `set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${u.user_id}","role":"authenticated"}', true);`;
const plan = (r: any[]) => Math.round((r.at(-1)?.['QUERY PLAN'] ?? r[0]['QUERY PLAN'])[0]['Execution Time']);
const consulta = `select etapa_id,total,listos,liberado,carril_total,carril_listos from crm_v_candados`;
const conteo = `select count(*) n, sum(total) t, sum(listos) l, sum(carril_total) ct, sum(carril_listos) cl, count(*) filter (where liberado) lib from crm_v_candados`;
const cols = 'tipo_card, card_id, etapa_id, total, listos, faltante, faltante_area, liberado, carril_total, carril_listos';
const todas = `select md5(string_agg(row(${cols})::text, '|' order by card_id)) h, count(*) n from crm_v_candados`;
const antes = await sql(`begin read only; ${todas};`);
await sql('rollback').catch(() => {});
const despues = await sql(`begin; ${migracion}; ${todas};`);
await sql('rollback').catch(() => {});
const tAntes = await sql(`begin read only; ${comoUsuario} explain (analyze, format json) ${consulta};`);
await sql('rollback').catch(() => {});
const t = await sql(`begin; ${migracion}; ${comoUsuario} explain (analyze, format json) ${consulta};`);
await sql('rollback').catch(() => {});
const ids = `select * from crm_v_candados where card_id in (select id from crm_franquiciatarios where archivado_en is null order by actualizado_en desc limit 150)`;
const t150 = await sql(`begin; ${migracion}; ${comoUsuario} explain (analyze, format json) ${ids};`);
await sql('rollback').catch(() => {});
console.log('filas antes/después:', antes.at(-1).n, despues.at(-1).n, '· idénticas:', antes.at(-1).h === despues.at(-1).h);
console.log('vista completa como usuario: antes', plan(tAntes), 'ms · con la 59', plan(t), 'ms');
console.log('150 cards (armar tablero) con la 59:', plan(t150), 'ms');
const existe = await sql(`select pg_get_viewdef('crm_v_candados') like '%crm_requisitos_de%' as sigue_vieja`);
console.log('producción sin cambios:', existe[0].sigue_vieja);
