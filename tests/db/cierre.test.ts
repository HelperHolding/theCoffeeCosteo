import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { cerrarTransaccion } from '../../scripts/conciliacion/cierre';
import { enlazar, leerLote } from '../../scripts/conciliacion/enlaces-pos';
import type { Conexion } from '../../scripts/conciliacion/fase4';
import { archivos22, migracion22, ULTIMA_PREVIA, VERSION_22 } from '../../scripts/conciliacion/migracion-22';
import { crearProducto } from './fabricas';
import { crearUsuario } from './utilidades';

// Cierre de transacción: si COMMIT o ROLLBACK fallan, el informe dice «fallida» con el error y nunca afirma éxito.

/** Conexión de prueba que falla en `sentencia` (después de cerrar de verdad la transacción, para no dejarla abierta). */
const fallaEn = (db: PGlite, sentencia: 'commit' | 'rollback'): Conexion => ({
  query: async (sql, p) => {
    if (sql.trim().toLowerCase() === sentencia) {
      await db.query('rollback');
      throw new Error('conexión interrumpida');
    }
    return db.query(sql, p) as never;
  },
  ejecutar: (sql) => db.exec(sql).then(() => undefined),
});

describe('cerrarTransaccion', () => {
  const falsa = (respuestas: Record<string, () => unknown>): Conexion => ({
    query: async (sql) => (respuestas[sql] ?? (() => ({ rows: [] })))() as never,
    ejecutar: async () => {},
  });

  it('informa commit o rollback solo cuando el servidor los confirma', async () => {
    expect(
      await cerrarTransaccion(falsa({ commit: () => ({ rows: [], command: 'COMMIT' }) }), 'commit'),
    ).toEqual({
      transaccion: 'commit',
    });
    expect(await cerrarTransaccion(falsa({}), 'rollback')).toEqual({ transaccion: 'rollback' });
  });

  it('COMMIT que responde ROLLBACK, transacción abortada o fallo de red → fallida con el error', async () => {
    let r = await cerrarTransaccion(falsa({ commit: () => ({ rows: [], command: 'ROLLBACK' }) }), 'commit');
    expect(r).toMatchObject({ transaccion: 'fallida', error: expect.stringMatching(/respondió ROLLBACK/) });
    r = await cerrarTransaccion(
      falsa({
        'select 1': () => {
          throw new Error('current transaction is aborted');
        },
      }),
      'commit',
    );
    expect(r).toMatchObject({
      transaccion: 'fallida',
      error: expect.stringMatching(/abortada.*no se confirmó/),
    });
    r = await cerrarTransaccion(
      falsa({
        commit: () => {
          throw new Error('ECONNRESET');
        },
      }),
      'commit',
    );
    expect(r).toMatchObject({
      transaccion: 'fallida',
      error: expect.stringMatching(/COMMIT falló \(ECONNRESET\).*incierto/),
    });
    r = await cerrarTransaccion(
      falsa({
        rollback: () => {
          throw new Error('ECONNRESET');
        },
      }),
      'rollback',
    );
    expect(r).toMatchObject({ transaccion: 'fallida', error: expect.stringMatching(/ROLLBACK falló/) });
  });
});

describe('migración 22 con cierre fallido', () => {
  let db: PGlite;
  const registrada = async () =>
    (await db.query(`select 1 from supabase_migrations.schema_migrations where version = $1`, [VERSION_22]))
      .rows.length;

  beforeAll(async () => {
    db = await crearDbLocal(ULTIMA_PREVIA);
    await db.exec(`create schema supabase_migrations;
      create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`);
    for (const v of readdirSync('supabase/migrations')
      .filter((f) => f.endsWith('.sql') && f.slice(0, 14) <= ULTIMA_PREVIA)
      .map((f) => f.slice(0, 14)))
      await db.query(`insert into supabase_migrations.schema_migrations (version) values ($1)`, [v]);
  });

  it('ensayo cuyo ROLLBACK falla: «fallida» con el error, no rollback', async () => {
    const r = await migracion22(fallaEn(db, 'rollback'), 'ensayo', await archivos22());
    expect(r.transaccion).toBe('fallida');
    expect(r.error).toMatch(/ROLLBACK falló \(conexión interrumpida\)/);
    expect(await registrada()).toBe(0);
  });

  it('aplicar cuyo COMMIT falla: «fallida» con el error, no commit', async () => {
    const r = await migracion22(fallaEn(db, 'commit'), 'aplicar', await archivos22());
    expect(r.transaccion).toBe('fallida');
    expect(r.error).toMatch(/COMMIT falló \(conexión interrumpida\)/);
    expect(await registrada()).toBe(0);
  });
});

describe('enlaces con cierre fallido', () => {
  let db: PGlite;
  let admin: string;
  let lote: Awaited<ReturnType<typeof leerLote>>;

  beforeAll(async () => {
    db = await crearDbLocal();
    admin = await crearUsuario(db, 'admin');
    const id = await crearProducto(db, { nombre: 'Latte cierre', precios: { Chica: 65 } });
    const dir = mkdtempSync(join(tmpdir(), 'lote-cierre-'));
    const texto = `codigo,receta_id,receta_nombre,nombre_observado,evidencia\n1LC,${id},Latte cierre,Latte,API\n`;
    writeFileSync(join(dir, 'lote.csv'), texto);
    lote = await leerLote(
      dir,
      { filas: 1, sha256: createHash('sha256').update(texto).digest('hex') },
      'lote.csv',
    );
  });

  it('ensayo cuyo ROLLBACK falla y carga cuyo COMMIT falla: «fallida», sin filas', async () => {
    let r = await enlazar(fallaEn(db, 'rollback'), 'ensayo', lote, { usuario: admin });
    expect(r).toMatchObject({ transaccion: 'fallida', error: expect.stringMatching(/ROLLBACK falló/) });
    r = await enlazar(fallaEn(db, 'commit'), 'aplicar', lote, { usuario: admin });
    expect(r).toMatchObject({ transaccion: 'fallida', error: expect.stringMatching(/COMMIT falló/) });
    expect((await db.query(`select 1 from producto_codigo_pos`)).rows).toHaveLength(0);
  });
});
