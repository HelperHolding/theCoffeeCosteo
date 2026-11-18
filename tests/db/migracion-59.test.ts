import { afterAll, beforeAll, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 59: crm_v_candados se calcula en una sola consulta en lugar de llamar crm_requisitos_de por
// card. Debe dar exactamente lo mismo que la definición anterior (la función, card por card).
let db: PGlite;
let conCrm: string, sinCrm: string, franq: string, sucursal: string;
const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);

beforeAll(async () => {
  db = await crearDbLocal();
  conCrm = await crearUsuario(db, 'compras');
  await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'crm', 'edicion')`, [conCrm]);
  sinCrm = await crearUsuario(db, 'compras');
  franq = (
    await db.query<{ id: string }>(
      `insert into crm_franquiciatarios (nombre, correo, ciudad_interes, origen, territorio, etapa_id)
       values ('Mariana Ortiz', 'm@prueba.mx', 'Querétaro', 'Sitio web', 'disponible', crm_etapa('recepcion'))
       returning id`,
    )
  ).rows[0].id;
  sucursal = (
    await db.query<{ id: string }>(
      `insert into crm_tiendas (nombre, embudo, etapa_id, franquiciatario_id)
       values ('Querétaro Juriquilla', 'general', crm_etapa('constancia'), $1) returning id`,
      [franq],
    )
  ).rows[0].id;
});
afterAll(async () => db.close());

// Definición anterior de la vista (migración 50), sin `liberado`, que no cambió.
const ANTERIOR = `
select c.tipo_card, c.card_id, c.etapa_id,
  count(*) filter (where q.de_etapa_actual and q.obligatorio)::int as total,
  count(*) filter (where q.de_etapa_actual and q.obligatorio and q.estado in ('validado', 'no_aplica'))::int as listos,
  (array_agg(q.nombre order by q.orden) filter (where q.de_etapa_actual and q.obligatorio
    and q.estado not in ('validado', 'no_aplica')))[1] as faltante,
  (array_agg(q.area_cumple order by q.orden) filter (where q.de_etapa_actual and q.obligatorio
    and q.estado not in ('validado', 'no_aplica')))[1] as faltante_area,
  count(*) filter (where q.carril = 'legal' and q.obligatorio)::int as carril_total,
  count(*) filter (where q.carril = 'legal' and q.obligatorio and q.estado in ('validado', 'no_aplica'))::int as carril_listos
from (
  select 'franquiciatario'::text as tipo_card, f.id as card_id, f.etapa_id from crm_franquiciatarios f where f.archivado_en is null
  union all
  select 'sucursal', t.id, t.etapa_id from crm_tiendas t where t.embudo = 'general' and t.archivado_en is null
) c
left join lateral (
  select d.*, e.carril from crm_requisitos_de(c.tipo_card, c.card_id) d join crm_etapas e on e.id = d.etapa_id
) q on true
group by c.tipo_card, c.card_id, c.etapa_id`;
const NUEVA = `select tipo_card, card_id, etapa_id, total, listos, faltante, faltante_area, carril_total, carril_listos
  from crm_v_candados`;

const iguales = async () => {
  const [a, b] = await Promise.all([db.query(`${ANTERIOR} order by 2`), db.query(`${NUEVA} order by 2`)]);
  expect(b.rows).toEqual(a.rows);
  return b.rows.length;
};

it('da lo mismo que la definición anterior en cada etapa del proceso', async () => {
  const etapas = (
    await db.query<{ clave: string; card: string }>(
      `select clave, card from crm_etapas where embudo = 'general' and activa and card is not null order by orden`,
    )
  ).rows;
  expect(etapas.length).toBeGreaterThan(10);
  for (const e of etapas) {
    if (e.card === 'sucursal')
      await db.query(`update crm_tiendas set etapa_id = crm_etapa($1) where id = $2`, [e.clave, sucursal]);
    else await db.query(`update crm_franquiciatarios set etapa_id = crm_etapa($1) where id = $2`, [e.clave, franq]);
    expect(await iguales()).toBe(2);
  }
});

it('también con datos capturados y cumplimientos validados (carril Legal incluido)', async () => {
  await db.query(
    `update crm_franquiciatarios set telefono = '4420000000', etapa_id = crm_etapa('recepcion') where id = $1`,
    [franq],
  );
  const legales = (
    await db.query<{ id: string }>(
      `select r.id from crm_requisitos r join crm_etapas e on e.id = r.etapa_id
       where r.activo and r.campo is null and e.card = 'sucursal' and e.carril = 'legal' order by r.orden limit 2`,
    )
  ).rows;
  expect(legales.length).toBeGreaterThan(0);
  for (const [i, r] of legales.entries())
    await db.query(`insert into crm_cumplimientos (requisito_id, tienda_id, estado) values ($1, $2, $3)`, [
      r.id,
      sucursal,
      i === 0 ? 'validado' : 'cumplido',
    ]);
  for (const clave of ['obra', 'capacitacion', 'constancia'])
    await db.query(`update crm_tiendas set etapa_id = crm_etapa($1) where id = $2`, [clave, sucursal]).catch(() => {});
  expect(await iguales()).toBe(2);
  const c = await db.query<{ carril_total: number; carril_listos: number }>(
    'select carril_total, carril_listos from crm_v_candados where card_id = $1',
    [sucursal],
  );
  expect(c.rows[0]).toBeDefined();
});

it('la RLS sigue mandando: con acceso se ven las cards y sin acceso nada', async () => {
  const con = await como(conCrm, () => db.query('select card_id from crm_v_candados'));
  expect(con.rows).toHaveLength(2);
  const sin = await como(sinCrm, () => db.query('select card_id from crm_v_candados'));
  expect(sin.rows).toEqual([]);
});
