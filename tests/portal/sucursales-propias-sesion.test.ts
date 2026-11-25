import { beforeEach, describe, expect, it, vi } from 'vitest';

const est = vi.hoisted(() => ({
  modulos: [] as { modulo: string; nivel: string }[],
  rol: 'finanzas',
  consultasCompanias: 0,
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (p: string) => {
    throw new Error(`REDIRECT:${p}`);
  },
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock('../../lib/supabase/servidor', () => ({
  servidor: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (tabla: string) => ({
      select: () => ({
        eq: () => {
          if (tabla === 'perfil_sucursales') {
            est.consultasCompanias++;
            return Promise.resolve({ data: [{ company_id: 612 }], error: null });
          }
          if (tabla === 'perfil_modulos') return Promise.resolve({ data: est.modulos, error: null });
          return {
            maybeSingle: async () => ({
              data: { user_id: 'u1', nombre: 'U', rol: est.rol, activo: true },
              error: null,
            }),
          };
        },
      }),
    }),
  }),
}));
import { accesoSucursales } from '../../lib/supabase/sesion';

describe('accesoSucursales con Pagos de Sucursales propias', () => {
  beforeEach(() => {
    est.consultasCompanias = 0;
  });

  it('solo sucursales_pagos (Holding): entra sin Red y sin compañías, sin consultarlas', async () => {
    est.rol = 'finanzas';
    est.modulos = [
      { modulo: 'sucursales_pagos', nivel: 'lectura' },
      { modulo: 'bi', nivel: 'lectura' },
    ];
    const a = await accesoSucursales();
    expect(a).toMatchObject({ ok: true, red: false, propias: true, companias: [] });
    expect(est.consultasCompanias).toBe(0);
  });

  it('usuario de ventas sin pagos: igual que antes', async () => {
    est.rol = 'admin';
    est.modulos = [{ modulo: 'sucursales', nivel: 'lectura' }];
    const a = await accesoSucursales();
    expect(a).toMatchObject({ ok: true, red: true, propias: false, companias: [612] });
  });

  it('sin ninguno de los dos accesos: 403', async () => {
    est.rol = 'finanzas';
    est.modulos = [{ modulo: 'bi', nivel: 'lectura' }];
    expect(await accesoSucursales()).toMatchObject({ ok: false, status: 403 });
  });
});
