import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import type { Conexion } from '../../scripts/conciliacion/fase4';
import {
  claveNombre,
  leerLoteRenombres,
  LOTES_RENOMBRES_APROBADOS,
  renombrarLote,
  validarManifiestoRenombres,
  type ManifiestoRenombres,
} from '../../scripts/conciliacion/renombres-lote';
import { agregarLinea, crearInsumo, crearProducto, crearSubreceta } from './fabricas';
import { crearUsuario } from './utilidades';

// Renombres por lote (doc 25): solo cambia el nombre; costos, precios, líneas y enlaces quedan iguales.
let db: PGlite;
let cx: Conexion;
let admin: string, compras: string, inactivo: string;
let leche: string;
let n = 0;

/** Dos productos con receta, precio y un enlace POS, y su manifiesto «Frappé» → «Frap». */
async function caso(): Promise<{ m: ManifiestoRenombres; recetas: string[] }> {
  const k = ++n;
  const recetas: string[] = [];
  const renombres = [];
  for (const [i, sabor] of ['Taro', 'Chai'].entries()) {
    const nombre = `${sabor} Frappé ${k}`;
    const id = await crearProducto(db, { nombre, precios: { Chica: 89, Grande: 99 } });
    await agregarLinea(db, id, { insumoId: leche, cantidades: { Chica: 170, Grande: 290 } });
    await db.query(
      `insert into producto_codigo_pos (codigo, receta_id, nombre_observado, evidencia) values ($1, $2, $3, 'prueba')`,
      [`C${k}-${i}`, id, `${sabor} Frap ${k}`],
    );
    recetas.push(id);
    renombres.push({
      id: `R${i + 1}`,
      receta_id: id,
      nombre_previo: nombre,
      nombre_nuevo: `${sabor} Frap ${k}`,
      version: await version(id),
      codigo_pos: `C${k}-${i}`,
      nombre_pos: `${sabor} Frap ${k}`,
      evidencia: 'prueba',
    });
  }
  return { recetas, m: { lote: `prueba-${k}`, fuente: 'prueba', renombres, aprobacion: 'prueba' } };
}
const version = async (id: string) =>
  (await db.query<{ v: number }>(`select version as v from recetas where id = $1`, [id])).rows[0].v;
const nombre = async (id: string) =>
  (await db.query<{ n: string }>(`select nombre as n from recetas where id = $1`, [id])).rows[0].n;
const estado = async () => ({
  recetas: (await db.query(`select id, nombre, version from recetas order by id`)).rows,
  costos: (
    await db.query(
      `select producto_id, tamano_id, canal_id, costo::text, precio_canal::text, margen::text from v_resumen order by 1, 2, 3`,
    )
  ).rows,
  enlaces: (await db.query(`select * from producto_codigo_pos order by codigo`)).rows,
  cantidades: (await db.query(`select * from linea_cantidades order by linea_id, tamano_id`)).rows,
  bitacora: (await db.query<{ n: number }>(`select count(*)::int n from bitacora`)).rows[0].n,
});
const sinNombres = (e: Awaited<ReturnType<typeof estado>>) => ({
  ...e,
  recetas: undefined,
  bitacora: undefined,
});

beforeAll(async () => {
  db = await crearDbLocal();
  cx = {
    query: (sql, p) => db.query(sql, p) as never,
    ejecutar: (sql) => db.exec(sql).then(() => undefined),
  };
  [admin, compras, inactivo] = [
    await crearUsuario(db, 'admin'),
    await crearUsuario(db, 'compras'),
    await crearUsuario(db, 'operaciones'),
  ];
  await db.query(`update perfiles set activo = false where user_id = $1`, [inactivo]);
  leche = await crearInsumo(db, { nombre: 'LECHE', costoPaquete: 44, presentacion: 2000, unidad: 'ml' });
});

