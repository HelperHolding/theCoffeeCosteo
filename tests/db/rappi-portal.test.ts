import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, num } from './utilidades';

// Migración 28: pedidos de Rappi desde el portal de Partners (docs/rappi-portal). Escribe n8n (service_role) con
// rappi_importar; lee quien ve la sucursal con sucursales_rappi_portal.
let db: PGlite;
let gdl: string, ajeno: string;

const NORMAL = 'MX1930270777';
const TURBO = 'MX1930301156';

const pedido = (id: string, o: Record<string, unknown> = {}) => ({
  id,
  tienda: NORMAL,
  creado: '2026-10-27T07:43:02',
  estado: 'pending_review',
  estado_nombre: 'Terminada',
  en_disputa: false,
  estado_disputa: '',
  metodo_pago: 'Tarjeta de Crédito',
  prime: false,
  bruto: 221,
  descuento_aliado: null,
  descuentos: null,
  productos: [
    {
      linea: 1,
      rappi_producto_id: 'MX22835801',
      nombre: 'Crea tu The Coffee',
      unidades: 1,
      precio: 221,
      precio_con_desc_aliado: 221,
      descuento_rappi_pct: 0,
      opciones: [
        { categoria: 'Elige tu Bebida', descripcion: 'True White', precio: 10, unidades: 1 },
        { categoria: 'Leche.', descripcion: 'Entera', precio: 0, unidades: 1 },
      ],
    },
  ],
  ...o,
});

const lote = (pedidos: unknown[], o: Record<string, unknown> = {}) => ({
  tipo: 'vivo',
  desde: '2026-10-27',
  hasta: '2026-10-27',
  estado: 'ok',
  tiendas: [
    { rappi_tienda_id: NORMAL, por_dia: { '2026-10-27': { total_rows: 3, devueltos: 2 } } },
    { rappi_tienda_id: TURBO, por_dia: { '2026-10-27': { total_rows: 1, devueltos: 1 } } },
  ],
  pedidos,
  ...o,
});

async function importar(l: unknown) {
  await db.exec('set role service_role');
  try {
    return (
      await db.query<{ r: Record<string, unknown> }>('select public.rappi_importar($1) r', [
        JSON.stringify(l),
      ])
    ).rows[0].r;
  } finally {
    await db.exec('reset role');
  }
}
const leer = (u: string, c = 513, desde = '2026-10-27', hasta = '2026-10-27') =>
  comoUsuario(
    db,
    u,
    async () =>
      (
        await db.query<{ r: Record<string, unknown> | null }>(
          'select public.sucursales_rappi_portal($1, $2, $3) r',
          [c, desde, hasta],
        )
      ).rows[0].r,
  );
const fila = async (id: string) =>
  (await db.query<Record<string, unknown>>('select * from rappi_pedidos where rappi_pedido_id = $1', [id]))
    .rows[0];

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
});
afterAll(async () => db.close());

