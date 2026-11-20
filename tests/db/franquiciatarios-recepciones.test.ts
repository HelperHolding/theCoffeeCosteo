import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo } from './utilidades';

// Migraciones 80 y 82: recepción de pedidos de la Comercializadora (solo inserción, una por pedido y sucursal),
// solo para gerente, franquiciatario y admin.
let db: PGlite;
let gerente: string;
let tienda: string;
let gerenteOtra: string;
let costeo: string;
let ana: number;
const E = 514;
const OTRA = 532;
const P1 = '04598135-cfcd-428c-96f8-4f9e8627bab4';
const P2 = '1f48253a-28bf-4f73-9ef3-9b52cf3d89a7';
type F = Record<string, any>;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const uno = async (u: string, sql: string, p: unknown[] = []) =>
  como(u, async () => (await db.query<F>(sql, p)).rows[0]);
const filas = async (u: string, sql: string, p: unknown[] = []) =>
  como(u, async () => (await db.query<F>(sql, p)).rows);
const falla = async (u: string | null, sql: string, p: unknown[] = []) => {
  try {
    if (u) await como(u, () => db.query(sql, p));
    else await db.query(sql, p);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`No falló: ${sql}`);
};
const recibir = (
  u: string,
  company: number,
  pedido: string,
  dif: unknown[],
  obs: string | null,
  barista: number | null,
) =>
  uno(u, 'select public.franq_recibir($1,$2,$3,$4::jsonb,$5,$6,$7) id', [
    company,
    pedido,
    '#CMS3245',
    JSON.stringify(dif),
    obs,
    barista,
    'tablet prueba',
  ]);

beforeAll(async () => {
  db = await crearDbLocal();
  gerente = await crearUsuario(db, 'franquiciado');
  tienda = await crearUsuario(db, 'tienda');
  gerenteOtra = await crearUsuario(db, 'franquiciado');
  costeo = await crearUsuario(db, 'compras');
  for (const u of [gerente, tienda, gerenteOtra]) await darModulo(db, u, 'franquiciatarios', 'lectura');
  await db.query(
    `insert into franq_miembros (user_id, company_id, rol) values ($1,$4,'gerente'),($2,$4,'barista'),($3,$5,'gerente')`,
    [gerente, tienda, gerenteOtra, E, OTRA],
  );
  ana = Number((await uno(gerente, `select public.franq_barista_guardar($1,null,'Ana',true) id`, [E])).id);
});
afterAll(async () => db.close());

describe('migraciones 80 y 82 · recepciones', () => {
  it('migración 82: la cuenta de baristas no registra recepciones (ni con nombre declarado)', async () => {
    expect(
      await falla(tienda, 'select public.franq_recibir(514,$1,null,$2::jsonb,null,$3,$4)', [
        P1,
        '[]',
        ana,
        'x',
      ]),
    ).toMatch(/Solo el gerente o el franquiciatario/);
  });

  it('el gerente registra una recepción completa con el nombre de su perfil y la hora del servidor', async () => {
    const r = await recibir(gerente, E, P1, [], null, ana);
    const f = await uno(
      gerente,
      'select completo, nombre, folio, barista_id, registrado_en from franq_recepciones where id = $1',
      [r.id],
    );
    expect(f).toMatchObject({
      completo: true,
      nombre: 'Usuario franquiciado',
      folio: '#CMS3245',
      barista_id: null,
    });
    expect(f.registrado_en).toBeTruthy();
  });

  it('una sola recepción por pedido', async () => {
    expect(
      await falla(gerente, 'select public.franq_recibir(514,$1,null,$2::jsonb,null,null,$3)', [
        P1,
        '[]',
        'x',
      ]),
    ).toMatch(/ya tiene su recepción/);
  });

  it('con diferencias exige observación y renglones válidos; queda como incompleta', async () => {
    const dif = [{ nombre: 'Café en Grano White 1.5 Kg', sku: 'INS-CAF-003', pedido: 7, recibido: 5 }];
    expect(
      await falla(gerente, 'select public.franq_recibir(514,$1,null,$2::jsonb,$3,null,$4)', [
        P2,
        JSON.stringify(dif),
        ' ',
        'x',
      ]),
    ).toMatch(/Explica qué pasó/);
    for (const mala of [
      [{ nombre: 'X', pedido: 2, recibido: 2 }],
      [{ nombre: 'X', pedido: -1, recibido: 2 }],
      [{ nombre: 'X', pedido: '2', recibido: 1 }],
      [{ pedido: 2, recibido: 1 }],
    ])
      expect(
        await falla(gerente, 'select public.franq_recibir(514,$1,null,$2::jsonb,$3,null,$4)', [
          P2,
          JSON.stringify(mala),
          'Faltó',
          'x',
        ]),
      ).toMatch(/Cada diferencia/);
    const r = await recibir(gerente, E, P2, dif, 'Llegaron 5 de 7; se avisó a la Comercializadora', null);
    const f = await uno(gerente, 'select completo, diferencias from franq_recepciones where id = $1', [r.id]);
    expect(f.completo).toBe(false);
    expect(f.diferencias).toEqual(dif);
  });

  it('pedido con formato inválido o sucursal ajena: no', async () => {
    expect(
      await falla(gerente, 'select public.franq_recibir(514,$1,null,$2::jsonb,null,null,$3)', [
        'abc',
        '[]',
        'x',
      ]),
    ).toMatch(/Pedido inválido/);
    expect(
      await falla(gerenteOtra, 'select public.franq_recibir(514,$1,null,$2::jsonb,null,null,$3)', [
        '00000000-0000-0000-0000-000000000001',
        '[]',
        'x',
      ]),
    ).toMatch(/Solo el gerente o el franquiciatario/);
  });

  it('se leen solo por sucursal; nadie las edita ni las borra; escritura directa cerrada', async () => {
    expect((await filas(gerente, 'select id from franq_recepciones')).length).toBe(2);
    // Migración 82: la cuenta de baristas de la misma sucursal tampoco las lee.
    expect(await filas(tienda, 'select id from franq_recepciones')).toEqual([]);
    expect(await filas(gerenteOtra, 'select id from franq_recepciones')).toEqual([]);
    expect(await filas(costeo, 'select id from franq_recepciones')).toEqual([]);
    expect(await falla(null, 'delete from franq_recepciones')).toMatch(/no se editan ni se borran/);
    expect(await falla(null, `update franq_recepciones set nombre = 'X'`)).toMatch(/no se editan/);
    expect(
      await falla(
        gerente,
        `insert into franq_recepciones (company_id, pedido_id, completo, nombre, registrado_por)
        values (514, $1, true, 'X', $2)`,
        ['00000000-0000-0000-0000-000000000002', gerente],
      ),
    ).toMatch(/permission denied/);
  });

  it('un token OAuth (MCP) no las lee', async () => {
    const n = await como(gerente, async () => {
      await db.query(`select set_config('request.jwt.claims', $1, false)`, [
        JSON.stringify({ sub: gerente, client_id: 'mcp' }),
      ]);
      try {
        return Number((await db.query<F>('select count(*)::int n from franq_recepciones')).rows[0].n);
      } finally {
        await db.query(`select set_config('request.jwt.claims', '', false)`);
      }
    });
    expect(n).toBe(0);
  });
});
