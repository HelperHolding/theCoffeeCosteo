import { beforeEach, describe, expect, it, vi } from 'vitest';

const sesion = vi.hoisted(() => ({
  usuario: 'u1' as string | null,
  activo: true,
  modulos: [{ modulo: 'sucursales', nivel: 'lectura' }] as { modulo: string; nivel: string }[],
  companias: [612] as number[],
  errorCompanias: false,
  rol: 'admin',
  errorCosteo: false,
}));
// Tablas de Costeo (sintéticas) que la ruta de productos lee con la sesión del usuario.
const COSTEO = vi.hoisted(() => {
  const MIL = '9756eec9-1f09-45ee-a45b-21ac8c54bb22'; // Matcha Iced Latte: tamaño verificado
  const BRO = 'r-bro';
  return {
    producto_codigo_pos: [
      { codigo: '4MIL', receta_id: MIL },
      { codigo: 'BRO13', receta_id: BRO },
    ],
    tamanos: [
      { id: 't1', nombre: 'Chica' },
      { id: 't2', nombre: 'Grande' },
      { id: 't3', nombre: 'Único' },
    ],
    parametros: [{ iva: 0.16 }],
    recetas: [
      { id: MIL, nombre: 'Matcha Iced Latte' },
      { id: BRO, nombre: 'Brownie' },
    ],
    v_costo_producto: [
      { producto_id: MIL, tamano_id: 't1', costo: 26, usa_inactivo: false },
      { producto_id: BRO, tamano_id: 't3', costo: 29, usa_inactivo: false },
    ],
    producto_tamanos: [
      { producto_id: MIL, tamano_id: 't1' },
      { producto_id: MIL, tamano_id: 't2' },
      { producto_id: BRO, tamano_id: 't3' },
    ],
  } as Record<string, unknown[]>;
});
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (p: string) => {
    throw new Error(`REDIRECT:${p}`);
  },
}));
vi.mock('../../lib/supabase/servidor', () => ({
  servidor: async () => ({
    auth: {
      getUser: async () =>
        sesion.usuario
          ? { data: { user: { id: sesion.usuario } }, error: null }
          : { data: { user: null }, error: null },
    },
    from: (tabla: string) => {
      const r = () =>
        sesion.errorCosteo
          ? { data: null, error: { message: 'rls' } }
          : { data: COSTEO[tabla] ?? [], error: null };
      const q = {
        in: async () => r(),
        limit: () => q,
        maybeSingle: async () => ({ ...r(), data: r().data?.[0] ?? null }),
        then: (ok: (x: ReturnType<typeof r>) => unknown, ko?: (e: unknown) => unknown) =>
          Promise.resolve(r()).then(ok, ko),
      };
      return {
        select: () => ({
          ...q,
          eq: (_c: string, id: string) => {
            if (tabla === 'perfil_modulos') return Promise.resolve({ data: sesion.modulos, error: null });
            if (tabla === 'perfil_sucursales')
              return Promise.resolve(
                sesion.errorCompanias
                  ? { data: null, error: { message: 'sin tabla' } }
                  : { data: sesion.companias.map((company_id) => ({ company_id })), error: null },
              );
            return {
              maybeSingle: async () => ({
                data: { user_id: id, nombre: 'Carla', rol: sesion.rol, activo: sesion.activo },
                error: null,
              }),
            };
          },
        }),
      };
    },
  }),
}));

import { GET as vivo } from '../../app/api/sucursales/[companyId]/vivo/route';
import { GET as productosGet } from '../../app/api/sucursales/[companyId]/productos/route';
import { GET as pedidosGet } from '../../app/api/sucursales/[companyId]/pedidos/route';
import { __reiniciarParaPruebas } from '../../lib/sucursales/datos';
import { sesionSucursales } from '../../lib/supabase/sesion';
import { apiFalsa, pedido } from './sucursales-fixtures';

