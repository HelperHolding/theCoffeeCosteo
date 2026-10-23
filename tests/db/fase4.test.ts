import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { archivosFase4, fase4, VERSION, type Conexion } from '../../scripts/conciliacion/fase4';

// Ensayo local del procedimiento de fase 4: la BD parte del estado de producción (migraciones 01–20, verificado byte a
// byte contra pg_policies real) y se ejercitan ensayo, aplicación, idempotencia, cambio concurrente y reversión.
let db: PGlite;
let cx: Conexion;
let a: Awaited<ReturnType<typeof archivosFase4>>;

const politicaLectura = async () =>
  (await db.query<{ qual: string }>(`select qual from pg_policies where tablename = 'recetas' and policyname = 'lectura'`))
    .rows[0].qual;
const registrada = async () =>
  (await db.query(`select 1 from supabase_migrations.schema_migrations where version = $1`, [VERSION])).rows.length;

beforeAll(async () => {
  db = await crearDbLocal();
  a = await archivosFase4();
  // crearDbLocal ya aplica la 21: se revierte para quedar como producción hoy y se simula el registro de Supabase.
  await db.exec(a.reversion);
  await db.exec(`create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
    insert into supabase_migrations.schema_migrations (version, name) values ('20261022000020', 'sucursales_acceso');`);
  cx = { query: (sql, p) => db.query(sql, p) as never, ejecutar: (sql) => db.exec(sql).then(() => undefined) };
});

describe('fase 4: migración 21', () => {
  it('el ensayo verifica todo y no deja cambios', async () => {
    const r = await fase4(cx, 'ensayo', a);
    expect(r).toMatchObject({
      diferenciasDePartida: { politicas: 0, funciones: 0 },
      diferenciasConMeta: { politicas: 0, funciones: 0 },
      transaccion: 'rollback',
    });
    expect(r.error).toBeUndefined();
    expect(await politicaLectura()).toBe('(rol_actual() IS NOT NULL)');
    expect(await registrada()).toBe(0);
  });

  it('aplicar deja el estado esperado y registra la versión (la integración de GitHub no la repetirá)', async () => {
    const r = await fase4(cx, 'aplicar', a);
    expect(r).toMatchObject({ transaccion: 'commit', registradaDespues: true });
    expect(await politicaLectura()).toContain('SELECT rol_actual()');
    expect(await registrada()).toBe(1);
  });

  it('aplicar dos veces no hace nada', async () => {
    const r = await fase4(cx, 'aplicar', a);
    expect(r).toMatchObject({ transaccion: 'rollback' });
    expect(r.error).toMatch(/no es el esperado de partida|ya está registrada/);
    expect(await registrada()).toBe(1);
  });

  it('un cambio posterior a la aprobación detiene la reversión sin tocar nada', async () => {
    await db.exec(`alter policy lectura on public.tamanos using (true)`);
    const r = await fase4(cx, 'revertir', a);
    expect(r).toMatchObject({ transaccion: 'rollback', diferenciasDePartida: { politicas: 1, funciones: 0 } });
    expect(await registrada()).toBe(1);
    await db.exec(`alter policy lectura on public.tamanos using ((select public.rol_actual()) is not null)`);
  });

  it('revertir restaura exactamente el estado previo y quita el registro', async () => {
    const r = await fase4(cx, 'revertir', a);
    expect(r).toMatchObject({ transaccion: 'commit', diferenciasConMeta: { politicas: 0, funciones: 0 } });
    expect(await politicaLectura()).toBe('(rol_actual() IS NOT NULL)');
    expect(await registrada()).toBe(0);
  });
});