describe('manifiesto', () => {
  const ruta = 'docs/conciliacion-brasil/25-nombres-pos-lote-1.manifiesto.json';
  it('el lote real: 8 renombres al nombre literal del POS, registrado con su huella', async () => {
    const texto = readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
    expect(LOTES_RENOMBRES_APROBADOS['nombres-pos-lote-1']).toEqual({
      manifiesto: ruta,
      sha256: createHash('sha256').update(texto).digest('hex'),
    });
    const m = await leerLoteRenombres('nombres-pos-lote-1');
    expect(m.renombres.map((f) => `${f.nombre_previo} → ${f.nombre_nuevo} (${f.codigo_pos})`)).toEqual([
      'Pumpkin Spice Iced Latte → Pumpkin Iced Latte (CPUMICAPP)',
      'Pumpkin Spice Latte → Pumpkin Latte (CPUMLAAPP)',
      'Pumpkin Spice Frappé → Pumpkin Spice Frap (CPUMFRAPP)',
      'Salted Caramel Frappé → Salted Caramel Frap (SALFRAAPP)',
      'Taro Frappé → Taro Frap (FRATARAPP)',
      'Coffee Frappé → Coffee Frap (COFFRAAPP)',
      'Matcha Frappé → Matcha Frap (FRAMATAPP)',
      'Chai Frappé → Chai Frap (FRACHAAPP)',
    ]);
    // Nombre literal del POS en todas las filas; sin excepciones de presentación en este lote.
    expect(m.renombres.every((f) => f.nombre_nuevo === f.nombre_pos && !f.excepcion)).toBe(true);
    // Fuera del lote: Zoé (D9/D10), Brownie (C3), Urban (C1) y el doble espacio de B7.
    const todo = JSON.stringify(m);
    for (const fuera of ['Zo', 'Brownie', 'Urban', 'Ham & Cheese']) expect(todo).not.toContain(fuera);
  });

  it('un lote no registrado o alterado se rechaza; filas inválidas también', async () => {
    await expect(leerLoteRenombres('nombres-pos-lote-9')).rejects.toThrow(/no está aprobado/);
    const raiz = mkdtempSync(join(tmpdir(), 'renombres-'));
    mkdirSync(join(raiz, 'docs/conciliacion-brasil'), { recursive: true });
    const original = readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
    writeFileSync(join(raiz, ruta), original.replace('Taro Frap"', 'Taro Frappe"'));
    await expect(leerLoteRenombres('nombres-pos-lote-1', raiz)).rejects.toThrow(/no es el aprobado/);
    const base = JSON.parse(original) as ManifiestoRenombres;
    const probar = (cambio: (m: ManifiestoRenombres) => void, error: RegExp) => {
      const m = structuredClone(base);
      cambio(m);
      expect(() => validarManifiestoRenombres(m)).toThrow(error);
    };
    probar((m) => (m.renombres[0].nombre_nuevo = 'Pumpkin Iced Latte!'), /no es el literal del POS/);
    probar((m) => (m.renombres[0].nombre_nuevo = m.renombres[0].nombre_previo), /no cambia el nombre/);
    probar(
      (m) => (
        (m.renombres[1].nombre_nuevo = 'PUMPKIN  iced latté'),
        (m.renombres[1].nombre_pos = 'PUMPKIN  iced latté')
      ),
      /repetida/,
    );
    probar((m) => (m.renombres[0].receta_id = 'x'), /UUID/);
    probar((m) => (m.renombres[0].evidencia = ' '), /Falta evidencia/);
    probar((m) => ((m.renombres[0].nombre_nuevo += ' '), (m.renombres[0].nombre_pos += ' ')), /Espacios/);
    // Una excepción de presentación solo vale si se declara.
    const conExcepcion = structuredClone(base);
    conExcepcion.renombres[0].nombre_pos = 'Pumpkin  Iced Latte';
    expect(() => validarManifiestoRenombres(conExcepcion)).toThrow(/no declara excepción/);
    conExcepcion.renombres[0].excepcion = 'doble espacio del POS (aprobada)';
    expect(() => validarManifiestoRenombres(conExcepcion)).not.toThrow();
  });

  it('la clave de choque ignora mayúsculas, acentos y espacios repetidos', () => {
    expect(claveNombre('  Chai  FRAPPÉ ')).toBe(claveNombre('chai frappe'));
    expect(claveNombre('Chai Frap')).not.toBe(claveNombre('Chai Frappé'));
  });
});

