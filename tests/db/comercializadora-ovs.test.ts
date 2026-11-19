import type { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { crearInsumo } from './fabricas';
import { comoUsuario, crearUsuario, darModulo, num } from './utilidades';

// Migración 72: piloto de la orden de venta sugerida (spec 2026-11-18-ov-sugerida-piloto-design.md, §6).
const SQL = readFileSync('supabase/migrations/20261119000072_comercializadora_ovs.sql', 'utf8');
const SEMILLA = SQL.slice(SQL.indexOf('-- semilla:inicio'), SQL.indexOf('-- semilla:fin'));

async function comoServicio<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec('set role service_role');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
const guardar = (db: PGlite, semana: string, lineas: unknown, estado = 'ok', error: string | null = null) =>
  comoServicio(db, async () =>
    num(
      (
        await db.query<{ id: number }>('select public.com_ovs_guardar($1, 519, 14, $2, $3, $4::jsonb) id', [
          semana,
          estado,
          error,
          JSON.stringify(lineas),
        ])
      ).rows[0].id,
    ),
  );
const LINEA = {
  sku: 'INS-CAF-003',
  nombre: 'Cafe en Grano White 1.5 Kg',
  origen: 'receta',
  k: 1.2,
  diario: 1.2,
  necesidad: 16.8,
  ya_pedido: 0,
  arrastre: 0.1,
  sugerido: 13,
  monto: 5460,
};

describe('migración 72: tablas del piloto de OV sugerida', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await crearDbLocal();
  });
  afterAll(async () => db.close());

  it('carga las tres tiendas del piloto por apertura', async () => {
    const r = await db.query('select company_id, apertura_id, nombre, activo from com_ovs_tiendas order by company_id');
    expect(r.rows).toEqual([
      { company_id: 460, apertura_id: '354', nombre: 'Pasaje Parián', activo: true },
      { company_id: 463, apertura_id: '347', nombre: 'Avándaro', activo: true },
      { company_id: 519, apertura_id: '411', nombre: 'La Mexicana', activo: true },
    ]);
  });

  it('com_ovs_guardar crea la corrida y repetirla en la misma semana la reemplaza', async () => {
    const id1 = await guardar(db, '2026-11-16', [
      LINEA,
      { ...LINEA, sku: 'INS-DES-021', k: 1, sugerido: 2, arrastre: -0.6 },
    ]);
    const id2 = await guardar(db, '2026-11-16', [{ ...LINEA, sugerido: 12 }]);
    expect(id2).toBe(id1);
    const c = await db.query<{ n: number }>(`select count(*)::int n from com_ovs_corridas where company_id = 519`);
    expect(c.rows[0].n).toBe(1);
    const l = await db.query('select sku, sugerido from com_ovs_lineas where corrida_id = $1', [id1]);
    expect(l.rows).toEqual([{ sku: 'INS-CAF-003', sugerido: 12 }]);
  });

  it('una corrida con error queda sin líneas y con el motivo', async () => {
    const id = await guardar(db, '2026-11-23', [], 'error', 'POS: sin respuesta');
    const c = await db.query('select estado, error, cadencia from com_ovs_corridas where id = $1', [id]);
    expect(c.rows).toEqual([{ estado: 'error', error: 'POS: sin respuesta', cadencia: 14 }]);
    const l = await db.query<{ n: number }>('select count(*)::int n from com_ovs_lineas where corrida_id = $1', [id]);
    expect(l.rows[0].n).toBe(0);
  });

  it('un reintento con error no pisa una corrida buena de la misma semana', async () => {
    const ok = await guardar(db, '2026-11-30', [{ ...LINEA, sugerido: 7 }]);
    const re = await guardar(db, '2026-11-30', [], 'error', 'POS: sin respuesta');
    expect(re).toBe(ok);
    const c = await db.query('select estado, error from com_ovs_corridas where id = $1', [ok]);
    expect(c.rows).toEqual([{ estado: 'ok', error: null }]);
    const l = await db.query('select sugerido from com_ovs_lineas where corrida_id = $1', [ok]);
    expect(l.rows).toEqual([{ sugerido: 7 }]);
  });

  it('rechaza una semana que no es lunes y un p_lineas que no es arreglo', async () => {
    await expect(guardar(db, '2026-11-18', [])).rejects.toThrow(/check/i);
    await expect(guardar(db, '2026-12-07', {})).rejects.toThrow(/arreglo/);
  });

  it('Comercializadora lee; nadie más escribe ni llama a com_ovs_guardar', async () => {
    const editor = await crearUsuario(db, 'interno');
    await darModulo(db, editor, 'comercializadora', 'edicion');
    const sinModulo = await crearUsuario(db, 'admin');
    await comoUsuario(db, editor, async () => {
      expect((await db.query('select * from com_ovs_tiendas')).rows).toHaveLength(3);
      expect((await db.query('select * from com_ovs_lineas')).rows.length).toBeGreaterThan(0);
      await expect(
        db.query(`insert into com_ovs_tiendas (company_id, apertura_id, nombre) values (1, '1', 'x')`),
      ).rejects.toThrow(/permission denied/);
      await expect(db.query('update com_ovs_lineas set sugerido = 99')).rejects.toThrow(/permission denied/);
      await expect(
        db.query(`select public.com_ovs_guardar('2026-11-16', 519, 14, 'ok', null, '[]')`),
      ).rejects.toThrow(/permission denied/);
    });
    await comoUsuario(db, sinModulo, async () => {
      expect((await db.query('select * from com_ovs_tiendas')).rows).toHaveLength(0);
      expect((await db.query('select * from com_ovs_corridas')).rows).toHaveLength(0);
    });
  });

  it('un insumo no puede tener dos SKUs activos', async () => {
    const id = await crearInsumo(db, { nombre: 'MENTA PRUEBA', costoPaquete: 1, presentacion: 3000, unidad: 'ml' });
    await db.exec(`insert into com_catalogo (sku, nombre) values ('MEN-1', 'Menta 1'), ('MEN-2', 'Menta 2')`);
    await db.query(`insert into com_insumo_sku (insumo_id, sku, factor) values ($1, 'MEN-1', 3000)`, [id]);
    await expect(
      db.query(`insert into com_insumo_sku (insumo_id, sku, factor) values ($1, 'MEN-2', 3000)`, [id]),
    ).rejects.toThrow(/com_insumo_sku_un_activo/);
    await db.query(`insert into com_insumo_sku (insumo_id, sku, factor, activo) values ($1, 'MEN-2', 3000, false)`, [
      id,
    ]);
  });
});

