// Solo lectura (API de administración, transacciones READ ONLY): para Essentia (514), los pedidos de Rappi y el
// catálogo de nombres que lee el módulo con la llave de servicio (rappiServicio / catalogoServicio: tablas directas)
// son los mismos que entrega Sucursales con la sesión de un usuario (RPC sucursales_rappi_portal y
// sucursales_catalogo_pos). Uso: npx tsx scripts/franquiciatarios/paridad-essentia.ts [dias=7]
import { leerEnvLocal } from '../zoho/cliente';

const COMPANY = 514;
const DIAS = Number(process.argv[2] ?? 7);
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
  return j as Record<string, unknown>[];
};

// Un usuario real con Sucursales y Essentia asignada (la RPC exige ese acceso).
const [u] = await sql(`select p.user_id from perfiles p
  join perfil_modulos m on m.user_id = p.user_id and m.modulo = 'sucursales'
  join perfil_sucursales s on s.user_id = p.user_id and s.company_id = ${COMPANY}
  where p.activo order by p.user_id limit 1`);
if (!u) throw new Error('No hay usuario con Sucursales y Essentia asignada para comparar.');

const filas: Record<string, unknown>[] = [];
const hoy = new Date(Date.now() - 6 * 3_600_000).toISOString().slice(0, 10); // fecha de CDMX (UTC−6)
for (let i = 0; i < DIAS; i++) {
  const d = new Date(`${hoy}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - i);
  const dia = d.toISOString().slice(0, 10);
  const comoUsuario = await sql(`begin read only;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${u.user_id}","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '${u.user_id}', true);
select coalesce(jsonb_agg(x->>'id' order by x->>'id'), '[]') ids
from jsonb_array_elements(public.sucursales_rappi_portal(${COMPANY}, '${dia}', '${dia}')->'pedidos') x`);
  await sql('rollback').catch(() => {});
  // Lo mismo que lee rappiServicio (tablas directas, como la llave de servicio).
  const [directo] =
    await sql(`select coalesce(jsonb_agg(rappi_pedido_id::text order by rappi_pedido_id::text), '[]') ids
    from rappi_pedidos where company_id = ${COMPANY} and fecha_local = '${dia}'`);
  const a = (comoUsuario[0]?.ids ?? []) as string[];
  const b = directo.ids as string[];
  const r = {
    dia,
    rpc: a.length,
    servicio: b.length,
    iguales: JSON.stringify([...a].sort()) === JSON.stringify([...b].sort()),
  };
  filas.push(r);
}
const rpcCat = await sql(`begin read only;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"${u.user_id}","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '${u.user_id}', true);
select md5(coalesce((select string_agg((x->>'codigo') || '|' || coalesce(x->>'nombre_observado', ''), ',' order by x->>'codigo', x->>'nombre_observado')
  from jsonb_array_elements(public.sucursales_catalogo_pos(${COMPANY})) x), '')) huella,
  jsonb_array_length(public.sucursales_catalogo_pos(${COMPANY})) filas`);
await sql('rollback').catch(() => {});
const [tablaCat] =
  await sql(`select md5(coalesce(string_agg(codigo || '|' || coalesce(nombre_observado, ''), ',' order by codigo, nombre_observado), '')) huella,
  count(*)::int filas from producto_codigo_pos`);
const cat = { rpc: rpcCat[0], servicio: tablaCat, iguales: rpcCat[0]?.huella === tablaCat.huella };
console.log(JSON.stringify({ company: COMPANY, rappi: filas, catalogo: cat }, null, 1));
