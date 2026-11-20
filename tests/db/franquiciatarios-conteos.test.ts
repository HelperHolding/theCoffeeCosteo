import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo } from './utilidades';
import { crearInsumo } from './fabricas';

// Migración 83: insumos críticos sugeridos desde el consumo teórico y conteos de apertura / medio turno.
let db: PGlite;
let gerente: string;
let tienda: string;
let gerenteOtra: string;
let ana: number;
const E = 514;
const OTRA = 532;
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
/** Consumo teórico de un mes: [nombre, cantidad consumida, costo del paquete, presentación, unidad]. */
async function consumo(company: number, renglones: [string, number, number, number, 'gr' | 'ml' | 'pza'][]) {
  for (const [nombre, cantidad, costo, presentacion, unidad] of renglones) {
    const id = await crearInsumo(db, { nombre, costoPaquete: costo, presentacion, unidad });
    await db.query(
      `insert into sucursales_consumo_mes (mes, company_id, origen, insumo_id, insumo, unidad, categoria, cantidad)
       values ('2026-10-01', $1, 'mostrador', $2, $3, $4, 'X', $5)`,
      [company, id, nombre, unidad, cantidad],
    );
  }
}
const contar = (
  u: string,
  momento: string,
  conteos: { insumo: number; cantidad: number }[],
  barista: number | null,
) =>
  uno(u, 'select public.franq_contar($1,$2,$3::jsonb,$4,$5) n', [
    E,
    momento,
    JSON.stringify(conteos),
    barista,
    'tablet',
  ]);

beforeAll(async () => {
  db = await crearDbLocal();
  gerente = await crearUsuario(db, 'franquiciado');
  tienda = await crearUsuario(db, 'tienda');
  gerenteOtra = await crearUsuario(db, 'franquiciado');
  for (const u of [gerente, tienda, gerenteOtra]) await darModulo(db, u, 'franquiciatarios', 'lectura');
  await db.query(
    `insert into franq_miembros (user_id, company_id, rol) values ($1,$4,'gerente'),($2,$4,'barista'),($3,$5,'gerente')`,
    [gerente, tienda, gerenteOtra, E, OTRA],
  );
  ana = Number((await uno(gerente, `select public.franq_barista_guardar($1,null,'Ana',true) id`, [E])).id);
  // Essentia: un café domina el valor (Pareto llega al 80 % con 1) → se completa al mínimo de 10.
  await consumo(E, [
    ['CAFÉ WHITE 1.5 KG', 42000, 600, 1500, 'gr'],
    ['CROISSANT', 170, 15, 1, 'pza'],
    ...Array.from(
      { length: 13 },
      (_, i) => [`INSUMO E${i + 1}`, 100 - i, 10, 1000, 'ml'] as [string, number, number, number, 'ml'],
    ),
  ]);
  // Otra sucursal: 25 insumos del mismo valor → el 80 % pide 20 → tope de 20.
  await consumo(
    OTRA,
    Array.from(
      { length: 25 },
      (_, i) =>
        [`PAREJO ${String(i + 1).padStart(2, '0')}`, 1000, 100, 1000, 'gr'] as [
          string,
          number,
          number,
          number,
          'gr',
        ],
    ),
  );
});
afterAll(async () => db.close());

describe('migración 83 · lista sugerida', () => {
  it('solo un gestor la arma; la cuenta de baristas no', async () => {
    expect(await falla(tienda, 'select public.franq_sugerir_insumos(514)')).toMatch(/Solo el gerente/);
    expect(await falla(gerenteOtra, 'select public.franq_sugerir_insumos(514)')).toMatch(/Solo el gerente/);
  });

  it('Pareto del valor consumido: mínimo 10, ordenados por valor, con unidad de conteo por paquete o pieza', async () => {
    expect((await uno(gerente, 'select public.franq_sugerir_insumos(514) n')).n).toBe(10);
    const l = await filas(
      gerente,
      'select nombre, unidad, orden, origen from franq_insumos where company_id = 514 order by orden',
    );
    expect(l).toHaveLength(10);
    expect(l[0]).toMatchObject({
      nombre: 'Café White 1.5 Kg',
      unidad: 'paquete de 1500 gr',
      orden: 1,
      origen: 'sugerido',
    });
    expect(l[1]).toMatchObject({ nombre: 'Croissant', unidad: 'pza' });
    expect(await falla(gerente, 'select public.franq_sugerir_insumos(514)')).toMatch(/ya tiene su lista/);
  });

  it('tope de 20 aunque el 80 % pida más', async () => {
    expect((await uno(gerenteOtra, 'select public.franq_sugerir_insumos(532) n')).n).toBe(20);
  });

  it('sin consumo calculado pide capturarla a mano', async () => {
    await db.query(`insert into franq_miembros (user_id, company_id, rol) values ($1, 600, 'gerente')`, [
      gerente,
    ]);
    expect(await falla(gerente, 'select public.franq_sugerir_insumos(600)')).toMatch(
      /agrega los insumos a mano/,
    );
  });

  it('la lista no expone valores y la lee toda la sucursal (también la cuenta de baristas)', async () => {
    const cols = (
      await db.query<F>(
        `select column_name from information_schema.columns where table_name = 'franq_insumos'`,
      )
    ).rows.map((r) => r.column_name);
    expect(cols.some((c) => /costo|valor|precio/.test(c))).toBe(false);
    expect((await filas(tienda, 'select id from franq_insumos')).length).toBe(10);
    expect(await filas(gerenteOtra, 'select id from franq_insumos where company_id = 514')).toEqual([]);
  });

  it('el gerente afina: alta manual, edición y baja; nunca se borran', async () => {
    const id = (
      await uno(gerente, `select public.franq_insumo_guardar(514,null,'Hielo','bolsa de 5 kg',null,true) id`)
    ).id;
    expect(
      await falla(gerente, `select public.franq_insumo_guardar(514,null,'hielo','bolsa',null,true)`),
    ).toMatch(/Ya hay un insumo/);
    await uno(
      gerente,
      `select public.franq_insumo_guardar(514,$1,'Hielo en bolsa','bolsa de 5 kg',null,false) id`,
      [id],
    );
    expect(await uno(gerente, 'select activo, origen from franq_insumos where id = $1', [id])).toMatchObject({
      activo: false,
      origen: 'manual',
    });
    expect(
      await falla(tienda, `select public.franq_insumo_guardar(514,null,'Azúcar','kg',null,true)`),
    ).toMatch(/Solo el gerente/);
    expect(await falla(null, 'delete from franq_insumos')).toMatch(/no se borran/);
  });
});

