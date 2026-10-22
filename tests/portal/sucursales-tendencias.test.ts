import { beforeEach, describe, expect, it, vi } from 'vitest';

const sesion = vi.hoisted(() => ({ usuario: 'u1' as string | null, companias: [612] as number[] }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (p: string) => {
    throw new Error(`REDIRECT:${p}`);
  },
}));
vi.mock('../../lib/supabase/servidor', () => ({
  servidor: async () => ({
    auth: {
      getUser: async () =>
        sesion.usuario
          ? { data: { user: { id: sesion.usuario } }, error: null }
          : { data: { user: null }, error: null },
    },
    from: (tabla: string) => ({
      select: () => ({
        eq: (_c: string, id: string) => {
          if (tabla === 'perfil_modulos')
            return Promise.resolve({ data: [{ modulo: 'sucursales', nivel: 'lectura' }], error: null });
          if (tabla === 'perfil_sucursales')
            return Promise.resolve({
              data: sesion.companias.map((company_id) => ({ company_id })),
              error: null,
            });
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

import { GET as tendencias } from '../../app/api/sucursales/[companyId]/tendencias/route';
import { __reiniciarParaPruebas } from '../../lib/sucursales/datos';
import { conteoDiaHora, diaLunes, semanasCerradas } from '../../lib/sucursales/metricas';
import { normalizar } from '../../lib/sucursales/normalizar';
import { enZona } from '../../lib/sucursales/tiempo';
import type { RespuestaTendencias } from '../../lib/sucursales/contratos';
import { apiFalsa, pedido } from './sucursales-fixtures';

describe('semanas cerradas', () => {
  it('lunes a domingo; la última termina el domingo anterior a hoy', () => {
    // Jueves 22-oct-2026.
    expect(semanasCerradas('2026-10-22', 4)).toEqual([
      { desde: '2026-09-21', hasta: '2026-09-27' },
      { desde: '2026-09-28', hasta: '2026-10-04' },
      { desde: '2026-10-05', hasta: '2026-10-11' },
      { desde: '2026-10-12', hasta: '2026-10-18' },
    ]);
    // Lunes: la semana de ayer ya cerró. Domingo: la semana en curso todavía no.
    expect(semanasCerradas('2026-10-19', 1)).toEqual([{ desde: '2026-10-12', hasta: '2026-10-18' }]);
    expect(semanasCerradas('2026-10-25', 1)).toEqual([{ desde: '2026-10-12', hasta: '2026-10-18' }]);
  });

  it('el cambio de horario (1-nov) no mueve la frontera: el domingo 23:30 local sigue siendo domingo', () => {
    const hoy = enZona(new Date('2026-11-02T06:30:00Z'), 'America/Ciudad_Juarez').fecha; // 1-nov 23:30 (UTC−7)
    expect(hoy).toBe('2026-11-01');
    expect(semanasCerradas(hoy, 1)).toEqual([{ desde: '2026-10-19', hasta: '2026-10-25' }]);
  });

  it('conteo día × hora con lunes = 0', () => {
    expect(diaLunes('2026-10-19')).toBe(0);
    expect(diaLunes('2026-10-25')).toBe(6);
    const { pedidos } = normalizar(
      [
        pedido('2026-10-19', '08:10:00'),
        pedido('2026-10-25', '19:00:00'),
        pedido('2026-10-25', '19:30:00'),
      ] as never,
      { companyId: 612, modoTiempo: 'local-etiquetada-z', zona: 'America/Ciudad_Juarez' },
      { desde: '2026-10-19', hasta: '2026-10-25' },
    );
    const m = conteoDiaHora(pedidos);
    expect(m[0][8]).toBe(1);
    expect(m[6][19]).toBe(2);
  });
});

// Jueves 22-oct-2026 12:00 en Juárez.
const AHORA = Date.UTC(2026, 9, 22, 18, 0, 0);
const llamar = (q = '', id = '612') =>
  tendencias(new Request(`http://localhost/api/sucursales/${id}/tendencias${q}`), {
    params: Promise.resolve({ companyId: id }),
  });

describe('ruta de tendencias', () => {
  let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;
  beforeEach(() => {
    sesion.usuario = 'u1';
    sesion.companias = [612];
    const api = apiFalsa({
      '2026-09-22': [pedido('2026-09-22', '09:00:00')],
      '2026-09-29': [pedido('2026-09-29', '09:00:00'), pedido('2026-09-29', '09:30:00')],
      '2026-10-06': [pedido('2026-10-06', '09:00:00'), pedido('2026-10-06', '10:00:00')],
      '2026-10-13': [
        pedido('2026-10-13', '09:00:00'),
        pedido('2026-10-13', '09:20:00'),
        pedido('2026-10-13', '18:00:00', { fromSmartphone: true, paymentMethod: 'VIRTUAL_WALLET' }),
      ],
    });
    // La semana del 21–27 sep falla siempre (503): debe quedar incompleta y fuera de los totales.
    fetchSpy = vi.fn<typeof fetch>(async (u, init) =>
      String(u).includes('dateStart=2026-09-21') ? new Response('', { status: 503 }) : api.fetch(u, init),
    );
    __reiniciarParaPruebas({
      fetch: fetchSpy,
      esperar: async () => {},
      ahora: () => AHORA,
      token: () => 't',
    });
  });

  it('valida semanas y permisos antes de leer al proveedor', async () => {
    expect((await llamar('?semanas=5')).status).toBe(400);
    expect((await llamar('?origen=rappi')).status).toBe(400);
    sesion.usuario = null;
    expect((await llamar()).status).toBe(401);
    sesion.usuario = 'u1';
    expect((await llamar('', '477')).status).toBe(404);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('4 semanas: una incompleta se marca y no entra en totales, variación ni mapa', async () => {
    const r = await llamar();
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    const d = (await r.json()) as RespuestaTendencias;
    expect(d.semanas.map((s) => s.desde)).toEqual(['2026-09-21', '2026-09-28', '2026-10-05', '2026-10-12']);
    expect(d.semanas[0]).toMatchObject({ kpis: null, pagos: [], variacionVenta: null });
    expect(d.semanas[0].lectura.estado).toBe('error');
    expect(d.semanasCompletas).toBe(3);
    expect(d.totales.pedidos).toBe(7);
    // Sin base comparable para la semana siguiente a una incompleta; luego +0% y +50%.
    expect(d.semanas.map((s) => s.variacionVenta)).toEqual([null, null, 0, 0.5]);
    // Mapa: martes (1) a las 9 → (2 + 1 + 2) / 3 semanas; celda sin pedidos = 0, no null.
    expect(d.mapa[1][9]).toBeCloseTo(5 / 3);
    expect(d.mapa[3][9]).toBe(0);
    expect(d.semanas[3].origenes.map((o) => o.origen)).toEqual(['mostrador', 'app']);
    expect(d.conciliacion.diferenciaCent).toBe(0);
  });

  it('filtro de origen aplicado a todas las semanas', async () => {
    const d = (await (await llamar('?origen=app')).json()) as RespuestaTendencias;
    expect(d.totales.pedidos).toBe(1);
    expect(d.semanas[3].pagos.map((p) => p.metodo)).toEqual(['VIRTUAL_WALLET']);
  });

  it('sin semanas completas: mapa sin datos (null), no ceros', async () => {
    fetchSpy.mockImplementation(async () => new Response('', { status: 503 }));
    const d = (await (await llamar()).json()) as RespuestaTendencias;
    expect(d.semanasCompletas).toBe(0);
    expect(d.mapa.flat().every((v) => v === null)).toBe(true);
  });
});
