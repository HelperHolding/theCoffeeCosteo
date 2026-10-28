import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { leerCatalogoPos } from '../../lib/sucursales/catalogo-pos';

// Sin la RPC de la migración 24 (PGRST202) se lee la tabla bajo RLS, como antes.
const SIN_RPC = { data: null, error: { code: 'PGRST202', message: 'no existe' } };
const db = (data: unknown, error: unknown = null) =>
  ({ rpc: async () => SIN_RPC, from: () => ({ select: async () => ({ data, error }) }) }) as never;
const conRpc = (data: unknown, error: unknown = null) =>
  ({
    rpc: async (f: string, a: unknown) => {
      expect([f, a]).toEqual(['sucursales_catalogo_pos', { p_company: 532 }]);
      return { data, error };
    },
    from: () => {
      throw new Error('no debe leer la tabla');
    },
  }) as never;

describe('catálogo de nombres del POS (producto_codigo_pos)', () => {
  it('nombre exacto → código; un nombre con dos códigos no entra', async () => {
    const c = await leerCatalogoPos(
      db([
        { codigo: 'BRO13', nombre_observado: 'Brownie' },
        { codigo: 'LAT1', nombre_observado: 'Latte' },
        { codigo: 'LAT2', nombre_observado: 'Latte' },
        { codigo: 'X', nombre_observado: null },
      ]),
      532,
    );
    expect(Object.fromEntries(c!)).toEqual({ Brownie: 'BRO13' });
  });

  it('con la migración 24 lee por la RPC de la sucursal (igual con o sin rol de Costeo)', async () => {
    const c = await leerCatalogoPos(conRpc([{ codigo: 'BRO13', nombre_observado: 'Brownie' }]), 532);
    expect(Object.fromEntries(c!)).toEqual({ Brownie: 'BRO13' });
    expect(await leerCatalogoPos(conRpc(null), 532)).toBeNull(); // sin acceso a la sucursal
    expect(await leerCatalogoPos(conRpc(null, { code: '42501', message: 'x' }), 532)).toBeNull();
  });

  it('falla cerrado: un error de lectura devuelve null', async () => {
    expect(await leerCatalogoPos(db(null, { message: 'rls' }), 532)).toBeNull();
    expect(
      await leerCatalogoPos(
        {
          from: () => {
            throw new Error('red');
          },
          rpc: async () => SIN_RPC,
        } as never,
        532,
      ),
    ).toBeNull();
  });
});
