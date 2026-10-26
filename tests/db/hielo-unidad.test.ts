import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import type { Conexion } from '../../scripts/conciliacion/fase4';
import {
  leerLoteHielo,
  LOTES_HIELO_APROBADOS,
  migrarHielo,
  regenerarVersiones,
  separarLineas,
  validarManifiestoHielo,
  type ManifiestoHielo,
  type UsoHielo,
} from '../../scripts/conciliacion/hielo-unidad';
import { agregarLinea, crearInsumo, crearProducto, idTamano, type NombreTamano } from './fabricas';
import { crearUsuario } from './utilidades';

// H2 (doc 23): el hielo pasa a un insumo en gramos línea por línea, con los mismos números y el mismo costo.
let db: PGlite;
let cx: Conexion;
let admin: string, compras: string;
let hielo: string, leche: string;
let n = 0;
const DESTINO = 'HIELO (g)';

const manifiesto = async (
  lineas: {
    receta: string;
    nombre: string;
    linea: string;
    cantidades: Partial<Record<NombreTamano, number>>;
  }[],
  destino = DESTINO,
): Promise<ManifiestoHielo> => ({
  lote: `prueba-${++n}`,
  fuente: { archivo: 'prueba.pdf', sha256: 'x' },
  origen: { id: hielo, nombre: 'HIELO', unidad: 'ml', costo_paquete: 0, presentacion: 1 },
  destino: {
    nombre: destino,
    unidad: 'gr',
    costo_paquete: 0,
    presentacion: 1,
    supuesto: 'provisional (prueba)',
  },
  lineas: await Promise.all(
    lineas.map(async (l) => ({
      receta_id: l.receta,
      receta: l.nombre,
      version: await version(l.receta),
      linea_id: l.linea,
      pagina: 21,
      cantidades: await Promise.all(
        (Object.entries(l.cantidades) as [NombreTamano, number][]).map(async ([t, c]) => ({
          tamano_id: await idTamano(db, t),
          tamano: t,
          cantidad: c,
        })),
      ),
    })),
  ),
  aprobacion: 'prueba',
});
/** Bebida fría con leche (costo) y una línea de hielo. */
const bebida = async (cantidades: Partial<Record<NombreTamano, number>>) => {
  const nombre = `Iced prueba ${++n}`;
  const receta = await crearProducto(db, { nombre, precios: { Chica: 78, Grande: 88 } });
  await agregarLinea(db, receta, { insumoId: leche, cantidades: { Chica: 170, Grande: 290 } });
  const linea = await agregarLinea(db, receta, { insumoId: hielo, cantidades });
  return { receta, nombre, linea, cantidades };
};
const version = async (receta: string) =>
  (await db.query<{ v: number }>(`select version as v from recetas where id = $1`, [receta])).rows[0].v;
const insumoDe = async (linea: string) =>
  (
    await db.query<{ n: string }>(
      `select i.nombre as n from receta_lineas l join insumos i on i.id = l.insumo_id where l.id = $1`,
      [linea],
    )
  ).rows[0].n;
const estado = async () => ({
  cantidades: (await db.query(`select * from linea_cantidades order by linea_id, tamano_id`)).rows,
  costos: (await db.query(`select producto_id, tamano_id, costo::text from v_costo_producto order by 1, 2`))
    .rows,
  bitacora: (await db.query<{ n: number }>(`select count(*)::int n from bitacora`)).rows[0].n,
  destino: (await db.query(`select 1 from insumos where nombre = $1`, [DESTINO])).rows.length,
});

beforeAll(async () => {
  db = await crearDbLocal();
  cx = {
    query: (sql, p) => db.query(sql, p) as never,
    ejecutar: (sql) => db.exec(sql).then(() => undefined),
  };
  [admin, compras] = [await crearUsuario(db, 'admin'), await crearUsuario(db, 'compras')];
  hielo = await crearInsumo(db, { nombre: 'HIELO', costoPaquete: 0, presentacion: 1, unidad: 'ml' });
  leche = await crearInsumo(db, { nombre: 'LECHE', costoPaquete: 44, presentacion: 2000, unidad: 'ml' });
});

