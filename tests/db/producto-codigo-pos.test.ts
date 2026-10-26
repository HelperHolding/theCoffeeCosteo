import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { crearProducto, crearSubreceta } from './fabricas';
import { comoUsuario, crearUsuario, num } from './utilidades';

// Migración 22: códigos del POS de Brasil ligados a recetas (docs/conciliacion-brasil/15).
let db: PGlite;
let compras: string, operaciones: string, admin: string, latte: string, mix: string;
const insertar = (codigo: string, receta: string) =>
  db.query(
    `insert into producto_codigo_pos (codigo, receta_id, nombre_observado, evidencia) values ($1, $2, 'Iced Latte', 'prueba') returning id`,
    [codigo, receta],
  );

beforeAll(async () => {
  db = await crearDbLocal();
  [compras, operaciones, admin] = [
    await crearUsuario(db, 'compras'),
    await crearUsuario(db, 'operaciones'),
    await crearUsuario(db, 'admin'),
  ];
  latte = await crearProducto(db, { nombre: 'Latte códigos POS', precios: { Chica: 70, Grande: 80 } });
  mix = await crearSubreceta(db, { nombre: 'Mix códigos POS', rendimiento: 1000 });
});

describe('producto_codigo_pos', () => {
  it('un código liga una sola receta; una receta admite varios códigos', async () => {
    await insertar('5IL-PRUEBA', latte);
    await insertar('5IL-APP-PRUEBA', latte);
    await expect(insertar('5IL-PRUEBA', latte)).rejects.toThrow(/duplicate key|unique/);
  });

  it('rechaza GENERIC, códigos vacíos o con espacios y sub-recetas', async () => {
    await expect(insertar('GENERIC', latte)).rejects.toThrow(/check/);
    await expect(insertar('generic', latte)).rejects.toThrow(/check/);
    await expect(insertar('', latte)).rejects.toThrow(/check/);
    await expect(insertar(' 5IL ', latte)).rejects.toThrow(/check/);
    await expect(insertar('MIX-PRUEBA', mix)).rejects.toThrow(/sub-receta/);
  });

  it('no se puede borrar una receta con códigos ligados (on delete restrict)', async () => {
    await expect(db.query('delete from recetas where id = $1', [latte])).rejects.toThrow(
      /foreign key|violates/,
    );
  });

  it('lectura para perfiles activos; escritura solo operaciones y admin; registra bitácora', async () => {
    const leer = (uid: string) =>
      comoUsuario(db, uid, async () =>
        num((await db.query<{ n: number }>('select count(*)::int n from producto_codigo_pos')).rows[0].n),
      );
    expect(await leer(compras)).toBe(2);
    await expect(comoUsuario(db, compras, () => insertar('COMPRAS-PRUEBA', latte))).rejects.toThrow(
      /row-level security/,
    );
    await comoUsuario(db, operaciones, () => insertar('OPER-PRUEBA', latte));
    await comoUsuario(db, admin, () =>
      db.query(`delete from producto_codigo_pos where codigo = 'OPER-PRUEBA'`),
    );
    const b = await db.query<{ n: number }>(
      `select count(*)::int n from bitacora where tabla = 'producto_codigo_pos' and origen = 'portal'`,
    );
    expect(num(b.rows[0].n)).toBeGreaterThanOrEqual(2);
  });

  it('una sesión OAuth (MCP) lee pero no escribe', async () => {
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [
      JSON.stringify({ client_id: 'claude-client' }),
    ]);
    try {
      expect(
        await comoUsuario(
          db,
          admin,
          async () => (await db.query('select codigo from producto_codigo_pos')).rows.length,
        ),
      ).toBeGreaterThan(0);
      await expect(comoUsuario(db, admin, () => insertar('OAUTH-PRUEBA', latte))).rejects.toThrow(
        /row-level security/,
      );
    } finally {
      await db.query(`select set_config('request.jwt.claims', '', false)`);
    }
  });

  it('anon no lee ni escribe; la función del trigger no es ejecutable por anon ni authenticated', async () => {
    await db.exec('set role anon');
    try {
      await expect(db.query('select 1 from producto_codigo_pos')).rejects.toThrow(/permission denied/);
      await expect(insertar('ANON-PRUEBA', latte)).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('reset role');
    }
    const f = await db.query<{ anon: boolean; aut: boolean; definer: boolean; config: string[] }>(
      `select has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as aut,
              p.prosecdef as definer, p.proconfig as config
         from pg_proc p where p.proname = 'validar_producto_codigo_pos'`,
    );
    expect(f.rows[0]).toEqual({
      anon: false,
      aut: false,
      definer: false,
      config: ['search_path=public, pg_temp'],
    });
    const priv = await db.query<{ r: string; p: string }>(
      `select r, string_agg(x, ',' order by x) filter (where has_table_privilege(r, 'public.producto_codigo_pos', x)) as p
         from unnest(array['anon', 'authenticated']) r,
              unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) x
        group by r order by r`,
    );
    expect(priv.rows).toEqual([
      { r: 'anon', p: null },
      { r: 'authenticated', p: 'DELETE,INSERT,SELECT,UPDATE' },
    ]);
  });

  it('la autoría sale de la sesión y no se puede falsear ni cambiar; carga_id tampoco', async () => {
    const fila = await comoUsuario(
      db,
      operaciones,
      async () =>
        (
          await db.query<{ id: string; creado_por: string }>(
            `insert into producto_codigo_pos (codigo, receta_id, nombre_observado, evidencia, creado_por, creado_en)
           values ('AUTOR-PRUEBA', $1, 'Latte', 'prueba', $2, '2000-01-01') returning id, creado_por`,
            [latte, admin],
          )
        ).rows[0],
    );
    expect(fila.creado_por).toBe(operaciones);
    await comoUsuario(db, admin, () =>
      db.query(
        `update producto_codigo_pos set creado_por = $2, creado_en = '2000-01-01', carga_id = gen_random_uuid(),
           evidencia = 'corregida' where id = $1`,
        [fila.id, admin],
      ),
    );
    const r = await db.query<{
      creado_por: string;
      viejo: boolean;
      carga_id: string | null;
      evidencia: string;
    }>(
      `select creado_por, creado_en < '2001-01-01' as viejo, carga_id, evidencia from producto_codigo_pos where id = $1`,
      [fila.id],
    );
    expect(r.rows[0]).toEqual({
      creado_por: operaciones,
      viejo: false,
      carga_id: null,
      evidencia: 'corregida',
    });
  });

  it('la bitácora registra la fila (registro_id = id) pero no la receta en receta_id', async () => {
    const id = (await insertar('BITACORA-PRUEBA', latte)).rows[0] as { id: string };
    const b = await db.query<{
      registro_id: string;
      receta_id: string | null;
      campo: string;
      fila: { receta_id: string; codigo: string };
    }>(
      `select registro_id, receta_id, campo, valor_nuevo::jsonb as fila from bitacora
        where tabla = 'producto_codigo_pos' and registro_id = $1`,
      [id.id],
    );
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0]).toMatchObject({ registro_id: id.id, receta_id: null, campo: '*' });
    expect(b.rows[0].fila).toMatchObject({ receta_id: latte, codigo: 'BITACORA-PRUEBA' });
  });

  it('las políticas siguen el patrón initPlan', async () => {
    const r = await db.query<{ expr: string }>(
      `select coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr from pg_policies where tablename = 'producto_codigo_pos'`,
    );
    for (const { expr } of r.rows) expect(expr).not.toMatch(/(^|[^T] )(rol_actual|tiene_rol|auth\.jwt)\(/);
    expect(r.rows).toHaveLength(7);
  });
});
