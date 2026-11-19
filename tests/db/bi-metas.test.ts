import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 73: metas diarias con factores fijos por mes, P.E. diario y «metas» en bi_tablero.
let db: PGlite;
let u: string;
const L = (pedido: string, importe: number) => ({
  pedido,
  linea: 1,
  hora: 9,
  canal: 'mostrador',
  metodo_pago: 'CARTAO',
  tipo_pago: 'EMV',
  smartphone: false,
  opcion_consumo: null,
  codigo: '5IL',
  nombre: 'Iced Latte',
  unidades: 1,
  importe_cent: importe,
  descuento_cent: 0,
});
const servicio = async (sql: string, params: unknown[] = []) => {
  await db.exec('set role service_role');
  try {
    return await db.query<Record<string, any>>(sql, params);
  } finally {
    await db.exec('reset role');
  }
};
const guardar = (c: number, f: string, ls: unknown[]) =>
  servicio('select public.bi_guardar_dia($1,$2,$3,true,now(),$4,false)', ['pos', c, f, JSON.stringify(ls)]);
const tablero = async (p: Record<string, unknown>) =>
  comoUsuario(
    db,
    u,
    async () =>
      (await db.query<{ r: Record<string, any> }>('select public.bi_tablero($1) r', [JSON.stringify(p)]))
        .rows[0].r,
  );
const metaDe = async (c: number, f: string) =>
  (
    await servicio(
      `select venta_cent, tickets, factor_venta, factor_tickets, ventana_desde::text, ventana_hasta::text
     from bi_metas_diarias where company_id = $1 and fecha = $2`,
      [c, f],
    )
  ).rows[0];
const semana = { desde: '2026-11-02', hasta: '2026-11-08', companias: [513, 384] };

