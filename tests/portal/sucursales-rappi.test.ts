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
import { __reiniciarParaPruebas } from '../../lib/sucursales/datos';
import { normalizar } from '../../lib/sucursales/normalizar';
import { filtrarOrigen, rappiExcluido, resumen } from '../../lib/sucursales/metricas';
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
  it('RAPPI se clasifica como origen rappi aunque fromSmartphone sea false; "todos" (POS) lo excluye', () => {
    const { pedidos } = normalizar(
      [pedido('2026-10-22', '08:00:00'), rappi('09:00:00')] as never,
      { companyId: 612, modoTiempo: 'local-etiquetada-z', zona: 'America/Ciudad_Juarez' },
      { desde: '2026-10-22', hasta: '2026-10-22' },
    );
    expect(pedidos.map((p) => p.origen).sort()).toEqual(['mostrador', 'rappi']);
    expect(filtrarOrigen(pedidos, 'todos').map((p) => p.origen)).toEqual(['mostrador']);
    expect(filtrarOrigen(pedidos, 'mostrador').map((p) => p.origen)).toEqual(['mostrador']);
    expect(rappiExcluido(pedidos)).toEqual({ pedidos: 1, ventaCent: 16500 });
    const r = resumen(filtrarOrigen(pedidos, 'rappi'));
    expect(r).toMatchObject({ ventaCent: 16500, netoCent: 14025 });
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

  it('En vivo POS excluye Rappi y lo reporta; el apartado Rappi solo trae Rappi con su neto', async () => {
    const pos = (await (await llamar(vivo, '')).json()) as RespuestaVivo;
    expect(pos.kpis).toMatchObject({ pedidos: 1, ventaCent: 16500 });
    expect(pos.rappiExcluido).toEqual({ pedidos: 2, ventaCent: 33000 });
    expect(pos.origenes.map((o) => o.origen)).toEqual(['mostrador']);
    expect(pos.origenes[0].participacion).toBe(1);
    const r = (await (await llamar(vivo, '?origen=rappi')).json()) as RespuestaVivo;
    expect(r.kpis).toMatchObject({ pedidos: 2, ventaCent: 33000, netoCent: 28050 });
    expect(r.kpisBase).toMatchObject({ pedidos: 1 });
    expect(r.comparativo?.pedidos).toBeCloseTo(1);
    expect(r.ultimosPedidos.every((p) => p.origen === 'rappi' && p.metodo === 'RAPPI')).toBe(true);
  });

  it('Productos POS no incluye ventas de Rappi y dice cuánto excluyó', async () => {
    const d = (await (await llamar(productosGet, '?desde=2026-10-22')).json()) as RespuestaProductos;
    expect(d.totales.pedidos).toBe(1);
    expect(d.rappiExcluido.pedidos).toBe(2);
    expect(d.conciliacion.ventaCent).toBe(16500);
  });
});
