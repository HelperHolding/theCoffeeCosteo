import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import type { Conexion } from '../../scripts/conciliacion/fase4';
import {
  aplicarAjustes,
  leerLoteAjustes,
  LOTES_AJUSTES_APROBADOS,
  validarManifiestoAjustes,
  type ManifiestoAjustes,
} from '../../scripts/conciliacion/recetas-ajustes';
import { agregarLinea, crearInsumo, crearProducto } from './fabricas';
import { crearUsuario } from './utilidades';

// Ajustes de recetas y costos (doc 40): cantidades, cambio de insumo con otro costo, líneas nuevas y costo de insumo,
// con los costos de producto que cambian declarados uno por uno.
let db: PGlite;
let cx: Conexion;
let admin: string, operaciones: string, compras: string;
let ids: Record<string, string>;

beforeEach(async () => {
  db = await crearDbLocal();
  cx = {
    query: (sql, p) => db.query(sql, p) as never,
    ejecutar: (sql) => db.exec(sql).then(() => undefined),
  };
  [admin, operaciones, compras] = [
    await crearUsuario(db, 'admin'),
    await crearUsuario(db, 'operaciones'),
    await crearUsuario(db, 'compras'),
  ];
  const cafe = await crearInsumo(db, { nombre: 'CAFÉ', costoPaquete: 600, presentacion: 1500, unidad: 'gr' });
  const jarabe = await crearInsumo(db, {
    nombre: 'JARABE DE CARAMELO',
    costoPaquete: 690,
    presentacion: 3000,
    unidad: 'ml',
  });
  const salsa = await crearInsumo(db, {
    nombre: 'SALSA DE CARAMELO',
    costoPaquete: 725,
    presentacion: 4000,
    unidad: 'ml',
  });
  const cookie = await crearInsumo(db, {
    nombre: 'COOKIE',
    costoPaquete: 22.49,
    presentacion: 1,
    unidad: 'pza',
  });
  const p = { Chica: 70, Grande: 80 };
  const sc = await crearProducto(db, { nombre: 'Salted Caramel', precios: p });
  const frap = await crearProducto(db, { nombre: 'Salted Caramel Frap', precios: p });
  const galleta = await crearProducto(db, { nombre: 'Cookie Triple Chocolate', precios: { Único: 45 } });
  const otro = await crearProducto(db, { nombre: 'Americano', precios: p });
  await agregarLinea(db, sc, { insumoId: cafe, cantidades: { Chica: 18, Grande: 18 } });
  await agregarLinea(db, sc, { insumoId: jarabe, cantidades: { Chica: 5, Grande: 5 } });
  await agregarLinea(db, frap, { insumoId: salsa, cantidades: { Chica: 5, Grande: 5 } });
  await agregarLinea(db, galleta, { insumoId: cookie, cantidades: { Único: 1 } });
  await agregarLinea(db, otro, { insumoId: cafe, cantidades: { Chica: 18, Grande: 18 } });
  ids = { sc, frap, galleta, otro, cookie };
});

const version = async (r: string) =>
  Number((await db.query<{ v: number }>(`select version as v from recetas where id = $1`, [r])).rows[0].v);
const manifiesto = async (cambiar: (m: ManifiestoAjustes) => void = () => {}): Promise<ManifiestoAjustes> => {
  const m: ManifiestoAjustes = {
    lote: 'prueba',
    fuente: { archivo: 'Costeo_TheCoffee.xlsx', sha256: 'a'.repeat(64) },
    costosInsumo: [{ insumo: 'COOKIE', previo: 22.49, nuevo: 24.5, origen: 'Excel' }],
    recetas: [
      {
        nombre: 'Salted Caramel',
        version: await version(ids.sc),
        cambiosInsumo: [{ desde: 'JARABE DE CARAMELO', hacia: 'SALSA DE CARAMELO', origen: 'Excel' }],
        celdas: [
          { componente: 'CAFÉ', tipo: 'insumo', tamano: 'Chica', previo: 18, nuevo: 20, origen: 'Excel' },
        ],
      },
      {
        nombre: 'Salted Caramel Frap',
        version: await version(ids.frap),
        lineasNuevas: [
          {
            componente: 'JARABE DE CARAMELO',
            tipo: 'insumo',
            cantidades: { Chica: 5, Grande: 5 },
            origen: 'Excel',
          },
        ],
      },
    ],
    costos: [
      { producto: 'Salted Caramel', tamano: 'Chica', previo: 8.35, nuevo: 8.90625 },
      { producto: 'Salted Caramel', tamano: 'Grande', previo: 8.35, nuevo: 8.10625 },
      { producto: 'Salted Caramel Frap', tamano: 'Chica', previo: 0.90625, nuevo: 2.05625 },
      { producto: 'Salted Caramel Frap', tamano: 'Grande', previo: 0.90625, nuevo: 2.05625 },
      { producto: 'Cookie Triple Chocolate', tamano: 'Único', previo: 22.49, nuevo: 24.5 },
    ],
    aprobacion: 'prueba',
  };
  cambiar(m);
  return m;
};
const estado = async () => ({
  lineas: (
    await db.query<{ x: string }>(
      `select r.nombre || ' · ' || coalesce(i.nombre, '') || ' · ' || string_agg(t.nombre || '=' || lc.cantidad::float8, ',' order by t.orden) as x
         from receta_lineas l join recetas r on r.id = l.receta_id left join insumos i on i.id = l.insumo_id
         join linea_cantidades lc on lc.linea_id = l.id join tamanos t on t.id = lc.tamano_id
        group by l.id, r.nombre, i.nombre`,
    )
  ).rows
    .map((r) => r.x)
    .sort(),
  costos: (
    await db.query(
      `select producto_id, tamano_id, round(costo, 6)::text as c from v_costo_producto order by 1, 2`,
    )
  ).rows,
  insumos: (await db.query(`select nombre, costo_paquete::text from insumos order by 1`)).rows,
});

