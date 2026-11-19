import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';
import type { Db } from '../portal/consultas';
import { configuracion } from '../supabase/config';
import { clienteMcp, ErrorMcp } from './autenticacion';

/**
 * Acceso de Grok con token fijo (docs/mcp/grok.md): `Authorization: Bearer MCP_GROK_TOKEN`. El servidor inicia
 * sesión como el usuario dedicado (MCP_GROK_EMAIL / MCP_GROK_PASSWORD) y consulta con SU sesión, así que la base
 * aplica sus permisos y sus sucursales asignadas. Sin MCP_GROK_TOKEN (o con uno corto) este camino está apagado.
 */
const MIN_TOKEN = 32;
/** Margen para renovar la sesión antes de que venza (segundos). */
const MARGEN = 120;

export function esTokenGrok(token: string): boolean {
  const esperado = process.env.MCP_GROK_TOKEN ?? '';
  if (esperado.length < MIN_TOKEN) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface Sesion {
  jwt: string;
  userId: string;
  vence: number;
}
let sesion: Promise<Sesion> | null = null;

/** Solo para pruebas. */
export function olvidarSesionGrok() {
  sesion = null;
}

async function iniciar(): Promise<Sesion> {
  const email = process.env.MCP_GROK_EMAIL;
  const password = process.env.MCP_GROK_PASSWORD;
  if (!email || !password) throw new ErrorMcp(503, 'Falta configurar el usuario de Grok en el servidor.');
  const { url, key } = configuracion();
  const auth = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const r = await auth.auth.signInWithPassword({ email, password });
  const s = r.data.session;
  if (r.error || !s)
    throw new ErrorMcp(503, 'No se pudo iniciar la sesión de Grok. Revisa el usuario configurado.');
  return { jwt: s.access_token, userId: s.user.id, vence: s.expires_at ?? 0 };
}

async function sesionVigente(): Promise<Sesion> {
  const actual = sesion && (await sesion.catch(() => null));
  if (actual && actual.vence - MARGEN > Date.now() / 1000) return actual;
  sesion = iniciar();
  try {
    return await sesion;
  } catch (e) {
    sesion = null;
    throw e;
  }
}

export async function autenticarGrok(): Promise<Db> {
  const s = await sesionVigente();
  const db = clienteMcp(s.jwt);
  const perfil = await db.from('perfiles').select('user_id,activo').eq('user_id', s.userId).maybeSingle();
  if (perfil.error) throw new ErrorMcp(503, 'No se pudo comprobar el acceso. Intenta de nuevo.');
  if (!perfil.data?.activo) throw new ErrorMcp(403, 'El usuario de Grok no tiene un perfil activo.');
  const proteccion = await db.rpc('mcp_lectura_habilitada');
  if (proteccion.error || proteccion.data !== true)
    throw new ErrorMcp(503, 'El administrador debe publicar la migración de consultas MCP.');
  return db;
}
