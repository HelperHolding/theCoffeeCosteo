import pg from 'pg';
import { leerEnvLocal } from '../zoho/cliente';
import { configDe } from '../../lib/sucursales/config';
import { leerDias } from '../../lib/sucursales/datos';
import { claveConsumo, consumir, type DatosConsumo, type InsumoReceta } from '../../lib/sucursales/consumo';
import { sumarDias } from '../../lib/sucursales/tiempo';
import { ES_TAMANO } from '../../lib/sucursales/metricas';
import { ajusteVerificado, personalizacionNeutra } from '../../lib/sucursales/personalizaciones-verificadas';
import { claveCosto, costear, type DatosCosteo, type LineaInsumo } from '../../lib/sucursales/costeo';

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
// Migración 27 (líneas directas y sustitutos) y, para comparar con Costeo, lo que da la RPC de costeo (24–26).
const directas = (
  await db.query<{
    receta_id: string;
    tamano: string;
    insumo_id: string;
    insumo: string;
    unidad: string;
    cantidad: string;
    costo_unitario: string;
    activo: boolean;
  }>(
    `select l.receta_id, t.nombre tamano, i.id insumo_id, i.nombre insumo, i.unidad, lc.cantidad, i.costo_unitario, i.activo
     from receta_lineas l join linea_cantidades lc on lc.linea_id = l.id and lc.tamano_id is not null
     join tamanos t on t.id = lc.tamano_id join insumos i on i.id = l.insumo_id
     where l.receta_id in (select receta_id from producto_codigo_pos)`,
  )
).rows;
const sustitutos = (
  await db.query<{
    insumo_id: string;
    insumo: string;
    unidad: string;
    categoria: string | null;
    costo_unitario: string;
    activo: boolean;
  }>(
    `select i.id insumo_id, i.nombre insumo, i.unidad, c.nombre categoria, i.costo_unitario, i.activo
     from insumos i left join categorias_insumo c on c.id = i.categoria_id
     where i.nombre in ('LECHE ENTERA', 'LECHE DESLACTOSADAS', 'LECHE AVENA', 'LECHE ALMENDRA', 'LECHE COCO',
       'LECHE AVENA CALIFIA', 'LECHE ALMENDRA CALIFIA', 'LECHE COCO CALIFIA', 'CAFÉ TOSTADO EN GRANO BLACK 1.5 KG',
       'CAFÉ TOSTADO EN GRANO WHITE 1.5 KG', 'CAFÉ TOSTADO EN GRANO KRAFT 1.5 KG', 'MIEL DE ABEJA 1 LT')`,
  )
).rows;
const costosProducto = (
  await db.query<{ producto_id: string; tamano: string; costo: string; usa_inactivo: boolean }>(
    `select c.producto_id, t.nombre tamano, c.costo, c.usa_inactivo from v_costo_producto c
     join tamanos t on t.id = c.tamano_id where c.producto_id in (select receta_id from producto_codigo_pos)`,
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
const lineasConsumo = new Map<string, { insumo: string; cantidad: number }[]>();
const lineasCosteo = new Map<string, LineaInsumo[]>();
for (const d of directas) {
  const k = claveConsumo(d.receta_id, d.tamano);
  lineasConsumo.set(k, [...(lineasConsumo.get(k) ?? []), { insumo: d.insumo, cantidad: Number(d.cantidad) }]);
  lineasCosteo.set(k, [
    ...(lineasCosteo.get(k) ?? []),
    {
      lineaId: '',
      insumoId: d.insumo_id,
      insumo: d.insumo,
      unidad: d.unidad,
      cantidad: Number(d.cantidad),
      costoUnitario: Number(d.costo_unitario),
      activo: d.activo,
    },
  ]);
}
const conAjustes: DatosConsumo = {
  ...datos,
  lineas: lineasConsumo,
  sustitutos: new Map(
    sustitutos.map((s) => [
      s.insumo,
      {
        insumoId: s.insumo_id,
        insumo: s.insumo,
        unidad: s.unidad,
        categoria: s.categoria ?? 'Sin categoría',
      },
    ]),
  ),
};
const datosCosteo: DatosCosteo = {
  leidoEn: datos.leidoEn,
  iva: 0.16,
  enlaces: datos.enlaces,
  unicas: datos.unicas,
  costos: new Map(
    costosProducto.map((c) => [
      claveCosto(c.producto_id, c.tamano),
      { costoCent: Math.round(Number(c.costo) * 100), usaInactivo: c.usa_inactivo },
    ]),
  ),
  lineas: lineasCosteo,
  sustitutos: new Map(
    sustitutos.map((s) => [s.insumo, { costoUnitario: Number(s.costo_unitario), activo: s.activo }]),
  ),
};
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
      recetasConCantidades: recetas.size,
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
