import { readdirSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import type { Conexion } from '../../scripts/conciliacion/fase4';
import {
  archivos22,
  capturarEsquema,
  migracion22,
  ULTIMA_PREVIA,
  VERSION_22,
} from '../../scripts/conciliacion/migracion-22';
import { crearProducto } from './fabricas';

// Ensayo local del procedimiento de la migración 22: la BD parte de 01–21 con su registro, como producción hoy.
let db: PGlite;
let cx: Conexion;
let a: Awaited<ReturnType<typeof archivos22>>;
let antes: Awaited<ReturnType<typeof capturarEsquema>>;
const registrada = async () =>
  (await db.query(`select 1 from supabase_migrations.schema_migrations where version = $1`, [VERSION_22]))
    .rows.length;
const existe = async () =>
  (await db.query<{ e: boolean }>(`select to_regclass('public.producto_codigo_pos') is not null as e`))
    .rows[0].e;

beforeAll(async () => {
  db = await crearDbLocal(ULTIMA_PREVIA);
  const versiones = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql') && f.slice(0, 14) <= ULTIMA_PREVIA)
    .map((f) => f.slice(0, 14));
  await db.exec(`create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`);
  for (const v of versiones)
    await db.query(`insert into supabase_migrations.schema_migrations (version) values ($1)`, [v]);
  cx = {
    query: (sql, p) => db.query(sql, p) as never,
    ejecutar: (sql) => db.exec(sql).then(() => undefined),
  };
  a = await archivos22();
  antes = await capturarEsquema(cx);
});

describe('migración 22: procedimiento', () => {
  it('el ensayo verifica todo y no deja ni la tabla ni el registro', async () => {
    const r = await migracion22(cx, 'ensayo', a);
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({
      transaccion: 'rollback',
      objetosNuevos: 'exactamente los esperados',
      diferenciasEnLoPrevio: { politicas: 0, funciones: 0, tablas: 0 },
      registroDespues: [VERSION_22, ULTIMA_PREVIA],
    });
    expect(r.politicasTotales).toEqual({
      antes: antes.politicas.length,
      despues: antes.politicas.length + 7,
    });
    expect(await existe()).toBe(false);
    expect(await registrada()).toBe(0);
    expect(await capturarEsquema(cx)).toEqual(antes);
  });

  it('revertir sin la 22 registrada no toca nada', async () => {
    const r = await migracion22(cx, 'revertir', a);
    expect(r).toMatchObject({ transaccion: 'rollback' });
    expect(r.error).toMatch(/Para revertir/);
  });

  it('aplicar crea solo lo esperado, deja intacto lo previo y registra la versión', async () => {
    const r = await migracion22(cx, 'aplicar', a);
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({ transaccion: 'commit', objetosNuevos: 'exactamente los esperados' });
    expect(await registrada()).toBe(1);
    expect(await existe()).toBe(true);
  });

  it('aplicar dos veces no hace nada', async () => {
    const r = await migracion22(cx, 'aplicar', a);
    expect(r).toMatchObject({ transaccion: 'rollback' });
    expect(r.error).toMatch(/última versión registrada/);
  });

  it('la reversión del esquema se niega si hay filas o si cambiaron las políticas', async () => {
    const p = await crearProducto(db, { nombre: 'Producto reversión 22', precios: { Chica: 50 } });
    await db.query(
      `insert into producto_codigo_pos (codigo, receta_id, nombre_observado, evidencia) values ('REV22', $1, 'x', 'y')`,
      [p],
    );
    let r = await migracion22(cx, 'revertir', a);
    expect(r.error).toMatch(/no están como los dejó/);
    expect(r.objetosAntes).toEqual(['la tabla tiene 1 filas']);
    expect(await existe()).toBe(true);
    await db.query(`delete from producto_codigo_pos where codigo = 'REV22'`);
    await db.exec(`alter policy lectura on public.producto_codigo_pos using (true)`);
    r = await migracion22(cx, 'revertir', a);
    expect(r).toMatchObject({ transaccion: 'rollback' });
    expect(await registrada()).toBe(1);
    await db.exec(
      `alter policy lectura on public.producto_codigo_pos using ((select public.rol_actual()) is not null)`,
    );
  });

  it('rollback-022.sql por sí solo (SQL Editor) también se niega ante filas o políticas cambiadas', async () => {
    const sql = readFileSync('docs/conciliacion-brasil/rollback-022.sql', 'utf8');
    const p = await crearProducto(db, { nombre: 'Producto rollback 22', precios: { Chica: 50 } });
    await db.query(
      `insert into producto_codigo_pos (codigo, receta_id, nombre_observado, evidencia) values ('RB22', $1, 'x', 'y')`,
      [p],
    );
    await expect(db.exec(sql)).rejects.toThrow(/tiene filas/);
    await db.exec('rollback').catch(() => {});
    await db.query(`delete from producto_codigo_pos where codigo = 'RB22'`);
    await db.exec(`alter policy baja on public.producto_codigo_pos using (true)`);
    await expect(db.exec(sql)).rejects.toThrow(/cambiaron desde la migración/);
    await db.exec('rollback').catch(() => {});
    await db.exec(
      `alter policy baja on public.producto_codigo_pos using ((select public.tiene_rol('operaciones', 'admin')))`,
    );
    expect(await existe()).toBe(true);
    expect(await registrada()).toBe(1);
  });

  it('revertir deja exactamente el esquema previo y quita el registro', async () => {
    const r = await migracion22(cx, 'revertir', a);
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({
      transaccion: 'commit',
      diferenciasEnLoPrevio: { politicas: 0, funciones: 0, tablas: 0 },
    });
    expect(await existe()).toBe(false);
    expect(await registrada()).toBe(0);
    expect(await capturarEsquema(cx)).toEqual(antes);
  });

  it('un cambio en un objeto previo durante la migración la detiene', async () => {
    const alterada = {
      ...a,
      migracion: `${a.migracion}\nalter policy lectura on public.tamanos using (true);`,
    };
    const r = await migracion22(cx, 'aplicar', alterada);
    expect(r).toMatchObject({ transaccion: 'rollback', diferenciasEnLoPrevio: { politicas: 1 } });
    expect(await registrada()).toBe(0);
    expect(await capturarEsquema(cx)).toEqual(antes);
  });
});
