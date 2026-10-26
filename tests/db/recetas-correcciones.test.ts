import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import type { Conexion } from '../../scripts/conciliacion/fase4';
import {
  corregir,
  leerLoteRecetas,
  LOTES_RECETAS_APROBADOS,
  type ManifiestoRecetas,
} from '../../scripts/conciliacion/recetas-correcciones';
import { agregarLinea, crearInsumo, crearProducto, idTamano } from './fabricas';
import { crearUsuario } from './utilidades';

// Correcciones dirigidas de cantidades (recetario oficial, doc 21) sobre recetas de prueba con la forma del lote 1.
let db: PGlite;
let cx: Conexion;
let admin: string, compras: string, inactivo: string;
let leche: string,
  creamer: string,
  n = 0;

/** Producto con leche (Chica 30, Grande 55) y creamer (Chica 45, Grande 55), y su manifiesto 30→35, 55→70, 55→50. */
async function caso(): Promise<{ m: ManifiestoRecetas; receta: string }> {
  const nombre = `Frappé prueba ${++n}`;
  const receta = await crearProducto(db, { nombre, precios: { Chica: 99, Grande: 109 } });
  const lLeche = await agregarLinea(db, receta, { insumoId: leche, cantidades: { Chica: 30, Grande: 55 } });
  const lCreamer = await agregarLinea(db, receta, {
    insumoId: creamer,
    cantidades: { Chica: 45, Grande: 55 },
  });
  const [chica, grande] = [await idTamano(db, 'Chica'), await idTamano(db, 'Grande')];
  const version = (await db.query<{ version: number }>(`select version from recetas where id = $1`, [receta]))
    .rows[0].version;
  const celda = (
    linea_id: string,
    insumo_id: string,
    insumo: string,
    tamano_id: string,
    tamano: string,
    previo: number,
    nuevo: number,
  ) => ({
    linea_id,
    insumo_id,
    insumo,
    tamano_id,
    tamano,
    previo,
    nuevo,
    fuente: 'prueba',
  });
  return {
    receta,
    m: {
      lote: 'prueba',
      fuente: { archivo: 'prueba.pdf', sha256: 'x', ficha: 'prueba', pagina: 1 },
      receta: { id: receta, nombre, version },
      celdas: [
        celda(lLeche, leche, 'LECHE', chica, 'Chica', 30, 35),
        celda(lLeche, leche, 'LECHE', grande, 'Grande', 55, 70),
        celda(lCreamer, creamer, 'CREAMER', grande, 'Grande', 55, 50),
      ],
      aprobacion: 'prueba',
    },
  };
}
const cantidades = async (receta: string) =>
  (
    await db.query<{ k: string; c: string }>(
      `select i.nombre || ' ' || t.nombre as k, lc.cantidad::text as c from linea_cantidades lc
         join receta_lineas l on l.id = lc.linea_id join insumos i on i.id = l.insumo_id join tamanos t on t.id = lc.tamano_id
        where l.receta_id = $1 order by 1`,
      [receta],
    )
  ).rows.map((x) => `${x.k}=${Number(x.c)}`);
const version = async (receta: string) =>
  (await db.query<{ v: number }>(`select version as v from recetas where id = $1`, [receta])).rows[0].v;
const bitacora = async () =>
  Number((await db.query<{ n: number }>(`select count(*)::int n from bitacora`)).rows[0].n);
const inyectar = (prefijo: string, sql: string, veces = 1): Conexion => {
  let k = 0;
  return {
    ...cx,
    query: async (q, p) => {
      const r = await db.query(q, p);
      if (q.trimStart().startsWith(prefijo) && k++ < veces) await db.exec(sql);
      return r as never;
    },
  };
};

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
  creamer = await crearInsumo(db, {
    nombre: 'CREAMER',
    costoPaquete: 180.83,
    presentacion: 710,
    unidad: 'ml',
  });
});

