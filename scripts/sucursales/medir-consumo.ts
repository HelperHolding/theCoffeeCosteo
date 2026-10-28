import pg from 'pg';
import { leerEnvLocal } from '../zoho/cliente';
import { configDe } from '../../lib/sucursales/config';
import { leerDias } from '../../lib/sucursales/datos';
import { claveConsumo, consumir, type DatosConsumo, type InsumoReceta } from '../../lib/sucursales/consumo';
import { sumarDias } from '../../lib/sucursales/tiempo';
import { ES_TAMANO } from '../../lib/sucursales/metricas';

/**
 * Consumo teórico con datos reales (solo lectura): ejecuta en la base la MISMA expansión de recetas que la RPC
 * sucursales_recetas_consumo (migración 23) y la cruza con las ventas de la API. Imprime cobertura y totales.
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
const enlaces = (
  await db.query<{ codigo: string; receta_id: string; receta: string }>(
    `select e.codigo, r.id receta_id, r.nombre receta from producto_codigo_pos e join recetas r on r.id = e.receta_id`,
  )
).rows;
const unicas = (
  await db.query<{ producto_id: string }>(
    `select pt.producto_id from producto_tamanos pt join tamanos t on t.id = pt.tamano_id
     where pt.producto_id in (select receta_id from producto_codigo_pos)
     group by pt.producto_id having bool_and(t.nombre = 'Único')`,
  )
).rows;
const insumos = (
  await db.query<{
    receta_id: string;
    tamano: string;
    insumo_id: string;
    insumo: string;
    unidad: string;
    categoria: string | null;
    cantidad: string;
  }>(
    `with recursive
     productos as (select distinct receta_id from producto_codigo_pos),
     directas as (
       select l.receta_id, lc.tamano_id, l.insumo_id, l.subreceta_id, lc.cantidad
       from receta_lineas l join linea_cantidades lc on lc.linea_id = l.id
       where l.receta_id in (select receta_id from productos) and lc.tamano_id is not null),
     expansion (receta_id, tamano_id, insumo_id, subreceta_id, cantidad) as (
       select * from directas
       union all
       select e.receta_id, e.tamano_id, l.insumo_id, l.subreceta_id, e.cantidad * lc.cantidad / r.rendimiento
       from expansion e
       join receta_lineas l on l.receta_id = e.subreceta_id
       join recetas r on r.id = l.receta_id
       join linea_cantidades lc on lc.linea_id = l.id),
     total as (select receta_id, tamano_id, insumo_id, sum(cantidad) cantidad
               from expansion where insumo_id is not null group by 1, 2, 3)
     select x.receta_id, t.nombre tamano, i.id insumo_id, i.nombre insumo, i.unidad, c.nombre categoria, x.cantidad
     from total x join tamanos t on t.id = x.tamano_id join insumos i on i.id = x.insumo_id
     left join categorias_insumo c on c.id = i.categoria_id`,
  )
).rows;
await db.end();

const recetas = new Map<string, InsumoReceta[]>();
for (const i of insumos) {
  const k = claveConsumo(i.receta_id, i.tamano);
  recetas.set(k, [
    ...(recetas.get(k) ?? []),
    {
      insumoId: i.insumo_id,
      insumo: i.insumo,
      unidad: i.unidad,
      categoria: i.categoria ?? 'Sin categoría',
      cantidad: Number(i.cantidad),
    },
  ]);
}
const datos: DatosConsumo = {
  leidoEn: new Date().toISOString(),
  enlaces: new Map(enlaces.map((e) => [e.codigo, { recetaId: e.receta_id, receta: e.receta }])),
  unicas: new Set(unicas.map((u) => u.producto_id)),
  recetas,
};
const desde = sumarDias(hasta, -(dias - 1));
const t = performance.now();
const l = await leerDias(cfg, desde, hasta);
const r = consumir(l.pedidos, datos, l.pedidos);
// Personalizaciones de las líneas con receta que quedan fuera: qué haría falta modelar.
const fuera = new Map<string, number>();
for (const p of l.pedidos)
  for (const x of p.lineas)
    if (datos.enlaces.has(x.codigo))
      for (const c of x.customs)
        if (!ES_TAMANO.test(c.nombre)) fuera.set(c.nombre, (fuera.get(c.nombre) ?? 0) + 1);
console.log(
  JSON.stringify(
    {
      companyId: id,
      desde,
      hasta,
      lectura: l.estado,
      ms: Math.round(performance.now() - t),
      recetasConCantidades: recetas.size,
      cobertura: r.cobertura,
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
