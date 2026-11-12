import type { Consultor } from './conexion';
import type { Accion, CuentaPortal, UsuarioLegado, VinculoExistente } from './usuarios-lib';

/** Fila de auth.users del sitio viejo y sus auth.identities, tal como vienen de la base. */
export interface CuentaAuthLegado {
  usuario: Record<string, unknown>;
  identidades: Record<string, unknown>[];
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

async function guardarVinculo(db: Consultor, u: UsuarioLegado, userId: string, origen: 'creado' | 'vinculado') {
  await db.query(
    `insert into migracion_legado.usuarios
       (legado_id, auth_uid_legado, user_id, username, correo, rol_legado, subtipo, supplier_key, parent_legado_id,
        permisos, activo_legado, origen)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (legado_id) do update set
       auth_uid_legado = excluded.auth_uid_legado, username = excluded.username, correo = excluded.correo,
       rol_legado = excluded.rol_legado, subtipo = excluded.subtipo, supplier_key = excluded.supplier_key,
       parent_legado_id = excluded.parent_legado_id, permisos = excluded.permisos,
       activo_legado = excluded.activo_legado, actualizado_en = now()`,
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
    ],
  );
}

/**
 * Aplica el plan dentro de la transacción de `db` (enPortal). No hace commit ni rollback: si algo falla, lanza y el
 * llamador revierte todo. Nunca imprime filas de Auth.
 */
export async function aplicarPlan(
  db: Consultor,
  acciones: Accion[],
  auth: Map<string, CuentaAuthLegado>,
): Promise<void> {
  const colsUsuarios = await columnas(db, 'auth', 'users');
  const colsIdentidades = await columnas(db, 'auth', 'identities');
  for (const a of acciones) {
    const u = a.usuario;
    switch (a.tipo) {
      case 'crear': {
        const cuenta = u.auth_uid ? auth.get(u.auth_uid) : undefined;
        if (!cuenta) throw new Error(`Falta la cuenta de Auth de ${u.username}`);
        await insertar(db, 'auth.users', colsUsuarios, cuenta.usuario);
        for (const i of cuenta.identidades) await insertar(db, 'auth.identities', colsIdentidades, i);
        await db.query(`insert into public.perfiles (user_id, nombre, rol, activo) values ($1, $2, $3, $4)`, [
          u.auth_uid,
          u.nombre,
          a.rol,
          u.activo,
        ]);
        await guardarVinculo(db, u, u.auth_uid!, 'creado');
        break;
      }
      case 'vincular':
        await guardarVinculo(db, u, a.userId, 'vinculado');
        break;
      case 'actualizar_clave': {
        const cuenta = u.auth_uid ? auth.get(u.auth_uid) : undefined;
        if (cuenta)
          await db.query(`update auth.users set encrypted_password = $2 where id = $1`, [
            a.userId,
            cuenta.usuario.encrypted_password,
          ]);
        await guardarVinculo(db, u, a.userId, 'creado');
        break;
      }
      case 'sin_cambios':
        await guardarVinculo(db, u, a.userId, 'vinculado');
        break;
      case 'omitir':
        break;
    }
  }
}
