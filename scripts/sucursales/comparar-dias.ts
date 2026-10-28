import { leerEnvLocal } from '../zoho/cliente';
import { configDe } from '../../lib/sucursales/config';
import { leerDias, leerVentana } from '../../lib/sucursales/datos';
import { conciliar, filtrarOrigen, filtrosOrigen, productos, resumen } from '../../lib/sucursales/metricas';
import { sumarDias } from '../../lib/sucursales/tiempo';

/**
 * R2 (docs/sucursales/13): Productos lee ahora DÍA POR DÍA. Compara, para cada filtro de origen, la lectura única de
 * antes contra la lectura por días: totales, conciliación y cada producto (clave, importe, líneas, pedidos).
 * Solo GET; imprime agregados.
 *
 *   npx tsx --conditions=react-server scripts/sucursales/comparar-dias.ts 532 --hasta 2026-10-27 --dias 7 28
 */
const args = process.argv.slice(2);
const id = Number(args[0]);
const hasta = args[args.indexOf('--hasta') + 1];
const dias = args.slice(args.indexOf('--dias') + 1).map(Number);
const token = (await leerEnvLocal()).get('THECOFFEE_API_TOKEN');
if (!token) throw new Error('Falta THECOFFEE_API_TOKEN en .env.local');
process.env.THECOFFEE_API_TOKEN = token;
const cfg = configDe(id);
if (!cfg) throw new Error(`company ${id} no está configurada`);

const huella = (ps: Parameters<typeof productos>[0], ev: Parameters<typeof productos>[0]) =>
  JSON.stringify({
    totales: resumen(ps),
    conciliacion: conciliar(ps),
    productos: productos(ps, ev).map((x) => [x.clave, x.importeCent, x.lineas, x.pedidos]),
  });

for (const n of dias) {
  const desde = sumarDias(hasta, -(n - 1));
  const [una, porDia] = await Promise.all([leerVentana(cfg, desde, hasta), leerDias(cfg, desde, hasta)]);
  const filas = filtrosOrigen.map((o) => {
    const a = filtrarOrigen(una.pedidos, o);
    const b = filtrarOrigen(porDia.pedidos, o);
    return {
      origen: o,
      pedidos: [a.length, b.length],
      ventaCent: [resumen(a).ventaCent, resumen(b).ventaCent],
      iguales: huella(a, una.pedidos) === huella(b, porDia.pedidos),
    };
  });
  console.log(JSON.stringify({ companyId: id, desde, hasta, estados: [una.estado, porDia.estado], filas }));
}
