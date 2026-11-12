import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import type { Consultor } from '../../scripts/migracion-legado/conexion';
import {
  aplicarPlan,
  leerEstadoPortal,
  type CuentaAuthLegado,
} from '../../scripts/migracion-legado/usuarios-aplicar';
import { planUsuarios, type UsuarioLegado } from '../../scripts/migracion-legado/usuarios-lib';

const UID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const SEBAS_PORTAL = UID(90);
const ANA = UID(1);

const legado: UsuarioLegado[] = [
  {
    id: '10',
    auth_uid: ANA,
    auth_email: 'ana@thecoffee.internal',
    username: 'ana',
    nombre: 'Ana López',
    correo: null,
    rol: 'franquiciado',
    subtipo: 'operador',
    supplier_key: null,
    parent_id: '11',
    permisos: { pedidos: true },
    activo: true,
  },
  {
    id: '12',
    auth_uid: UID(2),
    auth_email: 'sebas@thecoffee.internal',
    username: 'sebas',
    nombre: 'Sebastián',
    correo: 'Sebastian@Ejemplo.mx',
    rol: 'admin',
    subtipo: null,
    supplier_key: null,
    parent_id: null,
    permisos: null,
    activo: true,
  },
];

const cuentaAna = (hash: string): CuentaAuthLegado => ({
  usuario: {
    id: ANA,
    email: 'ana@thecoffee.internal',
    encrypted_password: hash,
    raw_user_meta_data: { username: 'ana' },
    role: 'service_role',
    aud: 'otra',
    is_super_admin: true,
    recovery_token: 'token-vivo',
    confirmation_token: 'otro-token',
    columna_que_el_portal_no_tiene: 'x',
  },
  identidades: [
    {
      id: UID(3),
      user_id: ANA,
      provider: 'email',
      provider_id: ANA,
      identity_data: { sub: ANA, email: 'ana@thecoffee.internal' },
      email: 'ana@thecoffee.internal',
    },
  ],
});

let db: PGlite;
const c = () => db as unknown as Consultor;
const correr = async (hash: string) => {
  const { cuentas, vinculos } = await leerEstadoPortal(c());
  await aplicarPlan(c(), planUsuarios(legado, cuentas, vinculos), new Map([[ANA, cuentaAna(hash)]]));
};

beforeEach(async () => {
  db = await crearDbLocal();
  await db.query(`insert into auth.users (id, email) values ($1, 'sebastian@ejemplo.mx')`, [SEBAS_PORTAL]);
  await db.query(`insert into perfiles (user_id, nombre, rol) values ($1, 'Sebastián', 'admin')`, [SEBAS_PORTAL]);
});

it('crea la cuenta con su hash e identidad, perfil sin Costeo, y vincula al que ya existía', async () => {
  await correr('$2a$10$hashA');
  const ana = await db.query(`select email, encrypted_password from auth.users where id = $1`, [ANA]);
  expect(ana.rows).toEqual([{ email: 'ana@thecoffee.internal', encrypted_password: '$2a$10$hashA' }]);
  const ident = await db.query(`select provider, email from auth.identities where user_id = $1`, [ANA]);
  expect(ident.rows).toEqual([{ provider: 'email', email: 'ana@thecoffee.internal' }]);
  const perfiles = await db.query(`select user_id, rol from perfiles order by rol`);
  expect(perfiles.rows).toEqual([
    { user_id: SEBAS_PORTAL, rol: 'admin' },
    { user_id: ANA, rol: 'franquiciado' },
  ]);
  const vinculos = await db.query(
    `select legado_id, user_id, origen, subtipo, parent_legado_id from migracion_legado.usuarios order by legado_id`,
  );
  expect(vinculos.rows).toEqual([
    { legado_id: '10', user_id: ANA, origen: 'creado', subtipo: 'operador', parent_legado_id: '11' },
    { legado_id: '12', user_id: SEBAS_PORTAL, origen: 'vinculado', subtipo: null, parent_legado_id: null },
  ]);
  expect((await db.query(`select count(*)::int as n from auth.users`)).rows[0]).toEqual({ n: 2 });
});

it('una segunda corrida actualiza la contraseña sin duplicar nada', async () => {
  await correr('$2a$10$hashA');
  await correr('$2a$10$hashB');
  const ana = await db.query(`select encrypted_password from auth.users where id = $1`, [ANA]);
  expect(ana.rows).toEqual([{ encrypted_password: '$2a$10$hashB' }]);
  const n = await db.query(`
    select (select count(*) from auth.users)::int as cuentas, (select count(*) from auth.identities)::int as identidades,
           (select count(*) from perfiles)::int as perfiles, (select count(*) from migracion_legado.usuarios)::int as vinculos`);
  expect(n.rows[0]).toEqual({ cuentas: 2, identidades: 1, perfiles: 2, vinculos: 2 });
});

it('la cuenta copiada entra como authenticated, sin superadmin ni tokens vivos', async () => {
  await correr('$2a$10$hashA');
  const r = await db.query(
    `select role, aud, is_super_admin, recovery_token, confirmation_token from auth.users where id = $1`,
    [ANA],
  );
  expect(r.rows).toEqual([
    { role: 'authenticated', aud: 'authenticated', is_super_admin: null, recovery_token: '', confirmation_token: '' },
  ]);
});

it('no pisa una contraseña que se cambió en el portal y lo reporta', async () => {
  await correr('$2a$10$hashA');
  await db.query(`update auth.users set encrypted_password = '$2a$10$delPortal' where id = $1`, [ANA]);
  const { cuentas, vinculos } = await leerEstadoPortal(c());
  const r = await aplicarPlan(c(), planUsuarios(legado, cuentas, vinculos), new Map([[ANA, cuentaAna('$2a$10$hashB')]]));
  expect(r.clavesConservadas).toEqual(['ana']);
  const ana = await db.query(`select encrypted_password from auth.users where id = $1`, [ANA]);
  expect(ana.rows).toEqual([{ encrypted_password: '$2a$10$delPortal' }]);
});

it('un error de la base no expone correos ni hashes en el mensaje', async () => {
  const conNombreVacio = legado.map((x) => (x.id === '10' ? { ...x, nombre: ' ' } : x));
  const { cuentas, vinculos } = await leerEstadoPortal(c());
  const error = await aplicarPlan(c(), planUsuarios(conNombreVacio, cuentas, vinculos), new Map([[ANA, cuentaAna('$2a$10$hashA')]]))
    .then(() => null, (e: Error) => e);
  expect(error?.message).toMatch(/crear de ana/);
  expect(error?.message).not.toMatch(/hashA|thecoffee\.internal/);
  expect(JSON.stringify(error)).not.toMatch(/hashA|thecoffee\.internal/);
});

it('si falta la cuenta de Auth de un usuario a crear, falla sin dejar nada a medias', async () => {
  await db.exec('begin');
  const { cuentas, vinculos } = await leerEstadoPortal(c());
  await expect(aplicarPlan(c(), planUsuarios(legado, cuentas, vinculos), new Map())).rejects.toThrow(
    'Falta la cuenta de Auth de ana',
  );
  await db.exec('rollback');
  expect((await db.query(`select count(*)::int as n from migracion_legado.usuarios`)).rows[0]).toEqual({ n: 0 });
});
