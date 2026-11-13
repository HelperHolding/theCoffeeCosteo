import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
import { QuePedir } from '../../components/comercializadora/que-pedir';

const datos = {
  catalogo: [
    {
      sku: 'A',
      nombre: 'Café molido',
      zoho_stock: 10,
      zoho_stock_fisico: null,
      zoho_sync_at: 'x',
      saldo_cedis: 0,
      saldo_yulius: 0,
      costo_unitario: 50,
      zoho_vendor_id: 'v1',
      zoho_vendor_name: 'Prov Uno',
    },
    {
      sku: 'B',
      nombre: 'Vasos',
      zoho_stock: 500,
      zoho_stock_fisico: null,
      zoho_sync_at: 'x',
      saldo_cedis: 0,
      saldo_yulius: 0,
      costo_unitario: 1,
      zoho_vendor_id: 'v2',
      zoho_vendor_name: 'Prov Dos',
    },
  ],
  minmax: [
    { sku: 'A', venta_diaria: 2 },
    { sku: 'B', venta_diaria: 5 },
  ],
  compras: [{ sku: 'A', fecha_oc: '2026-11-13', cantidad: 20, monto: 1000 }],
  camino: {},
  yulius: true,
  resumen: {},
};

describe('Qué pedir', () => {
  it('muestra KPIs y por omisión solo lo que hay que pedir; el filtro muestra todo', async () => {
    render(<QuePedir datos={datos} hoy="2026-11-13" edadHoras={2} avisos={[]} />);
    // Kpi: la etiqueta va en el encabezado; el valor, en la tarjeta (el abuelo de la etiqueta).
    expect(screen.getByText('Artículos a pedir').parentElement!.parentElement).toHaveTextContent('1');
    expect(screen.getByText('Café molido')).toBeInTheDocument();
    expect(screen.queryByText('Vasos')).not.toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Solo lo que hay que pedir'));
    expect(screen.getByText('Vasos')).toBeInTheDocument();
  });
  it('avisa cuando la simulación tiene más de 36 horas', () => {
    render(<QuePedir datos={datos} hoy="2026-11-13" edadHoras={40} avisos={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent(/hace más de 36 horas/);
  });
  it('vista por proveedor agrupa en pesos', async () => {
    render(<QuePedir datos={datos} hoy="2026-11-13" edadHoras={2} avisos={[]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Por proveedor' }));
    expect(screen.getByRole('cell', { name: /Prov Uno/ })).toBeInTheDocument(); // también está en el selector de proveedor
  });
});
