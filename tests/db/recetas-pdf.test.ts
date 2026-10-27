import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import type { Conexion } from '../../scripts/conciliacion/fase4';
import {
  aplicarLotePdf,
  leerLotePdf,
  LOTES_PDF_APROBADOS,
  validarManifiestoPdf,
  type ManifiestoPdf,
} from '../../scripts/conciliacion/recetas-pdf';
import { agregarLinea, crearInsumo, crearProducto, idTamano } from './fabricas';
import { crearUsuario } from './utilidades';

// Lote del PDF (doc 29): celdas de cantidad y cambio de insumo en una transacción, sin cambiar costos.
let db: PGlite;
let cx: Conexion;
let admin: string, compras: string;
let ids: Record<string, string>;
const SHA = '6a81e1a852cbc8e4ec661e82f573ac6d269d130122d4e3581142771650cc7da3';

/** Las cuatro recetas con la forma real (Fresh Sodas, Cold brew, Iced Chocolate) y un combo que no entra al lote. */
beforeEach(async () => {
  db = await crearDbLocal();
  cx = {
    query: (sql, p) => db.query(sql, p) as never,
    ejecutar: (sql) => db.exec(sql).then(() => undefined),
  };
  [admin, compras] = [await crearUsuario(db, 'admin'), await crearUsuario(db, 'compras')];
  const hielo = await crearInsumo(db, { nombre: 'HIELO', costoPaquete: 0, presentacion: 1, unidad: 'ml' });
  const hieloG = await crearInsumo(db, {
    nombre: 'HIELO (g)',
    costoPaquete: 0,
    presentacion: 1,
    unidad: 'gr',
  });
  const agua = await crearInsumo(db, { nombre: 'AGUA', costoPaquete: 0, presentacion: 1, unidad: 'ml' });
  const tonica = await crearInsumo(db, {
    nombre: 'TÓNICA',
    costoPaquete: 18,
    presentacion: 296,
    unidad: 'ml',
  });
  const leche = await crearInsumo(db, {
    nombre: 'LECHE',
    costoPaquete: 44,
    presentacion: 2000,
    unidad: 'ml',
  });
  const p = { Chica: 70, Grande: 80 };
  const pink = await crearProducto(db, { nombre: 'Fresh Soda Pink Lemonade', precios: p });
  const pas = await crearProducto(db, { nombre: 'Fresh Soda Passion fruit', precios: p });
  const cb = await crearProducto(db, { nombre: 'Cold brew', precios: p });
  const ic = await crearProducto(db, { nombre: 'Iced Chocolate', precios: p });
  const combo = await crearProducto(db, { nombre: 'Double Iced Latte + Banana Cake', precios: p });
  ids = {
    hielo,
    hieloG,
    agua,
    pink,
    pas,
    cb,
    ic,
    combo,
    lPink: await agregarLinea(db, pink, { insumoId: hielo, cantidades: { Chica: 130, Grande: 190 } }),
    lPas: await agregarLinea(db, pas, { insumoId: hielo, cantidades: { Chica: 130, Grande: 177 } }),
    lCb: await agregarLinea(db, cb, { insumoId: hielo, cantidades: { Chica: 130, Grande: 245 } }),
    lAgua: await agregarLinea(db, ic, { insumoId: agua, cantidades: { Chica: 10, Grande: 10 } }),
    lCombo: await agregarLinea(db, combo, { insumoId: hielo, cantidades: { Chica: 130, Grande: 245 } }),
    chica: await idTamano(db, 'Chica'),
    grande: await idTamano(db, 'Grande'),
  };
  await agregarLinea(db, pink, { insumoId: tonica, cantidades: { Chica: 170, Grande: 232 } });
  await agregarLinea(db, cb, { insumoId: agua, cantidades: { Chica: 100, Grande: 150 } });
  await agregarLinea(db, ic, { insumoId: hieloG, cantidades: { Chica: 130, Grande: 245 } });
  await agregarLinea(db, ic, { insumoId: leche, cantidades: { Chica: 170, Grande: 290 } });
});

