import { mkdir, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { PROYECTO } from '../conciliacion/db-lectura';
import { nombreDestino, resolverDestino } from '../conciliacion/destino';
import { archivos23, migracion23, type Modo23 } from './migracion-23';

/**
 * Migración 23 (Analytics) · CLI (lógica y verificaciones en migracion-23.ts).
 *   ensayo (por defecto, termina en ROLLBACK; no deja nada):
 *     npx tsx scripts/analytics/migracion-23-aplicar.ts
 *   aplicar / revertir (exigen confirmar el proyecto; cada uno con su propia aprobación):
 *     npx tsx scripts/analytics/migracion-23-aplicar.ts --aplicar --confirmo jpqkmnfjwzniptszjuli
 *     npx tsx scripts/analytics/migracion-23-aplicar.ts --revertir --confirmo jpqkmnfjwzniptszjuli
 *   --local <url>: copia en localhost. No equivale a autorización remota.
 * DATABASE_URL se lee con el cargador existente, se valida contra el proyecto y nunca se imprime.
 * El informe (sin URL ni credenciales ni datos de ventas) se guarda en docs/analytics-zoho/informes/.
 */
const args = process.argv.slice(2);
const valor = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
if (args.includes('--aplicar') && args.includes('--revertir'))
  throw new Error('Usa --aplicar o --revertir, no ambos');
const modo: Modo23 = args.includes('--aplicar')
  ? 'aplicar'
  : args.includes('--revertir')
    ? 'revertir'
    : 'ensayo';
const destino = await resolverDestino(valor('--local'));
if (destino.tipo === 'remoto' && modo !== 'ensayo' && valor('--confirmo') !== PROYECTO)
  throw new Error(`Para escribir hay que pasar --confirmo ${PROYECTO}`);

const c = new pg.Client({ connectionString: destino.url, application_name: `migracion-23-${modo}` });
await c.connect();
try {
  const informe = await migracion23(
    { query: (sql, p) => c.query(sql, p) as never, ejecutar: async (sql) => void (await c.query(sql)) },
    modo,
    await archivos23(),
  );
  const registro = { fecha: new Date().toISOString(), destino: nombreDestino(destino), ...informe };
  await mkdir('docs/analytics-zoho/informes', { recursive: true });
  const archivo = `docs/analytics-zoho/informes/${registro.fecha.replace(/[:.]/g, '-')}-${registro.destino}-migracion23-${modo}.json`;
  await writeFile(archivo, JSON.stringify(registro, null, 1) + '\n');
  console.log(JSON.stringify(registro, null, 1));
  console.log(`Informe: ${archivo}`);
  if (informe.error) process.exitCode = 1;
} finally {
  await c.end();
}
