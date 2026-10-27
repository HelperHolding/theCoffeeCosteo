import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import type { Conexion } from '../../scripts/conciliacion/fase4';
import {
  enlazar,
  leerLoteAprobado,
  LOTES_APROBADOS,
  type Enlace,
  type LoteAprobado,
} from '../../scripts/conciliacion/enlaces-pos';
import { crearProducto } from './fabricas';
import { crearUsuario } from './utilidades';

// Lotes aprobados por manifiesto (lote 1 y lote 2 reales) y carga de un lote con un lote previo que debe seguir intacto.
const sha = (t: string) => createHash('sha256').update(t).digest('hex');
const CAB = 'codigo,receta_id,receta_nombre,nombre_observado,evidencia';

/** Escribe un juego de lotes de prueba (CSV + manifiesto) en una carpeta y devuelve su registro de aprobados. */
function juego(
  lotes: { nombre: string; filas: Enlace[]; requiere?: string[]; manifiesto?: (m: object) => object }[],
) {
  const raiz = mkdtempSync(join(tmpdir(), 'lotes-'));
  mkdirSync(join(raiz, 'l'));
  const aprobados: Record<string, { manifiesto: string; sha256: string }> = {};
  for (const l of lotes) {
    const csv = [CAB, ...l.filas.map((f) => Object.values(f).join(','))].join('\n') + '\n';
    writeFileSync(join(raiz, 'l', `${l.nombre}.csv`), csv);
    const base = {
      lote: l.nombre,
      archivo: `l/${l.nombre}.csv`,
      filas: l.filas.length,
      sha256: sha(csv),
      correspondencias: l.filas.map((f) => ({ codigo: f.codigo, receta_id: f.receta_id })),
      requiere: l.requiere ?? [],
      aprobacion: 'prueba',
    };
    const texto = JSON.stringify(l.manifiesto ? l.manifiesto(base) : base, null, 1) + '\n';
    writeFileSync(join(raiz, 'l', `${l.nombre}.json`), texto);
    aprobados[l.nombre] = { manifiesto: `l/${l.nombre}.json`, sha256: sha(texto) };
  }
  return { raiz, aprobados };
}

describe('lotes aprobados reales', () => {
  it('lote 1: 57 enlaces por manifiesto, idéntico a la identidad fijada', async () => {
    const l = await leerLoteAprobado('lote-1');
    expect(l.lote).toHaveLength(57);
    expect(l.manifiesto.sha256).toBe('5c36c6ce7b9a4a24b5542e663703e637b0b583316e064ed50752c3e29486f357');
    expect(l.previos).toEqual({});
  });

  it('lote 2: exactamente los 5 códigos autorizados, requiere el lote 1 completo y no repite códigos ni recetas', async () => {
    const l = await leerLoteAprobado('lote-2');
    expect(l.lote.map((f) => f.codigo).sort()).toEqual(['1CBWB', '3CBBE', '3FOOD3', 'BR3', 'CROSTUAPP']);
    expect(Object.keys(l.previos)).toEqual(['lote-1']);
    expect(l.previos['lote-1']).toHaveLength(57);
    for (const excluido of [
      'BRICE',
      'CPUMICAPP',
      'CPUMLAAPP',
      'CPUMFRAPP',
      'SALFRAAPP',
      'FRATARAPP',
      'COFFRAAPP',
      'FRAMATAPP',
      'FRACHAAPP',
      'ZOEWATAPP',
    ])
      expect(l.lote.some((f) => f.codigo === excluido)).toBe(false);
    const negro = l.lote.find((f) => f.codigo === '3CBBE')!;
    expect(negro.evidencia).toMatch(/sin precio comparable sin descuento en 532 \(no confirmado\)/);
    expect(negro.evidencia).not.toMatch(/=\d/);
    expect(l.manifiesto.notas?.join(' ')).toMatch(/3CBBE.*NO está confirmado/);
  });

  it('lote 3: exactamente los 8 códigos de Pumpkin y Frap renombrados, requiere los lotes 1 y 2 completos (62)', async () => {
    const l = await leerLoteAprobado('lote-3');
    expect(l.lote.map((f) => `${f.codigo}→${f.receta_nombre}`)).toEqual([
      'COFFRAAPP→Coffee Frap',
      'CPUMFRAPP→Pumpkin Spice Frap',
      'CPUMICAPP→Pumpkin Iced Latte',
      'CPUMLAAPP→Pumpkin Latte',
      'FRACHAAPP→Chai Frap',
      'FRAMATAPP→Matcha Frap',
      'FRATARAPP→Taro Frap',
      'SALFRAAPP→Salted Caramel Frap',
    ]);
    // El nombre observado en el POS es el nombre vigente de la receta (renombre del PR #34).
    expect(l.lote.every((f) => f.nombre_observado === f.receta_nombre)).toBe(true);
    expect(Object.keys(l.previos).sort()).toEqual(['lote-1', 'lote-2']);
    expect(l.previos['lote-1'].length + l.previos['lote-2'].length).toBe(62);
    for (const excluido of ['BRICE', 'ZOEWATAPP', 'ZOETWIAPP', '4UC', '5IL'])
      expect(l.lote.some((f) => f.codigo === excluido)).toBe(false);
    const chai = l.lote.find((f) => f.codigo === 'FRACHAAPP')!;
    expect(chai.evidencia).toMatch(/Grande sin venta comparable en 532; no confirmado/);
    expect(l.manifiesto.aprobacion).toMatch(/NO autoriza carga en producción ni merge/);
  });

  it('un lote fuera de LOTES_APROBADOS o un manifiesto alterado se rechazan', async () => {
    await expect(leerLoteAprobado('lote-9')).rejects.toThrow(/no está aprobado/);
    const raiz = mkdtempSync(join(tmpdir(), 'manif-'));
    mkdirSync(join(raiz, 'docs/conciliacion-brasil'), { recursive: true });
    const ruta = LOTES_APROBADOS['lote-2'].manifiesto;
    writeFileSync(join(raiz, ruta), readFileSync(ruta, 'utf8').replace('"filas": 5', '"filas": 6'));
    await expect(leerLoteAprobado('lote-2', raiz)).rejects.toThrow(/no es el aprobado/);
  });
});

