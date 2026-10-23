import { conLectura } from './db-lectura';

/**
 * Fase 2 · Una sola medición de lectura (EXPLAIN ANALYZE de SELECT, transacción READ ONLY) de v_resumen:
 * completo frente a un producto. Rol privilegiado: NO mide el costo de RLS del usuario final.
 */
const { resultado } = await conLectura(async (q) => {
  const id = (await q(`select id from recetas where tipo = 'producto' and nombre = 'Iced Latte'`)).rows[0]?.id;
  const medir = async (sql: string, p?: unknown[]) => {
    const plan = (await q(`explain (analyze, buffers, format json) ${sql}`, p)).rows[0]['QUERY PLAN'][0];
    return { msEjecucion: plan['Execution Time'], msPlan: plan['Planning Time'], filas: plan.Plan['Actual Rows'], filasEstimadas: plan.Plan['Plan Rows'],
      buffersCompartidos: (plan.Plan['Shared Hit Blocks'] ?? 0) + (plan.Plan['Shared Read Blocks'] ?? 0) };
  };
  const sinRls = {
    completo: await medir('select * from v_resumen'),
    un_producto: await medir('select * from v_resumen where producto_id = $1', [id]),
  };
  // Mismas lecturas bajo RLS, como un usuario activo con rol admin (su id no se imprime).
  const uid = (await q(`select user_id from perfiles where activo and rol = 'admin' limit 1`)).rows[0]?.user_id;
  await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await q('set local role authenticated');
  const conRls = {
    completo: await medir('select * from v_resumen'),
    un_producto: await medir('select * from v_resumen where producto_id = $1', [id]),
    v_alerta: await medir('select * from v_alerta_producto_canal'),
    recetas: await medir('select * from recetas'),
  };
  await q('reset role');
  return {
    sinRls, conRls,
    completo: await medir('select * from v_resumen'),
    completo_pagina2: await medir('select * from v_resumen order by producto_id, tamano_id, canal_id offset 500 limit 500'),
    un_producto: await medir('select * from v_resumen where producto_id = $1', [id]),
    v_alerta: await medir('select * from v_alerta_producto_canal'),
  };
});
console.log(JSON.stringify(resultado, null, 1));
