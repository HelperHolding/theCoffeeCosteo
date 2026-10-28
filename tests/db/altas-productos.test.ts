import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import type { Conexion } from '../../scripts/conciliacion/fase4';
import {
  aplicarAltas,
  leerLoteAltas,
  LOTES_ALTAS_APROBADOS,
  validarManifiestoAltas,
  type ManifiestoAltas,
} from '../../scripts/conciliacion/altas-productos';
import { agregarLinea, crearInsumo, crearSubreceta } from './fabricas';
import { crearUsuario } from './utilidades';

// Alta de productos (doc 31): guardar_receta en una transacción, costo esperado, bitácora exacta y reversión.
let db: PGlite;
let cx: Conexion;
let admin: string, compras: string;
let leche: string;
const SHA = 'a'.repeat(64);

beforeEach(async () => {
  db = await crearDbLocal();
  cx = {
    query: (sql, p) => db.query(sql, p) as never,
    ejecutar: (sql) => db.exec(sql).then(() => undefined),
  };
  [admin, compras] = [await crearUsuario(db, 'admin'), await crearUsuario(db, 'compras')];
  for (const c of ['Cold', 'Other Beverages'])
    await db.query(`insert into categorias_producto (nombre) values ($1)`, [c]);
  leche = await crearInsumo(db, {
    nombre: 'LECHE ENTERA',
    costoPaquete: 44,
    presentacion: 2000,
    unidad: 'ml',
  }); // 0.022/ml
  await crearInsumo(db, { nombre: 'HIELO (g)', costoPaquete: 0, presentacion: 1, unidad: 'gr' });
  await crearInsumo(db, { nombre: 'SORA TONIC', costoPaquete: 52, presentacion: 1, unidad: 'pza' });
  const chai = await crearInsumo(db, {
    nombre: 'CHAI 1 KG',
    costoPaquete: 500,
    presentacion: 1000,
    unidad: 'gr',
  }); // 0.5/g
  const agua = await crearInsumo(db, { nombre: 'AGUA', costoPaquete: 0, presentacion: 1, unidad: 'ml' });
  const mix = await crearSubreceta(db, { nombre: 'Mix CHAI 1 KG', rendimiento: 1000 });
  await agregarLinea(db, mix, { insumoId: chai, cantidades: 111.111111 });
  await agregarLinea(db, mix, { insumoId: agua, cantidades: 888.888889 });
});

/** Costo de Mix CHAI por ml: 111.111111 × 0.5 / 1000. */
const MIX = (111.111111 * 0.5) / 1000;
const manifiesto = (cambiar: (m: ManifiestoAltas) => void = () => {}): ManifiestoAltas => {
  const m: ManifiestoAltas = {
    lote: 'prueba',
    fuente: { archivo: 'prueba.csv', sha256: SHA },
    productos: [
      {
        nombre: 'Chai Iced Ginger',
        categoria: 'Cold',
        tamanos: ['Chica', 'Grande'],
        lineas: [
          {
            componente: 'Mix CHAI 1 KG',
            tipo: 'subreceta',
            cantidades: { Chica: 36, Grande: 45 },
            origen: 'prueba',
          },
          {
            componente: 'LECHE ENTERA',
            tipo: 'insumo',
            cantidades: { Chica: 170, Grande: 290 },
            origen: 'prueba',
          },
          {
            componente: 'HIELO (g)',
            tipo: 'insumo',
            cantidades: { Chica: 130, Grande: 245 },
            origen: 'prueba',
          },
        ],
        costoEsperado: { Chica: 36 * MIX + 170 * 0.022, Grande: 45 * MIX + 290 * 0.022 },
      },
      {
        nombre: 'Sora Tonic',
        categoria: 'Other Beverages',
        tamanos: ['Único'],
        lineas: [{ componente: 'SORA TONIC', tipo: 'insumo', cantidades: { Único: 1 }, origen: 'prueba' }],
        costoEsperado: { Único: 52 },
      },
    ],
    aprobacion: 'prueba',
  };
  cambiar(m);
  return m;
};
const productos = async () =>
  (
    await db.query<{ nombre: string; categoria: string; n: number }>(
      `select r.nombre, c.nombre as categoria, (select count(*)::int from receta_lineas where receta_id = r.id) as n
         from recetas r join categorias_producto c on c.id = r.categoria_id where r.tipo = 'producto' order by 1`,
    )
  ).rows;