describe('selección y manifiesto', () => {
  it('una línea entra solo si todas sus celdas están verificadas; las demás se conservan enteras', () => {
    const u = (
      linea: string,
      tamano: string,
      cantidad: number,
      verificada: boolean,
      pagina: number | null = 21,
    ): UsoHielo => ({
      receta_id: `r-${linea}`,
      receta: `Receta ${linea}`,
      linea_id: linea,
      tamano_id: `t-${tamano}`,
      tamano,
      cantidad,
      pagina,
      verificada,
    });
    const { migrables, conservadas } = separarLineas([
      u('a', 'Chica', 130, true),
      u('a', 'Grande', 245, true),
      u('v60', 'Chica', 230, true, 65),
      u('v60', 'Grande', 310, false, 65),
      u('soda', 'Chica', 130, true, 43),
      u('soda', 'Grande', 190, false, 43),
      u('combo', 'Chica', 130, false, null),
    ]);
    expect(migrables.map((l) => [l.linea_id, l.cantidades.map((c) => c.cantidad)])).toEqual([
      ['a', [130, 245]],
    ]);
    expect(conservadas.map((c) => [c.linea_id, c.motivo])).toEqual([
      ['v60', 'sin verificar: Grande 310'],
      ['soda', 'sin verificar: Grande 190'],
      ['combo', 'sin verificar: Chica 130'],
    ]);
  });

  it('el lote aprobado: 26 líneas del PDF, sin Cold brew, Fresh Sodas, V60 ni recetas sin ficha', async () => {
    const texto = readFileSync('docs/conciliacion-brasil/23-hielo-gramos-lote-1.manifiesto.json', 'utf8');
    const m = JSON.parse(texto) as ManifiestoHielo;
    expect(() => validarManifiestoHielo(m)).not.toThrow();
    expect(m.origen).toMatchObject({ nombre: 'HIELO', unidad: 'ml', costo_paquete: 0, presentacion: 1 });
    expect(m.destino).toMatchObject({ nombre: 'HIELO (g)', unidad: 'gr', costo_paquete: 0, presentacion: 1 });
    expect(m.destino.supuesto).toMatch(/NO confirma que el hielo sea gratuito/);
    expect(m.destino.supuesto).toMatch(/no es una presentación de compra validada/);
    expect(m.lineas).toHaveLength(26);
    expect(new Set(m.lineas.map((l) => l.receta_id)).size).toBe(26);
    expect(m.lineas.reduce((s, l) => s + l.cantidades.length, 0)).toBe(51);
    const nombres = m.lineas.map((l) => l.receta).join('|');
    for (const fuera of [
      'Cold brew',
      'Fresh Soda',
      'Cold Drip',
      'Gelato',
      'Nutty',
      'Lemon Honey',
      '+ Banana',
      'koulign',
    ])
      expect(nombres).not.toContain(fuera);
    expect(m.lineas.some((l) => l.receta_id === '00f47aba-88e6-4ebc-a815-5833f8b29871')).toBe(false);
    expect(m.aprobacion).toMatch(/sin Cold brew.*costo de compra del hielo sin confirmar/);
    expect(Object.keys(LOTES_HIELO_APROBADOS)).toEqual(['hielo-gramos-lote-1']);
    await expect(leerLoteHielo('hielo-gramos-lote-1')).resolves.toEqual(m);
    await expect(leerLoteHielo('hielo-gramos-lote-2')).rejects.toThrow(/no está aprobado/);
  });

  it('manifiestos inválidos se rechazan', async () => {
    const base = await manifiesto([{ ...(await bebida({ Chica: 130, Grande: 245 })) }]);
    const probar = (cambio: (m: ManifiestoHielo) => void, error: RegExp) => {
      const m = structuredClone(base);
      cambio(m);
      expect(() => validarManifiestoHielo(m)).toThrow(error);
    };
    probar((m) => (m.destino.unidad = 'ml' as 'gr'), /destino/);
    probar((m) => (m.destino.nombre = 'HIELO'), /destino/);
    probar((m) => (m.destino.supuesto = ' '), /supuesto/);
    probar((m) => (m.destino.presentacion = 0), /presentación/);
    probar((m) => m.lineas.push({ ...m.lineas[0] }), /Línea repetida/);
    probar((m) => (m.lineas[0].cantidades[0].cantidad = 0), /Cantidad inválida/);
    probar((m) => (m.lineas[0].pagina = 0), /página/);
    probar((m) => m.lineas[0].cantidades.push({ ...m.lineas[0].cantidades[0] }), /repetido/);
  });

  it('leerLoteHielo exige la huella aprobada', async () => {
    const texto = readFileSync(
      'docs/conciliacion-brasil/23-hielo-gramos-lote-1.manifiesto.json',
      'utf8',
    ).replace(/\r\n/g, '\n');
    const sha = createHash('sha256').update(texto).digest('hex');
    const ruta = 'docs/conciliacion-brasil/23-hielo-gramos-lote-1.manifiesto.json';
    await expect(
      leerLoteHielo('hielo-gramos-lote-1', '.', { 'hielo-gramos-lote-1': { manifiesto: ruta, sha256: sha } }),
    ).resolves.toMatchObject({ lote: 'hielo-gramos-lote-1' });
    await expect(
      leerLoteHielo('hielo-gramos-lote-1', '.', {
        'hielo-gramos-lote-1': { manifiesto: ruta, sha256: '0'.repeat(64) },
      }),
    ).rejects.toThrow(/no es el aprobado/);
  });
});

