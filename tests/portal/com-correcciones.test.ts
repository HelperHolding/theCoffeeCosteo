// Correcciones de la revisión final del plan 3 (hallazgos C1 e I2–I11).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({
  db: null as unknown,
  invocar: vi.fn(
    async (..._a: unknown[]) => ({ ok: true, datos: {} }) as { ok: boolean; datos?: unknown; error?: string },
  ),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../lib/comercializadora/funciones', () => ({ invocarFuncion: m.invocar }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({
    perfil: { user_id: 'u1', nombre: 'Ana', rol: 'interno' },
    accesos: { comercializadora: 'edicion' },
    nivel: 'edicion',
    db: m.db,
  }),
}));
import { guardarCierre, guardarOc, recibirOc } from '../../app/(comercializadora)/comercializadora/acciones';
import { cierresVigentes } from '../../lib/comercializadora/consultas';
import { alcanceCambio, fechasCambiaron } from '../../lib/comercializadora/cierres';
import { textoDestino } from '../../lib/comercializadora/ordenes';
import { kpisPagos } from '../../lib/comercializadora/pagos';

const compra = (o: Record<string, unknown>) => ({
  tipo: 'compra',
  folio: 'OC-1',
  sku: 'A',
  cantidad: 50,
  cantidad_recibida: 0,
  estado: 'emitida',
  fecha: '2026-11-01',
  fecha_arribo: '2026-11-20',
  destino: 'CEDIS',
  monto: null,
  proveedor: 'Prov',
  motivo: null,
  por: null,
  ...o,
});
const formOc = (o: Record<string, unknown> = {}) => ({
  folio: 'OC-1',
  proveedor: 'Prov',
  fecha: '2026-11-01',
  fecha_arribo: '2026-11-25',
  destino: 'CEDIS',
  monto: 500,
  lineas: [{ sku: 'A', cantidad: 50 }],
  ...o,
});

describe('C1 · editar una OC conserva lo recibido y las columnas de cada línea', () => {
  it('cambiar solo la fecha de arribo deja la OC recibida con su motivo', async () => {
    const f = dbFalsa({
      com_movimientos: [
        compra({
          id: 'v1',
          cantidad_recibida: 50,
          estado: 'recibida',
          motivo: 'Al pedir (sugerido)',
          por: 'Luis',
          monto: 500,
        }),
      ],
    });
    m.db = f.db;
    expect(await guardarOc(formOc(), 'OC-1')).toEqual({ ok: true });
    const filas = f.tablas.com_movimientos;
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      sku: 'A',
      cantidad_recibida: 50,
      estado: 'recibida',
      motivo: 'Al pedir (sugerido)',
      por: 'Luis',
      fecha_arribo: '2026-11-25',
    });
    expect(filas[0].id).not.toBe('v1');
  });
  it('si la cantidad baja, lo recibido se acota a la nueva cantidad', async () => {
    const f = dbFalsa({ com_movimientos: [compra({ id: 'v1', cantidad_recibida: 40, estado: 'parcial' })] });
    m.db = f.db;
    await guardarOc(formOc({ lineas: [{ sku: 'A', cantidad: 30 }] }), 'OC-1');
    expect(f.tablas.com_movimientos[0]).toMatchObject({
      cantidad: 30,
      cantidad_recibida: 30,
      estado: 'recibida',
    });
  });
});

describe('I2 · folio repetido', () => {
  it('una OC nueva con un folio que ya existe se rechaza', async () => {
    const f = dbFalsa({ com_movimientos: [compra({ id: 'v1' })] });
    m.db = f.db;
    expect(await guardarOc(formOc())).toEqual({ error: 'Ya existe una OC con el folio OC-1' });
    expect(f.tablas.com_movimientos).toHaveLength(1);
  });
  it('renombrar una OC a un folio que ya existe se rechaza', async () => {
    const f = dbFalsa({ com_movimientos: [compra({ id: 'v1' }), compra({ id: 'v2', folio: 'OC-2' })] });
    m.db = f.db;
    expect(await guardarOc(formOc({ folio: 'OC-2' }), 'OC-1')).toEqual({
      error: 'Ya existe una OC con el folio OC-2',
    });
  });
});

