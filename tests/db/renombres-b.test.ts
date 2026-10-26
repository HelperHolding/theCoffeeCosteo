import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import type { Conexion } from '../../scripts/conciliacion/fase4';
import { leerLista, renombrar, type Renombre } from '../../scripts/conciliacion/renombres-b';
import { crearUsuario } from './utilidades';

// Ensayo local del renombre B1–B6 con la lista real (mismos ids que producción) sobre recetas creadas aquí.
let db: PGlite;
let cx: Conexion;
let lista: Renombre[];
let admin: string;

const nombres = async () =>
  (
    await db.query<{ id: string; nombre: string; version: number }>(
      `select id, nombre, version from recetas order by nombre`,
    )
  ).rows;
const bitacora = async () =>
  Number((await db.query<{ n: number }>(`select count(*)::int as n from bitacora`)).rows[0].n);

beforeAll(async () => {
  db = await crearDbLocal();
  cx = {
    query: (sql, p) => db.query(sql, p) as never,
    ejecutar: (sql) => db.exec(sql).then(() => undefined),
  };
  lista = await leerLista();
  admin = await crearUsuario(db, 'admin');
  const cat = (
    await db.query<{ id: string }>(`insert into categorias_producto (nombre) values ('Prueba') returning id`)
  ).rows[0].id;
  await db.query(`select set_config('app.origen', 'migracion', false)`);
  for (const r of lista) {
    await db.query(`insert into recetas (id, nombre, tipo, categoria_id) values ($1, $2, 'producto', $3)`, [
      r.receta_id,
      r.nombre_actual,
      cat,
    ]);
  }
  await db.query(`insert into recetas (nombre, tipo, categoria_id) values ('Otra receta', 'producto', $1)`, [
    cat,
  ]);
  await db.query(`select set_config('app.origen', '', false)`);
});

