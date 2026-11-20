import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo } from './utilidades';

// Migración 84: arqueo ciego, caja chica (gastos y anulaciones) y fondo/tolerancia de caja.
let db: PGlite;
let gerente: string;
let franquiciatario: string;
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
const arquear = (
  u: string,
  momento: string,
  contado: number | null,
  barista: number | null,
  obs: string | null = null,
) =>
  uno(u, 'select public.franq_arquear($1,$2,$3,$4,$5,$6) id', [E, momento, contado, obs, barista, 'tablet']);
const gasto = (u: string, company: number, concepto: string, monto: number, categoria = 'insumos') =>
  uno(u, 'select public.franq_gasto($1,$2,$3,$4,true,true,null,$5) id', [
    company,
    concepto,
    categoria,
    monto,
    'tablet',
  ]);

beforeAll(async () => {
  db = await crearDbLocal();
  gerente = await crearUsuario(db, 'franquiciado');
  franquiciatario = await crearUsuario(db, 'franquiciado');
  tienda = await crearUsuario(db, 'tienda');
  gerenteOtra = await crearUsuario(db, 'franquiciado');
  for (const u of [gerente, franquiciatario, tienda, gerenteOtra])
    await darModulo(db, u, 'franquiciatarios', 'lectura');
  await db.query(
    `insert into franq_miembros (user_id, company_id, rol) values ($1,$5,'gerente'),($2,$5,'franquiciatario'),
     ($3,$5,'barista'),($4,$6,'gerente')`,
    [gerente, franquiciatario, tienda, gerenteOtra, E, OTRA],
  );
  ana = Number((await uno(gerente, `select public.franq_barista_guardar($1,null,'Ana',true) id`, [E])).id);
});
afterAll(async () => db.close());

describe('migración 84 · arqueo ciego', () => {
  it('la cuenta de baristas arquea con su nombre; no ve montos, solo quién y a qué hora', async () => {
    expect(
      await falla(tienda, 'select public.franq_arquear(514,$1,1500,null,null,$2)', ['cierre', 'x']),
    ).toMatch(/Elige tu nombre/);
    await arquear(tienda, 'medio', 1520.456, ana);
    expect(await filas(tienda, 'select * from franq_arqueos')).toEqual([]);
    const dia = (await db.query<F>('select public.franq_dia_operacion() d')).rows[0].d;
    const e = await filas(tienda, 'select * from franq_arqueo_estado(514, $1)', [dia]);
    expect(e).toEqual([expect.objectContaining({ momento: 'medio', nombre: 'Ana' })]);
    expect(Object.keys(e[0])).not.toContain('contado');
    expect(Number((await uno(gerente, 'select contado from franq_arqueos')).contado)).toBe(1520.46);
  });

  it('un recuento corrige al vigente; validaciones de momento y monto; otra sucursal no', async () => {
    const r = await arquear(gerente, 'medio', 1600, null, 'Recontado con el gerente');
    expect(
      (await filas(gerente, 'select corrige_id from franq_arqueos where id = $1', [r.id]))[0].corrige_id,
    ).not.toBeNull();
    expect(
      await falla(gerente, 'select public.franq_arquear(514,$1,10,null,null,$2)', ['apertura', 'x']),
    ).toMatch(/Momento inválido/);
    expect(
      await falla(gerente, 'select public.franq_arquear(514,$1,-1,null,null,$2)', ['cierre', 'x']),
    ).toMatch(/de 0 en adelante/);
    expect(
      await falla(gerenteOtra, 'select public.franq_arquear(514,$1,10,null,null,$2)', ['cierre', 'x']),
    ).toMatch(/No tienes acceso/);
    expect(await filas(gerenteOtra, 'select * from franq_arqueos')).toEqual([]);
    expect(await falla(null, 'update franq_arqueos set contado = 0')).toMatch(/no se editan/);
  });
});

