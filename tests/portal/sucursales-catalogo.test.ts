import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { leerCatalogoPos } from '../../lib/sucursales/catalogo-pos';

const db = (data: unknown, error: unknown = null) =>
  ({ from: () => ({ select: async () => ({ data, error }) }) }) as never;

describe('catálogo de nombres del POS (producto_codigo_pos)', () => {
  it('nombre exacto → código; un nombre con dos códigos no entra', async () => {
    const c = await leerCatalogoPos(
      db([
        { codigo: 'BRO13', nombre_observado: 'Brownie' },
        { codigo: 'LAT1', nombre_observado: 'Latte' },
        { codigo: 'LAT2', nombre_observado: 'Latte' },
        { codigo: 'X', nombre_observado: null },
      ]),
    );
    expect(Object.fromEntries(c!)).toEqual({ Brownie: 'BRO13' });
  });

  it('falla cerrado: un error de lectura devuelve null', async () => {
    expect(await leerCatalogoPos(db(null, { message: 'rls' }))).toBeNull();
    expect(
      await leerCatalogoPos({
        from: () => {
          throw new Error('red');
        },
      } as never),
    ).toBeNull();
  });
});
