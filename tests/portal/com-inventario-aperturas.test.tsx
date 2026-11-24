// Cobertura con aperturas = inventario ÷ (venta/día + kit por apertura × aperturas por mes ÷ 30).
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock('../../app/(comercializadora)/comercializadora/acciones', () => ({ ajustar3pl: vi.fn() }));
import { conCoberturaAperturas, conVentaContable } from '../../lib/comercializadora/inventario';
import { Inventario } from '../../components/comercializadora/inventario';

const fila = (o: Record<string, unknown>) => ({
  sku: 'A',
  nombre: 'Café',
  categoria: 'Insumos',
  estatus: 'Activo',
  proveedor: 'Prov',
  fisico: 10,
  contable: 100,
  comprometido: 0,
  disponible: 10,
  camino: 0,
  minimo: null,
  maximo: null,
  minManual: false,
  maxManual: false,
  venta: 0,
  cobertura: null,
  estado: null,
  tresPl: 0,
  costo: 50,
  ...o,
});

describe('cobertura con aperturas', () => {
  it('suma a la venta/día el kit × aperturas por mes ÷ 30', () => {
    const [a] = conCoberturaAperturas(conVentaContable([fila({})] as never, { A: 2 }), { A: 6 }, 10);
    // demanda = 2 + 6 × 10 / 30 = 4 → 100 ÷ 4 = 25
    expect([a.cobertura, a.kitApertura, a.coberturaAperturas]).toEqual([50, 6, 25]);
  });

  it('sin kit es igual a la cobertura; sin venta pero con kit, solo cuenta el kit', () => {
    const [a, b] = conCoberturaAperturas(
      conVentaContable([fila({}), fila({ sku: 'B', contable: 20 })] as never, { A: 2 }),
      { B: 3 },
      10,
    );
    expect(a.coberturaAperturas).toBe(50);
    expect(b.coberturaAperturas).toBe(20); // 20 ÷ (0 + 3 × 10 / 30)
  });

  it('sin demanda, sin inventario o sin venta de los pedidos: sin dato; negativos en 0', () => {
    const filas = conCoberturaAperturas(
      conVentaContable(
        [fila({}), fila({ sku: 'B', contable: null }), fila({ sku: 'C', contable: -5 })] as never,
        { B: 1, C: 1 },
      ),
      { C: 3 },
      10,
    );
    expect(filas.map((f) => f.coberturaAperturas)).toEqual([null, null, 0]);
    const [sinPedidos] = conCoberturaAperturas(conVentaContable([fila({})] as never, null), { A: 6 }, 10);
    expect(sinPedidos.coberturaAperturas).toBeNull();
  });

  it('cero aperturas por mes deja la misma cobertura', () => {
    const [a] = conCoberturaAperturas(conVentaContable([fila({})] as never, { A: 2 }), { A: 6 }, 0);
    expect(a.coberturaAperturas).toBe(a.cobertura);
  });
});

describe('pantalla Inventario con aperturas', () => {
  it('muestra la columna con las aperturas por mes que usa', () => {
    const filas = conCoberturaAperturas(conVentaContable([fila({})] as never, { A: 2 }), { A: 6 }, 10);
    render(
      <Inventario
        filas={filas}
        aperturasMes={10}
        valor={{ valor: 0, sinCosto: 0 }}
        viejos={[]}
        ultimoSync={null}
        hoy="2026-11-18"
        editable={false}
        autorizadores={[]}
        saldos3pl={{}}
        ventaAviso={null}
      />,
    );
    const encabezados = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(encabezados).toEqual([
      'Nombre',
      'Inventario',
      'Físico (Informativo)',
      'En camino',
      'Venta diaria',
      'Cobertura (días)',
      'Cobertura c/aperturas (días)',
    ]);
    expect(screen.getByText('25')).toBeTruthy();
    expect(screen.getByText(/10 aperturas al mes/)).toBeTruthy();
  });
});