describe('validación de manifiestos', () => {
  const r = () => randomUUID();
  const fila = (codigo: string, receta_id: string = r()): Enlace => ({
    codigo,
    receta_id,
    receta_nombre: `Receta ${codigo}`,
    nombre_observado: `Obs ${codigo}`,
    evidencia: 'API',
  });

  it('correspondencias del manifiesto distintas del archivo, cantidad distinta o lote mal declarado → rechazo', async () => {
    const a = fila('A1');
    let j = juego([
      {
        nombre: 'x',
        filas: [a],
        manifiesto: (m) => ({ ...m, correspondencias: [{ codigo: 'A1', receta_id: r() }] }),
      },
    ]);
    await expect(leerLoteAprobado('x', j.raiz, j.aprobados)).rejects.toThrow(/correspondencias del archivo/);
    j = juego([{ nombre: 'x', filas: [a], manifiesto: (m) => ({ ...m, filas: 2 }) }]);
    await expect(leerLoteAprobado('x', j.raiz, j.aprobados)).rejects.toThrow(/declara 2 filas y 1/);
    j = juego([{ nombre: 'x', filas: [a], manifiesto: (m) => ({ ...m, lote: 'y' }) }]);
    await expect(leerLoteAprobado('x', j.raiz, j.aprobados)).rejects.toThrow(/declara «y»/);
  });

  it('un lote que repite código o receta de un lote requerido, o una dependencia circular → rechazo', async () => {
    const a = fila('A1');
    let j = juego([
      { nombre: 'p', filas: [a] },
      { nombre: 'x', filas: [fila('B1', a.receta_id)], requiere: ['p'] },
    ]);
    await expect(leerLoteAprobado('x', j.raiz, j.aprobados)).rejects.toThrow(/repite códigos o recetas/);
    j = juego([
      { nombre: 'p', filas: [a], requiere: ['x'] },
      { nombre: 'x', filas: [fila('B1')], requiere: ['p'] },
    ]);
    await expect(leerLoteAprobado('x', j.raiz, j.aprobados)).rejects.toThrow(/circular/);
  });
});