describe('migración', () => {
  it('perfil obligatorio también en el ensayo', async () => {
    const m = await manifiesto([await bebida({ Chica: 130, Grande: 245 })]);
    const antes = await estado();
    expect((await migrarHielo(cx, 'ensayo', m, { usuario: '' })).error).toMatch(/Falta --usuario/);
    for (const u of [compras, randomUUID()])
      expect((await migrarHielo(cx, 'aplicar', m, { usuario: u })).error).toMatch(/perfil activo/);
    expect(await estado()).toEqual(antes);
  });

  it('el ensayo crea el destino, cambia las líneas con su bitácora y costos idénticos, y no deja nada', async () => {
    const a = await bebida({ Chica: 130, Grande: 245 });
    const b = await bebida({ Chica: 90, Grande: 170 });
    const m = await manifiesto([a, b]);
    const antes = await estado();
    const v0 = await version(a.receta);
    const r = await migrarHielo(cx, 'ensayo', m, { usuario: admin });
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({
      transaccion: 'rollback',
      destino: { creado: true },
      totales: { cambiada: 2, problema: 0 },
      bitacoraPropia: 3,
      costosSinCambios: true,
      restoSinCambios: true,
    });
    expect(r.versiones[a.nombre]).toEqual({ antes: v0, despues: v0 + 1 });
    expect(await estado()).toEqual(antes);
    expect(await insumoDe(a.linea)).toBe('HIELO');
  });

  it('aplicar: mismos números y costos, auditoría por línea, conserva lo no verificado; repetir no cambia nada', async () => {
    const a = await bebida({ Chica: 130, Grande: 245 });
    const sinFicha = await bebida({ Chica: 90, Grande: 123 });
    const antes = await estado();
    const v0 = await version(a.receta);
    const vSinFicha = await version(sinFicha.receta);
    const m = await manifiesto([a]);
    const r = await migrarHielo(cx, 'aplicar', m, { usuario: admin });
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({ transaccion: 'commit', totales: { cambiada: 1 }, costosSinCambios: true });
    const despues = await estado();
    expect(despues.cantidades).toEqual(antes.cantidades);
    expect(despues.costos).toEqual(antes.costos);
    expect(await insumoDe(a.linea)).toBe(DESTINO);
    expect(await insumoDe(sinFicha.linea)).toBe('HIELO');
    expect(await version(a.receta)).toBe(v0 + 1);
    expect(await version(sinFicha.receta)).toBe(vSinFicha);
    const destino = (
      await db.query<{ unidad: string; costo_paquete: string; presentacion: string; costo_unitario: string }>(
        `select unidad::text, costo_paquete::text, presentacion::text, costo_unitario::text from insumos where nombre = $1`,
        [DESTINO],
      )
    ).rows[0];
    expect(destino).toMatchObject({ unidad: 'gr' });
    expect(Number(destino.costo_paquete)).toBe(0);
    expect(Number(destino.costo_unitario)).toBe(0);
    const origen = (
      await db.query<{ unidad: string }>(`select unidad::text from insumos where id = $1`, [hielo])
    ).rows[0];
    expect(origen.unidad).toBe('ml');
    const b = (
      await db.query<{
        tabla: string;
        campo: string;
        valor_anterior: string;
        valor_nuevo: string;
        usuario_id: string;
        origen: string;
        receta_id: string | null;
      }>(
        `select tabla, campo, valor_anterior, valor_nuevo, usuario_id, origen, receta_id from bitacora where nota like $1 order by id`,
        [`%${r.ejecucion}%`],
      )
    ).rows;
    expect(b).toHaveLength(2);
    expect(b[0]).toMatchObject({ tabla: 'insumos', campo: '*', usuario_id: admin, origen: 'carga_masiva' });
    expect(b[1]).toMatchObject({
      tabla: 'receta_lineas',
      campo: 'insumo_id',
      valor_anterior: hielo,
      valor_nuevo: r.destino.id,
      usuario_id: admin,
      origen: 'carga_masiva',
      receta_id: a.receta,
    });
    const rep = await migrarHielo(cx, 'aplicar', m, { usuario: admin });
    expect(rep).toMatchObject({
      transaccion: 'commit',
      destino: { creado: false },
      totales: { 'sin cambio': 1 },
      bitacoraPropia: 0,
    });
    expect(await version(a.receta)).toBe(v0 + 1);
  });

  it('un segundo lote reutiliza el destino existente sin volver a crearlo', async () => {
    const c = await bebida({ Chica: 100, Grande: 140 });
    const r = await migrarHielo(cx, 'aplicar', await manifiesto([c]), { usuario: admin });
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({ destino: { creado: false }, totales: { cambiada: 1 }, bitacoraPropia: 1 });
    expect((await db.query(`select 1 from insumos where nombre = $1`, [DESTINO])).rows).toHaveLength(1);
  });

  it('no convierte: cantidades distintas, versión distinta u otro insumo detienen todo', async () => {
    const a = await bebida({ Chica: 130, Grande: 245 });
    const m = await manifiesto([a]);
    await db.query(`update linea_cantidades set cantidad = 131 where linea_id = $1 and tamano_id = $2`, [
      a.linea,
      await idTamano(db, 'Chica'),
    ]);
    let r = await migrarHielo(
      cx,
      'aplicar',
      { ...m, lineas: [{ ...m.lineas[0], version: await version(a.receta) }] },
      { usuario: admin },
    );
    expect(r.error).toMatch(/no está como declara el manifiesto/);
    expect(r.lineas[0].problemas.join()).toMatch(/cantidades/);
    expect(await insumoDe(a.linea)).toBe('HIELO');

    const b = await bebida({ Chica: 130, Grande: 245 });
    const mb = await manifiesto([b]);
    await db.query(`update recetas set nombre = nombre where id = $1`, [b.receta]);
    r = await migrarHielo(cx, 'aplicar', mb, { usuario: admin });
    expect(r.lineas[0].problemas.join()).toMatch(/versión/);

    const c = await bebida({ Chica: 130, Grande: 245 });
    const mc = await manifiesto([c]);
    mc.lineas[0].linea_id = (
      await db.query<{ id: string }>(`select id from receta_lineas where receta_id = $1 and insumo_id = $2`, [
        c.receta,
        leche,
      ])
    ).rows[0].id;
    r = await migrarHielo(cx, 'aplicar', mc, { usuario: admin });
    expect(r.error).toMatch(/no está como declara el manifiesto/);
  });

  it('no cambia costos de compra: otro costo unitario, un destino distinto al declarado o el origen alterado detienen todo', async () => {
    const a = await bebida({ Chica: 130, Grande: 245 });
    const otro = 'HIELO (g) CARO';
    await crearInsumo(db, { nombre: otro, costoPaquete: 50, presentacion: 1000, unidad: 'gr' });
    let r = await migrarHielo(cx, 'aplicar', await manifiesto([a], otro), { usuario: admin });
    expect(r.error).toMatch(/no está como declara el manifiesto/);
    const caro = await manifiesto([a], 'HIELO (g) NUEVO');
    caro.destino = { ...caro.destino, costo_paquete: 50, presentacion: 1000 };
    r = await migrarHielo(cx, 'aplicar', caro, { usuario: admin });
    expect(r.error).toMatch(/costo unitario del destino/);
    expect((await db.query(`select 1 from insumos where nombre = 'HIELO (g) NUEVO'`)).rows).toHaveLength(0);
    const m = await manifiesto([a]);
    r = await migrarHielo(
      cx,
      'aplicar',
      { ...m, origen: { ...m.origen, costo_paquete: 1 } },
      { usuario: admin },
    );
    expect(r.error).toMatch(/origen no está como declara/);
    expect(await insumoDe(a.linea)).toBe('HIELO');
  });

  it('un cambio de precio o de otra línea durante la ejecución aborta', async () => {
    const a = await bebida({ Chica: 130, Grande: 245 });
    const m = await manifiesto([a]);
    const espia: Conexion = {
      ...cx,
      query: async (q, p) => {
        const r = await db.query(q, p);
        if (q.trimStart().startsWith('update public.receta_lineas'))
          await db.exec(
            `update producto_tamanos set precio_lista = precio_lista + 1 where producto_id = '${a.receta}'`,
          );
        return r as never;
      },
    };
    const r = await migrarHielo(espia, 'aplicar', m, { usuario: admin });
    expect(r).toMatchObject({ transaccion: 'rollback' });
    expect(r.error).toMatch(/fuera de las líneas|bitácora/);
    expect(await insumoDe(a.linea)).toBe('HIELO');
  });

  it('revertir: exige la ejecución, devuelve solo esas líneas, declara el destino residual y se niega si hubo ediciones posteriores', async () => {
    const a = await bebida({ Chica: 250, Grande: 360 });
    const m = await manifiesto([a], 'HIELO (g) R');
    const original = await estado();
    const ap = await migrarHielo(cx, 'aplicar', m, { usuario: admin });
    expect(ap.transaccion).toBe('commit');
    expect((await migrarHielo(cx, 'revertir', m, { usuario: admin })).error).toMatch(/--ejecucion/);
    expect((await migrarHielo(cx, 'revertir', m, { usuario: admin, ejecucion: randomUUID() })).error).toMatch(
      /nada que revertir/,
    );
    const rv = await migrarHielo(cx, 'revertir', m, { usuario: admin, ejecucion: ap.ejecucion });
    expect(rv.error).toBeUndefined();
    expect(rv).toMatchObject({
      transaccion: 'commit',
      totales: { revertida: 1 },
      bitacoraPropia: 1,
      costosSinCambios: true,
    });
    expect(await insumoDe(a.linea)).toBe('HIELO');
    expect((await estado()).cantidades).toEqual(original.cantidades);
    // Las líneas se restauran; el insumo creado queda sin uso y se declara como residuo, no como restauración exacta.
    expect(rv.residuos).toEqual([expect.stringMatching(/«HIELO \(g\) R».*sin uso: objeto residual/)]);
    expect((await db.query(`select 1 from insumos where nombre = 'HIELO (g) R'`)).rows).toHaveLength(1);
    expect(ap.residuos).toBeUndefined();

    const b = await bebida({ Chica: 250, Grande: 312 });
    const mb = await manifiesto([b]);
    const ap2 = await migrarHielo(cx, 'aplicar', mb, { usuario: admin });
    await db.query(
      `update linea_cantidades set cantidad = 171 where linea_id in (select id from receta_lineas where receta_id = $1 and insumo_id = $2)
                      and tamano_id = $3`,
      [b.receta, leche, await idTamano(db, 'Chica')],
    );
    const rv2 = await migrarHielo(cx, 'revertir', mb, { usuario: admin, ejecucion: ap2.ejecucion });
    expect(rv2).toMatchObject({ transaccion: 'rollback' });
    expect(rv2.error).toMatch(/posterior/);
    expect(await insumoDe(b.linea)).toBe(DESTINO);
  });
});

