import pg from 'pg';
import { leerEnvLocal } from '../zoho/cliente';

/**
 * Fase 2 · Conexión de SOLO LECTURA a Supabase para diagnóstico.
 * - Lee DATABASE_URL con el cargador existente y nunca la imprime.
 * - Verifica que apunte al proyecto esperado antes de conectar.
 * - Cada consulta corre en BEGIN READ ONLY con statement_timeout y se cierra con ROLLBACK.
 */
export const PROYECTO = 'jpqkmnfjwzniptszjuli';

export async function conLectura<T>(fn: (q: (sql: string, p?: unknown[]) => Promise<pg.QueryResult>) => Promise<T>) {
  const url = (await leerEnvLocal()).get('DATABASE_URL');
  if (!url) throw new Error('Falta DATABASE_URL en .env.local');
  const u = new URL(url);
  const coincide = u.username.endsWith(`.${PROYECTO}`) || u.hostname.includes(PROYECTO);
  if (!coincide) throw new Error(`DATABASE_URL no corresponde al proyecto ${PROYECTO}; no se conecta`);
  const region = /^aws-\d+-([a-z0-9-]+)\.pooler\.supabase\.com$/.exec(u.hostname)?.[1] ?? 'no expuesta en el host';
  const c = new pg.Client({ connectionString: url, application_name: 'conciliacion-fase2-lectura' });
  await c.connect();
  try {
    await c.query('begin read only');
    await c.query("set local statement_timeout = '15s'");
    await c.query("set local idle_in_transaction_session_timeout = '60s'");
    const r = await fn((sql, p) => c.query(sql, p as unknown[]));
    return { region, resultado: r };
  } finally {
    await c.query('rollback').catch(() => {});
    await c.end();
  }
}
