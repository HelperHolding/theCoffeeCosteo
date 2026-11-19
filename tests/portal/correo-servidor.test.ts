import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { enviarCorreoInterno } from '../../lib/comercializadora/correoServidor';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('envío de correo desde el portal', () => {
  it('sin CORREO_URL o CORREO_LLAVE no envía y dice "correo no configurado"', async () => {
    vi.stubEnv('CORREO_URL', '');
    vi.stubEnv('CORREO_LLAVE', 'x');
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await enviarCorreoInterno(['a@b.mx'], 'Asunto', '<p>x</p>')).toBe('no-configurado');
    expect(f).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining('correo no configurado'));
  });

  it('envía uno por destinatario con el cuerpo de send-email, aunque COM_EFECTOS_EXTERNOS esté apagado', async () => {
    vi.stubEnv('CORREO_URL', 'https://correo.example/functions/v1/send-email');
    vi.stubEnv('CORREO_LLAVE', 'llave-secreta');
    vi.stubEnv('COM_EFECTOS_EXTERNOS', '');
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response('{}'));
    vi.stubGlobal('fetch', f);
    expect(await enviarCorreoInterno(['a@b.mx', 'c@d.mx'], 'Asunto', '<p>x</p>')).toBe('enviado');
    expect(f).toHaveBeenCalledTimes(2);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe('https://correo.example/functions/v1/send-email');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer llave-secreta');
    expect(JSON.parse(String(init?.body))).toEqual({
      area: 'comercializadora',
      to: 'a@b.mx',
      subject: 'Asunto',
      body_html: '<p>x</p>',
      apertura_id: null,
      enviado_por: 'OV sugerida (piloto)',
    });
  });

  it('un envío fallido devuelve "fallo", sigue con los demás y no imprime la llave', async () => {
    vi.stubEnv('CORREO_URL', 'https://correo.example/send');
    vi.stubEnv('CORREO_LLAVE', 'llave-secreta');
    const f = vi
      .fn(async (_u: string, _i?: RequestInit) => new Response('{}'))
      .mockResolvedValueOnce(new Response('mal', { status: 500 }));
    vi.stubGlobal('fetch', f);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await enviarCorreoInterno(['a@b.mx', 'c@d.mx'], 'Asunto', '<p>x</p>')).toBe('fallo');
    expect(f).toHaveBeenCalledTimes(2);
    expect(err).toHaveBeenCalled();
    expect(JSON.stringify(err.mock.calls)).not.toContain('llave-secreta');
  });
});
