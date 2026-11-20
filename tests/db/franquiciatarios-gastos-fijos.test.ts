import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo } from './utilidades';

// Migración 88: gastos fijos mensuales para el P&L (solo gerencia; recaptura deja vigente el último).
let db: PGlite;
let gerente: string;
let tienda: string;
let gerenteOtra: string;
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
const fijo = (u: string, mes: string, concepto: string, monto: number) =>
  uno(u, 'select public.franq_gasto_fijo(514,$1::date,$2,$3,null) id', [mes, concepto, monto]);

beforeAll(async () => {
  db = await crearDbLocal();
  gerente = await crearUsuario(db, 'franquiciado');
  tienda = await crearUsuario(db, 'tienda');
  gerenteOtra = await crearUsuario(db, 'franquiciado');
  for (const u of [gerente, tienda, gerenteOtra]) await darModulo(db, u, 'franquiciatarios', 'lectura');
  await db.query(
    `insert into franq_miembros (user_id, company_id, rol) values ($1,514,'gerente'),($2,514,'barista'),($3,532,'gerente')`,
    [gerente, tienda, gerenteOtra],
  );
});
afterAll(async () => db.close());

describe('migración 88 · gastos fijos', () => {
  it('la gerencia captura y recaptura; el mes se normaliza al día 1; queda el historial', async () => {
    await fijo(gerente, '2026-10-15', 'renta', 45000);
    await fijo(gerente, '2026-10-01', 'renta', 47500.555);
    await fijo(gerente, '2026-10-01', 'nomina', 62000);
    const r = await filas(
      gerente,
      `select mes::text mes, concepto, monto::float8 monto from franq_gastos_fijos order by id`,
    );
    expect(r).toEqual([
      { mes: '2026-10-01', concepto: 'renta', monto: 45000 },
      { mes: '2026-10-01', concepto: 'renta', monto: 47500.56 },
      { mes: '2026-10-01', concepto: 'nomina', monto: 62000 },
    ]);
  });

  it('la cuenta de baristas y otra sucursal no capturan ni leen', async () => {
    expect(await falla(tienda, `select public.franq_gasto_fijo(514,'2026-10-01','renta',1,null)`)).toMatch(
      /Solo el gerente/,
    );
    expect(
      await falla(gerenteOtra, `select public.franq_gasto_fijo(514,'2026-10-01','renta',1,null)`),
    ).toMatch(/Solo el gerente/);
    expect(await filas(tienda, 'select * from franq_gastos_fijos')).toEqual([]);
    expect(await filas(gerenteOtra, 'select * from franq_gastos_fijos')).toEqual([]);
  });

  it('validaciones: concepto, monto y mes; no se editan ni se borran', async () => {
    expect(await falla(gerente, `select public.franq_gasto_fijo(514,'2026-10-01','comida',1,null)`)).toMatch(
      /Concepto inválido/,
    );
    expect(await falla(gerente, `select public.franq_gasto_fijo(514,'2026-10-01','renta',-1,null)`)).toMatch(
      /de 0 en adelante/,
    );
    expect(await falla(gerente, `select public.franq_gasto_fijo(514,'2099-01-01','renta',1,null)`)).toMatch(
      /Mes inválido/,
    );
    expect(await falla(null, 'update franq_gastos_fijos set monto = 0')).toMatch(/no se editan/);
    expect(await falla(null, 'delete from franq_gastos_fijos')).toMatch(/no se editan ni se borran/);
  });
});
