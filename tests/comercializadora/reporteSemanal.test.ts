// tests/comercializadora/reporteSemanal.test.ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { leerReporteSemanal, semanaDeUrl, semanaPorDefecto } from '@/lib/comercializadora/reporteSemanal';

describe('reporte semanal en el portal', () => {
  it('por defecto muestra la semana cerrada anterior', () => {
    expect(semanaPorDefecto('2026-11-25')).toBe('2026-11-16');
    expect(semanaPorDefecto('2026-11-23')).toBe('2026-11-16');
  });
  it('una semana inválida en la URL cae en la de por defecto', () => {
    expect(semanaDeUrl('2026-11-09', '2026-11-25')).toBe('2026-11-09');
    expect(semanaDeUrl('hola', '2026-11-25')).toBe('2026-11-16');
    expect(semanaDeUrl('2026-11-18', '2026-11-25')).toBe('2026-11-16');
  });
  it('invoca la función con la semana y forzar', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true, reporte: { lunes: '2026-11-16' }, cache: false, aviso: null })));
    const r = await leerReporteSemanal('2026-11-16', true, { fetch, url: 'http://f', secreto: 's' });
    expect(r).toEqual({ ok: true, reporte: { lunes: '2026-11-16' }, cache: false, aviso: null });
    expect(JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ semana: '2026-11-16', forzar: true });
  });
  it('propaga el error de la función', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'Zoho no respondió' }), { status: 500 }));
    expect(await leerReporteSemanal('2026-11-16', false, { fetch, url: 'http://f', secreto: 's' })).toEqual({ ok: false, error: 'Zoho no respondió' });
  });
});
