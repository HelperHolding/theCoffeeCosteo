import { mkdir, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { PROYECTO } from './db-lectura';
import { nombreDestino, resolverDestino } from './destino';
import { archivos22, migracion22, type Modo22 } from './migracion-22';

/**
 * Migración 22 · CLI (lógica y verificaciones en migracion-22.ts).
 *   ensayo (por defecto, termina en ROLLBACK):
 *     npx tsx scripts/conciliacion/migracion-22-aplicar.ts
 *   aplicar / revertir (exigen confirmar el proyecto; cada uno con su propia aprobación):
 *     npx tsx scripts/conciliacion/migracion-22-aplicar.ts --aplicar --confirmo jpqkmnfjwzniptszjuli
 *     npx tsx scripts/conciliacion/migracion-22-aplicar.ts --revertir --confirmo jpqkmnfjwzniptszjuli
 *   --local <url>: copia en localhost (respaldo restaurado). No equivale a autorización remota.
 * DATABASE_URL se lee con el cargador existente, se valida con el parser contra el proyecto y nunca se imprime.
 * El informe (sin URL ni credenciales) se guarda en docs/conciliacion-brasil/17-informes/.
 */
const args = process.argv.slice(2);
const valor = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
if (args.includes('--aplicar') && args.includes('--revertir'))
  throw new Error('Usa --aplicar o --revertir, no ambos');
const modo: Modo22 = args.includes('--aplicar')
  ? 'aplicar'
  : args.includes('--revertir')
    ? 'revertir'
    : 'ensayo';
const destino = await resolverDestino(valor('--local'));
if (destino.tipo === 'remoto' && modo !== 'ensayo' && valor('--confirmo') !== PROYECTO)
  throw new Error(`Para escribir hay que pasar --confirmo ${PROYECTO}`);

const c = new pg.Client({ connectionString: destino.url, application_name: `migracion-22-${modo}` });
await c.connect();
try {
  const informe = await migracion22(
    { query: (sql, p) => c.query(sql, p) as never, ejecutar: async (sql) => void (await c.query(sql)) },
    modo,
    await archivos22(),
  );
  const registro = { fecha: new Date().toISOString(), destino: nombreDestino(destino), ...informe };
  await mkdir('docs/conciliacion-brasil/17-informes', { recursive: true });
  const archivo = `docs/conciliacion-brasil/17-informes/${registro.fecha.replace(/[:.]/g, '-')}-${registro.destino}-migracion22-${modo}.json`;
  await writeFile(archivo, JSON.stringify(registro, null, 1) + '\n');
  console.log(JSON.stringify(registro, null, 1));
  console.log(`Informe: ${archivo}`);
  if (informe.error) process.exitCode = 1;
} finally {
  await c.end();
}
