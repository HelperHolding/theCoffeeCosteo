import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import type { Consultor } from '../../scripts/migracion-legado/conexion';
import { leerLado, leerVentasViejas, planOv } from '../../scripts/migracion-legado/paridad-comercializadora-datos';
import { evaluarDia } from '../../scripts/migracion-legado/paridad-comercializadora-lib';

// Dos PGlite con las migraciones del portal: uno hace de bliocjvq (mismas tablas com_*) y otro de portal.
const FECHA = '2026-11-20';
const comun = `
  insert into com_catalogo (sku, nombre, estatus, cantidad_por_apertura) values ('A', 'Jarabe', 'activo', 2), ('B', 'Vaso', 'activo', 0);
  insert into com_lead_times (sku, dias) values ('A', 7), ('B', 10);
  insert into com_sku_mapping (shopify_nombre, sku) values ('Vaso 12oz', 'B');
  insert into com_parametros (clave, valor) values ('iva', 0.16);
  insert into com_zoho_proveedor (vendor_id, nombre, minimo_compra) values ('V1', 'Jarabes', 1500);
  insert into com_proveedor_cierre (vendor_id, vendor_name, ini, fin, motivo, skus)
    values ('V1', 'Jarabes', '2026-11-25', '2026-11-30', 'vacaciones', '{A}');
  insert into com_sync_log (proceso, inicio, fin, ok) values
    ('com-minmax', '2026-11-20 12:30:00+00', '2026-11-20 12:31:00+00', true),
    ('zoho-generar-oc', '2026-11-20 13:05:00+00', '2026-11-20 13:06:00+00', true),
    ('com-minmax', '2026-11-21 05:30:00+00', '2026-11-21 05:31:00+00', false);`;
const minmax = (minimo: number) => `
  insert into com_minmax (sku, venta_diaria, lead_time, minimo_calc, maximo_calc, minimo_manual, calculado_at)
    values ('A', 1.5, 7, ${minimo}, 30, null, '2026-11-20 12:30:30+00'), ('B', 3, 10, 5, 9, 6, '2026-11-20 12:30:30+00');`;

