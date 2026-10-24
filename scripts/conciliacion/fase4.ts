import { readFile } from 'node:fs/promises';

/**
 * Fase 4 · Lógica de la migración 21 (RLS de Costeo), independiente de la conexión: la usa el CLI con pg sobre el
 * proyecto real y las pruebas con PGlite. Todo ocurre en UNA transacción:
 *  1. exige que el estado actual (políticas + funciones + registro) sea exactamente el de partida;
 *  2. aplica la migración (o la reversión, que también quita el registro) y registra la versión al aplicar;
 *  3. exige que el resultado sea exactamente el estado esperado final;
 *  4. COMMIT solo en modo aplicar/revertir; el ensayo y cualquier fallo terminan en ROLLBACK.
 *
 * Estado de partida = captura de producción (fase4/estado-antes-produccion.json, solo lectura).
 * Estado final = políticas de PGlite con 01–21 (fase4/politicas-despues.json) + las funciones de partida con el
 * delta explícito de la migración (DELTA_FUNCIONES). Así no se depende de detalles de PGlite en funciones/ACL.
 */
export type Modo = 'ensayo' | 'aplicar' | 'revertir';
/** pg.Client y un adaptador de PGlite lo cumplen; `ejecutar` corre texto con varias sentencias. */
export interface Conexion {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  ejecutar(sql: string): Promise<void>;
}
export interface Funcion {
  nombre: string;
  args: string;
  resultado: string;
  lenguaje: string;
  volatilidad: string;
  security_definer: boolean;
  config: string[] | null;
  propietario: string;
  cuerpo_md5: string;
  /** proacl como conjunto ordenado (el orden de las entradas no tiene significado); null = ACL por defecto. */
  acl: string[] | null;
  anon: boolean;
  authenticated: boolean;
  service_role: boolean;
}
export interface Estado {
  politicas: unknown[];
  funciones: Funcion[];
}

export const VERSION = '20261023000021';
export const NOMBRE = 'costeo_rls_rendimiento';

export async function archivosFase4(raiz = '.') {
  const leer = (r: string) => readFile(`${raiz}/${r}`, 'utf8');
  return {
    migracion: await leer(`supabase/migrations/${VERSION}_${NOMBRE}.sql`),
    // El archivo de reversión trae su propio begin/commit para el SQL Editor; aquí va dentro de nuestra transacción.
    reversion: (await leer('docs/conciliacion-brasil/rollback-021.sql'))
      .split(/\r?\n/)
      .filter((l) => !/^\s*(begin|commit);\s*$/i.test(l))
      .join('\n'),
    antes: JSON.parse(await leer('docs/conciliacion-brasil/fase4/estado-antes-produccion.json')) as Estado,
    politicasDespues: JSON.parse(await leer('docs/conciliacion-brasil/fase4/politicas-despues.json')) as unknown[],
  };
}

export async function capturar(db: Pick<Conexion, 'query'>): Promise<Estado> {
  const politicas = (
    await db.query(`select tablename, policyname, permissive, roles::text, cmd, qual, with_check
      from pg_policies where schemaname in ('public', 'storage') order by 1, 2`)
  ).rows;
  const funciones = (
    await db.query<Funcion>(`
      select p.proname as nombre, pg_get_function_identity_arguments(p.oid) as args,
             pg_get_function_result(p.oid) as resultado, l.lanname as lenguaje, p.provolatile::text as volatilidad,
             p.prosecdef as security_definer, p.proconfig as config, pg_get_userbyid(p.proowner) as propietario,
             md5(p.prosrc) as cuerpo_md5,
             (select array_agg(x order by x) from unnest(p.proacl::text[]) x) as acl,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
             has_function_privilege('service_role', p.oid, 'execute') as service_role
      from pg_proc p join pg_language l on l.oid = p.prolang
      where p.pronamespace = 'public'::regnamespace
      order by 1, 2`)
  ).rows;
  return { politicas, funciones };
}

/** Quita la ejecución a PUBLIC y anon y la garantiza a authenticated, como hace la migración 21. */
function sinEjecucionPublica(f: Funcion): Funcion {
  const base = f.acl ?? [`=X/${f.propietario}`, `${f.propietario}=X/${f.propietario}`];
  const acl = base.filter((a) => !a.startsWith('=') && !a.startsWith('anon='));
  if (!acl.some((a) => a.startsWith('authenticated='))) acl.push(`authenticated=X/${f.propietario}`);
  return {
    ...f,
    acl: acl.sort(),
    anon: false,
    authenticated: true,
    service_role: acl.some((a) => a.startsWith('service_role=')),
  };
}
/** Delta de la migración 21 sobre funciones; el resto debe quedar idéntico (firma, cuerpo, dueño, ACL…). */
export const DELTA_FUNCIONES: Record<string, (f: Funcion) => Funcion> = {
  'tiene_rol(VARIADIC roles text[])': (f) => ({
    ...f,
    config: [...(f.config ?? []).filter((c) => !c.startsWith('search_path=')), 'search_path=public, pg_temp'],
  }),
  'rol_actual()': sinEjecucionPublica,
  'registrar_bitacora()': sinEjecucionPublica,
};
export const firma = (f: Pick<Funcion, 'nombre' | 'args'>) => `${f.nombre}(${f.args})`;

