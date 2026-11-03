import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { limpiar, mapear, revertirMapeo, SIN_FRANQUICIATARIO } from '../../lib/crm/muestra';
import { comoUsuario, crearUsuario } from './utilidades';

// Mapeo de la muestra (doc 40 §8) y limpieza para el arranque, probados en local. No se ejecutan en producción.
let db: PGlite;
let dev: string;
const etapa = async (embudo: string, nombre: string) =>
  (await db.query<{ id: string }>('select id from crm_etapas where embudo = $1 and nombre = $2', [embudo, nombre])).rows[0].id;

beforeAll(async () => {
  db = await crearDbLocal();
  dev = await crearUsuario(db, 'admin');
  await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'crm', 'desarrollador')`, [dev]);
  await db.query(`insert into crm_etapas (embudo, nombre, orden) values
    ('prospectos', 'Contactado', 1), ('prospectos', 'Interes en Zona Bloqueada', 2), ('prospectos', 'Lead Basura', 3),
    ('prospectos', 'Nuevo Franquiciatario', 4)`);
  const ahora = new Date().toISOString();
  // Prospectos: sin estado, contactado, zona bloqueada, basura y nuevo franquiciatario (simula la importación).
  for (const [n, est] of [
    ['A', null],
    ['B', 'Contactado'],
    ['C', 'Interes en Zona Bloqueada'],
    ['D', 'Lead Basura'],
    ['E', 'Nuevo Franquiciatario'],
  ] as const)
    await db.query(
      `insert into crm_prospectos (apellidos, ciudad_interes, etapa_id, imported_at) values ($1, 'León', $2, $3)`,
      [n, est ? await etapa('prospectos', est) : null, ahora],
    );
  // Tiendas: dos de un mismo franquiciatario (escrito distinto), una sin franquiciatario, una operando.
  for (const [nombre, fr, et] of [
    ['T1', 'Grupo Norte', 'Firma de contrato'],
    ['T2', ' grupo norte ', 'Local aprobado por México'],
    ['T3', null, 'En remodelación'],
    ['T4', 'Café Sur', 'Operando'],
  ] as const)
    await db.query(
      `insert into crm_tiendas (nombre, franquiciatario, etapa_id, fecha_programada_arranque, imported_at)
       values ($1, $2, $3, '2027-03-01', $4)`,
      [nombre, fr, await etapa('tiendas', et), ahora],
    );
});
afterAll(async () => db.close());

describe('mapeo de la muestra', () => {
  it('el ensayo no escribe nada', async () => {
    const r = await mapear(db, { ensayo: true });
    expect(r.aplicado).toBe(false);
    expect((await db.query<{ n: number }>('select count(*)::int n from crm_franquiciatarios')).rows[0].n).toBe(0);
  });

  it('mapea prospectos y tiendas con las reglas aprobadas y guarda la etapa original', async () => {
    const r = await mapear(db);
    expect(r).toMatchObject({ aplicado: true, franquiciatariosDeProspectos: 5, franquiciatariosDeTiendas: 3, sucursales: 4 });
    expect(r.conteos).toMatchObject({
      recepcion: 2, // sin estado + zona bloqueada (Q3)
      contacto: 1,
      bienvenida: 1,
      descartada: 1,
      formalizado: 3,
      locales: 1,
      constancia: 1,
      p_remodelacion: 1,
      operando: 1,
    });
    const bloqueado = await db.query<{ territorio: string }>(
      `select f.territorio from crm_franquiciatarios f join crm_prospectos p on p.id = f.prospecto_id where p.apellidos = 'C'`,
    );
    expect(bloqueado.rows[0].territorio).toBe('bloqueada');
    const norte = await db.query<{ n: number }>(
      `select count(*)::int n from crm_tiendas t join crm_franquiciatarios f on f.id = t.franquiciatario_id where f.nombre = 'Grupo Norte'`,
    );
    expect(norte.rows[0].n).toBe(2);
    const sin = await db.query<{ nombre: string }>(
      `select f.nombre from crm_tiendas t join crm_franquiciatarios f on f.id = t.franquiciatario_id where t.nombre = 'T3'`,
    );
    expect(sin.rows[0].nombre).toBe(SIN_FRANQUICIATARIO);
    const origen = await db.query<{ n: number }>(
      `select count(*)::int n from crm_tiendas where muestra and etapa_origen_id is not null and fecha_estimada_apertura = '2027-03-01'`,
    );
    expect(origen.rows[0].n).toBe(4);
    const h = await db.query<{ n: number }>(`select count(*)::int n from crm_historial where origen = 'sistema'`);
    expect(h.rows[0].n).toBeGreaterThan(0);
  });

  it('repetir no duplica', async () => {
    const r = await mapear(db);
    expect(r.aplicado).toBe(false);
    expect((await db.query<{ n: number }>('select count(*)::int n from crm_franquiciatarios')).rows[0].n).toBe(8);
  });

  it('la reversión regresa todo a los embudos de Zoho; se niega si hay trabajo de usuarios', async () => {
    const t = await db.query<{ id: string }>(`select id from crm_tiendas where nombre = 'T1'`);
    const n = await comoUsuario(db, dev, async () =>
      (
        await db.query<{ id: string }>(
          `insert into crm_notas (franquiciatario_id, contenido) select franquiciatario_id, 'x' from crm_tiendas where id = $1 returning id`,
          [t.rows[0].id],
        )
      ).rows[0],
    );
    await expect(revertirMapeo(db)).rejects.toThrow('registros de usuarios');
    await db.query(`select set_config('app.origen', 'sistema', false)`);
    await db.query('delete from crm_notas where id = $1', [n.id]);
    await db.query(`select set_config('app.origen', '', false)`);
    const r = await revertirMapeo(db);
    expect(r).toEqual({ sucursales: 4, franquiciatarios: 8 });
    const back = await db.query<{ embudo: string; nombre: string }>(
      `select t.embudo, e.nombre from crm_tiendas t join crm_etapas e on e.id = t.etapa_id where t.nombre = 'T2'`,
    );
    expect(back.rows[0]).toEqual({ embudo: 'tiendas', nombre: 'Local aprobado por México' });
  });
});

describe('limpieza para el arranque', () => {
  it('borra muestra e importados; conserva configuración y toda la bitácora', async () => {
    await mapear(db);
    const bitacoraAntes = (await db.query<{ n: number }>('select count(*)::int n from crm_historial')).rows[0].n;
    const ensayo = await limpiar(db, { ensayo: true });
    expect(ensayo.aplicado).toBe(false);
    expect((await db.query<{ n: number }>('select count(*)::int n from crm_tiendas')).rows[0].n).toBe(4);
    const r = await limpiar(db, { ensayo: false });
    expect(r.despues).toMatchObject({ franquiciatarios: 0, tiendas: 0, prospectos: 0, contactos: 0 });
    expect(r.despues.bitacora).toBeGreaterThan(bitacoraAntes);
    const conf = await db.query<{ etapas: number; requisitos: number; areas: number; accesos: number }>(
      `select (select count(*) from crm_etapas where embudo = 'general')::int etapas,
              (select count(*) from crm_requisitos)::int requisitos, (select count(*) from crm_areas)::int areas,
              (select count(*) from perfil_modulos)::int accesos`,
    );
    expect(conf.rows[0]).toEqual({ etapas: 22, requisitos: 37, areas: 4, accesos: 1 });
  });
});