describe('I3 · si borrar las líneas anteriores falla, se deshace el alta', () => {
  it('no quedan líneas duplicadas y se informa el error', async () => {
    const f = dbFalsa({ com_movimientos: [compra({ id: 'v1' })] }, [
      { tabla: 'com_movimientos', op: 'delete', veces: 1 },
    ]);
    m.db = f.db;
    expect(await guardarOc(formOc(), 'OC-1')).toEqual({ error: 'No se pudo guardar. Intenta de nuevo.' });
    expect(f.tablas.com_movimientos.map((x) => x.id)).toEqual(['v1']);
  });
});

describe('I11 · recepción contra lo pedido', () => {
  it('no deja recibir más de lo pedido ni toca nada si una línea es inválida', async () => {
    const f = dbFalsa({
      com_movimientos: [compra({ id: 'v1', cantidad: 50 }), compra({ id: 'v2', sku: 'B', cantidad: 10 })],
    });
    m.db = f.db;
    expect(await recibirOc('OC-1', { v1: 20, v2: 11 })).toEqual({
      error: 'B: no puedes recibir más de lo pedido (10)',
    });
    expect(f.tablas.com_movimientos.map((x) => x.cantidad_recibida)).toEqual([0, 0]);
    expect(await recibirOc('OC-1', { v1: 20, v9: 1 })).toEqual({
      error: 'Una línea ya no existe en esta OC; recarga la página',
    });
    expect(await recibirOc('OC-1', { v1: 20, v2: 10 })).toEqual({ ok: true });
    expect(f.tablas.com_movimientos.map((x) => x.cantidad_recibida)).toEqual([20, 10]);
  });
});

describe('I8 · editar un cierre solo reinicia avisos si cambian fechas o alcance', () => {
  const cierre = {
    id: 7,
    vendor_id: 'v1',
    vendor_name: 'Prov',
    ini: '2099-12-20',
    fin: '2099-12-30',
    motivo: 'vacaciones',
    skus: null,
    notas: null,
    aviso7_at: '2099-12-12T10:00:00Z',
    aviso0_at: null,
  };
  const form = {
    id: 7,
    vendor_id: 'v1',
    vendor_name: 'Prov',
    ini: '2099-12-20',
    fin: '2099-12-30',
    motivo: 'vacaciones',
    todo: true,
    skus: [],
    notas: '',
  };
  beforeEach(() => m.invocar.mockClear());
  it('cambiar solo las notas conserva los avisos', async () => {
    const f = dbFalsa({ com_proveedor_cierre: [{ ...cierre }] });
    m.db = f.db;
    expect(await guardarCierre({ ...form, notas: 'nota corregida' })).toMatchObject({ ok: true });
    expect(f.tablas.com_proveedor_cierre[0]).toMatchObject({
      notas: 'nota corregida',
      aviso7_at: '2099-12-12T10:00:00Z',
    });
  });
  it('cambiar fechas o artículos los reinicia', async () => {
    const f = dbFalsa({ com_proveedor_cierre: [{ ...cierre }] });
    m.db = f.db;
    await guardarCierre({ ...form, fin: '2100-01-05' });
    expect(f.tablas.com_proveedor_cierre[0].aviso7_at).toBeNull();
  });
  it('un periodo que ya no existe no se "guarda" ni recalcula', async () => {
    m.db = dbFalsa({ com_proveedor_cierre: [] }).db;
    expect(await guardarCierre(form)).toEqual({ error: 'Ese periodo ya no existe; recarga la página' });
    expect(m.invocar).not.toHaveBeenCalled();
  });
  it('helpers: fechas y alcance (sin orden; null = lista vacía)', () => {
    expect(
      fechasCambiaron(
        { ini: '2026-12-20', fin: '2026-12-30' },
        { ini: '2026-12-20T00:00', fin: '2026-12-30' },
      ),
    ).toBe(false);
    expect(
      fechasCambiaron({ ini: '2026-12-20', fin: '2026-12-30' }, { ini: '2026-12-21', fin: '2026-12-30' }),
    ).toBe(true);
    expect(
      alcanceCambio({ vendor_id: 'v1', skus: ['B', 'A'] }, { vendor_id: 'v1', skus: ['A', 'B', 'A'] }),
    ).toBe(false);
    expect(alcanceCambio({ vendor_id: 'v1', skus: null }, { vendor_id: 'v1', skus: [] })).toBe(false);
    expect(alcanceCambio({ vendor_id: 'v1', skus: null }, { vendor_id: 'v2', skus: null })).toBe(true);
  });
});

