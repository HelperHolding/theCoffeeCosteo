import { readFile } from 'node:fs/promises';
import { cerrarTransaccion, unirErrores } from './cierre';
import { capturar, diferencias, firma, type Conexion, type Estado } from './fase4';

/**
 * Migración 22 (producto_codigo_pos) · Lógica independiente de la conexión: la usa el CLI con pg y las pruebas con
 * PGlite. Todo en UNA transacción:
 *  1. partida: la última versión registrada es la 21, la 22 no está y no existen ni la tabla ni su función;
 *  2. captura en vivo políticas, funciones (cuerpo, configuración, dueño, ACL), ACL y RLS de cada tabla de `public`
 *     — no se usan conteos ni capturas de otra fecha —;
 *  3. aplica la migración y registra la versión (o ejecuta rollback-022.sql, que también quita el registro);
 *  4. exige que todo lo previo quede idéntico y que lo nuevo sea exactamente lo esperado (7 políticas, función sin
 *     EXECUTE para anon/authenticated, tabla vacía con RLS, authenticated con SELECT/INSERT/UPDATE/DELETE y anon sin
 *     privilegios);
 *  5. COMMIT solo en aplicar/revertir; el ensayo y cualquier fallo terminan en ROLLBACK.
 *  6. el cierre se verifica (cierre.ts): si COMMIT o ROLLBACK fallan, se informa `fallida` con el error.
 */
export type Modo22 = 'ensayo' | 'aplicar' | 'revertir';
export const VERSION_22 = '20261024000022';
export const NOMBRE_22 = 'producto_codigo_pos';
export const ULTIMA_PREVIA = '20261023000021';
const TABLA = 'producto_codigo_pos';
const FUNCION = 'validar_producto_codigo_pos()';
export const POLITICAS_22 = [
  'alta:INSERT:PERMISSIVE',
  'baja:DELETE:PERMISSIVE',
  'cambio:UPDATE:PERMISSIVE',
  'lectura:SELECT:PERMISSIVE',
  'oauth_sin_altas:INSERT:RESTRICTIVE',
  'oauth_sin_bajas:DELETE:RESTRICTIVE',
  'oauth_sin_cambios:UPDATE:RESTRICTIVE',
];
/**
 * md5 de la definición completa de las 7 políticas (nombre, comando, tipo, roles, using, with check) tal como las
 * deja la migración en PG 17. Detecta cualquier deriva; el mismo valor está en rollback-022.sql.
 */
export const HUELLA_POLITICAS_22 = '9c551a9824fefa77bab72b4eea28df1b';
const HUELLA_SQL = `md5(string_agg(concat_ws('|', policyname, cmd, permissive, roles::text, coalesce(qual, ''),
  coalesce(with_check, '')), E'\\n' order by policyname))`;
const COLUMNAS_22 = 'carga_id,codigo,creado_en,creado_por,evidencia,id,nombre_observado,receta_id';

interface Tabla {
  tabla: string;
  rls: boolean;
  forzada: boolean;
  acl: string[] | null;
}
export interface Esquema extends Estado {
  tablas: Tabla[];
}
interface Politica {
  tablename: string;
  policyname: string;
  permissive: string;
  roles: string;
  cmd: string;
}

export async function archivos22(raiz = '.') {
  const leer = (r: string) => readFile(`${raiz}/${r}`, 'utf8');
  return {
    migracion: await leer(`supabase/migrations/${VERSION_22}_${NOMBRE_22}.sql`),
    // El archivo de reversión trae su propio begin/commit para el SQL Editor; aquí va dentro de nuestra transacción.
    reversion: (await leer('docs/conciliacion-brasil/rollback-022.sql'))
      .split(/\r?\n/)
      .filter((l) => !/^\s*(begin|commit);\s*$/i.test(l))
      .join('\n'),
  };
}

export async function capturarEsquema(db: Pick<Conexion, 'query'>): Promise<Esquema> {
  const tablas = (
    await db.query<Tabla>(`select c.relname as tabla, c.relrowsecurity as rls, c.relforcerowsecurity as forzada,
        (select array_agg(x order by x) from unnest(c.relacl::text[]) x) as acl
      from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm')
      order by 1`)
  ).rows;
  return { ...(await capturar(db)), tablas };
}

