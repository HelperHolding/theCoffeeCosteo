import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { conLegado } from './conexion';
import {
  inventarioMarkdown,
  redactar,
  redactarProfundo,
  registrarUsos,
  type TablaLegado,
  type Usos,
} from './inventario-lib';

/**
 * Fase 0.1 · Esquema real de bliocjvq (solo catálogo, ninguna fila) e inventario de tablas con quién las usa.
 *   npx tsx scripts/migracion-legado/inventario.ts <ruta del repo thecoffee-comercializadora>
 * Escribe docs/migracion/esquema-legado.json y docs/migracion/inventario-tablas.md.
 */
const repo = process.argv[2];
if (!repo) throw new Error('Uso: inventario.ts <ruta del repo thecoffee-comercializadora>');

async function archivos(dir: string, ext: RegExp): Promise<string[]> {
  const salida: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const ruta = join(dir, e.name);
    if (e.isDirectory()) salida.push(...(await archivos(ruta, ext)));
    else if (ext.test(e.name)) salida.push(ruta);
  }
  return salida;
}

const usos: Usos = new Map();
registrarUsos(usos, await readFile(join(repo, 'app/index.html'), 'utf8'), 'app');
const funciones = join(repo, 'supabase/functions');
for (const f of await archivos(funciones, /\.ts$/))
  registrarUsos(usos, await readFile(f, 'utf8'), `edge:${relative(funciones, f).split(/[\\/]/)[0]}`);
for (const f of await archivos(join(repo, 'netlify'), /\.(mjs|js|gs)$/))
  registrarUsos(usos, await readFile(f, 'utf8'), `netlify:${basename(f)}`);

const esquema = await conLegado(async (db) => {
  const q = async (sql: string) => (await db.query(sql)).rows;
  const tablas = (
    await db.query<{ tabla: string; tipo: string; rls: boolean }>(`
      select c.relname as tabla, c.relkind as tipo, c.relrowsecurity as rls
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') order by 1`)
  ).rows;
  const conteos: Record<string, number> = {};
  for (const t of tablas.filter((t) => t.tipo === 'r' || t.tipo === 'p'))
    conteos[t.tabla] = Number(
      (await db.query<{ n: string }>(`select count(*)::bigint as n from public."${t.tabla.replace(/"/g, '""')}"`))
        .rows[0].n,
    );
  return {
    tablas,
    conteos,
    columnas: await q(`
      select table_name as tabla, column_name as col, data_type as tipo, is_nullable as nulo, column_default as defecto
      from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`),
    restricciones: await q(`
      select conrelid::regclass::text as tabla, conname as nombre, pg_get_constraintdef(oid) as def
      from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
    indices: await q(`
      select tablename as tabla, indexname as indice, indexdef as def from pg_indexes
      where schemaname = 'public' order by 1, 2`),
    politicas: await q(`
      select tablename as tabla, policyname as politica, cmd, roles::text as roles, qual, with_check
      from pg_policies where schemaname = 'public' order by 1, 2`),
    funciones: (
      await db.query<{ nombre: string; args: string; security_definer: boolean; def: string }>(`
        select p.proname as nombre, pg_get_function_identity_arguments(p.oid) as args,
               p.prosecdef as security_definer, pg_get_functiondef(p.oid) as def
        from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1, 2`)
    ).rows.map((f) => ({ ...f, def: redactar(f.def) })),
    triggers: await q(`
      select event_object_table as tabla, trigger_name as nombre, action_timing as momento,
             event_manipulation as evento, action_statement as accion
      from information_schema.triggers where trigger_schema = 'public' order by 1, 2`),
    // Al final: si pg_cron no existe, la consulta aborta la transacción y ya no queda nada por leer.
    cron: await q(`select jobname, schedule, command, active from cron.job order by jobname`)
      .then((filas) => filas.map((f) => ({ ...f, command: redactar(String(f.command)) })))
      .catch(() => [] as Record<string, unknown>[]),
  };
});

const fecha = new Date().toISOString().slice(0, 10);
const tablas: TablaLegado[] = esquema.tablas
  .filter((t) => t.tipo === 'r' || t.tipo === 'p')
  .map((t) => ({ tabla: t.tabla, filas: esquema.conteos[t.tabla] ?? 0, rls: t.rls }));
await mkdir('docs/migracion', { recursive: true });
// Redacción sobre TODO el esquema (defaults, políticas, triggers, funciones, cron), no solo algunos campos.
await writeFile(
  'docs/migracion/esquema-legado.json',
  `${JSON.stringify(redactarProfundo({ fecha, ...esquema }), null, 2)}\n`,
);
await writeFile('docs/migracion/inventario-tablas.md', inventarioMarkdown(tablas, usos, fecha));
console.log(`Inventario: ${tablas.length} tablas, ${usos.size} referenciadas en código. Revisa el JSON antes de commitear.`);
