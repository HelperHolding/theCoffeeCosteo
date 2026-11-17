import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 61: crm_candados_todos devuelve las mismas filas que crm_v_candados, en un solo jsonb y con la RLS de
// quien llama.
let db: PGlite;
let conCrm: string, sinCrm: string;
const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);

beforeAll(async () => {
  db = await crearDbLocal();
  conCrm = await crearUsuario(db, 'compras');
  await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'crm', 'edicion')`, [
    conCrm,
  ]);
  sinCrm = await crearUsuario(db, 'compras');
  const franq = (
    await db.query<{ id: string }>(
      `insert into crm_franquiciatarios (nombre, correo, ciudad_interes, origen, territorio, etapa_id)
       values ('Mariana Ortiz', 'm@prueba.mx', 'Querétaro', 'Sitio web', 'disponible', crm_etapa('recepcion'))
       returning id`,
    )
  ).rows[0].id;
  await db.query(
    `insert into crm_tiendas (nombre, embudo, etapa_id, franquiciatario_id)
     values ('Querétaro Juriquilla', 'general', crm_etapa('constancia'), $1)`,
    [franq],
  );
});
afterAll(async () => db.close());

type Fila = Record<string, unknown>;
const ordenar = (xs: Fila[]) => [...xs].sort((a, b) => String(a.card_id).localeCompare(String(b.card_id)));

it('da las mismas cards y cifras que la vista', async () => {
  const [vista, funcion] = await como(conCrm, async () => [
    (
      await db.query<Fila>(
        `select tipo_card, card_id, etapa_id, total, listos, faltante_area, liberado, carril_total, carril_listos
         from crm_v_candados`,
      )
    ).rows,
    (await db.query<{ r: Fila[] }>('select crm_candados_todos() as r')).rows[0].r,
  ]);
  expect(vista).toHaveLength(2);
  expect(ordenar(funcion)).toEqual(ordenar(vista));
});

it('respeta la RLS: sin acceso al CRM devuelve una lista vacía', async () => {
  const r = await como(sinCrm, () => db.query<{ r: Fila[] }>('select crm_candados_todos() as r'));
  expect(r.rows[0].r).toEqual([]);
});
