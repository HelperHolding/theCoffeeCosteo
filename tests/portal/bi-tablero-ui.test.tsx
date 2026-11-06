import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const replace = vi.fn();
// La URL del navegador; una prueba la cambia para revisar las claves de fecha.
const nav = vi.hoisted(() => ({ qs: 'cafe=si' }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(nav.qs),
  useRouter: () => ({ replace }),
  usePathname: () => '/bi/the-coffee-mexico',
}));
import { TableroMexico } from '@/components/bi/tablero-mexico';

const tablero = {
  periodo: { desde: '2026-11-02', hasta: '2026-11-05' },
  hoy: '2026-11-05',
  opciones: {
    tiendas: [
      {
        company_id: 384,
        store_id: 301,
        nombre: 'Ventura',
        franquiciatario: null,
        tipo: 'Sucursales Propias',
      },
    ],
    franquiciatarios: [],
    tipos: [],
    categorias: [],
    grupos: [],
    productos: [],
    pagos: [],
    semanas: [],
    ultimo_corte: '2026-11-05T21:10:00Z',
    tiendas_sin_rappi: 1,
  },
  tablero: {
    cargas: { esperados: 4, con_carga: 3, incompletos: 0 },
    kpis: { venta_cent: 30000, venta_bruta_cent: 31000, tickets: 4, lineas: 6, unidades: 7 },
    por_grupo: [],
    por_cafe: [],
    por_master: [],
    por_fecha: [],
    por_dia: [],
    por_hora: [],
    por_pago: [],
    por_pago_tienda: [],
    por_tienda_dia: [{ company_id: 384, dow: 1, venta_cent: 30000, tickets: 4 }],
    promociones: [],
    ranking: [],
    fuentes: [],
  },
};
beforeEach(() => {
  nav.qs = 'cafe=si';
  global.fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          String(url).includes('tendencias')
            ? { hoy: '2026-11-05', tendencias: { por_mes: [], por_semana: [] } }
            : tablero,
        ),
        { status: 200 },
      ),
  ) as never;
});

describe('<TableroMexico>', () => {
  it('pide el tablero con los filtros y pinta números clave y avisos', async () => {
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getByText('Ventas Netas')).toBeTruthy());
    expect((global.fetch as any).mock.calls.map((c: unknown[]) => String(c[0]))).toEqual(
      expect.arrayContaining(['/api/bi/tablero?cafe=si', '/api/bi/tendencias?cafe=si']),
    );
    expect(screen.getByText(/Cobrado:/)).toBeTruthy();
    expect(screen.getByText(/Faltan 1 de 4 días de tienda/)).toBeTruthy();
    expect(screen.getByText(/Rappi de Zoho pendiente/)).toBeTruthy();
    expect(screen.getByText(/Disponible en F5/)).toBeTruthy();
    expect(screen.getByText('Ventura')).toBeTruthy();
  });

  it('sin tiendas que pasen los filtros: vacío claro, sin ceros', async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ ...tablero, tablero: null }), { status: 200 }),
    ) as never;
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getByText(/Ninguna de tus tiendas pasa estos filtros/)).toBeTruthy());
    expect(screen.queryByText('$0.00')).toBeNull();
  });
});

