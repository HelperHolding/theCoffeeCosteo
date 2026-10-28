import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import type { Conexion } from '../../scripts/conciliacion/fase4';
import {
  aplicarInsumos,
  leerLoteInsumos,
  LOTES_INSUMOS_APROBADOS,
  validarManifiestoInsumos,
  type ManifiestoInsumos,
} from '../../scripts/conciliacion/insumos-catalogo';
import { agregarLinea, crearInsumo, crearProducto } from './fabricas';
import { crearUsuario } from './utilidades';

// Categoría y proveedor de insumos (doc 32): solo esos campos, con bitácora exacta, sin tocar costos.
let db: PGlite;
let cx: Conexion;
let admin: string, compras: string, operaciones: string;
const SHA = 'b'.repeat(64);

const fijar = async (insumo: string, categoria: string, proveedor: string) =>
  db.query(
    `update insumos set categoria_id = (select id from categorias_insumo where nombre = $2), proveedor_id = (select id from proveedores where nombre = $3)
      where nombre = $1`,
    [insumo, categoria, proveedor],
  );

beforeEach(async () => {
  db = await crearDbLocal();
  cx = {
    query: (sql, p) => db.query(sql, p) as never,
    ejecutar: (sql) => db.exec(sql).then(() => undefined),
  };
  [admin, compras, operaciones] = [
    await crearUsuario(db, 'admin'),
    await crearUsuario(db, 'compras'),
    await crearUsuario(db, 'operaciones'),
  ];
  for (const c of ['INSUMOS', 'INGREDIENTES', 'POR ASIGNAR'])
    await db.query(`insert into categorias_insumo (nombre) values ($1)`, [c]);
  for (const p of ['CEDIS', 'POR ASIGNAR'])
    await db.query(`insert into proveedores (nombre) values ($1)`, [p]);
  const base = await crearInsumo(db, {
    nombre: 'BASE NEUTRA PARA FRAPPÉ 1 KG',
    costoPaquete: 169,
    presentacion: 1000,
  });
  await crearInsumo(db, {
    nombre: 'Chobani D.Creamer Pumpkin S pice',
    costoPaquete: 180,
    presentacion: 710,
    unidad: 'ml',
  });
  await fijar('BASE NEUTRA PARA FRAPPÉ 1 KG', 'INSUMOS', 'CEDIS');
  await fijar('Chobani D.Creamer Pumpkin S pice', 'POR ASIGNAR', 'POR ASIGNAR');
  const frap = await crearProducto(db, { nombre: 'Coffee Frap', precios: { Chica: 89 } });
  await agregarLinea(db, frap, { insumoId: base, cantidades: { Chica: 40 } });
});

const manifiesto = (cambiar: (m: ManifiestoInsumos) => void = () => {}): ManifiestoInsumos => {
  const m: ManifiestoInsumos = {
    lote: 'prueba',
    fuente: { archivo: 'prueba.csv', sha256: SHA },
    cambios: [
      {
        insumo: 'BASE NEUTRA PARA FRAPPÉ 1 KG',
        campo: 'categoria',
        previo: 'INSUMOS',
        nuevo: 'INGREDIENTES',
        motivo: 'Zoho',
      },
      {
        insumo: 'Chobani D.Creamer Pumpkin S pice',
        campo: 'categoria',
        previo: 'POR ASIGNAR',
        nuevo: 'INSUMOS',
        motivo: 'gemelo',
      },
      {
        insumo: 'Chobani D.Creamer Pumpkin S pice',
        campo: 'proveedor',
        previo: 'POR ASIGNAR',
        nuevo: 'CEDIS',
        motivo: 'gemelo',
      },
    ],
    aprobacion: 'prueba',
  };
  cambiar(m);
  return m;
};
const estado = async () =>
  (
    await db.query<{ nombre: string; categoria: string; proveedor: string; costo: string }>(
      `select i.nombre, c.nombre as categoria, p.nombre as proveedor, i.costo_paquete::text as costo
         from insumos i join categorias_insumo c on c.id = i.categoria_id join proveedores p on p.id = i.proveedor_id order by 1`,
    )
  ).rows;
const costos = async () =>
  (await db.query(`select producto_id, tamano_id, costo::text from v_costo_producto order by 1, 2`)).rows;

describe('manifiesto', () => {
  it('el lote real: 4 bases de frappé a INGREDIENTES y el creamer duplicado como su gemelo', async () => {
    const m = await leerLoteInsumos('insumos-categorias-zoho-lote-1');
    expect(m.cambios.map((c) => `${c.insumo} · ${c.campo}: ${c.previo} → ${c.nuevo}`)).toEqual([
      'BASE NEUTRA PARA FRAPPÉ 1 KG · categoria: INSUMOS → INGREDIENTES',
      'BASE CHAI PARA FRAPPÉ 1 KG · categoria: INSUMOS → INGREDIENTES',
      'BASE MATCHA LATTE PARA FRAPPÉ 1 KG · categoria: INSUMOS → INGREDIENTES',
      'BASE TARO/COCO PARA FRAPPÉ 1 KG · categoria: INSUMOS → INGREDIENTES',
      'Chobani D.Creamer Pumpkin S pice · categoria: POR ASIGNAR → INSUMOS',
      'Chobani D.Creamer Pumpkin S pice · proveedor: POR ASIGNAR → CEDIS',
    ]);
    expect(m.aprobacion).toMatch(/NO autoriza aplicar en producción/);
    expect(Object.keys(LOTES_INSUMOS_APROBADOS)).toEqual(['insumos-categorias-zoho-lote-1']);
  });

  it('se rechazan manifiestos incoherentes', () => {
    const mal = (f: (m: ManifiestoInsumos) => void, e: RegExp) =>
      expect(() => validarManifiestoInsumos(manifiesto(f))).toThrow(e);
    expect(() => validarManifiestoInsumos(manifiesto())).not.toThrow();
    mal((m) => (m.cambios[0].nuevo = 'INSUMOS'), /Valores inválidos/);
    mal((m) => m.cambios.push({ ...m.cambios[1] }), /repetido/);
    mal((m) => ((m.cambios[0] as { campo: string }).campo = 'costo'), /inválido/);
    mal((m) => (m.cambios[0].motivo = ' '), /motivo/);
  });
});

