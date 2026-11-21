import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo } from './utilidades';

// Migración 92: matriz de roles por posición y mermas con tolerancia.
let db: PGlite;
let gerente: string;
let tienda: string;
let ajeno: string;
let ana: number;
let beto: number;
let leche: number;
let vasos: number;
let hoy: string;
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
const lunesDe = (d: string) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
};
const mas = (d: string, n: number) =>
  new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const merma = (u: string, o: Partial<Record<string, unknown>> = {}) =>
  uno(u, 'select public.franq_registrar_merma($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) id', [
    E,
    o.insumo ?? leche,
    o.cantidad ?? 250,
    o.motivo ?? 'caducidad',
    o.nota ?? null,
    o.barista === undefined ? ana : o.barista,
    'tablet',
    o.corrige ?? null,
    o.anular ?? false,
    o.motivoCorr ?? null,
  ]).then((r) => Number(r.id));

beforeAll(async () => {
  db = await crearDbLocal();
  gerente = await crearUsuario(db, 'franquiciado');
  tienda = await crearUsuario(db, 'tienda');
  ajeno = await crearUsuario(db, 'franquiciado');
  for (const u of [gerente, tienda, ajeno]) await darModulo(db, u, 'franquiciatarios', 'lectura');
  await db.query(
    `insert into franq_miembros (user_id, company_id, rol) values ($1,$4,'gerente'),($2,$4,'barista'),($3,$5,'gerente')`,
    [gerente, tienda, ajeno, E, OTRA],
  );
  ana = Number((await uno(gerente, `select public.franq_barista_guardar($1,null,'Ana',true) id`, [E])).id);
  beto = Number((await uno(gerente, `select public.franq_barista_guardar($1,null,'Beto',true) id`, [E])).id);
  leche = Number(
    (await uno(gerente, `select public.franq_insumo_guardar($1,null,'Leche entera','litro',1,true) id`, [E]))
      .id,
  );
  vasos = Number(
    (await uno(gerente, `select public.franq_insumo_guardar($1,null,'Vasos 16 oz','pieza',2,true) id`, [E]))
      .id,
  );
  hoy = (await db.query<F>('select public.franq_dia_operacion(now())::text d')).rows[0].d;
});
afterAll(async () => db.close());

