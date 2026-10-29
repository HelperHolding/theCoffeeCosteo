import { mkdir, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { PROYECTO } from './db-lectura';
import { nombreDestino, resolverDestino } from './destino';
import { DOC_LOTE, enlazar, leerLoteAprobado, type ModoEnlaces } from './enlaces-pos';

/**
 * Lotes de códigos POS · CLI (lógica y verificaciones en enlaces-pos.ts). --usuario es obligatorio en todos los modos.
 *   --lote <nombre>: lote aprobado en LOTES_APROBADOS (manifiesto con huella fijada); por defecto lote-1.
 *   ensayo (por defecto, termina en ROLLBACK):
 *     npx tsx scripts/conciliacion/enlaces-pos-aplicar.ts --usuario <uuid>
 *   aplicar (exige confirmar el proyecto; aprobación aparte):
 *     npx tsx scripts/conciliacion/enlaces-pos-aplicar.ts --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid>
 *   revertir una carga (solo sus filas intactas; aprobación aparte):
 *     npx tsx scripts/conciliacion/enlaces-pos-aplicar.ts --revertir --carga <carga_id> --confirmo jpqkmnfjwzniptszjuli --usuario <uuid>
 *   --local <url>: copia en localhost (respaldo restaurado). No equivale a autorización remota.
 * DATABASE_URL se lee con el cargador existente, se valida con el parser contra el proyecto y nunca se imprime.
 * Aplicar y revertir exigen --lote explícito (sin lote por omisión al escribir).
 * El informe (sin URL ni credenciales) se guarda en docs/conciliacion-brasil/<doc>-informes/ según DOC_LOTE
 * (17 lote 1, 20 lote 2, 26 lote 3, 28 lote 4, 36 lote 5, 38 lote 6, 39 lote 7).
 */
const args = process.argv.slice(2);
const valor = (f: string) => (args.includes(f) ? args[args.indexOf(f) + 1] : undefined);
if (args.includes('--aplicar') && args.includes('--revertir'))
  throw new Error('Usa --aplicar o --revertir, no ambos');
const modo: ModoEnlaces = args.includes('--aplicar')
  ? 'aplicar'
  : args.includes('--revertir')
    ? 'revertir'
    : 'ensayo';
const usuario = valor('--usuario');
if (!usuario) throw new Error('Falta --usuario <uuid> (perfil activo de operaciones o admin)');
const destino = await resolverDestino(valor('--local'));
if (destino.tipo === 'remoto' && modo !== 'ensayo' && valor('--confirmo') !== PROYECTO)
  throw new Error(`Para escribir hay que pasar --confirmo ${PROYECTO}`);

if (modo !== 'ensayo' && !valor('--lote'))
  throw new Error('Aplicar o revertir exige --lote <nombre> explícito');
const aprobado = await leerLoteAprobado(valor('--lote') ?? 'lote-1');
if (!DOC_LOTE[aprobado.nombre])
  throw new Error(`El lote «${aprobado.nombre}» no tiene documento en DOC_LOTE`);
const c = new pg.Client({ connectionString: destino.url, application_name: `enlaces-pos-${modo}` });
await c.connect();
try {
  const informe = await enlazar(
    { query: (sql, p) => c.query(sql, p) as never, ejecutar: async (sql) => void (await c.query(sql)) },
    modo,
    aprobado.lote,
    { usuario, carga: valor('--carga'), lote: aprobado.nombre, previos: aprobado.previos },
  );
  const registro = { fecha: new Date().toISOString(), destino: nombreDestino(destino), ...informe };
  const carpeta = `docs/conciliacion-brasil/${DOC_LOTE[aprobado.nombre]}-informes`;
  await mkdir(carpeta, { recursive: true });
  const archivo = `${carpeta}/${registro.fecha.replace(/[:.]/g, '-')}-${registro.destino}-${aprobado.nombre}-${modo}.json`;
  await writeFile(archivo, JSON.stringify(registro, null, 1) + '\n');
  console.log(
    JSON.stringify(
      { ...registro, enlaces: registro.enlaces.filter((e) => e.problemas.length).slice(0, 20) },
      null,
      1,
    ),
  );
  console.log(`Informe completo: ${archivo}`);
  if (informe.error) process.exitCode = 1;
} finally {
  await c.end();
}
