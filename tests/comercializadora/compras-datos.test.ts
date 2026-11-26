// tests/comercializadora/compras-datos.test.ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { leerDatosCompras, lineasAbiertas } from '@/lib/comercializadora/compras/datos';

// Cliente falso: cada tabla devuelve sus filas en páginas de 1000, como PostgREST.
function dbFalsa(tablas: Record<string, unknown[]>, log: unknown[] = []) {
  return {
    from(t: string) {
      const q = {
        _t: t,
        select: () => q, order: () => q, eq: () => q, not: () => q, limit: () => Promise.resolve({ data: log, error: null }),
        range: (a: number, b: number) => Promise.resolve({ data: (tablas[t] ?? []).slice(a, b + 1), error: null }),
      };
      return q;
    },
  };
}

describe('lectura de compras', () => {
  it('lineasAbiertas: pendiente = pedido − recibido (no negativo) y el nombre del catálogo', () => {
    expect(lineasAbiertas(
      [{ zoho_po_id: 'P1', sku: 'INS-CAF-1', cantidad: 10, cantidad_recibida: 4 }, { zoho_po_id: 'P1', sku: 'X', cantidad: 1, cantidad_recibida: 3 }],
      new Map([['INS-CAF-1', 'Café de grano']]),
    )).toEqual([
      { zoho_po_id: 'P1', sku: 'INS-CAF-1', nombre: 'Café de grano', pendiente: 6 },
      { zoho_po_id: 'P1', sku: 'X', nombre: 'X', pendiente: 0 },
    ]);
  });
  it('lee más de 1000 recepciones y la última sincronización buena', async () => {
    const recs = Array.from({ length: 1500 }, (_, i) => ({ zoho_po_id: `P${i}`, fecha: '2026-11-17', monto: '10', por_categoria: {} }));
    const r = await leerDatosCompras(dbFalsa({ com_compras_recepcion: recs }, [{ fin: '2026-11-26T10:00:00Z' }]));
    expect(r.datos.recepciones).toHaveLength(1500);
    expect(r.datos.recepciones[0].monto).toBe(10);
    expect(r.ultimaSync).toBe('2026-11-26T10:00:00Z');
  });
});
