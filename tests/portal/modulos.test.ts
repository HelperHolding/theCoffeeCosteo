import { beforeEach, expect, it, vi } from 'vitest';
import { modulosVisibles, puedeEditarCrm } from '../../lib/portal/modulos';

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  perfil: vi.fn(),
  modulos: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock('../../lib/supabase/servidor', () => ({
  servidor: async () => ({
    auth: { getUser: mocks.user },
    from: (tabla: string) =>
      tabla === 'perfil_modulos'
        ? { select: () => ({ eq: mocks.modulos }) }
        : { select: () => ({ eq: () => ({ maybeSingle: mocks.perfil }) }) },
  }),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
import { sesionCrm } from '../../lib/supabase/sesion';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ data: { user: { id: 'u' } }, error: null });
  mocks.perfil.mockResolvedValue({
    data: { user_id: 'u', nombre: 'Carlos', rol: 'admin', activo: true },
    error: null,
  });
  mocks.modulos.mockResolvedValue({ data: [], error: null });
});

it('Costeo es visible para todo perfil activo; el CRM solo con acceso explícito', () => {
  expect(modulosVisibles({})).toEqual(['costeo']);
  expect(modulosVisibles({ crm: 'lectura' })).toEqual(['costeo', 'crm']);
  expect(puedeEditarCrm({ crm: 'lectura' })).toBe(false);
  expect(puedeEditarCrm({ crm: 'desarrollador' })).toBe(true);
});

it('sin acceso al CRM redirige a Inicio, aunque el perfil sea admin de Costeo', async () => {
  await expect(sesionCrm()).rejects.toThrow('REDIRECT:/');
  await expect(sesionCrm(false)).rejects.toThrow('No tienes acceso al CRM');
});

it('falla cerrado si la tabla de módulos aún no existe en la base', async () => {
  mocks.modulos.mockResolvedValue({ data: null, error: { code: 'PGRST205', message: 'not found' } });
  await expect(sesionCrm()).rejects.toThrow('REDIRECT:/');
});

it('con acceso devuelve el nivel del CRM', async () => {
  mocks.modulos.mockResolvedValue({ data: [{ modulo: 'crm', nivel: 'desarrollador' }], error: null });
  const s = await sesionCrm();
  expect(s.nivel).toBe('desarrollador');
  expect(s.perfil.nombre).toBe('Carlos');
});
