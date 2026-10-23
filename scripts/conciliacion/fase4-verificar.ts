import { writeFile } from 'node:fs/promises';
import { conLectura } from './db-lectura';

/**
 * Fase 4 · Verificación de SOLO LECTURA de la migración 21 en el proyecto real (antes o después de aplicarla).
 * Vuelca migraciones registradas, políticas, configuración/privilegios de funciones y mide v_resumen/v_alerta
 * bajo RLS (EXPLAIN ANALYZE de SELECT, transacción READ ONLY). No escribe nada.
 *   npx tsx scripts/conciliacion/fase4-verificar.ts <salida.json>
 */
const salida = process.argv[2];
if (!salida) throw new Error('Uso: fase4-verificar.ts <salida.json>');

const { resultado } = await conLectura(async (q) => {
  const filas = async (sql: string, p?: unknown[]) => (await q(sql, p)).rows;
  const migraciones = await filas(`select version, name from supabase_migrations.schema_migrations order by version`);
  const politicas = await filas(`select tablename, policyname, permissive, roles::text, cmd, qual, with_check
    from pg_policies where schemaname in ('public', 'storage') order by 1, 2`);
  const funciones = await filas(`select p.proname, p.proconfig, has_function_privilege('anon', p.oid, 'execute') as anon,
    has_function_privilege('authenticated', p.oid, 'execute') as auth
    from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`);
  const conteos = (await filas(`select (select count(*) from v_resumen)::int as v_resumen,
    (select count(*) from v_alerta_producto_canal)::int as v_alerta, (select count(*) from recetas)::int as recetas`))[0];

  const medir = async (sql: string, p?: unknown[]) => {
    const plan = (await q(`explain (analyze, buffers, format json) ${sql}`, p)).rows[0]['QUERY PLAN'][0];
    return { ms: plan['Execution Time'], filas: plan.Plan['Actual Rows'],
      buffers: (plan.Plan['Shared Hit Blocks'] ?? 0) + (plan.Plan['Shared Read Blocks'] ?? 0) };
  };
  // Huella del resultado bajo RLS para comprobar «mismo resultado fila a fila» antes y después.
  const uid = (await q(`select user_id from perfiles where activo and rol = 'admin' limit 1`)).rows[0]?.user_id;
  const producto = (await q(`select id from recetas where tipo = 'producto' and nombre = 'Iced Latte'`)).rows[0]?.id;
  await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await q('set local role authenticated');
  const huella = (await filas(`select md5(string_agg(t::text, '|' order by producto_id, tamano_id, canal_id)) as h,
    count(*)::int as n from v_resumen t`))[0];
  const medicion: Record<string, unknown[]> = { v_resumen: [], v_resumen_producto: [], v_alerta: [] };
  for (let i = 0; i < 3; i++) {
    medicion.v_resumen.push(await medir('select * from v_resumen'));
    medicion.v_resumen_producto.push(await medir('select * from v_resumen where producto_id = $1', [producto]));
    medicion.v_alerta.push(await medir('select * from v_alerta_producto_canal'));
  }
  await q('reset role');
  return { migraciones, politicas, funciones, conteos, huellaRls: huella, medicion };
});
await writeFile(salida, JSON.stringify(resultado, null, 1));
const r = resultado as { migraciones: { version: string }[]; politicas: unknown[]; medicion: Record<string, { ms: number }[]> };
console.log(JSON.stringify({ ultimaMigracion: r.migraciones.at(-1), politicas: r.politicas.length,
  medianaMs: Object.fromEntries(Object.entries(r.medicion).map(([k, v]) => [k, v.map((x) => x.ms).sort((a, b) => a - b)[1]])) }));
