import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
import { Corrida } from '../../components/sucursales-propias/pagos/corrida';
import type { AccionesPagos, FilaVista } from '../../components/sucursales-propias/pagos/tipos';

const fila = (o: Partial<FilaVista>): FilaVista => ({
  id: 1,
  llave: 'L1',
  tipo: 'SPEI',
  alias: 'OH LALA',
  concepto: 'PAGO',
  monto: 100,
  fecha: '2026-11-20',
  estado: 'cuadra',
  error: null,
  proveedorId: 'v1',
  proveedorNombre: 'OH LALA (PRODUCTORA)',
  sugerido: false,
  pagoId: null,
  reciboUrl: null,
  aplicadoEn: null,
  asignaciones: [
    {
      billId: 'b1',
      numero: '106882',
      ubicacion: 'CIUDAD GRANJA',
      fecha: '2026-11-06',
      saldo: 100,
      monto: 100,
    },
  ],
  ...o,
});

const acciones = (
  aplicar: AccionesPagos['aplicar'] = vi.fn(async () => ({ ok: true as const, estado: 'aplicada' })),
): AccionesPagos => ({
  aplicar,
  asignarProveedor: vi.fn(),
  guardarAsignaciones: vi.fn(),
  leerProveedores: vi.fn(),
  leerFacturasProveedor: vi.fn(),
});

