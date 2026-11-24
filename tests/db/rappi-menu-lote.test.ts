import { describe, expect, it } from 'vitest';
import { menuCompacto, normalizarNombre, tocaMenu } from '../../servicios/rappi-portal/menu.mjs';

// Forma del GET partners-selfservice/selfservice/menu/{storeId}, vista el 2026-11-23 en solo lectura
// (docs/rappi-portal/09), recortada: cada nivel trae `data` (en edición) y `published_data` (lo publicado).
const nivel = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  id: 0,
  entity_data_changes: [],
  status: 'APPROVED',
  data,
  published_data: data,
  ...extra,
});
const topping = (id: number, description: string, active_state = true) =>
  nivel({ topping_id: id, description, price: 0, active: true, active_state });
const grupo = (id: number, description: string, min: number, toppings: unknown[], products: number[]) =>
  nivel(
    {
      topping_category_id: id,
      description,
      min_toppings_for_categories: min,
      max_toppings_for_categories: 1,
      products,
    },
    { toppings },
  );
const menu = {
  metadata: { store_id: 'MX1930370851', store_name: 'The Coffee Essentia - Turbo' },
  response: {
    corridors: [
      nivel(
        { corridor_id: 1523855, corridor_name: 'Combos', active_state: true },
        {
          products: [
            nivel(
              {
                product_id: 32114755,
                name: 'The Perfect Match',
                price: 159,
                old_price: 159,
                image: 'a.png',
                description: '"""Dos bebidas"""',
                available: true,
                active_state: true,
                active: true,
                sku: 'sku-1',
                combo: true,
                index: 0,
              },
              {
                topping_categories: [
                  grupo(
                    1,
                    'Elige tu Match',
                    1,
                    [topping(11, 'Latte', false), topping(12, 'Americano', false)],
                    [32114755],
                  ),
                  grupo(
                    2,
                    'Elige tu leche',
                    1,
                    [topping(21, 'Entera'), topping(22, 'Avena', false)],
                    [32114755, 32114756],
                  ),
                ],
              },
            ),
            nivel(
              {
                product_id: 32114756,
                name: '  Salted Caramel   Frappé ',
                price: 99,
                old_price: 99,
                image: null,
                description: '',
                available: false,
                active_state: false,
                active: true,
                sku: 'sku-2',
                combo: false,
                index: 1,
              },
              {
                topping_categories: [
                  grupo(
                    2,
                    'Elige tu leche',
                    1,
                    [topping(21, 'Entera'), topping(22, 'Avena', false)],
                    [32114755, 32114756],
                  ),
                ],
              },
            ),
          ],
        },
      ),
    ],
  },
};

describe('menú del lector de Rappi', () => {
  it('productos: apagado = available o active_state en false; grupos obligatorios sin opción disponible', () => {
    const m = menuCompacto('MX1930370851', menu);
    expect(m.productos.map((p) => [p.producto_id, p.nombre, p.disponible, p.sin_opcion_obligatoria])).toEqual(
      [
        [32114755, 'The Perfect Match', true, ['Elige tu Match']],
        [32114756, 'Salted Caramel   Frappé', false, []],
      ],
    );
    expect(m.productos[0]).toMatchObject({
      categoria: 'Combos',
      categoria_id: 1523855,
      combo: true,
      tiene_foto: true,
      tiene_descripcion: true,
    });
    expect(m.productos[1]).toMatchObject({
      nombre_norm: 'salted caramel frappe',
      tiene_foto: false,
      tiene_descripcion: false,
    });
  });

  it('toppings: una vez por tienda con la unión de sus productos', () => {
    const m = menuCompacto('MX1930370851', menu);
    expect(m.toppings.map((t) => [t.topping_id, t.grupo, t.disponible, t.productos])).toEqual([
      [11, 'Elige tu Match', false, [32114755]],
      [12, 'Elige tu Match', false, [32114755]],
      [21, 'Elige tu leche', true, [32114755, 32114756]],
      [22, 'Elige tu leche', false, [32114755, 32114756]],
    ]);
    expect(() => menuCompacto('MX1', { response: {} })).toThrow(/sin categorías/);
  });

  it('nombre normalizado y cuándo se lee el menú', () => {
    expect(normalizarNombre('  Açaí   Bowl ')).toBe('acai bowl');
    expect([7, 17, 27, 37, 47, 57].map((minuto) => tocaMenu({ tipo: 'vivo', minuto }))).toEqual([
      false,
      true,
      false,
      false,
      true,
      false,
    ]);
    expect(tocaMenu({ tipo: 'cierre', minuto: 7 })).toBe(false);
    expect(tocaMenu({ tipo: 'manual', minuto: 0 })).toBe(false);
    expect(tocaMenu({ tipo: 'manual', minuto: 0, menu: true })).toBe(true);
  });
});
