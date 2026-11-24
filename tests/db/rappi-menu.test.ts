import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 93: Menú/Carta de Rappi (docs/rappi-portal/09). Escribe n8n (service_role) con rappi_importar_menu; nadie
// lee las tablas directo (las lecturas son de la migración 94).
let db: PGlite;
let usuario: string;

const NORMAL = 'MX1930270777'; // Namóra
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
  sku: `sku-${id}`,
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
const lectura = (momento: string, tiendas: unknown[], fallidas: unknown[] = []) => ({
  momento,
  tiendas,
  fallidas,
});

async function importar(p: unknown) {
  await db.exec('set role service_role');
  try {
    return (
      await db.query<{ r: Record<string, unknown> }>('select public.rappi_importar_menu($1) r', [
        JSON.stringify(p),
      ])
    ).rows[0].r;
  } finally {
    await db.exec('reset role');
  }
}
const filas = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) =>
  (await db.query<T>(sql, args)).rows;
const tramos = (tipo: string, id: number) =>
  filas<{ disponible: boolean; desde: Date; visto: Date; hasta: Date | null }>(
    `select disponible, desde, visto, hasta from rappi_menu_tramos where rappi_tienda_id = $1 and tipo = $2 and item_id = $3
     order by desde`,
    [NORMAL, tipo, id],
  );
const hora = (x: Date | null) => (x ? new Date(x).toISOString().slice(11, 16) : null);

beforeAll(async () => {
  db = await crearDbLocal();
  usuario = await crearUsuario(db, 'sucursales');
});
afterAll(async () => db.close());

