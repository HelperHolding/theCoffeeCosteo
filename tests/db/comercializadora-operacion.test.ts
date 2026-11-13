import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo, num } from './utilidades';

describe('migración 49', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await crearDbLocal();
    await db.exec(`
      insert into com_catalogo (sku, nombre, saldo_yulius, saldo_cedis) values ('A', 'Café', 10, 7), ('B', 'Vasos', null, 0);
      insert into com_movimientos (id, tipo, folio, sku, cantidad, cantidad_original, origen, destino, estado, fecha) values
        ('t1', 'traspaso', 'T-1', 'A', 5, 5, 'CEDIS', 'Yulius', 'ordenado', '2026-11-10'),
        ('t2', 'traspaso', 'T-1', 'B', 3, 3, 'CEDIS', 'Yulius', 'ordenado', '2026-11-10'),
        ('t3', 'traspaso', 'T-2', 'A', 4, 4, 'Yulius', 'CEDIS', 'ordenado', '2026-11-11');`);
  });

  const editor = async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'edicion');
    return id;
  };

  it('el puente expone monto, número de pedido, sucursal y contacto (solo service_role)', async () => {
    await db.exec(`
      insert into legado.aperturas (id, estatus, fecha, sucursal, contacto) values ('A1', 'abierta', '2026-01-01', 'Polanco', 'Ana');
      insert into legado.pedidos (id, apertura_id, fecha_pedido, status, items, monto, shopify_order_number)
        values ('00000000-0000-0000-0000-000000000001', 'A1', now(), 'pagado', '[]', 1500, '#1001');`);
    await db.exec('set role service_role');
    const p = await db.query<{ monto: string; shopify_order_number: string }>(
      'select monto, shopify_order_number from com_legado_pedidos',
    );
    const a = await db.query<{ sucursal: string; contacto: string }>(
      'select sucursal, contacto from com_legado_aperturas',
    );
    await db.exec('reset role');
    expect(p.rows[0]).toEqual({ monto: '1500', shopify_order_number: '#1001' });
    expect(a.rows[0]).toEqual({ sucursal: 'Polanco', contacto: 'Ana' });
  });

  it('ingreso al 3PL: marca ingresado, guarda lo recibido y suma al saldo_yulius en una sola operación', async () => {
    const id = await editor();
    const n = await comoUsuario(db, id, async () =>
      num(
        (
          await db.query<{ n: number }>(`select com_ingresar_traspaso('T-1', $1::jsonb) n`, [
            JSON.stringify({ t1: 4, t2: 3 }),
          ])
        ).rows[0].n,
      ),
    );
    expect(n).toBe(2);
    const m = await db.query(
      `select id, cantidad::float8 c, cantidad_original::float8 o, estado from com_movimientos where folio = 'T-1' order by id`,
    );
    expect(m.rows).toEqual([
      { id: 't1', c: 4, o: 5, estado: 'ingresado' },
      { id: 't2', c: 3, o: 3, estado: 'ingresado' },
    ]);
    const s = await db.query<{ sku: string; y: number | null }>(
      `select sku, saldo_yulius::float8 y from com_catalogo order by sku`,
    );
    expect(s.rows).toEqual([
      { sku: 'A', y: 14 },
      { sku: 'B', y: 3 },
    ]);
  });

  it('un traspaso ya ingresado no se vuelve a sumar', async () => {
    const id = await editor();
    await comoUsuario(db, id, () =>
      db.query(`select com_ingresar_traspaso('T-1', $1::jsonb)`, [JSON.stringify({ t1: 5, t2: 3 })]),
    );
    await expect(
      comoUsuario(db, id, () =>
        db.query(`select com_ingresar_traspaso('T-1', $1::jsonb)`, [JSON.stringify({ t1: 5, t2: 3 })]),
      ),
    ).rejects.toThrow(/ya se ingresó/);
    const s = await db.query<{ y: number }>(`select saldo_yulius::float8 y from com_catalogo where sku = 'A'`);
    expect(s.rows[0].y).toBe(15);
  });

  it('si falta una cantidad o es negativa, no se ingresa nada del traspaso', async () => {
    const id = await editor();
    await expect(
      comoUsuario(db, id, () =>
        db.query(`select com_ingresar_traspaso('T-1', $1::jsonb)`, [JSON.stringify({ t1: 5 })]),
      ),
    ).rejects.toThrow(/Falta la cantidad recibida de B/);
    await expect(
      comoUsuario(db, id, () =>
        db.query(`select com_ingresar_traspaso('T-1', $1::jsonb)`, [JSON.stringify({ t1: -1, t2: 3 })]),
      ),
    ).rejects.toThrow(/Falta la cantidad recibida de A/);
    const m = await db.query<{ estado: string }>(`select distinct estado from com_movimientos where folio = 'T-1'`);
    expect(m.rows).toEqual([{ estado: 'ordenado' }]);
    const s = await db.query<{ y: number }>(`select saldo_yulius::float8 y from com_catalogo where sku = 'A'`);
    expect(s.rows[0].y).toBe(10);
  });

  it('ingreso al CEDIS no toca saldos (el CEDIS lo manda Zoho)', async () => {
    const id = await editor();
    await comoUsuario(db, id, () =>
      db.query(`select com_ingresar_traspaso('T-2', $1::jsonb)`, [JSON.stringify({ t3: 4 })]),
    );
    const s = await db.query<{ c: number; y: number }>(
      `select saldo_cedis::float8 c, saldo_yulius::float8 y from com_catalogo where sku = 'A'`,
    );
    expect(s.rows[0]).toEqual({ c: 7, y: 10 });
    const m = await db.query<{ estado: string }>(`select estado from com_movimientos where id = 't3'`);
    expect(m.rows[0].estado).toBe('ingresado');
  });

  it('un usuario de solo lectura no puede ingresar', async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'lectura');
    await expect(
      comoUsuario(db, id, () =>
        db.query(`select com_ingresar_traspaso('T-1', $1::jsonb)`, [JSON.stringify({ t1: 5, t2: 3 })]),
      ),
    ).rejects.toThrow();
    const s = await db.query<{ y: number }>(`select saldo_yulius::float8 y from com_catalogo where sku = 'A'`);
    expect(s.rows[0].y).toBe(10);
  });
});
