import { leerEnvLocal } from '../zoho/cliente';
import { PROYECTO } from './db-lectura';

/**
 * Destino de los scripts que escriben (migración 22 y enlaces POS). Se valida con el parser de URL, nunca por una
 * coincidencia de texto: remoto = pooler de Supabase con usuario `postgres.<proyecto>` o host directo
 * `db.<proyecto>.supabase.co`; local = solo localhost/127.0.0.1/[::1]. La URL nunca se imprime ni va al informe.
 */
export type Destino = { tipo: 'remoto'; proyecto: string; url: string } | { tipo: 'local'; url: string };
const LOCALES = new Set(['localhost', '127.0.0.1', '[::1]']);

export function validarRemoto(url: string, proyecto = PROYECTO): Destino {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('DATABASE_URL no es una URL válida');
  }
  if (!['postgres:', 'postgresql:'].includes(u.protocol)) throw new Error('DATABASE_URL no es de Postgres');
  const usuario = decodeURIComponent(u.username);
  const pooler =
    /^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(u.hostname) && usuario === `postgres.${proyecto}`;
  const directo = u.hostname === `db.${proyecto}.supabase.co` && usuario === 'postgres';
  if (!pooler && !directo)
    throw new Error(`DATABASE_URL no corresponde exactamente al proyecto ${proyecto}; no se conecta`);
  return { tipo: 'remoto', proyecto, url };
}

export function validarLocal(url: string): Destino {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('--local no es una URL válida');
  }
  if (!['postgres:', 'postgresql:'].includes(u.protocol) || !LOCALES.has(u.hostname))
    throw new Error('--local solo acepta Postgres en localhost, 127.0.0.1 o [::1]');
  return { tipo: 'local', url };
}

/** Remoto desde .env.local con el cargador existente; local solo si se pasa explícitamente. */
export async function resolverDestino(local: string | undefined): Promise<Destino> {
  if (local) return validarLocal(local);
  const url = (await leerEnvLocal()).get('DATABASE_URL');
  if (!url) throw new Error('Falta DATABASE_URL en .env.local');
  return validarRemoto(url);
}

export const nombreDestino = (d: Destino) => (d.tipo === 'remoto' ? d.proyecto : 'local');
