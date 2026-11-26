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
  orden: [] as string[],
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
      estado.orden.push('upsert');
      return { error: null };
    },
  }),
  rpc: async (fn: string, args: Record<string, unknown>) => {
    estado.rpc.push({ fn, args });
    estado.orden.push('rpc');
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

// Zoho simulado: lista de proveedores y facturas según la acción pedida.
const zoho = () =>
  estado.invocar.mockImplementation(async (_db: unknown, accion: string) =>
    accion === 'proveedores'
      ? { ok: true, datos: { proveedores: [{ id: 'v-mp', nombre: 'MATERIAS PRIMAS EL REFUGIO' }] } }
      : { ok: true, datos: { facturas: FACTURAS } },
  );

beforeEach(() => {
  estado.acceso = { ok: true, puedeAplicar: true };
  estado.rpc = [];
  estado.rpcError = null;
  estado.upserts = [];
  estado.orden = [];
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
    zoho();
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

  it('un proveedor que no está en Zoho se rechaza sin tocar nada', async () => {
    zoho();
    expect(await asignarProveedor(5, { id: 'v-falso', nombre: 'X' })).toEqual({
      error: 'Ese proveedor no está en Zoho.',
    });
    expect(estado.upserts).toEqual([]);
    expect(estado.rpc).toEqual([]);
  });

  it('usa el nombre de Zoho aunque el navegador mande otro', async () => {
    zoho();
    expect(await asignarProveedor(5, { id: 'v-mp', nombre: 'NOMBRE FALSO' })).toEqual({ ok: true });
    expect(estado.upserts).toEqual([
      {
        clabe: '030320900000001111',
        proveedor_zoho_id: 'v-mp',
        proveedor_nombre: 'MATERIAS PRIMAS EL REFUGIO',
      },
    ]);
    expect(estado.rpc[0].args).toMatchObject({ p_proveedor_nombre: 'MATERIAS PRIMAS EL REFUGIO' });
  });

  it('la equivalencia se guarda después de la RPC y no si la RPC falla', async () => {
    zoho();
    await asignarProveedor(5, { id: 'v-mp', nombre: 'MP' });
    expect(estado.orden).toEqual(['rpc', 'upsert']);
    estado.orden = [];
    estado.upserts = [];
    estado.rpcError = { message: 'boom' };
    expect(await asignarProveedor(5, { id: 'v-mp', nombre: 'MP' })).toEqual({
      error: 'No se pudo guardar. Intenta de nuevo.',
    });
    expect(estado.upserts).toEqual([]);
  });

  it('un id inválido se rechaza sin llamar a la función', async () => {
    expect(await aplicarTransferencia(0)).toEqual({ error: 'Datos inválidos.' });
    expect(await aplicarTransferencia(1.5)).toEqual({ error: 'Datos inválidos.' });
    expect(await asignarProveedor(-1, { id: 'v-mp', nombre: 'MP' })).toEqual({ error: 'Datos inválidos.' });
    expect(await asignarProveedor(5, { id: '', nombre: 'MP' })).toEqual({ error: 'Datos inválidos.' });
    expect(await guardarAsignaciones(NaN, [])).toEqual({ error: 'Datos inválidos.' });
    expect(await guardarAsignaciones(5, null as never)).toEqual({ error: 'Datos inválidos.' });
    expect(estado.invocar).not.toHaveBeenCalled();
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