describe('manifiesto', () => {
  it('valida cambios, costos declarados y orígenes', async () => {
    expect(() => validarManifiestoAjustes({ ...({} as ManifiestoAjustes) })).toThrow(/lote/);
    const mal = async (f: (m: ManifiestoAjustes) => void, error: RegExp) =>
      expect(() => validarManifiestoAjustes(manifiestoSync(f))).toThrow(error);
    let base: ManifiestoAjustes;
    const manifiestoSync = (f: (m: ManifiestoAjustes) => void) => {
      const m = structuredClone(base);
      f(m);
      return m;
    };
    base = await manifiesto();
    expect(() => validarManifiestoAjustes(base)).not.toThrow();
    await mal((m) => (m.recetas![0].celdas![0].nuevo = 18), /valores inválidos/);
    await mal((m) => m.recetas!.push({ nombre: 'Americano', version: 1 }), /no tiene cambios/);
    await mal((m) => (m.recetas![1].lineasNuevas![0].cantidades = { Chica: 0 }), /cantidades inválidas/);
    await mal((m) => m.recetas![0].celdas!.push({ ...m.recetas![0].celdas![0] }), /celda repetida/);
    await mal((m) => (m.costos[0].nuevo = 8.35), /costos previo y nuevo/);
    await mal((m) => (m.costosInsumo![0].origen = ' '), /falta el origen/);
    await mal((m) => (m.recetas![0].cambiosInsumo![0].hacia = 'CAFÉ'), /más de un cambio/);
  });

  it('el lote real (doc 40): 10 recetas, el costo de la Cookie Triple Chocolate y 14 costos que cambian', async () => {
    const m = await leerLoteAjustes('recetas-excel-lote-1');
    expect(Object.keys(LOTES_AJUSTES_APROBADOS)).toEqual(['recetas-excel-lote-1']);
    expect(m.costosInsumo!.map((c) => `${c.insumo} ${c.previo}→${c.nuevo}`)).toEqual([
      'COOKIE FULLY BAKED TRIPLE CHOCOLATE 22.49→24.5',
    ]);
    const cambios = m.recetas!.flatMap((r) => [
      ...(r.celdas ?? []).map((c) => `${r.nombre} · ${c.componente} ${c.tamano} ${c.previo}→${c.nuevo}`),
      ...(r.lineasNuevas ?? []).map((l) => `${r.nombre} · + ${l.componente} ${JSON.stringify(l.cantidades)}`),
      ...(r.cambiosInsumo ?? []).map((c) => `${r.nombre} · ${c.desde} → ${c.hacia}`),
    ]);
    expect(cambios).toEqual([
      'Iced Latte + Ham & Cheese Sandwich · PECHUGA DE PAVO Único 40→30',
      'Iced Latte + Ham & Cheese Sandwich · QUESO CREMA PHILADELPHIA Único 10→30',
      'Iced Latte + Ham & Cheese Sandwich · QUESO MOZARELLA Único 20→40',
      'True White + Grilled Ham & Cheese Sandwich · PECHUGA DE PAVO Único 40→30',
      'True White + Grilled Ham & Cheese Sandwich · QUESO CREMA PHILADELPHIA Único 10→30',
      'True White + Grilled Ham & Cheese Sandwich · QUESO MOZARELLA Único 20→40',
      'Misto + Tomate Cereja · PECHUGA DE PAVO Único 40→30',
      'Misto + Tomate Cereja · QUESO CREMA PHILADELPHIA Único 10→20',
      'Iced Blueberry Matcha · JARABE DE BLUEBERRY 1 LITRO ( 1 PIEZA) Chica 15→10',
      'Iced Blueberry Matcha · JARABE DE BLUEBERRY 1 LITRO ( 1 PIEZA) Grande 15→10',
      'Matcha Iced Mint · Mix MATCHA GOURMET ORGÁNICO 1 KG Grande 45.021012→36.046693',
      'Fresh Soda Pink Lemonade · SCHWEPPES AGUA TÓNICA 296 ML Grande 232→220',
      'Fresh Soda Pink Lemonade · FRESA NATURAL CONGELADA 2 KG Grande 41→40',
      'Fresh Soda Passion fruit · PULPA DE MARACUYÁ 500 ML Grande 82→70',
      'Fresh Soda Passion fruit · SCHWEPPES AGUA TÓNICA 296 ML Grande 232→220',
      'Salted Caramel · JARABE DE CARAMELO 1 LT (3 PZAS) → SALSA DE CARAMELO BOTE 4 LTS',
      'Salted Caramel Frap · + JARABE DE CARAMELO 1 LT (3 PZAS) {"Chica":5,"Grande":5}',
      'Macchiato · + VASO ESPRESSO PAPEL KRAFT 4 OZ (500 PZS) {"Único":1}',
    ]);
    // Empaques (salvo el vaso del Macchiato), agua, hielo y los casos que Carlo dejó como en la base no se tocan.
    expect(cambios.join(' | ')).not.toMatch(/TAPA|HIELO|AGUA ·|JAMON SERRANO|WHITE MERCH|PAN DE MUERTO/);
    expect(m.costos).toHaveLength(14);
    expect(m.aprobacion).toMatch(/No hagas merge todavía/);
  });

  it('leerLoteAjustes exige la huella aprobada', async () => {
    const raiz = mkdtempSync(join(tmpdir(), 'ajustes-'));
    const texto = JSON.stringify({ ...(await manifiesto()), lote: 'x' }, null, 1) + '\n';
    writeFileSync(join(raiz, 'm.json'), texto);
    const sha = createHash('sha256').update(texto).digest('hex');
    expect(
      (await leerLoteAjustes('x', raiz, { x: { manifiesto: 'm.json', sha256: sha } })).recetas,
    ).toHaveLength(2);
    await expect(
      leerLoteAjustes('x', raiz, { x: { manifiesto: 'm.json', sha256: 'b'.repeat(64) } }),
    ).rejects.toThrow(/no es el aprobado/);
    await expect(leerLoteAjustes('otro')).rejects.toThrow(/no está aprobado/);
  });
});

