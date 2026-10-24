import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leerEnvLocal } from '../zoho/cliente';
import { configDe } from '../../lib/sucursales/config';
import { dependenciasReales, leerCatalogo, leerPedidos, type Dependencias } from '../../lib/sucursales/proveedor';
import { normalizar } from '../../lib/sucursales/normalizar';
import { semanasCerradas } from '../../lib/sucursales/metricas';
import { enZona } from '../../lib/sucursales/tiempo';

/**
 * Fase 2 · Extracción GET acotada: N semanas cerradas (lunes–domingo, fecha local de cada tienda) con el
 * adaptador del portal (paginación, dedup, límites). Respuestas crudas FUERA del repo; en consola solo agregados.
 * Tope duro de llamadas HTTP contado en el fetch.
 *   npx tsx scripts/conciliacion/extraer-brasil.ts 612 583 532 [--semanas 4] [--tope 40]
 */
const args = process.argv.slice(2);
const opt = (k: string, d: number) => (args.includes(k) ? Number(args[args.indexOf(k) + 1]) : d);
const semanas = opt('--semanas', 4);
const tope = opt('--tope', 40);
const ids = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')).map(Number);
const DIR = join(tmpdir(), 'thecoffee-sucursales-api', 'fase2');
await mkdir(DIR, { recursive: true });

const token = (await leerEnvLocal()).get('THECOFFEE_API_TOKEN');
if (!token) throw new Error('Falta THECOFFEE_API_TOKEN en .env.local');
process.env.THECOFFEE_API_TOKEN = token;

let llamadas = 0;
const deps: Dependencias = {
  ...dependenciasReales,
  fetch: (...a) => {
    if (++llamadas > tope) throw new Error(`Tope de ${tope} llamadas alcanzado; se detiene sin ampliar`);
    return dependenciasReales.fetch(...a);
  },
};

const cat = await leerCatalogo(deps);
if (!cat.ok) throw new Error(`Catálogo: ${cat.error.codigo}`);
const informe: unknown[] = [];
for (const id of ids) {
  const cfg = configDe(id);
  if (!cfg) throw new Error(`company ${id} no configurada`);
  const api = cat.sucursales.find((s) => s.id === id);
  if (api?.lookerStoreId !== cfg.lookerStoreId) throw new Error(`Identidad ${id}: lookerStoreId no coincide`);
  const hoy = enZona(new Date(), cfg.zona).fecha;
  for (const v of semanasCerradas(hoy, semanas)) {
    const t0 = Date.now();
    const antes = llamadas;
    const r = await leerPedidos(id, v.desde, v.hasta, deps);
    const n = normalizar(r.registros, cfg, v);
    await writeFile(join(DIR, `${id}_${v.desde}_${v.hasta}.json`), JSON.stringify(r.registros));
    informe.push({
      companyId: id, hoyLocal: hoy, ...v, completo: r.completo, totalDeclarado: r.totalDeclarado,
      registros: r.registros.length, paginas: r.paginas, llamadas: llamadas - antes, ms: Date.now() - t0,
      errores: r.errores.map((e) => e.codigo), invalidos: n.invalidos, fueraDeVentana: n.fueraDeVentana,
      pedidosValidos: n.pedidos.length,
    });
  }
}
await writeFile(join(DIR, 'informe-extraccion.json'), JSON.stringify({ llamadas, tope, informe }, null, 1));
console.log(JSON.stringify({ llamadasTotales: llamadas, tope, dir: DIR, informe }, null, 1));
