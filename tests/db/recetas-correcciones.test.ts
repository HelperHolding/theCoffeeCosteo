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

describe('lote 2 (Urban Chocolate y Cold brew)', () => {
  it('manifiestos reales: Urban Grande vainilla 10 → 0 (v20) y Cold brew café 16.67 → 20 en Chica y Grande (v28)', async () => {
    const u = await leerLoteRecetas('recetario-lote-2-urban');
    expect(u.receta).toEqual({
      id: '2c8b49a6-7b2f-489e-8932-1d1ff8c7754c',
      nombre: 'Urban Chocolate',
      version: 20,
    });
    expect(u.celdas.map((c) => `${c.insumo} ${c.tamano} ${c.previo}→${c.nuevo}`)).toEqual([
      'JARABE DE VANILLA 1 LT (3 PZAS) Grande 10→0',
    ]);
    expect(u.fuente.pagina).toBe(34);
    const c = await leerLoteRecetas('recetario-lote-2-coldbrew');
    expect(c.receta).toEqual({
      id: '00f47aba-88e6-4ebc-a815-5833f8b29871',
      nombre: 'Cold brew',
      version: 28,
    });
    expect(c.celdas.map((x) => `${x.insumo} ${x.tamano} ${x.previo}→${x.nuevo}`)).toEqual([
      'CAFÉ TOSTADO EN GRANO BLACK 1.5 KG Chica 16.67→20',
      'CAFÉ TOSTADO EN GRANO BLACK 1.5 KG Grande 16.67→20',
    ]);
    // Solo el café: las líneas de AGUA quedan fuera de este lote.
    expect(c.celdas.every((x) => !/AGUA/.test(x.insumo))).toBe(true);
  });

  it('un valor que baja a 0 y un valor previo con decimales: aplicar, repetir y revertir', async () => {
    const vainilla = await crearInsumo(db, {
      nombre: 'VAINILLA L2',
      costoPaquete: 690,
      presentacion: 3000,
      unidad: 'ml',
    });
    const cafe = await crearInsumo(db, { nombre: 'CAFE L2', costoPaquete: 750, presentacion: 1500 });
    const receta = await crearProducto(db, { nombre: 'Lote 2 prueba', precios: { Chica: 78, Grande: 88 } });
    const lV = await agregarLinea(db, receta, { insumoId: vainilla, cantidades: { Grande: 10 } });
    const lC = await agregarLinea(db, receta, {
      insumoId: cafe,
      cantidades: { Chica: 16.67, Grande: 16.67 },
    });
    const [chica, grande] = [await idTamano(db, 'Chica'), await idTamano(db, 'Grande')];
    const m: ManifiestoRecetas = {
      lote: 'prueba-l2',
      fuente: { archivo: 'prueba.pdf', sha256: 'x', ficha: 'prueba', pagina: 1 },
      receta: { id: receta, nombre: 'Lote 2 prueba', version: await version(receta) },
      celdas: [
        {
          linea_id: lV,
          insumo_id: vainilla,
          insumo: 'VAINILLA L2',
          tamano_id: grande,
          tamano: 'Grande',
          previo: 10,
          nuevo: 0,
          fuente: 'p',
        },
        {
          linea_id: lC,
          insumo_id: cafe,
          insumo: 'CAFE L2',
          tamano_id: chica,
          tamano: 'Chica',
          previo: 16.67,
          nuevo: 20,
          fuente: 'p',
        },
        {
          linea_id: lC,
          insumo_id: cafe,
          insumo: 'CAFE L2',
          tamano_id: grande,
          tamano: 'Grande',
          previo: 16.67,
          nuevo: 20,
          fuente: 'p',
        },
      ],
      aprobacion: 'prueba',
    };
    const original = await cantidades(receta);
    const ap = await corregir(cx, 'aplicar', m, { usuario: admin });
    expect(ap.error).toBeUndefined();
    expect(ap).toMatchObject({
      transaccion: 'commit',
      totales: { cambiada: 3 },
      bitacoraPropia: 3,
      restoSinCambios: true,
    });
    expect(await cantidades(receta)).toEqual([
      'CAFE L2 Chica=20',
      'CAFE L2 Grande=20',
      'VAINILLA L2 Grande=0',
    ]);
    const rep = await corregir(cx, 'aplicar', m, { usuario: admin });
    expect(rep).toMatchObject({ totales: { 'sin cambio': 3 }, bitacoraPropia: 0 });
    const rv = await corregir(cx, 'revertir', m, { usuario: admin, ejecucion: ap.ejecucion });
    expect(rv).toMatchObject({ transaccion: 'commit', totales: { revertida: 3 } });
    expect(await cantidades(receta)).toEqual(original);
  });
});