describe('rappi_importar', () => {
  it('solo la llave de servicio importa; las tablas no se leen desde el portal', async () => {
    await expect(
      comoUsuario(db, gdl, () => db.query('select public.rappi_importar($1)', [JSON.stringify(lote([]))])),
    ).rejects.toThrow(/permission denied/);
    await expect(comoUsuario(db, gdl, () => db.query('select * from rappi_pedidos'))).rejects.toThrow(
      /permission denied/,
    );
  });

  it('inserta pedidos y productos, y reprocesar el mismo lote no cambia nada', async () => {
    const l = lote([pedido('2483792428'), pedido('2483799559', { tienda: TURBO, bruto: 135 })]);
    const r1 = await importar(l);
    expect(r1).toMatchObject({ estado: 'ok', leidos: 2, nuevos: 2, cambiados: 0, desaparecidos: 0 });
    const r2 = await importar(l);
    expect(r2).toMatchObject({ leidos: 2, nuevos: 0, cambiados: 0, desaparecidos: 0 });
    const p = await fila('2483792428');
    expect(p).toMatchObject({ company_id: 513, estado: 'pending_review', revisar: false });
    expect(String(p.fecha_local)).toContain('2026');
    const prods = (
      await db.query<{ n: number }>(
        `select count(*) n from rappi_pedido_productos where rappi_pedido_id = 2483792428`,
      )
    ).rows[0];
    expect(num(prods.n)).toBe(1);
    const conteo = (
      await db.query<{ total_rows: number; devueltos: number }>(
        `select total_rows, devueltos from rappi_conteos where rappi_tienda_id = $1`,
        [NORMAL],
      )
    ).rows[0];
    expect(conteo).toEqual({ total_rows: 3, devueltos: 2 });
  });

  it('un cambio de estado actualiza el pedido, guarda el anterior y deja bitácora', async () => {
    const r = await importar(
      lote([
        pedido('2483792428', { estado: 'canceled', estado_nombre: 'Cancelada' }),
        pedido('2483799559', {
          tienda: TURBO,
          bruto: 135,
        }),
      ]),
    );
    expect(r).toMatchObject({ nuevos: 0, cambiados: 1 });
    expect((r.cambios as unknown[])[0]).toMatchObject({
      id: 2483792428,
      de: 'pending_review',
      a: 'canceled',
    });
    expect(await fila('2483792428')).toMatchObject({ estado: 'canceled', estado_anterior: 'pending_review' });
    const cambios = (
      await db.query<{ campo: string; antes: string; despues: string }>(
        `select campo, antes, despues from rappi_pedido_cambios where rappi_pedido_id = 2483792428`,
      )
    ).rows;
    expect(cambios).toEqual([{ campo: 'estado', antes: 'pending_review', despues: 'canceled' }]);
  });

  it('un cambio de productos los reemplaza (no se acumulan) y queda como cambio de productos', async () => {
    const otro = pedido('2483799559', {
      tienda: TURBO,
      bruto: 135,
      productos: [{ linea: 1, nombre: 'Pumpkin Iced Latte', unidades: 1, precio: 135, opciones: [] }],
    });
    const r = await importar(
      lote([pedido('2483792428', { estado: 'canceled', estado_nombre: 'Cancelada' }), otro]),
    );
    expect(r).toMatchObject({ cambiados: 1 });
    const prods = (
      await db.query<{ nombre: string }>(
        `select nombre from rappi_pedido_productos where rappi_pedido_id = 2483799559`,
      )
    ).rows;
    expect(prods).toEqual([{ nombre: 'Pumpkin Iced Latte' }]);
    const campos = (
      await db.query<{ campo: string }>(
        `select campo from rappi_pedido_cambios where rappi_pedido_id = 2483799559`,
      )
    ).rows;
    expect(campos).toEqual([{ campo: 'productos' }]);
  });

  it('el descuento del detalle se conserva aunque una corrida posterior no lo traiga', async () => {
    const con = pedido('2483792428', {
      estado: 'canceled',
      estado_nombre: 'Cancelada',
      descuento_aliado: 39.8,
      descuentos: [{ type_description: 'offer_by_product', value: 39.8 }],
    });
    const otro = pedido('2483799559', {
      tienda: TURBO,
      bruto: 135,
      productos: [{ linea: 1, nombre: 'Pumpkin Iced Latte', unidades: 1, precio: 135, opciones: [] }],
    });
    await importar(lote([con, otro]));
    const r = await importar(lote([{ ...con, descuento_aliado: null, descuentos: null }, otro]));
    expect(r).toMatchObject({ cambiados: 0 });
    expect(num((await fila('2483792428')).descuento_aliado)).toBe(39.8);
  });

  it('un pedido que ya no aparece se marca para revisión, no se borra; si vuelve, se desmarca', async () => {
    const otro = pedido('2483799559', {
      tienda: TURBO,
      bruto: 135,
      productos: [{ linea: 1, nombre: 'Pumpkin Iced Latte', unidades: 1, precio: 135, opciones: [] }],
    });
    const r = await importar(lote([otro]));
    expect(r).toMatchObject({ desaparecidos: 1 });
    expect(await fila('2483792428')).toMatchObject({ revisar: true });
    await importar(lote([pedido('2483792428', { estado: 'canceled', estado_nombre: 'Cancelada' }), otro]));
    expect(await fila('2483792428')).toMatchObject({ revisar: false });
  });

  it('una corrida fallida solo deja constancia y no toca pedidos', async () => {
    const r = await importar({
      tipo: 'vivo',
      desde: '2026-10-27',
      hasta: '2026-10-27',
      estado: 'sesion_expirada',
      mensaje: 'Rappi cerró la sesión',
      tiendas: [],
      pedidos: [],
    });
    expect(r).toMatchObject({ estado: 'sesion_expirada' });
    expect(await fila('2483792428')).toMatchObject({ revisar: false });
  });

  it('rechaza tiendas que no están registradas', async () => {
    await expect(
      importar(lote([], { tiendas: [{ rappi_tienda_id: 'MX1930260682', por_dia: {} }] })),
    ).rejects.toThrow(/no registrada/);
  });
});

describe('sucursales_rappi_portal', () => {
  it('quien ve la sucursal recibe tiendas, conteos y pedidos con productos; otro recibe null', async () => {
    const r = await leer(gdl);
    expect(r?.tiendas).toEqual([
      { id: NORMAL, nombre: 'The Coffee Namóra', canal: 'normal' },
      { id: TURBO, nombre: 'The Coffee Namóra - Turbo', canal: 'turbo' },
    ]);
    const pedidos = r?.pedidos as { id: string; productos: { nombre: string; opciones: unknown[] }[] }[];
    expect(pedidos.map((p) => p.id).sort()).toEqual(['2483792428', '2483799559']);
    expect(pedidos.find((p) => p.id === '2483792428')?.productos[0].opciones).toHaveLength(2);
    expect((r?.conteos as unknown[]).length).toBe(2);
    expect((r?.ultima_corrida as { estado: string }).estado).toBe('sesion_expirada');
    expect(await leer(ajeno)).toBeNull();
  });

  it('el periodo es de 62 días como máximo', async () => {
    await expect(leer(gdl, 513, '2026-08-01', '2026-10-27')).rejects.toThrow(/Periodo inválido/);
  });
});
