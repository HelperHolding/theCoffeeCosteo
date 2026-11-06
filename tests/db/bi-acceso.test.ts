import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 43: módulo bi, bi_acceso, pago por fecha, por_fecha y bi_opciones.
let db: PGlite;
let conBi: string;
let soloSucursales: string;
let inactivo: string;
type T = Record<string, any>;
const L = (pedido: string, x: Record<string, unknown> = {}) => ({
  pedido, linea: 1, hora: 9, canal: 'app', metodo_pago: 'WALLET_BALANCE', tipo_pago: 'WALLET', smartphone: true,
  opcion_consumo: null, codigo: '5IL', nombre: 'Iced Latte', unidades: 1, importe_cent: 10000, importe_neto_cent: 9700,
  descuento_cent: 0, ...x,
});
const servicio = async (sql: string, params: unknown[] = []) => {
  await db.exec('set role service_role');
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const guardar = (c: number, f: string, ls: unknown[]) =>
  servicio('select public.bi_guardar_dia($1,$2,$3,true,now(),$4,false)', ['pos', c, f, JSON.stringify(ls)]);
const rpc = (user: string, fn: string, p: Record<string, unknown>) =>
  comoUsuario(db, user, async () => (await db.query<{ r: T }>(`select public.${fn}($1) r`, [JSON.stringify(p)])).rows[0].r);
const base = { desde: '2026-02-27', hasta: '2026-03-02', companias: [384] };

beforeAll(async () => {
  db = await crearDbLocal();
  conBi = await crearUsuario(db, 'sucursales');
  soloSucursales = await crearUsuario(db, 'sucursales');
  inactivo = await crearUsuario(db, 'sucursales');
  await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1,'bi','lectura'),($2,'sucursales','lectura'),($3,'bi','lectura')`,
    [conBi, soloSucursales, inactivo]);
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1,384),($2,384),($3,384)', [conBi, soloSucursales, inactivo]);
  await db.query('update perfiles set activo = false where user_id = $1', [inactivo]);
  await guardar(384, '2026-02-28', [L('A')]);
  await guardar(384, '2026-03-01', [L('B'), L('C', { codigo: 'BRO13', nombre: 'Brownie', canal: 'mostrador', metodo_pago: 'CARTAO', tipo_pago: 'EMV', smartphone: false })]);
});
afterAll(async () => db.close());

describe('migración 43', () => {
  it('perfil_modulos acepta bi', async () => {
    const r = await db.query(`select modulo from perfil_modulos where user_id = $1`, [conBi]);
    expect(r.rows).toEqual([{ modulo: 'bi' }]);
  });

  it('bi_acceso exige módulo bi, sucursal asignada y perfil activo', async () => {
    const acc = (u: string, c: number) =>
      comoUsuario(db, u, async () => (await db.query<{ r: boolean }>('select public.bi_acceso($1) r', [c])).rows[0].r);
    expect(await acc(conBi, 384)).toBe(true);
    expect(await acc(conBi, 532)).toBe(false);
    expect(await acc(soloSucursales, 384)).toBe(false);
    expect(await acc(inactivo, 384)).toBe(false);
  });

  it('bi_acceso niega tokens OAuth', async () => {
    const r = await comoUsuario(db, conBi, async () => {
      await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: conBi, client_id: 'claude-client' })]);
      try { return (await db.query<{ r: boolean }>('select public.bi_acceso(384) r')).rows[0].r; }
      finally { await db.query(`select set_config('request.jwt.claims', '', false)`); }
    });
    expect(r).toBe(false);
  });

  it('bi_tablero solo con módulo bi: con solo sucursales no ve nada', async () => {
    expect((await rpc(conBi, 'bi_tablero', base)).kpis.tickets).toBe(3);
    expect((await rpc(soloSucursales, 'bi_tablero', base)).kpis.tickets).toBe(0);
  });

  it('WALLET_BALANCE es «WALLET» hasta el 2026-02-28 y «APP - WALLET» desde el 2026-03-01', async () => {
    const r = await rpc(conBi, 'bi_tablero', { ...base, desde: '2026-02-28', hasta: '2026-02-28' });
    expect(r.por_pago.map((x: T) => x.etiqueta)).toEqual(['WALLET']);
    const s = await rpc(conBi, 'bi_tablero', { ...base, desde: '2026-03-01', hasta: '2026-03-01' });
    expect(s.por_pago.map((x: T) => x.etiqueta).sort()).toEqual(['APP - WALLET', 'TABLET - CARD']);
    const f = await rpc(conBi, 'bi_tablero', { ...base, pagos: ['WALLET'] });
    expect(f.kpis.tickets).toBe(1);
  });

  it('por_fecha: venta neta y tickets por día', async () => {
    const r = await rpc(conBi, 'bi_tablero', base);
    expect(r.por_fecha).toEqual([
      { fecha: '2026-02-28', venta_cent: 9700, tickets: 1 },
      { fecha: '2026-03-01', venta_cent: 19400, tickets: 2 },
    ]);
  });

  it('bi_opciones: solo tiendas con acceso; productos, pagos y semanas del periodo', async () => {
    const o = await rpc(conBi, 'bi_opciones', { desde: '2026-03-01', hasta: '2026-03-01' });
    expect(o.tiendas.map((t: T) => t.company_id)).toEqual([384]);
    expect(o.productos).toEqual(['Brownie', 'Iced Latte']);
    expect(o.pagos).toEqual(['APP - WALLET', 'TABLET - CARD']);
    expect(o.semanas).toEqual(['W9 2026']);
    expect(o.categorias).toContain('Sin clasificar');
    expect(o.grupos).toContain('Otros');
    expect(o.ultimo_corte).not.toBeNull();
    expect(o.tiendas_sin_rappi).toBe(1);
    const nada = await rpc(soloSucursales, 'bi_opciones', { desde: '2026-03-01', hasta: '2026-03-01' });
    expect(nada.tiendas).toEqual([]);
    expect(nada.productos).toEqual([]);
  });

  it('bi_opciones rechaza periodos inválidos', async () => {
    await expect(rpc(conBi, 'bi_opciones', { desde: '2026-03-02', hasta: '2026-03-01' })).rejects.toThrow(/Periodo inválido/);
  });
});
