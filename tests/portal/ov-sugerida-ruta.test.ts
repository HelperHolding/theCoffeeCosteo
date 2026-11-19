import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
const m = vi.hoisted(() => ({ correrOvs: vi.fn(), cliente: vi.fn() }));
vi.mock('@/lib/comercializadora/ovSugeridaServidor', () => ({
  correrOvs: m.correrOvs,
  depsReales: () => ({}),
}));
vi.mock('@/lib/sucursales/corte-servidor', () => ({ clienteServicio: m.cliente }));
import { GET } from '@/app/api/comercializadora/ov-sugerida/route';
import { autorizadoCron } from '@/lib/cron';

const pedir = (auth?: string) =>
  new Request('https://portal.example/api/comercializadora/ov-sugerida', {
    headers: auth ? { authorization: auth } : {},
  });

beforeEach(() => {
  vi.stubEnv('CRON_SECRET', 'secreto-cron');
  m.cliente.mockReturnValue({});
  m.correrOvs.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('autorización de cron', () => {
  it('solo con Bearer CRON_SECRET; sin CRON_SECRET configurado, nunca', () => {
    expect(autorizadoCron(pedir('Bearer secreto-cron'))).toBe(true);
    expect(autorizadoCron(pedir('Bearer otro'))).toBe(false);
    expect(autorizadoCron(pedir())).toBe(false);
    vi.stubEnv('CRON_SECRET', '');
    expect(autorizadoCron(pedir('Bearer '))).toBe(false);
  });
});

describe('GET /api/comercializadora/ov-sugerida', () => {
  it('401 sin el secreto del cron, sin correr nada', async () => {
    const r = await GET(pedir('Bearer otro'));
    expect(r.status).toBe(401);
    expect(m.correrOvs).not.toHaveBeenCalled();
  });

  it('503 sin la llave de servicio', async () => {
    m.cliente.mockReturnValue(null);
    expect((await GET(pedir('Bearer secreto-cron'))).status).toBe(503);
  });

  it('200 con el resumen de la corrida', async () => {
    m.correrOvs.mockResolvedValue({
      semana: '2026-11-16',
      hoy: '2026-11-16',
      tiendas: [],
      correo: 'enviado',
    });
    const r = await GET(pedir('Bearer secreto-cron'));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ semana: '2026-11-16', correo: 'enviado' });
  });

  it('500 sin detalles si la corrida lanza', async () => {
    m.correrOvs.mockRejectedValue(new Error('detalle interno con llave'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = await GET(pedir('Bearer secreto-cron'));
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain('llave');
  });

  it('el cron de Vercel la llama los lunes a las 12:00 UTC (06:00 CDMX)', () => {
    const v = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
      crons: { path: string; schedule: string }[];
    };
    expect(v.crons).toContainEqual({ path: '/api/comercializadora/ov-sugerida', schedule: '0 12 * * 1' });
  });
});
