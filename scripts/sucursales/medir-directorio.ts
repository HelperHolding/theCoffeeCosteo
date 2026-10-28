import { leerEnvLocal } from '../zoho/cliente';
import { sucursalesConfiguradas } from '../../lib/sucursales/config';
import { construirVivo } from '../../lib/sucursales/datos';

/**
 * Costo del Directorio (docs/sucursales/13): cada tarjeta pide En vivo de su sucursal (hoy + mismo día de la semana
 * pasada). Mide las 13 a la vez en frío, en caliente y tras vencer el TTL de hoy (45 s). Solo GET; agregados.
 *
 *   npx tsx --conditions=react-server scripts/sucursales/medir-directorio.ts
 */
const token = (await leerEnvLocal()).get('THECOFFEE_API_TOKEN');
if (!token) throw new Error('Falta THECOFFEE_API_TOKEN en .env.local');
process.env.THECOFFEE_API_TOKEN = token;

let peticiones = 0;
const original = globalThis.fetch;
globalThis.fetch = (async (...a: Parameters<typeof fetch>) => {
  peticiones++;
  return original(...a);
}) as typeof fetch;

const ronda = async (nombre: string) => {
  peticiones = 0;
  const t = performance.now();
  const r = await Promise.all(
    sucursalesConfiguradas.map(async (cfg) => {
      const t0 = performance.now();
      const v = await construirVivo(cfg, 'todos');
      return { id: cfg.companyId, ms: Math.round(performance.now() - t0), estado: v.lecturas.hoy.estado };
    }),
  );
  return {
    ronda: nombre,
    sucursales: r.length,
    totalMs: Math.round(performance.now() - t),
    maxMs: Math.max(...r.map((x) => x.ms)),
    peticionesApi: peticiones,
    errores: r.filter((x) => x.estado === 'error').map((x) => x.id),
  };
};

console.log(JSON.stringify(await ronda('frio')));
console.log(JSON.stringify(await ronda('caliente')));
await new Promise((r) => setTimeout(r, 46_000));
console.log(JSON.stringify(await ronda('hoy vencido (46 s)')));