describe('migración 92 · matriz de roles', () => {
  it('la lista base se siembra una vez y solo la gerencia la pide', async () => {
    expect(await falla(tienda, 'select public.franq_roles_base($1)', [E])).toMatch(/gerente/);
    expect(Number((await uno(gerente, 'select public.franq_roles_base($1) n', [E])).n)).toBe(7);
    expect(Number((await uno(gerente, 'select public.franq_roles_base($1) n', [E])).n)).toBe(0);
    const p = await filas(
      tienda,
      'select nombre from franq_posiciones where company_id = $1 order by orden',
      [E],
    );
    expect(p.map((x) => x.nombre)).toEqual([
      'Caja/Mostrador',
      'Barra caliente',
      'Barra fría',
      'Alimentos',
      'Rappi/Delivery',
    ]);
    const t = await filas(
      tienda,
      'select nombre, entrada::text, salida::text from franq_turnos where company_id = $1 order by orden',
      [E],
    );
    expect(t).toEqual([
      { nombre: 'Matutino', entrada: '07:00:00', salida: '15:00:00' },
      { nombre: 'Vespertino', entrada: '15:00:00', salida: '22:00:00' },
    ]);
    expect(await filas(ajeno, 'select * from franq_posiciones where company_id = $1', [E])).toEqual([]);
  });

  it('posiciones y turnos se editan y desactivan, nunca se borran', async () => {
    const id = Number(
      (
        await uno(gerente, `select public.franq_posicion_guardar($1,null,'Barra de métodos',null,true) id`, [
          E,
        ])
      ).id,
    );
    expect(
      await falla(gerente, `select public.franq_posicion_guardar($1,null,'barra de MÉTODOS',null,true)`, [E]),
    ).toMatch(/Ya hay/);
    await uno(gerente, `select public.franq_posicion_guardar($1,$2,'Barra de métodos',null,false)`, [E, id]);
    expect(await falla(null, 'delete from franq_posiciones where id = $1', [id])).toMatch(/No se borran/);
    const t = Number(
      (
        await uno(gerente, `select public.franq_turno_guardar($1,null,'Nocturno','22:00','02:00',true) id`, [
          E,
        ])
      ).id,
    );
    expect(t).toBeGreaterThan(0);
    expect(
      await falla(gerente, `select public.franq_turno_guardar($1,null,'Malo','10:00','10:00',true)`, [E]),
    ).toMatch(/horas/);
    expect(
      await falla(tienda, `select public.franq_turno_guardar($1,null,'X','10:00','11:00',true)`, [E]),
    ).toMatch(/gerente/);
  });

  it('asignar es idempotente; quitar anula al vigente; la cuenta de baristas solo lee', async () => {
    const turno = Number(
      (await uno(gerente, `select id from franq_turnos where company_id=$1 and nombre='Matutino'`, [E])).id,
    );
    const caja = Number(
      (
        await uno(
          gerente,
          `select id from franq_posiciones where company_id=$1 and nombre='Caja/Mostrador'`,
          [E],
        )
      ).id,
    );
    const a1 = await uno(gerente, 'select public.franq_asignar($1,$2,$3,$4,$5,false) id', [
      E,
      hoy,
      turno,
      caja,
      ana,
    ]);
    const a2 = await uno(gerente, 'select public.franq_asignar($1,$2,$3,$4,$5,false) id', [
      E,
      hoy,
      turno,
      caja,
      ana,
    ]);
    expect(a2.id).toBe(a1.id);
    await uno(gerente, 'select public.franq_asignar($1,$2,$3,$4,$5,false)', [E, hoy, turno, caja, beto]);
    await uno(gerente, 'select public.franq_asignar($1,$2,$3,$4,$5,true)', [E, hoy, turno, caja, ana]);
    const vig = await filas(
      tienda,
      `select a.barista_id from franq_asignaciones a where a.company_id=$1 and a.dia=$2 and not a.anulada
         and not exists (select 1 from franq_asignaciones x where x.corrige_id = a.id)`,
      [E, hoy],
    );
    expect(vig.map((x) => Number(x.barista_id))).toEqual([beto]);
    expect(
      await falla(tienda, 'select public.franq_asignar($1,$2,$3,$4,$5,false)', [E, hoy, turno, caja, ana]),
    ).toMatch(/gerente/);
    expect(
      await falla(gerente, 'select public.franq_asignar($1,$2,$3,$4,$5,false)', [
        E,
        mas(hoy, -30),
        turno,
        caja,
        ana,
      ]),
    ).toMatch(/7 días/);
    expect(await falla(null, 'update franq_asignaciones set anulada = true')).toMatch(/no se editan/);
  });

  it('copiar la semana anterior solo llena días vacíos', async () => {
    const turno = Number(
      (await uno(gerente, `select id from franq_turnos where company_id=$1 and nombre='Vespertino'`, [E])).id,
    );
    const fria = Number(
      (await uno(gerente, `select id from franq_posiciones where company_id=$1 and nombre='Barra fría'`, [E]))
        .id,
    );
    const lunes = lunesDe(hoy);
    const sig = mas(lunes, 7);
    await uno(gerente, 'select public.franq_asignar($1,$2,$3,$4,$5,false)', [
      E,
      mas(lunes, 6),
      turno,
      fria,
      ana,
    ]);
    // El martes siguiente ya tiene asignación: no se toca.
    await uno(gerente, 'select public.franq_asignar($1,$2,$3,$4,$5,false)', [
      E,
      mas(sig, 1),
      turno,
      fria,
      beto,
    ]);
    const n = Number((await uno(gerente, 'select public.franq_copiar_semana($1,$2) n', [E, sig])).n);
    expect(n).toBeGreaterThanOrEqual(1);
    const domingo = await filas(
      gerente,
      'select barista_id from franq_asignaciones where company_id=$1 and dia=$2',
      [E, mas(sig, 6)],
    );
    expect(domingo.map((x) => Number(x.barista_id))).toEqual([ana]);
    expect(await falla(gerente, 'select public.franq_copiar_semana($1,$2)', [E, mas(sig, 1)])).toMatch(
      /lunes/,
    );
  });
});