describe('Corrida', () => {
  it('solo lectura no ve el botón de aplicar', () => {
    render(<Corrida filas={[fila({})]} puedeAplicar={false} acciones={acciones()} zohoOrg="1" />);
    expect(screen.queryByRole('button', { name: /Aplicar/ })).toBeNull();
    expect(screen.getByText('Cuadra')).toBeInTheDocument();
  });

  it('pide confirmación con número y total, y aplica una por una en orden', async () => {
    const aplicar = vi.fn(async (id: number) =>
      id === 2 ? { error: 'Zoho no respondió.' } : { ok: true as const, estado: 'aplicada' },
    );
    render(
      <Corrida
        filas={[
          fila({ id: 1, monto: 100 }),
          fila({ id: 2, alias: 'PINKBOOK', monto: 552.21 }),
          fila({ id: 3, estado: 'desconocido', proveedorId: null }),
        ]}
        puedeAplicar
        acciones={acciones(aplicar)}
        zohoOrg="1"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar 2 pagos' }));
    expect(screen.getByText(/Se registrarán en Zoho 2 pagos por \$652\.21/)).toBeInTheDocument();
    expect(aplicar).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar y aplicar en Zoho' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(aplicar.mock.calls.map((c) => c[0])).toEqual([1, 2]);
    expect(screen.getByText('Zoho no respondió.')).toBeInTheDocument();
  });

  it('una fila con error o sin recibo ofrece reintentar', () => {
    render(
      <Corrida
        filas={[
          fila({ id: 4, estado: 'aplicada_sin_adjunto', pagoId: 'p1', error: 'falló el adjunto' }),
          fila({ id: 5, estado: 'error', error: 'Zoho: inactivo' }),
        ]}
        puedeAplicar
        acciones={acciones()}
        zohoOrg="1"
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Ver en Zoho' })).toHaveAttribute(
      'href',
      'https://books.zoho.com/app/1#/paymentsmade/p1',
    );
  });

  it('marca con una insignia el proveedor emparejado por nombre', () => {
    render(
      <Corrida
        filas={[fila({ id: 1, sugerido: true }), fila({ id: 2, alias: 'OTRO', sugerido: false })]}
        puedeAplicar
        acciones={acciones()}
        zohoOrg="1"
      />,
    );
    expect(screen.getAllByText('Proveedor por nombre — revisa')).toHaveLength(1);
  });

  it('las filas con proveedor por nombre quedan fuera del lote hasta confirmarlas', async () => {
    const aplicar = vi.fn(async () => ({ ok: true as const, estado: 'aplicada' }));
    render(
      <Corrida
        filas={[
          fila({ id: 1, sugerido: true }),
          fila({ id: 2, sugerido: true }),
          fila({ id: 3, sugerido: false }),
        ]}
        puedeAplicar
        acciones={acciones(aplicar)}
        zohoOrg="1"
      />,
    );
    expect(
      screen.getByText('2 filas con proveedor por nombre esperan tu confirmación y no se incluyen.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar 1 pago' }));
    expect(screen.getByText(/Se registrará en Zoho 1 pago por \$100\.00/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar y aplicar en Zoho' }));
    await waitFor(() => expect(aplicar).toHaveBeenCalledTimes(1));
    expect(aplicar).toHaveBeenCalledWith(3);
  });

  it('confirmar el proveedor sugerido lo manda a asignarProveedor y refresca', async () => {
    refresh.mockClear();
    const a = acciones();
    a.asignarProveedor = vi.fn(async () => ({ ok: true as const }));
    render(
      <Corrida
        filas={[
          fila({ id: 7, estado: 'no_cuadra', sugerido: true, proveedorId: 'v9', proveedorNombre: 'DEMO SA' }),
        ]}
        puedeAplicar
        acciones={a}
        zohoOrg="1"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar proveedor' }));
    expect(a.asignarProveedor).toHaveBeenCalledWith(7, { id: 'v9', nombre: 'DEMO SA' });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('si confirmar el proveedor falla, lo dice en la fila', async () => {
    const a = acciones();
    a.asignarProveedor = vi.fn(async () => ({ error: 'Ese proveedor no está en Zoho.' }));
    render(<Corrida filas={[fila({ id: 7, sugerido: true })]} puedeAplicar acciones={a} zohoOrg="1" />);
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar proveedor' }));
    expect(await screen.findByText('Ese proveedor no está en Zoho.')).toBeInTheDocument();
  });

  it('ofrece cambiar el proveedor en toda fila aún no aplicada', () => {
    render(
      <Corrida
        filas={[
          fila({ id: 1, estado: 'cuadra' }),
          fila({ id: 2, estado: 'no_cuadra' }),
          fila({ id: 3, estado: 'sin_facturas', asignaciones: [] }),
          fila({ id: 4, estado: 'desconocido', proveedorId: null, proveedorNombre: null, asignaciones: [] }),
          fila({ id: 5, estado: 'aplicada', pagoId: 'p' }),
          fila({ id: 6, estado: 'aplicando' }),
        ]}
        puedeAplicar
        acciones={acciones()}
        zohoOrg="1"
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Cambiar proveedor' })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Elegir proveedor de Zoho' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Confirmar proveedor' })).toBeNull();
  });

  it('una fila atorada en aplicando ofrece reintentar', async () => {
    const aplicar = vi.fn(async () => ({
      ok: true as const,
      estado: 'aplicando',
      mensaje: 'Otra persona la está aplicando.',
    }));
    render(
      <Corrida
        filas={[fila({ id: 8, estado: 'aplicando' })]}
        puedeAplicar
        acciones={acciones(aplicar)}
        zohoOrg="1"
      />,
    );
    expect(screen.queryByRole('button', { name: /Aplicar \d+ pagos/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(aplicar).toHaveBeenCalledWith(8);
    expect(await screen.findByText('Otra persona la está aplicando.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('una solicitud SOL- se marca, queda fuera del lote y se aplica sola tras confirmar con Banregio', async () => {
    refresh.mockClear();
    const aplicar = vi.fn(async () => ({ ok: true as const, estado: 'aplicada' }));
    render(
      <Corrida
        filas={[
          fila({ id: 1 }),
          fila({ id: 2, alias: 'BANORTE DEMO', llave: 'SOL-2026-11-20-3333-6612.00' }),
        ]}
        puedeAplicar
        acciones={acciones(aplicar)}
        zohoOrg="1"
      />,
    );
    expect(screen.getAllByText('Solicitud sin clave de rastreo — confirma con Banregio')).toHaveLength(1);
    expect(
      screen.getByText('1 solicitud sin clave de rastreo se aplica aparte, en su fila.'),
    ).toBeInTheDocument();
    // El lote no la incluye.
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar 1 pago' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar y aplicar en Zoho' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(aplicar).toHaveBeenCalledTimes(1);
    expect(aplicar).toHaveBeenCalledWith(1);
  });

  it('aplicar una solicitud pide confirmación; cancelar no aplica', async () => {
    refresh.mockClear();
    const aplicar = vi.fn(async () => ({ ok: true as const, estado: 'aplicada' }));
    render(
      <Corrida
        filas={[fila({ id: 2, llave: 'SOL-2026-11-20-3333-6612.00' })]}
        puedeAplicar
        acciones={acciones(aplicar)}
        zohoOrg="1"
      />,
    );
    expect(screen.queryByRole('button', { name: /Aplicar \d+ pagos/ })).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    expect(screen.getByText('¿Ya confirmaste con Banregio que se ejecutó?')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByText('¿Ya confirmaste con Banregio que se ejecutó?')).toBeNull();
    expect(aplicar).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(aplicar).toHaveBeenCalledWith(2);
    expect(screen.getByText('Aplicada')).toBeInTheDocument();
  });

  it('solo lectura ve la insignia de solicitud pero no puede aplicarla', () => {
    render(
      <Corrida
        filas={[fila({ id: 2, llave: 'SOL-2026-11-20-3333-6612.00' })]}
        puedeAplicar={false}
        acciones={acciones()}
        zohoOrg="1"
      />,
    );
    expect(screen.getByText('Solicitud sin clave de rastreo — confirma con Banregio')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('una fila en error solo ofrece reintentar, sin editar proveedor ni reparto', () => {
    render(
      <Corrida
        filas={[fila({ id: 5, estado: 'error', error: 'x' })]}
        puedeAplicar
        acciones={acciones()}
        zohoOrg="1"
      />,
    );
    expect(
      screen.queryByRole('button', { name: /Elegir proveedor|Cambiar proveedor|Ajustar facturas/ }),
    ).toBeNull();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('si aplicar se cae en una fila, sigue con la siguiente, avisa y refresca', async () => {
    refresh.mockClear();
    const aplicar = vi.fn(async (id: number) => {
      if (id === 1) throw new Error('504');
      return { ok: true as const, estado: 'aplicada' };
    });
    render(
      <Corrida
        filas={[fila({ id: 1 }), fila({ id: 2, alias: 'OTRO' })]}
        puedeAplicar
        acciones={acciones(aplicar)}
        zohoOrg="1"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar 2 pagos' }));
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar y aplicar en Zoho' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(aplicar.mock.calls.map((c) => c[0])).toEqual([1, 2]);
    expect(screen.getByText('No se pudo aplicar; reintenta.')).toBeInTheDocument();
    expect(screen.queryByText(/Aplicando \d+ de/)).toBeNull();
  });
});
