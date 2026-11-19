import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo } from './utilidades';

// Migración 75: módulo Franquiciatarios (roles por sucursal, baristas, checklists, firmas, incidencias y avisos).
let db: PGlite;
let admin: string; // fila del módulo con nivel desarrollador
let franquiciatario: string;
let gerente: string;
let tienda: string; // cuenta compartida de baristas
let gerenteOtra: string; // gerente de otra sucursal
let sinModulo: string; // membresía pero sin la fila del módulo
let costeo: string; // usuario interno de Costeo, sin el módulo
let ana: number;
let beto: number;
let puntosApertura: number[];
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
const servicio = async (sql: string, p: unknown[] = []) => {
  await db.exec('set role service_role');
  try {
    return await db.query<F>(sql, p);
  } finally {
    await db.exec('reset role');
  }
};
const responder = (
  u: string,
  punto: number,
  cumple: boolean,
  obs: string | null,
  barista: number | null,
  seccion = 'apertura',
  motivo: string | null = null,
) =>
  uno(u, 'select public.franq_responder($1,$2,$3,$4,$5,$6,$7,$8) id', [
    E,
    seccion,
    punto,
    cumple,
    obs,
    barista,
    'tablet prueba',
    motivo,
  ]);

beforeAll(async () => {
  db = await crearDbLocal();
  admin = await crearUsuario(db, 'admin');
  franquiciatario = await crearUsuario(db, 'franquiciado');
  gerente = await crearUsuario(db, 'franquiciado');
  tienda = await crearUsuario(db, 'tienda');
  gerenteOtra = await crearUsuario(db, 'franquiciado');
  sinModulo = await crearUsuario(db, 'franquiciado');
  costeo = await crearUsuario(db, 'compras');
  await darModulo(db, admin, 'franquiciatarios', 'desarrollador');
  for (const u of [franquiciatario, gerente, tienda, gerenteOtra])
    await darModulo(db, u, 'franquiciatarios', 'lectura');
  await db.query(
    `insert into franq_miembros (user_id, company_id, rol) values ($1,$5,'franquiciatario'),($2,$5,'gerente'),
     ($3,$5,'barista'),($4,$6,'gerente'),($7,$5,'gerente')`,
    [franquiciatario, gerente, tienda, gerenteOtra, E, OTRA, sinModulo],
  );
  ana = Number(
    (await uno(gerente, `select public.franq_barista_guardar($1,null,'Ana López',true) id`, [E])).id,
  );
  beto = Number(
    (await uno(gerente, `select public.franq_barista_guardar($1,null,'  Beto   Ruiz ',true) id`, [E])).id,
  );
  puntosApertura = (
    await db.query<F>(
      `select pt.id from franq_plantilla_puntos pt join franq_plantilla_secciones s on s.id = pt.seccion_id
       where s.clave = 'apertura' order by pt.orden`,
    )
  ).rows.map((r) => Number(r.id));
});
afterAll(async () => db.close());

describe('migración 75 · acceso', () => {
  it('perfiles acepta tienda y perfil_modulos acepta franquiciatarios', async () => {
    const r = await db.query<F>(`select rol from perfiles where user_id = $1`, [tienda]);
    expect(r.rows[0].rol).toBe('tienda');
  });

  it('franq_rol: cada rol en su sucursal; admin en todas; sin módulo o en otra sucursal, nada', async () => {
    const rol = async (u: string, c: number) => (await uno(u, 'select public.franq_rol($1) r', [c])).r;
    expect(await rol(admin, E)).toBe('admin');
    expect(await rol(admin, OTRA)).toBe('admin');
    expect(await rol(franquiciatario, E)).toBe('franquiciatario');
    expect(await rol(gerente, E)).toBe('gerente');
    expect(await rol(tienda, E)).toBe('barista');
    expect(await rol(gerente, OTRA)).toBeNull();
    expect(await rol(gerenteOtra, E)).toBeNull();
    expect(await rol(sinModulo, E)).toBeNull();
    expect(await rol(costeo, E)).toBeNull();
  });

  it('franq_rol niega tokens OAuth y perfiles inactivos', async () => {
    const r = await como(gerente, async () => {
      await db.query(`select set_config('request.jwt.claims', $1, false)`, [
        JSON.stringify({ sub: gerente, client_id: 'mcp' }),
      ]);
      try {
        return (await db.query<F>('select public.franq_rol($1) r', [E])).rows[0].r;
      } finally {
        await db.query(`select set_config('request.jwt.claims', '', false)`);
      }
    });
    expect(r).toBeNull();
    const inactivo = await crearUsuario(db, 'franquiciado');
    await darModulo(db, inactivo, 'franquiciatarios', 'lectura');
    await db.query(`insert into franq_miembros (user_id, company_id, rol) values ($1,$2,'gerente')`, [
      inactivo,
      E,
    ]);
    await db.query('update perfiles set activo = false where user_id = $1', [inactivo]);
    expect((await uno(inactivo, 'select public.franq_rol($1) r', [E])).r).toBeNull();
  });

  it('la cuenta de baristas solo puede ser barista, y una persona nunca lo es', async () => {
    expect(
      await falla(null, `insert into franq_miembros (user_id, company_id, rol) values ($1, 600, 'gerente')`, [
        tienda,
      ]),
    ).toMatch(/rol tienda/);
    expect(
      await falla(null, `insert into franq_miembros (user_id, company_id, rol) values ($1, 600, 'barista')`, [
        gerente,
      ]),
    ).toMatch(/rol tienda/);
  });

  it('los roles del módulo no leen Costeo ni los perfiles de otros', async () => {
    for (const u of [franquiciatario, gerente, tienda]) {
      expect(await filas(u, 'select * from recetas')).toEqual([]);
      expect(await filas(u, 'select * from insumos')).toEqual([]);
      expect((await filas(u, 'select user_id from perfiles')).map((f) => f.user_id)).toEqual([u]);
    }
  });

  it('escritura directa a las tablas está cerrada para authenticated', async () => {
    expect(
      await falla(
        gerente,
        `insert into franq_baristas (company_id, nombre, creado_por) values (514, 'Zoe', $1)`,
        [gerente],
      ),
    ).toMatch(/permission denied/);
    expect(
      await falla(
        gerente,
        `insert into franq_miembros (user_id, company_id, rol) values ($1, 600, 'gerente')`,
        [gerente],
      ),
    ).toMatch(/permission denied/);
  });
});

