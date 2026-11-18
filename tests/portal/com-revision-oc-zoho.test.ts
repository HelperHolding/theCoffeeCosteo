import { describe, expect, it } from 'vitest';
import { conRevisionOcSync } from '../../lib/comercializadora/indicadores';

const AHORA = Date.parse('2026-11-13T18:00:00Z');
const K = () => ({
  datos: {
    checks: [
      {
        id: 'inv',
        corto: 'inventario',
        titulo: 'Inventario',
        valor: 'hace 0 días',
        est: 'ok',
        detalle: '',
        acc: '',
        lnk: '',
      },
      {
        id: 'oc',
        corto: 'OCs sin poner al día',
        titulo: 'OCs en camino al día con Zoho',
        valor: 'sin poner al día',
        est: 'mal',
        detalle: 'x',
        acc: 'Ver órdenes de compra',
        lnk: '/comercializadora/ordenes',
      },
    ],
    ok: 1,
    total: 2,
  },
});

describe('decisión 12: OCs al día con zoho-sync', () => {
  it('≤ 3 días verde, ≤ 7 ámbar, más viejo o sin corrida rojo; recalcula datos.ok', () => {
    const ok = conRevisionOcSync(K(), '2026-11-12T18:00:00Z', AHORA);
    expect(ok.datos.checks[1]).toMatchObject({ est: 'ok', valor: 'sincronizadas hace 1 día' });
    expect(ok.datos.ok).toBe(2);
    expect(conRevisionOcSync(K(), '2026-11-08T18:00:00Z', AHORA).datos.checks[1].est).toBe('aviso');
    expect(conRevisionOcSync(K(), '2026-11-01T18:00:00Z', AHORA).datos.checks[1].est).toBe('mal');
    const nada = conRevisionOcSync(K(), null, AHORA);
    expect(nada.datos.checks[1]).toMatchObject({ est: 'mal', valor: 'sin sincronizar' });
    expect(nada.datos.ok).toBe(1);
  });
  it('no toca el K original (vive en la caché compartida)', () => {
    const k = K();
    conRevisionOcSync(k, '2026-11-12T18:00:00Z', AHORA);
    expect(k.datos.checks[1].est).toBe('mal');
    expect(k.datos.ok).toBe(1);
  });
  it('sin la revisión oc devuelve K igual', () => {
    const k = { datos: { checks: [], ok: 0, total: 0 } };
    expect(conRevisionOcSync(k, null, AHORA)).toEqual(k);
  });
});
