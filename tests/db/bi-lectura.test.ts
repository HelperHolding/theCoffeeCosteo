import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 40 (3/3): lectura del tablero con los 17 filtros, siempre con sucursales_acceso.
let db: PGlite;
let u: string;
let otro: string;
const L = (pedido: string, n: number, x: Record<string, unknown> = {}) => ({
  pedido, linea: n, hora: 9, canal: 'mostrador', metodo_pago: 'CARTAO', tipo_pago: 'EMV', smartphone: false,
  opcion_consumo: null, codigo: '5IL', nombre: 'Iced Latte', unidades: 1, importe_cent: 8000, descuento_cent: 0, ...x,
});
const servicio = async (sql: string, params: unknown[] = []) => {
  await db.exec('set role service_role');
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const guardar = (fuente: string, c: number, f: string, ls: unknown[], completa = true, rappiPortal = false) =>
  servicio('select public.bi_guardar_dia($1,$2,$3,$4,now(),$5,$6)', [fuente, c, f, completa, JSON.stringify(ls), rappiPortal]);
type T = Record<string, any>;
const tablero = (user: string, p: Record<string, unknown>) =>
  comoUsuario(db, user, async () => (await db.query<{ r: T }>('select public.bi_tablero($1) r', [JSON.stringify(p)])).rows[0].r);
const tendencias = (user: string, p: Record<string, unknown>) =>
  comoUsuario(db, user, async () => (await db.query<{ r: T }>('select public.bi_tendencias($1) r', [JSON.stringify(p)])).rows[0].r);
const base = { desde: '2026-10-05', hasta: '2026-10-06', companias: [513, 384, 532] };

beforeAll(async () => {
  db = await crearDbLocal();
  u = await crearUsuario(db, 'sucursales');
  otro = await crearUsuario(db, 'sucursales');
  for (const x of [u, otro]) await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1,'sucursales','lectura')`, [x]);
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1,513),($1,384),($2,532)', [u, otro]);
  // La migración 41 ya sembró datos reales: la prueba parte de tablas vacías para controlar sus propios datos.
  await servicio('delete from bi_tiendas');
  await servicio('delete from bi_mapeo_pago');
  await servicio('delete from bi_clasificacion_producto');
  await servicio(`insert into bi_tiendas (company_id, store_id, nombre, franquiciatario, tipo, fecha_apertura, origen_apertura) values
    (513, 394, 'Namora', null, 'Sucursales Propias', '2024-03-01', 'crm'),
    (384, 301, 'Ventura', null, 'Sucursales Propias', '2023-11-27', 'pos'),
    (532, 455, 'Ruben Dario', null, 'Sucursales Propias', '2025-01-10', 'crm')`);
  await servicio(`insert into bi_mapeo_pago (metodo_pos, tipo_pos, smartphone, etiqueta) values
    ('CARTAO','EMV',false,'TABLET - CARD'),('RAPPI','',false,'RAPPI')`);
  await servicio(`insert into bi_clasificacion_producto (codigo, vigente_desde, categoria_master, grupo, contiene_cafe, promocion, origen) values
    ('5IL','2026-01-01','Bebida Fría','Bebida','Sí','Producto regular','prueba'),
    ('5IL','2026-10-06','Bebidas Calientes','Bebida','Sí','Producto regular','prueba'),
    ('BRO13','2026-01-01','Panadería Dulce','Comida',null,'Promoción alimentos y bebidas','prueba')`);
  // Lunes 5-oct: Namora (513) con Rappi del POS; Ventura (384) sin; 532 no es del usuario.
  await guardar('pos', 513, '2026-10-05', [
    L('A', 1), L('A', 2, { codigo: 'BRO13', nombre: 'Brownie', importe_cent: 5000 }),
    L('B', 1, { hora: 15 }),
    L('R1', 1, { canal: 'rappi', metodo_pago: 'RAPPI', tipo_pago: '', importe_cent: 9000 }),
  ]);
  await guardar('pos', 384, '2026-10-05', [L('C', 1, { importe_cent: 7000 })]);
  await guardar('pos', 532, '2026-10-05', [L('Z', 1, { importe_cent: 99900 })]);
  // Rappi de Zoho: se ignora en 513 (ya trae Rappi del POS ese día) y se suma en 384.
  await guardar('zoho_rappi', 513, '2026-10-05', [L('ZR1', 1, { canal: 'rappi', metodo_pago: 'RAPPI', tipo_pago: '', importe_cent: 9000 })]);
  await guardar('zoho_rappi', 384, '2026-10-05', [L('ZR2', 1, { canal: 'rappi', metodo_pago: 'RAPPI', tipo_pago: '', importe_cent: 4000 })]);
  // Martes 6-oct: solo 513, con la clasificación nueva; 384 sin carga ese día.
  await guardar('pos', 513, '2026-10-06', [L('D', 1)], false);
  // Mes anterior (miércoles 30-sep, semana 40).
  await guardar('pos', 513, '2026-09-30', [L('E', 1, { importe_cent: 3000 })]);
});
afterAll(async () => db.close());

describe('bi_tablero', () => {
  it('solo sucursales del usuario; tablas cerradas', async () => {
    const r = await tablero(u, base);
    expect(r.kpis.venta_cent).toBe(8000 + 5000 + 8000 + 9000 + 7000 + 4000 + 8000);
    expect(r.kpis.venta_bruta_cent).toBe(r.kpis.venta_cent); // sin neto en estas filas, neto = cobrado
    const o = await tablero(otro, base);
    expect(o.kpis.venta_cent).toBe(99900);
    await expect(comoUsuario(db, u, () => db.query('select * from bi_lineas'))).rejects.toThrow(/permission denied/);
  });

  it('bi_lineas_filtradas no se puede llamar directo desde el portal', async () => {
    await expect(
      comoUsuario(db, u, () => db.query(`select * from public.bi_lineas_filtradas('{"companias":[532]}'::jsonb, '2026-10-05', '2026-10-06', true)`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('Rappi de Zoho solo donde el POS no trae Rappi ese día', async () => {
    const r = await tablero(u, base);
    // Se distingue el Rappi del portal (pos / rappi) del de Zoho (zoho_rappi / rappi).
    expect(r.fuentes).toEqual([
      { fuente: 'pos', canal: 'mostrador', venta_cent: 8000 + 5000 + 8000 + 7000 + 8000 },
      { fuente: 'pos', canal: 'rappi', venta_cent: 9000 },
      { fuente: 'zoho_rappi', canal: 'rappi', venta_cent: 4000 },
    ]);
    expect(r.kpis.tickets).toBe(6); // A, B, R1, C, ZR2, D
  });

  it('un filtro de producto cuenta los tickets que lo contienen', async () => {
    const r = await tablero(u, { ...base, productos: ['Brownie'] });
    expect(r.kpis).toMatchObject({ venta_cent: 5000, tickets: 1, lineas: 1 });
  });

  it('filtros de pago, hora, día y monto se combinan en todos los bloques', async () => {
    const r = await tablero(u, { ...base, pagos: ['TABLET - CARD'], horas: [9], dias: [1], monto_min: 60, monto_max: 100 });
    expect(r.kpis).toMatchObject({ venta_cent: 15000, tickets: 2 });
    expect(r.por_hora).toEqual([{ hora: 9, venta_cent: 15000, tickets: 2 }]);
  });

  it('clasificación vigente en la fecha de la venta', async () => {
    const r = await tablero(u, { ...base, categorias: ['Bebidas Calientes'] });
    expect(r.kpis.venta_cent).toBe(8000);
  });

  it('dice qué días no tienen carga (nunca cero)', async () => {
    const r = await tablero(u, base);
    expect(r.cargas).toEqual({ esperados: 4, con_carga: 3, incompletos: 1 });
  });

  it('compañías duplicadas no inflen cargas ni ventas', async () => {
    const r = await tablero(u, { ...base, companias: [513, 513, 384, 384] });
    expect(r.cargas).toEqual({ esperados: 4, con_carga: 3, incompletos: 1 });
    expect(r.kpis.venta_cent).toBe(8000 + 5000 + 8000 + 9000 + 7000 + 4000 + 8000);
  });

  it('cargas solo cuenta tiendas que pasan los filtros de tienda', async () => {
    const h = { ...base, hoy: '2026-10-06' };
    expect((await tablero(u, { ...h, tipos: ['Franquicia'] })).cargas).toEqual({ esperados: 0, con_carga: 0, incompletos: 0 });
    expect((await tablero(u, { ...h, tipos: ['Sucursales Propias'] })).cargas.esperados).toBe(4);
    // hoy = 2025-01-01: solo Ventura (13 meses) es comparable.
    expect((await tablero(u, { ...base, hoy: '2025-01-01', comparable: true })).cargas.esperados).toBe(0);
  });

  it('cargas recorta cada tienda a [apertura, hoy]: ni días previos a abrir ni futuros son faltantes', async () => {
    // Ruben Darío (532) abre el 2025-01-10; el rango empieza antes.
    const antes = await tablero(otro, { desde: '2025-01-08', hasta: '2025-01-12', companias: [532], hoy: '2026-10-06' });
    expect(antes.cargas.esperados).toBe(3); // 10, 11 y 12 de enero
    // Hoy es 2026-10-05: el 6 de octubre todavía no llega.
    const futuro = await tablero(u, { ...base, hoy: '2026-10-05' });
    expect(futuro.cargas).toEqual({ esperados: 2, con_carga: 2, incompletos: 0 });
  });

  it('rechaza rangos inválidos', async () => {
    await expect(tablero(u, { ...base, desde: '2026-10-07' })).rejects.toThrow(/Periodo inválido/);
  });

  it('por_dia, por_tienda_dia y por_pago', async () => {
    const r = await tablero(u, base);
    expect(r.por_dia).toEqual([
      { dow: 1, venta_cent: 41000, tickets: 5 },
      { dow: 2, venta_cent: 8000, tickets: 1 },
    ]);
    expect(r.por_tienda_dia).toEqual([
      { company_id: 384, dow: 1, venta_cent: 11000, tickets: 2 },
      { company_id: 513, dow: 1, venta_cent: 30000, tickets: 3 },
      { company_id: 513, dow: 2, venta_cent: 8000, tickets: 1 },
    ]);
    expect(r.por_pago).toEqual([
      { etiqueta: 'TABLET - CARD', venta_cent: 36000, tickets: 4 },
      { etiqueta: 'RAPPI', venta_cent: 13000, tickets: 2 },
    ]);
  });

  it('por_pago_tienda', async () => {
    const r = await tablero(u, base);
    expect(r.por_pago_tienda).toEqual([
      { etiqueta: 'RAPPI', company_id: 513, venta_cent: 9000 },
      { etiqueta: 'RAPPI', company_id: 384, venta_cent: 4000 },
      { etiqueta: 'TABLET - CARD', company_id: 513, venta_cent: 29000 },
      { etiqueta: 'TABLET - CARD', company_id: 384, venta_cent: 7000 },
    ]);
  });

  it('promociones por tienda', async () => {
    const r = await tablero(u, base);
    expect(r.promociones).toEqual([
      { company_id: 384, promocion: 'Producto regular', unidades: 2, venta_cent: 11000 },
      { company_id: 513, promocion: 'Producto regular', unidades: 4, venta_cent: 33000 },
      { company_id: 513, promocion: 'Promoción alimentos y bebidas', unidades: 1, venta_cent: 5000 },
    ]);
  });

  it('ranking por mes', async () => {
    const r = await tablero(u, { ...base, desde: '2026-09-30' });
    expect(r.ranking).toEqual([
      { codigo: '5IL', nombre: 'Iced Latte', mes: '2026-09-01', unidades: 1, venta_cent: 3000, lineas: 1 },
      { codigo: '5IL', nombre: 'Iced Latte', mes: '2026-10-01', unidades: 6, venta_cent: 44000, lineas: 6 },
      { codigo: 'BRO13', nombre: 'Brownie', mes: '2026-10-01', unidades: 1, venta_cent: 5000, lineas: 1 },
    ]);
  });

  it('semanas con la etiqueta de Zoho (W41 2026, sin ceros)', async () => {
    expect((await tablero(u, { ...base, semanas: ['W41 2026'] })).kpis.venta_cent).toBe(49000);
    expect((await tablero(u, { ...base, semanas: ['W40 2026'] })).kpis.venta_cent).toBe(0);
    expect((await tablero(u, { ...base, desde: '2026-09-30', semanas: ['W40 2026'] })).kpis.venta_cent).toBe(3000);
  });

  it('comparable y años operando se miden contra hoy, no contra la fecha de la venta', async () => {
    // hoy = 2025-01-01: Namora 10 meses (no comparable, 0 años); Ventura 13 meses (comparable, 1 año).
    const h = { ...base, hoy: '2025-01-01' };
    expect((await tablero(u, { ...h, comparable: true })).kpis.venta_cent).toBe(11000);
    expect((await tablero(u, { ...h, comparable: false })).kpis.venta_cent).toBe(38000);
    expect((await tablero(u, { ...h, anios_operando: [1] })).kpis.venta_cent).toBe(11000);
    expect((await tablero(u, { ...h, anios_operando: [0] })).kpis.venta_cent).toBe(38000);
    // hoy = 2026-10-06: ambas con 12 meses o más.
    expect((await tablero(u, { ...base, hoy: '2026-10-06', comparable: true })).kpis.venta_cent).toBe(49000);
  });

  it('maduración contra hoy', async () => {
    const h = { ...base, hoy: '2024-04-15' }; // Namora 1 mes; Ventura 4 meses
    expect((await tablero(u, { ...h, maduracion: ['Menor de 3 meses'] })).kpis.venta_cent).toBe(38000);
    expect((await tablero(u, { ...h, maduracion: ['Mayor de 3 meses'] })).kpis.venta_cent).toBe(11000);
  });
});

describe('bi_tendencias', () => {
  it('ignora desde, hasta y semanas; llega hasta hoy', async () => {
    const r = await tendencias(u, { ...base, semanas: ['W41 2026'], hoy: '2026-10-31' });
    expect(r.por_mes).toEqual([
      { anio: 2026, mes: 9, venta_cent: 3000 },
      { anio: 2026, mes: 10, venta_cent: 49000 },
    ]);
    expect(r.por_semana).toEqual([
      { anio: 2026, semana: 40, venta_cent: 3000 },
      { anio: 2026, semana: 41, venta_cent: 49000 },
    ]);
    const corta = await tendencias(u, { ...base, hoy: '2026-10-05' });
    expect(corta.por_mes).toEqual([
      { anio: 2026, mes: 9, venta_cent: 3000 },
      { anio: 2026, mes: 10, venta_cent: 41000 },
    ]);
  });

  it('aplica los demás filtros y solo las sucursales del usuario', async () => {
    const r = await tendencias(u, { ...base, productos: ['Brownie'], hoy: '2026-10-31' });
    expect(r.por_mes).toEqual([{ anio: 2026, mes: 10, venta_cent: 5000 }]);
    const o = await tendencias(otro, { ...base, hoy: '2026-10-31' });
    expect(o.por_mes).toEqual([{ anio: 2026, mes: 10, venta_cent: 99900 }]);
  });
});
