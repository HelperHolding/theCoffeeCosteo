import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo, num } from './utilidades';

const ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
type Ped = {
  n: number;
  status: string;
  items?: unknown;
  items_editados?: unknown;
  folio?: string | null;
  apertura?: string | null;
  dias?: number;
};

async function pedido(db: PGlite, p: Ped) {
  await db.query(
    `insert into legado.pedidos (id, apertura_id, fecha_pedido, status, items, items_editados, shopify_order_number)
     values ($1, $2, now() - make_interval(days => $3), $4, $5::jsonb, $6::jsonb, $7)`,
    [
      ID(p.n),
      p.apertura === undefined ? 'A1' : p.apertura,
      p.dias ?? 1,
      p.status,
      JSON.stringify(p.items ?? [{ nombre: 'Vaso 12oz', cantidad: 2 }]),
      p.items_editados === undefined ? null : JSON.stringify(p.items_editados),
      p.folio === undefined ? `#${1000 + p.n}` : p.folio,
    ],
  );
}

type Fila = { folio: string; sku: string; cantidad: string; estado: string; sucursal: string; realizado_por: string };
const ventas = async (db: PGlite) =>
  (
    await db.query<Fila>(
      `select folio, sku, cantidad::text, estado, sucursal, realizado_por from com_movimientos
       where tipo = 'venta' order by folio, sku, cantidad`,
    )
  ).rows;
const derivar = async (db: PGlite, aplicar = true, ventana = 45) =>
  (await db.query<{ r: Record<string, unknown> }>('select public.com_derivar_ov($1, $2) r', [aplicar, ventana])).rows[0].r;

