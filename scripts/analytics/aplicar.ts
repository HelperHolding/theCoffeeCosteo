import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { crearDbLocal } from '../db/pglite';
import { leerEnvLocal } from '../zoho/cliente';
import { PROYECTO } from '../conciliacion/db-lectura';
import type { LecturaDiaria } from '../../lib/analytics/contrato';
import { aplicarCarga, ErrorConciliacion, type Db, type TiendaAnalytics } from './persistencia';
import { SALIDA_PREDETERMINADA } from './salida';

/**
 * Aplica tiendas y lecturas (de extraer-pos / extraer-rappi-zoho) en UNA transacción y concilia lo guardado
 * contra los archivos en sus claves exactas; cualquier diferencia → ROLLBACK (persistencia.aplicarCarga).
 * - `--destino ensayo` (por defecto): Postgres local (PGlite) con TODAS las migraciones del repo.
 * - `--destino supabase --confirmar <proyecto>`: base de DATABASE_URL. Requiere la migración 23 y aprobación.
 * Los informes (con agregados reales) se escriben FUERA del repo.
 *
 * Uso: npx tsx scripts/analytics/aplicar.ts --tiendas <tiendas.json> --lecturas <a.json> [--lecturas <b.json>]
 *        [--destino ensayo|supabase] [--confirmar jpqkmnfjwzniptszjuli] [--salida <carpeta>]
 */
const valores = (n: string) => process.argv.flatMap((a, i) => (a === `--${n}` ? [process.argv[i + 1]] : []));
const arg = (n: string, d?: string) => valores(n)[0] ?? d;
const destino = arg('destino', 'ensayo');
const tiendas = JSON.parse(readFileSync(arg('tiendas')!, 'utf8')) as {
  verificado_en: string;
  incluidas: TiendaAnalytics[];
};
const lecturas: LecturaDiaria[] = valores('lecturas').flatMap(
  (f) => JSON.parse(readFileSync(f, 'utf8')).lecturas,
);
if (!lecturas.length) throw new Error('Sin lecturas');

async function ejecutar(db: Db) {
  try {
    return {
      resultado: 'commit',
      ...(await aplicarCarga(db, tiendas.incluidas, tiendas.verificado_en, lecturas)),
    };
  } catch (e) {
    if (e instanceof ErrorConciliacion)
      return { resultado: 'rollback', error: e.message, conciliacion: e.conciliacion };
    throw e;
  }
}

let informe: Record<string, unknown>;
if (destino === 'ensayo') {
  const db = await crearDbLocal();
  try {
    informe = { destino: 'ensayo (PGlite + migraciones del repo)', ...(await ejecutar(db as unknown as Db)) };
  } finally {
    await db.close();
  }
} else if (destino === 'supabase') {
  if (arg('confirmar') !== PROYECTO) throw new Error(`Falta --confirmar ${PROYECTO}`);
  const url = (await leerEnvLocal()).get('DATABASE_URL');
  if (!url) throw new Error('Falta DATABASE_URL');
  const u = new URL(url);
  if (!(u.username.endsWith(`.${PROYECTO}`) || u.hostname.includes(PROYECTO)))
    throw new Error('DATABASE_URL no es el proyecto esperado');
  const c = new pg.Client({ connectionString: url, application_name: 'analytics-aplicar' });
  await c.connect();
  try {
    informe = { destino: `supabase ${PROYECTO}`, ...(await ejecutar(c as unknown as Db)) };
  } finally {
    await c.end();
  }
} else throw new Error(`Destino desconocido: ${destino}`);

const salida = arg('salida', SALIDA_PREDETERMINADA)!;
mkdirSync(salida, { recursive: true });
const archivo = join(salida, `aplicar-${destino}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(
  archivo,
  JSON.stringify(
    {
      archivos: valores('lecturas'),
      tiendas: arg('tiendas'),
      // Para revertir-carga.ts: qué cargas y tiendas tocó esta aplicación.
      cargas: [...new Set(lecturas.map((l) => l.carga_id))],
      tiendas_carga: tiendas.incluidas.map((t) => t.company_id),
      ...informe,
    },
    null,
    1,
  ) + '\n',
);
const { respaldo: _r, ...visible } = informe as { respaldo?: unknown };
console.log(JSON.stringify(visible, null, 1).slice(0, 2500));
console.log(`Informe → ${archivo}`);
if (informe.resultado !== 'commit') process.exit(1);