const bitacora = async () =>
  (await db.query<{ n: number }>(`select count(*)::int as n from bitacora`)).rows[0].n;

describe('manifiesto', () => {
  it('el lote real: los 11 productos aprobados, con categoría, tamaños y costo esperado', async () => {
    const m = await leerLoteAltas('altas-zoho-lote-1');
    expect(m.productos.map((p) => p.nombre)).toEqual([
      'Chai Iced Ginger',
      'Ichigo Chocolate',
      'Chocold Mint',
      'Fresh Soda Sicilian Lemon',
      'Fresh Soda Strawberry',
      'Pure Black (Single Shot)',
      'Sora Tonic',
      'Matcha Tonic',
      'Matcha Iced Latte + Lemon Cake',
      'Iced Black + Cookie Tradicional',
      'True White + Croissant filled with cheese and ham',
    ]);
    const combo = m.productos.find((p) => p.nombre.startsWith('True White + Croissant'))!;
    expect(combo.lineas.map((l) => l.componente)).toContain('CROISSANT TRADICIONAL');
    expect(combo.lineas.map((l) => l.componente)).not.toContain('BRIOCHE TRENZA');
    expect(
      m.productos
        .find((p) => p.nombre === 'Chai Iced Ginger')!
        .lineas.filter((l) => l.componente.startsWith('HIELO')),
    ).toHaveLength(1);
    expect(m.aprobacion).toMatch(/NO autoriza ensayo remoto ni aplicar en producción/);
    expect(Object.keys(LOTES_ALTAS_APROBADOS)).toEqual(['altas-zoho-lote-1']);
  });

  it('se rechazan manifiestos incoherentes', () => {
    const mal = (f: (m: ManifiestoAltas) => void, e: RegExp) =>
      expect(() => validarManifiestoAltas(manifiesto(f))).toThrow(e);
    expect(() => validarManifiestoAltas(manifiesto())).not.toThrow();
    mal((m) => (m.productos[1].nombre = 'Chai Iced Ginger'), /repetido/);
    mal((m) => (m.productos[0].tamanos = ['Chica']), /tamaños/);
    mal((m) => (m.productos[0].lineas[0].cantidades = { Único: 3 }), /cantidades inválidas/);
    mal((m) => (m.productos[0].lineas[1].cantidades.Chica = 0), /cantidades inválidas/);
    mal((m) => delete m.productos[1].costoEsperado.Único, /costo esperado/);
    mal((m) => m.productos[0].lineas.push({ ...m.productos[0].lineas[1] }), /repetido/);
  });
});