beforeAll(async () => {
  db = await crearDbLocal();
  u = await crearUsuario(db, 'sucursales');
  await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1,'bi','lectura')`, [u]);
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1,513),($1,384)', [u]);
  await servicio('delete from bi_tiendas');
  await servicio(`insert into bi_tiendas (company_id, store_id, nombre, franquiciatario, tipo, fecha_apertura, origen_apertura) values
    (513, 394, 'Namora', null, 'Sucursales Propias', '2024-03-01', 'crm'),
    (384, 301, 'Ventura', null, 'Sucursales Propias', '2023-11-27', 'pos')`);
  // Ventana de noviembre 2026 (el 1 es domingo): del lunes 3-ago al domingo 25-oct. 513 vende el lunes 19-oct
  // $100 y el sábado 24-oct $300: promedio $200, factor lunes 0.5 y sábado 1.5; los demás días, sin datos, 1.
  // La venta del lunes 26-oct ya no entra en la ventana.
  await guardar(513, '2026-10-19', [L('A', 10000)]);
  await guardar(513, '2026-10-24', [L('B', 30000)]);
  await guardar(513, '2026-10-26', [L('C', 999900)]);
  await servicio(`insert into bi_metas (company_id, mes, venta_cent, tickets, ticket_promedio_cent, fecha_apertura) values
    (513, '2026-11-01', 3000000, 300, 10000, null),
    (384, '2026-11-01', 1500000, 150, 10000, '2026-11-16')`);
  await servicio(
    `insert into bi_punto_equilibrio (company_id, mes, pe_cent) values (513, '2026-11-01', 3000000)`,
  );
  await servicio(`select public.bi_recalcular_metas('2026-11-01')`);
  // Semana del 2 al 8 de noviembre: carga del POS solo lunes y martes de 513.
  await guardar(513, '2026-11-02', [L('D', 60000)]);
  await guardar(513, '2026-11-03', [L('E', 50000), L('F', 40000)]);
});
afterAll(async () => db.close());

describe('bi_recalcular_metas', () => {
  it('reparte el mes con los factores de la ventana de 12 semanas antes del día 1', async () => {
    // Peso del mes: 5 lunes × 0.5 + 4 sábados × 1.5 + 21 días × 1 = 29.5.
    expect(await metaDe(513, '2026-11-02')).toMatchObject({
      venta_cent: 50847,
      factor_venta: '0.50',
      factor_tickets: '1.00',
      ventana_desde: '2026-08-03',
      ventana_hasta: '2026-10-25',
    });
    expect((await metaDe(513, '2026-11-07')).venta_cent).toBe(152542);
    expect((await metaDe(513, '2026-11-04')).venta_cent).toBe(101695);
    expect(Number((await metaDe(513, '2026-11-04')).tickets)).toBe(10);
    const total = await servicio(
      `select sum(venta_cent)::int s from bi_metas_diarias where company_id = 513`,
    );
    expect(Math.abs(total.rows[0].s - 3000000)).toBeLessThanOrEqual(5);
  });

  it('antes de la apertura de la meta vale 0 y el mes se reparte entre los días abiertos; sin historia, factor 1', async () => {
    expect((await metaDe(384, '2026-11-15')).venta_cent).toBe(0);
    expect(await metaDe(384, '2026-11-16')).toMatchObject({ venta_cent: 100000, factor_venta: '1.00' });
    const total = await servicio(
      `select sum(venta_cent)::int s from bi_metas_diarias where company_id = 384`,
    );
    expect(total.rows[0].s).toBe(1500000);
  });

  it('es idempotente, exige el día 1 y no se puede llamar desde el portal', async () => {
    const n = await servicio(`select public.bi_recalcular_metas('2026-11-01') n`);
    expect(n.rows[0].n).toBe(60);
    await expect(servicio(`select public.bi_recalcular_metas('2026-11-02')`)).rejects.toThrow(/día 1/);
    await expect(
      comoUsuario(db, u, () => db.query(`select public.bi_recalcular_metas('2026-11-01')`)),
    ).rejects.toThrow(/permission denied/);
    await expect(comoUsuario(db, u, () => db.query('select * from bi_metas_diarias'))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe('bi_tablero · metas', () => {
  it('meta del periodo, meta y venta corrientes (solo días con carga) y P.E.', async () => {
    const m = (await tablero(semana)).metas;
    expect(m).toMatchObject({
      tiendas: 2,
      tiendas_con_meta: 2,
      dias_sin_meta: 0,
      // 513: lunes 50,847 + 4 × 101,695 + sábado 152,542 + domingo 101,695; 384 todavía no abre (0).
      meta_cent: 711864,
      meta_corriente_cent: 50847 + 101695,
      venta_corriente_cent: 60000 + 90000,
      tickets_corriente: 3,
      meta_tickets_corriente: 20,
      tiendas_con_pe: 1,
      pe_cent: 700000,
      pe_corriente_cent: 200000,
      venta_pe_corriente_cent: 150000,
    });
    expect(m.por_tienda).toEqual([
      { company_id: 384, meta_cent: 0, meta_corriente_cent: 0, venta_corriente_cent: 0 },
      { company_id: 513, meta_cent: 711864, meta_corriente_cent: 152542, venta_corriente_cent: 150000 },
    ]);
    expect(m.pe_por_tienda).toEqual([
      { company_id: 513, pe_cent: 700000, pe_corriente_cent: 200000, venta_corriente_cent: 150000 },
    ]);
  });

  it('respeta el filtro de día de la semana y cuenta los días sin meta cargada', async () => {
    const lunes = (await tablero({ ...semana, dias: [1] })).metas;
    expect(lunes.meta_cent).toBe(50847);
    expect(lunes.pe_cent).toBe(100000);
    const diciembre = (await tablero({ desde: '2026-11-30', hasta: '2026-12-01', companias: [513, 384] }))
      .metas;
    expect(diciembre.dias_sin_meta).toBe(2);
    expect(diciembre.meta_cent).toBe(50847 + 100000);
  });

  it('sin metas ni P.E. en el periodo: ceros y listas vacías, nunca nulos', async () => {
    const m = (await tablero({ desde: '2026-10-05', hasta: '2026-10-06', companias: [513] })).metas;
    expect(m).toMatchObject({
      tiendas: 1,
      tiendas_con_meta: 0,
      dias_sin_meta: 2,
      meta_cent: 0,
      tiendas_con_pe: 0,
      pe_cent: 0,
      por_tienda: [],
      pe_por_tienda: [],
    });
  });
});
