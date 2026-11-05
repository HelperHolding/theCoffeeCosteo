import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsumoNacionalVista, nombreMes } from '../../components/sucursales/consumo-nacional';
import { VistasMexico } from '../../components/sucursales/vistas-mexico';
import type { ConsumoNacional, SucursalConsumoMes } from '../../lib/sucursales/contratos';

vi.mock('../../components/sucursales/tablero-mexico', () => ({
  TableroMexicoVista: () => <div>Vista de ventas</div>,
}));

const sucursal = (companyId: number, nombre: string, ciudad: string, completa = true): SucursalConsumoMes => ({
  companyId, nombre, ciudad, completa, calculadoEn: 'x', recetasLeidasEn: 'y',
  cobertura: { mostrador: { lineas: 10, incluidas: 9, generico: 0, sinCodigo: 0, sinEnlace: 1 } },
  sinReceta: { mostrador: [{ nombre: 'Sandwich', unidades: 1, sinCodigo: false }] },
});
const namora = sucursal(513, 'Namóra', 'Guadalajara');

const datos = (mes: string, cambios: Partial<ConsumoNacional> = {}): ConsumoNacional => ({
  generadoEn: '2026-11-05T00:00:00Z',
  mes,
  meses: ['2026-10-01', '2026-09-01'],
  sucursalesAnterior: 1,
  sucursalesEsperadas: 1,
  sucursales: [namora],
  insumos: [
    { insumoId: 'le', insumo: 'LECHE ENTERA', unidad: 'ml', categoria: 'PERECEDEROS', presentacion: 1000,
      porOrigen: { mostrador: mes === '2026-10-01' ? 312500 : 250000 }, anterior: { mostrador: 250000 },
      actualComun: { mostrador: mes === '2026-10-01' ? 312500 : 250000 } },
    { insumoId: 'ca', insumo: 'CAFÉ HOUSE', unidad: 'gr', categoria: 'CAFÉ', presentacion: null,
      porOrigen: { mostrador: 90000 }, anterior: { mostrador: 100000 }, actualComun: { mostrador: 90000 } },
    { insumoId: 'az', insumo: 'AZÚCAR', unidad: 'gr', categoria: 'CAFÉ', presentacion: null,
      porOrigen: { mostrador: 5000 }, anterior: { mostrador: 5000 }, actualComun: { mostrador: 5000 } },
    { insumoId: 'po', insumo: 'POPOTE', unidad: 'pza', categoria: 'DESECHABLES', presentacion: null,
      porOrigen: { rappi: 500 }, anterior: {}, actualComun: {} },
  ],
  ...cambios,
});

let respuesta: (mes: string) => ConsumoNacional = datos;
const fetchFalso = vi.fn(async (url: string, _init?: unknown) => {
  const u = new URL(url, 'http://x');
  const mes = u.searchParams.get('mes');
  const completo = mes ? `${mes}-01` : '2026-10-01';
  if (u.pathname.endsWith('/desglose'))
    return Response.json({ mes: completo, filas: [{ companyId: 513, insumoId: 'le', origen: 'mostrador', cantidad: 312500 }] });
  return Response.json(respuesta(completo));
});
const usar = (f: (mes: string) => ConsumoNacional = datos) => {
  respuesta = f;
  vi.stubGlobal('fetch', fetchFalso);
};
afterEach(() => {
  fetchFalso.mockClear();
  respuesta = datos;
});

