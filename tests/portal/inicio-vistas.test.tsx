import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  VistaBi,
  VistaComercializadora,
  VistaCosteo,
  VistaCrm,
  VistaFranquiciatarios,
} from '../../components/inicio/vistas';

vi.mock('next/navigation', () => ({ usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));

describe('bloques de Inicio', () => {
  it('BI: venta del mes, cambio contra el mes anterior y barras comparativas', () => {
    render(
      <VistaBi
        d={{
          desde: '2026-11-01',
          hasta: '2026-11-23',
          tiendas: 79,
          actual: { ventaCent: 110_000_00, tickets: 1000, ticketCent: 11_000, upt: 1.4 },
          anterior: { ventaCent: 100_000_00, tickets: 950, ticketCent: 10_526, upt: 1.38 },
        }}
      />,
    );
    const b = screen.getByRole('region', { name: 'BI' });
    expect(within(b).getAllByText('$110,000').length).toBeGreaterThan(0);
    expect(within(b).getByText(/10\.0 %/)).toBeInTheDocument();
    expect(within(b).getByRole('img', { name: /semana anterior/ })).toBeInTheDocument();
    expect(within(b).getByRole('link', { name: /Abrir/ })).toHaveAttribute('href', '/bi');
  });

  it('BI sin base completa del mes anterior: no inventa el cambio', () => {
    render(
      <VistaBi
        d={{
          desde: '2026-11-01',
          hasta: '2026-11-23',
          tiendas: 3,
          actual: { ventaCent: 5_000_00, tickets: 10, ticketCent: 50_000, upt: null },
          anterior: null,
        }}
      />,
    );
    expect(screen.getByText(/sin base completa/)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /semana anterior/ })).toBeNull();
  });

  it('Costeo: food cost, salud del menú y los productos con menor margen', () => {
    render(
      <VistaCosteo
        d={{
          productos: 114,
          foodCost: 0.268,
          objetivo: 0.55,
          salud: { ok: 78, bajo: 21, pierde: 9, 'sin-precio': 6 },
          canales: [{ nombre: 'Mostrador', margen: 0.66 }],
          peores: [{ producto: 'Croque', tamano: 'Único', margen: -0.04 }],
        }}
      />,
    );
    expect(screen.getByText('26.8 %')).toBeInTheDocument();
    expect(screen.getByText('114 productos activos')).toBeInTheDocument();
    expect(screen.getByText('-4 %')).toBeInTheDocument();
  });

  it('CRM, Comercializadora y Franquiciatarios abren su módulo', () => {
    render(
      <>
        <VistaCrm
          d={{
            total: 10,
            etapas: [{ nombre: 'Prospecto', cards: 4 }],
            bloqueadas: 3,
            listas: 1,
            vencen14: 2,
            vencidas: 0,
            proximas: [{ tienda: 'Juriquilla', titulo: 'Apertura', dias: 0 }],
          }}
        />
        <VistaComercializadora d={{ proyeccion: null, cierres: [], ov: null }} />
        <VistaFranquiciatarios
          d={{
            dia: '2026-11-23',
            mas: 0,
            sucursales: [
              {
                companyId: 514,
                nombre: 'Essentia',
                incidencias: 0,
                secciones: [
                  { clave: 'apertura', nombre: 'Apertura', avance: 0.5, estado: 'en-curso', noes: 0 },
                ],
              },
            ],
          }}
        />
      </>,
    );
    expect(screen.getByText('hoy')).toBeInTheDocument();
    expect(screen.getByText('Sin proyección calculada')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Essentia, Apertura: 50 %' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Essentia' })).toHaveAttribute('href', '/franquiciatarios/514');
    const hrefs = screen.getAllByRole('link', { name: /Abrir/ }).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/crm', '/comercializadora', '/franquiciatarios']);
  });
});