describe('manifiesto aprobado', () => {
  it('el lote real: Pumpkin Spice Frappé versión 29, tres celdas exactas', async () => {
    const m = await leerLoteRecetas('recetario-lote-1');
    expect(m.receta).toEqual({
      id: '7769fb2e-d7ac-46b6-abeb-e23634d40bd5',
      nombre: 'Pumpkin Spice Frappé',
      version: 29,
    });
    expect(m.celdas.map((c) => `${c.insumo} ${c.tamano} ${c.previo}→${c.nuevo}`)).toEqual([
      'LECHE ENTERA Chica 30→35',
      'LECHE ENTERA Grande 55→70',
      'CHOBANI D.CREAMER PUMPKIN SPICE Grande 55→50',
    ]);
    expect(m.fuente).toMatchObject({
      pagina: 62,
      sha256: '6a81e1a852cbc8e4ec661e82f573ac6d269d130122d4e3581142771650cc7da3',
    });
  });

  it('un lote no aprobado, un manifiesto alterado o con celdas inválidas se rechaza', async () => {
    await expect(leerLoteRecetas('recetario-lote-9')).rejects.toThrow(/no está aprobado/);
    const raiz = mkdtempSync(join(tmpdir(), 'recetas-'));
    mkdirSync(join(raiz, 'docs/conciliacion-brasil'), { recursive: true });
    const ruta = LOTES_RECETAS_APROBADOS['recetario-lote-1'].manifiesto;
    const original = readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
    writeFileSync(join(raiz, ruta), original.replace('"nuevo": 70', '"nuevo": 75'));
    await expect(leerLoteRecetas('recetario-lote-1', raiz)).rejects.toThrow(/no es el aprobado/);
    const probar = async (cambio: (m: ManifiestoRecetas) => void, error: RegExp) => {
      const m = JSON.parse(original) as ManifiestoRecetas;
      cambio(m);
      const texto = JSON.stringify(m);
      writeFileSync(join(raiz, 'm.json'), texto);
      const aprobados = {
        'recetario-lote-1': {
          manifiesto: 'm.json',
          sha256: createHash('sha256').update(texto).digest('hex'),
        },
      };
      await expect(leerLoteRecetas('recetario-lote-1', raiz, aprobados)).rejects.toThrow(error);
    };
    await probar((m) => (m.celdas[0].nuevo = m.celdas[0].previo), /Valores inválidos/);
    await probar((m) => m.celdas.push({ ...m.celdas[0] }), /Celda repetida/);
    await probar((m) => (m.celdas[1].fuente = ''), /Falta la fuente/);
    await probar((m) => (m.celdas[2].linea_id = 'x'), /Identificadores inválidos/);
  });
});