describe('lote 3b (agua de Cold brew)', () => {
  const ruta = 'docs/conciliacion-brasil/24-lote-3b-cold-brew-agua.manifiesto.json';
  const texto = () =>
    readFileSync(ruta, 'utf8')
      .replace(/^\uFEFF/, '')
      .replace(/\r\n/g, '\n');

  it('aprobado: Cold brew v30, solo AGUA (concentrado 100/100, dilución 100/150), huella fijada', async () => {
    expect(LOTES_RECETAS_APROBADOS['recetario-lote-3b-coldbrew-agua']).toEqual({
      manifiesto: ruta,
      sha256: createHash('sha256').update(texto()).digest('hex'),
    });
    const m = await leerLoteRecetas('recetario-lote-3b-coldbrew-agua');
    expect(m.receta).toEqual({
      id: '00f47aba-88e6-4ebc-a815-5833f8b29871',
      nombre: 'Cold brew',
      version: 30,
    });
    expect(m.celdas.map((c) => `${c.insumo} ${c.tamano} ${c.previo}→${c.nuevo}`)).toEqual([
      'AGUA Grande 136→100',
      'AGUA Chica 183.333→100',
      'AGUA Grande 233.333→150',
    ]);
    expect(new Set(m.celdas.map((c) => c.insumo_id)).size).toBe(1);
    expect(m.celdas.every((c) => c.insumo === 'AGUA')).toBe(true);
    expect(m.aprobacion).toMatch(
      /únicamente estas tres cantidades de AGUA.*sin modificar café, hielo ni precios/,
    );
  });

  it('con la forma de Cold brew: el agua queda 200/250, el café, el hielo y el costo no cambian, y se revierte exacto', async () => {
    const agua = await crearInsumo(db, { nombre: 'AGUA 3B', costoPaquete: 0, presentacion: 1, unidad: 'ml' });
    const cafe = await crearInsumo(db, { nombre: 'CAFE 3B', costoPaquete: 750, presentacion: 1500 });
    const hielo = await crearInsumo(db, {
      nombre: 'HIELO 3B',
      costoPaquete: 0,
      presentacion: 1,
      unidad: 'ml',
    });
    const receta = await crearProducto(db, { nombre: 'Cold brew 3B', precios: { Chica: 78, Grande: 88 } });
    const concentrado = await agregarLinea(db, receta, {
      insumoId: agua,
      cantidades: { Chica: 100, Grande: 136 },
    });
    await agregarLinea(db, receta, { insumoId: hielo, cantidades: { Chica: 130, Grande: 245 } });
    const dilucion = await agregarLinea(db, receta, {
      insumoId: agua,
      cantidades: { Chica: 183.333, Grande: 233.333 },
    });
    await agregarLinea(db, receta, { insumoId: cafe, cantidades: { Chica: 20, Grande: 20 } });
    const real = JSON.parse(texto()) as ManifiestoRecetas;
    const lineaDe = { [real.celdas[0].linea_id]: concentrado, [real.celdas[1].linea_id]: dilucion };
    const m: ManifiestoRecetas = {
      ...real,
      receta: { id: receta, nombre: 'Cold brew 3B', version: await version(receta) },
      celdas: await Promise.all(
        real.celdas.map(async (c) => ({
          ...c,
          linea_id: lineaDe[c.linea_id],
          insumo_id: agua,
          insumo: 'AGUA 3B',
          tamano_id: await idTamano(db, c.tamano as 'Chica' | 'Grande'),
        })),
      ),
    };
    const costos = async () =>
      (
        await db.query<{ c: string }>(
          `select tamano_id::text || '=' || round(costo, 6)::text as c from v_costo_producto where producto_id = $1 order by 1`,
          [receta],
        )
      ).rows.map((x) => x.c);
    const original = { c: await cantidades(receta), costo: await costos() };
    const ap = await corregir(cx, 'aplicar', m, { usuario: admin });
    expect(ap.error).toBeUndefined();
    expect(ap).toMatchObject({
      transaccion: 'commit',
      totales: { cambiada: 3 },
      bitacoraPropia: 3,
      restoSinCambios: true,
    });
    expect(await cantidades(receta)).toEqual([
      'AGUA 3B Chica=100',
      'AGUA 3B Chica=100',
      'AGUA 3B Grande=100',
      'AGUA 3B Grande=150',
      'CAFE 3B Chica=20',
      'CAFE 3B Grande=20',
      'HIELO 3B Chica=130',
      'HIELO 3B Grande=245',
    ]);
    expect(await costos()).toEqual(original.costo);
    expect((await corregir(cx, 'aplicar', m, { usuario: admin })).totales['sin cambio']).toBe(3);
    const rv = await corregir(cx, 'revertir', m, { usuario: admin, ejecucion: ap.ejecucion });
    expect(rv).toMatchObject({ transaccion: 'commit', totales: { revertida: 3 } });
    expect({ c: await cantidades(receta), costo: await costos() }).toEqual(original);
  });
});

