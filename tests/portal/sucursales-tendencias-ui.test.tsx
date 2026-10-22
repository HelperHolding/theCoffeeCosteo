import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

import { Tendencias } from '../../components/sucursales/tendencias';
import { __reiniciarParaPruebas, construirTendencias } from '../../lib/sucursales/datos';
import { configDe } from '../../lib/sucursales/config';
import type { RespuestaTendencias } from '../../lib/sucursales/contratos';
import { apiFalsa, pedido } from './sucursales-fixtures';

let respuesta: RespuestaTendencias;
beforeAll(async () => {
  const api = apiFalsa({
    '2026-09-29': [pedido('2026-09-29', '09:00:00')],
    '2026-10-06': [pedido('2026-10-06', '09:00:00')],
    '2026-10-13': [pedido('2026-10-13', '09:00:00'), pedido('2026-10-13', '10:00:00')],
  });
  __reiniciarParaPruebas({
    fetch: (async (u: RequestInfo | URL, i?: RequestInit) =>
      String(u).includes('dateStart=2026-09-21')
        ? new Response('', { status: 503 })
        : api.fetch(u, i)) as typeof fetch,
    esperar: async () => {},
    ahora: () => Date.UTC(2026, 9, 22, 18, 0, 0),
    token: () => 't',
  });
  respuesta = await construirTendencias(configDe(612)!, 4, 'todos');
});

type Pendiente = { url: string; resolver: (r: Response) => void };
let pendientes: Pendiente[];
beforeEach(() => {
  pendientes = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => new Promise<Response>((resolver) => pendientes.push({ url, resolver }))),
  );
});
afterEach(() => vi.unstubAllGlobals());

it('muestra cobertura, semana parcial, mapa de calor accesible y cambia a 8 semanas con su propia clave', async () => {
  render(<Tendencias companyId={612} origen="todos" />);
  expect(pendientes[0].url).toBe('/api/sucursales/612/tendencias?semanas=4&origen=todos');
  await act(async () => pendientes[0].resolver(Response.json(respuesta)));
  expect(screen.getByText(/3 de 4 semanas completas/)).toBeInTheDocument();
  expect(screen.getAllByText('parcial').length).toBeGreaterThan(0);
  expect(screen.getByRole('grid', { name: /Pedidos promedio por día y hora/ })).toBeInTheDocument();
  expect(screen.getByRole('gridcell', { name: /Mar 10:00, 0\.3 pedidos en promedio/ })).toBeInTheDocument();
  expect(screen.getByText(/Lectura incompleta:/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '8 semanas' }));
  expect(pendientes.at(-1)!.url).toBe('/api/sucursales/612/tendencias?semanas=8&origen=todos');
  // Mientras llega la nueva clave no se muestran las cifras de la anterior.
  expect(screen.queryByText(/3 de 4 semanas completas/)).toBeNull();
});

it('directorio: la tarjeta lee "hoy" de su sucursal y un error no se muestra como venta cero', async () => {
  const { TarjetaHoy } = await import('../../components/sucursales/tarjeta-hoy');
  render(<TarjetaHoy companyId={583} nombre="Bonampak" ciudad="Cancún" tienda={498} />);
  expect(pendientes[0].url).toBe('/api/sucursales/583/vivo?origen=todos');
  await act(async () => pendientes[0].resolver(Response.json({ error: 'x' }, { status: 503 })));
  expect(screen.getByText(/Sin datos de hoy \(error de lectura, no es venta cero\)/)).toBeInTheDocument();
  expect(screen.queryByText('$0')).toBeNull();
});
