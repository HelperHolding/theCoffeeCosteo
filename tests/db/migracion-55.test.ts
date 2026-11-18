import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 55 (doc 43 §5): los datos que cumplen un requisito los captura su área; el vendedor lo reasigna un head.
let db: PGlite;
let ventasHead: string, vendedora: string, otraVendedora: string, legal: string, proyectos: string;
let franq: string, sucursal: string;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const sql = (u: string, q: string, p: unknown[] = []) => como(u, () => db.query(q, p));

async function usuario(area: string, rol: string) {
  const id = await crearUsuario(db, 'compras');
  await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'crm', 'edicion')`, [id]);
  await db.query('insert into crm_membresias (user_id, area, rol) values ($1, $2, $3)', [id, area, rol]);
  return id;
}

beforeAll(async () => {
  db = await crearDbLocal();
  ventasHead = await usuario('ventas', 'head');
  vendedora = await usuario('ventas', 'miembro');
  otraVendedora = await usuario('ventas', 'miembro');
  legal = await usuario('legal', 'miembro');
  proyectos = await usuario('proyectos', 'miembro');
  franq = (
    await como(vendedora, () =>
      db.query<{ id: string }>(
        `insert into crm_franquiciatarios (nombre, correo, ciudad_interes, origen, territorio, responsable_id)
         values ('Mariana Ortiz', 'm@prueba.mx', 'Querétaro', 'Sitio web', 'disponible', $1) returning id`,
        [vendedora],
      ),
    )
  ).rows[0].id;
  // La sucursal la crea el sistema (sin usuario), como al formalizar.
  sucursal = (
    await db.query<{ id: string }>(
      `insert into crm_tiendas (nombre, embudo, etapa_id, franquiciatario_id)
       values ('Querétaro Juriquilla', 'general', crm_etapa('constancia'), $1) returning id`,
      [franq],
    )
  ).rows[0].id;
});
afterAll(async () => db.close());

it('la fecha límite solo la captura Legal; Ventas y Proyectos reciben el motivo', async () => {
  await expect(
    sql(vendedora, `update crm_tiendas set fecha_limite_apertura = '2027-03-01' where id = $1`, [sucursal]),
  ).rejects.toThrow(/Este dato lo captura Legal/);
  await expect(
    sql(proyectos, `update crm_tiendas set fecha_limite_apertura = '2027-03-01' where id = $1`, [sucursal]),
  ).rejects.toThrow(/Este dato lo captura Legal/);
  await sql(legal, `update crm_tiendas set fecha_limite_apertura = '2027-03-01' where id = $1`, [sucursal]);
  const h = await db.query<{ actor_id: string }>(
    `select actor_id from crm_historial where entidad = 'crm_tiendas' and entidad_id = $1 and cambios ? 'fecha_limite_apertura'`,
    [sucursal],
  );
  expect(h.rows.map((x) => x.actor_id)).toEqual([legal]);
});

it('los datos que no son requisito los edita cualquier editor, y un head captura todo', async () => {
  await sql(proyectos, `update crm_tiendas set direccion = 'Av. Juriquilla 100' where id = $1`, [sucursal]);
  await sql(ventasHead, `update crm_tiendas set fecha_estimada_apertura = '2027-02-01' where id = $1`, [
    sucursal,
  ]);
  await sql(proyectos, `update crm_tiendas set fecha_estimada_apertura = '2027-02-15' where id = $1`, [
    sucursal,
  ]);
  const r = await db.query<{ direccion: string; fecha_estimada_apertura: string }>(
    `select direccion, fecha_estimada_apertura::text from crm_tiendas where id = $1`,
    [sucursal],
  );
  expect(r.rows[0]).toEqual({ direccion: 'Av. Juriquilla 100', fecha_estimada_apertura: '2027-02-15' });
});

it('el vendedor no se cambia a mano: un head lo reasigna con motivo y a alguien de Ventas', async () => {
  await expect(
    sql(vendedora, 'update crm_franquiciatarios set responsable_id = $2 where id = $1', [
      franq,
      otraVendedora,
    ]),
  ).rejects.toThrow(/lo reasigna un head/);
  await expect(
    sql(vendedora, 'select crm_reasignar_vendedor($1, $2, $3)', [
      franq,
      otraVendedora,
      'Cambio de plaza de la vendedora',
    ]),
  ).rejects.toThrow(/Solo un head/);
  await expect(
    sql(ventasHead, 'select crm_reasignar_vendedor($1, $2, $3)', [franq, otraVendedora, 'corto']),
  ).rejects.toThrow(/al menos 15/);
  await expect(
    sql(ventasHead, 'select crm_reasignar_vendedor($1, $2, $3)', [
      franq,
      legal,
      'Cambio de plaza de la vendedora',
    ]),
  ).rejects.toThrow(/debe ser de Ventas/);
  await sql(ventasHead, 'select crm_reasignar_vendedor($1, $2, $3)', [
    franq,
    otraVendedora,
    'Cambio de plaza de la vendedora',
  ]);
  const f = await db.query<{ responsable_id: string }>(
    'select responsable_id from crm_franquiciatarios where id = $1',
    [franq],
  );
  expect(f.rows[0].responsable_id).toBe(otraVendedora);
  const h = await db.query<{ accion: string; motivo: string; actor_id: string }>(
    `select accion, motivo, actor_id from crm_historial where entidad = 'crm_franquiciatarios' and entidad_id = $1
     and accion = 'responsable'`,
    [franq],
  );
  expect(h.rows).toEqual([
    { accion: 'responsable', motivo: 'Cambio de plaza de la vendedora', actor_id: ventasHead },
  ]);
  // La bandera de la función no se queda prendida en la sesión.
  await expect(
    sql(vendedora, 'update crm_franquiciatarios set responsable_id = $2 where id = $1', [franq, vendedora]),
  ).rejects.toThrow(/lo reasigna un head/);
});

it('los procesos del sistema no pasan por el candado', async () => {
  await db.query(`select set_config('app.origen', 'sistema', false)`);
  await db.query(`update crm_tiendas set fecha_limite_apertura = '2027-04-01' where id = $1`, [sucursal]);
  await db.query(`select set_config('app.origen', '', false)`);
});
