import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import type { Conexion } from '../../scripts/conciliacion/fase4';
import { ARCHIVO_LOTE, enlazar, leerLote, type Enlace } from '../../scripts/conciliacion/enlaces-pos';
import { crearProducto, crearSubreceta } from './fabricas';
import { crearUsuario } from './utilidades';

// Carga de enlaces código POS → receta con un lote de prueba (3 productos) sobre PGlite con todas las migraciones.
let db: PGlite;
let cx: Conexion;
let admin: string, operaciones: string, compras: string, inactivo: string;
let lote: Enlace[];
let carga: string;
const dir = mkdtempSync(join(tmpdir(), 'lote-enlaces-'));

/** Escribe un lote en un archivo temporal y lo lee con la misma validación que el real (huella incluida). */
async function loteDePrueba(filas: Enlace[], nombre = 'lote.csv') {
  const texto =
    [
      'codigo,receta_id,receta_nombre,nombre_observado,evidencia',
      ...filas.map((f) => Object.values(f).join(',')),
    ].join('\n') + '\n';
  writeFileSync(join(dir, nombre), texto);
  const esperado = { filas: filas.length, sha256: createHash('sha256').update(texto).digest('hex') };
  return leerLote(dir, esperado, nombre);
}
const filas = async () =>
  Number((await db.query<{ n: number }>(`select count(*)::int as n from producto_codigo_pos`)).rows[0].n);
const bitacora = async () =>
  Number((await db.query<{ n: number }>(`select count(*)::int as n from bitacora`)).rows[0].n);
const foto = async () => ({ filas: await filas(), bitacora: await bitacora() });