describe('ejecución', () => {
  it('perfil de compras o admin, también en el ensayo', async () => {
    expect((await aplicarInsumos(cx, 'ensayo', manifiesto(), { usuario: operaciones })).error).toMatch(
      /compras o admin/,
    );
    expect((await aplicarInsumos(cx, 'ensayo', manifiesto(), { usuario: compras })).error).toBeUndefined();
  });

  it('el ensayo cambia los 3 campos con su bitácora, sin tocar costos, y no deja nada', async () => {
    const [antes, c0] = [await estado(), await costos()];
    const i = await aplicarInsumos(cx, 'ensayo', manifiesto(), { usuario: admin });
    expect(i.error).toBeUndefined();
    expect(i.totales).toEqual({ cambiado: 3, 'sin cambio': 0, revertido: 0, problema: 0 });
    expect([i.bitacoraPropia, i.bitacoraAjena, i.costosSinCambios, i.restoSinCambios, i.transaccion]).toEqual(
      [3, 0, true, true, 'rollback'],
    );
    expect(await estado()).toEqual(antes);
    expect(await costos()).toEqual(c0);
  });

  it('aplicar: valores nuevos, bitácora con nota; repetir es «sin cambio»', async () => {
    const c0 = await costos();
    const i = await aplicarInsumos(cx, 'aplicar', manifiesto(), { usuario: admin });
    expect(i.error).toBeUndefined();
    expect(await estado()).toEqual([
      { nombre: 'BASE NEUTRA PARA FRAPPÉ 1 KG', categoria: 'INGREDIENTES', proveedor: 'CEDIS', costo: '169' },
      { nombre: 'Chobani D.Creamer Pumpkin S pice', categoria: 'INSUMOS', proveedor: 'CEDIS', costo: '180' },
    ]);
    expect(await costos()).toEqual(c0);
    const b = (
      await db.query<{ campo: string; origen: string; usuario_id: string }>(
        `select campo, origen, usuario_id from bitacora where nota = $1 order by id`,
        [`prueba, ejecución ${i.ejecucion} (docs/conciliacion-brasil/32)`],
      )
    ).rows;
    expect(b.map((x) => `${x.campo} ${x.origen} ${x.usuario_id === admin}`)).toEqual([
      'categoria_id carga_masiva true',
      'categoria_id carga_masiva true',
      'proveedor_id carga_masiva true',
    ]);
    const otra = await aplicarInsumos(cx, 'aplicar', manifiesto(), { usuario: admin });
    expect(otra.totales['sin cambio']).toBe(3);
    expect(otra.bitacoraPropia).toBe(0);
  });

  it('bloqueo optimista: un valor previo distinto o un catálogo inexistente detienen todo', async () => {
    const antes = await estado();
    await fijar('BASE NEUTRA PARA FRAPPÉ 1 KG', 'POR ASIGNAR', 'CEDIS');
    const i = await aplicarInsumos(cx, 'aplicar', manifiesto(), { usuario: admin });
    expect(i.error).toMatch(/no está como declara/);
    expect(i.cambios[0].problemas.join()).toMatch(/se esperaba «INSUMOS»/);
    await fijar('BASE NEUTRA PARA FRAPPÉ 1 KG', 'INSUMOS', 'CEDIS');
    const sin = await aplicarInsumos(
      cx,
      'aplicar',
      manifiesto((m) => (m.cambios[0].nuevo = 'NO EXISTE')),
      { usuario: admin },
    );
    expect(sin.error).toMatch(/no está como declara/);
    expect(await estado()).toEqual(antes);
  });

  it('revertir: exige la ejecución, restaura exacto y se niega con ediciones posteriores', async () => {
    const antes = await estado();
    const ap = await aplicarInsumos(cx, 'aplicar', manifiesto(), { usuario: admin });
    expect((await aplicarInsumos(cx, 'revertir', manifiesto(), { usuario: admin })).error).toMatch(
      /exige --ejecucion/,
    );
    const rv = await aplicarInsumos(cx, 'revertir', manifiesto(), {
      usuario: admin,
      ejecucion: ap.ejecucion,
    });
    expect(rv.error).toBeUndefined();
    expect(rv.totales.revertido).toBe(3);
    expect(await estado()).toEqual(antes);
    const ap2 = await aplicarInsumos(cx, 'aplicar', manifiesto(), { usuario: admin });
    await db.query(`update insumos set costo_paquete = 170 where nombre = 'BASE NEUTRA PARA FRAPPÉ 1 KG'`);
    const tarde = await aplicarInsumos(cx, 'revertir', manifiesto(), {
      usuario: admin,
      ejecucion: ap2.ejecucion,
    });
    expect(tarde.error).toMatch(/posterior/);
  });
});
