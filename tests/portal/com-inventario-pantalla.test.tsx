import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock('../../app/(comercializadora)/comercializadora/acciones', () => ({ ajustar3pl: vi.fn() }));
import { Inventario } from '../../components/comercializadora/inventario';

const fila = (o: Record<string, unknown>) => ({
  sku: 'A',
  nombre: 'Café',
  categoria: 'Insumos',
  estatus: 'Activo',
  proveedor: 'Prov',
  fisico: 10,
  contable: 12,
  comprometido: 0,
  disponible: 10,
  camino: 0,
  minimo: 20,
  maximo: 40,
  minManual: false,
  maxManual: false,
  venta: 1,
  cobertura: 10,
  estado: 'rojo',
  tresPl: 0,
  costo: 50,
  ...o,
});

describe('Inventario', () => {
  it('filtra por búsqueda y por "solo faltantes"', async () => {
    render(
      <Inventario
        filas={[fila({}), fila({ sku: 'B', nombre: 'Vasos', disponible: 0, fisico: 0 })] as never}
        valor={{ valor: 500, sinCosto: 0 }}
        viejos={[]}
        ultimoSync={null}
        hoy="2026-11-13"
        editable={false}
        autorizadores={[]}
        saldos3pl={{}}
      />,
    );
    expect(screen.getByText('Café')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Estatus'), 'faltantes');
    expect(screen.queryByText('Café')).not.toBeInTheDocument();
    expect(screen.getByText('Vasos')).toBeInTheDocument();
  });
  it('sin permiso de edición no muestra "Ajustar 3PL"', () => {
    render(
      <Inventario
        filas={[fila({})] as never}
        valor={{ valor: 0, sinCosto: 0 }}
        viejos={[]}
        ultimoSync={null}
        hoy="2026-11-13"
        editable={false}
        autorizadores={[]}
        saldos3pl={{}}
      />,
    );
    expect(screen.queryByRole('button', { name: /Ajustar 3PL/ })).not.toBeInTheDocument();
  });
});
