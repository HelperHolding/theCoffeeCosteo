import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { leerEnvLocal } from '../zoho/cliente';
import { limpiar, mapear } from '../../lib/crm/muestra';
import type { Ejecutor } from '../db/ejecutor';

/**
 * Ensayo remoto con ROLLBACK de las migraciones del CRM Unificado (docs/portal/MIGRACIONES-Y-DESPLIEGUE.md):
 * aplica los archivos EXACTOS del PR dentro de una transacción, corre comprobaciones dentro de ella y la REVIERTE
 * siempre. Después abre una conexión nueva y comprueba que no persistió nada. No escribe en la base.
 *
 * Con --con-muestra también ensaya, dentro de la MISMA transacción revertida, el mapeo de la muestra y la limpieza
 * (lib/crm/muestra.ts), para tener sus conteos reales sin escribir nada.
 *
 *   npx tsx scripts/crm/ensayo-migraciones.ts [desde=20261103000030] [--con-muestra]
 */
const desde = process.argv.slice(2).find((a) => /^\d{14}$/.test(a)) ?? '20261103000030';
const conMuestra = process.argv.includes('--con-muestra');

/** Ejecuta las funciones de muestra.ts dentro de la transacción del ensayo: sus begin/commit pasan a savepoints. */
const anidado = (c: pg.Client): Ejecutor => ({
  query: async <T,>(sql: string, params?: unknown[]) => {
    const t = sql.trim().toLowerCase();
    const real = t === 'begin' ? 'savepoint muestra' : t === 'commit' ? 'release savepoint muestra' : t === 'rollback' ? 'rollback to savepoint muestra' : sql;
    return (await c.query(real, params)) as unknown as { rows: T[] };
  },
});
const carpeta = join(import.meta.dirname, '../../supabase/migrations');

async function conectar(url: string) {
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: 'crm-unificado-ensayo' });
  await c.connect();
  return c;
}

async function main() {
  const url = (await leerEnvLocal()).get('DATABASE_URL');
  if (!url) throw new Error('Falta DATABASE_URL en .env.local');
  const archivos = (await readdir(carpeta)).filter((f) => f.endsWith('.sql') && f.slice(0, 14) >= desde).sort();
  if (!archivos.length) throw new Error('No hay migraciones que ensayar');
  const c = await conectar(url);
  const informe: Record<string, unknown> = { archivos };
  try {
    const antes = await c.query<{ ultima: string; n: number }>(
      'select max(version) ultima, count(*)::int n from supabase_migrations.schema_migrations',
    );
    informe.antes = antes.rows[0];
    if (antes.rows[0].ultima >= desde) throw new Error(`La base ya tiene la versión ${antes.rows[0].ultima}: revisa antes de ensayar`);
    await c.query('begin');
    // Que el ensayo no bloquee a nadie: si una tabla está ocupada, falla en vez de esperar.
    await c.query(`set local lock_timeout = '5s'`);
    await c.query(`set local statement_timeout = '120s'`);
    const tiempos: Record<string, number> = {};
    for (const a of archivos) {
      const t = Date.now();
      await c.query(await readFile(join(carpeta, a), 'utf8'));
      tiempos[a] = Date.now() - t;
    }
    informe.tiempos_ms = tiempos;
    const q = async (sql: string) => (await c.query(sql)).rows;
    informe.dentro = {
      etapas_generales: await q(`select count(*)::int n from crm_etapas where embudo = 'general'`),
      requisitos: await q('select count(*)::int n from crm_requisitos'),
      areas: await q('select clave, activa from crm_areas order by orden'),
      festivos: await q('select count(*)::int n from crm_festivos'),
      tablas_sin_rls: await q(`select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'crm_%' and not c.relrowsecurity`),
      grants_anon: await q(`select table_name from information_schema.role_table_grants
        where grantee = 'anon' and table_schema = 'public' and table_name like 'crm_%'`),
      sin_oauth: await q(`select count(*)::int n from pg_policies where schemaname = 'public' and policyname = 'crm_sin_oauth'`),
      triggers_historial: await q(`select count(*)::int n from pg_trigger where tgname like '%historial%' and not tgisinternal`),
      cron: await q(`select jobname, schedule from cron.job where jobname = 'crm-avisos-diarios'`).catch((e) => [{ error: String(e) }]),
      // Lo existente no cambia: mismas filas y la vista de candados lee sin error.
      tiendas: await q(`select embudo, count(*)::int n from crm_tiendas group by 1`),
      historial: await q('select count(*)::int n from crm_historial'),
      candados: await q('select count(*)::int n from crm_v_candados'),
      vencimientos: await q('select count(*)::int n from crm_v_vencimientos'),
      // La bitácora es inalterable también para el dueño de la tabla.
      historial_inalterable: await c
        .query(`savepoint s; update crm_historial set resumen = resumen where id = (select min(id) from crm_historial)`)
        .then(() => 'NO BLOQUEÓ')
        .catch((e: Error) => e.message)
        .finally(() => c.query('rollback to savepoint s')),
    };
    if (conMuestra) {
      const db = anidado(c);
      const m = await mapear(db);
      informe.mapeo = { ...m, candados_bloqueados: (await q(`select count(*)::int n from crm_v_candados where listos < total`))[0] };
      const l = await limpiar(db, { ensayo: false });
      informe.limpieza = { antes: l.antes, despues: l.despues, objetos_storage: l.rutas.length };
    }
  } finally {
    await c.query('rollback').catch(() => undefined);
    await c.end();
  }
  // Conexión nueva: nada persistió.
  const v = await conectar(url);
  try {
    informe.despues = {
      migraciones: (await v.query('select max(version) ultima, count(*)::int n from supabase_migrations.schema_migrations')).rows[0],
      crm_areas: (await v.query(`select to_regclass('public.crm_areas') is not null as existe`)).rows[0],
      etapas_generales: (await v.query(`select count(*)::int n from crm_etapas where embudo = 'general'`)).rows[0],
      pg_cron: (await v.query(`select count(*)::int n from pg_extension where extname = 'pg_cron'`)).rows[0],
    };
  } finally {
    await v.end();
  }
  console.log(JSON.stringify(informe, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