// 2026-10-22 12:00:00 en Ciudad Juárez (UTC−6).
const AHORA = Date.UTC(2026, 9, 22, 18, 0, 0);
let api: ReturnType<typeof apiFalsa>;
let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;

const llamar = (handler: typeof vivo, companyId: string, query = '') =>
  handler(new Request(`http://localhost/api/sucursales/${companyId}/x${query}`), {
    params: Promise.resolve({ companyId }),
  });

beforeEach(() => {
  Object.assign(sesion, {
    usuario: 'u1',
    activo: true,
    modulos: [{ modulo: 'sucursales', nivel: 'lectura' }],
    companias: [612],
    errorCompanias: false,
    rol: 'admin',
    errorCosteo: false,
  });
  api = apiFalsa({
    '2026-10-22': [
      pedido('2026-10-22', '08:00:00'),
      pedido('2026-10-22', '11:59:59', {
        fromSmartphone: true,
        paymentMethod: 'VIRTUAL_WALLET',
        refundId: null,
      }),
      pedido('2026-10-22', '12:00:05'), // posterior al corte (reloj del POS adelantado)
    ],
    '2026-10-15': [pedido('2026-10-15', '09:00:00'), pedido('2026-10-15', '15:00:00')],
    '2026-10-21': [pedido('2026-10-21', '10:00:00')],
  });
  fetchSpy = vi.fn<typeof fetch>(api.fetch);
  __reiniciarParaPruebas({
    fetch: fetchSpy,
    esperar: async () => {},
    ahora: () => AHORA,
    token: () => 'tk-secreto',
  });
});