const version = async (r: string) =>
  Number((await db.query<{ v: number }>(`select version as v from recetas where id = $1`, [r])).rows[0].v);
const insumo = (id: string, nombre: string, unidad: 'gr' | 'ml') => ({
  id,
  nombre,
  unidad,
  costo_paquete: 0,
  presentacion: 1,
});
/** Manifiesto con la forma del lote real, construido sobre la base de prueba. */
const manifiesto = async (cambiar: (m: ManifiestoPdf) => void = () => {}): Promise<ManifiestoPdf> => {
  const t = (tamano: 'Chica' | 'Grande') => ids[tamano === 'Chica' ? 'chica' : 'grande'];
  const celda = (
    receta: string,
    linea: string,
    ins: string,
    nombre: string,
    tamano: 'Chica' | 'Grande',
    previo: number,
    nuevo: number,
  ) => ({
    receta_id: receta,
    linea_id: linea,
    insumo_id: ins,
    insumo: nombre,
    tamano_id: t(tamano),
    tamano,
    previo,
    nuevo,
    fuente: 'PDF (prueba)',
  });
  const cambio = (receta: string, linea: string) => ({
    receta_id: receta,
    linea_id: linea,
    desde_id: ids.hielo,
    desde: 'HIELO',
    hacia_id: ids.hieloG,
    hacia: 'HIELO (g)',
    cantidades: [
      { tamano_id: ids.chica, tamano: 'Chica', cantidad: 130 },
      { tamano_id: ids.grande, tamano: 'Grande', cantidad: 245 },
    ],
    fuente: 'PDF (prueba)',
  });
  const m: ManifiestoPdf = {
    lote: 'prueba',
    fuente: { archivo: 'prueba.pdf', sha256: SHA },
    insumos: [
      insumo(ids.hielo, 'HIELO', 'ml'),
      insumo(ids.hieloG, 'HIELO (g)', 'gr'),
      insumo(ids.agua, 'AGUA', 'ml'),
    ],
    recetas: [
      { id: ids.pink, nombre: 'Fresh Soda Pink Lemonade', version: await version(ids.pink), pagina: 43 },
      { id: ids.pas, nombre: 'Fresh Soda Passion fruit', version: await version(ids.pas), pagina: 44 },
      { id: ids.cb, nombre: 'Cold brew', version: await version(ids.cb), pagina: 27 },
      { id: ids.ic, nombre: 'Iced Chocolate', version: await version(ids.ic), pagina: 24 },
    ],
    celdas: [
      celda(ids.pink, ids.lPink, ids.hielo, 'HIELO', 'Grande', 190, 245),
      celda(ids.pas, ids.lPas, ids.hielo, 'HIELO', 'Grande', 177, 245),
      celda(ids.ic, ids.lAgua, ids.agua, 'AGUA', 'Chica', 10, 0),
      celda(ids.ic, ids.lAgua, ids.agua, 'AGUA', 'Grande', 10, 0),
    ],
    cambiosInsumo: [cambio(ids.pink, ids.lPink), cambio(ids.pas, ids.lPas), cambio(ids.cb, ids.lCb)],
    aprobacion: 'prueba',
  };
  cambiar(m);
  return m;
};
const lineas = async () =>
  (
    await db.query<{ receta: string; insumo: string; c: string }>(
      `select r.nombre as receta, i.nombre as insumo,
              string_agg(t.nombre || '=' || lc.cantidad::float8, ',' order by t.orden) as c
         from receta_lineas l join recetas r on r.id = l.receta_id join insumos i on i.id = l.insumo_id
         join linea_cantidades lc on lc.linea_id = l.id join tamanos t on t.id = lc.tamano_id
        group by l.id, r.nombre, i.nombre order by 1, 2, 3`,
    )
  ).rows.map((x) => `${x.receta} · ${x.insumo} · ${x.c}`);
const estado = async () => ({
  lineas: await lineas(),
  costos: (await db.query(`select producto_id, tamano_id, costo::text from v_costo_producto order by 1, 2`))
    .rows,
  bitacora: (await db.query<{ n: number }>(`select count(*)::int n from bitacora`)).rows[0].n,
});

