import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const estado = vi.hoisted(() => ({
  acceso: { ok: true, puedeAplicar: true } as Record<string, unknown>,
  fila: {
    id: 5,
    clabe: '030320900000001111',
    monto: 400,
    estado: 'desconocido',
    proveedor_zoho_id: null,
    proveedor_nombre: null,
    sugerido: false,
  } as Record<string, unknown>,
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  rpcError: null as unknown,
  upserts: [] as unknown[],
  invocar: vi.fn(),
}));

const db = {
  from: (tabla: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: tabla === 'suc_pago_transferencia' ? estado.fila : null,
          error: null,
        }),
      }),
    }),
    upsert: async (v: unknown) => {
      estado.upserts.push(v);
      return { error: null };
    },
  }),
  rpc: async (fn: string, args: Record<string, unknown>) => {
    estado.rpc.push({ fn, args });
    return { error: estado.rpcError };
  },
};
vi.mock('@/lib/supabase/sesion', () => ({ accesoPagos: async () => ({ ...estado.acceso, db }) }));
vi.mock('@/lib/sucursales-propias/funcion', () => ({
  invocarPagos: (...a: unknown[]) => estado.invocar(...a),
}));

import {
  aplicarTransferencia,
  asignarProveedor,
  guardarAsignaciones,
} from '../../app/(sucursales)/sucursales/propias/pagos/acciones';
import { contar } from '../../lib/sucursales-propias/estados';

const FACTURAS = [
  {
    billId: 'b1',
    vendorId: 'v-mp',
    numero: 'A1',
    fecha: '2026-11-06',
    vencimiento: '',
    saldo: 300,
    ubicacion: 'DARIO',
    notas: '',
  },
  {
    billId: 'b2',
    vendorId: 'v-mp',
    numero: 'A2',
    fecha: '2026-11-08',
    vencimiento: '',
    saldo: 500,
    ubicacion: 'NAMORA',
    notas: '',
  },
];

beforeEach(() => {
  estado.acceso = { ok: true, puedeAplicar: true };
  estado.rpc = [];
  estado.rpcError = null;
  estado.upserts = [];
  estado.invocar.mockReset();
  estado.fila = { ...estado.fila, estado: 'desconocido', proveedor_zoho_id: null };
});

describe('acciones de Pagos', () => {
  it('solo lectura no aplica ni cambia nada', async () => {
    estado.acceso = { ok: true, puedeAplicar: false };
    expect(await aplicarTransferencia(5)).toEqual({ error: 'Tu acceso a Pagos es de solo lectura.' });
    expect(await asignarProveedor(5, { id: 'v-mp', nombre: 'MP' })).toEqual({
      error: 'Tu acceso a Pagos es de solo lectura.',
    });
    expect(estado.invocar).not.toHaveBeenCalled();
  });

  it('aplicar pasa el id a la función y devuelve su estado', async () => {
    estado.invocar.mockResolvedValue({ ok: true, datos: { ok: true, estado: 'aplicada', pagoId: 'p1' } });
    expect(await aplicarTransferencia(5)).toEqual({ ok: true, estado: 'aplicada', mensaje: undefined });
    expect(estado.invocar).toHaveBeenCalledWith(db, 'aplicar', { id: 5 });
  });

  it('asignar proveedor guarda la equivalencia y recalcula con sus facturas', async () => {
    estado.invocar.mockResolvedValue({ ok: true, datos: { facturas: FACTURAS } });
    expect(await asignarProveedor(5, { id: 'v-mp', nombre: 'MATERIAS PRIMAS EL REFUGIO' })).toEqual({
      ok: true,
    });
    expect(estado.upserts).toEqual([
      {
        clabe: '030320900000001111',
        proveedor_zoho_id: 'v-mp',
        proveedor_nombre: 'MATERIAS PRIMAS EL REFUGIO',
      },
    ]);
    expect(estado.rpc[0].fn).toBe('suc_pagos_reemplazar_asignaciones');
    expect(estado.rpc[0].args).toMatchObject({ p_id: 5, p_estado: 'no_cuadra', p_proveedor_id: 'v-mp' });
    expect(
      (estado.rpc[0].args.p_asig as { bill_id: string; monto: number }[]).map((a) => [a.bill_id, a.monto]),
    ).toEqual([
      ['b1', 300],
      ['b2', 100],
    ]);
  });

  it('una transferencia ya aplicada no se puede cambiar', async () => {
    estado.fila = { ...estado.fila, estado: 'aplicada' };
    expect(await asignarProveedor(5, { id: 'v-mp', nombre: 'MP' })).toEqual({
      error: 'Esta transferencia ya se aplicó.',
    });
  });

  it('guardar asignaciones valida contra las facturas vivas y marca cuadra', async () => {
    estado.fila = { ...estado.fila, estado: 'no_cuadra', proveedor_zoho_id: 'v-mp', proveedor_nombre: 'MP' };
    estado.invocar.mockResolvedValue({ ok: true, datos: { facturas: FACTURAS } });
    expect(await guardarAsignaciones(5, [{ billId: 'b1', monto: 300 }])).toEqual({
      error: 'Lo asignado ($300.00) no es igual a la transferencia ($400.00).',
    });
    expect(
      await guardarAsignaciones(5, [
        { billId: 'b1', monto: 200 },
        { billId: 'b2', monto: 200 },
      ]),
    ).toEqual({ ok: true });
    expect(estado.rpc.at(-1)!.args).toMatchObject({ p_estado: 'cuadra' });
  });

  it('el rechazo de la base por lo asignado se traduce sin detalles', async () => {
    estado.fila = { ...estado.fila, estado: 'no_cuadra', proveedor_zoho_id: 'v-mp', proveedor_nombre: 'MP' };
    estado.invocar.mockResolvedValue({ ok: true, datos: { facturas: FACTURAS } });
    estado.rpcError = { message: 'Lo asignado no es igual a la transferencia. clabe 030320900000001111' };
    const r = await guardarAsignaciones(5, [
      { billId: 'b1', monto: 200 },
      { billId: 'b2', monto: 200 },
    ]);
    expect(r).toEqual({ error: 'Lo asignado no es igual a la transferencia.' });
    expect(JSON.stringify(r)).not.toContain('0303');
  });
});

describe('contar', () => {
  it('cuenta aplicadas, listas y por revisar', () => {
    expect(
      contar([
        'cuadra',
        'cuadra',
        'aplicada',
        'ya_aplicada',
        'aplicada_sin_adjunto',
        'no_cuadra',
        'error',
        'sin_facturas',
      ]),
    ).toEqual({ total: 8, aplicadas: 3, listas: 2, revisar: 3 });
  });
});
