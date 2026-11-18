import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Inicio } from '../../components/comercializadora/inicio';
import { armarInicio } from '../../lib/comercializadora/inicio';

const base = {
  hoy: '2026-11-13',
  catalogo: [
    {
      sku: 'A',
      nombre: 'Café',
      estatus: 'Activo',
      categoria: 'Insumos',
      created_at: null,
      costo_unitario: 10,
      saldo_cedis: 0,
      zoho_stock: null,
      zoho_stock_fisico: null,
      zoho_sync_at: null,
    },
  ] as never,
  porEnviar: [],
  ventas90: [],
  compras: [
    {
      id: '1',
      folio: 'OC-9',
      fecha: '2026-11-02',
      sku: 'A',
      cantidad: 5,
      cantidad_recibida: 0,
      monto: 30,
      destino: 'Yulius',
      fecha_arribo: '2026-11-14',
      proveedor: 'P',
      estado: null,
    },
  ],
  leadTimes: [],
  mermas: [],
};

describe('Inicio', () => {
  it('muestra ventas, compras y %, las OCs próximas y los pedidos activos', () => {
    const r = armarInicio({
      ...base,
      pedidos: [{ fecha_pedido: '2026-11-05T18:00:00Z', monto: 60, items: null }],
    });
    render(
      <Inicio
        r={r}
        ventas
        hoy="2026-11-13"
        pedidos={{
          total: 1,
          top: [
            {
              id: 'p1',
              numero: '#1001',
              status: 'pagado',
              sucursal: 'Polanco',
              monto: 60,
              fecha: '2026-11-05',
            },
          ],
        }}
      />,
    );
    expect(screen.getByText('Ventas facturadas (mes)')).toBeInTheDocument();
    expect(screen.getAllByText('50%').length).toBe(2); // KPI y fila del mes en la tendencia
    expect(screen.getByText(/1 OC con arribo en los próximos 7 días/)).toBeInTheDocument();
    expect(screen.getByText('#1001')).toBeInTheDocument();
    expect(screen.getByText('Polanco')).toBeInTheDocument();
    expect(screen.getAllByText('Mañana').length).toBeGreaterThan(0);
  });

  it('si el puente no respondió, avisa y no muestra ventas ni % (sin números falsos)', () => {
    const r = armarInicio({ ...base, pedidos: null });
    render(<Inicio r={r} ventas={false} hoy="2026-11-13" pedidos={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/No se pudieron leer los pedidos del sitio viejo/);
    expect(screen.queryAllByText('50%')).toHaveLength(0);
    expect(screen.getAllByText('Sin stock').length).toBeGreaterThan(0); // KPI y panel siguen
  });
});
