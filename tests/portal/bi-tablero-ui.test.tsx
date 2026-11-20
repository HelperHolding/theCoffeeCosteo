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
const COMPARACION_OK = {
  periodo: { desde: '2026-10-26', hasta: '2026-10-29' },
  horaCorte: null,
  kpis: { venta_cent: 25000, venta_bruta_cent: 26000, tickets: 5, lineas: 6, unidades: 7 },
  cargas: { esperados: 4, con_carga: 4, incompletos: 0 },
};
const comparacion = { valor: COMPARACION_OK as unknown };
beforeEach(() => {
  nav.qs = 'cafe=si';
  comparacion.valor = { ...COMPARACION_OK };
  global.fetch = vi.fn(
    async (url: string) =>
      new Response(
        JSON.stringify(
          String(url).includes('/api/bi/kpis')
            ? comparacion.valor
            : String(url).includes('tendencias')
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
    expect(screen.getByText(/El Rappi de Zoho todavía no se carga/)).toBeTruthy();
    // Sin metas cargadas: «Sin datos», sin códigos internos de fase a la vista.
    expect(screen.getAllByText('Sin datos').length).toBeGreaterThan(0);
    expect(screen.queryByText(/\bF[345](\.1)?\b/)).toBeNull();
    expect(screen.getByText('Ventura')).toBeTruthy();
  });

  it('con metas y P.E.: cumplimiento de los días con corte, diferencia y meta por tienda', async () => {
    nav.qs = 'tiendas=384';
    const metas = {
      tiendas: 1, tiendas_con_meta: 1, dias_sin_meta: 2,
      meta_cent: 70000, meta_tickets: 7, meta_corriente_cent: 40000, meta_tickets_corriente: 4,
      venta_corriente_cent: 30000, tickets_corriente: 4,
      por_tienda: [{ company_id: 384, meta_cent: 70000, meta_corriente_cent: 40000, venta_corriente_cent: 30000 }],
      tiendas_con_pe: 1, pe_cent: 20000, pe_corriente_cent: 10000, venta_pe_corriente_cent: 30000,
      pe_por_tienda: [{ company_id: 384, pe_cent: 20000, pe_corriente_cent: 10000, venta_corriente_cent: 30000 }],
    };
    global.fetch = vi.fn(async (url: string) =>
      new Response(
        JSON.stringify(
          String(url).includes('tendencias')
            ? { hoy: '2026-11-05', tendencias: { por_mes: [], por_semana: [] } }
            : { ...tablero, tablero: { ...tablero.tablero, metas } },
        ),
        { status: 200 },
      ),
    ) as never;
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getByText('Cumplimiento')).toBeTruthy());
    expect(screen.queryByText('Sin datos')).toBeNull();
    expect(screen.getByText(/Diferencia vs meta: −\$100\.00/)).toBeTruthy();
    expect(screen.getByText(/Excedente sobre el P\.E\.: \+\$200\.00/)).toBeTruthy();
    expect(screen.getByText(/2 días de tienda del periodo sin meta cargada/)).toBeTruthy();
    // Meta de Ventura en la tabla por tienda (y en su grupo): meta del periodo y 75 % de cumplimiento.
    expect(screen.getAllByText('$700.00').length).toBeGreaterThanOrEqual(2);
  });

  it('con un filtro de producto, pago, hora o monto la meta no se compara', async () => {
    const metas = {
      tiendas: 1, tiendas_con_meta: 1, dias_sin_meta: 0,
      meta_cent: 70000, meta_tickets: 7, meta_corriente_cent: 40000, meta_tickets_corriente: 4,
      venta_corriente_cent: 30000, tickets_corriente: 4,
      por_tienda: [{ company_id: 384, meta_cent: 70000, meta_corriente_cent: 40000, venta_corriente_cent: 30000 }],
      tiendas_con_pe: 0, pe_cent: 0, pe_corriente_cent: 0, venta_pe_corriente_cent: 0, pe_por_tienda: [],
    };
    global.fetch = vi.fn(async (url: string) =>
      new Response(
        JSON.stringify(
          String(url).includes('tendencias')
            ? { hoy: '2026-11-05', tendencias: { por_mes: [], por_semana: [] } }
            : { ...tablero, tablero: { ...tablero.tablero, metas } },
        ),
        { status: 200 },
      ),
    ) as never;
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getByText(/con el filtro de café no se\s+comparan/)).toBeTruthy());
    expect(screen.queryByText('Cumplimiento')).toBeNull();
    expect(screen.getByText('Meta del periodo')).toBeTruthy();
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
      screen.getByRole('img', { name: /Venta neta \(columnas\) y tickets \(línea\) por día\./ }),
    ).toBeTruthy();
    expect(screen.getAllByText('Ticket promedio').length).toBeGreaterThan(0);
    expect(screen.getByText('Con café')).toBeTruthy();
  });
});

describe('<TableroMexico> con periodo rechazado (400)', () => {
  it('apunta al filtro y no ofrece Reintentar', async () => {
    global.fetch = vi.fn(async (url: string) =>
      String(url).includes('tendencias')
        ? new Response(JSON.stringify({ hoy: '2026-11-05', tendencias: { por_mes: [], por_semana: [] } }), { status: 200 })
        : new Response(JSON.stringify({ error: 'El periodo no es válido.' }), { status: 400 }),
    ) as never;
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getByText(/Revisa el filtro Rango de Fechas/)).toBeTruthy());
    expect(screen.getByText(/El periodo no es válido/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull();
  });
});

describe('<TableroMexico> comparación de KPI', () => {
  it('pide /api/bi/kpis con los mismos filtros y pinta ▲/▼ contra el periodo anterior', async () => {
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getByText(/▲ 20\.0/)).toBeTruthy()); // venta 300.00 vs 250.00
    expect((global.fetch as any).mock.calls.map((c: unknown[]) => String(c[0]))).toContain('/api/bi/kpis?cafe=si');
    expect(screen.getByText(/▼ 20\.0/)).toBeTruthy(); // tickets 4 vs 5
    expect(screen.getAllByText(/lun 26 de oct.*jue 29 de oct/).length).toBeGreaterThan(0);
  });

  it('días faltantes en el periodo anterior: «Sin comparación: faltan días»', async () => {
    comparacion.valor = { ...COMPARACION_OK, cargas: { esperados: 4, con_carga: 3, incompletos: 0 } };
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getAllByText(/Sin comparación: faltan días/).length).toBe(5));
  });

  it('periodo anterior sin venta: «Sin comparación», nunca infinito', async () => {
    comparacion.valor = { ...COMPARACION_OK, kpis: { venta_cent: 0, venta_bruta_cent: 0, tickets: 0, lineas: 0, unidades: 0 } };
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getAllByText('Sin comparación').length).toBe(5));
    expect(screen.queryByText(/∞|Infinity|NaN/)).toBeNull();
  });

  it('con filtro de semanas lo dice', async () => {
    comparacion.valor = { sinComparacion: 'semanas' };
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getAllByText('Sin comparación con filtro de semanas').length).toBe(5));
  });
});