export function esperadoDespues(antes: Estado, politicasDespues: unknown[]): Estado {
  return {
    politicas: politicasDespues,
    funciones: antes.funciones.map((f) => DELTA_FUNCIONES[firma(f)]?.(f) ?? f),
  };
}

const json = (x: unknown) => JSON.stringify(x);
/** Diferencias por objeto: políticas por tabla.nombre y funciones por firma, con la lista para el informe. */
export function diferencias(real: Estado, meta: Estado) {
  const comparar = <T>(a: T[], b: T[], id: (x: T) => string) => {
    const mb = new Map(b.map((x) => [id(x), json(x)]));
    const ma = new Map(a.map((x) => [id(x), json(x)]));
    return [...new Set([...ma.keys(), ...mb.keys()])].filter((k) => ma.get(k) !== mb.get(k)).sort();
  };
  const pol = (x: unknown) => {
    const p = x as { tablename: string; policyname: string };
    return `${p.tablename}.${p.policyname}`;
  };
  const politicas = comparar(real.politicas, meta.politicas, pol);
  const funciones = comparar(real.funciones, meta.funciones, firma);
  return { politicas: politicas.length, funciones: funciones.length, detalle: [...politicas, ...funciones].slice(0, 20) };
}

/**
 * Medición de solo lectura dentro de la misma transacción, tras verificar el resultado (antes del COMMIT/ROLLBACK):
 * huella de v_resumen y EXPLAIN ANALYZE bajo RLS como un usuario admin activo. Sirve para ver V2/V3 en el ensayo.
 */
export async function medirBajoRls(db: Pick<Conexion, 'query'>) {
  const uid = (await db.query<{ user_id: string }>(`select user_id from perfiles where activo and rol = 'admin' limit 1`))
    .rows[0]?.user_id;
  const producto = (await db.query<{ id: string }>(`select id from recetas where tipo = 'producto' and nombre = 'Iced Latte'`))
    .rows[0]?.id;
  await db.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await db.query('set local role authenticated');
  const huella = (
    await db.query(`select md5(string_agg(t::text, '|' order by producto_id, tamano_id, canal_id)) as h, count(*)::int as n
      from v_resumen t`)
  ).rows[0];
  const medir = async (sql: string, p?: unknown[]) => {
    const ms: number[] = [];
    for (let i = 0; i < 3; i++)
      ms.push(
        (await db.query<{ 'QUERY PLAN': { 'Execution Time': number }[] }>(`explain (analyze, format json) ${sql}`, p)).rows[0][
          'QUERY PLAN'
        ][0]['Execution Time'],
      );
    return ms.sort((x, y) => x - y)[1];
  };
  const r = {
    huella,
    medianaMs: {
      v_resumen: await medir('select * from v_resumen'),
      v_resumen_producto: await medir('select * from v_resumen where producto_id = $1', [producto]),
      v_alerta: await medir('select * from v_alerta_producto_canal'),
    },
  };
  await db.query('reset role');
  return r;
}

export async function fase4(
  db: Conexion,
  modo: Modo,
  a: Awaited<ReturnType<typeof archivosFase4>>,
  medir?: (db: Conexion) => Promise<unknown>,
) {
  const registrada = async () =>
    (await db.query(`select 1 from supabase_migrations.schema_migrations where version = $1`, [VERSION])).rows
      .length === 1;
  const revertir = modo === 'revertir';
  const despues = esperadoDespues(a.antes, a.politicasDespues);
  const [partida, meta] = revertir ? [despues, a.antes] : [a.antes, despues];
  const informe: Record<string, unknown> = { modo };
  let fin: 'commit' | 'rollback' = 'rollback';
  await db.query('begin');
  try {
    await db.query("set local lock_timeout = '3s'");
    await db.query("set local statement_timeout = '30s'");
    const d0 = diferencias(await capturar(db), partida);
    informe.diferenciasDePartida = d0;
    informe.registradaAntes = await registrada();
    if (d0.politicas || d0.funciones)
      throw new Error('El estado actual no es el esperado de partida (¿cambios desde la aprobación?). No se aplica nada.');
    if (informe.registradaAntes !== revertir)
      throw new Error(`La migración ${VERSION} ${revertir ? 'no está' : 'ya está'} registrada. No se aplica nada.`);

    const t0 = Date.now();
    // La reversión incluye la baja del registro en el mismo texto (rollback-021.sql), igual que en el SQL Editor.
    await db.ejecutar(revertir ? a.reversion : a.migracion);
    if (!revertir)
      await db.query(`insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)`, [
        VERSION,
        NOMBRE,
        [a.migracion],
      ]);
    informe.msCambio = Date.now() - t0;

    const d1 = diferencias(await capturar(db), meta);
    informe.diferenciasConMeta = d1;
    informe.registradaDespues = await registrada();
    if (d1.politicas || d1.funciones) throw new Error('El resultado no coincide con el estado esperado. ROLLBACK.');
    if (informe.registradaDespues === revertir) throw new Error('El registro de la versión no quedó como se esperaba. ROLLBACK.');
    if (medir) informe.medicion = await medir(db);
    if (modo !== 'ensayo') fin = 'commit';
  } catch (e) {
    informe.error = e instanceof Error ? e.message : String(e);
  } finally {
    await db.query(fin);
    informe.transaccion = fin;
  }
  return informe;
}