describe('migración 84 · caja chica', () => {
  it('solo gerencia registra; la cuenta de baristas no registra ni lee', async () => {
    expect(
      await falla(tienda, 'select public.franq_gasto(514,$1,$2,$3,true,false,null,$4)', [
        'Hielo',
        'insumos',
        80,
        'x',
      ]),
    ).toMatch(/Solo el gerente/);
    const g = await gasto(gerente, E, 'Hielo 2 bolsas', 80);
    expect(
      await uno(gerente, 'select nombre, monto, comprobante from franq_gastos where id = $1', [g.id]),
    ).toMatchObject({ nombre: 'Usuario franquiciado', comprobante: true });
    expect(await filas(tienda, 'select * from franq_gastos')).toEqual([]);
    expect(await filas(gerenteOtra, 'select * from franq_gastos')).toEqual([]);
  });

  it('validaciones: concepto, categoría y monto', async () => {
    expect(
      await falla(gerente, 'select public.franq_gasto(514,$1,$2,$3,true,false,null,$4)', [
        'x',
        'insumos',
        10,
        'x',
      ]),
    ).toMatch(/Describe el gasto/);
    expect(
      await falla(gerente, 'select public.franq_gasto(514,$1,$2,$3,true,false,null,$4)', [
        'Gas',
        'comida',
        10,
        'x',
      ]),
    ).toMatch(/categoría/);
    expect(
      await falla(gerente, 'select public.franq_gasto(514,$1,$2,$3,true,false,null,$4)', [
        'Gas',
        'otro',
        0,
        'x',
      ]),
    ).toMatch(/monto/);
  });

  it('un gasto se anula una vez, con motivo; no se borra', async () => {
    const g = await gasto(franquiciatario, E, 'Papel para ticket', 120, 'papeleria');
    expect(await falla(gerente, 'select public.franq_gasto_anular($1,$2,$3)', [g.id, '', 'x'])).toMatch(
      /por qué/,
    );
    const a = await uno(gerente, 'select public.franq_gasto_anular($1,$2,$3) id', [
      g.id,
      'Se capturó doble',
      'x',
    ]);
    expect(
      await falla(gerente, 'select public.franq_gasto_anular($1,$2,$3)', [g.id, 'otra vez', 'x']),
    ).toMatch(/ya está anulado/);
    expect(
      await falla(gerente, 'select public.franq_gasto_anular($1,$2,$3)', [a.id, 'anular la anulación', 'x']),
    ).toMatch(/ya es una anulación/);
    expect(await falla(tienda, 'select public.franq_gasto_anular($1,$2,$3)', [g.id, 'no', 'x'])).toMatch(
      /Solo el gerente/,
    );
    expect(await falla(null, 'delete from franq_gastos')).toMatch(/no se editan ni se borran/);
  });
});

describe('migración 84 · configuración de caja', () => {
  it('fondo y tolerancia: gerencia los fija y los cambia; la cuenta de baristas no los ve', async () => {
    await uno(gerente, 'select public.franq_caja_configurar(514, 1500, 30)');
    await uno(franquiciatario, 'select public.franq_caja_configurar(514, 2000, 50)');
    expect(
      await uno(
        gerente,
        'select fondo::float8 fondo, tolerancia::float8 tolerancia from franq_caja_config where company_id = 514',
      ),
    ).toEqual({
      fondo: 2000,
      tolerancia: 50,
    });
    expect(await falla(tienda, 'select public.franq_caja_configurar(514, 0, 0)')).toMatch(/Solo el gerente/);
    expect(await falla(gerente, 'select public.franq_caja_configurar(514, -1, 0)')).toMatch(
      /Revisa el fondo/,
    );
    expect(await filas(tienda, 'select * from franq_caja_config')).toEqual([]);
  });

  it('un token OAuth (MCP) no lee caja', async () => {
    const n = await como(gerente, async () => {
      await db.query(`select set_config('request.jwt.claims', $1, false)`, [
        JSON.stringify({ sub: gerente, client_id: 'mcp' }),
      ]);
      try {
        let t = 0;
        for (const x of ['franq_arqueos', 'franq_gastos', 'franq_caja_config'])
          t += Number((await db.query<F>(`select count(*)::int n from ${x}`)).rows[0].n);
        return t;
      } finally {
        await db.query(`select set_config('request.jwt.claims', '', false)`);
      }
    });
    expect(n).toBe(0);
  });
});