describe('manifiesto', () => {
  it('el lote real: 4 recetas, 4 celdas y 3 cambios de insumo; solo HIELO, HIELO (g) y AGUA; nada más', async () => {
    const m = await leerLotePdf('recetario-pdf-lote-1');
    expect(m.fuente.sha256).toBe(SHA);
    expect(m.recetas.map((r) => `${r.nombre} v${r.version} p.${r.pagina}`)).toEqual([
      'Fresh Soda Pink Lemonade v28 p.43',
      'Fresh Soda Passion fruit v25 p.44',
      'Cold brew v33 p.27',
      'Iced Chocolate v32 p.24',
    ]);
    expect(m.insumos.map((i) => `${i.nombre} ${i.unidad} ${i.costo_paquete}/${i.presentacion}`)).toEqual([
      'HIELO ml 0/1',
      'HIELO (g) gr 0/1',
      'AGUA ml 0/1',
    ]);
    expect(m.celdas.map((c) => `${c.insumo} ${c.tamano} ${c.previo}→${c.nuevo}`)).toEqual([
      'HIELO Grande 190→245',
      'HIELO Grande 177→245',
      'AGUA Chica 10→0',
      'AGUA Grande 10→0',
    ]);
    // Cold brew solo cambia de insumo: sin celdas y con los mismos 130/245; las Chicas de las Fresh Sodas no se tocan.
    expect(
      m.celdas.some((c) => c.receta_id === m.recetas[2].id || (c.tamano === 'Chica' && c.insumo === 'HIELO')),
    ).toBe(false);
    for (const c of m.cambiosInsumo) {
      expect(`${c.desde} → ${c.hacia}`).toBe('HIELO → HIELO (g)');
      expect(c.cantidades.map((x) => `${x.tamano}=${x.cantidad}`)).toEqual(['Chica=130', 'Grande=245']);
    }
    expect(m.aprobacion).toMatch(/NO autoriza ensayo remoto, aplicar en producción ni merge/);
    expect(Object.keys(LOTES_PDF_APROBADOS)).toEqual(['recetario-pdf-lote-1']);
  });

  it('se rechazan manifiestos que cambiarían costos o no son coherentes', async () => {
    const base = await manifiesto();
    expect(() => validarManifiestoPdf(base)).not.toThrow();
    const mal = async (f: (m: ManifiestoPdf) => void, error: RegExp) => {
      const m = await manifiesto(f);
      expect(() => validarManifiestoPdf(m)).toThrow(error);
    };
    await mal((m) => (m.insumos[1].costo_paquete = 5), /costo unitario distinto/);
    await mal((m) => (m.cambiosInsumo[0].cantidades[1].cantidad = 190), /no coinciden con la celda/);
    await mal((m) => (m.celdas[0].nuevo = 190), /Valores inválidos/);
    await mal(
      (m) => m.recetas.push({ id: ids.combo, nombre: 'Combo', version: 1, pagina: 1 }),
      /no tiene cambios/,
    );
    await mal((m) => (m.celdas[2].insumo_id = ids.combo), /no está declarado/);
    await mal((m) => (m.celdas[0].fuente = ' '), /Falta la fuente/);
    await mal((m) => (m.recetas[0].pagina = 0), /página/);
  });

  it('leerLotePdf exige la huella aprobada', async () => {
    const raiz = mkdtempSync(join(tmpdir(), 'pdf-'));
    const texto = readFileSync('docs/conciliacion-brasil/29-recetario-pdf-lote-1.manifiesto.json', 'utf8');
    writeFileSync(join(raiz, 'm.json'), texto.replace('"Grande"', '"Grande "'));
    const sha = createHash('sha256').update(texto.replace(/\r\n/g, '\n')).digest('hex');
    await expect(leerLotePdf('x', raiz, { x: { manifiesto: 'm.json', sha256: sha } })).rejects.toThrow(
      /no es el aprobado/,
    );
    await expect(leerLotePdf('otro')).rejects.toThrow(/no está aprobado/);
  });
});

