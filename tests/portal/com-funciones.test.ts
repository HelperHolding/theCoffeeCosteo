import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { invocarFuncion } from '../../lib/comercializadora/funciones';

const resp = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('invocarFuncion', () => {
  it('manda x-com-secreto, sin Authorization, al URL de funciones', async () => {
    const f = vi.fn((_u: string, _i?: RequestInit) => resp(200, { ok: true, skus: 3 }));
    const r = await invocarFuncion(
      'com-minmax',
      {},
      { fetch: f as never, url: 'https://x.supabase.co/functions/v1', secreto: 's3' },
    );
    expect(r).toEqual({ ok: true, datos: { ok: true, skus: 3 } });
    const [u, init] = f.mock.calls[0];
    expect(u).toBe('https://x.supabase.co/functions/v1/com-minmax');
    expect((init!.headers as Record<string, string>)['x-com-secreto']).toBe('s3');
    expect((init!.headers as Record<string, string>).Authorization).toBeUndefined();
  });
  it('sin secreto configurado no llama y lo dice claro', async () => {
    const f = vi.fn();
    const r = await invocarFuncion('com-minmax', {}, { fetch: f as never, url: 'https://x', secreto: '' });
    expect(f).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: false, error: expect.stringMatching(/no está configurado/) });
  });
  it('401, error de la función y red caída dan mensajes sin datos internos', async () => {
    const r401 = await invocarFuncion(
      'com-minmax',
      {},
      { fetch: (() => resp(401, { ok: false })) as never, url: 'u', secreto: 's' },
    );
    expect(r401).toEqual({ ok: false, error: expect.stringMatching(/secreto/) });
    const r500 = await invocarFuncion(
      'com-minmax',
      {},
      { fetch: (() => resp(500, { ok: false, error: 'Zoho caído' })) as never, url: 'u', secreto: 's' },
    );
    expect(r500).toEqual({ ok: false, error: 'Zoho caído' });
    const red = await invocarFuncion(
      'com-minmax',
      {},
      { fetch: (() => Promise.reject(new Error('ECONNRESET'))) as never, url: 'u', secreto: 's' },
    );
    expect(red).toEqual({ ok: false, error: expect.stringMatching(/No se pudo contactar/) });
  });
});