describe('I10 · el recálculo tras un cierre tiene tiempo corto', () => {
  it('llama com-minmax con timeout de 25 s', async () => {
    m.invocar.mockClear();
    m.db = dbFalsa({ com_proveedor_cierre: [] }).db;
    await guardarCierre({
      vendor_id: 'v1',
      vendor_name: 'Prov',
      ini: '2099-12-20',
      fin: '2099-12-30',
      motivo: 'otro',
      todo: true,
      skus: [],
      notas: '',
    });
    expect(m.invocar).toHaveBeenCalledWith('com-minmax', {}, { timeoutMs: 25_000 });
  });
});

describe('I9 · aviso de cierre con fechas movidas después de la simulación', () => {
  it('el último día se recorre igual que el inicio', async () => {
    const f = dbFalsa({
      com_proveedor_cierre: [
        { id: 3, vendor_name: 'Prov', ini: '2026-12-22', fin: '2026-12-30', cancelado: false },
      ],
    });
    const r = await cierresVigentes(f.db, '2026-12-01', {
      cierres: [{ id: 3, u: '2026-12-10', ini: '2026-12-20', fin: '2026-12-30' }],
    });
    expect(r[0].u).toBe('2026-12-12');
  });
});

describe('I4 · destino 3PL', () => {
  it('Yulius se muestra como 3PL', () => {
    expect(textoDestino('Yulius')).toBe('3PL');
    expect(textoDestino('CEDIS')).toBe('CEDIS');
    expect(textoDestino(null)).toBe('—');
  });
});

describe('I7 · KPIs de pagos con los filtros de la pantalla', () => {
  const p = (o: Record<string, unknown>) => ({
    tipo: 'proyectado',
    sku: 'A',
    nombre: '',
    vendor_id: 'v1',
    vendor_name: 'P',
    fecha_oc: '2026-11-13',
    fecha_pago: '2026-11-14',
    cantidad: 1,
    monto: 100,
    ...o,
  });
  const filas = [
    p({}),
    p({ tipo: 'comprometido', monto: 40 }),
    p({ fecha_pago: '2026-12-20', monto: 900 }),
  ] as never;
  it('sin comprometido no lo suma en esta semana ni en 30 días', () => {
    const k = kpisPagos(filas, '2026-11-13', { comp: false, modo: 'semana', campoFecha: 'fecha_pago' });
    expect([k.estaSemana, k.proximos30, k.comprometido]).toEqual([100, 100, 40]);
  });
  it('el periodo más pesado usa el modo elegido', () => {
    expect(
      kpisPagos(filas, '2026-11-13', { comp: true, modo: 'mes', campoFecha: 'fecha_pago' }).pesado,
    ).toEqual({ etiqueta: 'dic 2026', monto: 900 });
  });
});

describe('OC nueva (antes en com-acciones.test.ts)', () => {
  it('una fila compra por artículo, el monto solo en la primera, estado emitida y sin recibir', async () => {
    const f = dbFalsa({ com_movimientos: [] });
    m.db = f.db;
    expect(
      await guardarOc(
        formOc({
          folio: 'OC-9',
          lineas: [
            { sku: 'A', cantidad: 5 },
            { sku: 'B', cantidad: 2 },
          ],
        }),
      ),
    ).toEqual({ ok: true });
    expect(
      f.tablas.com_movimientos.map((x) => [x.sku, x.monto, x.tipo, x.estado, x.cantidad_recibida]),
    ).toEqual([
      ['A', 500, 'compra', 'emitida', 0],
      ['B', null, 'compra', 'emitida', 0],
    ]);
  });
});