describe('migración 75 · nombres de baristas', () => {
  it('normaliza espacios y ve solo los de su sucursal', async () => {
    const nombres = (await filas(tienda, 'select nombre from franq_baristas order by id')).map(
      (f) => f.nombre,
    );
    expect(nombres).toEqual(['Ana López', 'Beto Ruiz']);
    expect(await filas(gerenteOtra, 'select * from franq_baristas')).toEqual([]);
  });

  it('solo gestores dan de alta; la cuenta de baristas y otra sucursal no', async () => {
    expect(await falla(tienda, `select public.franq_barista_guardar(514,null,'Carla',true)`)).toMatch(
      /Solo el gerente/,
    );
    expect(await falla(gerenteOtra, `select public.franq_barista_guardar(514,null,'Carla',true)`)).toMatch(
      /Solo el gerente/,
    );
    expect(await falla(gerente, `select public.franq_barista_guardar(514,null,'ana lópez',true)`)).toMatch(
      /Ya hay un barista activo/,
    );
    const id = (await uno(franquiciatario, `select public.franq_barista_guardar(514,null,'Carla',true) id`))
      .id;
    expect(Number(id)).toBeGreaterThan(0);
  });

  it('no se borran (ni como service_role) y conservan su alta', async () => {
    expect(await falla(null, 'delete from franq_baristas where id = $1', [ana])).toMatch(/no se borran/);
    await db.exec('set role service_role');
    try {
      await expect(db.query('delete from franq_baristas where id = $1', [ana])).rejects.toThrow(
        /no se borran/,
      );
    } finally {
      await db.exec('reset role');
    }
    expect(await falla(null, 'update franq_baristas set company_id = 532 where id = $1', [ana])).toMatch(
      /Solo cambian/,
    );
  });
});

