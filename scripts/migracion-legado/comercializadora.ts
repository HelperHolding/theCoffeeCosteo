import { conLegado, enPortal } from './conexion';
import { copiarTabla, forzarSimulacion, reporteCopia, type ResultadoCopia, TABLAS_COM } from './comercializadora-lib';

/**
 * Plan 2 · Copia las tablas com_* de bliocjvq al portal. Simulación por omisión (cuenta, no escribe).
 *   npx tsx scripts/migracion-legado/comercializadora.ts [--aplicar] [--solo-editables]
 * Una transacción en el portal con app.origen = 'migracion'; deja auto.modo en 'simulacion'. Solo imprime conteos.
 */
const aplicar = process.argv.includes('--aplicar');
const tablas = process.argv.includes('--solo-editables') ? TABLAS_COM.filter((t) => t.editable) : TABLAS_COM;

const origen = await conLegado(async (db) => {
  const datos = new Map<string, Record<string, unknown>[]>();
  // to_jsonb: fechas y numéricos llegan como texto/JSON de Postgres, sin pasar por Date de JS (evita corrimientos).
  for (const t of tablas)
    datos.set(
      t.tabla,
      (await db.query<{ f: Record<string, unknown> }>(`select to_jsonb(x) f from public.${t.tabla} x`)).rows.map((r) => r.f),
    );
  return datos;
});

class Simulacion extends Error {}
const resultados: ResultadoCopia[] = [];
let modoForzado = false;
await enPortal(async (db) => {
  for (const t of tablas) {
    const filas = origen.get(t.tabla)!;
    const { nuevas, actualizadas } = await copiarTabla(db, t, filas);
    const destino = Number((await db.query<{ n: string }>(`select count(*) n from public.${t.tabla}`)).rows[0].n);
    resultados.push({ tabla: t.tabla, origen: filas.length, nuevas, actualizadas, destino });
  }
  modoForzado = await forzarSimulacion(db);
  if (!aplicar) throw new Simulacion();
}).catch((e) => {
  if (!(e instanceof Simulacion)) throw e;
});

console.log(reporteCopia(resultados));
console.log(modoForzado ? '\nauto.modo pasó a simulacion en el portal.' : '\nauto.modo ya estaba en simulacion.');
console.log(aplicar ? '\nAplicado.' : '\nSimulación: se revirtió todo. Corre con --aplicar para escribir.');
