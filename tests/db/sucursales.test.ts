import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

let db: PGlite;
let admin: string, lector: string, otro: string;

beforeAll(async () => {
  db = await crearDbLocal();
  admin = await crearUsuario(db, 'admin');
  lector = await crearUsuario(db, 'compras');
  otro = await crearUsuario(db, 'operaciones');
  await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'sucursales', 'lectura')`, [
    lector,
  ]);
  await db.query(`insert into perfil_sucursales (user_id, company_id) values ($1, 612), ($2, 384)`, [
    lector,
    otro,
  ]);
});
afterAll(async () => db.close());

describe('acceso a Sucursales', () => {
  it('perfil_modulos acepta sucursales y conserva crm; rechaza módulos desconocidos', async () => {
    await expect(
      db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'crm', 'lectura')`, [otro]),
    ).resolves.toBeDefined();
    await expect(
      db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'rappi', 'lectura')`, [otro]),
    ).rejects.toThrow(/perfil_modulos_modulo_check/);
    await expect(
      db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'sucursales', 'total')`, [
        otro,
      ]),
    ).rejects.toThrow();
  });

  it('company_id positivo y sin duplicados por usuario', async () => {
    await expect(
      db.query(`insert into perfil_sucursales (user_id, company_id) values ($1, 0)`, [otro]),
    ).rejects.toThrow();
    await expect(
      db.query(`insert into perfil_sucursales (user_id, company_id) values ($1, 612)`, [lector]),
    ).rejects.toThrow();
  });

  it('cada usuario ve solo sus sucursales; admin ve todas pero no tiene ninguna asignada', async () => {
    const ver = (u: string) =>
      comoUsuario(
        db,
        u,
        async () => (await db.query<{ company_id: number }>('select company_id from perfil_sucursales')).rows,
      );
    expect((await ver(lector)).map((r) => r.company_id)).toEqual([612]);
    expect((await ver(otro)).map((r) => r.company_id)).toEqual([384]);
    expect((await ver(admin)).length).toBe(2);
    const propias = await comoUsuario(
      db,
      admin,
      async () => (await db.query('select 1 from perfil_sucursales where user_id = $1', [admin])).rows,
    );
    expect(propias).toEqual([]);
  });

  it('nadie se asigna sucursales ni módulos desde el portal (ni admin)', async () => {
    for (const u of [lector, admin]) {
      await expect(
        comoUsuario(db, u, () =>
          db.query(`insert into perfil_sucursales (user_id, company_id) values ($1, 477)`, [u]),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        comoUsuario(db, u, () =>
          db.query(`update perfil_sucursales set company_id = 477 where user_id = $1`, [lector]),
        ),
      ).rejects.toThrow(/permission denied/);
      await expect(
        comoUsuario(db, u, () => db.query(`delete from perfil_sucursales where user_id = $1`, [otro])),
      ).rejects.toThrow(/permission denied/);
    }
  });

  it('un token OAuth (MCP) no lee asignaciones', async () => {
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [
      JSON.stringify({ client_id: 'claude-client' }),
    ]);
    try {
      const filas = await comoUsuario(
        db,
        lector,
        async () => (await db.query('select * from perfil_sucursales')).rows,
      );
      expect(filas).toEqual([]);
    } finally {
      await db.query(`select set_config('request.jwt.claims', '', false)`);
    }
  });

  it('anon no tiene acceso y los cambios quedan en bitácora', async () => {
    await db.exec('set role anon');
    await expect(db.query('select * from perfil_sucursales')).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
    const b = await db.query(`select count(*)::int n from bitacora where tabla = 'perfil_sucursales'`);
    expect((b.rows[0] as { n: number }).n).toBeGreaterThan(0);
  });
});
