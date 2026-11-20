import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo } from './utilidades';

// Migración 79: rutina de turno v2 (4 fases, rondas, datos, cortes y visto bueno) y convivencia con la v1.
let db: PGlite;
let gerente: string;
let tienda: string;
let gerenteOtra: string;
let ana: number;
let beto: number;
const E = 514;
const OTRA = 532;
type F = Record<string, any>;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const uno = async (u: string, sql: string, p: unknown[] = []) =>
  como(u, async () => (await db.query<F>(sql, p)).rows[0]);
const filas = async (u: string, sql: string, p: unknown[] = []) =>
  como(u, async () => (await db.query<F>(sql, p)).rows);
const falla = async (u: string | null, sql: string, p: unknown[] = []) => {
  try {
    if (u) await como(u, () => db.query(sql, p));
    else await db.query(sql, p);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`No falló: ${sql}`);
};
const responder = (
  u: string,
  seccion: string,
  punto: number,
  cumple: boolean,
  obs: string | null,
  barista: number | null,
  dato: string | null = null,
  motivo: string | null = null,
) =>
  uno(u, 'select public.franq_responder($1,$2,$3,$4,$5,$6,$7,$8,$9) id', [
    E,
    seccion,
    punto,
    cumple,
    obs,
    barista,
    'tablet prueba',
    motivo,
    dato,
  ]);
/** Puntos de la v2 por fase, en orden: [{id, actividad, tipo, dato}]. */
const puntosV2 = async (clave: string) =>
  (
    await db.query<F>(
      `select pt.id, pt.actividad, pt.tipo, pt.dato, pt.cada_min, pt.corte from franq_plantilla_puntos pt
       join franq_plantilla_secciones s on s.id = pt.seccion_id join franq_plantillas pl on pl.id = s.plantilla_id
       where pl.version = 2 and s.clave = $1 order by pt.orden`,
      [clave],
    )
  ).rows.map((r) => ({ ...r, id: Number(r.id) }) as F & { id: number });

beforeAll(async () => {
  db = await crearDbLocal();
  gerente = await crearUsuario(db, 'franquiciado');
  tienda = await crearUsuario(db, 'tienda');
  gerenteOtra = await crearUsuario(db, 'franquiciado');
  for (const u of [gerente, tienda, gerenteOtra]) await darModulo(db, u, 'franquiciatarios', 'lectura');
  await db.query(
    `insert into franq_miembros (user_id, company_id, rol) values ($1,$4,'gerente'),($2,$4,'barista'),($3,$5,'gerente')`,
    [gerente, tienda, gerenteOtra, E, OTRA],
  );
  ana = Number((await uno(gerente, `select public.franq_barista_guardar($1,null,'Ana',true) id`, [E])).id);
  beto = Number((await uno(gerente, `select public.franq_barista_guardar($1,null,'Beto',true) id`, [E])).id);
});
afterAll(async () => db.close());

describe('migración 79 · plantilla v2', () => {
  it('la v2 es la vigente con 4 fases y las 32 actividades del PDF; la v1 se conserva sin vigencia', async () => {
    const pl = await db.query<F>(
      `select version, vigente from franq_plantillas where company_id is null order by version`,
    );
    expect(pl.rows).toEqual([
      { version: 1, vigente: false },
      { version: 2, vigente: true },
    ]);
    const conteo = await db.query<F>(
      `select s.clave, s.firmas, count(pt.id)::int n from franq_plantilla_secciones s
       join franq_plantillas pl on pl.id = s.plantilla_id join franq_plantilla_puntos pt on pt.seccion_id = s.id
       where pl.version = 2 group by s.clave, s.firmas, s.orden order by s.orden`,
    );
    expect(conteo.rows).toEqual([
      { clave: 'apertura', firmas: ['responsable'], n: 8 },
      { clave: 'durante', firmas: [], n: 6 },
      { clave: 'medio', firmas: ['entrega', 'recibe'], n: 7 },
      { clave: 'cierre', firmas: ['responsable', 'visto_bueno'], n: 11 },
    ]);
    const v1 = await db.query<F>(
      `select count(*)::int n from franq_plantilla_puntos pt join franq_plantilla_secciones s on s.id = pt.seccion_id
       join franq_plantillas pl on pl.id = s.plantilla_id where pl.version = 1`,
    );
    expect(v1.rows[0].n).toBe(33);
    const durante = await puntosV2('durante');
    expect(durante.every((p) => p.tipo === 'recurrente')).toBe(true);
    expect(durante.find((p) => p.actividad === 'Revisar baños')?.cada_min).toBe(60);
    expect((await puntosV2('medio')).find((p) => p.corte)?.corte).toBe('parcial');
    expect((await puntosV2('cierre')).find((p) => p.corte)?.corte).toBe('dia');
  });

  it('la plantilla v2 no se edita ni se borra', async () => {
    expect(await falla(null, `update franq_plantilla_puntos set cada_min = 30`)).toMatch(/no se editan/);
    expect(await falla(null, `delete from franq_plantilla_secciones`)).toMatch(/no se editan/);
  });
});

