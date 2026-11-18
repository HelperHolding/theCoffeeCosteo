import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';

export const num = (v: unknown): number => Number(v);

export type Rol =
  | 'compras'
  | 'operaciones'
  | 'finanzas'
  | 'admin'
  | 'sucursales'
  | 'interno'
  | 'franquiciado'
  | 'proveedor';

/** Ejecuta fn como el rol `authenticated` de Supabase con auth.uid() = userId. */
export async function comoUsuario<T>(db: PGlite, userId: string, fn: () => Promise<T>): Promise<T> {
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [userId]);
  await db.exec('set role authenticated');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
    await db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  }
}

/** Crea un usuario de auth con su perfil (como superusuario). */
export async function crearUsuario(db: PGlite, rol: Rol): Promise<string> {
  const id = randomUUID();
  await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${rol}-${id}@prueba.mx`]);
  await db.query('insert into perfiles (user_id, nombre, rol) values ($1, $2, $3)', [id, `Usuario ${rol}`, rol]);
  return id;
}

export async function darModulo(
  db: PGlite,
  userId: string,
  modulo: 'crm' | 'sucursales' | 'sucursales_costeo' | 'bi' | 'comercializadora',
  nivel: 'desarrollador' | 'edicion' | 'lectura',
): Promise<void> {
  await db.query('insert into perfil_modulos (user_id, modulo, nivel) values ($1, $2, $3)', [userId, modulo, nivel]);
}
