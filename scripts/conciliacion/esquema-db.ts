import { writeFile } from 'node:fs/promises';
import { conLectura } from './db-lectura';

/**
 * Fase 2 · Esquema real, conteos y equivalentes SQL de algunos lints de Supabase Advisors.
 * Solo catálogo de Postgres y conteos; ninguna fila de perfiles ni PII. Salida JSON en la ruta dada.
 *   npx tsx scripts/conciliacion/esquema-db.ts <salida.json>
 */
const salida = process.argv[2];
if (!salida) throw new Error('Uso: esquema-db.ts <salida.json>');

const COSTEO = ['parametros', 'canales', 'tamanos', 'proveedores', 'categorias_insumo', 'categorias_producto', 'insumos',
  'recetas', 'producto_tamanos', 'receta_lineas', 'linea_cantidades', 'precio_canal_manual', 'perfiles', 'bitacora',
  'perfil_modulos', 'perfil_sucursales'];

const { region, resultado } = await conLectura(async (q) => {
  const filas = async (sql: string, p?: unknown[]) => (await q(sql, p)).rows;
  const r: Record<string, unknown> = {};

  r.migraciones = await filas(`select version, name from supabase_migrations.schema_migrations order by version`);
  r.tablasPublic = await filas(`
    select c.relname as tabla, c.relkind as tipo, c.relrowsecurity as rls, c.reltuples::bigint as filas_estimadas
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','v','m','p') order by 1`);
  r.columnas = await filas(`
    select table_name as tabla, column_name as col, data_type as tipo, is_nullable as nulo, column_default as defecto,
           is_generated as generada
    from information_schema.columns where table_schema = 'public' and table_name = any($1) order by table_name, ordinal_position`,
    [COSTEO]);
  r.restricciones = await filas(`
    select conrelid::regclass::text as tabla, conname as nombre, contype as tipo, pg_get_constraintdef(oid) as def
    from pg_constraint where connamespace = 'public'::regnamespace and conrelid::regclass::text = any($1) order by 1, 2`,
    [COSTEO]);
  r.indices = await filas(`
    select tablename as tabla, indexname as indice, indexdef as def from pg_indexes
    where schemaname = 'public' and tablename = any($1) order by 1, 2`, [COSTEO]);

  // Conteos exactos solo en tablas de Costeo (pequeñas); perfiles solo se cuentan.
  const conteos: Record<string, number> = {};
  for (const t of COSTEO) conteos[t] = Number((await q(`select count(*)::int as n from public.${t}`)).rows[0].n);
  r.conteos = conteos;
  r.recetasPorTipo = await filas(`select tipo, activo, count(*)::int as n from recetas group by 1, 2 order by 1, 2`);
  r.tamanos = await filas(`select id, nombre, orden from tamanos order by orden`);
  r.canales = await filas(`select id, nombre, regla_precio, comision_pct, comision_confirmada, costo_envase, markup_max_pct, orden from canales order by orden`);
  r.bitacoraPorOrigen = await filas(`select origen, tabla, count(*)::int as n from bitacora group by 1, 2 order by 3 desc limit 30`);

  // Funciones usadas por políticas: volatilidad, SECURITY DEFINER y search_path.
  r.funciones = await filas(`
    select p.proname as funcion, pg_get_function_identity_arguments(p.oid) as args, p.provolatile as volatilidad,
           p.prosecdef as security_definer, p.proconfig as config,
           has_function_privilege('anon', p.oid, 'execute') as anon_ejecuta,
           has_function_privilege('authenticated', p.oid, 'execute') as auth_ejecuta
    from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`);
  r.politicas = await filas(`
    select tablename as tabla, policyname as politica, permissive, roles::text, cmd, qual, with_check
    from pg_policies where schemaname = 'public' order by 1, 2`);

  // Equivalentes SQL de lints (no son el Advisor oficial).
  r.lintFkSinIndice = await filas(`
    select c.conrelid::regclass::text as tabla, c.conname as fk, pg_get_constraintdef(c.oid) as def
    from pg_constraint c
    where c.contype = 'f' and c.connamespace = 'public'::regnamespace
      and not exists (select 1 from pg_index i where i.indrelid = c.conrelid
                      and (i.indkey::int2[])[0:cardinality(c.conkey)-1] @> c.conkey and cardinality(c.conkey) <= i.indnkeyatts)
    order by 1`);
  r.lintRlsInitplan = await filas(`
    select tablename as tabla, policyname as politica, cmd from pg_policies
    where schemaname = 'public'
      and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) ~ '(auth\\.uid\\(\\)|auth\\.jwt\\(\\)|rol_actual\\(\\)|tiene_rol\\(|crm_[a-z_]+\\()'
      and (coalesce(qual,'') || ' ' || coalesce(with_check,'')) !~ '\\(\\s*select\\s'
    order by 1, 2`);
  r.lintPermisivasMultiples = await filas(`
    select tablename as tabla, cmd, r.rol, count(*)::int as n, array_agg(policyname order by policyname) as politicas
    from pg_policies, unnest(roles) as r(rol)
    where schemaname = 'public' and permissive = 'PERMISSIVE'
    group by 1, 2, 3 having count(*) > 1 order by 1, 2`);
  r.lintRlsApagada = await filas(`
    select c.relname as tabla from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity`);
  r.extensiones = await filas(`select extname, extversion from pg_extension order by 1`);
  return r;
});

await writeFile(salida, JSON.stringify({ region, ...resultado }, null, 1));
console.log(`OK → ${salida}`);
