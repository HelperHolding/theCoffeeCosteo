// Inventario con el contable de Zoho, venta/día = venta de 30 días ÷ 30 sin aperturas, y cobertura = inventario ÷ venta.
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock('../../app/(comercializadora)/comercializadora/acciones', () => ({ ajustar3pl: vi.fn() }));
import {
  conCoberturaAperturas,
  conVentaContable,
  ventaDiaria30,
} from '../../lib/comercializadora/inventario';
import { Inventario } from '../../components/comercializadora/inventario';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';

const HOY = '2026-11-18';
const ped = (o: Record<string, unknown>) => ({
  id: String(Math.random()),
  apertura_id: 'S1',
  franquiciatario_email: 'franq@x.com',
  fecha_pedido: '2026-11-10T18:00:00Z',
  status: 'pagado',
  items: [{ sku: 'A', nombre: 'Café', cantidad: 6 }],
  items_editados: null,
  notas_shopify: null,
  es_llenado_canal: false,
  marketing_proyecto_id: null,
  ...o,
});
const base = (pedidos: unknown[], extra: Record<string, unknown> = {}) => ({
  cfg: normalizarCfgMotor({}),
  hoy: HOY,
  catalogo: [{ sku: 'A' }, { sku: 'B' }],
  mapa: [{ shopify_nombre: 'Vasos', sku: 'B' }],
  pedidosApertura: [] as { pedido_id: string }[],
  aperturas: [{ id: 'S1', estatus: 'activa', fecha: '2025-01-10' }],
  pedidos,
  ...extra,
});

describe('venta/día: venta de los últimos 30 días ÷ 30, sin aperturas', () => {
  it('suma resurtido, marketing, corporativo y llenado; mapea por nombre; divide entre 30', () => {
    const v = ventaDiaria30(
      base([
        ped({}), // resurtido: 6 de A
        ped({ marketing_proyecto_id: 'mk1' }), // marketing: cuenta
        ped({ es_llenado_canal: true }), // llenado: cuenta
        ped({ apertura_id: null, franquiciatario_email: 'workat@mx.thecoffee.jp' }), // corporativo: cuenta
        ped({ items: [{ nombre: 'Vasos', cantidad: 30 }] }), // B por mapeo de nombre
      ]) as never,
    );
    expect(v.A).toBe(0.8); // 24 ÷ 30
    expect(v.B).toBe(1);
  });

  it('no cuenta pedidos de apertura, cancelados ni de hace más de 30 días (día de CDMX)', () => {
    const v = ventaDiaria30(
      base(
        [
          ped({ id: 'ap1' }), // en pedidos_apertura
          ped({ notas_shopify: 'Pedido de apertura' }),
          ped({ status: 'cancelado' }),
          ped({ fecha_pedido: '2026-10-20T05:59:00Z' }), // 19-oct 23:59 CDMX: 30 días antes de hoy, fuera
          ped({ fecha_pedido: '2026-10-20T06:00:00Z' }), // 20-oct 00:00 CDMX: día 30, cuenta
        ],
        { pedidosApertura: [{ pedido_id: 'ap1' }] },
      ) as never,
    );
    expect(v.A).toBe(0.2); // solo el del 20-oct: 6 ÷ 30
  });

  it('un artículo sin venta queda en 0', () => {
    expect(ventaDiaria30(base([]) as never)).toEqual({});
  });
});

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
  camino: 4,
  minimo: 20,
  maximo: 40,
  minManual: false,
  maxManual: false,
  venta: 9,
  cobertura: 99,
  estado: 'rojo',
  tresPl: 0,
  costo: 50,
  ...o,
});

describe('cobertura con el contable', () => {
  it('inventario = contable; cobertura = inventario ÷ venta/día, redondeada, sin negativos', () => {
    const [a, b, c, d] = conVentaContable(
      [
        fila({}),
        fila({ sku: 'B', contable: -4 }),
        fila({ sku: 'C', contable: null }),
        fila({ sku: 'D', contable: 30 }),
      ] as never,
      { A: 0.8, B: 2, C: 1 },
    );
    expect([a.inventario, a.venta, a.cobertura]).toEqual([12, 0.8, 15]);
    expect([b.inventario, b.cobertura]).toEqual([-4, 0]);
    expect([c.inventario, c.cobertura]).toEqual([null, null]);
    expect([d.venta, d.cobertura]).toEqual([0, null]); // sin venta en 30 días: sin cobertura
  });

  it('sin la venta de los pedidos (puente caído): venta y cobertura sin dato', () => {
    const [a] = conVentaContable([fila({})] as never, null);
    expect([a.inventario, a.venta, a.cobertura]).toEqual([12, null, null]);
  });
});

describe('pantalla Inventario', () => {
  const props = {
    valor: { valor: 500, sinCosto: 0 },
    viejos: [],
    ultimoSync: null,
    hoy: HOY,
    editable: false,
    autorizadores: [],
    saldos3pl: {},
    ventaAviso: null,
    aperturasMes: 10,
  };
  it('solo Nombre (con el SKU debajo), Inventario, En camino, Venta/día y Cobertura', () => {
    const filas = conCoberturaAperturas(conVentaContable([fila({})] as never, { A: 0.8 }), {}, 10);
    render(<Inventario filas={filas} {...props} />);
    const encabezados = screen.getAllByRole('columnheader').map((h) => h.textContent);
    expect(encabezados).toEqual([
      'Nombre',
      'Inventario',
      'Físico (Informativo)',
      'En camino',
      'Llegada',
      'En borrador',
      'Venta diaria',
      'Cobertura (días)',
      'Cobertura c/aperturas (días)',
    ]);
    expect(screen.getByText('Café')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
    expect(screen.getAllByText('15')).toHaveLength(2); // sin kit, las dos coberturas son iguales
  });
  it('faltantes cuenta el inventario contable ≤ 0; avisa si no hay venta de los pedidos', () => {
    const filas = conCoberturaAperturas(
      conVentaContable(
        [fila({}), fila({ sku: 'B', nombre: 'Vasos', contable: 0, disponible: 99 })] as never,
        null,
      ),
      {},
      10,
    );
    render(
      <Inventario filas={filas} {...props} ventaAviso="No se pudieron leer los pedidos del sitio viejo." />,
    );
    // La tarjeta: etiqueta y su valor (1: solo B tiene inventario contable ≤ 0; A tiene disponible 10 pero no importa).
    expect(screen.getByText('Faltantes (inventario ≤ 0)').parentElement?.parentElement?.textContent).toMatch(
      /\(inventario ≤ 0\)1$/,
    );
    expect(screen.getByRole('alert').textContent).toContain('No se pudieron leer los pedidos');
  });
});
