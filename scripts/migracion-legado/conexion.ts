import pg from 'pg';
import { leerEnvLocal } from '../zoho/cliente';

export const PROYECTO_LEGADO = 'bliocjvqwskvoxrumqby';
export const PROYECTO_PORTAL = 'jpqkmnfjwzniptszjuli';

/** Lo mínimo que comparten pg.Client y PGlite; los scripts y sus pruebas usan solo esto. */
export interface Consultor {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/** Corta antes de conectar si la URL no es del proyecto esperado. Nunca imprime la URL. */
export function verificarProyecto(url: string, proyecto: string): void {
  const u = new URL(url);
  if (!(u.username.endsWith(`.${proyecto}`) || u.hostname.includes(proyecto)))
    throw new Error(`La URL no corresponde al proyecto ${proyecto}; no se conecta`);
}

async function conectar(variable: string, proyecto: string, aplicacion: string): Promise<pg.Client> {
  const url = (await leerEnvLocal()).get(variable);
  if (!url) throw new Error(`Falta ${variable} en .env.local`);
  verificarProyecto(url, proyecto);
  const c = new pg.Client({ connectionString: url, application_name: aplicacion });
  await c.connect();
  return c;
}

/** bliocjvq en SOLO LECTURA: begin read only y siempre rollback. */
export async function conLegado<T>(fn: (db: Consultor) => Promise<T>): Promise<T> {
  const c = await conectar('DATABASE_URL_LEGADO', PROYECTO_LEGADO, 'migracion-legado-lectura');
  try {
    await c.query('begin read only');
    await c.query("set local statement_timeout = '60s'");
    return await fn(c as unknown as Consultor);
  } finally {
    await c.query('rollback').catch(() => {});
    await c.end();
  }
}

/** Portal en UNA transacción, con origen 'migracion' para la bitácora. Confirma solo si fn termina sin error. */
export async function enPortal<T>(fn: (db: Consultor) => Promise<T>): Promise<T> {
  const c = await conectar('DATABASE_URL', PROYECTO_PORTAL, 'migracion-legado-escritura');
  try {
    await c.query('begin');
    await c.query("set local app.origen = 'migracion'");
    const r = await fn(c as unknown as Consultor);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}
