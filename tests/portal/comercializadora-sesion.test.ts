import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ accesos: {} as Record<string, string> }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (ruta: string) => {
    throw new Error(`REDIRECT:${ruta}`);
  },
}));
vi.mock('../../lib/supabase/servidor', () => ({
  servidor: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (tabla: string) =>
      tabla === 'perfil_modulos'
        ? {
            select: () => ({
              eq: async () => ({
                data: Object.entries(m.accesos).map(([modulo, nivel]) => ({ modulo, nivel })),
                error: null,
              }),
            }),
          }
        : {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: { user_id: 'u1', nombre: 'Ana', rol: 'interno', activo: true },
                  error: null,
                }),
              }),
            }),
          },
  }),
}));
import { sesionComercializadora } from '../../lib/supabase/sesion';

describe('sesionComercializadora', () => {
  beforeEach(() => {
    m.accesos = {};
  });
  it('sin el módulo regresa a Inicio', async () => {
    await expect(sesionComercializadora()).rejects.toThrow('REDIRECT:/');
  });
  it('con el módulo entra aunque el rol no tenga Costeo, y trae su nivel', async () => {
    m.accesos = { comercializadora: 'lectura' };
    const s = await sesionComercializadora();
    expect(s.nivel).toBe('lectura');
  });
});
