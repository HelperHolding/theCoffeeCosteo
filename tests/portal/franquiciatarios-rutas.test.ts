import { beforeEach, describe, expect, it, vi } from 'vitest';

// Rutas del módulo Franquiciatarios: acceso por sucursal, mismas cifras que Sucursales y sin datos sensibles.
const sesion = vi.hoisted(() => ({
  usuario: 'u1' as string | null,
  activo: true,
  rol: 'franquiciado',
  modulos: [] as { modulo: string; nivel: string }[],
  miembros: [] as { company_id: number; rol: string }[],
  companias: [] as number[],
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (p: string) => {
    throw new Error(`REDIRECT:${p}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
// Cadena de PostgREST mínima: eq/in/order/limit/maybeSingle y await directo, por tabla.
vi.mock('../../lib/supabase/servidor', () => ({
  servidor: async () => ({
    auth: {
      getUser: async () =>
        sesion.usuario ? { data: { user: { id: sesion.usuario } }, error: null } : { data: { user: null }, error: null },
    },
    rpc: async (fn: string, args: { p_company: number }) => {
      const ve = sesion.modulos.some((m) => m.modulo === 'sucursales') && sesion.companias.includes(args.p_company);
      if (fn === 'sucursales_rappi_portal')
        return ve
          ? { data: { tiendas: [], conteos: [], pedidos: [], ultima_corrida: null, ultima_ok: null }, error: null }
          : { data: null, error: null };
      if (fn === 'sucursales_catalogo_pos') return { data: ve ? [] : null, error: null };
      return { data: null, error: null };
    },
    from: (tabla: string) => {
      const datos = () => {
        if (tabla === 'perfiles')
          return [{ user_id: sesion.usuario, nombre: 'Ana', rol: sesion.rol, activo: sesion.activo }];
        if (tabla === 'perfil_modulos') return sesion.modulos;
        if (tabla === 'perfil_sucursales') return sesion.companias.map((company_id) => ({ company_id }));
        if (tabla === 'franq_miembros') return sesion.miembros;
        return [];
      };
      const q: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'order', 'limit', 'or']) q[m] = () => q;
      q.maybeSingle = async () => ({ data: datos()[0] ?? null, error: null });
      q.then = (ok: (x: unknown) => unknown, ko?: (e: unknown) => unknown) =>
        Promise.resolve({ data: datos(), error: null }).then(ok, ko);
      return q;
    },
  }),
}));
// Llave de servicio: el mismo Rappi (vacío) y el mismo catálogo (vacío) que las RPC de Sucursales en este arnés.
vi.mock('../../lib/sucursales/corte-servidor', () => ({
  clienteServicio: () => ({}),
  catalogoServicio: async () => new Map(),
  rappiServicio: (_db: unknown, cfg: { rappiPortal?: boolean }) => (cfg.rappiPortal ? async () => [] : undefined),
}));

import { GET as vivoFranq } from '../../app/api/franquiciatarios/[companyId]/vivo/route';
import { GET as pedidosFranq } from '../../app/api/franquiciatarios/[companyId]/pedidos/route';
import { GET as tiraFranq } from '../../app/api/franquiciatarios/[companyId]/tira/route';
import { GET as avisosFranq } from '../../app/api/franquiciatarios/[companyId]/avisos/route';
import { GET as vivoSuc } from '../../app/api/sucursales/[companyId]/vivo/route';
import { GET as productosSuc } from '../../app/api/sucursales/[companyId]/productos/route';
import { GET as pedidosSuc } from '../../app/api/sucursales/[companyId]/pedidos/route';
import { __reiniciarParaPruebas } from '../../lib/sucursales/datos';
import { apiFalsa, pedido } from './sucursales-fixtures';

// 2026-10-22 12:00:00 en Ciudad Juárez (UTC−6).
const AHORA = Date.UTC(2026, 9, 22, 18, 0, 0);
let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;
type H = (r: Request, c: { params: Promise<{ companyId: string }> }) => Promise<Response>;
const llamar = (h: H, companyId: string, query = '') =>
  h(new Request(`http://localhost/api/x/${companyId}/x${query}`), { params: Promise.resolve({ companyId }) });
const cuerpo = async (h: H, id: string, q = '') => {
  const r = await llamar(h, id, q);
  expect(r.status).toBe(200);
  return r.json();
};
/** Claves de un JSON a cualquier profundidad. */
const claves = (x: unknown, acc = new Set<string>()): Set<string> => {
  if (Array.isArray(x)) x.forEach((v) => claves(v, acc));
  else if (x && typeof x === 'object')
    for (const [k, v] of Object.entries(x)) {
      acc.add(k);
      claves(v, acc);
    }
  return acc;
};

beforeEach(() => {
  Object.assign(sesion, {
    usuario: 'u1',
    activo: true,
    rol: 'tienda',
    modulos: [{ modulo: 'franquiciatarios', nivel: 'lectura' }],
    miembros: [{ company_id: 612, rol: 'barista' }],
    companias: [],
  });
  const api = apiFalsa({
    '2026-10-22': [
      pedido('2026-10-22', '08:00:00'),
      pedido('2026-10-22', '09:30:00', { fromSmartphone: true, paymentMethod: 'VIRTUAL_WALLET', refundId: null }),
      pedido('2026-10-22', '11:15:00', { paymentMethod: 'DINHEIRO' }),
    ],
    '2026-10-21': [pedido('2026-10-21', '10:00:00'), pedido('2026-10-21', '18:00:00')],
    '2026-10-15': [pedido('2026-10-15', '09:00:00')],
  });
  fetchSpy = vi.fn<typeof fetch>(api.fetch);
  __reiniciarParaPruebas({ fetch: fetchSpy, esperar: async () => {}, ahora: () => AHORA, token: () => 'tk' });
});

describe('acceso a las rutas del módulo', () => {
  const rutas: H[] = [vivoFranq, pedidosFranq, tiraFranq];
  it.each([
    ['sin sesión', () => (sesion.usuario = null), '612', 401],
    ['perfil inactivo', () => (sesion.activo = false), '612', 403],
    ['sin el módulo (aunque tenga Sucursales)', () => (sesion.modulos = [{ modulo: 'sucursales', nivel: 'lectura' }]), '612', 403],
    ['otra sucursal', () => {}, '477', 404],
    ['membresía inactiva o inexistente', () => (sesion.miembros = []), '612', 404],
    ['company manipulada', () => {}, '612abc', 404],
  ] as [string, () => void, string, number][])('%s → %i sin llamar al proveedor', async (_n, preparar, id, status) => {
    preparar();
    for (const h of rutas) {
      const r = await llamar(h, id);
      expect(r.status).toBe(status);
      expect(JSON.stringify(await r.json())).not.toMatch(/Juárez|Granja/);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('avisos (CSV) solo para gestores: a la cuenta de baristas, 404', async () => {
    expect((await llamar(avisosFranq, '612', '?desde=2026-10-22&hasta=2026-10-22')).status).toBe(404);
  });

  it('el admin del módulo (nivel desarrollador) entra a cualquier sucursal configurada', async () => {
    Object.assign(sesion, { rol: 'admin', modulos: [{ modulo: 'franquiciatarios', nivel: 'desarrollador' }], miembros: [] });
    expect((await llamar(vivoFranq, '612')).status).toBe(200);
    expect((await llamar(vivoFranq, '999')).status).toBe(404); // no configurada
  });

  it('pedidos y tira: solo hoy y los 6 días anteriores', async () => {
    expect((await llamar(pedidosFranq, '612', '?desde=2026-10-15&hasta=2026-10-15')).status).toBe(400);
    expect((await llamar(tiraFranq, '612', '?dia=2026-10-15')).status).toBe(400);
    expect((await llamar(tiraFranq, '612', '?dia=2026-10-23')).status).toBe(400);
    expect((await llamar(pedidosFranq, '612', '?desde=2026-10-16&hasta=2026-10-16')).status).toBe(200);
  });
});

describe('mismas cifras que Sucursales, sin datos sensibles', () => {
  /** Usuario que tiene ambos módulos, para comparar las dos API con la misma sesión. */
  const ambos = () =>
    Object.assign(sesion, {
      rol: 'franquiciado',
      modulos: [
        { modulo: 'franquiciatarios', nivel: 'lectura' },
        { modulo: 'sucursales', nivel: 'lectura' },
      ],
      miembros: [{ company_id: 612, rol: 'gerente' }],
      companias: [612],
    });

  it.each(['todos', 'mostrador', 'app'])('en vivo (%s): KPIs, orígenes, pagos y pedidos iguales', async (origen) => {
    ambos();
    const q = `?origen=${origen}`;
    const f = await cuerpo(vivoFranq, '612', q);
    const s = await cuerpo(vivoSuc, '612', q);
    const { netoCent: _n, ...kpisSuc } = s.kpis;
    expect(f.kpis).toEqual(kpisSuc);
    expect(f.origenes).toEqual(s.origenes);
    expect(f.pagos).toEqual(s.pagos);
    expect(f.productosTop).toEqual(s.productosTop);
    expect(f.ultimosPedidos).toEqual(s.ultimosPedidos);
    expect(f.conciliacion).toEqual(s.conciliacion);
  });

  it('pedidos: mismo desglose y totales', async () => {
    ambos();
    const q = '?desde=2026-10-21&hasta=2026-10-22&origen=todos';
    const f = await cuerpo(pedidosFranq, '612', q);
    const s = await cuerpo(pedidosSuc, '612', q);
    expect(f).toEqual(JSON.parse(JSON.stringify(s, (k, v) => (k === 'netoCent' ? undefined : v))));
  });

  it('tira: total, pedidos, ticket y productos iguales a Productos de Sucursales para el día', async () => {
    ambos();
    for (const origen of ['todos', 'mostrador', 'app']) {
      const t = await cuerpo(tiraFranq, '612', `?dia=2026-10-21&origen=${origen}`);
      const p = await cuerpo(productosSuc, '612', `?desde=2026-10-21&hasta=2026-10-21&origen=${origen}`);
      expect(t.totales.ventaCent).toBe(p.totales.ventaCent);
      expect(t.totales.pedidos).toBe(p.totales.pedidos);
      expect(t.totales.ticketCent).toBe(p.totales.ticketCent);
      expect(t.productos.map((x: { clave: string; importeCent: number }) => [x.clave, x.importeCent])).toEqual(
        p.productos.map((x: { clave: string; importeCent: number }) => [x.clave, x.importeCent]),
      );
      expect(t.parcial).toBe(false);
    }
    const hoy = await cuerpo(tiraFranq, '612', '?dia=2026-10-22');
    expect(hoy.parcial).toBe(true);
    expect(hoy.corte).toBe('12:00');
    expect(hoy.totales.pedidos).toBe(3);
  });

  it('ninguna respuesta lleva neto, costos ni márgenes', async () => {
    const respuestas = [
      await cuerpo(vivoFranq, '612', '?origen=todos'),
      await cuerpo(pedidosFranq, '612', '?desde=2026-10-22&hasta=2026-10-22'),
      await cuerpo(tiraFranq, '612', '?dia=2026-10-22'),
    ];
    for (const r of respuestas) for (const k of claves(r)) expect(k).not.toMatch(/neto|costo|margen|utilidad|comision/i);
  });
});