describe('orden entre lotes: regenerar el segundo manifiesto', () => {
  it('si otro lote subió la versión, el manifiesto viejo se detiene; el regenerado solo cambia versiones y pasa', async () => {
    const a = await bebida({ Chica: 130, Grande: 245 });
    const b = await bebida({ Chica: 90, Grande: 170 });
    const m = await manifiesto([a, b]);
    // Otro lote (como 3b) cambia una cantidad de otra línea de la receta a: +1 versión.
    await db.query(
      `update linea_cantidades set cantidad = 180 where linea_id in (select id from receta_lineas where receta_id = $1 and insumo_id = $2)
         and tamano_id = $3`,
      [a.receta, leche, await idTamano(db, 'Chica')],
    );
    const viejo = await migrarHielo(cx, 'ensayo', m, { usuario: admin });
    expect(viejo.lineas[0].problemas.join()).toMatch(/versión/);

    const antes = await estado();
    const { manifiesto: nuevo, cambios } = await regenerarVersiones(cx, m);
    expect(await estado()).toEqual(antes);
    expect(cambios).toEqual([
      { receta: a.nombre, antes: m.lineas[0].version, ahora: m.lineas[0].version + 1 },
    ]);
    // Diff revisable: solo la versión de la receta a.
    expect({ ...nuevo, aprobacion: '' }).toEqual({
      ...m,
      aprobacion: '',
      lineas: [{ ...m.lineas[0], version: m.lineas[0].version + 1 }, m.lineas[1]],
    });
    expect(nuevo.aprobacion).toMatch(/BORRADOR regenerado/);
    const r = await migrarHielo(cx, 'ensayo', nuevo, { usuario: admin });
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({ totales: { cambiada: 2 }, costosSinCambios: true });
  });

  it('se niega a regenerar si cambió la línea de hielo (cantidades o insumo): eso exige revisión completa', async () => {
    const a = await bebida({ Chica: 130, Grande: 245 });
    const m = await manifiesto([a]);
    await db.query(`update linea_cantidades set cantidad = 140 where linea_id = $1 and tamano_id = $2`, [
      a.linea,
      await idTamano(db, 'Chica'),
    ]);
    await expect(regenerarVersiones(cx, m)).rejects.toThrow(/revisión completa.*cantidades/);
  });
});