describe('migración 83 · conteos', () => {
  it('la cuenta de baristas captura el conteo completo con su nombre; incompleto, no', async () => {
    const ids = (
      await filas(tienda, 'select id from franq_insumos where company_id = 514 and activo order by orden')
    ).map((r) => Number(r.id));
    expect(
      await falla(tienda, 'select public.franq_contar(514,$1,$2::jsonb,$3,$4)', [
        'apertura',
        '[]',
        null,
        'x',
      ]),
    ).toMatch(/Elige tu nombre/);
    expect(
      await falla(tienda, 'select public.franq_contar(514,$1,$2::jsonb,$3,$4)', [
        'apertura',
        JSON.stringify([{ insumo: ids[0], cantidad: 3 }]),
        ana,
        'x',
      ]),
    ).toMatch(/Faltan 9 insumos/);
    const r = await contar(
      tienda,
      'apertura',
      ids.map((insumo, i) => ({ insumo, cantidad: i + 0.5 })),
      ana,
    );
    expect(r.n).toBe(10);
  });

  it('la cuenta de baristas no ve cantidades; ve el estado (quién y a qué hora) sin cantidades', async () => {
    expect(await filas(tienda, 'select * from franq_conteos')).toEqual([]);
    const dia = (await db.query<F>('select public.franq_dia_operacion() d')).rows[0].d;
    const e = await filas(tienda, 'select * from franq_conteo_estado(514, $1)', [dia]);
    expect(e).toEqual([expect.objectContaining({ momento: 'apertura', nombre: 'Ana', insumos: 10 })]);
    expect(Object.keys(e[0])).not.toContain('cantidad');
    expect((await filas(gerente, 'select cantidad from franq_conteos')).length).toBe(10);
    expect(await filas(gerenteOtra, 'select * from franq_conteos where company_id = 514')).toEqual([]);
  });

  it('un recuento corrige al vigente; validaciones de cantidad, momento e insumo ajeno', async () => {
    const ids = (
      await filas(gerente, 'select id from franq_insumos where company_id = 514 and activo order by orden')
    ).map((r) => Number(r.id));
    await contar(
      gerente,
      'apertura',
      ids.map((insumo) => ({ insumo, cantidad: 2 })),
      null,
    );
    const vig = await filas(
      gerente,
      `select c.cantidad from franq_conteos c where c.momento = 'apertura'
       and not exists (select 1 from franq_conteos x where x.corrige_id = c.id)`,
    );
    expect(vig.map((r) => Number(r.cantidad))).toEqual(Array(10).fill(2));
    expect(
      await falla(gerente, 'select public.franq_contar(514,$1,$2::jsonb,null,$3)', ['cierre', '[]', 'x']),
    ).toMatch(/Momento inválido/);
    expect(
      await falla(gerente, 'select public.franq_contar(514,$1,$2::jsonb,null,$3)', [
        'medio',
        JSON.stringify([{ insumo: ids[0], cantidad: -1 }]),
        'x',
      ]),
    ).toMatch(/de 0 en adelante/);
    const ajeno = Number(
      (await uno(gerenteOtra, 'select id from franq_insumos where company_id = 532 limit 1')).id,
    );
    expect(
      await falla(gerente, 'select public.franq_contar(514,$1,$2::jsonb,null,$3)', [
        'medio',
        JSON.stringify([{ insumo: ajeno, cantidad: 1 }]),
        'x',
      ]),
    ).toMatch(/no está en la lista/);
    expect(await falla(null, 'update franq_conteos set cantidad = 0')).toMatch(/no se editan/);
  });

  it('un token OAuth (MCP) no lee la lista ni los conteos', async () => {
    const n = await como(gerente, async () => {
      await db.query(`select set_config('request.jwt.claims', $1, false)`, [
        JSON.stringify({ sub: gerente, client_id: 'mcp' }),
      ]);
      try {
        const a = (await db.query<F>('select count(*)::int n from franq_insumos')).rows[0].n;
        const b = (await db.query<F>('select count(*)::int n from franq_conteos')).rows[0].n;
        return a + b;
      } finally {
        await db.query(`select set_config('request.jwt.claims', '', false)`);
      }
    });
    expect(n).toBe(0);
  });
});
