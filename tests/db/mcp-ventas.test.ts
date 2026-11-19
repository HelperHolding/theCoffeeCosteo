import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 61 (docs/superpowers/specs/2026-11-19-mcp-ventas-grok-design.md §5.1).
let db: PGlite;
let conTodo: string;
let otraSucursal: string;
let inactivo: string;
type T = Record<string, any>;

/** Ejecuta fn como el usuario, con un token OAuth del cliente dado (null = sesión normal del portal). */
const como = <R>(user: string, client: string | null, fn: () => Promise<R>) =>
  comoUsuario(db, user, async () => {
    if (client)
      await db.query(`select set_config('request.jwt.claims', $1, false)`, [
        JSON.stringify({ sub: user, client_id: client }),
      ]);
    try {
      return await fn();
    } finally {
      await db.query(`select set_config('request.jwt.claims', '', false)`);
    }
  });
const uno = async (sql: string, params: unknown[] = []) =>
  (await db.query<{ r: any }>(sql, params)).rows[0].r;
const fila = (company: number, fecha: string) =>
  db.query(
    `insert into sucursales_resumen_dia (company_id, fecha, leido_en, corte_segundo, completa, origenes, horas, productos)
     values ($1, $2, now(), 86400, true, $3, $4, $5)`,
    [
      company,
      fecha,
      JSON.stringify({ mostrador: { pedidos: 2, venta_cent: 15000, descuento_cent: 0, lineas: 3 } }),
      JSON.stringify({
        mostrador: [
          Array(24)
            .fill(0)
            .map((_, h) => (h === 9 ? 2 : 0)),
          Array(24)
            .fill(0)
            .map((_, h) => (h === 9 ? 15000 : 0)),
        ],
      }),
      JSON.stringify([['5IL', '5IL', 'Iced Latte', { mostrador: [3, 15000] }]]),
    ],
  );

beforeAll(async () => {
  db = await crearDbLocal();
  conTodo = await crearUsuario(db, 'sucursales');
  otraSucursal = await crearUsuario(db, 'sucursales');
  inactivo = await crearUsuario(db, 'sucursales');
  for (const u of [conTodo, otraSucursal, inactivo])
    await db.query(
      `insert into perfil_modulos (user_id, modulo, nivel) values ($1,'sucursales','lectura'),($1,'bi','lectura')`,
      [u],
    );
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1,384),($2,532),($3,384)', [
    conTodo,
    otraSucursal,
    inactivo,
  ]);
  await db.query('update perfiles set activo = false where user_id = $1', [inactivo]);
  await db.query(`insert into mcp_ventas_clientes (client_id, nombre) values ('grok', 'Grok')`);
  await fila(384, '2026-11-10');
  await fila(532, '2026-11-10');
});
afterAll(async () => db.close());

describe('ventas_lectura', () => {
  const acc = (u: string, c: string | null, company: number, modulo: string) =>
    como(u, c, () => uno('select public.ventas_lectura($1, $2) r', [company, modulo]));

  it('sesión normal: igual que sucursales_acceso / bi_acceso', async () => {
    expect(await acc(conTodo, null, 384, 'sucursales')).toBe(true);
    expect(await acc(conTodo, null, 384, 'bi')).toBe(true);
    expect(await acc(conTodo, null, 532, 'sucursales')).toBe(false);
  });

  it('OAuth: exige cliente en la lista blanca, sucursal asignada, perfil activo y módulo de ventas', async () => {
    expect(await acc(conTodo, 'grok', 384, 'sucursales')).toBe(true);
    expect(await acc(conTodo, 'grok', 384, 'bi')).toBe(true);
    expect(await acc(conTodo, 'otro-cliente', 384, 'sucursales')).toBe(false);
    expect(await acc(conTodo, 'grok', 532, 'sucursales')).toBe(false);
    expect(await acc(inactivo, 'grok', 384, 'sucursales')).toBe(false);
    expect(await acc(conTodo, 'grok', 384, 'crm')).toBe(false);
  });

  it('las funciones de escritura siguen negando OAuth aunque el cliente esté autorizado', async () => {
    expect(await como(conTodo, 'grok', () => uno('select public.sucursales_acceso(384) r'))).toBe(false);
    expect(await como(conTodo, 'grok', () => uno('select public.bi_acceso(384) r'))).toBe(false);
  });

  it('la lista blanca no es legible ni editable por usuarios', async () => {
    await expect(como(conTodo, null, () => db.query('select * from mcp_ventas_clientes'))).rejects.toThrow();
    await expect(
      como(conTodo, null, () => db.query(`insert into mcp_ventas_clientes values ('x','x')`)),
    ).rejects.toThrow();
  });
});

