// tests/comercializadora/exportar-descarga.test.ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { parametrosDescarga, respuestaArchivo, respuestaError } from '@/lib/comercializadora/exportar/descarga';

describe('descarga de reportes', () => {
  it('lee semana y formato; semana inválida cae en la de por omisión y formato inválido en html', () => {
    expect(parametrosDescarga('http://x/d?semana=2026-11-16&formato=pdf', '2026-11-25')).toEqual({ semana: '2026-11-16', formato: 'pdf' });
    expect(parametrosDescarga('http://x/d?semana=hola&formato=exe', '2026-11-25')).toEqual({ semana: '2026-11-16', formato: 'html' });
  });
  it('archivo HTML como descarga con nombre', async () => {
    const r = respuestaArchivo('<p>á</p>', 'reporte-ventas-2026-11-16.html', 'html');
    expect(r.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(r.headers.get('content-disposition')).toBe('attachment; filename="reporte-ventas-2026-11-16.html"');
    expect(await r.text()).toBe('<p>á</p>');
  });
  it('archivo PDF', () => {
    const r = respuestaArchivo(new Uint8Array([37, 80]), 'r.pdf', 'pdf');
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(r.headers.get('cache-control')).toBe('no-store');
  });
  it('error con estado y mensaje claro, sin datos', async () => {
    const r = respuestaError(403, 'No tienes acceso a Comercializadora');
    expect(r.status).toBe(403);
    expect(await r.text()).toBe('No tienes acceso a Comercializadora');
  });
});
