// Correcciones de la revisión final del plan 3f (I1 e I2).
import { describe, expect, it } from 'vitest';
import { semanasValidas } from '../../lib/comercializadora/planAbastos';
import { ocLocal, MAX_LINEAS_OC } from '../../lib/comercializadora/crearOc';

describe('revisión 3f (I1): ?sem= solo acepta las opciones del selector', () => {
  it('1.5, 7, texto o vacío caen al horizonte por omisión; 4/8/12 pasan', () => {
    const c = { W: 12 };
    expect(semanasValidas(c, '8')).toBe(8);
    expect(semanasValidas(c, '4')).toBe(4);
    expect(semanasValidas(c, '1.5')).toBe(12);
    expect(semanasValidas(c, '7')).toBe(12);
    expect(semanasValidas(c, 'abc')).toBe(12);
    expect(semanasValidas(c, undefined)).toBe(12);
    expect(semanasValidas({ W: 6 }, '6')).toBe(6);
    expect(semanasValidas({ W: 6 }, '8')).toBe(6);
  });
});

describe('revisión 3f (I2): Crear OC con más artículos de los que caben no se recorta en silencio', () => {
  const fila = (i: number) => ({
    sku: `S-${i}`,
    costo: 10,
    s: { lt: 3 },
    calc: { fuente: 'local', pedirEsta: 2, pedirHoy: 0 },
  });
  const plan = (n: number) =>
    ({
      hoyIso: '2026-11-14',
      soloCafe: false,
      cfg: { compra: {} },
      provs: [
        { key: 'k', real: true, nombre: 'Distribuidora', rows: Array.from({ length: n }, (_, i) => fila(i)) },
      ],
    }) as never;

  it(`hasta ${MAX_LINEAS_OC} artículos arma la OC; con uno más avisa y no la arma`, () => {
    const ok = ocLocal(plan(MAX_LINEAS_OC), 'k');
    expect('error' in ok).toBe(false);
    const mucho = ocLocal(plan(MAX_LINEAS_OC + 1), 'k');
    expect(mucho).toEqual({
      error: `Son ${MAX_LINEAS_OC + 1} artículos y una OC prellenada lleva hasta ${MAX_LINEAS_OC}: créala desde Órdenes de compra.`,
    });
  });
});
