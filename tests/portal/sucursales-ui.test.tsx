import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));
const ruta = vi.hoisted(() => ({ actual: '/sucursales' }));
vi.mock('next/navigation', () => ({
  usePathname: () => ruta.actual,
  useSearchParams: () => new URLSearchParams(),
}));

import { Navegacion } from '../../components/portal/navegacion';
import { VentasPos } from '../../components/sucursales/ventas-pos';
import { EnVivo } from '../../components/sucursales/en-vivo';
import { Pedidos } from '../../components/sucursales/pedidos';
import {
  __reiniciarParaPruebas,
  construirPedidos,
  construirVivo,
  sucursalInfo,
} from '../../lib/sucursales/datos';
import { configDe } from '../../lib/sucursales/config';
import type { RespuestaPedidos, RespuestaVivo } from '../../lib/sucursales/contratos';
import { apiFalsa, pedido } from './sucursales-fixtures';

const cfg = configDe(612)!;
const AHORA = Date.UTC(2026, 9, 22, 18, 0, 0);
let vivoTodos: RespuestaVivo;
let vivoApp: RespuestaVivo;
let pedidos30: RespuestaPedidos;
let pedidos30p2: RespuestaPedidos;

beforeAll(async () => {
  const datos = {
    '2026-10-22': [
      pedido('2026-10-22', '08:00:00'),
      pedido('2026-10-22', '11:30:00', { fromSmartphone: true, paymentMethod: 'VIRTUAL_WALLET' }),
    ],
    '2026-10-15': [pedido('2026-10-15', '09:00:00')],
    '2026-10-20': Array.from({ length: 30 }, (_, i) =>
      pedido('2026-10-20', `09:${String(i).padStart(2, '0')}:00`),
    ),
  };
  __reiniciarParaPruebas({
    fetch: apiFalsa(datos).fetch,
    esperar: async () => {},
    ahora: () => AHORA,
    token: () => 't',
  });
  vivoTodos = await construirVivo(cfg, 'todos');
  vivoApp = await construirVivo(cfg, 'app');
  pedidos30 = await construirPedidos(cfg, '2026-10-20', '2026-10-20', 'todos', null, 1);
  pedidos30p2 = await construirPedidos(cfg, '2026-10-20', '2026-10-20', 'todos', null, 2);
});

type Pendiente = { url: string; resolver: (r: Response) => void };
let pendientes: Pendiente[];
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  pendientes = [];
  fetchMock = vi.fn((url: string) => new Promise<Response>((resolver) => pendientes.push({ url, resolver })));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const responder = async (i: number, cuerpo: unknown, status = 200) => {
  await act(async () => pendientes[i].resolver(Response.json(cuerpo, { status })));
};

