import type pg from 'pg';
import { claveConsumo, type DatosConsumo, type InsumoReceta } from '../../lib/sucursales/consumo';
import { claveCosto, type DatosCosteo, type LineaInsumo } from '../../lib/sucursales/costeo';

/**
 * Enlaces POS, recetas expandidas y costos con las MISMAS consultas que las RPC sucursales_recetas_consumo (migraciones
 * 24 y 27) y sucursales_datos_costeo (24–26), leídos directo de la base. Para medir con datos reales desde un script,
 * sin sesión de usuario. Solo hace SELECT.
 */
export async function cargarRecetas(db: pg.Client) {
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
    lineasConsumo.set(k, [
      ...(lineasConsumo.get(k) ?? []),
      { insumo: d.insumo, cantidad: Number(d.cantidad) },
    ]);
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
  return { datos, conAjustes, datosCosteo };
}