/** Conexión que, tras cada sentencia que empieza con `prefijo`, ejecuta `sql` en la misma sesión. */
const inyectar = (prefijo: string, sql: string, veces = Infinity): Conexion => {
  let n = 0;
  return {
    ...cx,
    query: async (q, p) => {
      const r = await db.query(q, p);
      if (q.trimStart().startsWith(prefijo) && n++ < veces) await db.exec(sql);
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
  [admin, operaciones, compras, inactivo] = [
    await crearUsuario(db, 'admin'),
    await crearUsuario(db, 'operaciones'),
    await crearUsuario(db, 'compras'),
    await crearUsuario(db, 'operaciones'),
  ];
  await db.query(`update perfiles set activo = false where user_id = $1`, [inactivo]);
  const ids = [
    await crearProducto(db, { nombre: 'Latte enlace', precios: { Chica: 65, Grande: 75 } }),
    await crearProducto(db, { nombre: 'Muffin enlace', precios: { Único: 45 } }),
    await crearProducto(db, { nombre: 'Cold brew enlace', precios: { Chica: 78, Grande: 88 } }),
  ];
  lote = await loteDePrueba([
    {
      codigo: '1LT',
      receta_id: ids[0],
      receta_nombre: 'Latte enlace',
      nombre_observado: 'Latte',
      evidencia: 'API · 10 líneas',
    },
    {
      codigo: '2MF',
      receta_id: ids[1],
      receta_nombre: 'Muffin enlace',
      nombre_observado: 'Muffin',
      evidencia: 'API · 5 líneas',
    },
    {
      codigo: '3CB',
      receta_id: ids[2],
      receta_nombre: 'Cold brew enlace',
      nombre_observado: 'Cold brew',
      evidencia: 'API · 7 líneas',
    },
  ]);
});

describe('lote fijado', () => {
  it('el lote real tiene las 57 filas y la huella revisadas', async () => {
    const real = await leerLote();
    expect(real).toHaveLength(57);
    expect(new Set(real.map((f) => f.codigo)).size).toBe(57);
  });

  it('cualquier variación del lote real lo rechaza en vez de ajustarse', async () => {
    const texto = readFileSync(ARCHIVO_LOTE, 'utf8');
    writeFileSync(join(dir, 'alterado.csv'), texto.replace('Cold brew,Cold brew', 'Cold brew,Cold Brew'));
    await expect(leerLote(dir, undefined, 'alterado.csv')).rejects.toThrow(/no es el revisado/);
    const lineas = texto.trimEnd().split(/\r?\n/);
    writeFileSync(join(dir, 'corto.csv'), lineas.slice(0, -1).join('\n') + '\n');
    await expect(leerLote(dir, undefined, 'corto.csv')).rejects.toThrow(/56 filas/);
  });

  it('rechaza códigos repetidos, GENERIC y receta_id inválidos', async () => {
    const base = { receta_id: lote[0].receta_id, receta_nombre: 'x', nombre_observado: 'x', evidencia: 'x' };
    await expect(
      loteDePrueba(
        [
          { codigo: 'A1', ...base },
          { codigo: 'A1', ...base, receta_id: lote[1].receta_id },
        ],
        'rep.csv',
      ),
    ).rejects.toThrow(/codigo repetido/);
    await expect(loteDePrueba([{ codigo: 'GENERIC', ...base }], 'gen.csv')).rejects.toThrow(
      /Código inválido/,
    );
    await expect(loteDePrueba([{ codigo: 'A2', ...base, receta_id: 'no-uuid' }], 'uuid.csv')).rejects.toThrow(
      /receta_id inválido/,
    );
  });
});

describe('carga de enlaces', () => {
  it('perfil obligatorio también en el ensayo: falta, inactivo, sin permiso o inexistente abortan', async () => {
    const antes = await foto();
    expect((await enlazar(cx, 'ensayo', lote, { usuario: '' })).error).toMatch(/Falta --usuario/);
    for (const u of [compras, inactivo, randomUUID()])
      expect((await enlazar(cx, 'ensayo', lote, { usuario: u })).error).toMatch(/perfil activo/);
    expect(await foto()).toEqual(antes);
  });

  it('el ensayo da de alta todo, verifica bitácora y datos comerciales y no deja nada', async () => {
    const antes = await foto();
    const r = await enlazar(cx, 'ensayo', lote, { usuario: operaciones });
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({
      transaccion: 'rollback',
      totales: { alta: 3, 'sin cambio': 0, problema: 0 },
      bitacoraPropia: 3,
      bitacoraAjena: 0,
      comercialSinCambios: true,
      antes: { filasEnTabla: 0 },
      despues: { filasEnTabla: 3, deEstaCarga: 3 },
    });
    expect(r.idsPropios).toHaveLength(3);
    expect(await foto()).toEqual(antes);
  });

  it('receta renombrada, inactiva o sub-receta: un problema aborta toda la carga (sin altas parciales)', async () => {
    const sub = await crearSubreceta(db, { nombre: 'Jarabe enlace', rendimiento: 1000 });
    const malo = await loteDePrueba(
      [
        ...lote,
        {
          codigo: '9SB',
          receta_id: sub,
          receta_nombre: 'Jarabe enlace',
          nombre_observado: 'Jarabe',
          evidencia: 'API',
        },
      ],
      'sub.csv',
    );
    let r = await enlazar(cx, 'aplicar', malo, { usuario: admin });
    expect(r).toMatchObject({ transaccion: 'rollback', totales: { alta: 3, problema: 1 } });
    expect(r.enlaces.find((e) => e.codigo === '9SB')!.problemas[0]).toMatch(/subreceta, no producto/);
    await db.query(`select set_config('app.origen', 'migracion', false)`);
    await db.query(`update recetas set nombre = 'Latte enlace (renombrada)' where id = $1`, [
      lote[0].receta_id,
    ]);
    await db.query(`update recetas set activo = false where id = $1`, [lote[2].receta_id]);
    const antes = await foto();
    r = await enlazar(cx, 'aplicar', lote, { usuario: admin });
    expect(r).toMatchObject({ transaccion: 'rollback', totales: { alta: 1, problema: 2 } });
    expect(r.enlaces[0].problemas[0]).toMatch(/se llama «Latte enlace \(renombrada\)»/);
    expect(r.enlaces[2].problemas).toEqual(['la receta está inactiva']);
    expect(await foto()).toEqual(antes);
    await db.query(`update recetas set nombre = 'Latte enlace' where id = $1`, [lote[0].receta_id]);
    await db.query(`update recetas set activo = true where id = $1`, [lote[2].receta_id]);
    await db.query(`select set_config('app.origen', '', false)`);
  });

  it('la actividad ajena en la bitácora no se cuenta ni se toca', async () => {
    const ajena = inyectar(
      'insert into producto_codigo_pos',
      `insert into bitacora (tabla, registro_id, campo, valor_nuevo, origen, fecha)
       values ('insumos', 'ajeno', 'costo_paquete', '101', 'portal', now() - interval '1 second')`,
    );
    const r = await enlazar(ajena, 'ensayo', lote, { usuario: admin });
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({ bitacoraPropia: 3, bitacoraAjena: 3, totales: { alta: 3 } });
  });

  it('un registro de bitácora propio que no corresponde a un alta aborta todo', async () => {
    const extra = inyectar(
      'insert into producto_codigo_pos',
      `insert into bitacora (tabla, registro_id, campo, origen) values ('insumos', 'extra', '*', 'carga_masiva')`,
      1,
    );
    const r = await enlazar(extra, 'aplicar', lote, { usuario: admin });
    expect(r).toMatchObject({ transaccion: 'rollback', bitacoraPropia: 4 });
    expect(r.error).toMatch(/dejó 4 registros de bitácora y se esperaban 3/);
    expect(await filas()).toBe(0);
  });

  it('un cambio comercial dentro de la ejecución aborta todo', async () => {
    const precio = inyectar(
      'insert into producto_codigo_pos',
      // Sin rastro en la bitácora (origen migración sin usuario), para probar la huella comercial por sí sola.
      `select set_config('app.origen', 'migracion', true), set_config('request.jwt.claim.sub', '', true);
       update producto_tamanos set precio_lista = precio_lista + 1 where producto_id = '${lote[1].receta_id}';
       select set_config('app.origen', 'carga_masiva', true), set_config('request.jwt.claim.sub', '${admin}', true);`,
      1,
    );
    const r = await enlazar(precio, 'aplicar', lote, { usuario: admin });
    expect(r).toMatchObject({ transaccion: 'rollback', comercialSinCambios: false, bitacoraPropia: 3 });
    expect(r.error).toMatch(/datos comerciales/);
    expect(await filas()).toBe(0);
  });

  it('aplicar carga exactamente el lote con autoría, carga_id y nota en la bitácora', async () => {
    const r = await enlazar(cx, 'aplicar', lote, { usuario: admin });
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({
      transaccion: 'commit',
      totales: { alta: 3 },
      bitacoraPropia: 3,
      comercialSinCambios: true,
    });
    carga = r.carga_id;
    const f = await db.query<{ codigo: string; creado_por: string; carga_id: string }>(
      `select codigo, creado_por, carga_id from producto_codigo_pos order by codigo`,
    );
    expect(f.rows).toEqual(lote.map((x) => ({ codigo: x.codigo, creado_por: admin, carga_id: carga })));
    const b = await db.query<{ nota: string; usuario_id: string; origen: string }>(
      `select nota, usuario_id, origen from bitacora where tabla = 'producto_codigo_pos' and registro_id = any($1)`,
      [r.idsPropios],
    );
    expect(b.rows).toHaveLength(3);
    expect(
      b.rows.every((x) => x.usuario_id === admin && x.origen === 'carga_masiva' && x.nota.includes(carga)),
    ).toBe(true);
  });

  it('repetir no cambia nada', async () => {
    const antes = await foto();
    const r = await enlazar(cx, 'aplicar', lote, { usuario: admin });
    expect(r).toMatchObject({
      transaccion: 'commit',
      totales: { alta: 0, 'sin cambio': 3 },
      bitacoraPropia: 0,
    });
    expect(await foto()).toEqual(antes);
  });

  it('un código ligado a otra receta o con otra evidencia es conflicto y no se sobrescribe', async () => {
    await db.query(`update producto_codigo_pos set evidencia = 'corregida' where codigo = '2MF'`);
    let r = await enlazar(cx, 'aplicar', lote, { usuario: admin });
    expect(r).toMatchObject({ transaccion: 'rollback', totales: { problema: 1 } });
    expect(r.enlaces[1].problemas[0]).toMatch(/otro nombre observado o evidencia/);
    await db.query(
      `update producto_codigo_pos set evidencia = 'API · 5 líneas', receta_id = $1 where codigo = '2MF'`,
      [lote[0].receta_id],
    );
    r = await enlazar(cx, 'aplicar', lote, { usuario: admin });
    expect(r.enlaces[1].problemas[0]).toMatch(/ligado a otra receta/);
    await db.query(`update producto_codigo_pos set receta_id = $1 where codigo = '2MF'`, [lote[1].receta_id]);
    expect(
      (
        await db.query(
          `select 1 from producto_codigo_pos where codigo = '2MF' and evidencia = 'API · 5 líneas'`,
        )
      ).rows,
    ).toHaveLength(1);
  });
});

describe('reversión por ejecución', () => {
  it('exige una carga existente y no borra nada si una fila cambió desde la carga', async () => {
    expect((await enlazar(cx, 'revertir', lote, { usuario: admin })).error).toMatch(/--carga/);
    expect((await enlazar(cx, 'revertir', lote, { usuario: admin, carga: randomUUID() })).error).toMatch(
      /No hay filas/,
    );
    await db.query(`update producto_codigo_pos set nombre_observado = 'Cold Brew' where codigo = '3CB'`);
    const antes = await foto();
    const r = await enlazar(cx, 'revertir', lote, { usuario: admin, carga });
    expect(r).toMatchObject({ transaccion: 'rollback', totales: { baja: 2, problema: 1 } });
    expect(await foto()).toEqual(antes);
    await db.query(`update producto_codigo_pos set nombre_observado = 'Cold brew' where codigo = '3CB'`);
  });

  it('borra solo las filas de esa carga, con su bitácora; los enlaces de otro origen se quedan', async () => {
    await db.query(
      `insert into producto_codigo_pos (codigo, receta_id, nombre_observado, evidencia) values ('PORTAL1', $1, 'Latte', 'alta manual')`,
      [lote[0].receta_id],
    );
    const antes = await bitacora();
    const r = await enlazar(cx, 'revertir', lote, { usuario: operaciones, carga });
    expect(r.error).toBeUndefined();
    expect(r).toMatchObject({
      transaccion: 'commit',
      totales: { baja: 3 },
      bitacoraPropia: 3,
      comercialSinCambios: true,
    });
    expect((await db.query<{ codigo: string }>(`select codigo from producto_codigo_pos`)).rows).toEqual([
      { codigo: 'PORTAL1' },
    ]);
    expect(await bitacora()).toBe(antes + 3);
    expect((await enlazar(cx, 'revertir', lote, { usuario: operaciones, carga })).error).toMatch(
      /No hay filas/,
    );
  });
});
