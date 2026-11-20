import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Columna "WhatsApp" de Órdenes (spec 2026-11-20-oc-whatsapp-proveedor-design.md §7).
const m = vi.hoisted(() => ({ reintentar: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/app/(comercializadora)/comercializadora/acciones', () => ({
  eliminarOc: vi.fn(),
  guardarOc: vi.fn(),
  recibirOc: vi.fn(),
  reintentarWhatsapp: (id: string) => m.reintentar(id),
}));

import { Ordenes } from '../../components/comercializadora/ordenes';

const grupo = (folio: string) =>
  ({
    folio,
    fecha: '2026-11-24',
    proveedor: 'ODISA',
    skus: 1,
    uds: 10,
    monto: 100,
    destino: 'CEDIS',
    fecha_arribo: null,
    estado: 'emitida',
    items: [],
  }) as never;
const base = { proveedores: ['ODISA'], catalogo: [], ultimoSync: null, hoy: '2026-11-24' };

describe('Órdenes: columna WhatsApp', () => {
  it('muestra el estado por folio y el reintento solo con edición y en fallas', () => {
    m.reintentar.mockResolvedValue({ ok: true, borrada: true });
    render(
      <Ordenes
        {...base}
        editable
        grupos={[grupo('COM-OC-1'), grupo('COM-OC-2'), grupo('COM-OC-3')]}
        whatsapp={{
          'COM-OC-1': {
            zoho_po_id: 'p1',
            po_number: 'COM-OC-1',
            estado: 'leido',
            error: null,
            enviado_at: null,
            leido_at: '2026-11-24T15:00:00Z',
          },
          'COM-OC-2': {
            zoho_po_id: 'p2',
            po_number: 'COM-OC-2',
            estado: 'sin_numero',
            error: null,
            enviado_at: null,
            leido_at: null,
          },
        }}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'WhatsApp' })).toBeTruthy();
    expect(screen.getByText('Leído 09:00')).toBeTruthy();
    expect(screen.getByText('Sin número')).toBeTruthy();
    const botones = screen.getAllByRole('button', { name: /Reintentar WhatsApp/ });
    expect(botones).toHaveLength(1);
    fireEvent.click(botones[0]);
    expect(m.reintentar).toHaveBeenCalledWith('p2');
  });

  it('sin edición no hay botón', () => {
    render(
      <Ordenes
        {...base}
        editable={false}
        grupos={[grupo('COM-OC-2')]}
        whatsapp={{
          'COM-OC-2': {
            zoho_po_id: 'p2',
            po_number: 'COM-OC-2',
            estado: 'fallido',
            error: 'x',
            enviado_at: null,
            leido_at: null,
          },
        }}
      />,
    );
    expect(screen.queryByRole('button', { name: /Reintentar WhatsApp/ })).toBeNull();
  });
});
