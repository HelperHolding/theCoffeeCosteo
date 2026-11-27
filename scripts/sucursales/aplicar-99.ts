// Migración 99 (docs/sucursales/19) en producción por la API de administración de Supabase, con OK de Carlos
// (2026-11-27, «Mergea y aplica»). La integración de Supabase en main falla, así que se aplica a mano:
//   --ensayo   la corre dentro de una transacción y hace ROLLBACK (no cambia nada); comprueba que no truene.
//   --aplicar  migración + registro en schema_migrations en una sola transacción, y recarga el esquema.
import { readFileSync } from 'node:fs';
import { leerEnvLocal } from '../zoho/cliente';

const modo = process.argv.includes('--aplicar')
  ? 'aplicar'
  : process.argv.includes('--ensayo')
    ? 'ensayo'
    : null;
if (!modo) throw new Error('Usa --ensayo o --aplicar');
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
const VERSION = '20261127000099';
const NOMBRE = 'sucursales_tablero_ciudad';
const migracion = readFileSync(`supabase/migrations/${VERSION}_${NOMBRE}.sql`, 'utf8');

const [previo] = await sql(
  `select max(version) ultima, count(*) filter (where version = '${VERSION}' or version like '%000099')::int ya,
     (select count(*) from pg_proc where proname = 'sucursales_ciudad_companias')::int funcion
   from supabase_migrations.schema_migrations`,
);
console.log('antes:', JSON.stringify(previo));
if (previo.ya || previo.funcion)
  throw new Error('La 99 ya está aplicada o registrada; no se aplica dos veces.');

if (modo === 'ensayo') {
  // Si algo falla, la API devuelve error y no queda nada; si no, el rollback lo deshace todo.
  await sql(`begin;\n${migracion}\nrollback;`);
  const [despues] = await sql(
    `select count(*)::int funcion from pg_proc where proname = 'sucursales_ciudad_companias'`,
  );
  console.log('ensayo sin errores; después del rollback:', JSON.stringify(despues));
} else {
  const literal = migracion.replace(/'/g, "''");
  await sql(`begin;
${migracion}
insert into supabase_migrations.schema_migrations (version, name, statements)
values ('${VERSION}', '${NOMBRE}', array['${literal}']);
commit;`);
  await sql(`notify pgrst, 'reload schema';`);
  const [ok] = await sql(
    `select (select count(*) from public.sucursales_ciudades)::int ciudades,
       (select count(*) from pg_proc where proname like 'sucursales_ciudad_%')::int funciones,
       (select count(*) from supabase_migrations.schema_migrations where version = '${VERSION}')::int registrada`,
  );
  console.log('aplicada:', JSON.stringify(ok));
}