describe('OVs desde los pedidos (migración 70)', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await crearDbLocal();
    await db.exec(`
      insert into legado.aperturas (id, estatus, fecha, sucursal) values ('A1', 'en_proceso', '2026-12-01', 'Polanco');
      insert into com_sku_mapping (shopify_nombre, sku) values ('Vaso 12oz', 'VAS-12'), ('Tapa 12oz', 'TAP-12');`);
  });

  it('pagado sin filas: una fila por artículo mapeado, por_enviar, con la sucursal de la apertura', async () => {
    await pedido(db, {
      n: 1,
      status: 'pagado',
      items: [
        { nombre: 'Vaso 12oz', cantidad: 2 },
        { nombre: 'Tapa 12oz', cantidad: '3' },
        { nombre: 'Sin mapeo', cantidad: 1 },
        { nombre: 'Popote', sku: 'POP-1', cantidad: 0 },
      ],
    });
    const r = await derivar(db);
    expect(r).toMatchObject({ ok: true, modo: 'aplicar', insertar: 3, insertadas: 3, avanzar: 0 });
    expect(await ventas(db)).toEqual([
      { folio: '#1001', sku: 'POP-1', cantidad: '1', estado: 'por_enviar', sucursal: 'Polanco', realizado_por: 'com-ov-pedidos' },
      { folio: '#1001', sku: 'TAP-12', cantidad: '3', estado: 'por_enviar', sucursal: 'Polanco', realizado_por: 'com-ov-pedidos' },
      { folio: '#1001', sku: 'VAS-12', cantidad: '2', estado: 'por_enviar', sucursal: 'Polanco', realizado_por: 'com-ov-pedidos' },
    ]);
    const f = await db.query<{ ok: boolean }>(
      `select fecha = fecha_envio and cantidad = cantidad_original and fecha = (now() at time zone 'UTC')::date - 1 ok
       from com_movimientos where tipo = 'venta'`,
    );
    expect(f.rows.every((x) => x.ok)).toBe(true);
  });

  it('items_editados manda sobre items, aunque venga vacío; folio PED- sin número de Shopify', async () => {
    await pedido(db, { n: 2, status: 'pagado', items_editados: [{ nombre: 'Tapa 12oz', cantidad: 5 }], folio: null });
    await pedido(db, { n: 3, status: 'pagado', items_editados: [], folio: '' });
    await derivar(db);
    expect((await ventas(db)).map((f) => [f.folio, f.sku, f.cantidad])).toEqual([['PED-000002', 'TAP-12', '5']]);
  });

  it('solo pedidos con apertura y en los status que cuentan', async () => {
    await pedido(db, { n: 4, status: 'pagado', apertura: null });
    await pedido(db, { n: 5, status: 'pagado', apertura: '' });
    for (const [n, status] of [[6, 'recibido'], [7, 'con_incidencia'], [8, 'cancelacion_pendiente'], [9, 'cancelado']] as const)
      await pedido(db, { n, status });
    expect(await derivar(db)).toMatchObject({ insertar: 0, avanzar: 0 });
    expect(await ventas(db)).toEqual([]);
  });

  it('empacado cuenta como por_enviar y enviado/entregado/terminado se insertan ya enviados', async () => {
    for (const [n, status] of [[10, 'empacado'], [11, 'enviado'], [12, 'entregado'], [13, 'terminado']] as const)
      await pedido(db, { n, status });
    await derivar(db);
    expect((await ventas(db)).map((f) => [f.folio, f.estado])).toEqual([
      ['#1010', 'por_enviar'], ['#1011', 'enviado'], ['#1012', 'enviado'], ['#1013', 'enviado'],
    ]);
  });

  it('idempotente: la segunda corrida no inserta ni cambia nada', async () => {
    await pedido(db, { n: 14, status: 'pagado' });
    await derivar(db);
    expect(await derivar(db)).toMatchObject({ insertar: 0, avanzar: 0, insertadas: 0, avanzadas: 0 });
    expect(await ventas(db)).toHaveLength(1);
  });

  it('solo avanza: pagado → enviado → cancelado, y un "Marcar enviado" del portal no regresa', async () => {
    await pedido(db, { n: 15, status: 'pagado' });
    await derivar(db);
    await db.exec(`update com_movimientos set estado = 'enviado' where folio = '#1015'`); // Marcar enviado
    expect(await derivar(db)).toMatchObject({ avanzar: 0 });
    expect((await ventas(db))[0].estado).toBe('enviado');
    await db.exec(`update legado.pedidos set status = 'cancelado' where id = '${ID(15)}'`);
    expect(await derivar(db)).toMatchObject({ avanzar: 1, avanzadas: 1 });
    expect((await ventas(db))[0].estado).toBe('cancelado');
  });

  it('un cancelado que vuelve a pagado se reporta como reabierto y no se toca', async () => {
    await pedido(db, { n: 16, status: 'cancelado' });
    await db.exec(`insert into com_movimientos (tipo, folio, sku, cantidad, estado) values ('venta', '#1016', 'VAS-12', 2, 'cancelado')`);
    await db.exec(`update legado.pedidos set status = 'pagado' where id = '${ID(16)}'`);
    expect(await derivar(db)).toMatchObject({ insertar: 0, avanzar: 0, reabiertos: ['#1016'] });
    expect((await ventas(db))[0].estado).toBe('cancelado');
  });

  it('las cantidades de una fila existente no se rehacen (como el viejo, que solo creaba al pagar)', async () => {
    await pedido(db, { n: 17, status: 'pagado' });
    await derivar(db);
    await db.exec(`update legado.pedidos set items_editados = '[{"nombre":"Vaso 12oz","cantidad":9}]' where id = '${ID(17)}'`);
    expect(await derivar(db)).toMatchObject({ insertar: 0 });
    expect((await ventas(db))[0].cantidad).toBe('2');
  });

  it('fuera de la ventana no se inserta, pero sí avanza lo que ya tiene filas', async () => {
    await pedido(db, { n: 18, status: 'enviado', dias: 60 });
    await pedido(db, { n: 19, status: 'enviado', dias: 60 });
    await db.exec(`insert into com_movimientos (tipo, folio, sku, cantidad, estado) values ('venta', '#1019', 'VAS-12', 2, 'por_enviar')`);
    expect(await derivar(db)).toMatchObject({ insertar: 0, avanzar: 1 });
    expect((await ventas(db)).map((f) => [f.folio, f.estado])).toEqual([['#1019', 'enviado']]);
    expect(await derivar(db, true, 90)).toMatchObject({ insertar: 1 });
  });

  it('dos pedidos con el mismo folio: ambiguo, sin tocar', async () => {
    await pedido(db, { n: 20, status: 'pagado', folio: '#9' });
    await pedido(db, { n: 21, status: 'cancelado', folio: '#9' });
    expect(await derivar(db)).toMatchObject({ insertar: 0, avanzar: 0, ambiguos: ['#9'] });
  });

  it('las OVs manuales y los estados desconocidos no se tocan', async () => {
    await pedido(db, { n: 22, status: 'enviado' });
    await db.exec(`
      insert into com_movimientos (tipo, folio, sku, cantidad, estado) values
        ('venta', 'MANUAL-1', 'VAS-12', 1, 'por_enviar'), ('venta', '#1022', 'VAS-12', 2, 'parcial');`);
    expect(await derivar(db)).toMatchObject({ insertar: 0, avanzar: 0 });
  });

  it('en modo registrar cuenta lo que haría y no escribe; deja su rastro en com_sync_log', async () => {
    await pedido(db, { n: 23, status: 'pagado' });
    expect(await derivar(db, false)).toMatchObject({ ok: true, modo: 'registrar', insertar: 1, insertadas: 0 });
    expect(await ventas(db)).toEqual([]);
    const log = await db.query<{ ok: boolean; modo: string }>(
      `select ok, resumen ->> 'modo' modo from com_sync_log where proceso = 'com-ov-pedidos'`,
    );
    expect(log.rows).toEqual([{ ok: true, modo: 'registrar' }]);
  });

  it('si el puente falla, registra el error y no deja filas a medias', async () => {
    await pedido(db, { n: 24, status: 'pagado' });
    await db.exec('drop view public.com_legado_pedidos'); // como el servidor legado sin responder
    const r = await derivar(db);
    expect(r.ok).toBe(false);
    expect(await ventas(db)).toEqual([]);
    const log = await db.query<{ ok: boolean; error: string }>(
      `select ok, error from com_sync_log where proceso = 'com-ov-pedidos'`,
    );
    expect(log.rows[0].ok).toBe(false);
    expect(log.rows[0].error).toMatch(/com_legado_pedidos/);
  });

  it('com_ov_plan recibe filas de fuera (la paridad le pasa las del viejo) sin leer com_movimientos', async () => {
    await pedido(db, { n: 25, status: 'enviado' });
    await db.exec(`insert into com_movimientos (tipo, folio, sku, cantidad, estado) values ('venta', '#1025', 'VAS-12', 2, 'enviado')`);
    const r = await db.query<{ accion: string; estado_antes: string; estado: string }>(
      `select accion, estado_antes, estado from public.com_ov_plan($1::jsonb)`,
      [JSON.stringify([{ id: 'x', folio: '#1025', estado: 'por_enviar' }])],
    );
    expect(r.rows).toEqual([{ accion: 'avanzar', estado_antes: 'por_enviar', estado: 'enviado' }]);
  });

  it('cantidad como en JS: Number(it.cantidad || 1)', async () => {
    const r = await db.query<{ v: string | null }>(
      `select public.com_ov_cantidad(x)::text v from unnest(array[null, 'null', '0', '""', 'false', 'true', '4',
         '"2.5"', '" 7 "', '"  "', '"0"', '"abc"', '{}']::jsonb[]) with ordinality t(x, i) order by i`,
    );
    expect(r.rows.map((x) => x.v)).toEqual(['1', '1', '1', '1', '1', '1', '4', '2.5', '7', '0', '0', null, null]);
  });

  it('nadie con sesión ejecuta las funciones (leen pedidos del puente)', async () => {
    const id = await crearUsuario(db, 'admin');
    await darModulo(db, id, 'comercializadora', 'desarrollador');
    for (const sql of ['select public.com_derivar_ov(false)', `select * from public.com_ov_plan('[]')`, `select public.com_ov_cantidad('1')`])
      await expect(comoUsuario(db, id, () => db.query(sql))).rejects.toThrow(/permission denied/);
    const r = await db.query<{ n: number }>(
      `select count(*) n from information_schema.routine_privileges
       where routine_name in ('com_ov_plan', 'com_derivar_ov', 'com_ov_cantidad') and grantee in ('anon', 'authenticated', 'PUBLIC')`,
    );
    expect(num(r.rows[0].n)).toBe(0);
  });
});