describe('renombre por lote', () => {
  it('perfil obligatorio también en el ensayo: falta, sin permiso, inactivo o inexistente no tocan nada', async () => {
    const { m } = await caso();
    const antes = await estado();
    expect((await renombrarLote(cx, 'ensayo', m, { usuario: '' })).error).toMatch(/Falta --usuario/);
    for (const u of [compras, inactivo, randomUUID()])
      expect((await renombrarLote(cx, 'aplicar', m, { usuario: u })).error).toMatch(/perfil activo/);
    expect(await estado()).toEqual(antes);
  });

  it('el ensayo renombra, verifica versión, bitácora, costos y huellas, y no deja nada', async () => {
    const { m, recetas } = await caso();
    const antes = await estado();
    const r = await renombrarLote(cx, 'ensayo', m, { usuario: admin });
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({
      transaccion: 'rollback',
      totales: { renombrada: 2, problema: 0 },
      bitacoraPropia: 2,
      costosSinCambios: true,
      restoSinCambios: true,
    });
    expect(r.filas[0].version).toEqual({
      antes: m.renombres[0].version,
      despues: m.renombres[0].version + 1,
    });
    expect(await estado()).toEqual(antes);
    expect(await nombre(recetas[0])).toBe(m.renombres[0].nombre_previo);
  });

  it('aplicar cambia solo los nombres (versión +1, autoría, nota); costos y enlaces iguales; repetir no cambia nada', async () => {
    const { m, recetas } = await caso();
    const antes = await estado();
    const r = await renombrarLote(cx, 'aplicar', m, { usuario: admin });
    expect(r.error).toBeUndefined();
    expect(r.transaccion).toBe('commit');
    expect(await nombre(recetas[0])).toBe(m.renombres[0].nombre_nuevo);
    expect(await nombre(recetas[1])).toBe(m.renombres[1].nombre_nuevo);
    const despues = await estado();
    expect(sinNombres(despues)).toEqual(sinNombres(antes));
    expect(despues.bitacora).toBe(antes.bitacora + 2);
    const b = await db.query<{
      campo: string;
      usuario_id: string;
      origen: string;
      receta_id: string;
      nota: string;
    }>(`select campo, usuario_id, origen, receta_id, nota from bitacora where nota like $1 order by id`, [
      `%${r.ejecucion}%`,
    ]);
    expect(b.rows.map((x) => x.receta_id)).toEqual(recetas);
    expect(
      b.rows.every((x) => x.campo === 'nombre' && x.usuario_id === admin && x.origen === 'carga_masiva'),
    ).toBe(true);
    expect(
      (
        await db.query(`select 1 from recetas where id = any($1::uuid[]) and updated_by = $2`, [
          recetas,
          admin,
        ])
      ).rows,
    ).toHaveLength(2);
    const v = await version(recetas[0]);
    const rep = await renombrarLote(cx, 'aplicar', m, { usuario: admin });
    expect(rep).toMatchObject({ transaccion: 'commit', totales: { 'sin cambio': 2 }, bitacoraPropia: 0 });
    expect(await version(recetas[0])).toBe(v);
  });

  it('choques: el nombre nuevo no puede coincidir (sin mayúsculas, acentos ni espacios) con otra receta, inactiva o subreceta', async () => {
    const a = await caso();
    const inactiva = await crearProducto(db, { nombre: 'TARO  FRÁP ' + n, precios: { Chica: 1 } });
    await db.query(`update recetas set activo = false where id = $1`, [inactiva]);
    const antes = await estado();
    let r = await renombrarLote(cx, 'aplicar', a.m, { usuario: admin });
    expect(r.transaccion).toBe('rollback');
    expect(r.filas[0].problemas.join()).toMatch(/choca con «TARO {2}FRÁP/);
    expect(await estado()).toEqual(antes);
    const b = await caso();
    await crearSubreceta(db, { nombre: `chai frap ${n}`, rendimiento: 100 });
    const antesB = await estado();
    r = await renombrarLote(cx, 'aplicar', b.m, { usuario: admin });
    expect(r.filas[1].problemas.join()).toMatch(/choca con «chai frap/);
    expect(await estado()).toEqual(antesB);
    expect(await nombre(b.recetas[1])).toBe(b.m.renombres[1].nombre_previo);
  });

  it('nombre o versión inesperados (edición concurrente previa) detienen todo', async () => {
    const a = await caso();
    await db.query(`update recetas set nombre = 'Taro Frappé editado ' || $2 where id = $1`, [
      a.recetas[0],
      n,
    ]);
    let r = await renombrarLote(cx, 'aplicar', a.m, { usuario: admin });
    expect(r.error).toMatch(/no está como declara el manifiesto/);
    expect(r.filas[0].problemas.join()).toMatch(/nombre actual es/);
    expect(await nombre(a.recetas[1])).toBe(a.m.renombres[1].nombre_previo);
    const b = await caso();
    await db.query(
      `update linea_cantidades set cantidad = 171 where linea_id in (select id from receta_lineas where receta_id = $1)
                      and cantidad = 170`,
      [b.recetas[1]],
    );
    r = await renombrarLote(cx, 'aplicar', b.m, { usuario: admin });
    expect(r.filas[1].problemas.join()).toMatch(/versión/);
    expect(await nombre(b.recetas[0])).toBe(b.m.renombres[0].nombre_previo);
  });

  it('un cambio de precio o de enlace durante la ejecución aborta (ROLLBACK)', async () => {
    for (const sql of [
      (id: string) =>
        `update producto_tamanos set precio_lista = precio_lista + 1 where producto_id = '${id}'`,
      (id: string) => `update producto_codigo_pos set evidencia = 'otra' where receta_id = '${id}'`,
    ]) {
      const { m, recetas } = await caso();
      const espia: Conexion = {
        ...cx,
        query: async (q, p) => {
          const r = await db.query(q, p);
          if (q.trimStart().startsWith('update public.recetas')) await db.exec(sql(recetas[0]));
          return r as never;
        },
      };
      const r = await renombrarLote(espia, 'aplicar', m, { usuario: admin });
      expect(r).toMatchObject({ transaccion: 'rollback' });
      expect(r.error).toMatch(/costo, precio o margen|fuera del nombre|bitácora/);
      expect(await nombre(recetas[0])).toBe(m.renombres[0].nombre_previo);
    }
  });

  it('revertir: exige la ejecución, restaura solo lo que cambió y no pisa ediciones posteriores', async () => {
    const { m, recetas } = await caso();
    const ap = await renombrarLote(cx, 'aplicar', m, { usuario: admin });
    expect(ap.transaccion).toBe('commit');
    expect((await renombrarLote(cx, 'revertir', m, { usuario: admin })).error).toMatch(/--ejecucion/);
    expect(
      (await renombrarLote(cx, 'revertir', m, { usuario: admin, ejecucion: randomUUID() })).error,
    ).toMatch(/nada que revertir/);
    const rv = await renombrarLote(cx, 'revertir', m, { usuario: admin, ejecucion: ap.ejecucion });
    expect(rv.error).toBeUndefined();
    expect(rv).toMatchObject({
      transaccion: 'commit',
      totales: { revertida: 2 },
      bitacoraPropia: 2,
      costosSinCambios: true,
    });
    expect(await nombre(recetas[0])).toBe(m.renombres[0].nombre_previo);
    // Revertir otra vez: la propia reversión es un cambio posterior.
    expect(
      (await renombrarLote(cx, 'revertir', m, { usuario: admin, ejecucion: ap.ejecucion })).error,
    ).toMatch(/no está como declara|posterior/);

    const b = await caso();
    const ap2 = await renombrarLote(cx, 'aplicar', b.m, { usuario: admin });
    await db.query(
      `update linea_cantidades set cantidad = 172 where linea_id in (select id from receta_lineas where receta_id = $1)
                      and cantidad = 170`,
      [b.recetas[0]],
    );
    const rv2 = await renombrarLote(cx, 'revertir', b.m, { usuario: admin, ejecucion: ap2.ejecucion });
    expect(rv2).toMatchObject({ transaccion: 'rollback' });
    expect(rv2.filas[0].problemas.join()).toMatch(/posterior/);
    expect(await nombre(b.recetas[0])).toBe(b.m.renombres[0].nombre_nuevo);
    expect(await nombre(b.recetas[1])).toBe(b.m.renombres[1].nombre_nuevo);
  });

  it('si el COMMIT falla, el informe dice «fallida» y no se confirma nada', async () => {
    const { m, recetas } = await caso();
    const falla: Conexion = {
      ...cx,
      query: async (q, p) => {
        if (q.trim().toLowerCase() === 'commit') {
          await db.query('rollback');
          throw new Error('conexión interrumpida');
        }
        return db.query(q, p) as never;
      },
    };
    const r = await renombrarLote(falla, 'aplicar', m, { usuario: admin });
    expect(r).toMatchObject({ transaccion: 'fallida', error: expect.stringMatching(/COMMIT falló/) });
    expect(await nombre(recetas[0])).toBe(m.renombres[0].nombre_previo);
  });
});