describe('ejecución', () => {
  it('perfil obligatorio también en el ensayo', async () => {
    const m = await manifiesto();
    expect((await aplicarLotePdf(cx, 'ensayo', m, { usuario: '' })).error).toMatch(/Falta --usuario/);
    const i = await aplicarLotePdf(cx, 'ensayo', m, { usuario: compras });
    expect(i.error).toMatch(/operaciones o admin/);
    expect(i.transaccion).toBe('rollback');
  });

  it('el ensayo hace los 7 cambios con su bitácora, costos idénticos, y no deja nada', async () => {
    const antes = await estado();
    const i = await aplicarLotePdf(cx, 'ensayo', await manifiesto(), { usuario: admin });
    expect(i.error).toBeUndefined();
    expect(i.totales).toEqual({ cambiada: 7, 'sin cambio': 0, revertida: 0, problema: 0 });
    expect([i.bitacoraPropia, i.bitacoraAjena, i.costosSinCambios, i.restoSinCambios]).toEqual([
      7,
      0,
      true,
      true,
    ]);
    expect(i.transaccion).toBe('rollback');
    expect(await estado()).toEqual(antes);
  });

  it('aplicar: estado final, auditoría por celda y línea, versiones; el combo no cambia; repetir no cambia nada', async () => {
    const costos = (await estado()).costos;
    const v = {
      pink: await version(ids.pink),
      pas: await version(ids.pas),
      cb: await version(ids.cb),
      ic: await version(ids.ic),
    };
    const m = await manifiesto();
    const i = await aplicarLotePdf(cx, 'aplicar', m, { usuario: admin });
    expect(i.error).toBeUndefined();
    expect(i.transaccion).toBe('commit');
    expect(await lineas()).toEqual([
      'Cold brew · AGUA · Chica=100,Grande=150',
      'Cold brew · HIELO (g) · Chica=130,Grande=245',
      'Double Iced Latte + Banana Cake · HIELO · Chica=130,Grande=245',
      'Fresh Soda Passion fruit · HIELO (g) · Chica=130,Grande=245',
      'Fresh Soda Pink Lemonade · HIELO (g) · Chica=130,Grande=245',
      'Fresh Soda Pink Lemonade · TÓNICA · Chica=170,Grande=232',
      'Iced Chocolate · AGUA · Chica=0,Grande=0',
      'Iced Chocolate · HIELO (g) · Chica=130,Grande=245',
      'Iced Chocolate · LECHE · Chica=170,Grande=290',
    ]);
    expect((await estado()).costos).toEqual(costos);
    expect(i.versiones).toEqual({
      'Fresh Soda Pink Lemonade': { esperada: v.pink, antes: v.pink, despues: v.pink + 2 },
      'Fresh Soda Passion fruit': { esperada: v.pas, antes: v.pas, despues: v.pas + 2 },
      'Cold brew': { esperada: v.cb, antes: v.cb, despues: v.cb + 1 },
      'Iced Chocolate': { esperada: v.ic, antes: v.ic, despues: v.ic + 2 },
    });
    const b = (
      await db.query<{ tabla: string; campo: string; origen: string; usuario_id: string; nota: string }>(
        `select tabla, campo, origen, usuario_id, nota from bitacora where nota like 'prueba, ejecución%' order by id`,
      )
    ).rows;
    expect(b.map((x) => `${x.tabla}.${x.campo}`)).toEqual([
      ...Array(4).fill('linea_cantidades.cantidad'),
      ...Array(3).fill('receta_lineas.insumo_id'),
    ]);
    expect(new Set(b.map((x) => `${x.origen} ${x.usuario_id === admin} ${x.nota}`))).toEqual(
      new Set([`carga_masiva true prueba, ejecución ${i.ejecucion} (docs/conciliacion-brasil/29)`]),
    );
    const otra = await aplicarLotePdf(cx, 'aplicar', m, { usuario: admin });
    expect(otra.error).toBeUndefined();
    expect(otra.totales['sin cambio']).toBe(7);
    expect(otra.bitacoraPropia).toBe(0);
  });

  it('bloqueo optimista: versión distinta, valor previo distinto u otro insumo detienen todo', async () => {
    const antes = await estado();
    const vieja = await aplicarLotePdf(cx, 'aplicar', await manifiesto((m) => (m.recetas[3].version -= 1)), {
      usuario: admin,
    });
    expect(vieja.error).toMatch(/Iced Chocolate: versión/);
    await db.query(`update linea_cantidades set cantidad = 200 where linea_id = $1 and tamano_id = $2`, [
      ids.lPink,
      ids.grande,
    ]);
    const previo = await aplicarLotePdf(cx, 'aplicar', await manifiesto(), { usuario: admin });
    expect(previo.error).toMatch(/no está como declara/);
    expect(previo.cambios[0].problemas.join()).toMatch(/valor actual 200, se esperaba 190/);
    await db.query(`update linea_cantidades set cantidad = 190 where linea_id = $1 and tamano_id = $2`, [
      ids.lPink,
      ids.grande,
    ]);
    // Un estado mezclado (una parte ya aplicada) tampoco se completa a medias.
    await db.query(`update receta_lineas set insumo_id = $1 where id = $2`, [ids.hieloG, ids.lCb]);
    const mezcla = await aplicarLotePdf(cx, 'aplicar', await manifiesto(), { usuario: admin });
    expect(mezcla.error).toMatch(/no está como declara/);
    await db.query(`update receta_lineas set insumo_id = $1 where id = $2`, [ids.hielo, ids.lCb]);
    expect((await estado()).lineas).toEqual(antes.lineas);
  });

  it('no cambia costos de compra: un insumo distinto al declarado o un costo que el lote alteraría detienen todo', async () => {
    await db.query(`update insumos set costo_paquete = 1 where id = $1`, [ids.hielo]);
    const declarado = await aplicarLotePdf(cx, 'aplicar', await manifiesto(), { usuario: admin });
    expect(declarado.error).toMatch(/HIELO no está como declara el manifiesto/);
    // Aunque el manifiesto declarara ese costo, el cambio de cantidad cambiaría el costo del producto: se detiene.
    await db.query(`update insumos set costo_paquete = 1 where id = $1`, [ids.hieloG]);
    const conCosto = await aplicarLotePdf(
      cx,
      'aplicar',
      await manifiesto((m) => (m.insumos[0].costo_paquete = m.insumos[1].costo_paquete = 1)),
      { usuario: admin },
    );
    expect(conCosto.error).toMatch(/Cambió el costo/);
    expect(conCosto.transaccion).toBe('rollback');
  });

  it('revertir: exige la ejecución, restaura exacto y se niega si hubo ediciones posteriores', async () => {
    const antes = await estado();
    const m = await manifiesto();
    const ap = await aplicarLotePdf(cx, 'aplicar', m, { usuario: admin });
    expect(ap.error).toBeUndefined();
    expect((await aplicarLotePdf(cx, 'revertir', m, { usuario: admin })).error).toMatch(/exige --ejecucion/);
    const rv = await aplicarLotePdf(cx, 'revertir', m, { usuario: admin, ejecucion: ap.ejecucion });
    expect(rv.error).toBeUndefined();
    expect(rv.totales.revertida).toBe(7);
    expect((await estado()).lineas).toEqual(antes.lineas);
    expect((await estado()).costos).toEqual(antes.costos);
    // Segunda aplicación y una edición posterior de una receta del lote: ya no se revierte.
    const m2 = await manifiesto();
    const ap2 = await aplicarLotePdf(cx, 'aplicar', m2, { usuario: admin });
    expect(ap2.error).toBeUndefined();
    await db.query(`set app.origen = 'portal'`);
    await db.query(
      `update linea_cantidades set cantidad = 171 where linea_id in (select id from receta_lineas where receta_id = $1)
                     and cantidad = 170`,
      [ids.ic],
    );
    const tarde = await aplicarLotePdf(cx, 'revertir', m2, { usuario: admin, ejecucion: ap2.ejecucion });
    expect(tarde.error).toMatch(/posterior/);
  });
});