describe('migración 75 · checklist', () => {
  it('la cuenta de baristas responde con un nombre activo de su sucursal; sin nombre, no', async () => {
    expect(
      await falla(tienda, `select public.franq_responder(514,'apertura',$1,true,null,null,'x')`, [
        puntosApertura[0],
      ]),
    ).toMatch(/Elige tu nombre/);
    const r = await responder(tienda, puntosApertura[0], true, null, ana);
    const f = await uno(
      tienda,
      'select nombre, barista_id, registrado_por, dispositivo, corrige_id from franq_respuestas where id = $1',
      [r.id],
    );
    expect(f).toMatchObject({
      nombre: 'Ana López',
      registrado_por: tienda,
      dispositivo: 'tablet prueba',
      corrige_id: null,
    });
    expect(Number(f.barista_id)).toBe(ana);
  });

  it('un «No» exige observación', async () => {
    expect(
      await falla(tienda, `select public.franq_responder(514,'apertura',$1,false,'  ',$2,'x')`, [
        puntosApertura[1],
        ana,
      ]),
    ).toMatch(/Observaciones/);
    await responder(tienda, puntosApertura[1], false, 'La alarma no armó', ana);
  });

  it('cambiar una respuesta crea un renglón nuevo ligado al anterior; repetir lo mismo no duplica', async () => {
    const a = await responder(tienda, puntosApertura[2], false, 'Tablet de Rappi sin red', beto);
    const igual = await responder(tienda, puntosApertura[2], false, 'Tablet de Rappi sin red', beto);
    expect(igual.id).toBe(a.id);
    const b = await responder(tienda, puntosApertura[2], true, null, beto);
    const fila = await uno(tienda, 'select corrige_id from franq_respuestas where id = $1', [b.id]);
    expect(fila.corrige_id).toBe(a.id);
    expect(
      (await filas(tienda, 'select id from franq_respuestas where punto_id = $1', [puntosApertura[2]]))
        .length,
    ).toBe(2);
  });

  it('un punto de otra sección no se acepta', async () => {
    const cierre = (
      await db.query<F>(`select pt.id from franq_plantilla_puntos pt join franq_plantilla_secciones s
      on s.id = pt.seccion_id where s.clave = 'cierre' limit 1`)
    ).rows[0].id;
    expect(
      await falla(tienda, `select public.franq_responder(514,'apertura',$1,true,null,$2,'x')`, [cierre, ana]),
    ).toMatch(/no pertenece/);
  });

  it('no se firma con puntos pendientes; con todos respondidos sí, una sola vez', async () => {
    expect(
      await falla(tienda, `select public.franq_firmar(514,'apertura','responsable',$1,'x')`, [ana]),
    ).toMatch(/Faltan 9 puntos/);
    for (const p of puntosApertura.slice(3)) await responder(tienda, p, true, null, ana);
    expect(await falla(tienda, `select public.franq_firmar(514,'apertura','entrega',$1,'x')`, [ana])).toMatch(
      /no lleva la firma/,
    );
    await uno(tienda, `select public.franq_firmar(514,'apertura','responsable',$1,'x') id`, [ana]);
    expect(
      await falla(tienda, `select public.franq_firmar(514,'apertura','responsable',$1,'x')`, [beto]),
    ).toMatch(/ya está registrada/);
  });

  it('firmada: el barista ya no cambia respuestas; el gerente corrige con motivo y se conserva el original', async () => {
    expect(
      await falla(tienda, `select public.franq_responder(514,'apertura',$1,false,'No había pan',$2,'x')`, [
        puntosApertura[9],
        ana,
      ]),
    ).toMatch(/ya está firmada/);
    expect(
      await falla(gerente, `select public.franq_responder(514,'apertura',$1,false,'No había pan',null,'x')`, [
        puntosApertura[9],
      ]),
    ).toMatch(/motivo/);
    const c = await responder(
      gerente,
      puntosApertura[9],
      false,
      'No había pan',
      null,
      'apertura',
      'Lo vi en la revisión',
    );
    const f = await uno(gerente, 'select nombre, motivo, corrige_id from franq_respuestas where id = $1', [
      c.id,
    ]);
    expect(f.nombre).toBe('Usuario franquiciado');
    expect(f.motivo).toBe('Lo vi en la revisión');
    expect(f.corrige_id).not.toBeNull();
    expect(
      (await filas(gerente, 'select id from franq_respuestas where punto_id = $1', [puntosApertura[9]]))
        .length,
    ).toBe(2);
  });

  it('franq_corregir: solo gestores, solo sobre el registro vigente y con motivo', async () => {
    const vigente = (
      await uno(gerente, 'select max(id) id from franq_respuestas where punto_id = $1', [puntosApertura[0]])
    ).id;
    expect(
      await falla(tienda, `select public.franq_corregir($1,false,'Llegó tarde Beto','Revisión','x')`, [
        vigente,
      ]),
    ).toMatch(/Solo el gerente/);
    expect(
      await falla(gerenteOtra, `select public.franq_corregir($1,false,'Llegó tarde Beto','Revisión','x')`, [
        vigente,
      ]),
    ).toMatch(/Solo el gerente/);
    expect(
      await falla(gerente, `select public.franq_corregir($1,false,'Llegó tarde Beto','','x')`, [vigente]),
    ).toMatch(/motivo/);
    await uno(
      franquiciatario,
      `select public.franq_corregir($1,false,'Llegó tarde Beto','Revisión de cámaras','x') id`,
      [vigente],
    );
    expect(await falla(gerente, `select public.franq_corregir($1,true,null,'otra','x')`, [vigente])).toMatch(
      /más reciente/,
    );
  });

  it('los registros no se editan ni se borran: ni el admin ni service_role', async () => {
    for (const t of ['franq_respuestas', 'franq_firmas', 'franq_checklists']) {
      expect(await falla(null, `delete from ${t}`)).toMatch(/no se editan ni se borran/);
    }
    expect(await falla(null, `update franq_respuestas set cumple = true`)).toMatch(/no se editan/);
    expect(await falla(admin, `update franq_respuestas set cumple = true`)).toMatch(
      /permission denied|no se editan/,
    );
    await db.exec('set role service_role');
    try {
      await expect(db.query('update franq_firmas set nombre = $1', ['X'])).rejects.toThrow(/no se editan/);
    } finally {
      await db.exec('reset role');
    }
    expect(await falla(null, `delete from franq_plantilla_puntos`)).toMatch(/no se editan/);
    expect(await falla(null, `update franq_plantillas set version = 9`)).toMatch(/versión nueva/);
  });

  it('cambio de turno: recibe va después de entrega y por otra persona', async () => {
    const puntos = (
      await db.query<F>(`select pt.id from franq_plantilla_puntos pt join franq_plantilla_secciones s
      on s.id = pt.seccion_id where s.clave = 'cambio' order by pt.orden`)
    ).rows.map((r) => Number(r.id));
    for (const p of puntos) await responder(tienda, p, true, null, beto, 'cambio');
    expect(await falla(tienda, `select public.franq_firmar(514,'cambio','recibe',$1,'x')`, [ana])).toMatch(
      /Primero firma/,
    );
    await uno(tienda, `select public.franq_firmar(514,'cambio','entrega',$1,'x') id`, [beto]);
    expect(await falla(tienda, `select public.franq_firmar(514,'cambio','recibe',$1,'x')`, [beto])).toMatch(
      /persona distinta/,
    );
    await uno(tienda, `select public.franq_firmar(514,'cambio','recibe',$1,'x') id`, [ana]);
  });

  it('un nombre desactivado ya no registra pero conserva su historial', async () => {
    await uno(gerente, `select public.franq_barista_guardar(514,$1,'Beto Ruiz',false) id`, [beto]);
    expect(await falla(tienda, `select public.franq_incidencia(514,'Se fue la luz',$1,'x')`, [beto])).toMatch(
      /Elige tu nombre/,
    );
    const hist = await filas(tienda, 'select id from franq_respuestas where barista_id = $1', [beto]);
    expect(hist.length).toBeGreaterThan(0);
    const activos = (await filas(tienda, 'select nombre from franq_baristas where activo order by id')).map(
      (f) => f.nombre,
    );
    expect(activos).not.toContain('Beto Ruiz');
  });
});

