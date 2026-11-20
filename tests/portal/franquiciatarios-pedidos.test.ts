import { beforeEach, describe, expect, it, vi } from 'vitest';
import { armarPedidos, normalizarNombre, type FilaPedidoLegado } from '../../lib/franquiciatarios/pedidos';
import type { FranqRecepcion } from '../../lib/franquiciatarios/tipos';
import { configDe } from '../../lib/sucursales/config';

// F3: pedidos de la sucursal a la Comercializadora (sitio viejo) y su recepción.
vi.mock('server-only', () => ({}));
const estado = {
  apertura: null as { id: string; sucursal: string } | null,
  pedidos: [] as FilaPedidoLegado[],
};
const filtros: [string, string, unknown][] = [];
vi.mock('../../lib/comercializadora/legado', () => ({
  servicioLegado: () => ({
    from: (tabla: string) => {
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filtros.push([tabla, c, v]), q),
        gte: () => q,
        order: () => q,
        limit: async () => ({ data: estado.pedidos, error: null }),
        maybeSingle: async () => ({ data: estado.apertura, error: null }),
      };
      return q;
    },
  }),
}));

const AHORA = new Date('2026-11-20T18:00:00Z');
const fila = (id: string, extra: Partial<FilaPedidoLegado> = {}): FilaPedidoLegado => ({
  id,
  apertura_id: '397',
  fecha_pedido: '2026-11-13T15:12:12Z',
  status: 'enviado',
  monto: '1520.00',
  items: JSON.stringify([
    {
      sku: 'INS-CAF-003',
      nombre: 'Café en Grano White 1.5 Kg',
      precio: '600.00',
      cantidad: 2,
      variante: null,
    },
    { sku: 'UNI-PLA-023', nombre: 'Playera Unisex', precio: '160.00', cantidad: 2, variante: 'M' },
  ]),
  items_editados: null,
  shopify_order_number: '#CMS3178',
  ...extra,
});
const ID1 = '1f48253a-28bf-4f73-9ef3-9b52cf3d89a7';
const ID2 = '04598135-cfcd-428c-96f8-4f9e8627bab4';

describe('armarPedidos', () => {
  it('sin montos no sale ningún precio ni total (ni en el JSON)', () => {
    const [p] = armarPedidos([fila(ID1)], [], { conMontos: false, ahora: AHORA });
    const json = JSON.stringify(p);
    expect(json).not.toMatch(/precio|total|600|1520/);
    expect(p.lineas).toEqual([
      { nombre: 'Café en Grano White 1.5 Kg', sku: 'INS-CAF-003', variante: null, cantidad: 2 },
      { nombre: 'Playera Unisex', sku: 'UNI-PLA-023', variante: 'M', cantidad: 2 },
    ]);
    expect(p.piezas).toBe(4);
  });

  it('con montos (administrador) trae precio y total', () => {
    const [p] = armarPedidos([fila(ID1)], [], { conMontos: true, ahora: AHORA });
    expect(p.total).toBe(1520);
    expect(p.lineas[0].precio).toBe(600);
  });

  it('los artículos editados mandan sobre los originales', () => {
    const [p] = armarPedidos(
      [fila(ID1, { items_editados: [{ sku: 'X', nombre: 'Solo esto', cantidad: 1, precio: '10' }] })],
      [],
      { conMontos: false, ahora: AHORA },
    );
    expect(p.lineas.map((l) => l.nombre)).toEqual(['Solo esto']);
  });

  it('recibible: en camino o entregado, reciente y sin recepción; la recepción se une por id', () => {
    const rec: FranqRecepcion = {
      id: 1,
      company_id: 514,
      pedido_id: ID2,
      folio: '#CMS3245',
      completo: false,
      diferencias: [{ nombre: 'Playera Unisex', sku: 'UNI-PLA-023', pedido: 2, recibido: 1 }],
      observacion: 'Faltó una',
      barista_id: 1,
      nombre: 'Ana',
      registrado_por: 'u',
      registrado_en: '2026-11-20T17:00:00Z',
      sesion: null,
      dispositivo: null,
    };
    const ps = armarPedidos(
      [
        fila(ID1),
        fila(ID2, { fecha_pedido: '2026-11-20T15:28:12Z', status: 'recibido' }),
        fila('00000000-0000-0000-0000-000000000003', { status: 'pagado' }),
        fila('00000000-0000-0000-0000-000000000004', {
          fecha_pedido: '2026-08-01T15:00:00Z',
          status: 'terminado',
        }),
      ],
      [rec],
      { conMontos: false, ahora: AHORA },
    );
    const por = Object.fromEntries(ps.map((p) => [p.id, p]));
    expect(ps[0].id).toBe(ID2); // más reciente primero
    expect(por[ID1].recibible).toBe(true);
    expect(por[ID2].recibible).toBe(false);
    expect(por[ID2].recepcion?.diferencias).toHaveLength(1);
    expect(por['00000000-0000-0000-0000-000000000003'].recibible).toBe(false); // aún no sale
    expect(por['00000000-0000-0000-0000-000000000004'].recibible).toBe(false); // fuera de los 60 días
    expect(por[ID1].estadoTexto).toBe('En camino');
  });

  it('normalizarNombre ignora acentos, mayúsculas y espacios', () => {
    expect(normalizarNombre('  Namóra  Country ')).toBe(normalizarNombre('namora country'));
  });
});

describe('leerPedidosSucursal · candado de apertura', () => {
  beforeEach(() => {
    filtros.length = 0;
    estado.pedidos = [fila(ID1), fila(ID2, { apertura_id: '411' })];
  });

  it('lee la apertura = número de tienda, solo si el nombre coincide, y descarta filas de otra apertura', async () => {
    const { leerPedidosSucursal } = await import('../../lib/franquiciatarios/pedidos-servidor');
    estado.apertura = { id: '397', sucursal: 'Essentia' };
    const r = await leerPedidosSucursal(configDe(514)!, AHORA);
    expect(r.ok && r.apertura).toBe('397');
    expect(r.ok && r.filas.map((f) => f.id)).toEqual([ID1]);
    expect(filtros).toContainEqual(['com_legado_pedidos', 'apertura_id', '397']);
  });

  it('si el nombre de la apertura no coincide con la sucursal, no lee pedidos', async () => {
    const { leerPedidosSucursal, SIN_VINCULO } = await import('../../lib/franquiciatarios/pedidos-servidor');
    estado.apertura = { id: '397', sucursal: 'Otra tienda' };
    const r = await leerPedidosSucursal(configDe(514)!, AHORA);
    expect(r).toEqual({ ok: false, error: SIN_VINCULO });
    expect(filtros.some(([t]) => t === 'com_legado_pedidos')).toBe(false);
  });
});
