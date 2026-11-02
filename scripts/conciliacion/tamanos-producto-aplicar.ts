import { mkdir, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { PROYECTO } from './db-lectura';
import { nombreDestino, resolverDestino } from './destino';
import { aplicarTamanos, docTamanos, leerLoteTamanos, type ModoTamanos } from './tamanos-producto';

/**
 * Cambio de tamaños de un producto (doc 42) · CLI (lógica y verificaciones en tamanos-producto.ts). --usuario y
 * --lote son obligatorios.
 *   ensayo (por defecto, termina en ROLLBACK):
 *     npx tsx scripts/conciliacion/tamanos-producto-aplicar.ts --lote <lote> --usuario <uuid>
 *   aplicar (exige confirmar el proyecto; aprobación aparte):
 *     npx tsx scripts/conciliacion/tamanos-producto-aplicar.ts --lote <lote> --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid>
 *   revertir una ejecución (aprobación aparte):
 *     npx tsx scripts/conciliacion/tamanos-producto-aplicar.ts --lote <lote> --revertir --ejecucion <uuid> --confirmo jpqkmnfjwzniptszjuli --usuario <uuid>
 *   --local <url>: copia en localhost (respaldo restaurado). No equivale a autorización remota.
 *   --informes <carpeta>: dónde guardar el informe (por omisión docs/conciliacion-brasil/<doc>-informes/).
 * DATABASE_URL se lee con el cargador existente, se valida con el parser contra el proyecto y nunca se imprime.
 */
const args = process.argv.slice(2);
const valor = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
if (args.includes('--aplicar') && args.includes('--revertir'))
  throw new Error('Usa --aplicar o --revertir, no ambos');
const modo: ModoTamanos = args.includes('--aplicar')
  ? 'aplicar'
  : args.includes('--revertir')
    ? 'revertir'
    : 'ensayo';
const usuario = valor('--usuario');
if (!usuario) throw new Error('Falta --usuario <uuid> (perfil activo de admin)');
const lote = valor('--lote');
if (!lote) throw new Error('Falta --lote <nombre> (un lote de LOTES_TAMANOS_APROBADOS)');
const destino = await resolverDestino(valor('--local'));
if (destino.tipo === 'remoto' && modo !== 'ensayo' && valor('--confirmo') !== PROYECTO)
  throw new Error(`Para escribir hay que pasar --confirmo ${PROYECTO}`);

const manifiesto = await leerLoteTamanos(lote);
const c = new pg.Client({ connectionString: destino.url, application_name: `tamanos-producto-${modo}` });
await c.connect();
try {
  const informe = await aplicarTamanos(
    { query: (sql, p) => c.query(sql, p) as never, ejecutar: async (sql) => void (await c.query(sql)) },
    modo,
    manifiesto,
    { usuario, ejecucion: valor('--ejecucion') },
  );
  const registro = { fecha: new Date().toISOString(), destino: nombreDestino(destino), ...informe };
  const carpeta = valor('--informes') ?? `docs/conciliacion-brasil/${docTamanos(manifiesto.lote)}-informes`;
  await mkdir(carpeta, { recursive: true });
  const archivo = `${carpeta}/${registro.fecha.replace(/[:.]/g, '-')}-${registro.destino}-${manifiesto.lote}-${modo}.json`;
  await writeFile(archivo, JSON.stringify(registro, null, 1) + '\n');
  console.log(JSON.stringify({ ...registro, usuario: undefined }, null, 1));
  console.log(`Informe: ${archivo}`);
  if (informe.error) process.exitCode = 1;
} finally {
  await c.end();
}