describe('paridad: lecturas (PGlite)', () => {
  let viejo: PGlite;
  let portal: PGlite;
  beforeAll(async () => {
    [viejo, portal] = await Promise.all([crearDbLocal(), crearDbLocal()]);
    await viejo.exec(`${comun}${minmax(12)}
      insert into com_plan_config (id, config) values (1, '{"auto":{"modo":"real","max_edad_sync_horas":6},"inv":{"yulius":true}}');
      insert into com_oc_auto (corrida_id, fecha, origen, modo, vendor_id, vendor_name, lineas, estado) values
        (gen_random_uuid(), '${FECHA}', 'cron', 'real', 'V1', 'Jarabes', '[{"sku":"A","cantidad":5}]', 'creada'),
        (gen_random_uuid(), '${FECHA}', 'manual', 'real', 'V1', 'Jarabes', '[{"sku":"A","cantidad":50}]', 'creada'),
        (gen_random_uuid(), '${FECHA}', 'cron', 'simulacion', 'V9', 'Otro', '[{"sku":"B","cantidad":1}]', 'simulada');
      insert into com_movimientos (id, tipo, folio, sku, cantidad, estado) values
        ('m1', 'venta', '#1001', 'B', 2, 'por_enviar'), ('m2', 'compra', 'OC-1', 'A', 9, 'recibido');`);
    await portal.exec(`${comun}${minmax(14)}
      insert into com_plan_config (id, config) values (1, '{"auto":{"modo":"simulacion","max_edad_sync_horas":6},"inv":{"yulius":true}}');
      insert into com_oc_auto (corrida_id, fecha, origen, modo, vendor_id, vendor_name, lineas, estado) values
        (gen_random_uuid(), '${FECHA}', 'cron', 'simulacion', 'V1', 'Jarabes', '[{"sku":"A","cantidad":5}]', 'simulada'),
        (gen_random_uuid(), '2026-11-19', 'cron', 'simulacion', 'V1', 'Jarabes', '[{"sku":"A","cantidad":7}]', 'simulada');
      insert into legado.aperturas (id, estatus, sucursal) values ('A1', 'en_proceso', 'Polanco');
      insert into legado.pedidos (id, apertura_id, fecha_pedido, status, items, shopify_order_number) values
        ('00000000-0000-0000-0000-000000000001', 'A1', now(), 'enviado', '[{"nombre":"Vaso 12oz","cantidad":2}]', '#1001'),
        ('00000000-0000-0000-0000-000000000002', 'A1', now(), 'pagado', '[{"nombre":"Vaso 12oz","cantidad":1}]', '#1002');`);
  });

  it('lee mín/máx efectivo, la OC del cron de ese día según el modo de cada lado y las corridas del día de CDMX', async () => {
    const v = await leerLado(viejo as unknown as Consultor, FECHA, 'real');
    const p = await leerLado(portal as unknown as Consultor, FECHA, 'simulacion');
    expect(v.minmax.map((f) => [f.sku, f.minimo, f.maximo])).toEqual([['A', 12, 30], ['B', 6, 9]]);
    expect(v.ocs).toEqual([{ vendor_id: 'V1', vendor_name: 'Jarabes', lineas: [{ sku: 'A', cantidad: 5 }] }]);
    expect(p.ocs).toEqual([{ vendor_id: 'V1', vendor_name: 'Jarabes', lineas: [{ sku: 'A', cantidad: 5 }] }]);
    // La corrida fallida de las 05:30 UTC del 21 es del 20 en CDMX (23:30).
    expect(v.corridas.map((c) => [c.proceso, c.ok]).sort()).toEqual([
      ['com-minmax', false], ['com-minmax', true], ['zoho-generar-oc', true],
    ]);
    expect(v.firmaGlobal).toBe(p.firmaGlobal); // auto.modo no cuenta
    expect(v.firmasSku).toEqual(p.firmasSku);
    expect(v.firmasProv).toEqual(p.firmasProv);
  });

  it('las firmas cambian si cambia una entrada (lead time, cierre o configuración)', async () => {
    const antes = await leerLado(portal as unknown as Consultor, FECHA, 'simulacion');
    await portal.exec(`begin;
      update com_lead_times set dias = 8 where sku = 'A';
      update com_proveedor_cierre set fin = '2026-12-02';
      update com_plan_config set config = jsonb_set(config, '{inv,yulius}', 'false');`);
    const despues = await leerLado(portal as unknown as Consultor, FECHA, 'simulacion');
    await portal.exec('rollback');
    expect(despues.firmasSku.A).not.toBe(antes.firmasSku.A);
    expect(despues.firmasSku.B).toBe(antes.firmasSku.B);
    expect(despues.firmasProv.V1).not.toBe(antes.firmasProv.V1);
    expect(despues.firmaGlobal).not.toBe(antes.firmaGlobal);
  });

  it('de punta a punta: OVs del viejo pasadas por com_ov_plan del portal y el día evaluado', async () => {
    const ventas = await leerVentasViejas(viejo as unknown as Consultor);
    expect(ventas).toEqual([{ id: 'm1', folio: '#1001', estado: 'por_enviar' }]);
    const acciones = await planOv(portal as unknown as Consultor, ventas);
    expect(acciones).toEqual([
      { accion: 'avanzar', folio: '#1001', sku: null, estado_antes: 'por_enviar', estado: 'enviado' },
      { accion: 'insertar', folio: '#1002', sku: 'B', estado_antes: null, estado: 'por_enviar' },
    ]);
    const r = evaluarDia(
      FECHA,
      await leerLado(viejo as unknown as Consultor, FECHA, 'real'),
      await leerLado(portal as unknown as Consultor, FECHA, 'simulacion'),
      acciones,
      [],
    );
    expect(r.completo).toBe(true);
    expect(r.verde).toBe(false);
    expect(r.diferencias.map((d) => d.clave)).toEqual([
      'minmax:A:minimo',
      'ov:avanzar:#1001:por_enviar>enviado',
      'ov:insertar:#1002:B',
    ]);
  });
});
