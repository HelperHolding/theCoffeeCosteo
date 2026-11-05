import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 39: base del BI. Tablas cerradas; un día se guarda y reemplaza por RPC de servicio.
let db: PGlite;
let u: string;
const linea = (pedido: string, n: number, extra: Record<string, unknown> = {}) => ({
  pedido,
  linea: n,
  hora: 9,
  canal: 'mostrador',
  metodo_pago: 'CARTAO',
  tipo_pago: 'EMV',
  smartphone: false,
  opcion_consumo: null,
  codigo: '5IL',
  nombre: 'Iced Latte',
  unidades: 1,
  importe_cent: 8000,
  descuento_cent: 0,
  ...extra,
});
const guardar = async (fuente: string, company: number, fecha: string, lineas: unknown[], completa = true) => {
  await db.exec('set role service_role');
  try {
    return (
      await db.query<{ n: number }>('select public.bi_guardar_dia($1, $2, $3, $4, now(), $5) n', [
        fuente,
        company,
        fecha,
        completa,
        JSON.stringify(lineas),
      ])
    ).rows[0].n;
  } finally {
    await db.exec('reset role');
  }
};

beforeAll(async () => {
  db = await crearDbLocal();
  u = await crearUsuario(db, 'sucursales');
  await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'sucursales', 'lectura')`, [u]);
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1, 513)', [u]);
});
afterAll(async () => db.close());

describe('migración 39: base del BI', () => {
  it('tablas y guardado cerrados al portal', async () => {
    for (const t of ['bi_lineas', 'bi_cargas', 'bi_tiendas', 'bi_clasificacion_producto', 'bi_mapeo_pago', 'bi_metas', 'bi_punto_equilibrio'])
      await expect(comoUsuario(db, u, () => db.query(`select * from ${t}`))).rejects.toThrow(/permission denied/);
    await expect(
      comoUsuario(db, u, () => db.query(`select public.bi_guardar_dia('pos', 513, '2026-10-01', true, now(), '[]')`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('guarda un día con su carga y marca si trae Rappi', async () => {
    expect(await guardar('pos', 513, '2026-10-01', [linea('1', 1), linea('1', 2, { codigo: 'BRO13', nombre: 'Brownie' }), linea('2', 1, { canal: 'rappi', metodo_pago: 'RAPPI' })])).toBe(3);
    const c = await db.query<{ completa: boolean; rappi_en_pos: boolean }>(
      `select completa, rappi_en_pos from bi_cargas where fuente = 'pos' and company_id = 513 and fecha = '2026-10-01'`,
    );
    expect(c.rows[0]).toEqual({ completa: true, rappi_en_pos: true });
  });

  it('volver a guardar el día lo reemplaza: sin duplicados ni líneas viejas', async () => {
    expect(await guardar('pos', 513, '2026-10-01', [linea('9', 1)], false)).toBe(1);
    const r = await db.query<{ pedido: string }>(`select pedido from bi_lineas where company_id = 513 and fecha = '2026-10-01'`);
    expect(r.rows.map((x) => x.pedido)).toEqual(['9']);
    const c = await db.query<{ completa: boolean; rappi_en_pos: boolean }>(
      `select completa, rappi_en_pos from bi_cargas where fuente = 'pos' and company_id = 513 and fecha = '2026-10-01'`,
    );
    expect(c.rows[0]).toEqual({ completa: false, rappi_en_pos: false });
  });

  it('rechaza fuente, canal u hora inválidos', async () => {
    await expect(guardar('uber', 513, '2026-10-02', [])).rejects.toThrow();
    await expect(guardar('pos', 513, '2026-10-02', [linea('1', 1, { canal: 'uber' })])).rejects.toThrow();
    await expect(guardar('pos', 513, '2026-10-02', [linea('1', 1, { hora: 24 })])).rejects.toThrow();
  });
});
