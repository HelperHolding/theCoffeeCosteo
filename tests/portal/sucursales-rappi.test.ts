import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (p: string) => {
    throw new Error(`REDIRECT:${p}`);
  },
}));
vi.mock('../../lib/supabase/servidor', () => ({
  servidor: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (tabla: string) => ({
      select: () => ({
        eq: (_c: string, id: string) => {
          if (tabla === 'perfil_modulos')
            return Promise.resolve({ data: [{ modulo: 'sucursales', nivel: 'lectura' }], error: null });
          if (tabla === 'perfil_sucursales')
            return Promise.resolve({ data: [{ company_id: 612 }], error: null });
          return {
            maybeSingle: async () => ({
              data: { user_id: id, nombre: 'Carla', rol: 'admin', activo: true },
              error: null,
            }),
          };
        },
      }),
    }),
  }),
}));

import { GET as vivo } from '../../app/api/sucursales/[companyId]/vivo/route';
import { GET as productosGet } from '../../app/api/sucursales/[companyId]/productos/route';
import { __reiniciarParaPruebas, vistaPedido } from '../../lib/sucursales/datos';
import { normalizar } from '../../lib/sucursales/normalizar';
import { conciliar, filtrarOrigen, resumen } from '../../lib/sucursales/metricas';
import type { RespuestaProductos, RespuestaVivo } from '../../lib/sucursales/contratos';
import { apiFalsa, pedido } from './sucursales-fixtures';

// Pedido de Rappi tal como llega (Rubén Darío): forma de pago RAPPI, fromSmartphone=false, neto menor.
const rappi = (hora: string, fecha = '2026-10-22') =>
  pedido(fecha, hora, {
    paymentMethod: 'RAPPI',
    paymentType: 'CREDIT',
    fromSmartphone: false,
    grossAmount: 165,
    netAmout: 140.25,
    percentageOfTransfer: 85,
  });

describe('normalización y filtros', () => {
  it('RAPPI se clasifica como origen rappi aunque fromSmartphone sea false; "todos" lo incluye', () => {
    const { pedidos } = normalizar(
      [pedido('2026-10-22', '08:00:00'), rappi('09:00:00')] as never,
      { companyId: 612, modoTiempo: 'local-etiquetada-z', zona: 'America/Ciudad_Juarez' },
      { desde: '2026-10-22', hasta: '2026-10-22' },
    );
    expect(pedidos.map((p) => p.origen).sort()).toEqual(['mostrador', 'rappi']);
    expect(
      filtrarOrigen(pedidos, 'todos')
        .map((p) => p.origen)
        .sort(),
    ).toEqual(['mostrador', 'rappi']);
    expect(filtrarOrigen(pedidos, 'mostrador').map((p) => p.origen)).toEqual(['mostrador']);
    const r = resumen(filtrarOrigen(pedidos, 'rappi'));
    expect(r).toMatchObject({ ventaCent: 16500, netoCent: 14025 });
  });

  it('Orden Rappi: solo con pago RAPPI y refundId de 10 dígitos; nunca expone refundId de otros pagos', () => {
    const UUID = '3f0c1a2e-8b7d-4c1e-9a6f-2d4b5e6f7a8b';
    const casos = [
      rappi('08:00:00', '2026-10-22'), // refundId sintético con formato inesperado
      { ...rappi('08:10:00'), refundId: '2482647582' },
      { ...rappi('08:20:00'), refundId: null },
      { ...rappi('08:30:00'), refundId: '' },
      { ...rappi('08:40:00'), refundId: '248264758' }, // 9 dígitos
      { ...rappi('08:50:00'), refundId: '24826475821' }, // 11 dígitos
      { ...rappi('09:00:00'), refundId: 2482647582 }, // número, no string
      { ...pedido('2026-10-22', '09:10:00'), refundId: UUID }, // tarjeta: UUID de transacción
      { ...pedido('2026-10-22', '09:20:00', { paymentMethod: 'DINHEIRO' }), refundId: '2482647582' },
    ];
    const n = normalizar(
      casos as never,
      { companyId: 612, modoTiempo: 'local-etiquetada-z', zona: 'America/Ciudad_Juarez' },
      { desde: '2026-10-22', hasta: '2026-10-22' },
    );
    // Un refundId de tipo inesperado no invalida el pedido.
    expect(n.invalidos).toBe(0);
    const orden = (hora: string) => n.pedidos.find((p) => p.hora === hora)!.numeroPedidoRappi;
    expect(orden('08:10:00')).toBe('2482647582');
    for (const h of [
      '08:00:00',
      '08:20:00',
      '08:30:00',
      '08:40:00',
      '08:50:00',
      '09:00:00',
      '09:10:00',
      '09:20:00',
    ])
      expect(orden(h)).toBeNull();
    const json = JSON.stringify(n.pedidos.map(vistaPedido));
    expect(json).not.toContain(UUID);
    expect(json).not.toContain('refundId');
    const c = conciliar(n.pedidos);
    expect(c.rappiSinNumeroOrden).toBe(6);
    // Los totales no dependen de la orden Rappi.
    expect(c.ventaCent).toBe(casos.length * 16500);
  });
});

describe('rutas con Rappi', () => {
  beforeEach(() => {
    const api = apiFalsa({
      '2026-10-22': [pedido('2026-10-22', '08:00:00'), rappi('09:00:00'), rappi('10:00:00')],
      '2026-10-15': [pedido('2026-10-15', '08:00:00'), rappi('09:30:00', '2026-10-15')],
    });
    __reiniciarParaPruebas({
      fetch: api.fetch,
      esperar: async () => {},
      ahora: () => Date.UTC(2026, 9, 22, 18, 0, 0),
      token: () => 't',
    });
  });
  const llamar = (h: typeof vivo, q: string) =>
    h(new Request(`http://localhost/api/sucursales/612/x${q}`), {
      params: Promise.resolve({ companyId: '612' }),
    });

  it('En vivo suma Rappi con Mostrador y App; filtrar por rappi trae solo Rappi con su neto', async () => {
    const pos = (await (await llamar(vivo, '')).json()) as RespuestaVivo;
    expect(pos.kpis).toMatchObject({ pedidos: 3, ventaCent: 49500 });
    expect(pos.origenes.map((o) => o.origen)).toEqual(['mostrador', 'rappi']);
    expect(pos.origenes[1].participacion).toBeCloseTo(2 / 3);
    expect(pos.pagos.map((p) => p.metodo)).toContain('RAPPI');
    const mostrador = (await (await llamar(vivo, '?origen=mostrador')).json()) as RespuestaVivo;
    expect(mostrador.kpis).toMatchObject({ pedidos: 1, ventaCent: 16500 });
    const r = (await (await llamar(vivo, '?origen=rappi')).json()) as RespuestaVivo;
    expect(r.kpis).toMatchObject({ pedidos: 2, ventaCent: 33000, netoCent: 28050 });
    expect(r.kpisBase).toMatchObject({ pedidos: 1 });
    expect(r.comparativo?.pedidos).toBeCloseTo(1);
    expect(r.ultimosPedidos.every((p) => p.origen === 'rappi' && p.metodo === 'RAPPI')).toBe(true);
  });

  it('Productos y conciliación incluyen Rappi en "todos"', async () => {
    const d = (await (await llamar(productosGet, '?desde=2026-10-22')).json()) as RespuestaProductos;
    expect(d.totales.pedidos).toBe(3);
    expect(d.conciliacion).toMatchObject({ ventaCent: 49500, diferenciaCent: 0 });
  });
});
