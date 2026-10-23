import { readFile } from 'node:fs/promises';

/**
 * Fase 4 · Lógica de la migración 21 (RLS de Costeo), independiente de la conexión: la usa el CLI con pg sobre el
 * proyecto real y las pruebas con PGlite. Todo ocurre en UNA transacción:
 *  1. exige que el estado actual (políticas + funciones + registro) sea exactamente el esperado de partida;
 *  2. aplica la migración (o la reversión) y la registra (o la quita) en supabase_migrations.schema_migrations;
 *  3. exige que el resultado sea exactamente el estado esperado final;
 *  4. COMMIT solo en modo aplicar/revertir; el ensayo y cualquier fallo terminan en ROLLBACK.
 */
export type Modo = 'ensayo' | 'aplicar' | 'revertir';
/** pg.Client y un adaptador de PGlite lo cumplen; `ejecutar` corre texto con varias sentencias. */
export interface Conexion {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  ejecutar(sql: string): Promise<void>;
}
interface Estado {
  politicas: unknown[];
  funciones: unknown[];
}

export const VERSION = '20261023000021';
export const NOMBRE = 'costeo_rls_rendimiento';

export async function archivosFase4(raiz = '.') {
  const leer = (r: string) => readFile(`${raiz}/${r}`, 'utf8');
  const json = async (r: string) => JSON.parse(await leer(r)) as Estado;
  return {
    migracion: await leer(`supabase/migrations/${VERSION}_${NOMBRE}.sql`),
    // El archivo de reversión trae su propio begin/commit para usarlo en el SQL Editor; aquí va dentro de la nuestra.
    reversion: (await leer('docs/conciliacion-brasil/rollback-021.sql'))
      .split(/\r?\n/)
      .filter((l) => !/^\s*(begin|commit);\s*$/i.test(l))
      .join('\n'),
    antes: await json('docs/conciliacion-brasil/fase4/esperado-antes.json'),
    despues: await json('docs/conciliacion-brasil/fase4/esperado-despues.json'),
  };
}

async function estado(db: Conexion): Promise<Estado> {
  return {
    politicas: (
      await db.query(`select tablename, policyname, permissive, roles::text, cmd, qual, with_check
        from pg_policies where schemaname in ('public', 'storage') order by 1, 2`)
    ).rows,
    funciones: (
      await db.query(`select p.proname, p.proconfig, has_function_privilege('anon', p.oid, 'execute') as anon,
        has_function_privilege('authenticated', p.oid, 'execute') as auth
        from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`)
    ).rows,
  };
}

const clave = (x: unknown) => JSON.stringify(x);
/** Objetos que difieren entre el estado real y el esperado (por posición y por cantidad). */
function diferencias(real: Estado, meta: Estado) {
  const cuenta = (a: unknown[], b: unknown[]) =>
    a.filter((x, i) => clave(x) !== clave(b[i])).length + Math.abs(a.length - b.length);
  return { politicas: cuenta(real.politicas, meta.politicas), funciones: cuenta(real.funciones, meta.funciones) };
}

export async function fase4(db: Conexion, modo: Modo, a: Awaited<ReturnType<typeof archivosFase4>>) {
  const registrada = async () =>
    (await db.query(`select 1 from supabase_migrations.schema_migrations where version = $1`, [VERSION])).rows
      .length === 1;
  const revertir = modo === 'revertir';
  const [partida, meta] = revertir ? [a.despues, a.antes] : [a.antes, a.despues];
  const informe: Record<string, unknown> = { modo };
  let fin: 'commit' | 'rollback' = 'rollback';
  await db.query('begin');
  try {
    await db.query("set local lock_timeout = '3s'");
    await db.query("set local statement_timeout = '30s'");
    informe.diferenciasDePartida = diferencias(await estado(db), partida);
    informe.registradaAntes = await registrada();
    const d0 = informe.diferenciasDePartida as ReturnType<typeof diferencias>;
    if (d0.politicas || d0.funciones)
      throw new Error('El estado actual no es el esperado de partida (¿cambios desde la aprobación?). No se aplica nada.');
    if (informe.registradaAntes !== revertir)
      throw new Error(`La migración ${VERSION} ${revertir ? 'no está' : 'ya está'} registrada. No se aplica nada.`);

    await db.ejecutar(revertir ? a.reversion : a.migracion);
    if (revertir) await db.query(`delete from supabase_migrations.schema_migrations where version = $1`, [VERSION]);
    else
      await db.query(`insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)`, [
        VERSION,
        NOMBRE,
        [a.migracion],
      ]);

    informe.diferenciasConMeta = diferencias(await estado(db), meta);
    informe.registradaDespues = await registrada();
    const d1 = informe.diferenciasConMeta as ReturnType<typeof diferencias>;
    if (d1.politicas || d1.funciones) throw new Error('El resultado no coincide con el estado esperado. ROLLBACK.');
    if (modo !== 'ensayo') fin = 'commit';
  } catch (e) {
    informe.error = e instanceof Error ? e.message : String(e);
  } finally {
    await db.query(fin);
    informe.transaccion = fin;
  }
  return informe;
}
