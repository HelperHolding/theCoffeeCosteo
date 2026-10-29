import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { diasEntre, fechaMX, pedidoDeListado } from '../../servicios/rappi-portal/lote.mjs';

// El lector (servicios/rappi-portal) convierte el JSON del portal al lote de rappi_importar. Forma del JSON observada
// el 2026-10-29 en un pedido de Namóra (doc 01 §4); cliente anonimizado.
const listado = {
  application_user_full_name: 'Cliente Prueba',
  application_user_id: '123',
  created_at: '2026-10-28T20:28:05.000+00:00',
  dispute_status: '',
  id: 'MX2484221451',
  is_dispute: false,
  order_product_details: [
    {
      base_price: 221,
      comments: null,
      currency: null,
      discount_percentage_by_rappi: 0,
      id: 'MX22835801',
      mark_down: { mark_down: 0, mark_down_by_partner: 0, total_mark_down: 0 },
      product_name: 'Crea tu The Coffee ',
      toppings: [
        {
          currency: null,
          description: ' Croissant relleno de queso y jamón ',
          price: 0,
          topping_category_name: 'Elige Tu Sandwich',
          units: 1,
        },
        {
          currency: null,
          description: 'True White',
          price: 10,
          topping_category_name: 'Elige tu Bebida ',
          units: 1,
        },
        {
          currency: null,
          description: 'Grande 355 ml',
          price: 12,
          topping_category_name: 'Elige el Tamaño ',
          units: 1,
        },
      ],
      total_price: 221,
      total_price_with_partner_discount: 221,
      units: 1,
    },
  ],
  order_product_total_price: 221,
  payment_method: 'Efectivo contraentrega',
  prime: true,
  state: 'pending_review',
  state_name: 'Terminada',
  store_name: 'The Coffee Namóra',
};
const detalle = {
  discount_info: {
    discount_by_support: 0,
    discount_total: 186.6,
    discounts: [{ type_description: 'offer_by_product', value: 39.8, percentage_value: 20 }],
    total_discount_by_partner: 39.8,
  },
};

let db: PGlite;
beforeAll(async () => {
  db = await crearDbLocal();
});
afterAll(async () => db.close());

describe('lote del lector de Rappi', () => {
  it('convierte el pedido sin datos personales y con la hora local tal cual', () => {
    const p = pedidoDeListado(listado, 'MX1930270777', detalle);
    expect(JSON.stringify(p)).not.toMatch(/Cliente Prueba|application_user/);
    expect(p).toMatchObject({
      id: '2484221451',
      creado: '2026-10-28T20:28:05',
      estado: 'pending_review',
      bruto: 221,
      descuento_aliado: 39.8,
      en_disputa: false,
      estado_disputa: null,
    });
    expect(p.productos[0]).toMatchObject({ nombre: 'Crea tu The Coffee', unidades: 1, precio: 221 });
    expect(p.productos[0].opciones[0]).toEqual({
      categoria: 'Elige Tu Sandwich',
      descripcion: 'Croissant relleno de queso y jamón',
      precio: 0,
      unidades: 1,
    });
  });

  it('rappi_importar acepta el lote tal como lo arma el lector', async () => {
    const lote = {
      tipo: 'vivo',
      desde: '2026-10-28',
      hasta: '2026-10-28',
      estado: 'ok',
      mensaje: '',
      tiendas: [
        { rappi_tienda_id: 'MX1930270777', por_dia: { '2026-10-28': { total_rows: 13, devueltos: 12 } } },
      ],
      pedidos: [pedidoDeListado(listado, 'MX1930270777', detalle)],
    };
    await db.exec('set role service_role');
    const r = (
      await db.query<{ r: Record<string, unknown> }>('select public.rappi_importar($1) r', [
        JSON.stringify(lote),
      ])
    ).rows[0].r;
    await db.exec('reset role');
    expect(r).toMatchObject({ estado: 'ok', nuevos: 1 });
    const fila = (
      await db.query<{ creado_local: string; fecha_local: string }>(
        `select creado_local::text, fecha_local::text from rappi_pedidos where rappi_pedido_id = 2484221451`,
      )
    ).rows[0];
    expect(fila).toEqual({ creado_local: '2026-10-28 20:28:05', fecha_local: '2026-10-28' });
  });

  it('rechaza pedidos incompletos y arma ventanas en hora de México', () => {
    expect(() => pedidoDeListado({ ...listado, order_product_total_price: null }, 'MX1')).toThrow(
      /sin total/,
    );
    expect(() => pedidoDeListado({ ...listado, created_at: 'ayer' }, 'MX1')).toThrow(/fecha ilegible/);
    expect(diasEntre('2026-10-30', '2026-11-02')).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
    // 2026-10-29 03:00 UTC = 28 de octubre 21:00 en México.
    expect(fechaMX(0, new Date('2026-10-29T03:00:00Z'))).toBe('2026-10-28');
  });
});
