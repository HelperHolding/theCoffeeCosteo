import { beforeEach, describe, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({
  usuario: 'u1' as string | null,
  modulos: [{ modulo: 'bi', nivel: 'lectura' }] as { modulo: string; nivel: string }[],
  companias: [384, 612] as number[],
  llamadas: [] as { fn: string; p: Record<string, unknown> }[],
  fallaTablero: false,
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: (p: string) => { throw new Error(`REDIRECT:${p}`); } }));
vi.mock('../../lib/supabase/servidor', () => ({
  servidor: async () => ({
    auth: { getUser: async () => ({ data: { user: s.usuario ? { id: s.usuario } : null }, error: null }) },
    from: (tabla: string) => {
      const filas: Record<string, unknown[]> = {
        perfiles: [{ user_id: 'u1', nombre: 'Seb', rol: 'admin', activo: true }],
        perfil_modulos: s.modulos,
        perfil_sucursales: s.companias.map((company_id) => ({ company_id })),
      };
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: filas[tabla][0], error: null }),
        then: (r: (x: unknown) => unknown) => r({ data: filas[tabla], error: null }) };
      return q;
    },
    rpc: async (fn: string, args: { p: Record<string, unknown> }) => {
      s.llamadas.push({ fn, p: args.p });
      if (fn === 'bi_tablero' && s.fallaTablero) return { data: null, error: { message: 'timeout' } };
      const datos: Record<string, unknown> = {
        bi_opciones: { tiendas: s.companias.map((c) => ({ company_id: c, store_id: c, nombre: `T${c}`, franquiciatario: null, tipo: 'Franquicia' })),
          franquiciatarios: [], tipos: [], categorias: [], grupos: [], productos: [], pagos: [], semanas: [], ultimo_corte: null, tiendas_sin_rappi: 0 },
        bi_tablero: { kpis: { venta_cent: 1 } },
        bi_tendencias: { por_mes: [], por_semana: [] },
      };
      return { data: datos[fn], error: null };
    },
  }),
}));

import { GET as tablero } from '@/app/api/bi/tablero/route';
import { GET as tendencias } from '@/app/api/bi/tendencias/route';
const pedir = (ruta: typeof tablero, q = '') => ruta(new Request(`http://x/api/bi/tablero${q}`));

beforeEach(() => {
  s.usuario = 'u1'; s.modulos = [{ modulo: 'bi', nivel: 'lectura' }]; s.companias = [384, 612];
  s.llamadas = []; s.fallaTablero = false;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-06T05:30:00Z')); // 23:30 del 5-nov en CDMX
});

describe('/api/bi/tablero', () => {
  it('401 sin sesión y 403 sin módulo bi', async () => {
    s.usuario = null;
    expect((await pedir(tablero)).status).toBe(401);
    s.usuario = 'u1'; s.modulos = [{ modulo: 'sucursales', nivel: 'lectura' }];
    expect((await pedir(tablero)).status).toBe(403);
  });

  it('por omisión: Esta semana con hoy de CDMX y todas las tiendas con acceso', async () => {
    const r = await pedir(tablero);
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('private, no-store');
    const cuerpo = await r.json();
    expect(cuerpo.periodo).toEqual({ desde: '2026-11-02', hasta: '2026-11-05' });
    const p = s.llamadas.find((l) => l.fn === 'bi_tablero')!.p;
    expect(p).toMatchObject({ desde: '2026-11-02', hasta: '2026-11-05', hoy: '2026-11-05', companias: [384, 612] });
  });

  it('el filtro de tiendas se cruza con el acceso; si no queda ninguna, responde vacío sin llamar la RPC', async () => {
    await pedir(tablero, '?tiendas=612,999');
    expect(s.llamadas.find((l) => l.fn === 'bi_tablero')!.p.companias).toEqual([612]);
    s.llamadas = [];
    const r = await pedir(tablero, '?tiendas=999');
    expect(r.status).toBe(200);
    expect((await r.json()).tablero).toBeNull();
    expect(s.llamadas.some((l) => l.fn === 'bi_tablero')).toBe(false);
  });

  it('400 con periodo inválido, sin tocar la base', async () => {
    const r = await pedir(tablero, '?desde=2026-10-07&hasta=2026-10-01');
    expect(r.status).toBe(400);
    expect(s.llamadas).toEqual([]);
  });

  it('503 si la RPC falla', async () => {
    s.fallaTablero = true;
    expect((await pedir(tablero)).status).toBe(503);
  });
});

describe('/api/bi/tendencias', () => {
  it('ignora fechas y semanas; pasa los demás filtros', async () => {
    const r = await pedir(tendencias, '?desde=2026-10-01&hasta=2026-10-07&sem=W40%202026&cafe=si');
    expect(r.status).toBe(200);
    const p = s.llamadas.find((l) => l.fn === 'bi_tendencias')!.p;
    expect(p).toMatchObject({ cafe: ['Sí'], hoy: '2026-11-05', companias: [384, 612] });
    expect(p.semanas).toBeUndefined();
  });
});
