// Qué pedir › Por proveedor: cada proveedor se despliega con las líneas que hay que pedirle.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));
import { QuePedir } from '../../components/comercializadora/que-pedir';

const art = (
  sku: string,
  nombre: string,
  stock: number,
  costo: number,
  vendor: string,
  vendorNombre: string,
) => ({
  sku,
  nombre,
  zoho_stock: stock,
  zoho_stock_fisico: null,
  zoho_sync_at: 'x',
  saldo_cedis: 0,
  saldo_yulius: 0,
  costo_unitario: costo,
  zoho_vendor_id: vendor,
  zoho_vendor_name: vendorNombre,
});
// A, C y D son de Prov Uno; B es de Prov Dos.
const datos = {
  catalogo: [
    art('A', 'Café molido', 10, 50, 'v1', 'Prov Uno'),
    art('C', 'Azúcar', 900, 10, 'v1', 'Prov Uno'),
    art('D', 'Jarabe', 0, 20, 'v1', 'Prov Uno'),
    art('B', 'Vasos', 0, 1, 'v2', 'Prov Dos'),
  ],
  minmax: [
    { sku: 'A', venta_diaria: 2 },
    { sku: 'C', venta_diaria: 1 },
    { sku: 'D', venta_diaria: 1 },
    { sku: 'B', venta_diaria: 5 },
  ],
  // La simulación propone comprar A y D (Prov Uno) y B (Prov Dos); C no.
  compras: [
    { sku: 'A', fecha_oc: '2026-11-13', cantidad: 20, monto: 1000 },
    { sku: 'D', fecha_oc: '2026-11-14', cantidad: 6, monto: 120 },
    { sku: 'B', fecha_oc: '2026-11-13', cantidad: 50, monto: 50 },
  ],
  camino: {},
  yulius: true,
  resumen: {},
};

const render7 = () => render(<QuePedir datos={datos} hoy="2026-11-13" edadHoras={2} avisos={[]} />);

describe('Qué pedir por proveedor: líneas desplegables', () => {
  it('cerrado por omisión; al abrirlo muestra solo los artículos que hay que pedirle, con cantidad y monto', async () => {
    render7();
    await userEvent.click(screen.getByRole('button', { name: 'Por proveedor' }));
    expect(screen.queryByText('Café molido')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver los artículos de Prov Uno' }));
    const lineas = screen.getByRole('table', { name: 'Artículos a pedir a Prov Uno' });
    expect(within(lineas).getByText('Café molido')).toBeInTheDocument();
    expect(within(lineas).getByText('Jarabe')).toBeInTheDocument();
    expect(within(lineas).queryByText('Azúcar')).not.toBeInTheDocument();
    expect(
      within(lineas)
        .getAllByRole('columnheader')
        .map((h) => h.textContent),
    ).toEqual([
      'Artículo',
      'Inventario',
      'Físico (Informativo)',
      'En camino',
      'Días de inventario',
      'Cantidad',
      'Monto',
    ]);
    // Prov Dos sigue cerrado.
    expect(screen.queryByText('Vasos')).not.toBeInTheDocument();
  });

  it('con un proveedor elegido en el filtro, sus líneas ya salen desplegadas', async () => {
    render7();
    await userEvent.click(screen.getByRole('button', { name: 'Por proveedor' }));
    await userEvent.selectOptions(screen.getByLabelText('Proveedor'), 'v1');
    const lineas = screen.getByRole('table', { name: 'Artículos a pedir a Prov Uno' });
    expect(within(lineas).getByText('Café molido')).toBeInTheDocument();
    // Y se puede cerrar.
    await userEvent.click(screen.getByRole('button', { name: 'Ocultar los artículos de Prov Uno' }));
    expect(screen.queryByRole('table', { name: 'Artículos a pedir a Prov Uno' })).not.toBeInTheDocument();
  });
});
