import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { consultasVentas } from '../../lib/mcp/ventas';
import { sucursalesConfiguradas } from '../../lib/sucursales/config';
import { ErrorConsulta } from '../../lib/mcp/consulta';
import type { Db } from '../../lib/portal/consultas';

const [A, B] = sucursalesConfiguradas.slice(0, 2).map((s) => s.companyId);
const SIN_CONFIG = 999999;
const rpc = vi.fn();
const db = { rpc } as unknown as Db;
const herramienta = (nombre: string) => consultasVentas(db).find((c) => c.nombre === nombre)!;
const autorizado = (sucursales: { company_id: number; modulos: string[]; nombre_bi?: string | null }[]) => ({
  client_id: 'grok',
  autorizado: true,
  sucursales: sucursales.map((s) => ({ nombre_bi: null, ...s })),
});
const respuestas = (r: Record<string, unknown>) =>
  rpc.mockImplementation(async (fn: string) => ({
    data: r[fn] ?? null,
    error: r[fn] ? null : { message: fn },
  }));
const tot = (venta_cent: number, pedidos = 1) => ({
  pedidos,
  venta_cent,
  descuento_cent: 0,
  lineas: pedidos,
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-19T18:00:00Z'));
  rpc.mockReset();
});
afterEach(() => vi.useRealTimers());

it('cliente no autorizado: error con su client_id', async () => {
  respuestas({ mcp_ventas_sucursales: { client_id: 'abc-123', autorizado: false, sucursales: [] } });
  const e = await herramienta('ventas_sucursales')
    .ejecutar({})
    .catch((x) => x);
  expect(e).toBeInstanceOf(ErrorConsulta);
  expect(e.message).toContain('abc-123');
});

it('ventas_sucursales: nombre, ciudad y zona de la configuración; nombre BI si no está configurada', async () => {
  respuestas({
    mcp_ventas_sucursales: autorizado([
      { company_id: A, modulos: ['sucursales', 'bi'] },
      { company_id: SIN_CONFIG, modulos: ['bi'], nombre_bi: 'Tienda BI' },
    ]),
  });
  const r = (await herramienta('ventas_sucursales').ejecutar({})) as any;
  expect(r.sucursales[0]).toMatchObject({ company_id: A, modulos: ['sucursales', 'bi'] });
  expect(r.sucursales[0].zona).toBeTruthy();
  expect(r.sucursales[1]).toEqual({
    company_id: SIN_CONFIG,
    nombre: 'Tienda BI',
    ciudad: null,
    zona: null,
    modulos: ['bi'],
  });
});

it('ventas_resumen sin fechas: hoy en vivo por sucursal en pesos; sin configuración va a ignoradas', async () => {
  respuestas({
    mcp_ventas_sucursales: autorizado([
      { company_id: A, modulos: ['sucursales'] },
      { company_id: SIN_CONFIG, modulos: ['sucursales'] },
    ]),
    sucursales_tablero_hoy: {
      ultimo_corte: '2026-11-19T17:50:00Z',
      dias: [
        {
          company_id: A,
          fecha: '2026-11-19',
          hoy: true,
          leido_en: 'x',
          corte_segundo: 43200,
          completa: true,
          origenes: { mostrador: tot(25050, 3) },
          horas: {},
          tramos: null,
        },
      ],
    },
  });
  const r = (await herramienta('ventas_resumen').ejecutar({})) as any;
  const [, args] = rpc.mock.calls.find(([fn]) => fn === 'sucursales_tablero_hoy')!;
  expect(args.p_companias).toEqual([A]);
  expect(args.p_hoys).toHaveLength(1);
  expect(r.modo).toBe('hoy');
  expect(r.ignoradas).toEqual([SIN_CONFIG]);
  expect(r.sucursales[0]).toMatchObject({ company_id: A, completa: true, corte_segundo: 43200 });
  expect(r.sucursales[0].hoy.mostrador.venta).toBe(250.5);
});

