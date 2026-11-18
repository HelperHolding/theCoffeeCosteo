// EXPLAIN ANALYZE (solo lectura, dentro de una transacción que se revierte) de las consultas del
// Pipeline con el rol y los claims de un usuario real del CRM, para medir el costo de la RLS.
import { leerEnvLocal } from '../zoho/cliente';
const env = await leerEnvLocal();
const token = env.get('SUPABASE_ACCESS_TOKEN')!;
const ref = new URL(env.get('NEXT_PUBLIC_SUPABASE_URL')!).hostname.split('.')[0];
const sql = async (q: string) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
};
const [u] = await sql(
  `select p.user_id from perfiles p where p.activo and exists (select 1 from perfil_modulos m where m.user_id = p.user_id and m.modulo = 'crm') order by p.user_id limit 1`,
);
const como = (q: string) => `begin read only;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${u.user_id}","role":"authenticated"}', true);
explain (analyze, format json) ${q};`;
const medir = async (nombre: string, q: string) => {
  const r = await sql(como(q));
  const plan = r.at(-1)?.['QUERY PLAN']?.[0] ?? r[0]?.['QUERY PLAN']?.[0];
  console.log(nombre.padEnd(46), plan ? `${Math.round(plan['Execution Time'])} ms` : JSON.stringify(r).slice(0, 200));
  await sql('rollback').catch(() => {});
};
const etapa1 = (await sql(`select id from crm_etapas where embudo='general' and activa order by orden limit 1`))[0].id;
await medir('v_candados completa (entrada)', `select etapa_id,total,listos,liberado,carril_total,carril_listos from crm_v_candados`);
await medir('v_candados solo sucursales', `select * from crm_v_candados where tipo_card='sucursal'`);
await medir('franq: conteo etapa 1', `select count(*) from crm_franquiciatarios where etapa_id='${etapa1}' and archivado_en is null`);
await medir('franq: primeras 50 etapa 1', `select id,etapa_id,actualizado_en from crm_franquiciatarios where etapa_id='${etapa1}' and archivado_en is null order by actualizado_en desc limit 50`);
await medir('franq: todos ligeros (antes)', `select id,etapa_id,actualizado_en,muestra from crm_franquiciatarios where archivado_en is null`);
await medir('v_candados 150 ids', `select * from crm_v_candados where card_id in (select id from crm_franquiciatarios where etapa_id='${etapa1}' order by actualizado_en desc limit 150)`);
await medir('v_vencimientos completa', `select * from crm_v_vencimientos`);
await medir('layout: tiendas (Ctrl K)', `select id,nombre,ciudad,embudo from crm_tiendas where archivado_en is null`);
await medir('layout: contactos (Ctrl K)', `select id,nombre,apellidos,franquiciatario from crm_contactos where archivado_en is null`);
