// tests/db/rappi-descuento-venta.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 90: el descuento que se resta de la venta de un pedido de Rappi, como Zoho
// (docs/superpowers/specs/2026-11-20-rappi-como-zoho-design.md §1).
let db: PGlite;
let usuario: string;
const NORMAL = 'MX1930270777';

const oferta = (v: number) => ({ type: '7', value: v, type_description: 'offer_by_product', percentage_value: 20 });
const premio = (v: number) => ({ type: '6', value: v, type_description: 'order_discount', percentage_value: 0 });
const premioRaro = (v: unknown) => ({ type: '6', value: v, type_description: 'order_discount', percentage_value: 0 });
const envio = (v: number) => ({ type: '5', value: v, type_description: 'prime_discount_shipping', percentage_value: 0 });

const pedido = (id: string, bruto: number, aliado: number | null, descuentos: unknown) => ({
  id,
  tienda: NORMAL,
  creado: '2026-10-27T09:00:00',
  estado: 'finished',
  estado_nombre: 'Terminada',
  en_disputa: false,
  estado_disputa: '',
  metodo_pago: 'Tarjeta',
  prime: false,
  bruto,
  descuento_aliado: aliado,
  descuentos,
  productos: [{ linea: 1, rappi_producto_id: 'MX1', nombre: 'Latte', unidades: 1, precio: bruto,
    precio_con_desc_aliado: bruto, descuento_rappi_pct: 0, opciones: [] }],
});

const CASOS: [string, number, number | null, unknown, number][] = [
  // id, bruto, descuento_aliado, descuentos, descuento_venta esperado
  ['1', 100, 0, [], 0],                                        // sin descuento
  ['2', 221, 39.8, [oferta(39.8), envio(10)], 39.8],           // solo oferta: todo el descuento del aliado
  ['3', 416, 221.04, [premio(221.04), envio(10)], 0],          // solo premio Pro Rewards: no se resta
  ['4', 296, 156.9, [oferta(39.8), oferta(39.8), premio(117.1)], 39.8], // premio + oferta (repetida en el detalle)
  ['5', 120, null, null, 0],                                   // sin detalle todavía
  ['6', 376, 23.4, [oferta(23.4), oferta(23.4)], 23.4],        // oferta repetida: manda descuento_aliado
  ['7', 150, 50, [premio(80)], 0],                             // premio mayor que el descuento: 0, no negativo
  ['8', 90, 30, { raro: true }, 30],                           // descuentos no es arreglo: cuenta como []
  ['9', 40, 55, [oferta(55)], 40],                             // descuento mayor que el bruto: tope en el bruto
  ['10', 200, 50, [oferta(50), premioRaro('')], 50],           // premio con value vacío: se ignora, no truena
  ['11', 200, 50, [oferta(50), premioRaro('abc')], 50],        // premio con value no numérico: se ignora
  ['13', 200, 50, [oferta(50), premioRaro('1x5')], 50],         // texto con un carácter raro entre dígitos: se ignora
  ['12', 200, 70, [oferta(50), premioRaro('20')], 50],         // premio con value en texto numérico: se resta
];

beforeAll(async () => {
  db = await crearDbLocal();
  usuario = await crearUsuario(db, 'sucursales');
  await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'sucursales', 'lectura')`, [usuario]);
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1, 513)', [usuario]);
  const lote = {
    tipo: 'vivo', desde: '2026-10-27', hasta: '2026-10-27', estado: 'ok',
    tiendas: [{ rappi_tienda_id: NORMAL, por_dia: { '2026-10-27': { total_rows: CASOS.length, devueltos: CASOS.length } } }],
    pedidos: CASOS.map(([id, b, a, d]) => pedido(id, b, a, d)),
  };
  await db.exec('set role service_role');
  try {
    await db.query('select public.rappi_importar($1)', [JSON.stringify(lote)]);
  } finally {
    await db.exec('reset role');
  }
});
afterAll(async () => db.close());

describe('migración 90: rappi_descuento_venta', () => {
  it('resta los descuentos de la tienda y nunca los premios Pro Rewards', async () => {
    const r = await db.query<{ id: string; d: string }>(
      'select rappi_pedido_id::text id, public.rappi_descuento_venta(p)::text d from public.rappi_pedidos p',
    );
    const por = Object.fromEntries(r.rows.map((x) => [x.id, Number(x.d)]));
    for (const [id, , , , esperado] of CASOS) expect(por[id], `pedido ${id}`).toBeCloseTo(esperado, 2);
  });

  it('solo la cuenta de servicio la llama directo', async () => {
    await expect(
      comoUsuario(db, usuario, () =>
        db.query('select public.rappi_descuento_venta(p) from public.rappi_pedidos p limit 1'),
      ),
    ).rejects.toThrow(/permission denied/);
    await db.exec('set role service_role');
    try {
      const r = await db.query('select public.rappi_descuento_venta(p) d from public.rappi_pedidos p limit 1');
      expect(r.rows).toHaveLength(1);
    } finally {
      await db.exec('reset role');
    }
  });

  it('sucursales_rappi_portal trae descuento_venta en cada pedido', async () => {
    const r = await comoUsuario(db, usuario, async () =>
      (await db.query<{ r: { pedidos: { id: string; descuento_venta: number; bruto: number }[] } }>(
        'select public.sucursales_rappi_portal(513, $1, $1) r', ['2026-10-27'],
      )).rows[0].r,
    );
    const por = Object.fromEntries(r.pedidos.map((p) => [p.id, Number(p.descuento_venta)]));
    for (const [id, , , , esperado] of CASOS) expect(por[id], `pedido ${id}`).toBeCloseTo(esperado, 2);
  });
});