describe('variantes (doc 34: Mug y Félix Schorle)', () => {
  const ruta = (lote: string) => LOTES_RECETAS_APROBADOS[lote].manifiesto;
  const texto = (lote: string) => readFileSync(ruta(lote), 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');

  it('aprobados: una sola celda por receta, de 1 a 0, en la variante que sobra; huellas fijadas', async () => {
    const esperado = {
      'recetas-variantes-mug': {
        receta: { id: 'cef677b4-0976-4640-8bc7-2ce82337466f', nombre: 'Mug', version: 6 },
        celda: 'COFFEE MUG 300 ML BLACK Único 1→0',
      },
      'recetas-variantes-felix': {
        receta: { id: 'fb4ffbc7-8a31-4261-8534-c9885f51fc58', nombre: 'Félix Schorle', version: 7 },
        celda: 'FELIX SCHORLE MARACUYA Único 1→0',
      },
    };
    for (const [lote, e] of Object.entries(esperado)) {
      expect(LOTES_RECETAS_APROBADOS[lote].sha256).toBe(
        createHash('sha256').update(texto(lote)).digest('hex'),
      );
      const m = await leerLoteRecetas(lote);
      expect(m.receta).toEqual(e.receta);
      expect(m.celdas.map((c) => `${c.insumo} ${c.tamano} ${c.previo}→${c.nuevo}`)).toEqual([e.celda]);
      expect(m.aprobacion).toMatch(/NO autoriza aplicar en producción/);
    }
  });

  it('con la forma de Mug: el costo baja de dos tazas a una, repetir no cambia nada y se revierte exacto', async () => {
    const negra = await crearInsumo(db, {
      nombre: 'MUG NEGRA 34',
      costoPaquete: 127,
      presentacion: 1,
      unidad: 'pza',
    });
    const blanca = await crearInsumo(db, {
      nombre: 'MUG BLANCA 34',
      costoPaquete: 127,
      presentacion: 1,
      unidad: 'pza',
    });
    const receta = await crearProducto(db, { nombre: 'Mug 34', precios: { Único: 350 } });
    const lNegra = await agregarLinea(db, receta, { insumoId: negra, cantidades: { Único: 1 } });
    await agregarLinea(db, receta, { insumoId: blanca, cantidades: { Único: 1 } });
    const real = await leerLoteRecetas('recetas-variantes-mug');
    const m: ManifiestoRecetas = {
      ...real,
      receta: { id: receta, nombre: 'Mug 34', version: await version(receta) },
      celdas: [
        {
          ...real.celdas[0],
          linea_id: lNegra,
          insumo_id: negra,
          insumo: 'MUG NEGRA 34',
          tamano_id: await idTamano(db, 'Único'),
        },
      ],
    };
    const costo = async () =>
      Number(
        (
          await db.query<{ c: string }>(`select costo::text c from v_costo_producto where producto_id = $1`, [
            receta,
          ])
        ).rows[0].c,
      );
    const original = { c: await cantidades(receta), costo: await costo() };
    expect(original.costo).toBe(254);
    const ap = await corregir(cx, 'aplicar', m, { usuario: admin });
    expect(ap.error).toBeUndefined();
    expect(ap).toMatchObject({
      transaccion: 'commit',
      totales: { cambiada: 1 },
      bitacoraPropia: 1,
      restoSinCambios: true,
    });
    expect(await cantidades(receta)).toEqual(['MUG BLANCA 34 Único=1', 'MUG NEGRA 34 Único=0']);
    expect(await costo()).toBe(127);
    expect((await corregir(cx, 'aplicar', m, { usuario: admin })).totales['sin cambio']).toBe(1);
    const rv = await corregir(cx, 'revertir', m, { usuario: admin, ejecucion: ap.ejecucion });
    expect(rv).toMatchObject({ transaccion: 'commit', totales: { revertida: 1 } });
    expect({ c: await cantidades(receta), costo: await costo() }).toEqual(original);
  });
});
