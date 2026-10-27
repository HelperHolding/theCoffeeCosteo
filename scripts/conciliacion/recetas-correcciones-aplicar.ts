import { mkdir, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { PROYECTO } from './db-lectura';
import { nombreDestino, resolverDestino } from './destino';
import { corregir, leerLoteRecetas, type ModoCorreccion } from './recetas-correcciones';

/**
 * Correcciones de recetas según el recetario oficial · CLI (lógica y verificaciones en recetas-correcciones.ts).
 * --usuario es obligatorio en todos los modos; --lote por defecto recetario-lote-1.
 *   ensayo (por defecto, termina en ROLLBACK):
 *     npx tsx scripts/conciliacion/recetas-correcciones-aplicar.ts --usuario <uuid>
 *   aplicar (exige confirmar el proyecto; aprobación aparte):
 *     npx tsx scripts/conciliacion/recetas-correcciones-aplicar.ts --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid>
 *   revertir una ejecución (solo celdas sin ediciones posteriores; aprobación aparte):
 *     npx tsx scripts/conciliacion/recetas-correcciones-aplicar.ts --revertir --ejecucion <uuid> --confirmo jpqkmnfjwzniptszjuli --usuario <uuid>
 *   --local <url>: copia en localhost (respaldo restaurado). No equivale a autorización remota.
 * DATABASE_URL se lee con el cargador existente, se valida con el parser contra el proyecto y nunca se imprime.
 * El informe (sin URL ni credenciales) se guarda en docs/conciliacion-brasil/21-informes/.
 */
const args = process.argv.slice(2);
const valor = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
if (args.includes('--aplicar') && args.includes('--revertir'))
  throw new Error('Usa --aplicar o --revertir, no ambos');
const modo: ModoCorreccion = args.includes('--aplicar')
  ? 'aplicar'
  : args.includes('--revertir')
    ? 'revertir'
    : 'ensayo';
const usuario = valor('--usuario');
if (!usuario) throw new Error('Falta --usuario <uuid> (perfil activo de operaciones o admin)');
const destino = await resolverDestino(valor('--local'));
if (destino.tipo === 'remoto' && modo !== 'ensayo' && valor('--confirmo') !== PROYECTO)
  throw new Error(`Para escribir hay que pasar --confirmo ${PROYECTO}`);

const manifiesto = await leerLoteRecetas(valor('--lote') ?? 'recetario-lote-1');
const c = new pg.Client({ connectionString: destino.url, application_name: `recetas-correcciones-${modo}` });
await c.connect();
try {
  const informe = await corregir(
    { query: (sql, p) => c.query(sql, p) as never, ejecutar: async (sql) => void (await c.query(sql)) },
    modo,
    manifiesto,
    { usuario, ejecucion: valor('--ejecucion') },
  );
  const registro = { fecha: new Date().toISOString(), destino: nombreDestino(destino), ...informe };
  const carpeta = 'docs/conciliacion-brasil/21-informes';
  await mkdir(carpeta, { recursive: true });
  const archivo = `${carpeta}/${registro.fecha.replace(/[:.]/g, '-')}-${registro.destino}-${manifiesto.lote}-${modo}.json`;
  await writeFile(archivo, JSON.stringify(registro, null, 1) + '\n');
  console.log(JSON.stringify(registro, null, 1));
  console.log(`Informe: ${archivo}`);
  if (informe.error) process.exitCode = 1;
} finally {
  await c.end();
}
