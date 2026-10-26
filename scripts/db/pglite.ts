import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Postgres en proceso con el shim de Supabase y las migraciones aplicadas en orden.
 * `hasta` (versión, p. ej. '20261023000021') reproduce un estado anterior, como el de producción.
 */
export async function crearDbLocal(hasta?: string): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(readFileSync(join(raiz, 'scripts/db/shim-supabase.sql'), 'utf8'));
  const carpeta = join(raiz, 'supabase/migrations');
  const archivos = readdirSync(carpeta)
    .filter((f) => f.endsWith('.sql') && (!hasta || f.slice(0, 14) <= hasta))
    .sort();
  for (const archivo of archivos) {
    await db.exec(readFileSync(join(carpeta, archivo), 'utf8'));
  }
  return db;
}
