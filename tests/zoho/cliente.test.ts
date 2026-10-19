import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClienteZoho } from '../../scripts/zoho/cliente';

const env = new Map([
  ['ZOHO_CLIENT_ID', 'id'],
  ['ZOHO_CLIENT_SECRET', 'secreto'],
  ['ZOHO_REFRESH_TOKEN', 'refresh'],
  ['ZOHO_API_DOMAIN', 'https://zoho.invalid'],
]);

describe('ClienteZoho es de solo lectura', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('bloquea antes de salir a la red cualquier ruta que no sea lectura', async () => {
    const red = vi.fn();
    vi.stubGlobal('fetch', red);
    const z = new ClienteZoho(env) as unknown as {
      pedir: (m: string, r: string, c?: unknown) => Promise<unknown>;
      coql: (q: string) => Promise<unknown>;
      get: (r: string) => Promise<unknown>;
    };
    await expect(z.pedir('POST', '/crm/v8/Leads', { data: [] })).rejects.toThrow('Bloqueado');
    await expect(z.pedir('PUT', '/crm/v8/Leads')).rejects.toThrow('Bloqueado');
    await expect(z.pedir('DELETE', '/crm/v8/Leads?ids=1')).rejects.toThrow('Bloqueado');
    await expect(z.get('/oauth/v2/token')).rejects.toThrow('Bloqueado');
    await expect(z.coql('delete from Leads')).rejects.toThrow('COQL solo admite SELECT');
    expect(red).not.toHaveBeenCalled();
  });

  it('exige las variables del Self Client', () => {
    expect(() => new ClienteZoho(new Map())).toThrow('Falta ZOHO_CLIENT_ID');
  });
});
