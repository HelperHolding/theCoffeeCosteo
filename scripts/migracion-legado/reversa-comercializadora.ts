import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TABLAS_COM } from './comercializadora-lib';
import { conLegado, conPortalLectura } from './conexion';
import { columnasEscribibles, deltaTabla, type Fila, leerFilas, reporteReversa, sqlReversa } from './reversa-comercializadora-lib';

/**
 * Plan 4 · Reversa: lo editable del portal → SQL para bliocjvq. Solo lee los dos lados; NO escribe en ninguno.
 *   npx tsx scripts/migracion-legado/reversa-comercializadora.ts [--salida=<archivo .sql>]
 * El archivo (fuera del repo: trae datos) se pega completo en el SQL Editor de bliocjvq. Imprime solo conteos.
 */
const salida =
  process.argv.find((a) => a.startsWith('--salida='))?.slice('--salida='.length) ??
  join(tmpdir(), `reversa-comercializadora-${new Date().toISOString().slice(0, 10)}.sql`);
const tablas = TABLAS_COM.filter((t) => t.editable);

const viejo = await conLegado(async (db) => {
  const m = new Map<string, { cols: string[]; filas: Fila[] }>();
  for (const t of tablas) m.set(t.tabla, { cols: await columnasEscribibles(db, t.tabla), filas: await leerFilas(db, t.tabla) });
  return m;
});
const portal = await conPortalLectura(async (db) => {
  const m = new Map<string, Fila[]>();
  for (const t of tablas) m.set(t.tabla, await leerFilas(db, t.tabla));
  return m;
});
const deltas = tablas.map((t) => deltaTabla(t, viejo.get(t.tabla)!.cols, portal.get(t.tabla)!, viejo.get(t.tabla)!.filas));
console.log(reporteReversa(deltas));
const sql = sqlReversa(deltas, new Date().toISOString());
if (!sql) console.log('\nSin cambios: bliocjvq ya tiene lo mismo que el portal en las tablas editables.');
else {
  writeFileSync(salida, sql);
  console.log(`\nSQL escrito en ${salida}. Pégalo completo en el SQL Editor de bliocjvq y bórralo después.`);
}
