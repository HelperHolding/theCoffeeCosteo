// tests/db/bi-kpis.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 76: bi_kpis = mismos kpis y cargas que bi_tablero, con recorte opcional por hora en el último día.
let db: PGlite;
let conBi: string;
let sinBi: string;
type T = Record<string, any>;
const L = (pedido: string, hora: number, x: Record<string, unknown> = {}) => ({
  pedido, linea: 1, hora, canal: 'mostrador', metodo_pago: 'CARTAO', tipo_pago: 'EMV', smartphone: false,
  opcion_consumo: null, codigo: '5IL', nombre: 'Iced Latte', unidades: 1, importe_cent: 10000, importe_neto_cent: 9700,
  descuento_cent: 0, ...x,
});
const servicio = async (sql: string, params: unknown[] = []) => {
  await db.exec('set role service_role');
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const guardar = (c: number, f: string, ls: unknown[]) =>
  servicio('select public.bi_guardar_dia($1,$2,$3,true,now(),$4,false)', ['pos', c, f, JSON.stringify(ls)]);
const kpis = (user: string, p: Record<string, unknown>, hora: number | null = null) =>
  comoUsuario(db, user, async () =>
    (await db.query<{ r: T }>('select public.bi_kpis($1, $2) r', [JSON.stringify(p), hora])).rows[0].r);
const tablero = (user: string, p: Record<string, unknown>) =>
  comoUsuario(db, user, async () => (await db.query<{ r: T }>('select public.bi_tablero($1) r', [JSON.stringify(p)])).rows[0].r);
const base = { desde: '2026-11-17', hasta: '2026-11-18', hoy: '2026-11-18', companias: [384] };

beforeAll(async () => {
  db = await crearDbLocal();
  conBi = await crearUsuario(db, 'sucursales');
  sinBi = await crearUsuario(db, 'sucursales');
  await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1,'bi','lectura'),($2,'sucursales','lectura')`, [conBi, sinBi]);
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1,384),($2,384)', [conBi, sinBi]);
  await guardar(384, '2026-11-17', [L('A', 9), L('B', 15, { unidades: 2, importe_cent: 20000, importe_neto_cent: 19400 })]);
  await guardar(384, '2026-11-18', [L('C', 8), L('D', 11), L('E', 16)]);
});
afterAll(async () => db.close());

describe('migración 76: bi_kpis', () => {
  it('devuelve los mismos kpis y cargas que bi_tablero', async () => {
    const k = await kpis(conBi, base);
    const t = await tablero(conBi, base);
    expect(k.kpis).toEqual(t.kpis);
    expect(k.cargas).toEqual(t.cargas);
    expect(k.kpis).toMatchObject({ tickets: 5, lineas: 5, unidades: 6 });
  });

  it('con hora de corte solo recorta el último día (hora < corte)', async () => {
    const k = await kpis(conBi, base, 11);
    // 17-nov completo (A 9h, B 15h) + 18-nov solo C (8h): D (11h) y E (16h) quedan fuera.
    expect(k.kpis.tickets).toBe(3);
    expect(k.kpis.venta_cent).toBe(9700 + 19400 + 9700);
  });

  it('sin módulo bi no ve nada (ceros, como bi_tablero)', async () => {
    const k = await kpis(sinBi, base);
    expect(k.kpis).toMatchObject({ venta_cent: 0, tickets: 0 });
    expect(k.cargas.esperados).toBe(0);
  });

  it('niega tokens OAuth', async () => {
    const k = await comoUsuario(db, conBi, async () => {
      await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: conBi, client_id: 'grok' })]);
      try { return (await db.query<{ r: T }>('select public.bi_kpis($1) r', [JSON.stringify(base)])).rows[0].r; }
      finally { await db.query(`select set_config('request.jwt.claims', '', false)`); }
    });
    expect(k.kpis.tickets).toBe(0);
  });

  it('periodo inválido: error', async () => {
    await expect(kpis(conBi, { ...base, desde: '2026-11-19' })).rejects.toThrow(/Periodo inválido/);
  });
});
