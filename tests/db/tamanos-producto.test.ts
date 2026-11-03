import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import type { Conexion } from '../../scripts/conciliacion/fase4';
import {
  aplicarTamanos,
  leerLoteTamanos,
  LOTES_TAMANOS_APROBADOS,
  validarManifiestoTamanos,
  type ManifiestoTamanos,
} from '../../scripts/conciliacion/tamanos-producto';
import { agregarLinea, crearInsumo, crearProducto, idTamano } from './fabricas';
import { crearUsuario } from './utilidades';

// Cambio de tamaños (doc 42): un producto Único pasa a Chica y Grande con sus precios de lista y manuales.
let db: PGlite;
let cx: Conexion;
let admin: string, operaciones: string;
let gelato: string, otro: string;

beforeEach(async () => {
  db = await crearDbLocal();
  cx = {
    query: (sql, p) => db.query(sql, p) as never,
    ejecutar: (sql) => db.exec(sql).then(() => undefined),
  };
  [admin, operaciones] = [await crearUsuario(db, 'admin'), await crearUsuario(db, 'operaciones')];
  const helado = await crearInsumo(db, { nombre: 'HELADO', costoPaquete: 840, presentacion: 14000 });
  const leche = await crearInsumo(db, {
    nombre: 'LECHE',
    costoPaquete: 44,
    presentacion: 2000,
    unidad: 'ml',
  });
  const v14 = await crearInsumo(db, {
    nombre: 'VASO 14',
    costoPaquete: 2800,
    presentacion: 1000,
    unidad: 'pza',
  });
  await crearInsumo(db, { nombre: 'VASO 20', costoPaquete: 3000, presentacion: 1000, unidad: 'pza' });
  gelato = await crearProducto(db, { nombre: 'Gelato Frappé Coffee', precios: { Único: 94 } });
  otro = await crearProducto(db, { nombre: 'Brownie', precios: { Único: 50 } });
  await agregarLinea(db, gelato, { insumoId: helado, cantidades: { Único: 150 } });
  await agregarLinea(db, gelato, { insumoId: leche, cantidades: { Único: 100 } });
  await agregarLinea(db, gelato, { insumoId: v14, cantidades: { Único: 1 } });
  await agregarLinea(db, otro, { insumoId: helado, cantidades: { Único: 10 } });
  await db.query(
    `insert into precio_canal_manual (producto_id, tamano_id, canal_id, precio, nota)
     select $1, $2, id, 129, 'menú Rappi' from canales where nombre = 'Rappi'`,
    [gelato, await idTamano(db, 'Único')],
  );
});

const version = async (r: string) =>
  Number((await db.query<{ v: number }>(`select version as v from recetas where id = $1`, [r])).rows[0].v);
