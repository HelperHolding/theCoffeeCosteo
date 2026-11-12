import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo, num } from './utilidades';

const TABLAS = [
  'com_catalogo', 'com_catalogo_costo_historial', 'com_kit_apertura', 'com_lead_times', 'com_minmax',
  'com_movimientos', 'com_oc_auto', 'com_pago_proyectado', 'com_parametros', 'com_plan_config',
  'com_plan_config_historial', 'com_proveedor_cierre', 'com_sku_mapping', 'com_sync_cambios', 'com_sync_log',
  'com_zoho_oc_lineas', 'com_zoho_proveedor',
];

async function sembrar(db: PGlite) {
  await db.exec(`
    insert into com_catalogo (sku, nombre) values ('CAF-001', 'Café');
    insert into com_lead_times (sku, dias) values ('CAF-001', 5);
    insert into com_oc_auto (corrida_id, origen, modo, vendor_id, lineas, estado)
      values (gen_random_uuid(), 'cron', 'simulacion', 'v1', '[]', 'simulada');
    insert into com_plan_config (id, config) values (1, '{"auto":{"modo":"simulacion"}}');`);
}
const cuenta = async (db: PGlite, t: string) => num((await db.query<{ n: number }>(`select count(*) n from ${t}`)).rows[0].n);

describe('Comercializadora: tablas y acceso (migración 45)', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await crearDbLocal();
    await sembrar(db);
  });

  it('crea las 17 tablas con RLS', async () => {
    const r = await db.query<{ t: string; rls: boolean }>(`
      select c.relname t, c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'com\\_%' order by 1`);
    expect(r.rows.map((f) => f.t)).toEqual([...TABLAS].sort());
    expect(r.rows.every((f) => f.rls)).toBe(true);
  });

  it.each(['admin', 'interno', 'franquiciado', 'proveedor'] as const)('%s sin módulo no lee nada', async (rol) => {
    const id = await crearUsuario(db, rol);
    const n = await comoUsuario(db, id, async () => {
      let total = 0;
      for (const t of TABLAS) total += await cuenta(db, t);
      return total;
    });
    expect(n).toBe(0);
  });

  it('lectura ve los datos pero no edita', async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'lectura');
    await comoUsuario(db, id, async () => {
      expect(await cuenta(db, 'com_catalogo')).toBe(1);
      expect(await cuenta(db, 'com_oc_auto')).toBe(1);
      const r = await db.query(`update com_lead_times set dias = 9 where sku = 'CAF-001' returning sku`);
      expect(r.rows).toHaveLength(0);
    });
  });

  it('edición cambia lo editable y no lo que escriben las funciones', async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'edicion');
    await comoUsuario(db, id, async () => {
      const r = await db.query(`update com_lead_times set dias = 7 where sku = 'CAF-001' returning sku`);
      expect(r.rows).toHaveLength(1);
      await expect(db.query(`update com_oc_auto set estado = 'creada'`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`delete from com_proveedor_cierre`)).rejects.toThrow(/permission denied/);
    });
  });

  it('un módulo de un perfil inactivo no da acceso', async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'edicion');
    await db.query('update perfiles set activo = false where user_id = $1', [id]);
    expect(await comoUsuario(db, id, () => cuenta(db, 'com_catalogo'))).toBe(0);
  });

  it('la bitácora registra ediciones de personas por sku, y no las del servicio', async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'edicion');
    await comoUsuario(db, id, () => db.query(`update com_lead_times set dias = 12 where sku = 'CAF-001'`));
    await db.query(`update com_lead_times set dias = 13 where sku = 'CAF-001'`); // sin auth.uid(): servicio
    const b = await db.query<{ registro_id: string; valor_nuevo: string }>(
      `select registro_id, valor_nuevo from bitacora
       where tabla = 'com_lead_times' and campo = 'dias' and valor_nuevo in ('12', '13') order by id`);
    expect(b.rows).toEqual([{ registro_id: 'CAF-001', valor_nuevo: '12' }]);
  });

  it('una sola OC real de cron por proveedor y día', async () => {
    const fila = `(gen_random_uuid(), 'cron', 'real', 'v9', '[]', 'creada', date '2026-11-12')`;
    const sql = `insert into com_oc_auto (corrida_id, origen, modo, vendor_id, lineas, estado, fecha) values ${fila}`;
    await db.query(sql);
    await expect(db.query(sql)).rejects.toThrow(/com_oc_auto_un_cron_dia/);
  });

  it('el sello del plan pone autor y hora del servidor, salvo en la migración', async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'edicion');
    await comoUsuario(db, id, () =>
      db.query(`insert into com_plan_config_historial (clave, created_at, username) values ('x', '2020-01-01', 'falso')`));
    const h = await db.query<{ anio: number; username: string; uid: string }>(
      `select extract(year from created_at)::int anio, username, usuario_auth_uid::text uid
       from com_plan_config_historial where clave = 'x'`);
    expect(h.rows[0].anio).toBeGreaterThan(2020);
    expect(h.rows[0].username).toBe('Usuario interno');
    expect(h.rows[0].uid).toBe(id);

    await db.exec(`begin; set local app.origen = 'migracion';
      insert into com_plan_config_historial (id, clave, created_at, username) values (500, 'y', '2020-01-01', 'ana');
      commit;`);
    const m = await db.query<{ anio: number; username: string }>(
      `select extract(year from created_at)::int anio, username from com_plan_config_historial where id = 500`);
    expect(m.rows[0]).toEqual({ anio: 2020, username: 'ana' });
  });

  it('acepta ids copiados y luego sigue la secuencia sin chocar', async () => {
    await db.query(`insert into com_sync_log (id, proceso) values (1000, 'copia')`);
    await db.query(`select setval(pg_get_serial_sequence('public.com_sync_log', 'id'), 1000)`);
    const r = await db.query<{ id: number }>(`insert into com_sync_log (proceso) values ('nuevo') returning id`);
    expect(num(r.rows[0].id)).toBe(1001);
  });
  it('com_invocar existe y ningún usuario puede ejecutarla', async () => {
    const r = await db.query<{ auth: boolean; anon: boolean }>(`
      select has_function_privilege('authenticated', 'public.com_invocar(text, jsonb)', 'EXECUTE') auth,
             has_function_privilege('anon', 'public.com_invocar(text, jsonb)', 'EXECUTE') anon`);
    expect(r.rows[0]).toEqual({ auth: false, anon: false });
  });

  it('com_invocar manda el secreto en x-com-secreto, no la llave anon', async () => {
    const r = await db.query<{ d: string }>(`select pg_get_functiondef('public.com_invocar(text, jsonb)'::regprocedure) d`);
    expect(r.rows[0].d).toContain("'x-com-secreto'");
    expect(r.rows[0].d).toContain("name = 'com_secreto'");
    expect(r.rows[0].d).not.toContain('anon_key');
  });
});

