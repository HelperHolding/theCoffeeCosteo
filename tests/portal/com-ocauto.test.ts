import { describe, expect, it } from 'vitest';
import { corridasOcAuto } from '../../lib/comercializadora/ocauto';

const fila = (o: Record<string, unknown>) => ({
  id: 1,
  corrida_id: 'c1',
  creada_at: '2026-11-12T13:05:00Z',
  fecha: '2026-11-12',
  origen: 'cron',
  modo: 'real',
  vendor_id: 'v1',
  vendor_name: 'Prov',
  zoho_po_id: null,
  po_number: null,
  lineas: [],
  monto: 100,
  estado: 'creada',
  error: null,
  ...o,
});

describe('corridasOcAuto (renderComAuto)', () => {
  it('agrupa por corrida, la más reciente primero, con totales', () => {
    const r = corridasOcAuto([
      fila({ id: 1, corrida_id: 'c1', monto: 100 }),
      fila({ id: 2, corrida_id: 'c1', monto: 50, estado: 'error', error: 'Zoho' }),
      fila({
        id: 3,
        corrida_id: 'c2',
        creada_at: '2026-11-13T13:05:00Z',
        modo: 'simulacion',
        estado: 'simulada',
      }),
    ] as never);
    expect(r.map((c) => [c.corrida_id, c.ocs.length, c.monto, c.errores])).toEqual([
      ['c2', 1, 100, 0],
      ['c1', 2, 150, 1],
    ]);
    expect(r[1]).toMatchObject({ fecha: '2026-11-12', origen: 'cron', modo: 'real' });
  });
});