/** El esquema sin los objetos de la 22: lo que debe coincidir exactamente con el estado sin la migración. */
export function sinMigracion22(e: Esquema): Esquema {
  return {
    politicas: e.politicas.filter((p) => (p as Politica).tablename !== TABLA),
    funciones: e.funciones.filter((f) => firma(f) !== FUNCION),
    tablas: e.tablas.filter((t) => t.tabla !== TABLA),
  };
}

function diferenciasEsquema(real: Esquema, meta: Esquema) {
  const d = diferencias(real, meta);
  const mr = new Map(real.tablas.map((t) => [t.tabla, JSON.stringify(t)]));
  const mm = new Map(meta.tablas.map((t) => [t.tabla, JSON.stringify(t)]));
  const tablas = [...new Set([...mr.keys(), ...mm.keys()])].filter((k) => mr.get(k) !== mm.get(k)).sort();
  return {
    ...d,
    tablas: tablas.length,
    detalle: [...d.detalle, ...tablas.map((t) => `tabla ${t}`)].slice(0, 20),
  };
}

/** Problemas de los objetos nuevos de la 22 (vacío = exactamente lo esperado). */
export async function revisarObjetos22(db: Pick<Conexion, 'query'>, e: Esquema): Promise<string[]> {
  const p: string[] = [];
  const politicas = e.politicas
    .map((x) => x as Politica)
    .filter((x) => x.tablename === TABLA)
    .map((x) => `${x.policyname}:${x.cmd}:${x.permissive}`)
    .sort();
  if (JSON.stringify(politicas) !== JSON.stringify(POLITICAS_22))
    p.push(`políticas inesperadas: ${politicas.join(', ')}`);
  if (
    e.politicas.some(
      (x) => (x as Politica).tablename === TABLA && (x as Politica).roles !== '{authenticated}',
    )
  )
    p.push('alguna política no es solo para authenticated');
  const huella = (
    await db.query<{ h: string | null }>(
      `select ${HUELLA_SQL} as h from pg_policies where schemaname = 'public' and tablename = '${TABLA}'`,
    )
  ).rows[0].h;
  if (huella !== HUELLA_POLITICAS_22) p.push(`la definición de las políticas cambió (huella ${huella})`);
  const f = e.funciones.find((x) => firma(x) === FUNCION);
  if (!f) p.push('falta la función validar_producto_codigo_pos');
  else {
    if (f.security_definer) p.push('la función no debe ser SECURITY DEFINER');
    if (JSON.stringify(f.config) !== JSON.stringify(['search_path=public, pg_temp']))
      p.push(`search_path inesperado: ${f.config}`);
    if (f.anon || f.authenticated) p.push('anon o authenticated pueden ejecutar la función del trigger');
  }
  const t = e.tablas.find((x) => x.tabla === TABLA);
  if (!t?.rls) p.push('la tabla no tiene RLS');
  const priv = (
    await db.query<{ rol: string; privilegios: string }>(
      `select r as rol, coalesce(string_agg(x, ',' order by x) filter (where has_table_privilege(r, 'public.${TABLA}', x)), '') as privilegios
         from unnest(array['anon', 'authenticated']) r,
              unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) x
        group by r order by r`,
    )
  ).rows;
  const esperado = [
    { rol: 'anon', privilegios: '' },
    { rol: 'authenticated', privilegios: 'DELETE,INSERT,SELECT,UPDATE' },
  ];
  if (JSON.stringify(priv) !== JSON.stringify(esperado))
    p.push(`privilegios inesperados: ${JSON.stringify(priv)}`);
  const columnas = (
    await db.query<{ c: string }>(
      `select string_agg(column_name, ',' order by column_name) as c from information_schema.columns
        where table_schema = 'public' and table_name = '${TABLA}'`,
    )
  ).rows[0].c;
  if (columnas !== COLUMNAS_22) p.push(`columnas inesperadas: ${columnas}`);
  const filas = Number(
    (await db.query<{ n: string }>(`select count(*) as n from public.${TABLA}`)).rows[0].n,
  );
  if (filas !== 0) p.push(`la tabla tiene ${filas} filas`);
  const triggers = (
    await db.query<{ t: string }>(
      `select string_agg(tgname, ',' order by tgname) as t from pg_trigger
        where tgrelid = 'public.${TABLA}'::regclass and not tgisinternal`,
    )
  ).rows[0].t;
  if (triggers !== 'producto_codigo_pos_bitacora,producto_codigo_pos_validar')
    p.push(`triggers inesperados: ${triggers}`);
  return p;
}

