import { createHash } from 'node:crypto';
import type { Consultor } from './conexion';
import type { Accion, CuentaPortal, UsuarioLegado, VinculoExistente } from './usuarios-lib';

/** Fila de auth.users del sitio viejo y sus auth.identities, tal como vienen de la base. */
export interface CuentaAuthLegado {
  usuario: Record<string, unknown>;
  identidades: Record<string, unknown>[];
}

export interface ResultadoAplicar {
  /** Usernames cuya contraseña se cambió en el portal: no se pisó con la del sitio viejo. */
  clavesConservadas: string[];
}

export async function leerEstadoPortal(
  db: Consultor,
): Promise<{ cuentas: CuentaPortal[]; vinculos: VinculoExistente[] }> {
  const cuentas = (
    await db.query<CuentaPortal>(`select id::text as id, coalesce(email, '') as email from auth.users`)
  ).rows;
  const vinculos = (
    await db.query<VinculoExistente>(`select legado_id, user_id::text as user_id, origen from migracion_legado.usuarios`)
  ).rows;
  return { cuentas, vinculos };
}

const huella = (hash: unknown): string | null =>
  typeof hash === 'string' && hash ? createHash('sha256').update(hash).digest('hex') : null;

/**
 * Lo que no se hereda del sitio viejo: GoTrue toma `role` para el rol de Postgres del JWT (otro valor podría
 * saltarse la RLS), y los tokens de recuperación/confirmación vivos no deben seguir sirviendo aquí.
 * GoTrue no acepta NULL en sus columnas *_token: van vacías.
 */
export function sanearCuenta(fila: Record<string, unknown>): Record<string, unknown> {
  const limpia: Record<string, unknown> = { ...fila, role: 'authenticated', aud: 'authenticated', is_super_admin: null };
  for (const k of Object.keys(limpia)) if (/_token(_new|_current)?$/.test(k)) limpia[k] = '';
  return limpia;
}

/** Columnas escribibles (no generadas) de una tabla del portal: las versiones de GoTrue pueden diferir. */
async function columnas(db: Consultor, esquema: string, tabla: string): Promise<Set<string>> {
  const r = await db.query<{ c: string }>(
    `select column_name as c from information_schema.columns
     where table_schema = $1 and table_name = $2 and is_generated = 'NEVER'`,
    [esquema, tabla],
  );
  return new Set(r.rows.map((f) => f.c));
}

async function insertar(db: Consultor, tabla: string, permitidas: Set<string>, fila: Record<string, unknown>) {
  const cols = Object.keys(fila).filter((c) => permitidas.has(c));
  await db.query(
    `insert into ${tabla} (${cols.map((c) => `"${c}"`).join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
    cols.map((c) => fila[c]),
  );
}

async function guardarVinculo(
  db: Consultor,
  u: UsuarioLegado,
  userId: string,
  origen: 'creado' | 'vinculado',
  claveHuella: string | null = null,
) {
  await db.query(
    `insert into migracion_legado.usuarios
       (legado_id, auth_uid_legado, user_id, username, correo, rol_legado, subtipo, supplier_key, parent_legado_id,
        permisos, activo_legado, origen, clave_huella)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     on conflict (legado_id) do update set
       auth_uid_legado = excluded.auth_uid_legado, username = excluded.username, correo = excluded.correo,
       rol_legado = excluded.rol_legado, subtipo = excluded.subtipo, supplier_key = excluded.supplier_key,
       parent_legado_id = excluded.parent_legado_id, permisos = excluded.permisos,
       activo_legado = excluded.activo_legado,
       clave_huella = coalesce(excluded.clave_huella, migracion_legado.usuarios.clave_huella), actualizado_en = now()`,
    [
      u.id,
      u.auth_uid,
      userId,
      u.username,
      u.correo,
      u.rol,
      u.subtipo,
      u.supplier_key,
      u.parent_id,
      u.permisos === null || u.permisos === undefined ? null : JSON.stringify(u.permisos),
      u.activo,
      origen,
      claveHuella,
    ],
  );
}

/**
 * Los errores de Postgres traen la fila que falló en `detail` (correo, hash). Se relanzan solo con lo necesario
 * para diagnosticar: acción, username, código y restricción.
 */
async function sinDatosSensibles<T>(accion: string, username: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const { code, constraint } = (e ?? {}) as { code?: string; constraint?: string };
    throw new Error(
      `Falló ${accion} de ${username}${code ? ` (código ${code}` : ''}${constraint ? `, restricción ${constraint}` : ''}${code ? ')' : ''}`,
    );
  }
}

/**
 * Aplica el plan dentro de la transacción de `db` (enPortal). No hace commit ni rollback: si algo falla, lanza y el
 * llamador revierte todo. Nunca imprime filas de Auth.
 */
export async function aplicarPlan(
  db: Consultor,
  acciones: Accion[],
  auth: Map<string, CuentaAuthLegado>,
): Promise<ResultadoAplicar> {
  const colsUsuarios = await columnas(db, 'auth', 'users');
  const colsIdentidades = await columnas(db, 'auth', 'identities');
  const clavesConservadas: string[] = [];
  for (const a of acciones) {
    const u = a.usuario;
    switch (a.tipo) {
      case 'crear': {
        const cuenta = u.auth_uid ? auth.get(u.auth_uid) : undefined;
        if (!cuenta) throw new Error(`Falta la cuenta de Auth de ${u.username}`);
        await sinDatosSensibles('crear', u.username, async () => {
          await insertar(db, 'auth.users', colsUsuarios, sanearCuenta(cuenta.usuario));
          for (const i of cuenta.identidades) await insertar(db, 'auth.identities', colsIdentidades, i);
          await db.query(`insert into public.perfiles (user_id, nombre, rol, activo) values ($1, $2, $3, $4)`, [
            u.auth_uid,
            u.nombre,
            a.rol,
            u.activo,
          ]);
          await guardarVinculo(db, u, u.auth_uid!, 'creado', huella(cuenta.usuario.encrypted_password));
        });
        break;
      }
      case 'vincular':
        await sinDatosSensibles('vincular', u.username, () => guardarVinculo(db, u, a.userId, 'vinculado'));
        break;
      case 'actualizar_clave': {
        const cuenta = u.auth_uid ? auth.get(u.auth_uid) : undefined;
        await sinDatosSensibles('actualizar_clave', u.username, async () => {
          const actual = await db.query<{ hash: string | null; huella: string | null }>(
            `select a.encrypted_password as hash, v.clave_huella as huella
             from auth.users a join migracion_legado.usuarios v on v.user_id = a.id
             where a.id = $1 and v.legado_id = $2`,
            [a.userId, u.id],
          );
          const fila = actual.rows[0];
          const nueva = cuenta?.usuario.encrypted_password;
          if (fila && cuenta && huella(fila.hash) !== fila.huella) clavesConservadas.push(u.username);
          else if (cuenta && fila?.hash !== nueva) {
            await db.query(`update auth.users set encrypted_password = $2 where id = $1`, [a.userId, nueva]);
            await guardarVinculo(db, u, a.userId, 'creado', huella(nueva));
            return;
          }
          await guardarVinculo(db, u, a.userId, 'creado');
        });
        break;
      }
      case 'sin_cambios':
        await sinDatosSensibles('sin_cambios', u.username, () => guardarVinculo(db, u, a.userId, 'vinculado'));
        break;
      case 'omitir':
        break;
    }
  }
  return { clavesConservadas };
}