// HELADO 0.06/g · LECHE 0.022/ml · VASO 14 2.8 · VASO 20 3
const manifiesto = async (cambiar: (m: ManifiestoTamanos) => void = () => {}): Promise<ManifiestoTamanos> => {
  const m: ManifiestoTamanos = {
    lote: 'prueba',
    fuente: { archivo: 'recetario', sha256: 'a'.repeat(64) },
    productos: [
      {
        nombre: 'Gelato Frappé Coffee',
        version: await version(gelato),
        previo: {
          tamanos: {
            Único: { precioLista: 94, manuales: [{ canal: 'Rappi', precio: 129, nota: 'menú Rappi' }] },
          },
          lineas: [
            { componente: 'HELADO', tipo: 'insumo', cantidades: { Único: 150 } },
            { componente: 'LECHE', tipo: 'insumo', cantidades: { Único: 100 } },
            { componente: 'VASO 14', tipo: 'insumo', cantidades: { Único: 1 } },
          ],
        },
        nuevo: {
          tamanos: {
            Chica: { precioLista: 94, manuales: [] },
            Grande: { precioLista: 104, manuales: [{ canal: 'Rappi', precio: 129, nota: 'menú Rappi' }] },
          },
          lineas: [
            { componente: 'HELADO', tipo: 'insumo', cantidades: { Chica: 150, Grande: 200 } },
            { componente: 'LECHE', tipo: 'insumo', cantidades: { Chica: 100, Grande: 140 } },
            { componente: 'VASO 14', tipo: 'insumo', cantidades: { Chica: 1 } },
            { componente: 'VASO 20', tipo: 'insumo', cantidades: { Grande: 1 }, origen: 'prueba' },
          ],
        },
        renombrar: { de: 'Único', a: 'Chica' },
        costoPrevio: { Único: 14.0 },
        costoNuevo: { Chica: 14.0, Grande: 18.08 },
      },
    ],
    aprobacion: 'prueba',
  };
  cambiar(m);
  return m;
};
const estado = async () => ({
  tamanos: (
    await db.query<{ nombre: string; t: string; precio_lista: string }>(
      `select r.nombre, t.nombre t, pt.precio_lista::text from producto_tamanos pt join recetas r on r.id = pt.producto_id join tamanos t on t.id = pt.tamano_id order by 1, 2`,
    )
  ).rows,
  manuales: (
    await db.query(
      `select producto_id, tamano_id, canal_id, precio::text, nota from precio_canal_manual order by 1, 2`,
    )
  ).rows,
  cantidades: (
    await db.query<{ nombre: string; t: string; cantidad: string }>(
      `select i.nombre, t.nombre t, lc.cantidad::text from linea_cantidades lc join receta_lineas l on l.id = lc.linea_id join insumos i on i.id = l.insumo_id join tamanos t on t.id = lc.tamano_id where l.receta_id = $1 order by 1, 2`,
      [gelato],
    )
  ).rows,
  costos: (
    await db.query(
      `select producto_id, tamano_id, round(costo, 6)::text c from v_costo_producto order by 1, 2`,
    )
  ).rows,
});

describe('manifiesto', () => {
  it('valida tamaños, renombre y que las cantidades del Único sigan en la Chica', async () => {
    const base = await manifiesto();
    expect(() => validarManifiestoTamanos(base)).not.toThrow();
    const mal = async (f: (m: ManifiestoTamanos) => void, error: RegExp) =>
      expect(() =>
        validarManifiestoTamanos(structuredClone({ ...base, ...((x) => (f(x), x))(structuredClone(base)) })),
      ).toThrow(error);
    await mal((m) => (m.productos[0].nuevo.lineas[0].cantidades.Chica = 160), /conservar su cantidad/);
    await mal((m) => (m.productos[0].renombrar = { de: 'Chica', a: 'Grande' }), /renombrar/);
    await mal((m) => delete m.productos[0].costoNuevo.Grande, /falta el costo nuevo de Grande/);
    await mal((m) => delete m.productos[0].nuevo.lineas[3].origen, /falta el origen/);
    await expect(leerLoteTamanos('otro')).rejects.toThrow(/no está aprobado/);
    expect(LOTES_TAMANOS_APROBADOS).toBeTypeOf('object');
  });
});

describe('lote real de combos (doc 45)', () => {
  it('Chica = la receta Único; Grande = la bebida Grande de la receta suelta; Grande a +$10', async () => {
    const m = await leerLoteTamanos('tamanos-combos-lote-1');
    expect(Object.keys(LOTES_TAMANOS_APROBADOS)).toEqual(['tamanos-gelato-lote-1', 'tamanos-combos-lote-1']);
    expect(
      m.productos.map((p) => [
        p.nombre,
        p.costoPrevio.Único,
        p.costoNuevo.Chica,
        p.costoNuevo.Grande,
        p.nuevo.tamanos.Chica!.precioLista,
        p.nuevo.tamanos.Grande!.precioLista,
      ]),
    ).toEqual([
      ['Iced Latte + Ham & Cheese Sandwich', 55.2913, 55.2913, 58.1313, 119, 129],
      ['True White + Croissant filled with cheese and ham', 49.524, 49.524, 51.484, null, null],
      ['True White + Croissant Serrano & Gouda', 53.8839, 53.8839, 55.8439, 125, 135],
      ['True White + Grilled Ham & Cheese Sandwich', 54.5913, 54.5913, 56.5513, 119, 129],
    ]);
    const solo = (n: number, t: 'Chica' | 'Grande') =>
      m.productos[n].nuevo.lineas
        .filter((l) => l.cantidades[t] !== undefined && l.cantidades.Chica !== l.cantidades.Grande)
        .map((l) => `${l.componente} ${l.cantidades[t]}`);
    expect(solo(0, 'Grande')).toEqual(['LECHE ENTERA 290', 'VASO FRÍO PET 20 OZ (1,000 PZS) 1']);
    expect(solo(1, 'Grande')).toEqual([
      'LECHE ENTERA 250',
      'VASO CALIENTE PAPEL KRAFT 12 OZ (1,000 PZS) 1',
      'TAPA CALIENTE 90MM (1,000 PZS) 1',
    ]);
    // El precio manual de Rappi del Iced Latte + Ham & Cheese queda en la Chica: Rappi vende los dos tamaños.
    expect(m.productos[0].nuevo.tamanos.Chica!.manuales.map((x) => `${x.canal} ${x.precio}`)).toEqual([
      'Rappi 151',
    ]);
    expect(m.productos[0].nuevo.tamanos.Grande!.manuales).toEqual([]);
  });
});