describe('migración 72: carga inicial del mapeo', () => {
  it('trae las 50 filas del anexo', () => {
    expect(SEMILLA.match(/^\s+\('/gm)).toHaveLength(50);
  });

  it('resuelve por nombre exacto del insumo y SKU del catálogo, con las presentaciones corregidas; repetirla no duplica', async () => {
    const db = await crearDbLocal('20261119000071');
    try {
      const insumos = [
        ['VASO CALIENTE PAPEL KRAFT 12 OZ (1,000 PZS)', 1000, 'pza'],
        ['VASO ESPRESSO PAPEL KRAFT 4 OZ (500 PZS)', 500, 'pza'],
        ['CHIP DE SABOR CHOCOLATE 1 KG', 1000, 'gr'],
        ['CAFÉ TOSTADO EN GRANO WHITE 1.5 KG', 1500, 'gr'],
        // Su SKU (INS-BEB-069) no está en este catálogo: no entra.
        ['JARABE DE MENTA 1 LT (3 PZAS)', 3000, 'ml'],
        // No está en el mapeo.
        ['LECHE ENTERA', 1000, 'ml'],
      ] as const;
      for (const [nombre, presentacion, unidad] of insumos)
        await crearInsumo(db, { nombre, costoPaquete: 100, presentacion, unidad });
      await db.exec(`insert into com_catalogo (sku, nombre, estatus) values
        ('INS-DES-021', 'Vaso Caliente Grande 12 Oz (500 Pzs)', 'Compra Recurrente'),
        ('INS-DES-002', 'Vaso Espresso 4 Oz (2;500 Pzs)', 'Compra Recurrente'),
        ('INS-BEB-047', 'Chips de Chocolate 500g', 'Compra Recurrente'),
        ('INS-CAF-003', 'Cafe en Grano White 1.5 Kg', 'Compra Recurrente')`);
      await db.exec(SQL);
      const mapeo = async () =>
        (
          await db.query(
            `select i.nombre, m.sku, m.factor::float8 factor, m.activo
             from com_insumo_sku m join insumos i on i.id = m.insumo_id order by m.sku`,
          )
        ).rows;
      expect(await mapeo()).toEqual([
        { nombre: 'CHIP DE SABOR CHOCOLATE 1 KG', sku: 'INS-BEB-047', factor: 500, activo: true },
        { nombre: 'CAFÉ TOSTADO EN GRANO WHITE 1.5 KG', sku: 'INS-CAF-003', factor: 1500, activo: true },
        { nombre: 'VASO ESPRESSO PAPEL KRAFT 4 OZ (500 PZS)', sku: 'INS-DES-002', factor: 2500, activo: true },
        { nombre: 'VASO CALIENTE PAPEL KRAFT 12 OZ (1,000 PZS)', sku: 'INS-DES-021', factor: 500, activo: true },
      ]);
      await db.exec(SEMILLA);
      expect(await mapeo()).toHaveLength(4);
      expect(num((await db.query<{ n: number }>('select count(*) n from com_ovs_tiendas')).rows[0].n)).toBe(3);
      // Costeo no cambia: la presentación del insumo sigue como estaba.
      const p = await db.query<{ presentacion: number }>(
        `select presentacion::float8 presentacion from insumos where nombre = 'VASO CALIENTE PAPEL KRAFT 12 OZ (1,000 PZS)'`,
      );
      expect(p.rows[0].presentacion).toBe(1000);
    } finally {
      await db.close();
    }
  });
});
