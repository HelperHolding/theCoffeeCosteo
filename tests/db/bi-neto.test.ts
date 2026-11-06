import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 42: «Ventas Netas» = neto de la API (como Zoho); lo cobrado queda en importe_cent.
let db: PGlite;
let u: string;
const L = (pedido: string, n: number, x: Record<string, unknown> = {}) => ({
  pedido, linea: n, hora: 9, canal: 'mostrador', metodo_pago: 'CARTAO', tipo_pago: 'EMV', smartphone: false,
  opcion_consumo: null, codigo: '5IL', nombre: 'Iced Latte', unidades: 1, importe_cent: 10000, descuento_cent: 0, ...x,
});
const servicio = async (sql: string, params: unknown[] = []) => {
  await db.exec('set role service_role');
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const guardar = (c: number, f: string, ls: unknown[]) =>
  servicio('select public.bi_guardar_dia($1,$2,$3,$4,now(),$5,$6)', ['pos', c, f, true, JSON.stringify(ls), false]);
type T = Record<string, any>;
const tablero = (p: Record<string, unknown>) =>
  comoUsuario(db, u, async () => (await db.query<{ r: T }>('select public.bi_tablero($1) r', [JSON.stringify(p)])).rows[0].r);
const tendencias = (p: Record<string, unknown>) =>
  comoUsuario(db, u, async () => (await db.query<{ r: T }>('select public.bi_tendencias($1) r', [JSON.stringify(p)])).rows[0].r);
const base = { desde: '2026-10-05', hasta: '2026-10-05', companias: [513] };

beforeAll(async () => {
  db = await crearDbLocal();
  u = await crearUsuario(db, 'sucursales');
  await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1,'sucursales','lectura')`, [u]);
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1,513)', [u]);
  await servicio('delete from bi_tiendas');
  await servicio('delete from bi_mapeo_pago');
  await servicio('delete from bi_clasificacion_producto');
  await servicio(`insert into bi_tiendas (company_id, store_id, nombre, franquiciatario, tipo, fecha_apertura, origen_apertura)
    values (513, 394, 'Namora', null, 'Sucursales Propias', '2024-03-01', 'crm')`);
  await servicio(`insert into bi_clasificacion_producto (codigo, vigente_desde, categoria_master, grupo, contiene_cafe, promocion, origen)
    values ('5IL','2026-01-01','Bebida Fría','Bebida','Sí','Producto regular','prueba')`);
  // Un pedido con neto (3 % menos), otro sin neto (cae al bruto).
  await guardar(513, '2026-10-05', [
    L('A', 1, { importe_cent: 10000, importe_neto_cent: 9700 }),
    L('B', 1, { importe_cent: 5000 }),
  ]);
});
afterAll(async () => db.close());

describe('migración 42: venta neta', () => {
  it('el guardado escribe el neto; sin neto cae al bruto', async () => {
    const r = await servicio('select pedido, importe_cent::int b, importe_neto_cent::int n from bi_lineas order by pedido');
    expect(r.rows).toEqual([{ pedido: 'A', b: 10000, n: 9700 }, { pedido: 'B', b: 5000, n: 5000 }]);
  });

  it('un cambio solo de neto reescribe el día', async () => {
    await guardar(513, '2026-10-07', [L('N', 1, { importe_neto_cent: 9000 })]);
    await guardar(513, '2026-10-07', [L('N', 1, { importe_neto_cent: 9500 })]);
    const r = await servicio(`select importe_neto_cent::int n from bi_lineas where fecha = '2026-10-07'`);
    expect(r.rows).toEqual([{ n: 9500 }]);
    await servicio(`delete from bi_lineas where fecha = '2026-10-07'`);
    await servicio(`delete from bi_cargas where fecha = '2026-10-07'`);
  });

  it('kpis.venta_cent usa el neto y venta_bruta_cent lo cobrado', async () => {
    const r = await tablero(base);
    expect(r.kpis).toMatchObject({ venta_cent: 9700 + 5000, venta_bruta_cent: 15000, tickets: 2 });
  });

  it('los bloques suman el neto', async () => {
    const r = await tablero(base);
    expect(r.por_grupo[0].venta_cent).toBe(14700);
    expect(r.por_hora[0].venta_cent).toBe(14700);
    expect(r.por_pago[0].venta_cent).toBe(14700);
    expect(r.ranking[0].venta_cent).toBe(14700);
    expect(r.fuentes[0].venta_cent).toBe(14700);
    expect(r.promociones[0].venta_cent).toBe(14700);
  });

  it('el filtro de monto va sobre el neto de la línea', async () => {
    // Bruto 100.00 pero neto 97.00: con monto_max 98 entra; con monto_min 99 no.
    expect((await tablero({ ...base, monto_max: 98 })).kpis.venta_cent).toBe(9700 + 5000);
    expect((await tablero({ ...base, monto_min: 99 })).kpis.venta_cent).toBe(0);
    expect((await tablero({ ...base, monto_min: 96, monto_max: 97 })).kpis.venta_cent).toBe(9700);
  });

  it('bi_tendencias usa el neto', async () => {
    const r = await tendencias({ companias: [513], hoy: '2026-10-31' });
    expect(r.por_mes[0].venta_cent).toBe(14700);
    expect(r.por_semana[0].venta_cent).toBe(14700);
  });
});
