import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsumoNacionalVista, nombreMes } from '../../components/sucursales/consumo-nacional';
import type { ConsumoNacional } from '../../lib/sucursales/contratos';

const datos = (mes: string): ConsumoNacional => ({
  generadoEn: '2026-11-05T00:00:00Z',
  mes,
  meses: ['2026-10-01', '2026-09-01'],
  sucursalesAnterior: 1,
  sucursales: [
    { companyId: 513, nombre: 'Namóra', ciudad: 'Guadalajara', completa: true, calculadoEn: 'x', recetasLeidasEn: 'y',
      cobertura: { mostrador: { lineas: 10, incluidas: 9, generico: 0, sinCodigo: 0, sinEnlace: 1 } },
      sinReceta: { mostrador: [{ nombre: 'Sandwich', unidades: 1, sinCodigo: false }] } },
  ],
  insumos: [
    { insumoId: 'le', insumo: 'LECHE ENTERA', unidad: 'ml', categoria: 'PERECEDEROS', presentacion: 1000,
      porOrigen: { mostrador: mes === '2026-10-01' ? 312500 : 250000 }, sucursales: 1, anterior: { mostrador: 250000 } },
  ],
});
const fetchFalso = vi.fn(async (url: string, _init?: unknown) => {
  const u = new URL(url, 'http://x');
  if (u.pathname.endsWith('/desglose'))
    return Response.json({ mes: '2026-10-01', filas: [{ companyId: 513, insumoId: 'le', origen: 'mostrador', cantidad: 312500 }] });
  const mes = u.searchParams.get('mes');
  return Response.json(datos(mes ? `${mes}-01` : '2026-10-01'));
});
afterEach(() => fetchFalso.mockClear());

describe('pestaña Consumo del Tablero México', () => {
  it('abre en el último mes calculado, con presentaciones y cambio', async () => {
    vi.stubGlobal('fetch', fetchFalso);
    render(<ConsumoNacionalVista />);
    expect(await screen.findByText('LECHE ENTERA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Octubre 2026' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/312\.5 × 1,000 ml/)).toBeInTheDocument();
    expect(screen.getByText('+25 %')).toBeInTheDocument();
    expect(screen.getByText('90 %')).toBeInTheDocument(); // cobertura
  });

  it('cambia de mes con su botón y abre el desglose de un insumo', async () => {
    vi.stubGlobal('fetch', fetchFalso);
    render(<ConsumoNacionalVista />);
    fireEvent.click(await screen.findByRole('button', { name: 'Septiembre 2026' }));
    await waitFor(() => expect(fetchFalso).toHaveBeenCalledWith(expect.stringContaining('mes=2026-09'), expect.anything()));
    fireEvent.click(await screen.findByRole('button', { name: /LECHE ENTERA/ }));
    const panel = await screen.findByRole('region', { name: /Desglose de LECHE ENTERA/ });
    expect(within(panel).getByText('Namóra')).toBeInTheDocument();
    expect(within(panel).getByText('Guadalajara')).toBeInTheDocument();
  });

  it('nombre de mes en español', () => {
    expect(nombreMes('2026-10-01')).toBe('Octubre 2026');
  });
});
