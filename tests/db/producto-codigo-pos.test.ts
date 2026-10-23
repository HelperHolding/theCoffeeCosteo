import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { crearProducto, crearSubreceta } from './fabricas';
import { comoUsuario, crearUsuario, num } from './utilidades';

// Migración 22: códigos del POS de Brasil ligados a recetas (docs/conciliacion-brasil/15).
let db: PGlite;
let compras: string, operaciones: string, admin: string, latte: string, mix: string;
const insertar = (codigo: string, receta: string) =>
  db.query(
    `insert into producto_codigo_pos (codigo, receta_id, nombre_observado, evidencia) values ($1, $2, 'Iced Latte', 'prueba') returning id`,
    [codigo, receta],
  );

beforeAll(async () => {
  db = await crearDbLocal();
  [compras, operaciones, admin] = [
    await crearUsuario(db, 'compras'),
    await crearUsuario(db, 'operaciones'),
    await crearUsuario(db, 'admin'),
  ];
  latte = await crearProducto(db, { nombre: 'Latte códigos POS', precios: { Chica: 70, Grande: 80 } });
  mix = await crearSubreceta(db, { nombre: 'Mix códigos POS', rendimiento: 1000 });
});

describe('producto_codigo_pos', () => {
  it('un código liga una sola receta; una receta admite varios códigos', async () => {
    await insertar('5IL-PRUEBA', latte);
    await insertar('5IL-APP-PRUEBA', latte);
    await expect(insertar('5IL-PRUEBA', latte)).rejects.toThrow(/duplicate key|unique/);
  });

  it('rechaza GENERIC, códigos vacíos o con espacios y sub-recetas', async () => {
    await expect(insertar('GENERIC', latte)).rejects.toThrow(/check/);
    await expect(insertar('', latte)).rejects.toThrow(/check/);
    await expect(insertar(' 5IL ', latte)).rejects.toThrow(/check/);
    await expect(insertar('MIX-PRUEBA', mix)).rejects.toThrow(/sub-receta/);
  });

  it('no se puede borrar una receta con códigos ligados (on delete restrict)', async () => {
    await expect(db.query('delete from recetas where id = $1', [latte])).rejects.toThrow(
      /foreign key|violates/,
    );
  });

  it('lectura para perfiles activos; escritura solo operaciones y admin; registra bitácora', async () => {
    const leer = (uid: string) =>
      comoUsuario(db, uid, async () =>
        num((await db.query<{ n: number }>('select count(*)::int n from producto_codigo_pos')).rows[0].n),
      );
    expect(await leer(compras)).toBe(2);
    await expect(comoUsuario(db, compras, () => insertar('COMPRAS-PRUEBA', latte))).rejects.toThrow(
      /row-level security/,
    );
    await comoUsuario(db, operaciones, () => insertar('OPER-PRUEBA', latte));
    await comoUsuario(db, admin, () =>
      db.query(`delete from producto_codigo_pos where codigo = 'OPER-PRUEBA'`),
    );
    const b = await db.query<{ n: number }>(
      `select count(*)::int n from bitacora where tabla = 'producto_codigo_pos' and origen = 'portal'`,
    );
    expect(num(b.rows[0].n)).toBeGreaterThanOrEqual(2);
  });

  it('una sesión OAuth (MCP) lee pero no escribe', async () => {
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [
      JSON.stringify({ client_id: 'claude-client' }),
    ]);
    try {
      expect(
        await comoUsuario(
          db,
          admin,
          async () => (await db.query('select codigo from producto_codigo_pos')).rows.length,
        ),
      ).toBeGreaterThan(0);
      await expect(comoUsuario(db, admin, () => insertar('OAUTH-PRUEBA', latte))).rejects.toThrow(
        /row-level security/,
      );
    } finally {
      await db.query(`select set_config('request.jwt.claims', '', false)`);
    }
  });

  it('las políticas siguen el patrón initPlan', async () => {
    const r = await db.query<{ expr: string }>(
      `select coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr from pg_policies where tablename = 'producto_codigo_pos'`,
    );
    for (const { expr } of r.rows) expect(expr).not.toMatch(/(^|[^T] )(rol_actual|tiene_rol|auth\.jwt)\(/);
    expect(r.rows).toHaveLength(7);
  });
});
