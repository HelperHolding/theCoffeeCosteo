import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  nivel: 'edicion' as string,
  escrito: [] as { tabla: string; op: string; datos: unknown }[],
  error: null as null | { code: string; message: string },
  invocar: vi.fn(async () => ({ ok: true, datos: {} })),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../lib/comercializadora/funciones', () => ({ invocarFuncion: m.invocar }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => {
    const cadena = (tabla: string, op: string, datos: unknown) => {
      const q = {
        eq: () => q,
        select: async () => (m.error ? { data: null, error: m.error } : { data: [{ id: 1 }], error: null }),
        then: (r: (v: unknown) => void) => r(m.error ? { error: m.error } : { error: null }),
      };
      m.escrito.push({ tabla, op, datos });
      return q;
    };
    return {
      perfil: { user_id: 'u1', nombre: 'Ana', rol: 'interno' },
      accesos: { comercializadora: m.nivel },
      nivel: m.nivel,
      db: {
        from: (tabla: string) => ({
          insert: (d: unknown) => cadena(tabla, 'insert', d),
          update: (d: unknown) => cadena(tabla, 'update', d),
          delete: () => cadena(tabla, 'delete', null),
        }),
      },
    };
  },
}));
import {
  cancelarCierre,
  correrOcAuto,
  guardarCierre,
} from '../../app/(comercializadora)/comercializadora/acciones';

const form = {
  vendor_id: 'v1',
  vendor_name: 'Prov',
  ini: '2099-12-20',
  fin: '2099-12-30',
  motivo: 'vacaciones',
  todo: true,
  skus: [],
  notas: '',
};

describe('acciones de cierres', () => {
  beforeEach(() => {
    m.nivel = 'edicion';
    m.escrito = [];
    m.error = null;
    m.invocar.mockClear();
  });
  it('lectura no escribe ni recalcula', async () => {
    m.nivel = 'lectura';
    expect(await guardarCierre(form)).toEqual({ error: 'Tu acceso a Comercializadora es de solo lectura.' });
    expect(await cancelarCierre(1)).toEqual({ error: 'Tu acceso a Comercializadora es de solo lectura.' });
    expect(m.escrito).toEqual([]);
    expect(m.invocar).not.toHaveBeenCalled();
  });
  it('valida antes de escribir', async () => {
    expect(await guardarCierre({ ...form, fin: '2099-12-01' })).toEqual({
      error: 'La fecha final no puede ser antes de la inicial',
    });
    expect(m.escrito).toEqual([]);
  });
  it('alta: todo el proveedor guarda skus null, con autor, y recalcula com-minmax', async () => {
    expect(await guardarCierre(form)).toEqual({ ok: true, recalculo: true });
    expect(m.escrito[0]).toMatchObject({
      tabla: 'com_proveedor_cierre',
      op: 'insert',
      datos: { vendor_id: 'v1', skus: null, creado_por: 'Ana', motivo: 'vacaciones' },
    });
    expect(m.invocar).toHaveBeenCalledWith('com-minmax', {});
  });
  it('cambio de fechas o alcance reinicia los avisos', async () => {
    await guardarCierre({ ...form, id: 7 });
    expect(m.escrito[0]).toMatchObject({ op: 'update', datos: { aviso7_at: null, aviso0_at: null } });
  });
  it('si el recálculo falla, lo guardado queda y se avisa', async () => {
    m.invocar.mockResolvedValueOnce({ ok: false, error: 'Zoho caído' } as never);
    expect(await cancelarCierre(3)).toEqual({ ok: true, recalculo: false });
    expect(m.escrito[0]).toMatchObject({ op: 'update', datos: { cancelado: true } });
  });
});

describe('correr OC automática', () => {
  beforeEach(() => {
    m.nivel = 'edicion';
    m.invocar.mockReset();
  });
  it('lectura no corre', async () => {
    m.nivel = 'lectura';
    expect(await correrOcAuto('simulacion')).toEqual({
      error: 'Tu acceso a Comercializadora es de solo lectura.',
    });
    expect(m.invocar).not.toHaveBeenCalled();
  });
  it('simulación llama zoho-generar-oc manual y regresa el resumen', async () => {
    m.invocar.mockResolvedValueOnce({ ok: true, datos: { ok: true, ocs: 5, modo: 'simulacion' } } as never);
    expect(await correrOcAuto('simulacion')).toEqual({ ok: true, ocs: 5, modo: 'simulacion' });
    expect(m.invocar).toHaveBeenCalledWith('zoho-generar-oc', { origen: 'manual', modo: 'simulacion' });
  });
  it('el error de la función llega tal cual', async () => {
    m.invocar.mockResolvedValueOnce({
      ok: false,
      error: 'Las OCs automáticas están en modo simulación',
    } as never);
    expect(await correrOcAuto('real')).toEqual({ error: 'Las OCs automáticas están en modo simulación' });
  });
});
