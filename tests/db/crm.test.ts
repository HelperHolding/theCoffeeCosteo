import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

let db: PGlite;
let dev: string, lector: string, sinCrm: string, inactivo: string;
let firma: string, busqueda: string;

const darCrm = (id: string, nivel: string) =>
  db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'crm', $2)`, [id, nivel]);
const etapa = async (nombre: string) =>
  (
    await db.query<{ id: string }>(`select id from crm_etapas where embudo = 'tiendas' and nombre = $1`, [
      nombre,
    ])
  ).rows[0].id;
async function comoOauth<T>(userId: string, fn: () => Promise<T>) {
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [
    JSON.stringify({ client_id: 'claude-client' }),
  ]);
  try {
    return await comoUsuario(db, userId, fn);
  } finally {
    await db.query(`select set_config('request.jwt.claims', '', false)`);
  }
}
async function crearTienda(userId: string, nombre = 'Tienda Prueba') {
  return comoUsuario(
    db,
    userId,
    async () =>
      (
        await db.query<{ id: string; version: number }>(
          `insert into crm_tiendas (nombre, etapa_id) values ($1, $2) returning id, version`,
          [nombre, firma],
        )
      ).rows[0],
  );
}

beforeAll(async () => {
  db = await crearDbLocal();
  dev = await crearUsuario(db, 'admin');
  lector = await crearUsuario(db, 'compras');
  sinCrm = await crearUsuario(db, 'admin');
  inactivo = await crearUsuario(db, 'operaciones');
  await darCrm(dev, 'desarrollador');
  await darCrm(lector, 'lectura');
  await darCrm(inactivo, 'desarrollador');
  await db.query('update perfiles set activo = false where user_id = $1', [inactivo]);
  firma = await etapa('Firma de contrato');
  busqueda = await etapa('En búsqueda de local');
});
afterAll(async () => db.close());

describe('acceso al CRM', () => {
  it('siembra las 15 etapas aprobadas de tiendas en orden', async () => {
    const r = await db.query<{ nombre: string }>(
      `select nombre from crm_etapas where embudo = 'tiendas' order by orden`,
    );
    expect(r.rows.map((x) => x.nombre)).toEqual([
      'Firma de contrato',
      'En búsqueda de local',
      'Local aprobado por México',
      'Local aprobado por Brasil',
      'Arquitecta Asignada',
      'Proyecto 3D Entregado',
      'Proyecto Ejecutivo Entregado',
      'En remodelación',
      'Entrega de local',
      'Agenda de capacitación',
      'Operando',
      'Standby',
      'Modificaciones pendientes',
      'Cancelada',
      'Cerrada',
    ]);
  });

  it('un perfil de Costeo sin el módulo no ve ni escribe nada del CRM', async () => {
    await crearTienda(dev, 'Visible solo con módulo');
    await comoUsuario(db, sinCrm, async () => {
      expect((await db.query('select id from crm_tiendas')).rows).toHaveLength(0);
      expect((await db.query('select id from crm_etapas')).rows).toHaveLength(0);
      await expect(
        db.query(`insert into crm_tiendas (nombre, etapa_id) values ('X', $1)`, [firma]),
      ).rejects.toThrow(/row-level security/);
      // Costeo sigue igual para ese perfil.
      expect((await db.query('select id from tamanos')).rows.length).toBeGreaterThan(0);
    });
  });

  it('lectura ve pero no crea ni edita', async () => {
    const t = await crearTienda(dev, 'Para lector');
    await comoUsuario(db, lector, async () => {
      expect((await db.query('select id from crm_tiendas where id = $1', [t.id])).rows).toHaveLength(1);
      await expect(
        db.query(`insert into crm_notas (contenido, tienda_id) values ('x', $1)`, [t.id]),
      ).rejects.toThrow(/row-level security/);
      expect(
        (await db.query(`update crm_tiendas set ciudad = 'X' where id = $1 returning id`, [t.id])).rows,
      ).toHaveLength(0);
    });
  });

  it('un token OAuth (MCP) no lee ni escribe el CRM aunque el usuario sea desarrollador', async () => {
    const t = await crearTienda(dev, 'Oculta a OAuth');
    await comoOauth(dev, async () => {
      expect((await db.query('select id from crm_tiendas')).rows).toHaveLength(0);
      expect((await db.query('select * from perfil_modulos')).rows).toHaveLength(0);
      expect(
        (await db.query(`update crm_tiendas set ciudad = 'X' where id = $1 returning id`, [t.id])).rows,
      ).toHaveLength(0);
      await expect(
        db.query(`insert into crm_tiendas (nombre, etapa_id) values ('X', $1)`, [firma]),
      ).rejects.toThrow(/row-level security/);
    });
  });

  it('un perfil inactivo pierde el acceso aunque tenga el módulo', async () => {
    await comoUsuario(db, inactivo, async () => {
      expect((await db.query('select id from crm_tiendas')).rows).toHaveLength(0);
    });
  });

  it('cada usuario solo ve su propia fila de módulos (salvo admin de Costeo)', async () => {
    await comoUsuario(db, lector, async () => {
      expect((await db.query<{ user_id: string }>('select user_id from perfil_modulos')).rows).toEqual([
        { user_id: lector },
      ]);
    });
  });

  it('nadie del portal accede al staging de Zoho', async () => {
    await comoUsuario(db, dev, async () => {
      await expect(db.query('select * from zoho_staging.registros')).rejects.toThrow(/permission denied/);
    });
  });
});

describe('integridad y auditoría', () => {
  it('sella autoría y versión, e impide falsificar la procedencia de Zoho', async () => {
    const r = await comoUsuario(
      db,
      dev,
      async () =>
        (
          await db.query<{ creado_por: string; version: number; zoho_record_id: string | null }>(
            `insert into crm_tiendas (nombre, etapa_id, zoho_record_id, creado_por) values ('Sellada', $1, 'falso', $2)
         returning creado_por, version, zoho_record_id`,
            [firma, lector],
          )
        ).rows[0],
    );
    expect(r).toEqual({ creado_por: dev, version: 1, zoho_record_id: null });
  });

  it('no se puede borrar una tienda: se archiva', async () => {
    const t = await crearTienda(dev, 'No borrable');
    await comoUsuario(db, dev, async () => {
      await expect(db.query('delete from crm_tiendas where id = $1', [t.id])).rejects.toThrow(
        /permission denied/,
      );
      await db.query('update crm_tiendas set archivado_en = now() where id = $1', [t.id]);
    });
    const h = await db.query<{ accion: string }>(
      `select accion from crm_historial where entidad_id = $1 order by id`,
      [t.id],
    );
    expect(h.rows.map((x) => x.accion)).toEqual(['creado', 'archivado']);
  });

  it('mueve tarjetas con concurrencia optimista y registra la etapa en el historial', async () => {
    const t = await crearTienda(dev, 'Kanban');
    await comoUsuario(db, dev, async () => {
      const r = await db.query<{ version: number }>('select (crm_mover_tienda($1, $2, 512, $3)).version', [
        t.id,
        busqueda,
        t.version,
      ]);
      expect(r.rows[0].version).toBe(t.version + 1);
      await expect(
        db.query('select crm_mover_tienda($1, $2, 10, $3)', [t.id, firma, t.version]),
      ).rejects.toThrow(/recarga el tablero/);
    });
    const h = await db.query<{ resumen: string; actor_id: string; origen: string }>(
      `select resumen, actor_id, origen from crm_historial where entidad_id = $1 and accion = 'etapa'`,
      [t.id],
    );
    expect(h.rows).toEqual([
      { resumen: 'Etapa: Firma de contrato → En búsqueda de local', actor_id: dev, origen: 'crm' },
    ]);
  });

  it('una tienda no acepta una etapa del embudo de prospectos', async () => {
    const p = await db.query<{ id: string }>(
      `insert into crm_etapas (embudo, nombre, orden) values ('prospectos', 'Contactado', 1) returning id`,
    );
    const t = await crearTienda(dev, 'Embudo equivocado');
    await comoUsuario(db, dev, async () => {
      await expect(
        db.query('update crm_tiendas set etapa_id = $1 where id = $2', [p.rows[0].id, t.id]),
      ).rejects.toThrow(/foreign key/);
    });
  });

  it('un movimiento solo de posición no ensucia el historial; renumerar reparte la columna', async () => {
    const a = await crearTienda(dev, 'A');
    await crearTienda(dev, 'B');
    const antes = (await db.query<{ n: number }>('select count(*)::int n from crm_historial')).rows[0].n;
    await comoUsuario(db, dev, async () => {
      await db.query('select crm_mover_tienda($1, $2, 0.5, $3)', [a.id, firma, a.version]);
      const n = await db.query<{ n: number }>('select crm_renumerar_etapa($1) n', [firma]);
      expect(n.rows[0].n).toBeGreaterThanOrEqual(2);
    });
    expect((await db.query<{ n: number }>('select count(*)::int n from crm_historial')).rows[0].n).toBe(
      antes,
    );
  });

  it('el historial es de solo lectura y no guarda el contenido de las notas', async () => {
    const t = await crearTienda(dev, 'Con nota');
    await comoUsuario(db, dev, async () => {
      const n = await db.query<{ id: string }>(
        `insert into crm_notas (contenido, tienda_id) values ('dato privado', $1) returning id`,
        [t.id],
      );
      await db.query(`update crm_notas set contenido = 'otro dato privado' where id = $1`, [n.rows[0].id]);
      await expect(
        db.query(
          `insert into crm_historial (entidad, entidad_id, accion, resumen) values ('x', $1, 'editado', 'x')`,
          [t.id],
        ),
      ).rejects.toThrow(/permission denied/);
    });
    const h = await db.query<{ todo: string }>(
      `select string_agg(resumen || coalesce(cambios::text, ''), ' ') todo from crm_historial where tienda_id = $1`,
      [t.id],
    );
    expect(h.rows[0].todo).not.toMatch(/dato privado/);
    expect(h.rows[0].todo).toMatch(/Nota agregada/);
  });

  it('marcar un ítem de checklist registra quién y cuándo', async () => {
    const t = await crearTienda(dev, 'Con checklist');
    const r = await comoUsuario(db, dev, async () => {
      const c = await db.query<{ id: string }>(
        `insert into crm_checklists (tienda_id, nombre) values ($1, 'Apertura') returning id`,
        [t.id],
      );
      const i = await db.query<{ id: string }>(
        `insert into crm_checklist_items (checklist_id, texto) values ($1, 'Alta en Google Maps') returning id`,
        [c.rows[0].id],
      );
      return (
        await db.query<{ completado_por: string; completado_en: string | null }>(
          'update crm_checklist_items set hecho = true where id = $1 returning completado_por, completado_en',
          [i.rows[0].id],
        )
      ).rows[0];
    });
    expect(r.completado_por).toBe(dev);
    expect(r.completado_en).not.toBeNull();
  });

  it('la importación (sin sesión) conserva los datos de Zoho y marca su origen', async () => {
    await db.query(`select set_config('app.origen', 'importacion', false)`);
    try {
      await db.query(
        `insert into crm_tiendas (nombre, etapa_id, zoho_record_id, zoho_module_api_name) values ('Importada', $1, 'z-1', 'Franquicias')`,
        [firma],
      );
    } finally {
      await db.query(`select set_config('app.origen', '', false)`);
    }
    const r = await db.query<{ zoho_record_id: string; accion: string; origen: string }>(
      `select t.zoho_record_id, h.accion, h.origen from crm_tiendas t join crm_historial h on h.entidad_id = t.id where t.nombre = 'Importada'`,
    );
    expect(r.rows).toEqual([{ zoho_record_id: 'z-1', accion: 'importado', origen: 'importacion' }]);
  });
});

describe('archivos', () => {
  it('la base genera la ruta y Storage solo acepta objetos con fila activa', async () => {
    const t = await crearTienda(dev, 'Con archivo');
    await comoUsuario(db, dev, async () => {
      const a = await db.query<{ id: string; ruta: string }>(
        `insert into crm_archivos (nombre, mime, tamano, tienda_id, ruta) values ('plano.pdf', 'application/pdf', 2048, $1, 'elegida/por/mi')
         returning id, ruta`,
        [t.id],
      );
      const { id, ruta } = a.rows[0];
      expect(ruta.startsWith(`${id}/`)).toBe(true);
      await db.query(`insert into storage.objects (bucket_id, name) values ('crm-archivos', $1)`, [ruta]);
      await expect(
        db.query(`insert into storage.objects (bucket_id, name) values ('crm-archivos', 'inventada/ruta')`),
      ).rejects.toThrow(/row-level security/);
      expect((await db.query('select id from storage.objects where name = $1', [ruta])).rows).toHaveLength(1);
      expect(
        (await db.query('delete from storage.objects where name = $1 returning id', [ruta])).rows,
      ).toHaveLength(0);
      await db.query('update crm_archivos set archivado_en = now() where id = $1', [id]);
      expect((await db.query('select id from storage.objects where name = $1', [ruta])).rows).toHaveLength(0);
    });
    await comoUsuario(db, sinCrm, async () => {
      expect(
        (await db.query(`select id from storage.objects where bucket_id = 'crm-archivos'`)).rows,
      ).toHaveLength(0);
    });
  });
});