describe('corrección dirigida', () => {
  it('perfil obligatorio también en el ensayo: falta, sin permiso, inactivo o inexistente no tocan nada', async () => {
    const { m, receta } = await caso();
    const antes = { c: await cantidades(receta), b: await bitacora() };
    expect((await corregir(cx, 'ensayo', m, { usuario: '' })).error).toMatch(/Falta --usuario/);
    for (const u of [compras, inactivo, randomUUID()])
      expect((await corregir(cx, 'aplicar', m, { usuario: u })).error).toMatch(/perfil activo/);
    expect({ c: await cantidades(receta), b: await bitacora() }).toEqual(antes);
  });

  it('el ensayo cambia las tres celdas, verifica versión, bitácora y huellas, y no deja nada', async () => {
    const { m, receta } = await caso();
    const antes = { c: await cantidades(receta), v: await version(receta), b: await bitacora() };
    const r = await corregir(cx, 'ensayo', m, { usuario: admin });
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({
      transaccion: 'rollback',
      totales: { cambiada: 3, problema: 0 },
      bitacoraPropia: 3,
      restoSinCambios: true,
      receta: { versionAntes: antes.v, versionDespues: antes.v + 3 },
    });
    expect({ c: await cantidades(receta), v: await version(receta), b: await bitacora() }).toEqual(antes);
  });

  it('aplicar cambia solo esas celdas, con autoría y una nota por ejecución; repetir no cambia nada', async () => {
    const { m, receta } = await caso();
    const otra = await caso();
    const otraAntes = await cantidades(otra.receta);
    const v0 = await version(receta);
    const r = await corregir(cx, 'aplicar', m, { usuario: admin });
    expect(r.error).toBeUndefined();
    expect(r.transaccion).toBe('commit');
    expect(await cantidades(receta)).toEqual([
      'CREAMER Chica=45',
      'CREAMER Grande=50',
      'LECHE Chica=35',
      'LECHE Grande=70',
    ]);
    expect(await cantidades(otra.receta)).toEqual(otraAntes);
    const b = await db.query<{ campo: string; usuario_id: string; nota: string; receta_id: string }>(
      `select campo, usuario_id, nota, receta_id from bitacora where tabla = 'linea_cantidades' and nota like $1`,
      [`%${r.ejecucion}%`],
    );
    expect(b.rows).toHaveLength(3);
    expect(
      b.rows.every((x) => x.campo === 'cantidad' && x.usuario_id === admin && x.receta_id === receta),
    ).toBe(true);
    expect(
      (await db.query(`select 1 from recetas where id = $1 and updated_by = $2`, [receta, admin])).rows,
    ).toHaveLength(1);
    const antes = { v: await version(receta), b: await bitacora() };
    expect(antes.v).toBe(v0 + 3);
    const otra2 = await corregir(cx, 'aplicar', m, { usuario: admin });
    expect(otra2).toMatchObject({
      transaccion: 'commit',
      totales: { 'sin cambio': 3, cambiada: 0 },
      bitacoraPropia: 0,
    });
    expect({ v: await version(receta), b: await bitacora() }).toEqual(antes);
  });

  it('versión distinta, celda editada o estado parcial: se detiene sin tocar nada', async () => {
    const a = await caso();
    await db.query(`update linea_cantidades set cantidad = 46 where linea_id = $1 and tamano_id = $2`, [
      a.m.celdas[2].linea_id,
      await idTamano(db, 'Chica'),
    ]);
    let r = await corregir(cx, 'aplicar', a.m, { usuario: admin });
    expect(r.error).toMatch(/La receta cambió: versión/);
    const b = await caso();
    await db.query(`update linea_cantidades set cantidad = 31 where linea_id = $1 and tamano_id = $2`, [
      b.m.celdas[0].linea_id,
      b.m.celdas[0].tamano_id,
    ]);
    r = await corregir(
      cx,
      'aplicar',
      { ...b.m, receta: { ...b.m.receta, version: await version(b.receta) } },
      { usuario: admin },
    );
    expect(r.error).toMatch(/no está como declara el manifiesto/);
    expect(r.celdas[0].problemas[0]).toMatch(/valor actual 31, se esperaba 30/);
    const c = await caso();
    await db.query(`update linea_cantidades set cantidad = 35 where linea_id = $1 and tamano_id = $2`, [
      c.m.celdas[0].linea_id,
      c.m.celdas[0].tamano_id,
    ]);
    const antes = await cantidades(c.receta);
    r = await corregir(
      cx,
      'aplicar',
      { ...c.m, receta: { ...c.m.receta, version: await version(c.receta) } },
      { usuario: admin },
    );
    expect(r).toMatchObject({ transaccion: 'rollback' });
    expect(await cantidades(c.receta)).toEqual(antes);
  });

  it('la actividad ajena en la bitácora no se cuenta; un registro propio extra o un cambio de precio abortan', async () => {
    let { m, receta } = await caso();
    const ajena = inyectar(
      'update public.linea_cantidades',
      `insert into bitacora (tabla, registro_id, campo, valor_nuevo, origen, fecha)
       values ('insumos', 'ajeno', 'costo_paquete', '1', 'portal', now() - interval '1 second')`,
    );
    let r = await corregir(ajena, 'ensayo', m, { usuario: admin });
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({ bitacoraPropia: 3, bitacoraAjena: 1 });
    ({ m, receta } = await caso());
    const precio = inyectar(
      'update public.linea_cantidades',
      `update producto_tamanos set precio_lista = precio_lista + 1 where producto_id = '${receta}'`,
    );
    const antes = await cantidades(receta);
    r = await corregir(precio, 'aplicar', m, { usuario: admin });
    expect(r).toMatchObject({ transaccion: 'rollback' });
    expect(r.error).toMatch(/registros de bitácora|fuera de las celdas/);
    expect(await cantidades(receta)).toEqual(antes);
  });

  it('revertir: exige la ejecución, restaura solo lo que cambió y se niega si hubo ediciones posteriores', async () => {
    const { m, receta } = await caso();
    const original = await cantidades(receta);
    const ap = await corregir(cx, 'aplicar', m, { usuario: admin });
    expect(ap.transaccion).toBe('commit');
    expect((await corregir(cx, 'revertir', m, { usuario: admin })).error).toMatch(/--ejecucion/);
    expect((await corregir(cx, 'revertir', m, { usuario: admin, ejecucion: randomUUID() })).error).toMatch(
      /nada que revertir/,
    );
    const rv = await corregir(cx, 'revertir', m, { usuario: admin, ejecucion: ap.ejecucion });
    expect(rv.error).toBeUndefined();
    expect(rv).toMatchObject({
      transaccion: 'commit',
      totales: { revertida: 3 },
      bitacoraPropia: 3,
      restoSinCambios: true,
    });
    expect(await cantidades(receta)).toEqual(original);
    // Revertir otra vez: la propia reversión es un cambio posterior.
    expect((await corregir(cx, 'revertir', m, { usuario: admin, ejecucion: ap.ejecucion })).error).toMatch(
      /posterior/,
    );

    const b = await caso();
    const ap2 = await corregir(cx, 'aplicar', b.m, { usuario: admin });
    await db.query(`update linea_cantidades set cantidad = 44 where linea_id = $1 and tamano_id = $2`, [
      b.m.celdas[2].linea_id,
      await idTamano(db, 'Chica'),
    ]);
    const antes = await cantidades(b.receta);
    const rv2 = await corregir(cx, 'revertir', b.m, { usuario: admin, ejecucion: ap2.ejecucion });
    expect(rv2).toMatchObject({ transaccion: 'rollback' });
    expect(rv2.error).toMatch(/cambio\(s\) posterior/);
    expect(await cantidades(b.receta)).toEqual(antes);
  });

  it('si el COMMIT falla, el informe dice «fallida» y no se confirma nada', async () => {
    const { m, receta } = await caso();
    const antes = await cantidades(receta);
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
    const r = await corregir(falla, 'aplicar', m, { usuario: admin });
    expect(r).toMatchObject({ transaccion: 'fallida', error: expect.stringMatching(/COMMIT falló/) });
    expect(await cantidades(receta)).toEqual(antes);
  });
});