describe('carga de un lote con lote previo requerido', () => {
  let db: PGlite;
  let cx: Conexion;
  let admin: string;
  let previo: LoteAprobado;
  let nuevo: LoteAprobado;
  let cargaNuevo: string;
  const filas = async () =>
    (await db.query<{ codigo: string }>(`select codigo from producto_codigo_pos order by codigo`)).rows.map(
      (x) => x.codigo,
    );

  beforeAll(async () => {
    db = await crearDbLocal();
    cx = {
      query: (sql, p) => db.query(sql, p) as never,
      ejecutar: (sql) => db.exec(sql).then(() => undefined),
    };
    admin = await crearUsuario(db, 'admin');
    const ids: string[] = [];
    for (const n of ['P1', 'P2', 'P3', 'N1', 'N2'])
      ids.push(await crearProducto(db, { nombre: `Producto ${n}`, precios: { Chica: 50 } }));
    const f = (codigo: string, i: number): Enlace => ({
      codigo,
      receta_id: ids[i],
      receta_nombre: `Producto ${codigo}`,
      nombre_observado: codigo,
      evidencia: 'API',
    });
    const j = juego([
      { nombre: 'lote-a', filas: [f('P1', 0), f('P2', 1), f('P3', 2)] },
      { nombre: 'lote-b', filas: [f('N1', 3), f('N2', 4)], requiere: ['lote-a'] },
    ]);
    previo = await leerLoteAprobado('lote-a', j.raiz, j.aprobados);
    nuevo = await leerLoteAprobado('lote-b', j.raiz, j.aprobados);
  });

  const cargarNuevo = (modo: 'ensayo' | 'aplicar') =>
    enlazar(cx, modo, nuevo.lote, { usuario: admin, lote: nuevo.nombre, previos: nuevo.previos });

  it('sin el lote previo cargado, el lote nuevo no se carga', async () => {
    const r = await cargarNuevo('ensayo');
    expect(r).toMatchObject({
      transaccion: 'rollback',
      previos: { 'lote-a': { esperadas: 3, intactasAntes: 0 } },
    });
    expect(r.error).toMatch(/lote-a no está intacto: 0 de 3/);
  });

  it('con el previo intacto: ensayo y carga del nuevo, con el previo intacto antes y después', async () => {
    expect(
      (await enlazar(cx, 'aplicar', previo.lote, { usuario: admin, lote: previo.nombre })).transaccion,
    ).toBe('commit');
    expect((await cargarNuevo('ensayo')).transaccion).toBe('rollback');
    const r = await cargarNuevo('aplicar');
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({
      transaccion: 'commit',
      lote: { nombre: 'lote-b', filas: 2 },
      totales: { alta: 2 },
      previos: { 'lote-a': { esperadas: 3, intactasAntes: 3, intactasDespues: 3 } },
      comercialSinCambios: true,
    });
    cargaNuevo = r.carga_id;
    expect(await filas()).toEqual(['N1', 'N2', 'P1', 'P2', 'P3']);
    const notas = await db.query<{ nota: string }>(
      `select nota from bitacora where tabla = 'producto_codigo_pos' and registro_id = any($1)`,
      [r.idsPropios],
    );
    expect(notas.rows.every((x) => x.nota.startsWith('Lote b SKU, carga'))).toBe(true);
  });

  it('un enlace del lote previo alterado o borrado detiene cualquier ejecución del nuevo', async () => {
    await db.query(`update producto_codigo_pos set evidencia = 'cambiada' where codigo = 'P2'`);
    let r = await cargarNuevo('ensayo');
    expect(r.error).toMatch(/lote-a no está intacto: 2 de 3/);
    await db.query(`update producto_codigo_pos set evidencia = 'API' where codigo = 'P2'`);
    expect((await cargarNuevo('aplicar')).totales['sin cambio']).toBe(2);
    const antes = await filas();
    r = await enlazar(
      {
        ...cx,
        query: async (q, p) => {
          const x = await db.query(q, p);
          // Otra escritura sobre el lote previo dentro de la ejecución: debe detectarse al final.
          if (q.startsWith('update bitacora set nota'))
            await db.query(`delete from producto_codigo_pos where codigo = 'P3'`);
          return x as never;
        },
      },
      'revertir',
      nuevo.lote,
      { usuario: admin, carga: cargaNuevo, lote: nuevo.nombre, previos: nuevo.previos },
    );
    expect(r).toMatchObject({ transaccion: 'rollback' });
    expect(r.error).toMatch(/lote-a cambió durante la ejecución|registros de bitácora/);
    expect(await filas()).toEqual(antes);
  });

  it('revertir el lote nuevo borra solo sus filas y deja el previo intacto', async () => {
    const r = await enlazar(cx, 'revertir', nuevo.lote, {
      usuario: admin,
      carga: cargaNuevo,
      lote: nuevo.nombre,
      previos: nuevo.previos,
    });
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({
      transaccion: 'commit',
      totales: { baja: 2 },
      previos: { 'lote-a': { intactasDespues: 3 } },
    });
    expect(await filas()).toEqual(['P1', 'P2', 'P3']);
  });
});
