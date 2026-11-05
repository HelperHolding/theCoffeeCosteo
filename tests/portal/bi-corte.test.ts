import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { rappiServicio } from '../../lib/sucursales/corte-servidor';

const fila = (id: string, tienda: string, canal: string | null) => ({
  rappi_pedido_id: id,
  rappi_tienda_id: tienda,
  creado_local: '2026-11-03T10:00:00',
  fecha_local: '2026-11-03',
  estado: 'finished',
  estado_nombre: 'Finalizado',
  en_disputa: false,
  estado_disputa: null,
  metodo_pago: 'rappi_pay',
  bruto: 100,
  descuento_aliado: null,
  estado_anterior: null,
  revisar: false,
  rappi_tiendas: canal ? { canal } : null,
  rappi_pedido_productos: [{ linea: 1, nombre: 'Latte', unidades: 1, precio: 100, opciones: [] }],
});

// Cliente falso: from().select().eq().gte().lte().limit() devuelve las filas.
const clienteCon = (filas: unknown[]) => {
  const selects: string[] = [];
  const cadena = {
    eq: () => cadena,
    gte: () => cadena,
    lte: () => cadena,
    limit: async () => ({ data: filas, error: null }),
  };
  const db = { from: () => ({ select: (s: string) => (selects.push(s), cadena) }) };
  return { db: db as never, selects };
};

describe('rappiServicio: Turbo', () => {
  it('marca RAPPI_TURBO en tienda turbo y RAPPI_PORTAL en normal', async () => {
    const { db, selects } = clienteCon([fila('1', 'MX1', 'turbo'), fila('2', 'MX2', 'normal')]);
    const fuente = rappiServicio(db, { rappiPortal: true, companyId: 1 } as never)!;
    const pedidos = (await fuente('2026-11-03', '2026-11-03'))!;
    expect(selects[0]).toContain('rappi_tiendas(canal)');
    expect(pedidos.map((p) => p.tipo)).toEqual(['RAPPI_TURBO', 'RAPPI_PORTAL']);
  });
});