it('la navegación de Sucursales muestra su directorio y el regreso a los otros módulos', () => {
  render(<Navegacion seccion="sucursales" visibles={['costeo', 'crm', 'sucursales']} />);
  expect(screen.getByRole('link', { name: 'Directorio' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'CRM Franquicias' })).toHaveAttribute('href', '/crm');
  expect(screen.queryByRole('link', { name: 'Sucursales' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Insumos' })).toBeNull();
});

describe('En vivo', () => {
  it('muestra KPIs, comparativo, rótulos de alcance y la nota de unidades estimadas', async () => {
    render(<VentasPos sucursal={sucursalInfo(cfg)} tabInicial="vivo" origenInicial="todos" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText('POS · API The Coffee · MXN')).toBeInTheDocument();
    expect(screen.getByText('Sin Rappi (ver apartado Rappi)')).toBeInTheDocument();
    await responder(0, vivoTodos);
    expect(screen.getByText('Venta cobrada hoy')).toBeInTheDocument();
    expect(screen.getAllByText('$330').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/vs jueves 15 oct a las 12:00/)).toHaveLength(3);
    expect(screen.getAllByText('100.0%').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText(/una línea por unidad; pendiente de confirmar/).length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: /Venta acumulada por hora/ })).toBeInTheDocument();
  });

  it('cambiar el origen descarta los datos anteriores y una respuesta tardía no los repone', async () => {
    render(<VentasPos sucursal={sucursalInfo(cfg)} tabInicial="vivo" origenInicial="todos" />);
    fireEvent.click(screen.getByRole('radio', { name: 'App The Coffee' }));
    // La petición de "todos" quedó sin responder; la de "app" sale con su propia clave.
    expect(pendientes.map((p) => p.url)).toEqual([
      '/api/sucursales/612/vivo?origen=todos',
      '/api/sucursales/612/vivo?origen=app',
    ]);
    await responder(0, vivoTodos);
    expect(screen.queryAllByText('$330')).toHaveLength(0);
    expect(screen.queryByText('Venta cobrada hoy')).toBeNull();
    await responder(1, vivoApp);
    expect(screen.getAllByText('$165').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('$330')).toHaveLength(0);
  });

  it('un error del portal o del proveedor nunca se muestra como venta cero', async () => {
    render(<EnVivo companyId={612} origen="todos" />);
    await responder(0, { error: 'La API The Coffee no respondió correctamente.' }, 500);
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron leer las ventas');
    expect(screen.getByRole('alert')).toHaveTextContent('Esto no significa que no haya ventas');
    expect(screen.queryByText('$0')).toBeNull();
  });

  it('error de lectura de hoy dentro de la respuesta: sin KPIs, con estado explícito', async () => {
    render(<EnVivo companyId={612} origen="todos" />);
    const conError: RespuestaVivo = {
      ...vivoTodos,
      lecturas: {
        ...vivoTodos.lecturas,
        hoy: {
          ...vivoTodos.lecturas.hoy,
          estado: 'error',
          error: 'La API The Coffee tardó demasiado en responder.',
          avisos: [],
        },
      },
    };
    await responder(0, conError);
    expect(screen.getByText('Sin conexión con la API')).toBeInTheDocument();
    expect(screen.queryByText('Venta cobrada hoy')).toBeNull();
    expect(screen.getByText(/Hoy: sin datos/)).toBeInTheDocument();
  });

  it('sin acceso (404) borra los datos y no ofrece reintentar', async () => {
    render(<EnVivo companyId={612} origen="todos" />);
    await responder(0, { error: 'Sucursal no disponible.' }, 404);
    expect(screen.getByRole('alert')).toHaveTextContent('Sin acceso a esta sucursal');
    expect(within(screen.getByRole('alert')).queryByRole('button')).toBeNull();
  });

  it('refresca cada 60 s solo con la pestaña visible y sin solapar peticiones', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    render(<EnVivo companyId={612} origen="todos" />);
    await responder(0, vivoTodos);
    const visibilidad = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    act(() => vi.advanceTimersByTime(60_000));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    visibilidad.mockReturnValue('visible');
    act(() => vi.advanceTimersByTime(60_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Con una petición en vuelo, el siguiente tick no lanza otra.
    act(() => vi.advanceTimersByTime(60_000));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await responder(1, vivoTodos);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('Pedidos', () => {
  it('pagina de 25 en 25 y abre el detalle con líneas y personalizaciones', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(AHORA);
    render(<Pedidos companyId={612} origen="todos" zona={cfg.zona} />);
    await waitFor(() => expect(pendientes).toHaveLength(1));
    expect(pendientes[0].url).toContain('desde=2026-10-22');
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-20' } });
    const ultima = pendientes.length - 1;
    expect(pendientes[ultima].url).toContain('desde=2026-10-20&hasta=2026-10-20');
    await responder(ultima, pedidos30);
    expect(screen.getByText('1–25 de 30')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(pendientes.at(-1)!.url).toContain('pagina=2');
    await responder(pendientes.length - 1, pedidos30p2);
    expect(screen.getByText('26–30 de 30')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /^Ver/ })[0]);
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('Matcha Iced Latte');
    expect(dialogo).toHaveTextContent('Oatmilk+$13.00');
    vi.restoreAllMocks();
  });

  it('periodo inválido: aviso y ninguna petición', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(AHORA);
    render(<Pedidos companyId={612} origen="todos" zona={cfg.zona} />);
    const antes = fetchMock.mock.calls.length;
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    expect(screen.getByRole('alert')).toHaveTextContent('hasta 7 días');
    expect(fetchMock.mock.calls.length).toBe(antes);
    vi.restoreAllMocks();
  });
});
