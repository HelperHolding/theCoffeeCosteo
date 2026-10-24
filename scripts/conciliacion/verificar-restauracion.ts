import pg from 'pg';
import { conLectura } from './db-lectura';
import { capturar, diferencias } from './fase4';

/**
 * Fase 4 · Verifica que el respaldo lógico restaurado en un Postgres LOCAL aislado reproduce el proyecto real.
 * Compara (sin imprimir datos): filas y md5 del contenido de cada tabla, políticas y funciones completas (firma,
 * cuerpo, dueño, SECURITY DEFINER, config, ACL), roles y membresías, secuencias y la huella de v_resumen bajo RLS.
 *   npx tsx scripts/conciliacion/verificar-restauracion.ts postgres://postgres@localhost:55432/postgres
 */
const local = process.argv[2];
if (!local || !/@(localhost|127\.0\.0\.1)[:/]/.test(local)) throw new Error('La copia de verificación debe ser local');
const ESQUEMAS = ['public', 'auth', 'storage', 'realtime', 'supabase_migrations', 'vault', 'zoho_staging'];

type Q = (sql: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
async function huellas(q: Q) {
  // Mismo formato de texto en ambas bases (fechas, números, bytea): si no, el md5 cambia sin que cambien los datos.
  for (const s of ["timezone = 'UTC'", "datestyle = 'ISO, MDY'", 'extra_float_digits = 1', "intervalstyle = 'postgres'", "bytea_output = 'hex'"])
    await q(`set ${s}`);
  const tablas = (
    await q(
      `select n.nspname as esquema, c.relname as tabla from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind in ('r', 'p') and n.nspname = any($1) order by 1, 2`,
      [ESQUEMAS],
    )
  ).rows as { esquema: string; tabla: string }[];
  const t: Record<string, string> = {};
  for (const { esquema, tabla } of tablas) {
    const r = (
      await q(`select count(*)::int as n, coalesce(md5(string_agg(x::text, '|' order by x::text)), '-') as h
               from ${pg.escapeIdentifier(esquema)}.${pg.escapeIdentifier(tabla)} x`)
    ).rows[0];
    t[`${esquema}.${tabla}`] = `${r.n}:${r.h}`;
  }
  const roles = (
    await q(`select rolname, rolsuper, rolinherit, rolcreaterole, rolcreatedb, rolcanlogin, rolreplication, rolbypassrls
             from pg_roles where rolname !~ '^pg_' order by 1`)
  ).rows;
  const membresias = (
    await q(`select r.rolname as rol, m.rolname as miembro, a.admin_option from pg_auth_members a
             join pg_roles r on r.oid = a.roleid join pg_roles m on m.oid = a.member
             where m.rolname !~ '^pg_' order by 1, 2`)
  ).rows;
  const secuencias = (
    await q(`select schemaname || '.' || sequencename as s, last_value::text as v from pg_sequences
             where schemaname = any($1) order by 1`, [ESQUEMAS])
  ).rows;
  // Huella de v_resumen bajo RLS, como un admin activo (misma consulta en ambas bases).
  await q('begin');
  const uid = (await q(`select user_id from public.perfiles where activo and rol = 'admin' order by user_id limit 1`)).rows[0]?.user_id;
  await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await q('set local role authenticated');
  const rls = (await q(`select count(*)::int as n, md5(string_agg(t::text, '|' order by producto_id, tamano_id, canal_id)) as h
                        from public.v_resumen t`)).rows[0];
  await q('rollback');
  return { tablas: t, roles, membresias, secuencias, rls };
}

const { resultado: prod } = await conLectura(async (q) => ({
  estado: await capturar({ query: (sql, p) => q(sql, p) as never }),
  // conLectura ya abrió BEGIN READ ONLY: las huellas usan SAVEPOINT en lugar de su propio begin/rollback.
  huellas: await huellas(async (sql, p) => {
    const s = sql === 'begin' ? 'savepoint h' : sql === 'rollback' ? 'rollback to savepoint h' : sql;
    return q(s, p);
  }),
}));

const c = new pg.Client({ connectionString: local });
await c.connect();
const loc = {
  estado: await capturar({ query: (sql, p) => c.query(sql, p) as never }),
  huellas: await huellas((sql, p) => c.query(sql, p)),
};
await c.end();

const claves = [...new Set([...Object.keys(prod.huellas.tablas), ...Object.keys(loc.huellas.tablas)])].sort();
const tablasDistintas = claves.filter((k) => prod.huellas.tablas[k] !== loc.huellas.tablas[k]);
const filas = (h: Record<string, string>) => Object.values(h).reduce((s, v) => s + Number(v.split(':')[0]), 0);
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const rolesDistintos = (prod.huellas.roles as { rolname: string }[])
  .filter((r) => !igual(r, (loc.huellas.roles as { rolname: string }[]).find((x) => x.rolname === r.rolname)))
  .map((r) => r.rolname);
console.log(
  JSON.stringify(
    {
      tablas: { prod: Object.keys(prod.huellas.tablas).length, local: Object.keys(loc.huellas.tablas).length },
      filas: { prod: filas(prod.huellas.tablas), local: filas(loc.huellas.tablas) },
      tablasDistintas: tablasDistintas.map((k) => ({
        tabla: k,
        prod: prod.huellas.tablas[k]?.split(':')[0] ?? 'ausente',
        local: loc.huellas.tablas[k]?.split(':')[0] ?? 'ausente',
      })),
      politicasYFunciones: diferencias(loc.estado, prod.estado),
      rolesDistintos,
      membresiasIguales: igual(prod.huellas.membresias, loc.huellas.membresias),
      secuenciasIguales: igual(prod.huellas.secuencias, loc.huellas.secuencias),
      v_resumenRls: { prod: prod.huellas.rls, local: loc.huellas.rls },
    },
    null,
    1,
  ),
);
