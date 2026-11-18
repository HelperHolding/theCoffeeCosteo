import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({
  db: null as unknown,
  nivel: 'edicion',
  rpc: vi.fn((_fn: string, _a: unknown) => ({ data: 2, error: null }) as { data: unknown; error: unknown }),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock('../../lib/comercializadora/funciones', () => ({ invocarFuncion: vi.fn() }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({
    perfil: { user_id: 'u1', nombre: 'Ana', rol: 'interno' },
    accesos: { comercializadora: m.nivel },
    nivel: m.nivel,
    db: m.db,
  }),
}));
import {
  crearTraspaso,
  eliminarTraspaso,
  ingresarTraspaso,
} from '../../app/(comercializadora)/comercializadora/acciones';
import {
  agruparTraspasos,
  detalleTraspaso,
  folioTraspaso,
  validarTraspaso,
} from '../../lib/comercializadora/traspasos';
import { Traspasos } from '../../components/comercializadora/traspasos';

const t = (o: Record<string, unknown>) => ({
  id: String(Math.random()),
  tipo: 'traspaso',
  folio: 'T-1',
  fecha: '2026-11-10',
  sku: 'A',
  cantidad: 5,
  cantidad_original: 5,
  origen: 'CEDIS',
  destino: 'Yulius',
  estado: 'ordenado',
  ...o,
});
const form = (o: Record<string, unknown> = {}) => ({
  folio: 'T-9',
  fecha: '2026-11-13',
  origen: 'CEDIS',
  destino: 'Yulius',
  lineas: [{ sku: 'A', cantidad: 4 }],
  ...o,
});

describe('Traspasos (port de renderComTraspasos)', () => {
  it('agrupa por folio: piezas ordenadas, estado y de la fecha más reciente a la más vieja', () => {
    const g = agruparTraspasos([
      t({}),
      t({ sku: 'B', cantidad: 2, cantidad_original: 3, estado: 'ingresado' }),
      t({ folio: 'T-2', fecha: '2026-11-12', estado: 'ingresado' }),
    ] as never);
    expect(g.map((x) => [x.folio, x.skus, x.uds, x.estado])).toEqual([
      ['T-2', 1, 5, 'ingresado'],
      ['T-1', 2, 8, 'ordenado'],
    ]);
  });

  it('detalle: ordenado, ingresado y diferencia', () => {
    expect(detalleTraspaso(t({ cantidad: 4, cantidad_original: 5, estado: 'ingresado' }) as never)).toEqual({
      ord: 5,
      ing: 4,
      dif: -1,
    });
    expect(
      detalleTraspaso(t({ cantidad: 5, cantidad_original: null, estado: 'ingresado' }) as never),
    ).toEqual({ ord: 5, ing: 5, dif: 0 });
  });

  it('validación: referencia, fecha, origen ≠ destino, al menos una línea y SKUs del catálogo', () => {
    const skus = new Set(['A']);
    expect(validarTraspaso(form({ folio: ' ' }), skus)).toBe('Pon la referencia del traspaso');
    expect(validarTraspaso(form({ destino: 'CEDIS' }), skus)).toBe(
      'El origen y el destino deben ser distintos',
    );
    expect(validarTraspaso(form({ origen: 'Bodega' }), skus)).toBe('Elige el origen y el destino');
    expect(validarTraspaso(form({ lineas: [{ sku: 'A', cantidad: 0 }] }), skus)).toBe(
      'Agrega al menos un artículo con cantidad',
    );
    expect(validarTraspaso(form({ lineas: [{ sku: 'ZZ', cantidad: 1 }] }), skus)).toBe(
      'SKU no encontrado: ZZ',
    );
    expect(validarTraspaso(form(), skus)).toBeNull();
  });

  it('folio sugerido con el día de CDMX', () => {
    expect(folioTraspaso('2026-11-13', () => 0)).toBe('T-20261113100');
    expect(folioTraspaso('2026-11-13', () => 0.999)).toBe('T-20261113999');
  });

  describe('acciones', () => {
    beforeEach(() => {
      m.nivel = 'edicion';
      m.rpc.mockClear();
    });

    it('crear: una fila por artículo con cantidad > 0, estado ordenado', async () => {
      const f = dbFalsa({ com_catalogo: [{ sku: 'A' }, { sku: 'B' }], com_movimientos: [] });
      m.db = f.db;
      expect(
        await crearTraspaso(
          form({
            lineas: [
              { sku: 'A', cantidad: 4 },
              { sku: 'B', cantidad: 0 },
            ],
          }),
        ),
      ).toEqual({ ok: true });
      expect(f.tablas.com_movimientos).toEqual([
        expect.objectContaining({
          tipo: 'traspaso',
          folio: 'T-9',
          sku: 'A',
          cantidad: 4,
          cantidad_original: 4,
          origen: 'CEDIS',
          destino: 'Yulius',
          estado: 'ordenado',
          fecha: '2026-11-13',
        }),
      ]);
    });

    it('crear: rechaza un SKU fuera del catálogo y una referencia repetida', async () => {
      m.db = dbFalsa({ com_catalogo: [{ sku: 'A' }], com_movimientos: [t({ folio: 'T-9' })] }).db;
      expect(await crearTraspaso(form({ lineas: [{ sku: 'ZZ', cantidad: 1 }] }))).toEqual({
        error: 'SKU no encontrado: ZZ',
      });
      expect(await crearTraspaso(form())).toEqual({ error: 'Ya existe un traspaso con la referencia T-9' });
    });

    it('ingresar: pasa cantidades normalizadas por id a la función atómica', async () => {
      m.db = dbFalsa({}, [], m.rpc).db;
      expect(await ingresarTraspaso('T-1', { a1: '1,200', a2: '0' })).toEqual({ ok: true, lineas: 2 });
      expect(m.rpc).toHaveBeenCalledWith('com_ingresar_traspaso', {
        p_folio: 'T-1',
        p_recibido: { a1: 1200, a2: 0 },
      });
    });

    it('ingresar: una cantidad vacía o con texto no llama a la base', async () => {
      m.db = dbFalsa({}, [], m.rpc).db;
      expect(await ingresarTraspaso('T-1', { a1: '', a2: '3' })).toEqual({
        error: 'Revisa las cantidades recibidas: usa números de 0 en adelante',
      });
      expect(m.rpc).not.toHaveBeenCalled();
    });

    it('ingresar: el mensaje de la función (ya se ingresó) llega a la persona', async () => {
      m.db = dbFalsa({}, [], () => ({
        data: null,
        error: { code: 'P0001', message: 'El traspaso T-1 ya se ingresó o no existe; recarga la página' },
      })).db;
      expect(await ingresarTraspaso('T-1', { a1: '5' })).toEqual({
        error: 'El traspaso T-1 ya se ingresó o no existe; recarga la página',
      });
    });

    it('eliminar: solo un traspaso sin ingresar', async () => {
      const f = dbFalsa({ com_movimientos: [t({ folio: 'T-1' }), t({ folio: 'T-2', estado: 'ingresado' })] });
      m.db = f.db;
      expect(await eliminarTraspaso('T-2')).toEqual({
        error: 'Solo se puede eliminar un traspaso que aún no se ingresa',
      });
      expect(await eliminarTraspaso('T-1')).toEqual({ ok: true });
      expect(f.tablas.com_movimientos.map((x) => x.folio)).toEqual(['T-2']);
    });

    it('solo lectura: ninguna de las tres toca la base', async () => {
      m.nivel = 'lectura';
      const f = dbFalsa({ com_catalogo: [{ sku: 'A' }], com_movimientos: [t({})] }, [], m.rpc);
      m.db = f.db;
      const SL = { error: 'Tu acceso a Comercializadora es de solo lectura.' };
      expect(await crearTraspaso(form())).toEqual(SL);
      expect(await ingresarTraspaso('T-1', { a: '1' })).toEqual(SL);
      expect(await eliminarTraspaso('T-1')).toEqual(SL);
      expect(f.consultas).toEqual([]);
      expect(m.rpc).not.toHaveBeenCalled();
    });
  });
});

describe('pantalla Traspasos', () => {
  const grupos = agruparTraspasos([
    t({ id: 'a1' }),
    t({ id: 'a2', sku: 'B', cantidad: 3, cantidad_original: 3 }),
  ] as never);
  it('nuevo traspaso con origen igual al destino: muestra el error sin llamar al servidor', () => {
    render(<Traspasos grupos={grupos} catalogo={[{ sku: 'A', nombre: 'Café' }]} editable hoy="2026-11-13" />);
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo traspaso' }));
    fireEvent.change(screen.getByLabelText('Destino'), { target: { value: 'CEDIS' } });
    fireEvent.change(screen.getByLabelText('SKU 1'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('Cantidad 1'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar traspaso' }));
    expect(screen.getByRole('alert')).toHaveTextContent('El origen y el destino deben ser distintos');
  });
  it('ingresar muestra una cantidad recibida por línea, con lo ordenado de inicio', () => {
    render(<Traspasos grupos={grupos} catalogo={[]} editable hoy="2026-11-13" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(screen.getByLabelText('Recibido de A')).toHaveValue('5');
    expect(screen.getByLabelText('Recibido de B')).toHaveValue('3');
  });
  it('solo lectura: sin botones de escritura', () => {
    render(<Traspasos grupos={grupos} catalogo={[]} editable={false} hoy="2026-11-13" />);
    expect(screen.queryByRole('button', { name: 'Nuevo traspaso' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ingresar' })).not.toBeInTheDocument();
  });
});
