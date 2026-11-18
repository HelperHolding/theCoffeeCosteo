import { describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo, num } from './utilidades';

const VISTAS = ['com_legado_pedidos', 'com_legado_pedidos_apertura', 'com_legado_aperturas'];

describe('puente legado (migración 46)', () => {
  it('service_role lee los pedidos del sitio viejo por las vistas, con las columnas de minmax e Inicio', async () => {
    const db = await crearDbLocal();
    await db.exec(`
      insert into legado.aperturas (id, estatus, fecha) values ('A1', 'en_proceso', '2026-12-01');
      insert into legado.pedidos (id, apertura_id, fecha_pedido, status, items)
        values ('00000000-0000-0000-0000-000000000001', 'A1', now(), 'entregado', '[]');
      insert into legado.pedidos_apertura (pedido_id) values ('00000000-0000-0000-0000-000000000001');`);
    await db.exec('set role service_role');
    const n = await db.query<{ n: number }>('select count(*) n from com_legado_pedidos');
    const cols = await db.query<{ c: string }>(`
      select column_name c from information_schema.columns where table_name = 'com_legado_pedidos' order by ordinal_position`);
    await db.exec('reset role');
    expect(num(n.rows[0].n)).toBe(1);
    expect(cols.rows.map((f) => f.c)).toEqual([
      'id', 'apertura_id', 'fecha_pedido', 'status', 'items', 'items_editados', 'franquiciatario_email',
      'notas_shopify', 'es_llenado_canal', 'marketing_proyecto_id', 'monto', 'shopify_order_number',
    ]);
  });

  it.each(VISTAS)('%s: ni un usuario con Comercializadora la lee', async (vista) => {
    const db = await crearDbLocal();
    const id = await crearUsuario(db, 'admin');
    await darModulo(db, id, 'comercializadora', 'desarrollador');
    await expect(comoUsuario(db, id, () => db.query(`select * from ${vista}`))).rejects.toThrow(/permission denied/);
  });

  it('el esquema legado no se expone a usuarios', async () => {
    const db = await crearDbLocal();
    const r = await db.query<{ ok: boolean }>(`
      select has_schema_privilege('authenticated', 'legado', 'USAGE') or has_schema_privilege('anon', 'legado', 'USAGE') ok`);
    expect(r.rows[0].ok).toBe(false);
  });
});
