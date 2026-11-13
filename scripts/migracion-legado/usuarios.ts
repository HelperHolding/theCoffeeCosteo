import { conLegado, enPortal } from './conexion';
import { aplicarPlan, leerEstadoPortal, resolverClaves, type CuentaAuthLegado } from './usuarios-aplicar';
import { planUsuarios, resumenPlan, type UsuarioLegado } from './usuarios-lib';

/**
 * Fase 0.3 · Usuarios de thecoffeemexico → portal. Simulación por omisión; escribe solo con --aplicar.
 *   npx tsx scripts/migracion-legado/usuarios.ts [--aplicar]
 * Lee bliocjvq en solo lectura (DATABASE_URL_LEGADO) y escribe el portal en UNA transacción (DATABASE_URL).
 * Nunca imprime correos, ids ni hashes: solo conteos y usernames omitidos.
 */
const aplicar = process.argv.includes('--aplicar');

// Usuarios que nunca se importan ni vinculan (cuentas de prueba del sitio viejo). Si alguno ya quedó vinculado,
// su fila de migracion_legado.usuarios se borra a mano.
const EXCLUIDOS = new Set([
  'prueba_cvalencia_aperturas', // proveedor de prueba con el mismo correo que un admin del portal
]);

class SimulacionTerminada extends Error {}

type Fuentes = Awaited<ReturnType<typeof resolverClaves>>;
const textoFuentes = (f: Fuentes) =>
  `Contraseña vigente: de Auth ${f.auth}, de usuarios.password ${f.hash + f.texto} (${f.texto} en texto plano), sin clave ${f.ninguna}`;

/** Lee el estado del portal en una transacción que se revierte siempre (la simulación no escribe). */
async function leerPortalSinEscribir() {
  let estado: (Awaited<ReturnType<typeof leerEstadoPortal>> & { fuentes: Fuentes }) | undefined;
  await enPortal(async (db) => {
    estado = { ...(await leerEstadoPortal(db)), fuentes: await resolverClaves(db, auth, passwords, claveInicial) };
    throw new SimulacionTerminada();
  }).catch((e) => {
    if (!(e instanceof SimulacionTerminada)) throw e;
  });
  return estado!;
}

// En bliocjvq, `postgres` no puede dar acceso al esquema auth: migracion_auth son vistas (de su dueño) sobre
// auth.users y auth.identities, legibles solo por el rol migracion_lectura (docs/migracion/fase-0.md).
const { legado, auth, passwords, claveInicial } = await conLegado(async (db) => {
  const usuarios = (
    await db.query<UsuarioLegado>(`
      select u.id::text as id, u.auth_uid::text as auth_uid, a.email as auth_email, u.username, u.nombre, u.correo,
             u.rol, u.subtipo, u.supplier_key, u.parent_id::text as parent_id, u.permisos,
             coalesce(u.activo, false) as activo
      from public.usuarios u left join migracion_auth.users a on a.id::text = u.auth_uid::text
      order by u.username`)
  ).rows;
  // usuarios.password solo en memoria, por auth_uid: nunca entra a UsuarioLegado, a los vínculos ni a la consola.
  const passwords = new Map(
    (
      await db.query<{ uid: string; p: string | null }>(
        `select auth_uid::text as uid, password as p from public.usuarios where auth_uid is not null`,
      )
    ).rows.map((f) => [f.uid, f.p]),
  );
  // La clave fija que el trigger del sitio viejo pone en Auth al crear un usuario: se lee de su definición.
  const def = (
    await db.query<{ d: string }>(`select pg_get_functiondef('public._auto_create_auth_user'::regproc) as d`)
  ).rows[0].d;
  const claveInicial = /crypt\(\s*'([^']+)'/.exec(def)?.[1];
  if (!claveInicial) throw new Error('No encontré la clave inicial en _auto_create_auth_user; no se sigue');
  const uids = usuarios.map((u) => u.auth_uid).filter((x): x is string => !!x);
  const cuentas = (await db.query(`select * from migracion_auth.users where id = any($1::uuid[])`, [uids])).rows;
  const identidades = (await db.query(`select * from migracion_auth.identities where user_id = any($1::uuid[])`, [uids])).rows;
  const auth = new Map<string, CuentaAuthLegado>(
    cuentas.map((c) => [
      String(c.id),
      { usuario: c, identidades: identidades.filter((i) => String(i.user_id) === String(c.id)) },
    ]),
  );
  return { legado: usuarios, auth, passwords, claveInicial };
});

if (!aplicar) {
  const { cuentas, vinculos, fuentes } = await leerPortalSinEscribir();
  console.log(resumenPlan(planUsuarios(legado, cuentas, vinculos, EXCLUIDOS)));
  console.log(textoFuentes(fuentes));
  console.log('\nSimulación: no se escribió nada. Corre con --aplicar para escribir.');
} else {
  // El plan se recalcula dentro de la transacción de escritura para no actuar sobre un estado viejo.
  const resumen = await enPortal(async (db) => {
    const { cuentas, vinculos } = await leerEstadoPortal(db);
    const fuentes = await resolverClaves(db, auth, passwords, claveInicial);
    const plan = planUsuarios(legado, cuentas, vinculos, EXCLUIDOS);
    const { clavesConservadas } = await aplicarPlan(db, plan, auth);
    return [
      resumenPlan(plan),
      textoFuentes(fuentes),
      ...(clavesConservadas.length
        ? ['Contraseña cambiada en el portal (no se pisó):', ...clavesConservadas.map((u) => `  - ${u}`)]
        : []),
    ].join('\n');
  });
  console.log(resumen);
  console.log('\nAplicado.');
}
