import { mkdir, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { leerEnvLocal } from '../zoho/cliente';
import { PROYECTO } from './db-lectura';
import { leerLista, renombrar, type ModoRenombre } from './renombres-b';

/**
 * Decisiones B1–B6 · CLI del renombre de recetas (lógica y verificaciones en renombres-b.ts).
 *   ensayo (por defecto, termina en ROLLBACK), por receta con --solo:
 *     npx tsx scripts/conciliacion/renombres-b-aplicar.ts [--solo B1,B4]
 *   aplicar / revertir (exigen confirmar el proyecto):
 *     npx tsx scripts/conciliacion/renombres-b-aplicar.ts --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid>
 *     npx tsx scripts/conciliacion/renombres-b-aplicar.ts --revertir --confirmo jpqkmnfjwzniptszjuli --usuario <uuid>
 *   --usuario <uuid>: obligatorio al aplicar o revertir; perfil activo de operaciones/admin al que se atribuyen
 *   updated_by y la bitácora (en ensayo es opcional y, sin él, quedan en null).
 *   --local <url>: en lugar del proyecto, una copia en localhost (respaldo restaurado); no exige --confirmo.
 * DATABASE_URL se lee con el cargador existente, se verifica contra el proyecto y nunca se imprime.
 * Cada corrida guarda su informe en docs/conciliacion-brasil/19-renombres/ (fecha, modo, destino).
 */
const args = process.argv.slice(2);
const valor = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
if (args.includes('--aplicar') && args.includes('--revertir'))
  throw new Error('Usa --aplicar o --revertir, no ambos');
const modo: ModoRenombre = args.includes('--aplicar')
  ? 'aplicar'
  : args.includes('--revertir')
    ? 'revertir'
    : 'ensayo';
const local = valor('--local');

let url: string;
let destino: string;
if (local) {
  const h = new URL(local).hostname;
  if (!['localhost', '127.0.0.1', '[::1]'].includes(h)) throw new Error('--local solo acepta localhost');
  url = local;
  destino = 'local';
} else {
  if (modo !== 'ensayo' && valor('--confirmo') !== PROYECTO)
    throw new Error(`Para escribir hay que pasar --confirmo ${PROYECTO}`);
  const u = (await leerEnvLocal()).get('DATABASE_URL');
  if (!u) throw new Error('Falta DATABASE_URL en .env.local');
  const p = new URL(u);
  if (!(p.username.endsWith(`.${PROYECTO}`) || p.hostname.includes(PROYECTO)))
    throw new Error(`DATABASE_URL no corresponde al proyecto ${PROYECTO}; no se conecta`);
  url = u;
  destino = PROYECTO;
}

const lista = await leerLista();
const c = new pg.Client({ connectionString: url, application_name: `renombres-b-${modo}` });
await c.connect();
try {
  const informe = await renombrar(
    { query: (sql, p) => c.query(sql, p) as never, ejecutar: async (sql) => void (await c.query(sql)) },
    modo,
    lista,
    { solo: valor('--solo')?.split(','), usuario: valor('--usuario') },
  );
  const registro = { fecha: new Date().toISOString(), destino, ...informe };
  await mkdir('docs/conciliacion-brasil/19-renombres', { recursive: true });
  const archivo = `docs/conciliacion-brasil/19-renombres/${registro.fecha.replace(/[:.]/g, '-')}-${destino}-${modo}.json`;
  await writeFile(archivo, JSON.stringify(registro, null, 1) + '\n');
  console.log(JSON.stringify(registro, null, 1));
  console.log(`Informe: ${archivo}`);
  if (informe.error) process.exitCode = 1;
} finally {
  await c.end();
}