describe('migración 79 · rondas', () => {
  it('cada ronda es un registro propio con hora del servidor; repetir no corrige al anterior', async () => {
    const banos = (await puntosV2('durante')).find((p) => p.actividad === 'Revisar baños')!;
    const a = await responder(tienda, 'durante', banos.id, true, null, ana);
    const b = await responder(tienda, 'durante', banos.id, true, null, beto);
    expect(b.id).not.toBe(a.id);
    const r = await filas(
      tienda,
      'select nombre, corrige_id, registrado_en from franq_respuestas where punto_id = $1 order by id',
      [banos.id],
    );
    expect(r.map((x) => x.nombre)).toEqual(['Ana', 'Beto']);
    expect(r.every((x) => x.corrige_id === null && x.registrado_en)).toBe(true);
  });

  it('una ronda con dato exige el dato en un «Sí» y lo guarda; un «No» exige observación', async () => {
    const cold = (await puntosV2('durante')).find((p) => p.actividad === 'Revisar cold brew')!;
    expect(
      await falla(tienda, 'select public.franq_responder(514,$1,$2,true,null,$3,$4)', [
        'durante',
        cold.id,
        ana,
        'x',
      ]),
    ).toMatch(/Anota inicio de extracción/);
    const ok = await responder(tienda, 'durante', cold.id, true, null, ana, '8:00 · 3/4');
    expect((await uno(tienda, 'select dato from franq_respuestas where id = $1', [ok.id])).dato).toBe(
      '8:00 · 3/4',
    );
    expect(
      await falla(tienda, 'select public.franq_responder(514,$1,$2,false,$3,$4,$5)', [
        'durante',
        cold.id,
        ' ',
        ana,
        'x',
      ]),
    ).toMatch(/Observaciones/);
    await responder(tienda, 'durante', cold.id, false, 'Sin filtro de repuesto', ana);
  });

  it('el gerente corrige una ronda con motivo; una ronda corregida ya no se corrige otra vez', async () => {
    const san = (await puntosV2('durante')).find((p) => p.actividad === 'Cambiar sanitizantes')!;
    const r = await responder(tienda, 'durante', san.id, false, 'No había cloro', ana);
    expect(await falla(tienda, `select public.franq_corregir($1,true,null,'Sí había','x')`, [r.id])).toMatch(
      /Solo el gerente/,
    );
    const c = await uno(gerente, `select public.franq_corregir($1,true,null,'Había en bodega','x') id`, [
      r.id,
    ]);
    expect(
      (await uno(gerente, 'select corrige_id from franq_respuestas where id = $1', [c.id])).corrige_id,
    ).toBe(r.id);
    expect(
      await falla(gerente, `select public.franq_corregir($1,false,'otra','otra vez','x')`, [r.id]),
    ).toMatch(/más reciente/);
  });

  it('avisos: cada «No» vigente de las rondas llega al gerente; el corregido no', async () => {
    const dia = (await db.query<F>('select public.franq_dia_operacion() d')).rows[0].d;
    const avisos = await filas(
      gerente,
      'select tipo, seccion, punto, observacion from franq_avisos($1,$2,$2)',
      [E, dia],
    );
    expect(avisos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          seccion: 'durante',
          punto: 'Revisar cold brew',
          observacion: 'Sin filtro de repuesto',
        }),
      ]),
    );
    expect(avisos.find((a) => a.observacion === 'No había cloro')).toBeUndefined();
    expect(await filas(gerenteOtra, 'select * from franq_respuestas')).toEqual([]);
  });
});

