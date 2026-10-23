import { writeFile } from 'node:fs/promises';
import { conLectura } from './db-lectura';

/**
 * Fase 2 · Inventario de Costeo (productos, tamaños, precios, canales) + pg_stat_statements y EXPLAIN sin ANALYZE.
 * Solo columnas necesarias; nada de perfiles. Salida JSON.
 *   npx tsx scripts/conciliacion/inventario-costeo.ts <salida.json>
 */
const salida = process.argv[2];
if (!salida) throw new Error('Uso: inventario-costeo.ts <salida.json>');

const { resultado } = await conLectura(async (q) => {
  const filas = async (sql: string, p?: unknown[]) => (await q(sql, p)).rows;
  const r: Record<string, unknown> = {};
  r.productos = await filas(`
    select r.id, r.nombre, r.tipo, r.activo, c.nombre as categoria,
           r.nombre <> btrim(r.nombre) as espacios_borde, r.nombre ~ '\\s{2,}' as espacios_dobles,
           r.nombre ~ '[^\\x20-\\x7E\\u00A0-\\u00FF]' as caracteres_raros
    from recetas r left join categorias_producto c on c.id = r.categoria_id order by r.nombre`);
  r.tamanosProducto = await filas(`
    select pt.producto_id, t.nombre as tamano, pt.precio_lista from producto_tamanos pt join tamanos t on t.id = pt.tamano_id
    order by pt.producto_id, t.orden`);
  r.preciosManuales = await filas(`
    select pm.producto_id, t.nombre as tamano, c.nombre as canal, pm.precio, pm.nota is not null as con_nota
    from precio_canal_manual pm join tamanos t on t.id = pm.tamano_id join canales c on c.id = pm.canal_id`);
  r.resumen = await filas(`
    select producto_id, tamano, canal, precio_canal, costo from v_resumen order by producto, tamano, canal`).catch(
    async () => filas(`select * from v_resumen limit 0`));
  r.insumosConteo = await filas(`select unidad, activo, count(*)::int n from insumos group by 1, 2 order by 1, 2`);

  r.statStatements = await filas(`
    select left(regexp_replace(query, '\\s+', ' ', 'g'), 220) as consulta, calls::bigint as llamadas,
           round(mean_exec_time::numeric, 2) as media_ms, round(max_exec_time::numeric, 1) as max_ms,
           round(total_exec_time::numeric, 0) as total_ms, rows::bigint as filas
    from pg_stat_statements s join pg_roles r on r.oid = s.userid
    where r.rolname in ('authenticated', 'anon', 'authenticator')
      and query ~* '(v_resumen|v_alerta|v_costo|recetas|insumos|producto_tamanos|receta_lineas|linea_cantidades|precio_canal_manual|bitacora|perfil|crm_)'
    order by total_exec_time desc limit 25`).catch((e) => [{ error: String(e.message) }]);
  r.statsReset = await filas(`select stats_reset from pg_stat_statements_info`).catch(() => []);

  const plan = async (sql: string) =>
    (await q(`explain (format json, costs true) ${sql}`)).rows[0]['QUERY PLAN'][0].Plan as Record<string, unknown>;
  const resumenPlan = (p: Record<string, unknown>) => ({ nodo: p['Node Type'], costo_total: p['Total Cost'], filas: p['Plan Rows'] });
  r.explain = {
    v_resumen_completo: resumenPlan(await plan('select * from v_resumen')),
    v_resumen_un_producto: resumenPlan(
      await plan(`select * from v_resumen where producto_id = (select id from recetas where tipo = 'producto' limit 1)`),
    ),
    v_alerta_completo: resumenPlan(await plan('select * from v_alerta_producto_canal')),
    v_costo_producto: resumenPlan(await plan('select * from v_costo_producto')),
  };
  return r;
});

await writeFile(salida, JSON.stringify(resultado, null, 1));
console.log(`OK → ${salida}`);
