// tests/db/sucursales-consumo-mes.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { crearInsumo } from './fabricas';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 38: consumo nacional por mes. Tablas cerradas; se escribe por RPC de servicio y se lee con acceso.
let db: PGlite;
let gdl: string;
let ajeno: string;
let leche: string;
let cafe: string;

const meta = (completa = true) =>
  JSON.stringify({
    completa,
    recetas_leidas_en: '2026-11-05T12:00:00Z',
    cobertura: { mostrador: { lineas: 10, incluidas: 8, generico: 1, sinCodigo: 0, sinEnlace: 1 } },
    sin_receta: { mostrador: [{ nombre: 'Sandwich', unidades: 1, sinCodigo: false }] },
  });
const fila = (origen: string, insumoId: string, insumo: string, cantidad: number, unidad = 'ml') => ({
  origen,
  insumo_id: insumoId,
  insumo,
  unidad,
  categoria: 'LECHE',
  cantidad,
});
const guardar = async (mes: string, company: number, filas: unknown[], completa = true) => {
  await db.exec('set role service_role');
  try {
    return (
      await db.query<{ n: number }>('select public.sucursales_guardar_consumo_mes($1, $2, $3, $4) n', [
        mes,
        company,
        meta(completa),
        JSON.stringify(filas),
      ])
    ).rows[0].n;
  } finally {
    await db.exec('reset role');
  }
};
type Nacional = {
  meses: string[];
  sucursales: { company_id: number; completa: boolean }[];
  insumos: { insumo_id: string; origen: string; cantidad: number; presentacion: number | null; sucursales: number }[];
  anterior: { insumo_id: string; origen: string; cantidad: number }[];
  sucursales_anterior: number;
};
const nacional = (u: string, mes: string, companias: number[]) =>
  comoUsuario(
    db,
    u,
    async () =>
      (await db.query<{ r: Nacional }>('select public.sucursales_consumo_nacional($1, $2) r', [mes, companias]))
        .rows[0].r,
  );
const desglose = (u: string, mes: string, companias: number[], insumo: string | null) =>
  comoUsuario(
    db,
    u,
    async () =>
      (
        await db.query<{ r: { company_id: number; insumo_id: string; origen: string; cantidad: number }[] }>(
          'select public.sucursales_consumo_desglose($1, $2, $3) r',
          [mes, companias, insumo],
        )
      ).rows[0].r,
  );

