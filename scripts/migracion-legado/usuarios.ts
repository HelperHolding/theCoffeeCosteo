import { conLegado, enPortal } from './conexion';
import { aplicarPlan, leerEstadoPortal, type CuentaAuthLegado } from './usuarios-aplicar';
import { planUsuarios, resumenPlan, type UsuarioLegado } from './usuarios-lib';

/**
 * Fase 0.3 · Usuarios de thecoffeemexico → portal. Simulación por omisión; escribe solo con --aplicar.
 *   npx tsx scripts/migracion-legado/usuarios.ts [--aplicar]
 * Lee bliocjvq en solo lectura (DATABASE_URL_LEGADO) y escribe el portal en UNA transacción (DATABASE_URL).
 * Nunca imprime correos, ids ni hashes: solo conteos y usernames omitidos.
 */
const aplicar = process.argv.includes('--aplicar');

class SimulacionTerminada extends Error {}

/** Lee el estado del portal en una transacción que se revierte siempre (la simulación no escribe). */
async function leerPortalSinEscribir() {
  let estado: Awaited<ReturnType<typeof leerEstadoPortal>> | undefined;
  await enPortal(async (db) => {
    estado = await leerEstadoPortal(db);
    throw new SimulacionTerminada();
  }).catch((e) => {
    if (!(e instanceof SimulacionTerminada)) throw e;
  });
  return estado!;
}

// En bliocjvq, `postgres` no puede dar acceso al esquema auth: migracion_auth son vistas (de su dueño) sobre
// auth.users y auth.identities, legibles solo por el rol migracion_lectura (docs/migracion/fase-0.md).
const { legado, auth } = await conLegado(async (db) => {
  const usuarios = (
    await db.query<UsuarioLegado>(`
      select u.id::text as id, u.auth_uid::text as auth_uid, a.email as auth_email, u.username, u.nombre, u.correo,
             u.rol, u.subtipo, u.supplier_key, u.parent_id::text as parent_id, u.permisos,
             coalesce(u.activo, false) as activo
      from public.usuarios u left join migracion_auth.users a on a.id::text = u.auth_uid::text
      order by u.username`)
  ).rows;
  const uids = usuarios.map((u) => u.auth_uid).filter((x): x is string => !!x);
  const cuentas = (await db.query(`select * from migracion_auth.users where id = any($1::uuid[])`, [uids])).rows;
  const identidades = (await db.query(`select * from migracion_auth.identities where user_id = any($1::uuid[])`, [uids])).rows;
  const auth = new Map<string, CuentaAuthLegado>(
    cuentas.map((c) => [
      String(c.id),
      { usuario: c, identidades: identidades.filter((i) => String(i.user_id) === String(c.id)) },
    ]),
  );
  return { legado: usuarios, auth };
});

if (!aplicar) {
  const { cuentas, vinculos } = await leerPortalSinEscribir();
  console.log(resumenPlan(planUsuarios(legado, cuentas, vinculos)));
  console.log('\nSimulación: no se escribió nada. Corre con --aplicar para escribir.');
} else {
  // El plan se recalcula dentro de la transacción de escritura para no actuar sobre un estado viejo.
  const resumen = await enPortal(async (db) => {
    const { cuentas, vinculos } = await leerEstadoPortal(db);
    const plan = planUsuarios(legado, cuentas, vinculos);
    const { clavesConservadas } = await aplicarPlan(db, plan, auth);
    return [
      resumenPlan(plan),
      ...(clavesConservadas.length
        ? ['Contraseña cambiada en el portal (no se pisó):', ...clavesConservadas.map((u) => `  - ${u}`)]
        : []),
    ].join('\n');
  });
  console.log(resumen);
  console.log('\nAplicado.');
}