describe('rappi_importar_menu', () => {
  it('solo la llave de servicio importa; las tablas no se leen desde el portal', async () => {
    await expect(
      comoUsuario(db, usuario, () => db.query('select public.rappi_importar_menu($1)', ['{}'])),
    ).rejects.toThrow(/permission denied/);
    for (const t of [
      'rappi_menu_productos',
      'rappi_menu_toppings',
      'rappi_menu_tramos',
      'rappi_menu_corridas',
    ])
      await expect(comoUsuario(db, usuario, () => db.query(`select * from ${t}`))).rejects.toThrow(
        /permission denied/,
      );
  });

  it('una corrida sin menú no registra nada', async () => {
    expect(await importar(null)).toEqual({ sin_menu: true });
    expect(await importar({ momento: '2026-11-23T18:07:00Z', tiendas: [], fallidas: [] })).toEqual({
      sin_menu: true,
    });
    expect((await filas('select count(*)::int n from rappi_menu_corridas'))[0].n).toBe(0);
  });

  it('primera foto: vigentes, un tramo abierto por item y la corrida', async () => {
    const r = await importar(
      lectura('2026-11-23T18:17:00Z', [
        {
          tienda: NORMAL,
          productos: [
            producto(1),
            producto(2, { disponible: false, sin_opcion_obligatoria: ['Elige tu Match'] }),
          ],
          toppings: [topping(5), topping(6, { disponible: false })],
        },
        { tienda: TURBO, productos: [producto(1)], toppings: [] },
      ]),
    );
    expect(r).toMatchObject({
      tiendas: 2,
      productos: 3,
      toppings: 2,
      tramos_abiertos: 5,
      tramos_cerrados: 0,
    });
    const [p2] = await filas(
      'select disponible, sin_opcion_obligatoria, eliminado_en from rappi_menu_productos where rappi_tienda_id = $1 and producto_id = 2',
      [NORMAL],
    );
    expect(p2).toEqual({ disponible: false, sin_opcion_obligatoria: ['Elige tu Match'], eliminado_en: null });
    expect(
      (await filas('select productos from rappi_menu_toppings where topping_id = 5'))[0].productos,
    ).toEqual([1, 2]);
    const [c] = await filas(
      'select tiendas, leidas, fallidas, completa from rappi_menu_corridas order by id desc limit 1',
    );
    expect(c).toEqual({ tiendas: 2, leidas: 2, fallidas: 0, completa: true });
  });

  it('se apaga, se prende, desaparece y reaparece: tramos con desde, visto y hasta', async () => {
    const t = (hhmm: string) => `2026-11-23T${hhmm}:00Z`;
    // 18:47: el 1 se apaga; 19:17 sigue apagado; 19:47 el 1 ya no viene en el menú; 20:17 vuelve prendido.
    await importar(
      lectura(t('18:47'), [
        {
          tienda: NORMAL,
          productos: [producto(1, { disponible: false }), producto(2)],
          toppings: [topping(5)],
        },
      ]),
    );
    await importar(
      lectura(t('19:17'), [
        {
          tienda: NORMAL,
          productos: [producto(1, { disponible: false }), producto(2)],
          toppings: [topping(5)],
        },
      ]),
    );
    const r = await importar(
      lectura(t('19:47'), [{ tienda: NORMAL, productos: [producto(2)], toppings: [topping(5)] }]),
    );
    expect(r).toMatchObject({ eliminados: 1 }); // el producto 1 (el topping 6 ya había dejado de venir a las 18:47)
    await importar(
      lectura(t('20:17'), [
        { tienda: NORMAL, productos: [producto(1), producto(2)], toppings: [topping(5)] },
      ]),
    );
    expect(
      (await tramos('producto', 1)).map((x) => [x.disponible, hora(x.desde), hora(x.visto), hora(x.hasta)]),
    ).toEqual([
      [true, '18:17', '18:17', '18:47'],
      [false, '18:47', '19:17', '19:47'],
      [true, '20:17', '20:17', null],
    ]);
    // El 2 se prendió a las 18:47 y sigue: su tramo apagado se cerró y el prendido se extiende.
    expect(
      (await tramos('producto', 2)).map((x) => [x.disponible, hora(x.desde), hora(x.visto), hora(x.hasta)]),
    ).toEqual([
      [false, '18:17', '18:17', '18:47'],
      [true, '18:47', '20:17', null],
    ]);
    const [p1] = await filas(
      'select eliminado_en from rappi_menu_productos where rappi_tienda_id = $1 and producto_id = 1',
      [NORMAL],
    );
    expect(p1.eliminado_en).toBeNull();
    // El topping 6 dejó de venir a las 18:47: eliminado y su tramo cerrado.
    const [t6] = await filas(
      'select eliminado_en from rappi_menu_toppings where rappi_tienda_id = $1 and topping_id = 6',
      [NORMAL],
    );
    expect(t6.eliminado_en).not.toBeNull();
    expect((await tramos('topping', 6)).every((x) => x.hasta !== null)).toBe(true);
    // Turbo no vino en esas lecturas: conserva su estado.
    const [turbo] = await filas(
      'select visto_en, eliminado_en from rappi_menu_productos where rappi_tienda_id = $1',
      [TURBO],
    );
    expect([hora(turbo.visto_en as Date), turbo.eliminado_en]).toEqual(['18:17', null]);
  });

  it('una foto vieja, una tienda sin alta y una tienda que falló no cambian nada y quedan en la corrida', async () => {
    const r = await importar(
      lectura(
        '2026-11-23T19:00:00Z',
        [
          { tienda: NORMAL, productos: [producto(1, { disponible: false })], toppings: [] },
          { tienda: 'MX1', productos: [producto(1)], toppings: [] },
        ],
        [{ tienda: TURBO, motivo: 'HTTP 403' }],
      ),
    );
    expect(r).toMatchObject({ tiendas: 0, productos: 0, viejas: [NORMAL], ignoradas: ['MX1'], fallidas: 1 });
    const [p1] = await filas(
      'select disponible from rappi_menu_productos where rappi_tienda_id = $1 and producto_id = 1',
      [NORMAL],
    );
    expect(p1.disponible).toBe(true);
    const [c] = await filas(
      'select tiendas, leidas, fallidas, completa, detalle from rappi_menu_corridas order by id desc limit 1',
    );
    expect(c).toMatchObject({ tiendas: 3, leidas: 0, fallidas: 3, completa: false });
    expect((c.detalle as { fallidas: unknown[] }).fallidas).toEqual([{ tienda: TURBO, motivo: 'HTTP 403' }]);
  });
});
