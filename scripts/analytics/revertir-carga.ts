import { readFileSync } from 'node:fs';
import pg from 'pg';
import { leerEnvLocal } from '../zoho/cliente';
import { PROYECTO } from '../conciliacion/db-lectura';
import { revertirCarga, type Respaldo } from './persistencia';

/**
 * Revierte una aplicación de aplicar.ts usando su informe (fuera del repo): borra las lecturas de sus carga_id,
 * restaura las versiones previas que reemplazó y las tiendas como estaban. Una transacción.
 *
 * Uso: npx tsx scripts/analytics/revertir-carga.ts --informe <aplicar-supabase-....json> --confirmar jpqkmnfjwzniptszjuli
 */
const arg = (n: string) =>
  process.argv.includes(`--${n}`) ? process.argv[process.argv.indexOf(`--${n}`) + 1] : undefined;
if (arg('confirmar') !== PROYECTO) throw new Error(`Falta --confirmar ${PROYECTO}`);
const informe = JSON.parse(readFileSync(arg('informe')!, 'utf8')) as {
  resultado: string;
  cargas: string[];
  tiendas_carga: number[];
  respaldo: Respaldo;
};
if (informe.resultado !== 'commit' || !informe.respaldo)
  throw new Error('El informe no es de una carga confirmada con respaldo');
const url = (await leerEnvLocal()).get('DATABASE_URL');
if (!url) throw new Error('Falta DATABASE_URL');
const u = new URL(url);
if (!(u.username.endsWith(`.${PROYECTO}`) || u.hostname.includes(PROYECTO)))
  throw new Error('DATABASE_URL no es el proyecto esperado');
const c = new pg.Client({ connectionString: url, application_name: 'analytics-revertir-carga' });
await c.connect();
try {
  console.log(
    JSON.stringify(await revertirCarga(c as never, informe.cargas, informe.respaldo, informe.tiendas_carga)),
  );
} finally {
  await c.end();
}
