import { beforeEach, describe, expect, it, vi } from 'vitest';
import { correoDeAcceso } from '../../lib/portal/acceso';

describe('correoDeAcceso', () => {
  it('deja los correos tal cual (sin espacios alrededor)', () => {
    expect(correoDeAcceso('  ana@ejemplo.mx ')).toBe('ana@ejemplo.mx');
  });
  it('convierte un usuario del sitio viejo en su cuenta de Auth, en minúsculas', () => {
    expect(correoDeAcceso('  Ana.Lopez ')).toBe('ana.lopez@thecoffee.internal');
    expect(correoDeAcceso('prov_01-gdl')).toBe('prov_01-gdl@thecoffee.internal');
  });
  it('rechaza vacíos y usuarios con caracteres inválidos', () => {
    expect(correoDeAcceso('   ')).toBeNull();
    expect(correoDeAcceso('ana lopez')).toBeNull();
    expect(correoDeAcceso('ana/lopez')).toBeNull();
  });
});

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock('@/lib/supabase/servidor', () => ({
  servidor: async () => ({ auth: { signInWithPassword: mocks.signIn } }),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
import { entrar } from '../../app/(auth)/login/actions';

const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

describe('entrar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signIn.mockResolvedValue({ data: {}, error: null });
  });

  it('entra con el usuario del sitio viejo', async () => {
    await expect(entrar('', formulario({ email: 'Ana.Lopez', password: 'secreta' }))).rejects.toThrow(
      'REDIRECT:/',
    );
    expect(mocks.signIn).toHaveBeenCalledWith({ email: 'ana.lopez@thecoffee.internal', password: 'secreta' });
  });

  it('no llama a Auth si el usuario es inválido', async () => {
    expect(await entrar('', formulario({ email: 'ana lopez', password: 'secreta' }))).toBe(
      'Escribe tu correo o usuario y tu contraseña.',
    );
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it('el error de credenciales menciona correo o usuario', async () => {
    mocks.signIn.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    expect(await entrar('', formulario({ email: 'ana', password: 'mala' }))).toBe(
      'No pudimos iniciar sesión. Revisa tu correo o usuario y tu contraseña.',
    );
  });
});