it('ventas_resumen con fechas agrupa por sucursal (por omisión) y suma canales', async () => {
  respuestas({
    mcp_ventas_sucursales: autorizado([
      { company_id: A, modulos: ['sucursales'] },
      { company_id: B, modulos: ['sucursales'] },
    ]),
    mcp_ventas_dias: [
      {
        company_id: A,
        fecha: '2026-11-10',
        completa: true,
        corte_segundo: 86400,
        origenes: { mostrador: tot(10000), rappi: tot(5000) },
      },
      {
        company_id: A,
        fecha: '2026-11-11',
        completa: false,
        corte_segundo: 86400,
        origenes: { mostrador: tot(2000) },
      },
      {
        company_id: B,
        fecha: '2026-11-10',
        completa: true,
        corte_segundo: 86400,
        origenes: { app: tot(700) },
      },
    ],
  });
  const r = (await herramienta('ventas_resumen').ejecutar({
    desde: '2026-11-10',
    hasta: '2026-11-11',
  })) as any;
  expect(r.agrupar).toBe('sucursal');
  const a = r.datos.find((x: any) => x.company_id === A);
  expect(a.total.venta).toBe(170);
  expect(a.por_canal.rappi.venta).toBe(50);
  expect(a.dias).toBe(2);
  expect(a.dias_incompletos).toEqual(['2026-11-11']);
});

it('ventas_resumen agrupa por día y por sucursal-día, paginado', async () => {
  respuestas({
    mcp_ventas_sucursales: autorizado([
      { company_id: A, modulos: ['sucursales'] },
      { company_id: B, modulos: ['sucursales'] },
    ]),
    mcp_ventas_dias: [
      {
        company_id: A,
        fecha: '2026-11-10',
        completa: true,
        corte_segundo: 86400,
        origenes: { mostrador: tot(10000) },
      },
      {
        company_id: B,
        fecha: '2026-11-10',
        completa: true,
        corte_segundo: 86400,
        origenes: { mostrador: tot(500) },
      },
    ],
  });
  const porDia = (await herramienta('ventas_resumen').ejecutar({
    desde: '2026-11-10',
    hasta: '2026-11-10',
    agrupar: 'dia',
  })) as any;
  expect(porDia.datos).toEqual([expect.objectContaining({ fecha: '2026-11-10', sucursales: 2 })]);
  expect(porDia.datos[0].total.venta).toBe(105);
  const filas = (await herramienta('ventas_resumen').ejecutar({
    desde: '2026-11-10',
    hasta: '2026-11-10',
    agrupar: 'sucursal_dia',
    limite: 1,
  })) as any;
  expect(filas.datos).toHaveLength(1);
  expect(filas.siguiente_pagina).toBe(2);
});

it('ventas_resumen valida el rango y las sucursales pedidas', async () => {
  respuestas({ mcp_ventas_sucursales: autorizado([{ company_id: A, modulos: ['sucursales'] }]) });
  const r = herramienta('ventas_resumen');
  await expect(r.ejecutar({ desde: '2026-11-10' })).rejects.toThrow(/desde y hasta/);
  await expect(r.ejecutar({ desde: '2026-11-10', hasta: '2026-11-01' })).rejects.toThrow(/desde/);
  await expect(r.ejecutar({ desde: '2026-01-01', hasta: '2026-11-01' })).rejects.toThrow(/120/);
  await expect(r.ejecutar({ sucursales: [B] })).rejects.toThrow(/Ninguna/);
});

const horas = (h: number, pedidos: number, venta: number) => [
  Array.from({ length: 24 }, (_, i) => (i === h ? pedidos : 0)),
  Array.from({ length: 24 }, (_, i) => (i === h ? venta : 0)),
];

it('ventas_por_hora suma sucursales por hora y canal, y reporta incompletas', async () => {
  respuestas({
    mcp_ventas_sucursales: autorizado([
      { company_id: A, modulos: ['sucursales'] },
      { company_id: B, modulos: ['sucursales'] },
    ]),
    mcp_ventas_dias: [
      {
        company_id: A,
        fecha: '2026-11-10',
        completa: true,
        corte_segundo: 86400,
        origenes: {},
        horas: { mostrador: horas(9, 2, 10000) },
      },
      {
        company_id: B,
        fecha: '2026-11-10',
        completa: false,
        corte_segundo: 50000,
        origenes: {},
        horas: { mostrador: horas(9, 1, 500), rappi: horas(13, 1, 3000) },
      },
    ],
  });
  const r = (await herramienta('ventas_por_hora').ejecutar({ fecha: '2026-11-10' })) as any;
  const [, args] = rpc.mock.calls.find(([fn]) => fn === 'mcp_ventas_dias')!;
  expect(args).toMatchObject({ p_desde: '2026-11-10', p_hasta: '2026-11-10', p_horas: true });
  expect(r.horas).toHaveLength(24);
  expect(r.horas[9]).toEqual({
    hora: 9,
    pedidos: 3,
    venta: 105,
    por_canal: { mostrador: { pedidos: 3, venta: 105 } },
  });
  expect(r.horas[13].por_canal.rappi.venta).toBe(30);
  expect(r.incompletas).toEqual([B]);
});

