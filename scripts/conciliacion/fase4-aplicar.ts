import pg from 'pg';
import { leerEnvLocal } from '../zoho/cliente';
import { PROYECTO } from './db-lectura';
import { archivosFase4, fase4, type Modo } from './fase4';

/**
 * Fase 4 · CLI de la migración 21 sobre el proyecto real (lógica y verificaciones en fase4.ts).
 *   ensayo (por defecto, termina en ROLLBACK):
 *     npx tsx scripts/conciliacion/fase4-aplicar.ts
 *   aplicar / revertir (exigen confirmar el proyecto):
 *     npx tsx scripts/conciliacion/fase4-aplicar.ts --aplicar --confirmo jpqkmnfjwzniptszjuli
 *     npx tsx scripts/conciliacion/fase4-aplicar.ts --revertir --confirmo jpqkmnfjwzniptszjuli
 * DATABASE_URL se lee con el cargador existente, se verifica contra el proyecto y nunca se imprime.
 */
const args = process.argv.slice(2);
const modo: Modo = args.includes('--aplicar') ? 'aplicar' : args.includes('--revertir') ? 'revertir' : 'ensayo';
if (args.includes('--aplicar') && args.includes('--revertir')) throw new Error('Usa --aplicar o --revertir, no ambos');
const confirmo = args.includes('--confirmo') ? args[args.indexOf('--confirmo') + 1] : null;
if (modo !== 'ensayo' && confirmo !== PROYECTO) throw new Error(`Para escribir hay que pasar --confirmo ${PROYECTO}`);

const url = (await leerEnvLocal()).get('DATABASE_URL');
if (!url) throw new Error('Falta DATABASE_URL en .env.local');
const u = new URL(url);
if (!(u.username.endsWith(`.${PROYECTO}`) || u.hostname.includes(PROYECTO)))
  throw new Error(`DATABASE_URL no corresponde al proyecto ${PROYECTO}; no se conecta`);

const archivos = await archivosFase4();
const c = new pg.Client({ connectionString: url, application_name: `conciliacion-fase4-${modo}` });
await c.connect();
try {
  const informe = await fase4(
    { query: (sql, p) => c.query(sql, p) as never, ejecutar: async (sql) => void (await c.query(sql)) },
    modo,
    archivos,
  );
  console.log(JSON.stringify(informe, null, 1));
  if (informe.error) process.exitCode = 1;
} finally {
  await c.end();
}
