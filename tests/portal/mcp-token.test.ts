import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  entrar: vi.fn(),
  perfil: vi.fn(),
  rpc: vi.fn(),
  creados: [] as { headers?: Record<string, string> }[],
}));
vi.mock('@supabase/supabase-js', () => ({
  createClient: (_url: string, _key: string, opts: { global?: { headers?: Record<string, string> } }) => {
    m.creados.push({ headers: opts?.global?.headers });
    const q = {
      select: () => q,
      eq: () => q,
      maybeSingle: () => m.perfil(),
    };
    return { auth: { signInWithPassword: m.entrar }, from: () => q, rpc: m.rpc };
  },
}));
import { autenticarGrok, esTokenGrok, olvidarSesionGrok } from '../../lib/mcp/token';

const TOKEN = 'a'.repeat(43);
const ahora = () => Math.floor(Date.now() / 1000);
const sesion = (vence = ahora() + 3600) => ({
  data: { session: { access_token: `jwt-${vence}`, expires_at: vence, user: { id: 'u-grok' } } },
  error: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.creados = [];
  olvidarSesionGrok();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://prueba.supabase.co');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publica');
  vi.stubEnv('MCP_GROK_TOKEN', TOKEN);
  vi.stubEnv('MCP_GROK_EMAIL', 'grok@prueba.mx');
  vi.stubEnv('MCP_GROK_PASSWORD', 'secreta');
  m.entrar.mockResolvedValue(sesion());
  m.perfil.mockResolvedValue({ data: { user_id: 'u-grok', activo: true }, error: null });
  m.rpc.mockResolvedValue({ data: true, error: null });
});

it('esTokenGrok: solo el token exacto, y nunca si falta o es corto', () => {
  expect(esTokenGrok(TOKEN)).toBe(true);
  expect(esTokenGrok(`${TOKEN}x`)).toBe(false);
  expect(esTokenGrok('b'.repeat(43))).toBe(false);
  vi.stubEnv('MCP_GROK_TOKEN', '');
  expect(esTokenGrok('')).toBe(false);
  vi.stubEnv('MCP_GROK_TOKEN', 'corto');
  expect(esTokenGrok('corto')).toBe(false);
});

it('inicia sesión una vez, la reutiliza y consulta con el JWT del usuario de Grok', async () => {
  await autenticarGrok();
  await autenticarGrok();
  expect(m.entrar).toHaveBeenCalledTimes(1);
  expect(m.entrar).toHaveBeenCalledWith({ email: 'grok@prueba.mx', password: 'secreta' });
  const conJwt = m.creados.filter((c) => c.headers?.Authorization?.startsWith('Bearer jwt-'));
  expect(conJwt.length).toBe(2);
});

it('vuelve a iniciar sesión si la sesión está por vencer', async () => {
  m.entrar.mockResolvedValueOnce(sesion(ahora() + 30));
  await autenticarGrok();
  await autenticarGrok();
  expect(m.entrar).toHaveBeenCalledTimes(2);
});

it('sin usuario configurado o con login fallido responde 503', async () => {
  vi.stubEnv('MCP_GROK_PASSWORD', '');
  await expect(autenticarGrok()).rejects.toMatchObject({ estado: 503 });
  vi.stubEnv('MCP_GROK_PASSWORD', 'secreta');
  m.entrar.mockResolvedValueOnce({ data: { session: null }, error: { message: 'Invalid login' } });
  await expect(autenticarGrok()).rejects.toMatchObject({ estado: 503 });
});

it('perfil inactivo responde 403; sin la migración MCP responde 503', async () => {
  m.perfil.mockResolvedValueOnce({ data: { user_id: 'u-grok', activo: false }, error: null });
  await expect(autenticarGrok()).rejects.toMatchObject({ estado: 403 });
  m.rpc.mockResolvedValueOnce({ data: null, error: { message: 'no existe' } });
  await expect(autenticarGrok()).rejects.toMatchObject({ estado: 503 });
});
