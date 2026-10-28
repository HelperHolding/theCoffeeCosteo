import { leerEnvLocal } from '../zoho/cliente';
import { configDe } from '../../lib/sucursales/config';
import { LIMITES, dependenciasReales, leerPedidos } from '../../lib/sucursales/proveedor';
import { enZona, sumarDias } from '../../lib/sucursales/tiempo';

/**
 * F2 · Puerta de 62 días (solo GET, solo agregados). Mide una lectura de 62 días de una sucursal:
 * de una vez (topes elevados solo en este proceso) y partida en ventanas diarias con 4 en paralelo.
 *
 *   npx tsx --conditions=react-server scripts/sucursales/medir-62.ts 532 [--dias 62]
 */
const args = process.argv.slice(2);
const i = args.indexOf('--dias');
const dias = i >= 0 ? Number(args[i + 1]) : 62;
const id = Number(args.find((a, j) => !a.startsWith('--') && (i < 0 || j !== i + 1)));
const token = (await leerEnvLocal()).get('THECOFFEE_API_TOKEN');
if (!token) throw new Error('Falta THECOFFEE_API_TOKEN en .env.local');
process.env.THECOFFEE_API_TOKEN = token;
const cfg = configDe(id);
if (!cfg) throw new Error(`company ${id} no está configurada`);

const hasta = enZona(new Date(), cfg.zona).fecha;
const desde = sumarDias(hasta, -(dias - 1));
Object.assign(LIMITES, { paginas: 200, filas: 100_000, presupuestoMs: 300_000, diasMaximos: 400 });

let t = performance.now();
const una = await leerPedidos(id, desde, hasta, dependenciasReales);
const unaMs = Math.round(performance.now() - t);

const fechas = Array.from({ length: dias }, (_, k) => sumarDias(desde, k));
t = performance.now();
const porDia: { fecha: string; filas: number; paginas: number; completo: boolean }[] = [];
let siguiente = 0;
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (siguiente < fechas.length) {
      const f = fechas[siguiente++];
      const r = await leerPedidos(id, f, f, dependenciasReales);
      porDia.push({ fecha: f, filas: r.registros.length, paginas: r.paginas, completo: r.completo });
    }
  }),
);
const diarioMs = Math.round(performance.now() - t);
const filasDia = porDia.map((d) => d.filas);
console.log(
  JSON.stringify(
    {
      companyId: id,
      desde,
      hasta,
      unaLectura: { ms: unaMs, filas: una.registros.length, paginas: una.paginas, completo: una.completo },
      diarioParalelo4: {
        ms: diarioMs,
        filas: filasDia.reduce((a, b) => a + b, 0),
        paginas: porDia.reduce((a, d) => a + d.paginas, 0),
        incompletos: porDia.filter((d) => !d.completo).length,
        maxFilasDia: Math.max(...filasDia),
      },
    },
    null,
    2,
  ),
);