describe('ejecución', () => {
  it('perfil: recetas y costos juntos exigen admin', async () => {
    const m = await manifiesto();
    expect((await aplicarAjustes(cx, 'ensayo', m, { usuario: '' })).error).toMatch(/Falta --usuario/);
    expect((await aplicarAjustes(cx, 'ensayo', m, { usuario: operaciones })).error).toMatch(/admin/);
    expect((await aplicarAjustes(cx, 'ensayo', m, { usuario: compras })).error).toMatch(/admin/);
    const soloRecetas = await manifiesto((x) => {
      delete x.costosInsumo;
      x.costos = x.costos.filter((c) => c.producto !== 'Cookie Triple Chocolate');
    });
    expect((await aplicarAjustes(cx, 'ensayo', soloRecetas, { usuario: operaciones })).error).toBeUndefined();
  });

  it('el ensayo hace los cambios con su bitácora y costos, y no deja nada', async () => {
    const antes = await estado();
    const i = await aplicarAjustes(cx, 'ensayo', await manifiesto(), { usuario: admin });
    expect(i.error).toBeUndefined();
    expect(i.totales).toEqual({ cambiada: 3, 'sin cambio': 0, revertida: 0, problema: 0 });
    // 1 costo + 1 cambio de insumo + 1 cantidad + (1 línea + 2 cantidades)
    expect([i.bitacoraPropia, i.bitacoraAjena, i.costosCompletos, i.restoSinCambios]).toEqual([
      6,
      0,
      true,
      true,
    ]);
    expect(i.costos.map((c) => `${c.producto} ${c.tamano} ${c.antes}→${c.despues}`)).toEqual([
      'Salted Caramel Chica 8.35→8.90625',
      'Salted Caramel Grande 8.35→8.10625',
      'Salted Caramel Frap Chica 0.90625→2.05625',
      'Salted Caramel Frap Grande 0.90625→2.05625',
      'Cookie Triple Chocolate Único 22.49→24.5',
    ]);
    expect(i.transaccion).toBe('rollback');
    expect(await estado()).toEqual(antes);
  });

  it('aplicar, repetir sin cambio y revertir a lo previo', async () => {
    const antes = await estado();
    const a = await aplicarAjustes(cx, 'aplicar', await manifiesto(), { usuario: admin });
    expect([a.error, a.transaccion]).toEqual([undefined, 'commit']);
    const despues = await estado();
    expect(despues.lineas).toEqual([
      'Americano · CAFÉ · Chica=18,Grande=18',
      'Cookie Triple Chocolate · COOKIE · Único=1',
      'Salted Caramel Frap · JARABE DE CARAMELO · Chica=5,Grande=5',
      'Salted Caramel Frap · SALSA DE CARAMELO · Chica=5,Grande=5',
      'Salted Caramel · CAFÉ · Chica=20,Grande=18',
      'Salted Caramel · SALSA DE CARAMELO · Chica=5,Grande=5',
    ]);
    const notas = (
      await db.query<{ n: string }>(`select distinct nota as n from bitacora where nota like 'prueba,%'`)
    ).rows;
    expect(notas).toEqual([{ n: `prueba, ejecución ${a.ejecucion} (docs/conciliacion-brasil/40)` }]);
    // El manifiesto conserva las versiones previas: repetir solo cuadra porque todo ya está en el estado nuevo.
    const r = await aplicarAjustes(cx, 'aplicar', await manifiesto(), { usuario: admin });
    expect([r.error, r.totales['sin cambio'], r.bitacoraPropia]).toEqual([undefined, 3, 0]);
    expect(await estado()).toEqual(despues);
    const v = await aplicarAjustes(cx, 'revertir', await manifiesto(), {
      usuario: admin,
      ejecucion: a.ejecucion,
    });
    expect([v.error, v.transaccion, v.totales.revertida, v.bitacoraPropia]).toEqual([
      undefined,
      'commit',
      3,
      6,
    ]);
    expect(await estado()).toEqual(antes);
  });

  it('revertir se niega si hubo cambios posteriores', async () => {
    const a = await aplicarAjustes(cx, 'aplicar', await manifiesto(), { usuario: admin });
    // Una edición posterior fuera de lo declarado (CAFÉ Grande del Salted Caramel), con su registro en la bitácora.
    await db.query(
      `update linea_cantidades set cantidad = 17 where cantidad = 18 and linea_id in
         (select l.id from receta_lineas l join insumos i on i.id = l.insumo_id where l.receta_id = $1 and i.nombre = 'CAFÉ')`,
      [ids.sc],
    );
    const v = await aplicarAjustes(cx, 'revertir', await manifiesto(), {
      usuario: admin,
      ejecucion: a.ejecucion,
    });
    expect(v.error).toMatch(/1 cambio\(s\) posterior\(es\)/);
    expect(v.transaccion).toBe('rollback');
    // Si lo declarado ya no está en el estado nuevo, tampoco.
    await db.exec(`update linea_cantidades set cantidad = 19 where cantidad = 20`);
    const w = await aplicarAjustes(cx, 'revertir', await manifiesto(), {
      usuario: admin,
      ejecucion: a.ejecucion,
    });
    expect(w.error).toMatch(/ni el previo ni el nuevo/);
  });

  it('un costo que cambia sin estar declarado detiene todo', async () => {
    const antes = await estado();
    await db.query(
      `insert into receta_lineas (receta_id, insumo_id) select $1, id from insumos where nombre = 'COOKIE'`,
      [ids.otro],
    );
    await db.query(
      `insert into linea_cantidades (linea_id, tamano_id, cantidad)
       select l.id, t.id, 1 from receta_lineas l join insumos i on i.id = l.insumo_id, tamanos t
        where l.receta_id = $1 and i.nombre = 'COOKIE' and t.nombre in ('Chica', 'Grande')`,
      [ids.otro],
    );
    const conCookie = await estado();
    const i = await aplicarAjustes(cx, 'aplicar', await manifiesto(), { usuario: admin });
    expect(i.error).toMatch(/costos no declarados: Americano@/);
    expect(i.transaccion).toBe('rollback');
    expect(await estado()).toEqual(conCookie);
    expect(conCookie).not.toEqual(antes);
  });

  it('versión distinta o estado mezclado: no se toca nada', async () => {
    const antes = await estado();
    const v = await aplicarAjustes(cx, 'aplicar', await manifiesto((m) => (m.recetas![0].version += 1)), {
      usuario: admin,
    });
    expect(v.error).toMatch(/cambió desde que se preparó/);
    await db.exec(`update insumos set costo_paquete = 24.5 where nombre = 'COOKIE'`);
    const x = await aplicarAjustes(cx, 'aplicar', await manifiesto(), { usuario: admin });
    expect(x.error).toMatch(/mezclado/);
    await db.exec(`update insumos set costo_paquete = 22.49 where nombre = 'COOKIE'`);
    expect((await estado()).lineas).toEqual(antes.lineas);
  });
});