describe('pestaña Consumo del Tablero México', () => {
  it('abre en el último mes calculado, con presentaciones y cambio', async () => {
    usar();
    render(<ConsumoNacionalVista />);
    expect(await screen.findByText('LECHE ENTERA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Octubre 2026' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByText(/312\.5 × 1,000 ml/).length).toBeGreaterThan(0);
    expect(screen.getByText('+25 %')).toBeInTheDocument();
    expect(screen.getByText('90 %')).toBeInTheDocument(); // cobertura
  });

  it('cambia de mes sin perder la barra, muestra el mes nuevo y abre el desglose', async () => {
    usar();
    const { container } = render(<ConsumoNacionalVista />);
    fireEvent.click(await screen.findByRole('button', { name: 'Septiembre 2026' }));
    // Mientras carga: la barra sigue, el cuerpo está ocupado.
    expect(screen.getByRole('button', { name: 'Octubre 2026' })).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    await waitFor(() => expect(fetchFalso).toHaveBeenCalledWith(expect.stringContaining('mes=2026-09'), expect.anything()));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Septiembre 2026' })).toHaveAttribute('aria-pressed', 'true'));
    expect(screen.getByRole('button', { name: 'Octubre 2026' })).toHaveAttribute('aria-pressed', 'false');
    expect((await screen.findAllByText(/250 × 1,000 ml/)).length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByRole('button', { name: /LECHE ENTERA/ }));
    const panel = await screen.findByRole('region', { name: /Desglose de LECHE ENTERA/ });
    expect(within(panel).getByText('Namóra')).toBeInTheDocument();
    expect(within(panel).getByText('Guadalajara')).toBeInTheDocument();
  });

  it('el filtro de origen cambia las filas', async () => {
    usar();
    render(<ConsumoNacionalVista />);
    await screen.findByText('LECHE ENTERA');
    expect(screen.getByText('POPOTE')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Rappi' }));
    expect(screen.getByText('POPOTE')).toBeInTheDocument();
    expect(screen.queryByText('LECHE ENTERA')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mostrador' }));
    expect(screen.queryByText('POPOTE')).toBeNull();
    expect(screen.getByText('LECHE ENTERA')).toBeInTheDocument();
  });

  it('colorea el cambio: sube en verde, baja en rojo, neutro y sin comparación', async () => {
    usar();
    render(<ConsumoNacionalVista />);
    await screen.findByText('LECHE ENTERA');
    expect(screen.getByText('+25 %').closest('td')).toHaveClass('text-ok');
    const baja = screen.getByText('-10 %').closest('td')!;
    expect(baja).toHaveClass('text-bad');
    const neutro = screen.getByText('0 %').closest('td')!;
    expect(neutro).not.toHaveClass('text-ok');
    expect(neutro).not.toHaveClass('text-bad');
    const filaPopote = screen.getByText('POPOTE').closest('tr')!;
    expect(within(filaPopote).getAllByText('—').length).toBeGreaterThan(0);
  });

  it('la tarjeta contra el mes anterior cuenta los que suben y bajan más de 3 %', async () => {
    usar();
    render(<ConsumoNacionalVista />);
    await screen.findByText('LECHE ENTERA');
    const tarjeta = screen.getByText('Vs Septiembre 2026').closest('.placa')!;
    expect(tarjeta).toHaveTextContent('▲ 1 · ▼ 1');
  });

  it('sin comparación la tarjeta muestra un guion y no hay aviso de conjuntos distintos', async () => {
    usar((m) => datos(m, { sucursalesAnterior: 0 }));
    render(<ConsumoNacionalVista />);
    await screen.findByText('LECHE ENTERA');
    expect(screen.getByText('Vs Septiembre 2026').closest('.placa')).toHaveTextContent('—');
    expect(screen.queryByText(/▲/)).toBeNull();
    expect(screen.queryByText(/tienen el mes anterior calculado/)).toBeNull();
  });

  it('avisa cuando solo parte de las sucursales tiene el mes anterior calculado', async () => {
    usar((m) => datos(m, { sucursales: [namora, sucursal(514, 'Otra', 'Puebla')], sucursalesEsperadas: 2, sucursalesAnterior: 1 }));
    render(<ConsumoNacionalVista />);
    await screen.findByText('LECHE ENTERA');
    const aviso = screen.getByText(/1 de 2 sucursales tienen el mes anterior calculado/);
    expect(aviso).toHaveAttribute('role', 'status');
    expect(aviso).toHaveTextContent('el cambio se calcula solo con esas');
  });

  it('el KPI de sucursales muestra las calculadas contra las esperadas y las que faltan', async () => {
    usar((m) => datos(m, { sucursales: [namora, sucursal(514, 'Otra', 'Puebla')], sucursalesEsperadas: 5 }));
    render(<ConsumoNacionalVista />);
    await screen.findByText('LECHE ENTERA');
    const k = screen.getByText('Sucursales').closest('.placa')!;
    expect(k).toHaveTextContent('2 de 5');
    expect(k).toHaveTextContent('3 sin calcular');
  });

  it('con todas las sucursales calculadas no hay nota de faltantes', async () => {
    usar();
    render(<ConsumoNacionalVista />);
    await screen.findByText('LECHE ENTERA');
    const k = screen.getByText('Sucursales').closest('.placa')!;
    expect(k).toHaveTextContent('1 de 1');
    expect(k).not.toHaveTextContent('sin calcular');
  });

  it('la tarjeta contra el mes anterior nombra el mes del calendario aunque haya un hueco', async () => {
    usar((m) => datos(m, { meses: ['2026-10-01', '2026-08-01'], sucursalesAnterior: 0 }));
    render(<ConsumoNacionalVista />);
    await screen.findByText('LECHE ENTERA');
    expect(screen.getByText('Vs Septiembre 2026').closest('.placa')).toHaveTextContent('—');
    expect(screen.queryByText(/Vs Agosto 2026/)).toBeNull();
  });

  it('pulsar el mes activo no vuelve a pedir los datos', async () => {
    usar();
    render(<ConsumoNacionalVista />);
    await screen.findByText('LECHE ENTERA');
    const antes = fetchFalso.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Octubre 2026' }));
    expect(fetchFalso.mock.calls.length).toBe(antes);
    expect(screen.getByText('LECHE ENTERA')).toBeInTheDocument();
  });

  it('no avisa si el mes anterior tiene todas las sucursales', async () => {
    usar((m) => datos(m, { sucursales: [namora, sucursal(514, 'Otra', 'Puebla')], sucursalesEsperadas: 2, sucursalesAnterior: 2 }));
    render(<ConsumoNacionalVista />);
    await screen.findByText('LECHE ENTERA');
    expect(screen.queryByText(/tienen el mes anterior calculado/)).toBeNull();
  });

  it('avisa del mes incompleto, en singular y en plural', async () => {
    usar((m) => datos(m, { sucursales: [sucursal(513, 'Namóra', 'Guadalajara', false)] }));
    const { unmount } = render(<ConsumoNacionalVista />);
    await screen.findByText('LECHE ENTERA');
    expect(screen.getByText(/1 sucursal tiene días sin leer completos en Octubre 2026/)).toBeInTheDocument();
    unmount();
    usar((m) => datos(m, { sucursales: [sucursal(513, 'A', 'X', false), sucursal(514, 'B', 'Y', false)] }));
    render(<ConsumoNacionalVista />);
    await screen.findByText('LECHE ENTERA');
    expect(screen.getByText(/2 sucursales tienen días sin leer completos en Octubre 2026/)).toBeInTheDocument();
  });

  it('lista lo vendido sin receta', async () => {
    usar();
    render(<ConsumoNacionalVista />);
    await screen.findByText('LECHE ENTERA');
    expect(screen.getByText('Vendidos sin receta (no cuentan en el consumo)')).toBeInTheDocument();
    const item = screen.getByText('Sandwich').closest('li')!;
    expect(item).toHaveTextContent('1 u · 1 suc.');
  });

  it('sin meses calculados muestra el estado vacío', async () => {
    usar(() => ({ generadoEn: 'x', mes: null, meses: [], sucursales: [], insumos: [], sucursalesAnterior: 0, sucursalesEsperadas: 1 }));
    render(<ConsumoNacionalVista />);
    expect(await screen.findByText('Aún no hay meses calculados')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Mes' })).toBeNull();
  });

  it('nombre de mes en español', () => {
    expect(nombreMes('2026-10-01')).toBe('Octubre 2026');
  });
});

describe('VistasMexico', () => {
  it('Consumo pone ?vista=consumo en la URL y Ventas la quita', async () => {
    usar();
    window.history.replaceState(null, '', '/sucursales/mexico?otra=1');
    render(<VistasMexico vistaInicial="ventas" />);
    expect(screen.getByText('Vista de ventas')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Consumo' }));
    expect(window.location.search).toContain('vista=consumo');
    expect(window.location.search).toContain('otra=1');
    expect(screen.queryByText('Vista de ventas')).toBeNull();
    expect(await screen.findByText('LECHE ENTERA')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Ventas' }));
    expect(window.location.search).not.toContain('vista');
    expect(window.location.search).toContain('otra=1');
    expect(screen.getByText('Vista de ventas')).toBeInTheDocument();
  });
});