describe('ejecución', () => {
  it('perfil obligatorio también en el ensayo', async () => {
    expect((await aplicarAltas(cx, 'ensayo', manifiesto(), { usuario: '' })).error).toMatch(
      /Falta --usuario/,
    );
    const i = await aplicarAltas(cx, 'ensayo', manifiesto(), { usuario: compras });
    expect(i.error).toMatch(/operaciones o admin/);
  });

  it('el ensayo crea los productos con su bitácora y costo esperado, y no deja nada', async () => {
    const [antes, b0] = [await productos(), await bitacora()];
    const i = await aplicarAltas(cx, 'ensayo', manifiesto(), { usuario: admin });
    expect(i.error).toBeUndefined();
    expect(i.totales).toEqual({ creado: 2, 'sin cambio': 0, borrado: 0, problema: 0 });
    // 1 receta + tamaños + líneas + cantidades: (1+2+3+6) + (1+1+1+1)
    expect([i.bitacoraPropia, i.bitacoraAjena, i.restoSinCambios, i.transaccion]).toEqual([
      16,
      0,
      true,
      'rollback',
    ]);
    expect(await productos()).toEqual(antes);
    expect(await bitacora()).toBe(b0);
  });

  it('aplicar: recetas, categorías y nota de la ejecución; repetir es «sin cambio»', async () => {
    const i = await aplicarAltas(cx, 'aplicar', manifiesto(), { usuario: admin });
    expect(i.error).toBeUndefined();
    expect(i.transaccion).toBe('commit');
    expect(await productos()).toEqual([
      { nombre: 'Chai Iced Ginger', categoria: 'Cold', n: 3 },
      { nombre: 'Sora Tonic', categoria: 'Other Beverages', n: 1 },
    ]);
    const b = (
      await db.query<{ n: number }>(
        `select count(*)::int n from bitacora where nota = $1 and origen = 'carga_masiva' and usuario_id = $2`,
        [`prueba, ejecución ${i.ejecucion} (docs/conciliacion-brasil/31)`, admin],
      )
    ).rows[0].n;
    expect(b).toBe(16);
    const otra = await aplicarAltas(cx, 'aplicar', manifiesto(), { usuario: admin });
    expect(otra.error).toBeUndefined();
    expect(otra.totales['sin cambio']).toBe(2);
    expect(otra.bitacoraPropia).toBe(0);
  });

  it('si un costo de compra cambió desde que se preparó el lote, se detiene', async () => {
    await db.query(`update insumos set costo_paquete = 50 where id = $1`, [leche]);
    const i = await aplicarAltas(cx, 'aplicar', manifiesto(), { usuario: admin });
    expect(i.error).toMatch(/problemas/);
    expect(i.productos[0].problemas.join()).toMatch(/costo Chica/);
    expect(await productos()).toEqual([]);
  });

  it('estado mezclado (ya existe uno) o componente inexistente: no se crea nada', async () => {
    const mixto = await aplicarAltas(
      cx,
      'aplicar',
      manifiesto((m) => (m.productos[0].lineas[2].componente = 'HIELO RARO')),
      { usuario: admin },
    );
    expect(mixto.error).toMatch(/no se puede crear/);
    expect(await productos()).toEqual([]);
    await aplicarAltas(
      cx,
      'aplicar',
      manifiesto((m) => m.productos.splice(1, 1)),
      { usuario: admin },
    );
    const i = await aplicarAltas(cx, 'aplicar', manifiesto(), { usuario: admin });
    expect(i.error).toMatch(/estado mezclado/);
  });

  it('revertir: exige la ejecución, borra solo lo creado y se niega con ediciones posteriores', async () => {
    const ap = await aplicarAltas(cx, 'aplicar', manifiesto(), { usuario: admin });
    expect((await aplicarAltas(cx, 'revertir', manifiesto(), { usuario: admin })).error).toMatch(
      /exige --ejecucion/,
    );
    const rv = await aplicarAltas(cx, 'revertir', manifiesto(), { usuario: admin, ejecucion: ap.ejecucion });
    expect(rv.error).toBeUndefined();
    expect(rv.totales.borrado).toBe(2);
    expect(await productos()).toEqual([]);
    const ap2 = await aplicarAltas(cx, 'aplicar', manifiesto(), { usuario: admin });
    await db.query(`set app.origen = 'portal'`);
    await db.query(`update linea_cantidades set cantidad = 171 where cantidad = 170`);
    const tarde = await aplicarAltas(cx, 'revertir', manifiesto(), {
      usuario: admin,
      ejecucion: ap2.ejecucion,
    });
    expect(tarde.error).toMatch(/posterior/);
    expect((await productos()).length).toBe(2);
  });
});