it('ventas_por_producto agrupa canales por producto, filtra canal y pagina', async () => {
  respuestas({
    mcp_ventas_sucursales: autorizado([{ company_id: A, modulos: ['sucursales'] }]),
    sucursales_tablero_periodo: {
      dias_leidos: 3,
      incompletos: 1,
      semanas: [],
      dias: [],
      productos: [
        {
          clave: 'L',
          codigo: '5IL',
          nombre: 'Iced Latte',
          origen: 'mostrador',
          lineas: 4,
          importe_cent: 40000,
          sucursales: 1,
        },
        {
          clave: 'L',
          codigo: '5IL',
          nombre: 'Iced Latte',
          origen: 'rappi',
          lineas: 1,
          importe_cent: 12000,
          sucursales: 1,
        },
        {
          clave: 'B',
          codigo: 'BRO13',
          nombre: 'Brownie',
          origen: 'rappi',
          lineas: 5,
          importe_cent: 30000,
          sucursales: 1,
        },
      ],
    },
  });
  const t = herramienta('ventas_por_producto');
  const todo = (await t.ejecutar({ desde: '2026-11-01', hasta: '2026-11-03' })) as any;
  expect(todo.datos.map((p: any) => p.codigo)).toEqual(['5IL', 'BRO13']);
  expect(todo.datos[0]).toMatchObject({ lineas: 5, importe: 520, sucursales: 1 });
  expect(todo.datos[0].por_canal.rappi).toEqual({ lineas: 1, importe: 120 });
  expect(todo).toMatchObject({ dias_leidos: 3, dias_incompletos: 1 });
  const rappi = (await t.ejecutar({ desde: '2026-11-01', hasta: '2026-11-03', canal: 'rappi' })) as any;
  expect(rappi.datos.map((p: any) => [p.codigo, p.importe])).toEqual([
    ['BRO13', 300],
    ['5IL', 120],
  ]);
  const p1 = (await t.ejecutar({ desde: '2026-11-01', hasta: '2026-11-03', limite: 1 })) as any;
  expect(p1.datos).toHaveLength(1);
  expect(p1.siguiente_pagina).toBe(2);
});

it('ventas_bi: solo tiendas con módulo bi y en bi_opciones; montos en pesos; hoy de México', async () => {
  respuestas({
    mcp_ventas_sucursales: autorizado([
      { company_id: A, modulos: ['sucursales', 'bi'] },
      { company_id: B, modulos: ['sucursales'] },
    ]),
    bi_opciones: {
      tiendas: [{ company_id: A, store_id: 1, nombre: 'Tienda A', franquiciatario: null, tipo: 'Isla' }],
      ultimo_corte: null,
      tiendas_sin_rappi: 0,
    },
    bi_tablero: {
      kpis: { venta_cent: 123400, venta_bruta_cent: 130000, tickets: 10, lineas: 12, unidades: 14 },
      por_pago: [],
    },
  });
  const r = (await herramienta('ventas_bi').ejecutar({
    desde: '2026-11-01',
    hasta: '2026-11-10',
    sucursales: [A, B],
  })) as any;
  const [, args] = rpc.mock.calls.find(([fn]) => fn === 'bi_tablero')!;
  expect(args.p).toMatchObject({
    desde: '2026-11-01',
    hasta: '2026-11-10',
    companias: [A],
    hoy: '2026-11-19',
  });
  expect(r.ignoradas).toEqual([B]);
  expect(r.tiendas).toEqual([{ company_id: A, nombre: 'Tienda A' }]);
  expect(r.tablero.kpis).toMatchObject({ venta: 1234, venta_bruta: 1300, tickets: 10 });
});
