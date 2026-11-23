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
  it('filtra por búsqueda y por "solo faltantes" (inventario contable ≤ 0, no el disponible)', async () => {
    render(
      <Inventario
        filas={
          [fila({}), fila({ sku: 'B', nombre: 'Vasos', inventario: 0, disponible: 99, fisico: 0 })] as never
        }
        valor={{ valor: 500, sinCosto: 0 }}
        viejos={[]}
        ultimoSync={null}
        hoy="2026-11-13"
        editable={false}
        autorizadores={[]}
        saldos3pl={{}}
        ventaAviso={null}
        aperturasMes={10}
      />,
    );
    expect(screen.getByText('Café')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Estatus'), 'faltantes');
    expect(screen.queryByText('Café')).not.toBeInTheDocument();
    expect(screen.getByText('Vasos')).toBeInTheDocument();
  });
  it('muestra "En camino" entre Inventario y Venta diaria, con los folios de OC', () => {
    render(
      <Inventario
        filas={
          [
            fila({ inventario: -6, camino: 25, ocsCamino: 'COM-OC-01342' }),
            fila({ sku: 'B', nombre: 'Vasos', inventario: 4, camino: 0, ocsCamino: '' }),
          ] as never
        }
        valor={{ valor: 0, sinCosto: 0 }}
        viejos={[]}
        ultimoSync={null}
        hoy="2026-11-23"
        editable={false}
        autorizadores={[]}
        saldos3pl={{}}
        ventaAviso={null}
        aperturasMes={10}
      />,
    );
    const encabezados = screen.getAllByRole('columnheader').map((th) => th.textContent?.trim());
    expect(encabezados.slice(0, 3)).toEqual(['Nombre', 'Inventario', 'En camino']);
    expect(encabezados[3]).toBe('Venta diaria');
    const celdas = screen.getAllByRole('row')[1].querySelectorAll('td');
    expect(celdas[2].textContent).toContain('25');
    expect(celdas[2].textContent).toContain('COM-OC-01342');
    expect(screen.getAllByRole('row')[2].querySelectorAll('td')[2].textContent).toBe('—');
  });
  it('el CSV trae En camino y los folios de OC', async () => {
    let blob: Blob | null = null;
    const crear = vi.fn((b: Blob) => ((blob = b), 'blob:x'));
    Object.assign(URL, { createObjectURL: crear, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(
      <Inventario
        filas={[fila({ inventario: -6, camino: 25, ocsCamino: 'COM-OC-01342' })] as never}
        valor={{ valor: 0, sinCosto: 0 }}
        viejos={[]}
        ultimoSync={null}
        hoy="2026-11-23"
        editable={false}
        autorizadores={[]}
        saldos3pl={{}}
        ventaAviso={null}
        aperturasMes={10}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Descargar CSV/ }));
    const texto = await (blob as unknown as Blob).text();
    const [encabezado, linea] = texto.replace(/^﻿/, '').split(/\r?\n/);
    expect(encabezado).toContain('Inventario (contable),En camino (OC abiertas),OC en camino,Venta diaria');
    expect(linea).toContain('-6,25,COM-OC-01342');
    click.mockRestore();
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
        ventaAviso={null}
        aperturasMes={10}
      />,
    );
    expect(screen.queryByRole('button', { name: /Ajustar 3PL/ })).not.toBeInTheDocument();
  });
});
