// tests/comercializadora/compras-descarga-ruta.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const leer = vi.fn();
const pdf = vi.fn();
vi.mock('@/lib/supabase/sesion', () => ({ sesionComercializadora: vi.fn(async () => ({ db: {}, accesos: [] })) }));
vi.mock('@/lib/comercializadora/compras/datos', () => ({ leerDatosCompras: (...a: unknown[]) => leer(...a) }));
vi.mock('@/lib/comercializadora/compras/motor', () => ({ semDelMotor: vi.fn(async () => ({ ok: false, error: 'Motor sin datos' })) }));
vi.mock('@/lib/comercializadora/exportar/pdf', () => ({ htmlAPdf: (...a: unknown[]) => pdf(...a), MENSAJE_FALLA_PDF: 'No se pudo generar el PDF. Baja el HTML.' }));

import { GET } from '@/app/(comercializadora)/comercializadora/compras/descargar/route';
import { SIN_DATOS } from '@/lib/comercializadora/compras/sync';

const conDatos = {
  datos: {
    ocs: [{ zoho_po_id: 'P1', folio: 'COM-OC-1', proveedor: 'Prov A', comprador: 'CC', emision: '2026-11-17', arribo: '2026-11-19', estado: 'open', received_status: 'received', monto_ins: 1000, por_categoria: { CAF: 1000 }, es_registro: false }],
    recepciones: [], lineas: [],
    ventas: [{ semana: '2026-11-16', venta_total_ci: 4000, por_categoria_ci: { CAF: 4000 } }],
  },
  ultimaSync: '2026-11-26T17:00:00Z',
};
const url = (q: string) => new Request(`http://x/comercializadora/compras/descargar?${q}`);

describe('ruta de descarga del tablero de compras', () => {
  beforeEach(() => { leer.mockReset(); pdf.mockReset(); });
  it('HTML con los filtros de la URL, como archivo adjunto con su nombre', async () => {
    leer.mockResolvedValue(conDatos);
    const r = await GET(url('periodo=2026-11-16&categoria=CAF&formato=html'));
    expect(r.status).toBe(200);
    expect(r.headers.get('Content-Type')).toContain('text/html');
    expect(r.headers.get('Content-Disposition')).toBe('attachment; filename="compras-2026-11-16-caf.html"');
    const h = await r.text();
    expect(h).toContain('Filtros: 16 nov – 22 nov 2026 · Café');
    expect(h).toContain('No se pudo calcular el plan de compra: Motor sin datos');
  });
  it('PDF: el mismo HTML impreso; si Chromium falla, 502 con el mensaje fijo', async () => {
    leer.mockResolvedValue(conDatos);
    pdf.mockResolvedValueOnce(new Uint8Array([37, 80, 68, 70]));
    const ok = await GET(url('periodo=2026-11-16&formato=pdf'));
    expect([ok.status, ok.headers.get('Content-Type')]).toEqual([200, 'application/pdf']);
    expect(String(pdf.mock.calls[0][0])).toContain('<!doctype html>');
    pdf.mockRejectedValueOnce(new Error('crash'));
    const mal = await GET(url('periodo=2026-11-16&formato=pdf'));
    expect([mal.status, await mal.text()]).toEqual([502, 'No se pudo generar el PDF. Baja el HTML.']);
  });
  it('sin datos sincronizados: 409 con mensaje claro, sin archivo', async () => {
    leer.mockResolvedValue({ datos: { ocs: [], recepciones: [], ventas: [], lineas: [] }, ultimaSync: null });
    const r = await GET(url('formato=pdf'));
    expect([r.status, await r.text()]).toEqual([409, SIN_DATOS]);
    expect(pdf).not.toHaveBeenCalled();
  });
  it('si la lectura de Supabase falla: 500 con el mensaje de la lectura', async () => {
    leer.mockRejectedValue(new Error('No se pudieron leer los datos de Comercializadora. Intenta de nuevo.'));
    const r = await GET(url('formato=html'));
    expect([r.status, await r.text()]).toEqual([500, 'No se pudieron leer los datos de Comercializadora. Intenta de nuevo.']);
  });
});