describe('<TableroMexico> con errores de lectura', () => {
  it('si el tablero falla sin cifras previas: error y Reintentar, nunca ceros', async () => {
    global.fetch = vi.fn(async (url: string) =>
      String(url).includes('tendencias')
        ? new Response(JSON.stringify({ hoy: '2026-11-05', tendencias: { por_mes: [], por_semana: [] } }), {
            status: 200,
          })
        : new Response(JSON.stringify({ error: 'La base no respondió.' }), { status: 500 }),
    ) as never;
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getByText(/La base no respondió/)).toBeTruthy());
    expect(screen.getAllByRole('button', { name: 'Reintentar' }).length).toBeGreaterThan(0);
    expect(screen.queryByText('Ventas Netas')).toBeNull();
    expect(screen.queryByText(/\$0/)).toBeNull();
  });

  it('si fallan las tendencias, solo ese bloque muestra el error', async () => {
    global.fetch = vi.fn(async (url: string) =>
      String(url).includes('tendencias')
        ? new Response(JSON.stringify({ error: 'Tendencias caídas.' }), { status: 500 })
        : new Response(JSON.stringify(tablero), { status: 200 }),
    ) as never;
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getByText(/Tendencias caídas/)).toBeTruthy());
    expect(screen.getByText('Ventas Netas')).toBeTruthy();
    expect(screen.getByText(/Ignoran las fechas y las semanas, como en Zoho/)).toBeTruthy();
  });

  it('la lectura de tendencias no lleva las claves de fecha; la del tablero, sí', async () => {
    nav.qs = 'fr=hoy&sem=W45%202026&cafe=si';
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getByText('Ventas Netas')).toBeTruthy());
    const urls = (global.fetch as any).mock.calls.map((c: unknown[]) => String(c[0])) as string[];
    expect(urls).toContain('/api/bi/tendencias?cafe=si');
    expect(urls.find((u) => u.startsWith('/api/bi/tablero?'))).toMatch(/fr=hoy.*sem=/);
  });

  it('con cifras previas, un error al reintentar las conserva con «No se pudo actualizar»', async () => {
    let fallar = false;
    global.fetch = vi.fn(async (url: string) =>
      String(url).includes('tendencias')
        ? new Response(JSON.stringify({ hoy: '2026-11-05', tendencias: { por_mes: [], por_semana: [] } }), {
            status: 200,
          })
        : fallar
          ? new Response(JSON.stringify({ error: 'La base no respondió.' }), { status: 500 })
          : new Response(JSON.stringify(tablero), { status: 200 }),
    ) as never;
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getByText('Ventas Netas')).toBeTruthy());
    fallar = true;
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar' }));
    await waitFor(() => expect(screen.getByText(/No se pudo actualizar \(hace/)).toBeTruthy());
    expect(screen.getByText('Ventas Netas')).toBeTruthy();
    expect(screen.getByText('Ventura')).toBeTruthy();
  });
});

describe('<TableroMexico> con datos en todos los bloques', () => {
  it('pinta gráficas, ranking (20 y «Ver todos») y tendencias por año', async () => {
    const ranking = Array.from({ length: 25 }, (_, i) => ({
      codigo: `P${i}`,
      nombre: `Producto ${i}`,
      mes: '2026-11-01',
      unidades: 1,
      venta_cent: 1000 + i,
      lineas: 1,
    }));
    const lleno = {
      ...tablero,
      tablero: {
        ...tablero.tablero,
        por_grupo: [
          { grupo: 'Bebida', venta_cent: 20000 },
          { grupo: 'Comida', venta_cent: 10000 },
        ],
        por_cafe: [{ cafe: 'Sí', venta_cent: 15000 }],
        por_master: [{ categoria: 'Fraps', venta_cent: 5000 }],
        por_fecha: [{ fecha: '2026-11-02', venta_cent: 30000, tickets: 4 }],
        por_dia: [{ dow: 1, venta_cent: 30000, tickets: 4 }],
        por_hora: [
          { hora: 8, venta_cent: 10000, tickets: 1 },
          { hora: 10, venta_cent: 20000, tickets: 3 },
        ],
        por_pago: [{ etiqueta: 'Tarjeta', venta_cent: 30000, tickets: 4 }],
        por_pago_tienda: [{ etiqueta: 'Tarjeta', company_id: 384, venta_cent: 30000 }],
        promociones: [{ company_id: 384, promocion: 'Promoción café', unidades: 2, venta_cent: 600 }],
        ranking,
      },
    };
    global.fetch = vi.fn(
      async (url: string) =>
        new Response(
          JSON.stringify(
            String(url).includes('tendencias')
              ? {
                  hoy: '2026-11-05',
                  tendencias: {
                    por_mes: [
                      { anio: 2025, mes: 11, venta_cent: 5000 },
                      { anio: 2026, mes: 11, venta_cent: 9000 },
                    ],
                    por_semana: [{ anio: 2026, semana: 45, venta_cent: 9000 }],
                  },
                }
              : lleno,
          ),
          { status: 200 },
        ),
    ) as never;
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getByText('Ventas por Año')).toBeTruthy());
    expect(screen.getByText('Producto 24')).toBeTruthy(); // el de mayor venta
    expect(screen.queryByText('Producto 0')).toBeNull(); // fuera de los 20 primeros
    fireEvent.click(screen.getByRole('button', { name: /Ver todos/ }));
    expect(screen.getByText('Producto 0')).toBeTruthy();
    expect(screen.getByRole('img', { name: /Venta neta por mes, una línea por año/ })).toBeTruthy();
    expect(
      screen.getByRole('img', { name: /Venta neta \(columnas\) y tickets \(línea\) por día/ }),
    ).toBeTruthy();
    expect(screen.getByText('Con café')).toBeTruthy();
  });
});