export async function migracion22(db: Conexion, modo: Modo22, a: Awaited<ReturnType<typeof archivos22>>) {
  const revertir = modo === 'revertir';
  const informe: Record<string, unknown> = { modo };
  let fin: 'commit' | 'rollback' = 'rollback';
  const registro = async () =>
    (
      await db.query<{ version: string }>(
        `select version from supabase_migrations.schema_migrations order by version desc limit 2`,
      )
    ).rows.map((r) => r.version);
  await db.query('begin');
  try {
    await db.query(
      `select set_config('lock_timeout', '3s', true), set_config('statement_timeout', '30s', true)`,
    );
    const ultimas = await registro();
    informe.registroAntes = ultimas;
    const existe = async () =>
      (await db.query<{ e: boolean }>(`select to_regclass('public.${TABLA}') is not null as e`)).rows[0].e;
    if (revertir) {
      if (ultimas[0] !== VERSION_22 || ultimas[1] !== ULTIMA_PREVIA)
        throw new Error(
          `Para revertir, las últimas versiones deben ser ${VERSION_22} y ${ULTIMA_PREVIA}. No se toca nada.`,
        );
    } else if (ultimas[0] !== ULTIMA_PREVIA || (await existe())) {
      throw new Error(
        `La última versión registrada debe ser ${ULTIMA_PREVIA}, sin la tabla ${TABLA}. No se aplica nada.`,
      );
    }
    const antes = await capturarEsquema(db);
    if (revertir) {
      const p = await revisarObjetos22(db, antes);
      informe.objetosAntes = p;
      if (p.length)
        throw new Error('Los objetos de la 22 no están como los dejó la migración. No se revierte.');
    }

    const t0 = Date.now();
    await db.ejecutar(revertir ? a.reversion : a.migracion);
    if (!revertir)
      await db.query(
        `insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)`,
        [VERSION_22, NOMBRE_22, [a.migracion]],
      );
    informe.msCambio = Date.now() - t0;

    const despues = await capturarEsquema(db);
    const d = revertir
      ? diferenciasEsquema(despues, sinMigracion22(antes))
      : diferenciasEsquema(sinMigracion22(despues), antes);
    informe.diferenciasEnLoPrevio = d;
    if (d.politicas || d.funciones || d.tablas)
      throw new Error('Cambió algo fuera de la migración 22. ROLLBACK.');
    informe.politicasTotales = { antes: antes.politicas.length, despues: despues.politicas.length };
    if (!revertir) {
      const p = await revisarObjetos22(db, despues);
      informe.objetosNuevos = p.length ? p : 'exactamente los esperados';
      if (p.length) throw new Error('Los objetos nuevos no son los esperados. ROLLBACK.');
    } else if (await existe()) throw new Error('La tabla sigue existiendo. ROLLBACK.');
    informe.registroDespues = await registro();
    const esperado = revertir ? ULTIMA_PREVIA : VERSION_22;
    if ((informe.registroDespues as string[])[0] !== esperado)
      throw new Error('El registro no quedó como se esperaba. ROLLBACK.');
    if (modo !== 'ensayo') fin = 'commit';
  } catch (e) {
    informe.error = e instanceof Error ? e.message : String(e);
    fin = 'rollback';
  }
  const cierre = await cerrarTransaccion(db, fin);
  informe.transaccion = cierre.transaccion;
  const error = unirErrores(informe.error as string | undefined, cierre.error);
  if (error) informe.error = error;
  return informe;
}