describe('migración 79 · firmas y visto bueno', () => {
  it('las rondas no bloquean; el cierre pide sus puntos únicos (con su dato) y luego el visto bueno del gerente', async () => {
    const cierre = await puntosV2('cierre');
    expect(
      await falla(tienda, `select public.franq_firmar(514,'cierre','responsable',$1,'x')`, [ana]),
    ).toMatch(/Faltan 11 puntos/);
    for (const p of cierre) await responder(tienda, 'cierre', p.id, true, null, beto, p.dato ? 'ok' : null);
    expect(
      await falla(tienda, `select public.franq_firmar(514,'cierre','visto_bueno',$1,'x')`, [ana]),
    ).toMatch(/gerente o el franquiciatario/);
    expect(await falla(gerente, `select public.franq_firmar(514,'cierre','visto_bueno',null,'x')`)).toMatch(
      /Primero firma el responsable/,
    );
    await uno(tienda, `select public.franq_firmar(514,'cierre','responsable',$1,'x') id`, [beto]);
    await uno(gerente, `select public.franq_firmar(514,'cierre','visto_bueno',null,'x') id`);
    const f = await filas(gerente, `select tipo, nombre from franq_firmas order by id`);
    expect(f.map((x) => x.tipo)).toEqual(['responsable', 'visto_bueno']);
  });

  it('durante no lleva firma', async () => {
    expect(
      await falla(tienda, `select public.franq_firmar(514,'durante','responsable',$1,'x')`, [ana]),
    ).toMatch(/no lleva la firma/);
  });

  it('un punto único con dato lo exige en el «Sí»', async () => {
    const etiquetas = (await puntosV2('apertura')).find((p) => p.dato)!;
    expect(
      await falla(tienda, 'select public.franq_responder(514,$1,$2,true,null,$3,$4)', [
        'apertura',
        etiquetas.id,
        ana,
        'x',
      ]),
    ).toMatch(/Anota/);
    await responder(tienda, 'apertura', etiquetas.id, true, null, ana, 'Leche de avena (mañana)');
  });
});

describe('migración 79 · convivencia con la v1', () => {
  it('un checklist del día empezado con la v1 sigue aceptando sus puntos v1 y rechaza los de la v2', async () => {
    const dia = (await db.query<F>('select public.franq_dia_operacion() d')).rows[0].d;
    const sec = await db.query<F>(
      `select s.id from franq_plantilla_secciones s join franq_plantillas pl on pl.id = s.plantilla_id
       where pl.version = 1 and s.clave = 'cambio'`,
    );
    // Simula un día que empezó antes de aplicar la migración: checklist «cambio» con la sección v1.
    await db.query(
      `insert into franq_checklists (company_id, dia, seccion, seccion_id) values ($1,$2,'cambio',$3)`,
      [E, dia, sec.rows[0].id],
    );
    const v1 = await db.query<F>(
      `select id from franq_plantilla_puntos where seccion_id = $1 order by orden`,
      [sec.rows[0].id],
    );
    await responder(tienda, 'cambio', Number(v1.rows[0].id), true, null, ana);
    const v2 = (await puntosV2('medio'))[0];
    expect(
      await falla(tienda, 'select public.franq_responder(514,$1,$2,true,null,$3,$4)', [
        'cambio',
        v2.id,
        ana,
        'x',
      ]),
    ).toMatch(/no pertenece/);
  });
});
