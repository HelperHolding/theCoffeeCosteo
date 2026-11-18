import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { TABLAS_COM } from '../../scripts/migracion-legado/comercializadora-lib';
import type { Consultor } from '../../scripts/migracion-legado/conexion';
import {
  columnasEscribibles,
  deltaTabla,
  leerFilas,
  reporteReversa,
  sqlReversa,
} from '../../scripts/migracion-legado/reversa-comercializadora-lib';

const EDITABLES = TABLAS_COM.filter((t) => t.editable);
const c = (db: PGlite) => db as unknown as Consultor;

async function deltas(viejo: PGlite, portal: PGlite) {
  const out = [];
  for (const t of EDITABLES)
    out.push(deltaTabla(t, await columnasEscribibles(c(viejo), t.tabla), await leerFilas(c(portal), t.tabla), await leerFilas(c(viejo), t.tabla)));
  return out;
}

describe('reversa del cutover (portal → bliocjvq)', () => {
  let viejo: PGlite;
  let portal: PGlite;
  beforeEach(async () => {
    [viejo, portal] = await Promise.all([crearDbLocal(), crearDbLocal()]);
    // En bliocjvq minimo/maximo de com_minmax son columnas normales; en el portal, generadas (migración 48).
    await viejo.exec(`
      alter table com_minmax drop column minimo, drop column maximo;
      alter table com_minmax add column minimo numeric, add column maximo numeric;`);
    const base = `
      set timezone = 'UTC';
      insert into com_lead_times (sku, dias) values ('A', 7), ('B', 10), ('C', 3);
      insert into com_movimientos (id, tipo, folio, sku, cantidad, estado, fecha, created_at) values
        ('m1', 'venta', '#1', 'A', 2, 'por_enviar', '2026-11-20', '2026-11-20 10:00:00+00');
      insert into com_proveedor_cierre (id, vendor_id, vendor_name, ini, fin, motivo, skus, creado_at, actualizado_at)
        values (1, 'V1', 'Jarabes', '2026-11-25', '2026-11-30', 'vacaciones', '{A,B}', '2026-11-19 10:00:00+00', '2026-11-19 10:00:00+00');
      select setval(pg_get_serial_sequence('public.com_proveedor_cierre', 'id'), 1);
      insert into com_plan_config (id, config) values (1, '{"auto":{"modo":"real"},"inv":{"yulius":true}}');`;
    await viejo.exec(`${base}
      insert into com_minmax (sku, lead_time, minimo_calc, maximo_calc, minimo, maximo) values ('A', 7, 5, 9, 5, 9);`);
    await portal.exec(`${base}
      insert into com_minmax (sku, lead_time, minimo_calc, maximo_calc, minimo_manual) values ('A', 7, 5, 9, 6);
      -- Lo capturado en el portal después del cutover:
      update com_lead_times set dias = 8 where sku = 'A';
      delete from com_lead_times where sku = 'C';
      insert into com_movimientos (tipo, folio, sku, cantidad, estado, fecha, realizado_por)
        values ('venta', '#2', 'B', 1, 'por_enviar', '2026-11-21', 'com-ov-pedidos');
      update com_movimientos set estado = 'enviado' where id = 'm1';
      insert into com_proveedor_cierre (vendor_id, vendor_name, ini, fin, motivo, skus)
        values ('V2', 'Vasos', '2026-12-01', '2026-12-05', 'inventario', null);
      update com_plan_config set config = '{"auto":{"modo":"real"},"inv":{"yulius":false}}';`);
  });

  it('solo lo distinto: upsert de lo nuevo o cambiado y borrado de lo que el portal ya no tiene', async () => {
    const ds = await deltas(viejo, portal);
    const de = (t: string) => ds.find((d) => d.tabla === t)!;
    expect(de('com_lead_times').upserts).toEqual([{ sku: 'A', dias: 8 }]);
    expect(de('com_lead_times').borrar).toEqual([{ sku: 'C' }]);
    expect(de('com_movimientos').upserts.map((f) => [f.folio, f.estado]).sort()).toEqual([['#1', 'enviado'], ['#2', 'por_enviar']]);
    expect(de('com_proveedor_cierre').upserts.map((f) => f.vendor_id)).toEqual(['V2']);
    expect(de('com_minmax').upserts).toEqual([expect.objectContaining({ sku: 'A', minimo_manual: 6, minimo: 6, maximo: 9 })]);
    expect(de('com_catalogo')).toMatchObject({ upserts: [], borrar: [] });
    expect(reporteReversa(ds)).toContain('com_lead_times                 a escribir 1 · a borrar 1');
  });

  it('el SQL deja bliocjvq igual al portal en lo editable, adelanta las secuencias y una segunda vuelta sale vacía', async () => {
    const sql = sqlReversa(await deltas(viejo, portal), '2026-11-22');
    expect(sql.startsWith('-- Reversa Comercializadora 2026-11-22')).toBe(true);
    await viejo.exec(sql);
    expect((await viejo.query('select sku, dias from com_lead_times order by sku')).rows).toEqual([
      { sku: 'A', dias: 8 }, { sku: 'B', dias: 10 },
    ]);
    expect((await viejo.query(`select minimo::float8 m from com_minmax where sku = 'A'`)).rows).toEqual([{ m: 6 }]);
    expect((await viejo.query(`select config -> 'inv' i from com_plan_config`)).rows).toEqual([{ i: { yulius: false } }]);
    // La secuencia del viejo quedó adelante del id que llegó del portal.
    const nuevo = await viejo.query<{ id: number }>(
      `insert into com_proveedor_cierre (vendor_id, vendor_name, ini, fin, motivo) values ('V3', 'X', '2026-12-01', '2026-12-02', 'otro') returning id`,
    );
    expect(Number(nuevo.rows[0].id)).toBeGreaterThan(2);
    await viejo.exec(`delete from com_proveedor_cierre where vendor_id = 'V3'`);
    expect(sqlReversa(await deltas(viejo, portal), 'x')).toBe('');
  });

  it('solo cubre las tablas editables (los logs y las OCs automáticas no regresan)', () => {
    expect(EDITABLES.map((t) => t.tabla)).not.toContain('com_oc_auto');
    expect(EDITABLES.map((t) => t.tabla)).not.toContain('com_sync_log');
    expect(EDITABLES.map((t) => t.tabla)).toContain('com_movimientos');
  });
});