describe('denegaciones antes de caché y proveedor', () => {
  const casos: [string, () => void, string, number][] = [
    ['sin sesión', () => (sesion.usuario = null), '612', 401],
    ['perfil inactivo', () => (sesion.activo = false), '612', 403],
    [
      'sin módulo (aunque sea admin)',
      () => (sesion.modulos = [{ modulo: 'crm', nivel: 'desarrollador' }]),
      '612',
      403,
    ],
    ['company ajena', () => (sesion.companias = [612]), '477', 404],
    ['company asignada pero no configurada', () => (sesion.companias = [612, 384]), '384', 404],
    ['company manipulada', () => {}, '612abc', 404],
    ['company con ceros', () => {}, '0612', 404],
    ['asignaciones ilegibles = ninguna', () => (sesion.errorCompanias = true), '612', 404],
  ];
  it.each(casos)('%s → %i… sin llamadas al proveedor', async (_n, preparar, id, status) => {
    // Caché caliente de otro usuario autorizado.
    expect((await llamar(vivo, '612')).status).toBe(200);
    fetchSpy.mockClear();
    preparar();
    for (const h of [vivo, productosGet, pedidosGet]) {
      const r = await llamar(h, id);
      expect(r.status).toBe(status);
      const cuerpo = await r.json();
      expect(JSON.stringify(cuerpo)).not.toMatch(/Granja|Juárez|612/);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('revocar la asignación corta el acceso aunque la caché esté caliente', async () => {
    expect((await llamar(vivo, '612')).status).toBe(200);
    sesion.companias = [];
    expect((await llamar(vivo, '612')).status).toBe(404);
  });

  it('las páginas redirigen sin módulo', async () => {
    sesion.modulos = [];
    await expect(sesionSucursales()).rejects.toThrow('REDIRECT:/');
    sesion.usuario = null;
    await expect(sesionSucursales()).rejects.toThrow('REDIRECT:/login');
  });
});

describe('En vivo', () => {
  it('corte común: hoy hasta las 12:00:00 vs el jueves anterior hasta la misma hora', async () => {
    const r = await llamar(vivo, '612');
    expect(r.headers.get('cache-control')).toBe('private, no-store');
    const d = await r.json();
    expect(d.corte).toMatchObject({ fecha: '2026-10-22', hora: '12:00:00', segundo: 43200 });
    expect(d.base).toEqual({ fecha: '2026-10-15', dia: 'jueves' });
    expect(d.kpis).toMatchObject({ pedidos: 2, ventaCent: 33000 });
    expect(d.kpisBase).toMatchObject({ pedidos: 1, ventaCent: 16500 });
    expect(d.comparativo.venta).toBeCloseTo(1);
    expect(d.posterioresAlCorte).toBe(1);
    expect(d.curva.hoy[13]).toBeNull();
    expect(d.curva.base[23]).toBe(33000);
    expect(d.ultimoPedido).toEqual({ hora: '11:59:59', haceSeg: 1 });
    expect(d.lecturas.hoy.estado).toBe('completa');
    expect(d.conciliacion.diferenciaCent).toBe(0);
    // Nada del proveedor que no deba salir: token, refundId, netAmout, percentageOfTransfer.
    expect(JSON.stringify(d)).not.toMatch(/tk-secreto|refundId|uuid-sintetico|netAmout|percentageOfTransfer/);
  });

  it('el filtro de origen se aplica a KPIs, curva, pagos y pedidos por igual', async () => {
    const d = await (await llamar(vivo, '612', '?origen=app')).json();
    expect(d.kpis.pedidos).toBe(1);
    expect(d.ultimosPedidos.map((p: { origen: string }) => p.origen)).toEqual(['app']);
    expect(d.pagos.map((p: { etiqueta: string }) => p.etiqueta)).toEqual(['Monedero virtual']);
    expect(d.curva.hoy[11]).toBe(16500);
    expect(d.kpisBase.pedidos).toBe(0);
    expect(d.comparativo.venta).toBeNull();
  });

  it('caché compartida tras autorizar: dos usuarios, una sola lectura al proveedor', async () => {
    await llamar(vivo, '612');
    const n = fetchSpy.mock.calls.length;
    sesion.usuario = 'u2';
    await llamar(vivo, '612');
    expect(fetchSpy.mock.calls.length).toBe(n);
  });

  it('un fallo del proveedor es error, no venta cero', async () => {
    fetchSpy.mockImplementation(async () => new Response('', { status: 401 }));
    const d = await (await llamar(vivo, '612')).json();
    expect(d.lecturas.hoy).toMatchObject({ estado: 'error' });
    expect(d.lecturas.hoy.error).toMatch(/credenciales/);
    expect(d.comparativo).toBeNull();
    expect(d.insights).toEqual([]);
  });

  it('identidad discrepante en el catálogo bloquea la lectura de pedidos', async () => {
    fetchSpy.mockImplementation(async (u) =>
      String(u).includes('/company/list/all')
        ? Response.json([{ id: 612, name: 'Otra', lookerStoreId: 999 }])
        : api.fetch(u),
    );
    const d = await (await llamar(vivo, '612')).json();
    expect(d.lecturas.hoy.estado).toBe('error');
    expect(fetchSpy.mock.calls.every(([u]) => String(u).includes('/company/list/all'))).toBe(true);
  });
});

describe('Productos y Pedidos', () => {
  it('valida periodo, origen, pago y página', async () => {
    expect((await llamar(productosGet, '612', '?desde=2026-09-01&hasta=2026-10-22')).status).toBe(400);
    expect((await llamar(productosGet, '612', '?desde=2026-10-23')).status).toBe(400);
    expect((await llamar(productosGet, '612', '?desde=2026-10-22&hasta=2026-10-21')).status).toBe(400);
    expect((await llamar(productosGet, '612', '?origen=uber')).status).toBe(400);
    expect((await llamar(pedidosGet, '612', '?desde=2026-10-10&hasta=2026-10-22')).status).toBe(400);
    expect((await llamar(pedidosGet, '612', '?pago=x;drop')).status).toBe(400);
    expect((await llamar(pedidosGet, '612', '?pagina=0')).status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('productos del periodo con conciliación', async () => {
    const d = await (await llamar(productosGet, '612', '?desde=2026-10-21&hasta=2026-10-22')).json();
    expect(d.lectura.estado).toBe('completa');
    expect(d.totales.pedidos).toBe(4);
    expect(d.conciliacion.diferenciaCent).toBe(0);
    expect(d.productos[0].codigo).toBe('4MIL');
  });

  it('costeo: solo con permiso, decidido en el servidor; el POS no cambia', async () => {
    const q = '?desde=2026-10-21&hasta=2026-10-22';
    const con = await (await llamar(productosGet, '612', q)).json();
    // 4 pedidos: 4MIL lleva Oatmilk (parcial) y BRO13 es Único sin personalización (completo).
    expect(con.costeo.cobertura).toMatchObject({ genericoCent: 0, sinEnlaceCent: 0, sinCodigoCent: 0 });
    expect(con.costeo.cobertura.totalCent).toBe(con.totales.ventaCent);
    expect(con.costeo.completo).toMatchObject({ lineas: 4, importeCent: 4 * 7500, costoCent: 4 * 2900 });
    expect(con.costeo.parcial).toMatchObject({
      lineas: 4,
      motivos: { personalizacion: 4, tamano: 0, costo: 0 },
    });
    expect(con.productos.find((p: { codigo: string }) => p.codigo === 'BRO13').costeo.receta).toBe('Brownie');

    const sinCosteo = (d: Record<string, unknown>) => {
      const { costeo: _c, productos, ...resto } = d;
      void _c;
      return {
        ...resto,
        productos: (productos as Record<string, unknown>[]).map(({ costeo: _x, ...p }) => (void _x, p)),
      };
    };
    for (const negar of [() => (sesion.rol = 'sin-rol'), () => (sesion.errorCosteo = true)]) {
      Object.assign(sesion, { rol: 'admin', errorCosteo: false });
      negar();
      const texto = await (await llamar(productosGet, '612', q)).text();
      // Ni la clave costeo, ni recetas, ni costos o márgenes en el JSON.
      expect(texto).not.toMatch(/costeo|costo|margen|receta|ventaSinIva|iva"/i);
      const sin = JSON.parse(texto);
      expect(sin.costeo).toBeUndefined();
      // Nombres, importes y totales del POS idénticos con y sin costeo (salvo el instante de lectura).
      expect({ ...sin, lectura: { ...sin.lectura, leidoEn: 0 } }).toEqual({
        ...sinCosteo(con),
        lectura: { ...con.lectura, leidoEn: 0 },
      });
    }
  });

  it('pedidos paginados de 25 sobre el conjunto completo, con filtro de pago', async () => {
    const muchos = Array.from({ length: 30 }, (_, i) =>
      pedido('2026-10-20', `09:${String(i).padStart(2, '0')}:00`, i % 3 ? {} : { paymentMethod: 'DINHEIRO' }),
    );
    fetchSpy.mockImplementation(apiFalsa({ '2026-10-20': muchos }).fetch);
    const p1 = await (await llamar(pedidosGet, '612', '?desde=2026-10-20')).json();
    expect(p1).toMatchObject({ total: 30, pagina: 1, paginas: 2, porPagina: 25 });
    expect(p1.pedidos).toHaveLength(25);
    const p2 = await (await llamar(pedidosGet, '612', '?desde=2026-10-20&pagina=2')).json();
    expect(p2.pedidos).toHaveLength(5);
    expect(new Set([...p1.pedidos, ...p2.pedidos].map((p: { id: number }) => p.id)).size).toBe(30);
    const ef = await (await llamar(pedidosGet, '612', '?desde=2026-10-20&pago=DINHEIRO')).json();
    expect(ef.total).toBe(10);
    expect(ef.metodos.map((m: { etiqueta: string }) => m.etiqueta)).toEqual(['Efectivo', 'Tarjeta']);
  });
});
