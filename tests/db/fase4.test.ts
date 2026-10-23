import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { archivosFase4, capturar, fase4, VERSION, type Conexion } from '../../scripts/conciliacion/fase4';

// Ensayo local del procedimiento de fase 4. La BD parte del estado de producción en políticas (01–20, verificado byte
// a byte contra pg_policies real); el estado de funciones de partida se captura aquí mismo (las ACL de PGlite difieren
// de Supabase) y el estado final se deriva con el mismo delta explícito que se usa en producción.
let db: PGlite;
let cx: Conexion;
let a: Awaited<ReturnType<typeof archivosFase4>>;
const rollbackManual = readFileSync('docs/conciliacion-brasil/rollback-021.sql', 'utf8');

const politicaLectura = async () =>
  (await db.query<{ qual: string }>(`select qual from pg_policies where tablename = 'recetas' and policyname = 'lectura'`))
    .rows[0].qual;
const registrada = async () =>
  (await db.query(`select 1 from supabase_migrations.schema_migrations where version = $1`, [VERSION])).rows.length;

beforeAll(async () => {
  db = await crearDbLocal();
  // crearDbLocal ya aplicó la 21: se simula su registro y se revierte con el archivo real para quedar como producción.
  await db.exec(`create schema supabase_migrations;
    create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
    insert into supabase_migrations.schema_migrations (version, name)
      values ('20261022000020', 'sucursales_acceso'), ('${VERSION}', 'costeo_rls_rendimiento');`);
  await db.exec(rollbackManual);
  cx = { query: (sql, p) => db.query(sql, p) as never, ejecutar: (sql) => db.exec(sql).then(() => undefined) };
  a = { ...(await archivosFase4()), antes: await capturar(cx) };
});

describe('fase 4: migración 21', () => {
  it('la reversión manual dejó el estado previo y quitó el registro en la misma transacción', async () => {
    expect(await politicaLectura()).toBe('(rol_actual() IS NOT NULL)');
    expect(await registrada()).toBe(0);
  });

  it('la reversión manual aborta sin tocar nada si la versión no está registrada', async () => {
    await expect(db.exec(rollbackManual)).rejects.toThrow(/no está registrada/);
    await db.exec('rollback').catch(() => {});
    expect(await politicaLectura()).toBe('(rol_actual() IS NOT NULL)');
  });

  it('el ensayo verifica todo y no deja cambios', async () => {
    const r = await fase4(cx, 'ensayo', a);
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({
      diferenciasDePartida: { politicas: 0, funciones: 0 },
      diferenciasConMeta: { politicas: 0, funciones: 0 },
      registradaDespues: true,
      transaccion: 'rollback',
    });
    expect(await politicaLectura()).toBe('(rol_actual() IS NOT NULL)');
    expect(await registrada()).toBe(0);
  });

  it('detecta cambios de configuración, privilegios o definición de funciones antes de aplicar', async () => {
    for (const [cambio, deshacer] of [
      ['alter function public.crm_nivel() set search_path = public', 'alter function public.crm_nivel() set search_path = public, pg_temp'],
      ['revoke execute on function public.crm_nivel() from service_role', 'grant execute on function public.crm_nivel() to service_role'],
      [
        `create or replace function public.mcp_lectura_habilitada() returns boolean language sql stable security invoker
           set search_path = public, pg_temp as $$ select false $$`,
        `create or replace function public.mcp_lectura_habilitada() returns boolean language sql stable security invoker
           set search_path = public, pg_temp as $$ select true $$`,
      ],
    ]) {
      await db.exec(cambio);
      const r = await fase4(cx, 'aplicar', a);
      expect(r).toMatchObject({ transaccion: 'rollback', diferenciasDePartida: { funciones: 1 } });
      expect(await registrada()).toBe(0);
      await db.exec(deshacer);
    }
  });

  it('aplicar deja el estado esperado (políticas, funciones, ACL) y registra la versión', async () => {
    const r = await fase4(cx, 'aplicar', a);
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({ transaccion: 'commit', registradaDespues: true });
    expect(await politicaLectura()).toContain('SELECT rol_actual()');
    const f = (await capturar(cx)).funciones.find((x) => x.nombre === 'rol_actual')!;
    expect(f).toMatchObject({ anon: false, authenticated: true, security_definer: true });
    expect(f.acl!.some((x) => x.startsWith('=') || x.startsWith('anon='))).toBe(false);
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

  it('revertir restaura exactamente el estado previo (incluidas ACL) y quita el registro', async () => {
    const r = await fase4(cx, 'revertir', a);
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({ transaccion: 'commit', diferenciasConMeta: { politicas: 0, funciones: 0 } });
    expect(await capturar(cx)).toEqual(a.antes);
    expect(await registrada()).toBe(0);
  });
});
