// Correcciones de la revisión final del plan 3c (I1, I2 e I3 = menor 8 re-graduado).
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock('../../lib/comercializadora/funciones', () => ({ invocarFuncion: vi.fn() }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({
    perfil: { user_id: 'u1', nombre: 'Ana', rol: 'interno' },
    accesos: { comercializadora: 'edicion' },
    nivel: 'edicion',
    db: m.db,
  }),
}));
import { crearTraspaso } from '../../app/(comercializadora)/comercializadora/acciones';
import { agruparTraspasos, detalleTraspaso, validarTraspaso } from '../../lib/comercializadora/traspasos';
import { agruparVentas, filtrarEnvios } from '../../lib/comercializadora/envios';
import { Traspasos } from '../../components/comercializadora/traspasos';

const form = (cantidad: number) => ({
  folio: 'T-9',
  fecha: '2026-11-13',
  origen: 'CEDIS',
  destino: 'Yulius',
  lineas: [{ sku: 'A', cantidad }],
});

describe('I1: cantidades al crear un traspaso', () => {
  it('una cantidad no numérica, infinita o negativa es un error (no se descarta en silencio)', () => {
    const skus = new Set(['A']);
    expect(validarTraspaso(form(NaN), skus)).toBe('A: cantidad inválida (usa un número)');
    expect(validarTraspaso(form(Infinity), skus)).toBe('A: cantidad inválida (usa un número)');
    expect(validarTraspaso(form(-2), skus)).toBe('A: cantidad inválida (usa un número)');
  });

  it('el servidor rechaza Infinity aunque llegue directo a la acción', async () => {
    const f = dbFalsa({ com_catalogo: [{ sku: 'A' }], com_movimientos: [] });
    m.db = f.db;
    expect(await crearTraspaso(form(Infinity))).toEqual({ error: 'A: cantidad inválida (usa un número)' });
    expect(f.tablas.com_movimientos).toEqual([]);
  });

  it('en la pantalla "1,500" son 1500 piezas (como al ingresar) y "abc" muestra el error', async () => {
    const f = dbFalsa({ com_catalogo: [{ sku: 'A' }], com_movimientos: [] });
    m.db = f.db;
    render(<Traspasos grupos={[]} catalogo={[{ sku: 'A', nombre: 'Café' }]} editable hoy="2026-11-13" />);
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo traspaso' }));
    fireEvent.change(screen.getByLabelText('SKU 1'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('Cantidad 1'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar traspaso' }));
    expect(screen.getByRole('alert')).toHaveTextContent('A: cantidad inválida (usa un número)');
    fireEvent.change(screen.getByLabelText('Cantidad 1'), { target: { value: '1,500' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar traspaso' }));
    await waitFor(() => expect(f.tablas.com_movimientos).toHaveLength(1));
    expect(f.tablas.com_movimientos[0]).toMatchObject({ sku: 'A', cantidad: 1500, cantidad_original: 1500 });
  });
});

describe('I2: el detalle de un traspaso sin ingresar no muestra lo ingresado', () => {
  const t = (o: Record<string, unknown>) => ({
    id: 'a1',
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
  it('ordenado: ingresado y diferencia vacíos; ingresado: con su diferencia', () => {
    expect(detalleTraspaso(t({}) as never)).toEqual({ ord: 5, ing: null, dif: null });
    expect(detalleTraspaso(t({ estado: 'ingresado', cantidad: 4 }) as never)).toEqual({
      ord: 5,
      ing: 4,
      dif: -1,
    });
  });
  it('en pantalla, el detalle de uno ordenado dice "ingresado —"', () => {
    render(
      <Traspasos
        grupos={agruparTraspasos([t({})] as never)}
        catalogo={[]}
        editable={false}
        hoy="2026-11-13"
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Detalle' }));
    expect(screen.getByText('ingresado —')).toBeInTheDocument();
  });
});

describe('I3: Enviados y Todos muestran primero lo más reciente', () => {
  const v = (folio: string, estado: string, fecha_envio: string) => ({
    id: folio,
    folio,
    sucursal: 'S',
    fecha: null,
    fecha_envio,
    sku: 'A',
    cantidad: 1,
    estado,
  });
  const g = agruparVentas([
    v('V1', 'enviado', '2026-01-05'),
    v('V2', 'enviado', '2026-11-10'),
    v('V3', 'por_enviar', '2026-11-12'),
    v('V4', 'por_enviar', '2026-11-01'),
  ] as never);
  it('por enviar: lo más antiguo primero (la cola); enviados y todos: lo más reciente primero', () => {
    expect(filtrarEnvios(g, 'por_enviar').map((x) => x.folio)).toEqual(['V4', 'V3']);
    expect(filtrarEnvios(g, 'enviados').map((x) => x.folio)).toEqual(['V2', 'V1']);
    expect(filtrarEnvios(g, 'todos').map((x) => x.folio)).toEqual(['V3', 'V2', 'V4', 'V1']);
  });
});