describe('ejecución', () => {
  it('solo admin', async () => {
    const i = await aplicarTamanos(cx, 'ensayo', await manifiesto(), { usuario: operaciones });
    expect(i.error).toMatch(/admin/);
  });

  it('ensayo: Chica y Grande con precios, precio manual en la Grande, bitácora exacta; no deja nada', async () => {
    const antes = await estado();
    const i = await aplicarTamanos(cx, 'ensayo', await manifiesto(), { usuario: admin });
    expect(i.error).toBeUndefined();
    expect(i.productos[0].costos).toEqual({ Chica: 14, Grande: 18.08 });
    // 2 tamaños + 1 manual nuevo + 3 cantidades renombradas + 2 cantidades Grande + (1 línea + 1 cantidad) + baja del
    // Único y su manual (2)
    expect([i.bitacoraPropia, i.bitacoraAjena, i.restoSinCambios, i.costosCompletos]).toEqual([
      12,
      0,
      true,
      true,
    ]);
    expect(i.transaccion).toBe('rollback');
    expect(await estado()).toEqual(antes);
  });

  it('aplicar, repetir sin cambio y revertir al estado exacto previo', async () => {
    const antes = await estado();
    const a = await aplicarTamanos(cx, 'aplicar', await manifiesto(), { usuario: admin });
    expect([a.error, a.transaccion]).toEqual([undefined, 'commit']);
    const despues = await estado();
    expect(despues.tamanos.filter((t) => t.nombre === 'Gelato Frappé Coffee')).toEqual([
      { nombre: 'Gelato Frappé Coffee', t: 'Chica', precio_lista: '94' },
      { nombre: 'Gelato Frappé Coffee', t: 'Grande', precio_lista: '104' },
    ]);
    expect(despues.cantidades.map((x) => `${x.nombre} ${x.t}=${Number(x.cantidad)}`)).toEqual([
      'HELADO Chica=150',
      'HELADO Grande=200',
      'LECHE Chica=100',
      'LECHE Grande=140',
      'VASO 14 Chica=1',
      'VASO 20 Grande=1',
    ]);
    const r = await aplicarTamanos(cx, 'aplicar', await manifiesto(), { usuario: admin });
    expect([r.error, r.totales['sin cambio'], r.bitacoraPropia]).toEqual([undefined, 1, 0]);
    const v = await aplicarTamanos(cx, 'revertir', await manifiesto(), {
      usuario: admin,
      ejecucion: a.ejecucion,
    });
    expect([v.error, v.transaccion, v.totales.revertido]).toEqual([undefined, 'commit', 1]);
    expect(await estado()).toEqual(antes);
  });

  it('versión distinta o estado previo distinto: no se toca nada', async () => {
    const antes = await estado();
    expect(
      (
        await aplicarTamanos(cx, 'aplicar', await manifiesto((m) => (m.productos[0].version += 1)), {
          usuario: admin,
        })
      ).error,
    ).toMatch(/cambió desde que se preparó/);
    await db.exec(`update producto_tamanos set precio_lista = 95 where precio_lista = 94`);
    expect((await aplicarTamanos(cx, 'aplicar', await manifiesto(), { usuario: admin })).error).toMatch(
      /no es el previo/,
    );
    await db.exec(`update producto_tamanos set precio_lista = 94 where precio_lista = 95`);
    expect((await estado()).cantidades).toEqual(antes.cantidades);
  });
});
