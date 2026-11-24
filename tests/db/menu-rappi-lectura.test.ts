import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';
import {
  construirMenu,
  construirMenuNacional,
  type RpcMenuNacional,
  type RpcMenuRappi,
} from '../../lib/sucursales/menu-rappi';

// Migración 94 (docs/rappi-portal/09): sucursales_menu_rappi y sucursales_menu_nacional leen lo que guarda el lector
// (migración 93, rappi_importar_menu) con el acceso por sucursal; el armado de la pantalla sale de esa respuesta.
let db: PGlite;
let gdl: string;
let ajeno: string;

const NORMAL = 'MX1930270777'; // Namóra (513)
const TURBO = 'MX1930301156';

const producto = (id: number, o: Record<string, unknown> = {}) => ({
  producto_id: id,
  nombre: `Producto ${id}`,
  nombre_norm: `producto ${id}`,
  categoria_id: 10,
  categoria: 'Frappés',
  categoria_activa: true,
  precio: 89,
  precio_anterior: 89,
  disponible: true,
  activo: true,
  tiene_foto: true,
  tiene_descripcion: true,
  sku: null,
  combo: false,
  indice: id,
  sin_opcion_obligatoria: [],
  ...o,
});
const topping = (id: number, o: Record<string, unknown> = {}) => ({
  topping_id: id,
  nombre: `Leche ${id}`,
  nombre_norm: `leche ${id}`,
  grupo_id: 77,
  grupo: 'Elige tu leche',
  grupo_minimo: 1,
  grupo_maximo: 1,
  precio: 0,
  disponible: true,
  activo: true,
  productos: [1, 2],
  ...o,
});

async function importar(p: unknown) {
  await db.exec('set role service_role');
  try {
    await db.query('select public.rappi_importar_menu($1)', [JSON.stringify(p)]);
  } finally {
    await db.exec('reset role');
  }
}
const leer = async <T>(usuario: string, sql: string, args: unknown[]) =>
  comoUsuario(db, usuario, async () => (await db.query<{ r: T }>(sql, args)).rows[0].r);

beforeAll(async () => {
  db = await crearDbLocal();
  gdl = await crearUsuario(db, 'sucursales');
  ajeno = await crearUsuario(db, 'sucursales');
  for (const u of [gdl, ajeno])
    await db.query(
      `insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'sucursales', 'lectura')`,
      [u],
    );
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1, 513), ($2, 384)', [
    gdl,
    ajeno,
  ]);
  // Primera lectura (18:17): Producto 2 y Leche 6 apagados; en Turbo, Producto 3 encendido pero sin opción obligatoria.
  await importar({
    momento: '2026-11-23T18:17:00Z',
    tiendas: [
      {
        tienda: NORMAL,
        productos: [producto(1), producto(2, { disponible: false })],
        toppings: [topping(5), topping(6, { disponible: false })],
      },
      {
        tienda: TURBO,
        productos: [producto(1), producto(3, { sin_opcion_obligatoria: ['Elige tu Match'] })],
        toppings: [],
      },
    ],
    fallidas: [],
  });
  // Segunda (18:47): se apaga Producto 1 en Rappi y se prende Leche 6.
  await importar({
    momento: '2026-11-23T18:47:00Z',
    tiendas: [
      {
        tienda: NORMAL,
        productos: [producto(1, { disponible: false }), producto(2, { disponible: false })],
        toppings: [topping(5), topping(6)],
      },
      {
        tienda: TURBO,
        productos: [producto(1), producto(3, { sin_opcion_obligatoria: ['Elige tu Match'] })],
        toppings: [],
      },
    ],
    fallidas: [],
  });
});
afterAll(async () => db.close());

describe('sucursales_menu_rappi', () => {
  it('sin acceso a la sucursal devuelve null; con acceso, el menú vigente y desde cuándo', async () => {
    expect(await leer(ajeno, 'select public.sucursales_menu_rappi(513) r', [])).toBeNull();
    const r = await leer<RpcMenuRappi>(gdl, 'select public.sucursales_menu_rappi(513) r', []);
    expect(r.tiendas.map((t) => t.canal)).toEqual(['normal', 'turbo']);
    const p = (tienda: string, id: string) => r.productos.find((x) => x.tienda === tienda && x.id === id)!;
    expect(p(NORMAL, '1')).toMatchObject({ disponible: false });
    expect(new Date(p(NORMAL, '1').desde!).toISOString()).toBe('2026-11-23T18:47:00.000Z');
    expect(new Date(p(NORMAL, '2').desde!).toISOString()).toBe('2026-11-23T18:17:00.000Z');
    expect(new Date(r.primera_lectura!).toISOString()).toBe('2026-11-23T18:17:00.000Z');
    expect(r.corrida).toMatchObject({ completa: true, leidas: 2 });
  });

  it('armado de punta a punta: apagados, lo que no se puede pedir y los cambios entre lecturas', async () => {
    const r = await leer<RpcMenuRappi>(gdl, 'select public.sucursales_menu_rappi(513) r', []);
    const m = construirMenu(r, new Date('2026-11-23T19:00:00Z'));
    expect(m.totales).toMatchObject({
      productos: 4,
      apagados: 2,
      toppings: 2,
      toppingsApagados: 0,
      noSePuedenPedir: 1,
    });
    expect(m.revisar[0]).toMatchObject({ nivel: 'grave', nombre: 'Producto 3', canal: 'turbo' });
    expect(m.cambios.map((c) => [c.nombre, c.disponible])).toEqual(
      expect.arrayContaining([
        ['Producto 1', false],
        ['Leche 6', true],
      ]),
    );
    expect(m.cambios).toHaveLength(2);
    expect(m.lectura).toMatchObject({ estado: 'al-dia', fallidas: [] });
  });
});

describe('sucursales_menu_nacional', () => {
  it('solo las sucursales con acceso; sumas por tienda, apagados, sin opción y presencia', async () => {
    const r = await leer<RpcMenuNacional>(gdl, 'select public.sucursales_menu_nacional($1) r', [[513, 384]]);
    expect([...new Set(r.tiendas.map((t) => t.company_id))]).toEqual([513]);
    const n = r.por_tienda.find((x) => x.tienda === NORMAL)!;
    expect(n).toMatchObject({ productos: 2, apagados: 2, toppings: 2, toppings_apagados: 0, sin_opcion: 0 });
    expect(r.sin_opcion).toEqual([
      { tienda: TURBO, nombre: 'Producto 3', categoria: 'Frappés', grupos: ['Elige tu Match'] },
    ]);
    expect(r.presencia.find((x) => x.nombre_norm === 'producto 1')?.tiendas).toBe(2);
    const m = construirMenuNacional(
      r,
      [{ companyId: 513, nombre: 'Namóra', ciudad: 'Zapopan', rappiPortal: true }],
      new Date('2026-11-23T19:00:00Z'),
    );
    expect(m.totales).toMatchObject({ productos: 4, apagados: 2, noSePuedenPedir: 1 });
    expect(m.revisar.map((x) => x.nivel)).toEqual(['grave']);
    expect(await leer(ajeno, 'select public.sucursales_menu_nacional($1) r', [[513]])).toMatchObject({
      tiendas: [],
      por_tienda: [],
    });
  });
});
