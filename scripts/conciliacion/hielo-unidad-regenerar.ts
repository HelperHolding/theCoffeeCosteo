import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';
import { nombreDestino, resolverDestino } from './destino';
import { regenerarVersiones, type ManifiestoHielo } from './hielo-unidad';

/**
 * Regenera un manifiesto de H2 contra las versiones vigentes, SOLO LECTURA (doc 23 §4). Uso:
 *   npx tsx scripts/conciliacion/hielo-unidad-regenerar.ts --manifiesto <ruta> --salida <ruta> [--local <url>]
 * Escribe el manifiesto nuevo en --salida (borrador) e imprime qué versiones cambiaron; revisar con `git diff`.
 * No registra el lote como aprobado ni escribe en la base.
 */
const args = process.argv.slice(2);
const valor = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};
const [entrada, salida] = [valor('--manifiesto'), valor('--salida')];
if (!entrada || !salida) throw new Error('Uso: --manifiesto <ruta> --salida <ruta> [--local <url>]');

const destino = await resolverDestino(valor('--local'));
const m = JSON.parse((await readFile(entrada, 'utf8')).replace(/^\uFEFF/, '')) as ManifiestoHielo;
const c = new pg.Client({ connectionString: destino.url, application_name: 'hielo-unidad-regenerar' });
await c.connect();
try {
  const r = await regenerarVersiones(
    { query: (s, p) => c.query(s, p as unknown[]) as never, ejecutar: async (s) => void (await c.query(s)) },
    m,
  );
  await writeFile(salida, JSON.stringify(r.manifiesto, null, 1) + '\n');
  console.log(
    JSON.stringify(
      { destino: nombreDestino(destino), lote: m.lote, versionesNuevas: r.cambios, salida },
      null,
      1,
    ),
  );
} finally {
  await c.end();
}
