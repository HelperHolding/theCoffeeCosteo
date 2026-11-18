// Revisión final del plan 3b: recuperación tras "el saldo cambió" y celdas del catálogo.
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ refresh: vi.fn(), ajustar: vi.fn(), guardar: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock('../../app/(comercializadora)/comercializadora/acciones', () => ({
  ajustar3pl: m.ajustar,
  guardarCampoCatalogo: m.guardar,
  guardarMinMaxManual: vi.fn(),
  guardarConfig: vi.fn(),
}));
import { Ajuste3pl } from '../../components/comercializadora/ajuste-3pl';
import { Catalogo } from '../../components/comercializadora/catalogo';

const fila = {
  sku: 'A',
  nombre: 'Café',
  categoria: '',
  estatus: 'Activo',
  proveedor: '',
  fisico: 0,
  contable: 0,
  comprometido: 0,
  disponible: 0,
  camino: 0,
  minimo: null,
  maximo: null,
  minManual: false,
  maxManual: false,
  venta: 0,
  cobertura: null,
  estado: null,
  tresPl: 10,
  costo: 50,
};

describe('ajuste de 3PL', () => {
  it('si el saldo cambió, refresca para traer el saldo nuevo y conserva lo capturado', async () => {
    m.ajustar.mockResolvedValueOnce({
      error: 'El saldo de A cambió desde que lo viste; revisa y vuelve a guardar',
    });
    render(
      <Ajuste3pl
        filas={[fila] as never}
        saldos={{ A: 10 }}
        autorizadores={['Luis']}
        hoy="2026-11-12"
        alCerrar={() => {}}
      />,
    );
    await userEvent.selectOptions(screen.getByLabelText('Autoriza'), 'Luis');
    await userEvent.type(screen.getByLabelText('SKU 1'), 'A');
    await userEvent.type(screen.getByLabelText('Cantidad 1'), '12');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar ajuste' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/cambió/);
    expect(m.refresh).toHaveBeenCalled();
    expect(screen.getByLabelText('Cantidad 1')).toHaveValue('12');
  });
});

describe('catálogo', () => {
  it('guardar una celda no bloquea las demás', async () => {
    // Guardado pendiente durante la aserción; se resuelve al final para no enredar las transiciones de otras pruebas.
    let terminar: (v: unknown) => void = () => {};
    m.guardar.mockReturnValueOnce(new Promise((r) => (terminar = r)));
    const filas = [
      {
        sku: 'A',
        nombre: 'Café',
        estatus: 'Activo',
        zoho_vendor_name: null,
        zoho_lead_time: null,
        cantidad_por_apertura: 1,
        minimo_compra_pzas: 0,
        multiplo_compra: 1,
        dias_seguridad: null,
      },
    ];
    render(<Catalogo filas={filas} leadTimes={{ A: 5 }} minmax={{}} editable />);
    const lt = screen.getByLabelText('Lead time (días) de A');
    await userEvent.clear(lt);
    await userEvent.type(lt, '9');
    await userEvent.tab();
    expect(screen.getByLabelText('Piezas por apertura de A')).not.toBeDisabled();
    terminar({ ok: true });
    await screen.findByText('Guardado');
  });
});

describe('configuración (I4 e I5)', () => {
  it('vaciar un número conserva el valor anterior; fuera de rango se acota', async () => {
    const { Configuracion } = await import('../../components/comercializadora/configuracion');
    const { configPorDefecto } = await import('../../lib/comercializadora/config');
    render(
      <Configuracion
        config={configPorDefecto()}
        version={1}
        actualizadoPor={null}
        actualizadoEn={null}
        historial={[]}
        credito={[]}
        editable
        hoy="2026-11-13"
      />,
    );
    const lt = screen.getByLabelText('Lead time por omisión (días)');
    await userEvent.clear(lt);
    expect(screen.getByText('Sin cambios')).toBeInTheDocument();
    await userEvent.type(lt, '999');
    expect(lt).toHaveValue(365);
  });
  it('una activación nueva trae fechas de hoy; sin fechas no se guarda y se avisa', async () => {
    const { Configuracion } = await import('../../components/comercializadora/configuracion');
    const { configPorDefecto } = await import('../../lib/comercializadora/config');
    render(
      <Configuracion
        config={configPorDefecto()}
        version={1}
        actualizadoPor={null}
        actualizadoEn={null}
        historial={[]}
        credito={[]}
        editable
        hoy="2026-11-13"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Agregar activación/ }));
    expect(screen.getByLabelText('Desde')).toHaveValue('2026-11-13');
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '' } }); // jsdom no vacía un date con userEvent.clear
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('necesita fecha de inicio y de fin');
  });
});