describe('migración 92 · mermas', () => {
  it('la cuenta de baristas registra con su nombre; «Otro» pide nota; insumo de otra sucursal no', async () => {
    const id = await merma(tienda);
    const r = await uno(
      gerente,
      'select nombre, dia::text, cantidad::float8 c from franq_mermas where id = $1',
      [id],
    );
    expect(r).toEqual({ nombre: 'Ana', dia: hoy, c: 250 });
    expect(
      await falla(tienda, 'select public.franq_registrar_merma($1,$2,1,$3,null,$4,null,null,false,null)', [
        E,
        leche,
        'otro',
        ana,
      ]),
    ).toMatch(/Otro/);
    expect(
      await falla(tienda, 'select public.franq_registrar_merma($1,$2,0,$3,null,$4,null,null,false,null)', [
        E,
        leche,
        'caida',
        ana,
      ]),
    ).toMatch(/cantidad/);
    expect(
      await falla(tienda, 'select public.franq_registrar_merma($1,$2,1,$3,null,null,null,null,false,null)', [
        E,
        leche,
        'caida',
      ]),
    ).toMatch(/Elige tu nombre/);
    expect(
      await falla(ajeno, 'select public.franq_registrar_merma($1,$2,1,$3,null,null,null,null,false,null)', [
        E,
        leche,
        'caida',
      ]),
    ).toMatch(/acceso/);
  });

  it('corregir y anular dejan historial; el vigente es el último', async () => {
    const id = await merma(tienda, { insumo: vasos, cantidad: 3, motivo: 'caida' });
    const c = await merma(tienda, { insumo: vasos, cantidad: 2, motivo: 'caida', corrige: id });
    expect(
      await falla(tienda, 'select public.franq_registrar_merma($1,$2,1,$3,null,$4,null,$5,false,null)', [
        E,
        vasos,
        'caida',
        ana,
        id,
      ]),
    ).toMatch(/vigente/);
    await merma(tienda, { corrige: c, anular: true });
    const vig = await filas(
      gerente,
      `select m.insumo_id, m.cantidad::float8 c from franq_mermas m where m.company_id=$1 and not m.anulada
         and not exists (select 1 from franq_mermas x where x.corrige_id = m.id) order by m.id`,
      [E],
    );
    expect(vig.map((x) => [Number(x.insumo_id), x.c])).toEqual([[leche, 250]]);
    expect(await falla(null, 'delete from franq_mermas')).toMatch(/no se editan/);
  });

  it('con el día cerrado, el barista ya no registra y la gerencia necesita motivo', async () => {
    expect(await falla(tienda, 'select public.franq_cerrar_mermas($1,$2)', [E, hoy])).toMatch(/gerente/);
    expect(await falla(gerente, 'select public.franq_cerrar_mermas($1,$2)', [E, mas(hoy, 1)])).toMatch(
      /hoy o un día anterior/,
    );
    await uno(gerente, 'select public.franq_cerrar_mermas($1,$2)', [E, hoy]);
    await uno(gerente, 'select public.franq_cerrar_mermas($1,$2)', [E, hoy]); // una vez; repetir no falla
    expect(
      await falla(tienda, 'select public.franq_registrar_merma($1,$2,1,$3,null,$4,null,null,false,null)', [
        E,
        leche,
        'caida',
        ana,
      ]),
    ).toMatch(/cerraron/);
    expect(
      await falla(gerente, 'select public.franq_registrar_merma($1,$2,1,$3,null,null,null,null,false,null)', [
        E,
        leche,
        'caida',
      ]),
    ).toMatch(/motivo del cambio/);
    expect(
      await merma(gerente, { barista: null, cantidad: 100, motivoCorr: 'Se olvidó en el cierre' }),
    ).toBeGreaterThan(0);
  });

  it('tolerancia: solo gestores la guardan y la leen; el último registro manda', async () => {
    expect(await falla(tienda, 'select public.franq_tolerancia_guardar($1,$2,5)', [E, leche])).toMatch(
      /gerente/,
    );
    expect(await falla(gerente, 'select public.franq_tolerancia_guardar($1,$2,150)', [E, leche])).toMatch(
      /0 a 100/,
    );
    await uno(gerente, 'select public.franq_tolerancia_guardar($1,$2,5)', [E, leche]);
    await uno(gerente, 'select public.franq_tolerancia_guardar($1,$2,4.5)', [E, leche]);
    const t = await uno(
      gerente,
      'select pct::float8 p from franq_merma_tolerancias where insumo_id = $1 order by id desc limit 1',
      [leche],
    );
    expect(t.p).toBe(4.5);
    expect(await filas(tienda, 'select * from franq_merma_tolerancias')).toEqual([]);
  });

  it('un token OAuth (MCP) no lee mermas ni asignaciones', async () => {
    const n = await como(gerente, async () => {
      await db.query(`select set_config('request.jwt.claims', $1, false)`, [
        JSON.stringify({ sub: gerente, client_id: 'mcp' }),
      ]);
      try {
        const a = (await db.query<F>('select count(*)::int n from franq_mermas')).rows[0].n;
        const b = (await db.query<F>('select count(*)::int n from franq_asignaciones')).rows[0].n;
        return a + b;
      } finally {
        await db.query(`select set_config('request.jwt.claims', '', false)`);
      }
    });
    expect(n).toBe(0);
  });
});
