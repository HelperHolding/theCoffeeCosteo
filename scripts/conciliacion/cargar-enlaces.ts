import { readFile } from 'node:fs/promises';
import pg from 'pg';

/**
 * SKU · Carga del lote 1 de códigos POS → recetas (migración 22) desde docs/conciliacion-brasil/15-enlace-codigos.csv.
 * - SOLO bases locales (localhost): la carga en producción no está autorizada (requiere su propia aprobación).
 * - Dry-run por defecto: aplica en una transacción, reporta y hace ROLLBACK. `--aplicar-local` hace COMMIT (local).
 * - Por códigos con estado «lote 1 (verificado)». Antes de escribir comprueba que cada receta exista, sea producto y
 *   conserve el nombre verificado (detección de cambios concurrentes). Idempotente: un código ya ligado a la misma
 *   receta no se toca; ligado a otra receta, aborta todo. Bitácora con origen «carga_masiva».
 *   npx tsx scripts/conciliacion/cargar-enlaces.ts postgres://postgres@localhost:55432/restaurada [--aplicar-local]
 */
const [url, ...args] = process.argv.slice(2);
if (!url || !/@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)) throw new Error('Solo se permite una base local (localhost)');
const aplicar = args.includes('--aplicar-local');

const csv = (await readFile('docs/conciliacion-brasil/15-enlace-codigos.csv', 'utf8')).replace(/^﻿/, '');
const filasCsv = (() => {
  const out: string[][] = [];
  for (const linea of csv.split(/\r?\n/).filter(Boolean)) {
    const celdas: string[] = [];
    let c = '', q = false;
    for (let i = 0; i < linea.length; i++) {
      const ch = linea[i];
      if (q) { if (ch === '"' && linea[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; }
      else if (ch === '"') q = true; else if (ch === ',') { celdas.push(c); c = ''; } else c += ch;
    }
    celdas.push(c);
    out.push(celdas);
  }
  const [cab, ...resto] = out;
  return resto.map((f) => Object.fromEntries(cab.map((k, i) => [k, f[i]])));
})();
const lote = filasCsv.filter((f) => f.estado === 'lote 1 (verificado)');

const c = new pg.Client({ connectionString: url, application_name: 'cargar-enlaces' });
await c.connect();
const informe: Record<string, unknown> = { modo: aplicar ? 'aplicar-local' : 'dry-run', candidatos: lote.length };
let fin: 'commit' | 'rollback' = 'rollback';
try {
  await c.query('begin');
  await c.query("set local app.origen = 'carga_masiva'");
  await c.query("set local lock_timeout = '3s'");
  const recetas = new Map(
    (await c.query<{ id: string; nombre: string; tipo: string }>('select id, nombre, tipo from recetas where id = any($1)', [lote.map((f) => f.receta_id)]))
      .rows.map((r) => [r.id, r]),
  );
  const existentes = new Map(
    (await c.query<{ codigo: string; receta_id: string }>('select codigo, receta_id from producto_codigo_pos')).rows.map((r) => [r.codigo, r.receta_id]),
  );
  const problemas: string[] = [];
  let insertados = 0, sinCambio = 0;
  for (const f of lote) {
    const r = recetas.get(f.receta_id);
    if (!r) { problemas.push(`${f.codigo}: la receta ${f.receta_id} ya no existe`); continue; }
    if (r.tipo !== 'producto') { problemas.push(`${f.codigo}: la receta no es producto`); continue; }
    if (r.nombre !== f.receta_nombre) { problemas.push(`${f.codigo}: la receta cambió de nombre («${f.receta_nombre}» → «${r.nombre}»)`); continue; }
    const ya = existentes.get(f.codigo);
    if (ya === f.receta_id) { sinCambio++; continue; }
    if (ya) { problemas.push(`${f.codigo}: ya está ligado a otra receta (${ya})`); continue; }
    await c.query(
      `insert into producto_codigo_pos (codigo, receta_id, nombre_observado, evidencia) values ($1, $2, $3, $4)`,
      [f.codigo, f.receta_id, f.nombre, `API pedidos 2026-09-21..2026-10-18 · ${f.lineas} líneas · ${f.contexto} · tamaño ${f.tamano_check} · precio 532: ${f.precio_532}`],
    );
    insertados++;
  }
  informe.insertados = insertados;
  informe.sinCambio = sinCambio;
  informe.problemas = problemas;
  informe.totalEnTabla = Number((await c.query('select count(*)::int n from producto_codigo_pos')).rows[0].n);
  informe.bitacoraCargaMasiva = Number(
    (await c.query(`select count(*)::int n from bitacora where tabla = 'producto_codigo_pos' and origen = 'carga_masiva'`)).rows[0].n,
  );
  if (problemas.length) throw new Error(`${problemas.length} problema(s): no se carga nada`);
  if (aplicar) fin = 'commit';
} catch (e) {
  informe.error = e instanceof Error ? e.message : String(e);
} finally {
  await c.query(fin);
  await c.end();
  informe.transaccion = fin;
}
console.log(JSON.stringify(informe, null, 1));
