import { createClient } from '@supabase/supabase-js';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import * as XLSX from 'xlsx';
import { leerEnvLocal } from '../zoho/cliente';
import { armar } from '../../lib/areas/armar';
import { filasArticulos, filasPagos, reporte, type Fila } from '../../lib/areas/archivos';
import { Catalogo, type Articulo } from '../../lib/areas/catalogo';
import { configDe } from '../../lib/sucursales/config';
import { rappiServicio } from '../../lib/sucursales/corte-servidor';
import { conRappi, leerDias } from '../../lib/sucursales/datos';
import { diasEntre } from '../../lib/sucursales/tiempo';

/**
 * Exporta las ventas de Rubén Darío (532) en los JSON de la API de Areas México, con la tienda anónima (COD_TPV TC01).
 * SOLO LECTURA: lee el POS con THECOFFEE_API_TOKEN y Rappi del portal con la base de .env.local; no escribe en la base.
 * Escribe datos/areas/<desde>_<hasta>/ y actualiza datos/areas/articulos.json (el único archivo versionado).
 * Spec: docs/superpowers/specs/2026-11-09-areas-api-ventas-design.md
 *
 *   npx tsx --conditions=react-server scripts/areas/exportar.ts --desde 2026-11-02 --hasta 2026-11-08
 */
const COMPANIA = 532;
const MAX_DIAS = 62;
const CATALOGO = 'datos/areas/articulos.json';

const args = process.argv.slice(2);
const opcion = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const desde = opcion('--desde') ?? '';
const hasta = opcion('--hasta') ?? '';
if (!/^\d{4}-\d{2}-\d{2}$/.test(desde) || !/^\d{4}-\d{2}-\d{2}$/.test(hasta) || desde > hasta)
  throw new Error('Faltan --desde y --hasta (AAAA-MM-DD)');
if (diasEntre(desde, hasta) + 1 > MAX_DIAS) throw new Error(`El rango es de más de ${MAX_DIAS} días`);
const cfg = configDe(COMPANIA);
if (!cfg) throw new Error(`La sucursal ${COMPANIA} no está configurada`);

const env = await leerEnvLocal();
process.env.THECOFFEE_API_TOKEN = env.get('THECOFFEE_API_TOKEN');
const db = createClient(env.get('NEXT_PUBLIC_SUPABASE_URL')!, env.get('SUPABASE_SECRET_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const lectura = await conRappi(await leerDias(cfg, desde, hasta), rappiServicio(db, cfg));
if (lectura.estado === 'error') throw new Error(`No se pudo leer el POS: ${lectura.avisos.join(' ')}`);

const catalogo = new Catalogo(JSON.parse(await readFile(CATALOGO, 'utf8')) as Articulo[]);
const prohibidos = [cfg.nombre, 'Rubén Darío', 'Ruben Dario'];
const e = armar(lectura.pedidos, catalogo, prohibidos);

const dir = `datos/areas/${desde}_${hasta}`;
await mkdir(`${dir}/tickets`, { recursive: true });
await mkdir(`${dir}/arqueos`, { recursive: true });
for (const t of e.tickets)
  await writeFile(`${dir}/tickets/${t.Cabecera.NUM_TIK}.json`, JSON.stringify(t, null, 2) + '\n');
for (const a of e.arqueos) await writeFile(`${dir}/arqueos/${a.Fecha}.json`, JSON.stringify(a, null, 2) + '\n');

const libro = (filas: Fila[]) => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(filas), 'Sheet1');
  return wb;
};
const vendidos = new Set(e.vendidos);
XLSX.writeFile(
  libro(filasArticulos(catalogo.lista().filter((a) => vendidos.has(a.cod_art)))),
  `${dir}/Carga Art TPVs Externos.xlsx`,
);
XLSX.writeFile(libro(filasPagos(new Date().toISOString().slice(0, 10))), `${dir}/Formas de Pago y Monedas.xlsx`);

await writeFile(
  `${dir}/reporte.md`,
  reporte(e, { desde, hasta, estado: lectura.estado, avisos: lectura.avisos, nuevos: catalogo.nuevos() }),
);
await writeFile(CATALOGO, JSON.stringify(catalogo.lista(), null, 2) + '\n');

console.log(
  `${desde}…${hasta}: ${e.tickets.length} tickets, ${e.arqueos.length} arqueos, ${e.descartados.length} descartados, ` +
    `${catalogo.nuevos().length} artículos nuevos; lectura ${lectura.estado}. Salida en ${dir}`,
);
