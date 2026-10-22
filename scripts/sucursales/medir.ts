import { leerEnvLocal } from '../zoho/cliente';
import { configDe } from '../../lib/sucursales/config';
import { construirTendencias, construirVivo } from '../../lib/sucursales/datos';

/**
 * E4 · Medición con datos reales (solo GET, solo agregados). Mide tiempos en frío y en caliente del
 * mismo pipeline del portal para "En vivo" y "Tendencias", y reporta cobertura y conciliación.
 *
 *   npx tsx --conditions=react-server scripts/sucursales/medir.ts 612 583 [--semanas 12]
 */
const args = process.argv.slice(2);
const i = args.indexOf('--semanas');
const semanas = (i >= 0 ? Number(args[i + 1]) : 4) as 4 | 8 | 12;
const ids = args.filter((a, j) => !a.startsWith('--') && j !== i + 1).map(Number);
const token = (await leerEnvLocal()).get('THECOFFEE_API_TOKEN');
if (!token) throw new Error('Falta THECOFFEE_API_TOKEN en .env.local');
process.env.THECOFFEE_API_TOKEN = token;

const ms = async <T>(fn: () => Promise<T>) => {
  const t = performance.now();
  const r = await fn();
  return [r, Math.round(performance.now() - t)] as const;
};

for (const id of ids) {
  const cfg = configDe(id);
  if (!cfg) throw new Error(`company ${id} no está configurada`);
  const [vivo, vivoFrio] = await ms(() => construirVivo(cfg, 'todos'));
  const [, vivoCaliente] = await ms(() => construirVivo(cfg, 'todos'));
  const [t, tendFrio] = await ms(() => construirTendencias(cfg, semanas, 'todos'));
  const [, tendCaliente] = await ms(() => construirTendencias(cfg, semanas, 'todos'));
  console.log(
    JSON.stringify(
      {
        companyId: id,
        nombre: cfg.nombre,
        zona: cfg.zona,
        tiemposMs: { vivoFrio, vivoCaliente, tendenciasFrio: tendFrio, tendenciasCaliente: tendCaliente },
        vivo: {
          corte: vivo.corte.hora,
          lecturas: [vivo.lecturas.hoy.estado, vivo.lecturas.base.estado],
          pedidos: vivo.kpis.pedidos,
          ventaCent: vivo.kpis.ventaCent,
          ultimoPedido: vivo.ultimoPedido,
          posterioresAlCorte: vivo.posterioresAlCorte,
        },
        tendencias: {
          semanas: t.semanas.map((s) => [
            s.desde,
            s.lectura.estado,
            s.kpis?.pedidos ?? null,
            s.kpis?.ventaCent ?? null,
          ]),
          completas: t.semanasCompletas,
          pedidos: t.totales.pedidos,
          ventaCent: t.totales.ventaCent,
          ticketCent: t.totales.ticketCent,
          conciliacion: t.conciliacion,
          picoPromedio: Math.max(...t.mapa.flat().map((v) => v ?? 0)),
        },
      },
      null,
      2,
    ),
  );
}