describe('RPC de lectura con OAuth', () => {
  const periodo = (c: string | null) =>
    como(conTodo, c, () =>
      uno(`select public.sucursales_tablero_periodo(array[384,532], '2026-11-10', '2026-11-10') r`),
    );

  it('sucursales_tablero_periodo: OAuth autorizado ve su sucursal; no autorizado, nada', async () => {
    expect((await periodo(null)).dias_leidos).toBe(1);
    expect((await periodo('grok')).dias_leidos).toBe(1);
    expect((await periodo('otro-cliente')).dias_leidos).toBe(0);
  });

  it('sucursales_tablero_hoy: OAuth autorizado ve su sucursal', async () => {
    const r = await como(conTodo, 'grok', () =>
      uno(`select public.sucursales_tablero_hoy(array[384,532], array['2026-11-10','2026-11-10']::date[]) r`),
    );
    expect(r.dias.map((d: T) => d.company_id)).toEqual([384]);
  });

  it('bi_opciones: OAuth autorizado ve sus tiendas; no autorizado, ninguna', async () => {
    const tiendas = (c: string) =>
      como(conTodo, c, async () =>
        (
          await uno(`select public.bi_opciones($1) r`, [
            JSON.stringify({ desde: '2026-11-01', hasta: '2026-11-10' }),
          ])
        ).tiendas.map((t: T) => t.company_id),
      );
    expect(await tiendas('grok')).toEqual([384]);
    expect(await tiendas('otro-cliente')).toEqual([]);
  });

  it('bi_tablero filtra con ventas_lectura (vía bi_tiendas_filtradas)', async () => {
    const p = JSON.stringify({ desde: '2026-11-01', hasta: '2026-11-10', companias: [384] });
    const ok = await como(conTodo, 'grok', () => uno('select public.bi_tablero($1) r', [p]));
    const no = await como(conTodo, 'otro-cliente', () => uno('select public.bi_tablero($1) r', [p]));
    expect(ok.cargas.esperados).toBeGreaterThan(0);
    expect(no.cargas.esperados).toBe(0);
  });
});

describe('mcp_ventas_sucursales', () => {
  it('devuelve el client_id, si está autorizado y las sucursales con sus módulos', async () => {
    const r = await como(conTodo, 'grok', () => uno('select public.mcp_ventas_sucursales() r'));
    expect(r.client_id).toBe('grok');
    expect(r.autorizado).toBe(true);
    expect(r.sucursales).toEqual([
      expect.objectContaining({ company_id: 384, modulos: ['sucursales', 'bi'] }),
    ]);
  });

  it('cliente no autorizado: autorizado false y sin sucursales', async () => {
    const r = await como(conTodo, 'otro-cliente', () => uno('select public.mcp_ventas_sucursales() r'));
    expect(r).toEqual({ client_id: 'otro-cliente', autorizado: false, sucursales: [] });
  });
});

describe('mcp_ventas_dias', () => {
  const dias = (d: string, h: string, horas: boolean) =>
    como(conTodo, 'grok', () =>
      uno('select public.mcp_ventas_dias(array[384,532], $1, $2, $3) r', [d, h, horas]),
    );

  it('omite sucursales ajenas y solo manda horas si se piden', async () => {
    const sin = await dias('2026-11-10', '2026-11-10', false);
    expect(sin).toHaveLength(1);
    expect(sin[0]).toMatchObject({
      company_id: 384,
      fecha: '2026-11-10',
      completa: true,
      corte_segundo: 86400,
    });
    expect(sin[0].origenes.mostrador.venta_cent).toBe(15000);
    expect(sin[0].horas).toBeUndefined();
    const con = await dias('2026-11-10', '2026-11-10', true);
    expect(con[0].horas.mostrador[1][9]).toBe(15000);
  });

  it('rechaza más de 120 días, más de 7 con horas y desde > hasta', async () => {
    await expect(dias('2026-01-01', '2026-06-01', false)).rejects.toThrow(/120/);
    await expect(dias('2026-11-01', '2026-11-10', true)).rejects.toThrow(/7/);
    await expect(dias('2026-11-10', '2026-11-01', false)).rejects.toThrow(/inválido/);
  });
});
