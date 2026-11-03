import pg from 'pg';
import { leerEnvLocal } from '../zoho/cliente';
import { configDe } from '../../lib/sucursales/config';
import { leerDias } from '../../lib/sucursales/datos';
import { consumir } from '../../lib/sucursales/consumo';
import { sumarDias } from '../../lib/sucursales/tiempo';
import { ES_TAMANO } from '../../lib/sucursales/metricas';
import { ajusteVerificado, personalizacionNeutra } from '../../lib/sucursales/personalizaciones-verificadas';
import { costear } from '../../lib/sucursales/costeo';
import { cargarRecetas } from './recetas-locales';

/**
 * Consumo teórico con datos reales (solo lectura): ejecuta en la base la MISMA expansión de recetas que la RPC
 * sucursales_recetas_consumo (migraciones 24 y 27) y la cruza con las ventas de la API. Imprime cobertura sin y con
 * los ajustes de personalizaciones, y las unidades de costeo completo con los mismos datos (deben coincidir).
 *
 *   npx tsx --conditions=react-server scripts/sucursales/medir-consumo.ts 532 --hasta 2026-10-27 --dias 7
 */
const args = process.argv.slice(2);
const id = Number(args[0]);
const hasta = args[args.indexOf('--hasta') + 1];
const dias = Number(args[args.indexOf('--dias') + 1]);
const env = await leerEnvLocal();
process.env.THECOFFEE_API_TOKEN = env.get('THECOFFEE_API_TOKEN');
const cfg = configDe(id);
if (!cfg) throw new Error(`company ${id} no está configurada`);

const db = new pg.Client({ connectionString: env.get('DATABASE_URL') });
await db.connect();
await db.query('set transaction read only');
const { datos, conAjustes, datosCosteo } = await cargarRecetas(db);
await db.end();
const desde = sumarDias(hasta, -(dias - 1));
const t = performance.now();
const l = await leerDias(cfg, desde, hasta);
const sinAjustes = consumir(l.pedidos, datos, l.pedidos).cobertura;
const r = consumir(l.pedidos, conAjustes, l.pedidos);
const costeo = costear(l.pedidos, datosCosteo, l.pedidos).resumen;
// Personalizaciones de las líneas con receta que quedan fuera: qué haría falta modelar.
const fuera = new Map<string, number>();
for (const p of l.pedidos)
  for (const x of p.lineas)
    if (datos.enlaces.has(x.codigo))
      for (const c of x.customs)
        if (
          !ES_TAMANO.test(c.nombre) &&
          !personalizacionNeutra(datos.enlaces.get(x.codigo)!.recetaId, c.nombre) &&
          !ajusteVerificado(datos.enlaces.get(x.codigo)!.recetaId, c.nombre)
        )
          fuera.set(c.nombre, (fuera.get(c.nombre) ?? 0) + 1);
console.log(
  JSON.stringify(
    {
      companyId: id,
      desde,
      hasta,
      lectura: l.estado,
      ms: Math.round(performance.now() - t),
      recetasConCantidades: datos.recetas.size,
      coberturaSinAjustes: { incluidas: sinAjustes.incluidas, excluidas: sinAjustes.excluidas },
      cobertura: r.cobertura,
      costeo: { completo: costeo.completo.lineas, parcial: costeo.parcial.motivos },
      leches: r.insumos.filter((i) => i.categoria === 'LECHE').map((i) => [i.insumo, i.cantidad, i.unidad]),
      top: r.insumos
        .slice()
        .sort((a, b) => b.productos - a.productos)
        .slice(0, 8)
        .map((i) => [i.insumo, i.cantidad, i.unidad, i.productos]),
      personalizaciones: [...fuera].sort((a, b) => b[1] - a[1]).slice(0, 12),
      productos: r.productos.slice(0, 8).map((p) => [p.receta, p.lineas, p.excluidas]),
    },
    null,
    1,
  ),
);
