import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { conLegado, conPortalLectura } from './conexion';
import { leerLado, leerVentasViejas, planOv } from './paridad-comercializadora-datos';
import {
  DIAS_REQUERIDOS,
  evaluarDia,
  type Explicada,
  racha,
  reporteParidad,
  type ResultadoDia,
} from './paridad-comercializadora-lib';

/**
 * Plan 4 · Paridad diaria de Comercializadora (spec, Cutover paso 2). Solo lee los dos lados.
 *   npx tsx scripts/migracion-legado/paridad-comercializadora.ts [--fecha=AAAA-MM-DD] [--guardar]
 * Imprime el reporte. Con --guardar escribe docs/migracion/paridad/<fecha>.json, que cuenta para la racha de 3 días.
 * Las diferencias aceptadas van en docs/migracion/paridad/explicadas.json ({ clave, motivo }).
 */
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const fecha = arg('fecha') ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('--fecha debe ser AAAA-MM-DD');
const CARPETA = join(process.cwd(), 'docs/migracion/paridad');

const [viejo, ventas] = await conLegado(async (db) => [await leerLado(db, fecha, 'real'), await leerVentasViejas(db)] as const);
const [portal, acciones] = await conPortalLectura(
  async (db) => [await leerLado(db, fecha, 'simulacion'), await planOv(db, ventas)] as const,
);
const explicadas = JSON.parse(readFileSync(join(CARPETA, 'explicadas.json'), 'utf8')) as Explicada[];
const resultado = evaluarDia(fecha, viejo, portal, acciones, explicadas);
const previos = readdirSync(CARPETA)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f !== `${fecha}.json`)
  .map((f) => JSON.parse(readFileSync(join(CARPETA, f), 'utf8')) as ResultadoDia);
const dias = racha([...previos, resultado], fecha);

console.log(reporteParidad(resultado, dias));
if (process.argv.includes('--guardar')) {
  writeFileSync(join(CARPETA, `${fecha}.json`), `${JSON.stringify(resultado, null, 2)}\n`);
  console.log(`\nGuardado en docs/migracion/paridad/${fecha}.json.`);
} else console.log('\nNo se guardó: agrega --guardar para que cuente en la racha.');
if (dias >= DIAS_REQUERIDOS) console.log(`\nListo para el cutover: ${dias} días seguidos sin diferencias.`);
