import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ db: null as unknown, nivel: 'edicion', refresh: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock('../../lib/comercializadora/funciones', () => ({ invocarFuncion: vi.fn() }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({
    perfil: { user_id: 'u1', nombre: 'Ana', rol: 'interno' },
    accesos: { comercializadora: m.nivel },
    nivel: m.nivel,
    db: m.db,
  }),
}));
import { aplicarPiezasApertura } from '../../app/(comercializadora)/comercializadora/acciones';
import { PiezasApertura } from '../../components/comercializadora/piezas-apertura';
import type { ResultadoPiezas } from '../../supabase/functions/_shared/planPiezas.ts';

const RES: ResultadoPiezas = {
  N: 20,
  totalAperturas: 31,
  sinAtribuir: 2,
  filas: [
    { sku: 'A', nombre: 'Vaso', actual: 0, n: 12, N: 20, mediana: 100, prom: 60, sug: 60, min: 50, max: 150 },
    {
      sku: 'B',
      nombre: 'Tapa',
      actual: 10,
      n: 9,
      N: 20,
      mediana: 11,
      prom: 10.5,
      sug: 10.5,
      min: 8,
      max: 14,
    },
    { sku: 'C', nombre: 'Popote', actual: 0, n: 2, N: 20, mediana: 3, prom: 0.3, sug: 0.3, min: 2, max: 4 },
  ],
};

describe('Sugerir piezas por apertura: pantalla', () => {
  beforeEach(() => {
    m.nivel = 'edicion';
    vi.stubGlobal('confirm', () => true);
  });

  it('marca solo las que tienen ≥ 3 aperturas y cambian > 15% (o no tienen nada capturado)', () => {
    render(<PiezasApertura res={RES} n={20} editable aviso={null} degradado={false} />);
    expect(screen.getByLabelText('Aplicar A')).toBeChecked();
    expect(screen.getByLabelText('Aplicar B')).not.toBeChecked(); // 10 → 10.5 es 5%
    expect(screen.getByLabelText('Aplicar C')).not.toBeChecked(); // pocos datos
    expect(screen.getByText(/2 pedido\(s\) de kit sin sucursal/)).toBeInTheDocument();
  });

  it('solo lectura: nada marcado ni botón de aplicar; avisos de puente y de aperturas', () => {
    render(
      <PiezasApertura res={RES} n={20} editable={false} aviso="No se pudieron leer los pedidos." degradado />,
    );
    expect(screen.getByLabelText('Aplicar A')).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Aplicar los marcados' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual([
      'No se pudieron leer los pedidos.',
      expect.stringContaining('No se pudieron leer las aperturas'),
    ]);
  });

  it('aplicar guarda lo marcado con el valor editado y refresca', async () => {
    const f = dbFalsa({
      com_catalogo: [
        { sku: 'A', cantidad_por_apertura: 0 },
        { sku: 'B', cantidad_por_apertura: 10 },
      ],
      com_plan_config_historial: [],
    });
    m.db = f.db;
    render(<PiezasApertura res={RES} n={20} editable aviso={null} degradado={false} />);
    fireEvent.change(screen.getByLabelText('Sugerido de A'), { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar los marcados' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Guardadas: 1.'));
    expect(f.tablas.com_catalogo[0].cantidad_por_apertura).toBe(55);
    expect(m.refresh).toHaveBeenCalled();
  });
});

describe('aplicarPiezasApertura', () => {
  beforeEach(() => {
    m.nivel = 'edicion';
  });

  it('update condicional al valor que se vio, con historial; si cambió, no lo pisa', async () => {
    const f = dbFalsa({
      com_catalogo: [
        { sku: 'A', cantidad_por_apertura: 0 },
        { sku: 'B', cantidad_por_apertura: 12 },
      ],
      com_plan_config_historial: [],
    });
    m.db = f.db;
    const r = await aplicarPiezasApertura([
      { sku: 'A', valor: '60,456', antes: 0 },
      { sku: 'B', valor: '10.5', antes: 10 },
    ]);
    expect(r).toEqual({ ok: true, guardados: 1, fallas: [expect.stringContaining('B: el valor cambió')] });
    expect(f.tablas.com_catalogo.map((c) => c.cantidad_por_apertura)).toEqual([60.46, 12]);
    expect(f.tablas.com_plan_config_historial).toEqual([
      expect.objectContaining({
        ambito: 'sku',
        clave: 'A:cantidad_por_apertura',
        valor_anterior: 0,
        valor_nuevo: 60.46,
      }),
    ]);
  });

  it('sin filas válidas responde el error; solo lectura no toca la base', async () => {
    const f = dbFalsa({ com_catalogo: [{ sku: 'A', cantidad_por_apertura: 0 }] });
    m.db = f.db;
    expect(await aplicarPiezasApertura([{ sku: 'A', valor: '-1', antes: 0 }])).toEqual({
      error: 'No hay filas marcadas con un valor válido',
    });
    m.nivel = 'lectura';
    expect(await aplicarPiezasApertura([{ sku: 'A', valor: '5', antes: 0 }])).toEqual({
      error: 'Tu acceso a Comercializadora es de solo lectura.',
    });
    expect(f.consultas).toEqual([]);
  });
});