beforeAll(async () => {
  db = await crearDbLocal();
  gdl = await crearUsuario(db, 'sucursales');
  ajeno = await crearUsuario(db, 'sucursales');
  for (const u of [gdl, ajeno])
    await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'sucursales', 'lectura')`, [u]);
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1, 513), ($1, 384), ($2, 532)', [
    gdl,
    ajeno,
  ]);
  // La base local no siembra insumos: se crean dos con la fábrica de pruebas.
  leche = await crearInsumo(db, { nombre: 'LECHE ENTERA', costoPaquete: 25, presentacion: 1000, unidad: 'ml' });
  cafe = await crearInsumo(db, { nombre: 'CAFÉ TOSTADO EN GRANO BLACK 1.5 KG', costoPaquete: 600, presentacion: 1500 });

  await guardar('2026-10-01', 513, [fila('mostrador', leche, 'LECHE ENTERA', 1000), fila('rappi', leche, 'LECHE ENTERA', 200)]);
  await guardar('2026-10-01', 384, [fila('mostrador', leche, 'LECHE ENTERA', 500), fila('app', cafe, 'CAFÉ', 36, 'gr')], false);
  await guardar('2026-10-01', 532, [fila('mostrador', leche, 'LECHE ENTERA', 9999)]);
  await guardar('2026-09-01', 513, [fila('mostrador', leche, 'LECHE ENTERA', 800)]);
});
afterAll(async () => db.close());

describe('migración 38: consumo nacional por mes', () => {
  it('tablas y funciones internas cerradas al portal', async () => {
    await expect(comoUsuario(db, gdl, () => db.query('select * from sucursales_consumo_mes'))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      comoUsuario(db, gdl, () => db.query('select * from sucursales_consumo_mes_sucursal')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      comoUsuario(db, gdl, () => db.query('select public.sucursales_recetas_consumo_datos()')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      comoUsuario(db, gdl, () =>
        db.query(`select public.sucursales_guardar_consumo_mes('2026-10-01', 513, '{}', '[]')`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('la RPC de recetas del portal sigue igual: con acceso da datos, sin acceso null', async () => {
    const con = await comoUsuario(db, gdl, async () =>
      (await db.query<{ r: unknown }>('select public.sucursales_recetas_consumo(513) r')).rows[0].r,
    );
    const sin = await comoUsuario(db, gdl, async () =>
      (await db.query<{ r: unknown }>('select public.sucursales_recetas_consumo(532) r')).rows[0].r,
    );
    expect(con).toHaveProperty('insumos');
    expect(sin).toBeNull();
  });

  it('suma por insumo y origen solo de las sucursales del usuario, con presentación y mes anterior', async () => {
    const r = await nacional(gdl, '2026-10-01', [513, 384, 532]);
    expect(r.meses).toEqual(['2026-10-01', '2026-09-01']);
    expect(r.sucursales.map((s) => [s.company_id, s.completa]).sort()).toEqual([
      [384, false],
      [513, true],
    ]);
    const lm = r.insumos.find((x) => x.insumo_id === leche && x.origen === 'mostrador')!;
    expect(Number(lm.cantidad)).toBe(1500); // 513 + 384; 532 no es suya
    expect(lm.sucursales).toBe(2);
    expect(Number(lm.presentacion)).toBeGreaterThan(0);
    expect(Number(r.insumos.find((x) => x.insumo_id === leche && x.origen === 'rappi')!.cantidad)).toBe(200);
    expect(r.anterior).toEqual([{ insumo_id: leche, origen: 'mostrador', cantidad: 800 }]);
    expect(r.sucursales_anterior).toBe(1);
    const otro = await nacional(ajeno, '2026-10-01', [513, 532]);
    expect(otro.sucursales.map((s) => s.company_id)).toEqual([532]);
    expect(otro.meses).toEqual(['2026-10-01']);
  });

  it('desglose por sucursal de un insumo o de todos', async () => {
    const uno = await desglose(gdl, '2026-10-01', [513, 384, 532], leche);
    expect(uno.map((x) => [x.company_id, x.origen, Number(x.cantidad)]).sort()).toEqual([
      [384, 'mostrador', 500],
      [513, 'mostrador', 1000],
      [513, 'rappi', 200],
    ]);
    expect((await desglose(gdl, '2026-10-01', [513, 384, 532], null)).length).toBe(4);
  });

  it('recalcular un mes lo reemplaza: sin duplicados ni insumos viejos', async () => {
    const n = await guardar('2026-10-01', 513, [fila('mostrador', cafe, 'CAFÉ', 18, 'gr')]);
    expect(n).toBe(1);
    const uno = await desglose(gdl, '2026-10-01', [513], null);
    expect(uno.map((x) => [x.insumo_id, Number(x.cantidad)])).toEqual([[cafe, 18]]);
  });

  it('un insumo borrado del catálogo se sigue sumando, sin presentación', async () => {
    const fantasma = '00000000-0000-4000-8000-000000000001';
    await guardar('2026-08-01', 513, [fila('mostrador', fantasma, 'INSUMO VIEJO', 5, 'pza')]);
    const r = await nacional(gdl, '2026-08-01', [513]);
    expect(r.insumos).toEqual([
      expect.objectContaining({ insumo_id: fantasma, insumo: 'INSUMO VIEJO', presentacion: null }),
    ]);
  });

  it('rechaza un origen inválido y meses que no son primer día', async () => {
    await expect(guardar('2026-10-01', 513, [fila('uber', leche, 'LECHE ENTERA', 1)])).rejects.toThrow();
    await expect(guardar('2026-10-02', 513, [])).rejects.toThrow(/primer día/);
  });
});
