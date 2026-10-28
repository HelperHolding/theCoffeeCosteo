import { readdirSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import type { Conexion } from '../../scripts/conciliacion/fase4';
import { capturarEsquema } from '../../scripts/conciliacion/migracion-22';
import { archivos23, migracion23, ULTIMA_PREVIA_23, VERSION_23 } from '../../scripts/analytics/migracion-23';

// Ensayo local del procedimiento: la BD parte de 01–22 con su registro, como producción hoy.
let db: PGlite;
let cx: Conexion;
let a: Awaited<ReturnType<typeof archivos23>>;
let antes: Awaited<ReturnType<typeof capturarEsquema>>;
const registrada = async () =>
  (await db.query(`select 1 from supabase_migrations.schema_migrations where version = $1`, [VERSION_23]))
    .rows.length;
const existe = async () =>
  (await db.query<{ e: boolean }>(`select to_regclass('public.analytics_lecturas') is not null as e`)).rows[0]
    .e;

beforeAll(async () => {
  db = await crearDbLocal(ULTIMA_PREVIA_23);
  await db.exec(`create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`);
  for (const f of readdirSync('supabase/migrations').filter(
    (f) => f.endsWith('.sql') && f.slice(0, 14) <= ULTIMA_PREVIA_23,
  ))
    await db.query(`insert into supabase_migrations.schema_migrations (version) values ($1)`, [
      f.slice(0, 14),
    ]);
  cx = {
    query: (sql, p) => db.query(sql, p) as never,
    ejecutar: (sql) => db.exec(sql).then(() => undefined),
  };
  a = await archivos23();
  antes = await capturarEsquema(cx);
});

describe('migración 23: procedimiento', () => {
  it('el ensayo verifica todo y no deja objetos ni registro', async () => {
    const r = await migracion23(cx, 'ensayo', a);
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({
      transaccion: 'rollback',
      previoIntacto: true,
      objetosNuevos: 'exactamente los esperados',
      registroDespues: [VERSION_23, ULTIMA_PREVIA_23],
      politicasTotales: { antes: antes.politicas.length, despues: antes.politicas.length + 6 },
    });
    expect(await existe()).toBe(false);
    expect(await registrada()).toBe(0);
    expect(await capturarEsquema(cx)).toEqual(antes);
  });

  it('aplicar confirma; repetirlo no hace nada', async () => {
    expect(await migracion23(cx, 'aplicar', a)).toMatchObject({ transaccion: 'commit' });
    expect(await existe()).toBe(true);
    expect(await registrada()).toBe(1);
    const otra = await migracion23(cx, 'aplicar', a);
    expect(otra).toMatchObject({ transaccion: 'rollback' });
    expect(String(otra.error)).toMatch(/No se aplica nada/);
  });

  it('revertir con datos aborta; sin datos deja el esquema como estaba', async () => {
    await db.query(`insert into analytics_tiendas values (1, 1, 'x', '{crm}', now())`);
    const conDatos = await migracion23(cx, 'revertir', a);
    expect(conDatos).toMatchObject({ transaccion: 'rollback' });
    expect(String(conDatos.error)).toMatch(/tienen filas/);
    await db.query(`delete from analytics_tiendas`);
    expect(await migracion23(cx, 'revertir', a)).toMatchObject({
      transaccion: 'commit',
      previoIntacto: true,
    });
    expect(await existe()).toBe(false);
    expect(await registrada()).toBe(0);
    expect(await capturarEsquema(cx)).toEqual(antes);
  });
});
