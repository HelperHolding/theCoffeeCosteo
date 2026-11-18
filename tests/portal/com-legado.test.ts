import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => m.db }));
import {
  aperturasLegado,
  pedidosLegado,
  SIN_PUENTE,
  ultimosPedidosLegado,
} from '../../lib/comercializadora/legado';

const ped = (o: Record<string, unknown>) => ({
  id: 'p1',
  apertura_id: 'A1',
  fecha_pedido: '2026-11-02T18:00:00Z',
  status: 'pagado',
  monto: 100,
  items: [],
  items_editados: null,
  shopify_order_number: '#1',
  ...o,
});

describe('lectura del puente (solo servidor, llave de servicio)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://x');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'k');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('sin llave de servicio no lee y lo dice claro', async () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(await pedidosLegado((q) => q)).toEqual({ ok: false, error: SIN_PUENTE });
  });

  it('lee los pedidos con el filtro y pagina', async () => {
    m.db = dbFalsa({ com_legado_pedidos: [ped({}), ped({ id: 'p2', status: 'cancelado' })] }).db;
    const r = await pedidosLegado((q) => q.neq('status', 'cancelado'));
    expect(r).toEqual({ ok: true, datos: [ped({})] });
  });

  it('si el puente falla, responde el aviso y no lanza', async () => {
    m.db = dbFalsa({}, [{ tabla: 'com_legado_pedidos', op: 'select' }]).db;
    expect(await pedidosLegado((q) => q)).toEqual({ ok: false, error: SIN_PUENTE });
    expect(await ultimosPedidosLegado(10)).toEqual({ ok: false, error: SIN_PUENTE });
  });

  it('últimos pedidos (con tope) y aperturas por id', async () => {
    m.db = dbFalsa({
      com_legado_pedidos: [ped({}), ped({ id: 'p2' }), ped({ id: 'p3' })],
      com_legado_aperturas: [
        { id: 'A1', sucursal: 'Polanco', contacto: 'Ana' },
        { id: 'A2', sucursal: null, contacto: 'Luis' },
      ],
    }).db;
    const u = await ultimosPedidosLegado(2);
    expect(u.ok && u.datos.length).toBe(2);
    expect(await aperturasLegado(['A2'])).toEqual({
      ok: true,
      datos: [{ id: 'A2', sucursal: null, contacto: 'Luis' }],
    });
    expect(await aperturasLegado([])).toEqual({ ok: true, datos: [] });
  });
});

describe('dbFalsa: upsert, range y neq', () => {
  it('upsert inserta o actualiza por la llave de conflicto', async () => {
    const f = dbFalsa({ t: [{ id: '1', k: 'a', v: 1 }] });
    await f.db.from('t').upsert({ k: 'a', v: 2 }, { onConflict: 'k' });
    await f.db.from('t').upsert({ k: 'b', v: 3 }, { onConflict: 'k' });
    expect(f.tablas.t.map((x) => [x.k, x.v])).toEqual([
      ['a', 2],
      ['b', 3],
    ]);
  });
  it('range devuelve la página pedida', async () => {
    const f = dbFalsa({ t: [{ id: '1' }, { id: '2' }, { id: '3' }] });
    const r = (await f.db.from('t').select('*').range(1, 2)) as { data: { id: string }[] };
    expect(r.data.map((x) => x.id)).toEqual(['2', '3']);
  });
});