describe('renombres B1–B6', () => {
  it('la lista tiene B1–B6, sin repetidos y sin B7', () => {
    expect(lista.map((r) => r.decision)).toEqual(['B1', 'B2', 'B3', 'B4', 'B5', 'B6']);
  });

  it('el ensayo informa por receta y no deja cambios ni bitácora', async () => {
    const antes = { recetas: await nombres(), bitacora: await bitacora() };
    const r = await renombrar(cx, 'ensayo', lista);
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({
      transaccion: 'rollback',
      totales: { renombrada: 6, 'sin cambio': 0, problema: 0 },
      bitacoraNueva: 6,
    });
    expect(r.recetas[0]).toMatchObject({
      decision: 'B1',
      desde: 'Pain Au Chocolat',
      hacia: 'Pain au Chocolat',
      version: { antes: 1, despues: 2 },
      bitacora: {
        campo: 'nombre',
        valor_anterior: 'Pain Au Chocolat',
        valor_nuevo: 'Pain au Chocolat',
        origen: 'carga_masiva',
        usuario_id: null,
      },
    });
    expect({ recetas: await nombres(), bitacora: await bitacora() }).toEqual(antes);
  });

  it('el ensayo de una sola receta toca solo esa', async () => {
    const r = await renombrar(cx, 'ensayo', lista, { solo: ['B4'] });
    expect(r.recetas.map((x) => x.decision)).toEqual(['B4']);
    expect(r).toMatchObject({ totales: { renombrada: 1 }, bitacoraNueva: 1 });
    expect((await renombrar(cx, 'ensayo', lista, { solo: ['B7'] })).error).toMatch(/desconocidas/);
  });

  it('un choque, un nombre distinto o una receta inactiva abortan todo, informando cada receta', async () => {
    await db.query(`update recetas set nombre = 'WHITE BAG 250G' where nombre = 'Otra receta'`);
    await db.query(`update recetas set nombre = 'Pain Au Chocolat ' where id = $1`, [lista[0].receta_id]);
    await db.query(`update recetas set activo = false where id = $1`, [lista[5].receta_id]);
    const antes = { recetas: await nombres(), bitacora: await bitacora() };
    const r = await renombrar(cx, 'aplicar', lista, { usuario: admin });
    expect(r).toMatchObject({ transaccion: 'rollback', totales: { renombrada: 3, problema: 3 } });
    expect(r.error).toMatch(/no se aplica ninguna/);
    expect(r.recetas.find((x) => x.decision === 'B1')!.problemas[0]).toMatch(/nombre actual/);
    expect(r.recetas.find((x) => x.decision === 'B5')!.problemas[0]).toMatch(/choca con «WHITE BAG 250G»/);
    expect(r.recetas.find((x) => x.decision === 'B6')!.problemas).toEqual(['está inactiva']);
    expect({ recetas: await nombres(), bitacora: await bitacora() }).toEqual(antes);
    await db.query(`select set_config('app.origen', 'migracion', false)`);
    await db.query(`update recetas set nombre = 'Otra receta' where nombre = 'WHITE BAG 250G'`);
    await db.query(`update recetas set nombre = 'Pain Au Chocolat' where id = $1`, [lista[0].receta_id]);
    await db.query(`update recetas set activo = true where id = $1`, [lista[5].receta_id]);
    await db.query(`select set_config('app.origen', '', false)`);
  });

  it('aplicar renombra las 6, deja bitácora con nota y usuario, y solo cambia nombre y versión', async () => {
    const usuario = admin;
    const antes = await bitacora();
    const r = await renombrar(cx, 'aplicar', lista, { usuario });
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({ transaccion: 'commit', totales: { renombrada: 6 }, bitacoraNueva: 6 });
    expect((await nombres()).map((x) => x.nombre)).toEqual(
      [...lista.map((x) => x.nombre_nuevo), 'Otra receta'].sort((a, b) => (a < b ? -1 : 1)),
    );
    const b = (
      await db.query<{ campo: string; origen: string; usuario_id: string; nota: string }>(
        `select campo, origen, usuario_id, nota from bitacora order by id desc limit 6`,
      )
    ).rows;
    expect(await bitacora()).toBe(antes + 6);
    expect(
      b.every((x) => x.campo === 'nombre' && x.origen === 'carga_masiva' && x.usuario_id === usuario),
    ).toBe(true);
    expect(b.map((x) => x.nota)).toContain(
      'B1 · renombre (conciliación Brasil, docs/conciliacion-brasil/16) · código POS 3FOOD3',
    );
    const updatedBy = await db.query(`select 1 from recetas where id = any($1::uuid[]) and updated_by = $2`, [
      lista.map((x) => x.receta_id),
      usuario,
    ]);
    expect(updatedBy.rows).toHaveLength(6);
  });

  it('aplicar otra vez no cambia nada', async () => {
    const antes = { recetas: await nombres(), bitacora: await bitacora() };
    const r = await renombrar(cx, 'aplicar', lista, { usuario: admin });
    expect(r).toMatchObject({
      transaccion: 'commit',
      totales: { renombrada: 0, 'sin cambio': 6 },
      bitacoraNueva: 0,
    });
    expect({ recetas: await nombres(), bitacora: await bitacora() }).toEqual(antes);
  });

  it('aplicar o revertir sin usuario, con un perfil sin permiso o inactivo, aborta sin tocar nada', async () => {
    const compras = await crearUsuario(db, 'compras');
    const inactivo = await crearUsuario(db, 'operaciones');
    await db.query(`update perfiles set activo = false where user_id = $1`, [inactivo]);
    // los perfiles también pasan por la bitácora: la foto de partida va después de crearlos
    const antes = { recetas: await nombres(), bitacora: await bitacora() };
    expect((await renombrar(cx, 'aplicar', lista)).error).toMatch(/exige --usuario/);
    expect((await renombrar(cx, 'revertir', lista)).error).toMatch(/exige --usuario/);
    expect((await renombrar(cx, 'revertir', lista, { usuario: compras })).error).toMatch(/perfil activo/);
    expect((await renombrar(cx, 'revertir', lista, { usuario: inactivo })).error).toMatch(/perfil activo/);
    expect({ recetas: await nombres(), bitacora: await bitacora() }).toEqual(antes);
  });

  it('revertir regresa los nombres originales con su propia bitácora', async () => {
    const antes = await bitacora();
    const r = await renombrar(cx, 'revertir', lista, { usuario: admin });
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({ transaccion: 'commit', totales: { renombrada: 6 }, bitacoraNueva: 6 });
    expect((await nombres()).map((x) => x.nombre)).toContain('Pain Au Chocolat');
    expect((await nombres()).every((x) => !lista.some((l) => l.nombre_nuevo === x.nombre))).toBe(true);
    expect(await bitacora()).toBe(antes + 6);
  });
});