describe('migración 75 · incidencias y avisos', () => {
  it('los «No» vigentes y las incidencias llegan al gerente y al franquiciatario de esa sucursal, no a otra', async () => {
    await uno(tienda, `select public.franq_incidencia(514,'Se terminó la leche de avena',$1,'x') id`, [ana]);
    const dia = (await db.query<F>('select public.franq_dia_operacion() d')).rows[0].d;
    for (const u of [gerente, franquiciatario, admin]) {
      const avisos = await filas(u, 'select tipo, punto, observacion, nombre from franq_avisos($1,$2,$2)', [
        E,
        dia,
      ]);
      expect(avisos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            tipo: 'no',
            punto: 'Recorrido de seguridad',
            observacion: 'La alarma no armó',
            nombre: 'Ana López',
          }),
          expect.objectContaining({ tipo: 'no', punto: 'Vitrina', observacion: 'No había pan' }),
          expect.objectContaining({
            tipo: 'no',
            punto: 'Registro de entrada',
            observacion: 'Llegó tarde Beto',
          }),
          expect.objectContaining({ tipo: 'incidencia', observacion: 'Se terminó la leche de avena' }),
        ]),
      );
      // El «No» corregido a «Sí» (Sistemas y delivery) ya no es aviso.
      expect(avisos.find((a) => a.punto === 'Sistemas y delivery')).toBeUndefined();
    }
    expect(await falla(tienda, 'select * from franq_avisos(514, current_date, current_date)')).toMatch(
      /Solo el gerente/,
    );
    expect(await falla(gerenteOtra, 'select * from franq_avisos(514, current_date, current_date)')).toMatch(
      /Solo el gerente/,
    );
    expect(await filas(gerenteOtra, 'select * from franq_incidencias')).toEqual([]);
    expect(await filas(gerenteOtra, 'select * from franq_respuestas')).toEqual([]);
  });

  it('el día de operación cambia a las 4:00 de Ciudad de México', async () => {
    const d = async (t: string) =>
      (await db.query<F>('select public.franq_dia_operacion($1::timestamptz)::text d', [t])).rows[0].d;
    expect(await d('2026-11-20T09:59:00Z')).toBe('2026-11-19'); // 03:59 CDMX
    expect(await d('2026-11-20T10:00:00Z')).toBe('2026-11-20'); // 04:00 CDMX
  });
});
