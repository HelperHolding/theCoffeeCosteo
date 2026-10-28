import { readFile } from 'node:fs/promises';
import { cerrarTransaccion, unirErrores } from '../conciliacion/cierre';
import type { Conexion } from '../conciliacion/fase4';
import { capturarEsquema, type Esquema } from '../conciliacion/migracion-22';

/**
 * Migración 23 (Analytics) · misma disciplina que la 22, en UNA transacción:
 *  1. partida: la última versión registrada es la 22 y no existe ningún objeto analytics_*;
 *  2. captura políticas, funciones y tablas/vistas de `public` en vivo;
 *  3. aplica y registra la versión (o ejecuta rollback-023.sql, que también quita el registro);
 *  4. exige que todo lo previo quede idéntico y que lo nuevo sea exactamente lo esperado;
 *  5. COMMIT solo en aplicar/revertir; el ensayo y cualquier fallo terminan en ROLLBACK.
 */
export type Modo23 = 'ensayo' | 'aplicar' | 'revertir';
export const VERSION_23 = '20261027000023';
export const NOMBRE_23 = 'analytics_ventas_diarias';
export const ULTIMA_PREVIA_23 = '20261024000022';
const TABLAS = ['analytics_lecturas', 'analytics_tiendas', 'analytics_ventas_diarias'];
const OBJETOS = [...TABLAS, 'analytics_ventas_kpi'];
const FUNCION = 'analytics_guardar_lectura';
export const POLITICAS_23 = TABLAS.flatMap((t) => [
  `${t}.analytics_sin_oauth:ALL:RESTRICTIVE`,
  `${t}.lectura_admin:SELECT:PERMISSIVE`,
]).sort();

export async function archivos23(raiz = '.') {
  const leer = (r: string) => readFile(`${raiz}/${r}`, 'utf8');
  return {
    migracion: await leer(`supabase/migrations/${VERSION_23}_${NOMBRE_23}.sql`),
    reversion: (await leer('docs/analytics-zoho/rollback-023.sql'))
      .split(/\r?\n/)
      .filter((l) => !/^\s*(begin|commit);\s*$/i.test(l))
      .join('\n'),
  };
}

type Politica = { tablename: string; policyname: string; permissive: string; cmd: string; roles: string };
const sin23 = (e: Esquema): Esquema => ({
  politicas: e.politicas.filter((p) => !OBJETOS.includes((p as Politica).tablename)),
  funciones: e.funciones.filter((f) => f.nombre !== FUNCION),
  tablas: e.tablas.filter((t) => !OBJETOS.includes(t.tabla)),
});
const igual = (a: Esquema, b: Esquema) => JSON.stringify(a) === JSON.stringify(b);

/** Problemas de los objetos nuevos (vacío = exactamente lo esperado). */
export async function revisarObjetos23(db: Pick<Conexion, 'query'>, e: Esquema): Promise<string[]> {
  const p: string[] = [];
  const pol = e.politicas
    .map((x) => x as Politica)
    .filter((x) => OBJETOS.includes(x.tablename))
    .map((x) => `${x.tablename}.${x.policyname}:${x.cmd}:${x.permissive}`)
    .sort();
  if (JSON.stringify(pol) !== JSON.stringify(POLITICAS_23))
    p.push(`políticas inesperadas: ${pol.join(', ')}`);
  const fs = e.funciones.filter((f) => f.nombre === FUNCION);
  if (fs.length !== 1) p.push(`se esperaba 1 función ${FUNCION}, hay ${fs.length}`);
  for (const f of fs) {
    if (f.security_definer) p.push('la función no debe ser SECURITY DEFINER');
    if (JSON.stringify(f.config) !== JSON.stringify(['search_path=""']))
      p.push(`search_path inesperado: ${f.config}`);
    if (f.anon || f.authenticated) p.push('anon o authenticated pueden ejecutar la función de carga');
  }
  for (const t of TABLAS) if (!e.tablas.find((x) => x.tabla === t)?.rls) p.push(`${t} sin RLS`);
  const vista = (
    await db.query<{ o: string[] | null }>(
      `select reloptions o from pg_class where oid = to_regclass('public.analytics_ventas_kpi')`,
    )
  ).rows[0];
  if (!vista?.o?.includes('security_invoker=true')) p.push('la vista no es security_invoker');
  const priv = (
    await db.query<{ objeto: string; rol: string; privilegios: string }>(
      `select o objeto, r rol, coalesce(string_agg(x, ',' order by x) filter (where has_table_privilege(r, 'public.' || o, x)), '') privilegios
         from unnest($1::text[]) o, unnest(array['anon', 'authenticated']) r,
              unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) x
        group by o, r order by o, r`,
      [OBJETOS],
    )
  ).rows;
  for (const r of priv) {
    const esperado = r.rol === 'anon' ? '' : 'SELECT';
    if (r.privilegios !== esperado)
      p.push(`${r.objeto}/${r.rol}: ${r.privilegios || '(nada)'} ≠ ${esperado || '(nada)'}`);
  }
  for (const t of TABLAS) {
    const n = Number((await db.query<{ n: string }>(`select count(*) n from public.${t}`)).rows[0].n);
    if (n) p.push(`${t} tiene ${n} filas`);
  }
  return p;
}

export async function migracion23(db: Conexion, modo: Modo23, a: Awaited<ReturnType<typeof archivos23>>) {
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
    const existentes = (
      await db.query<{ o: string }>(
        `select o from unnest($1::text[]) o where to_regclass('public.' || o) is not null`,
        [OBJETOS],
      )
    ).rows.map((r) => r.o);
    if (revertir) {
      if (ultimas[0] !== VERSION_23 || ultimas[1] !== ULTIMA_PREVIA_23)
        throw new Error(
          `Para revertir, las últimas versiones deben ser ${VERSION_23} y ${ULTIMA_PREVIA_23}. No se toca nada.`,
        );
    } else if (ultimas[0] !== ULTIMA_PREVIA_23 || existentes.length)
      throw new Error(
        `La última versión debe ser ${ULTIMA_PREVIA_23}, sin objetos analytics_*. No se aplica nada.`,
      );
    const antes = await capturarEsquema(db);
    if (revertir) {
      const p = (await revisarObjetos23(db, antes)).filter((x) => !/ tiene \d+ filas$/.test(x));
      informe.objetosAntes = p;
      if (p.length)
        throw new Error('Los objetos de la 23 no están como los dejó la migración. No se revierte.');
    }
    await db.ejecutar(revertir ? a.reversion : a.migracion);
    if (!revertir)
      await db.query(
        `insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)`,
        [VERSION_23, NOMBRE_23, [a.migracion]],
      );
    const despues = await capturarEsquema(db);
    const previoIntacto = revertir ? igual(despues, sin23(antes)) : igual(sin23(despues), antes);
    informe.previoIntacto = previoIntacto;
    if (!previoIntacto) throw new Error('Cambió algo fuera de la migración 23. ROLLBACK.');
    informe.politicasTotales = { antes: antes.politicas.length, despues: despues.politicas.length };
    if (!revertir) {
      const p = await revisarObjetos23(db, despues);
      informe.objetosNuevos = p.length ? p : 'exactamente los esperados';
      if (p.length) throw new Error('Los objetos nuevos no son los esperados. ROLLBACK.');
    }
    informe.registroDespues = await registro();
    if ((informe.registroDespues as string[])[0] !== (revertir ? ULTIMA_PREVIA_23 : VERSION_23))
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
