import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo, num } from './utilidades';

describe('migración 48', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await crearDbLocal();
    await db.exec(`
      insert into com_catalogo (sku, nombre, saldo_yulius) values ('A', 'Café', 10), ('B', 'Vasos', null);
      insert into com_minmax (sku, lead_time, minimo_calc, maximo_calc) values ('A', 5, 20, 40);
      insert into com_kit_apertura (sku, promedio_calc) values ('A', 3);`);
  });

  it('minimo, maximo y kit son coalesce(manual, calculado) y no se pueden escribir', async () => {
    await db.exec(`update com_minmax set minimo_manual = 25 where sku = 'A'; update com_kit_apertura set manual = 7 where sku = 'A';`);
    const r = await db.query<{ minimo: string; maximo: string; kit: string }>(
      `select minimo, maximo, (select kit from com_kit_apertura where sku = 'A') kit from com_minmax where sku = 'A'`);
    expect(r.rows[0]).toEqual({ minimo: '25', maximo: '40', kit: '7' });
    await expect(db.exec(`update com_minmax set minimo = 1`)).rejects.toThrow(/can only be updated to DEFAULT|generated/i);
  });

  it('ajuste de 3PL: cambia el saldo y registra el movimiento en una sola operación', async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'edicion');
    const n = await comoUsuario(db, id, async () =>
      num((await db.query<{ n: number }>(
        `select com_ajustar_3pl($1::jsonb, 'Ana', 'Luis', '2026-11-13', 'Conteo físico') n`,
        [JSON.stringify([{ sku: 'A', actual: 10, nuevo: 12, costo: 50 }, { sku: 'B', actual: null, nuevo: 4, costo: null }])],
      )).rows[0].n));
    expect(n).toBe(2);
    const s = await db.query<{ sku: string; saldo_yulius: string }>(`select sku, saldo_yulius from com_catalogo order by sku`);
    expect(s.rows.map((x) => [x.sku, Number(x.saldo_yulius)])).toEqual([['A', 12], ['B', 4]]);
    const m = await db.query(`select sku, tipo, cantidad::float8 c, cantidad_original::float8 o, saldo_nuevo::float8 sn, origen, destino, estado, motivo, realizado_por, autorizado_por, fecha_conteo::text f, costo_unitario_momento::float8 cu from com_movimientos order by sku`);
    expect(m.rows[0]).toMatchObject({ sku: 'A', tipo: 'ajuste', c: 2, o: 10, sn: 12, origen: 'YULIUS', destino: 'YULIUS', estado: 'aplicado', motivo: 'Conteo físico', realizado_por: 'Ana', autorizado_por: 'Luis', f: '2026-11-13', cu: 50 });
    expect(m.rows[1]).toMatchObject({ sku: 'B', c: 4, o: 0 });
  });

  it('si un saldo cambió desde que se leyó, no se aplica nada del lote', async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'edicion');
    await expect(
      comoUsuario(db, id, () =>
        db.query(`select com_ajustar_3pl($1::jsonb, 'Ana', 'Luis', '2026-11-13', 'Merma')`, [
          JSON.stringify([{ sku: 'A', actual: 10, nuevo: 9, costo: 50 }, { sku: 'B', actual: 3, nuevo: 1, costo: null }]),
        ]),
      ),
    ).rejects.toThrow(/El saldo de B cambió/);
    const s = await db.query<{ saldo_yulius: string | null }>(`select saldo_yulius from com_catalogo order by sku`);
    expect(s.rows.map((x) => x.saldo_yulius)).toEqual(['10', null]);
    expect((await db.query(`select * from com_movimientos`)).rows).toHaveLength(0);
  });

  it('saldo negativo y sin diferencia se rechazan', async () => {
    await expect(db.query(`select com_ajustar_3pl($1::jsonb, 'Ana', 'Luis', null, 'Merma')`, [JSON.stringify([{ sku: 'A', actual: 10, nuevo: -1 }])])).rejects.toThrow(/negativo/);
    await expect(db.query(`select com_ajustar_3pl($1::jsonb, 'Ana', 'Luis', null, 'Merma')`, [JSON.stringify([])])).rejects.toThrow(/Ninguna línea/);
  });

  it('lectura no puede ajustar (la RLS de com_catalogo lo impide)', async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'lectura');
    await expect(
      comoUsuario(db, id, () => db.query(`select com_ajustar_3pl($1::jsonb, 'Ana', 'Luis', null, 'Merma')`, [JSON.stringify([{ sku: 'A', actual: 10, nuevo: 9 }])])),
    ).rejects.toThrow(/cambió|permission denied/);
    expect((await db.query<{ s: string }>(`select saldo_yulius s from com_catalogo where sku = 'A'`)).rows[0].s).toBe('10');
  });

  it('autorizadores: activos con edición o desarrollador; nada para quien no tiene el módulo', async () => {
    const ed = await crearUsuario(db, 'interno');
    await darModulo(db, ed, 'comercializadora', 'edicion');
    const lec = await crearUsuario(db, 'franquiciado');
    await darModulo(db, lec, 'comercializadora', 'lectura');
    const sin = await crearUsuario(db, 'admin');
    const nombres = (uid: string) => comoUsuario(db, uid, async () => (await db.query<{ nombre: string }>(`select nombre from com_autorizadores()`)).rows.map((r) => r.nombre));
    expect(await nombres(lec)).toEqual(['Usuario interno']);
    expect(await nombres(sin)).toEqual([]);
  });
});
