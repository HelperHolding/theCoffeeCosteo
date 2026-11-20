import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  correrOvs,
  depsReales,
  type ComunesOvs,
  type CorridaAnterior,
  type CorridaGuardar,
  type DepsOvs,
  type FilaBitacora,
  type TiendaOvs,
} from '../../lib/comercializadora/ovSugeridaServidor';
import type { ConsumoTienda } from '../../lib/comercializadora/ovConsumo';
import { CORREOS_OVS } from '../../lib/comercializadora/ovSugerida';
import { pesos } from '../../lib/comercializadora/formato';
import type { PedidoPlan } from '../../supabase/functions/_shared/planEngine.ts';

const AHORA = new Date('2026-11-16T12:00:00Z'); // lunes 06:00 en CDMX
const TIENDAS: TiendaOvs[] = [
  { company_id: 519, apertura_id: '411', nombre: 'La Mexicana' },
  { company_id: 460, apertura_id: '354', nombre: 'Pasaje Parián' },
];
const COMUNES: ComunesOvs = {
  catalogo: [
    {
      sku: 'INS-CAF-003',
      nombre: 'Cafe en Grano White 1.5 Kg',
      estatus: 'Compra Recurrente',
      costo_unitario: 420,
    },
  ],
  mapa: [],
  insumoSku: [{ insumo_id: 'cafe', sku: 'INS-CAF-003', factor: 1500, activo: true }],
  pedidosApertura: [],
  correos: ['compras@mx.thecoffee.jp'],
};
const consumoOk = (): ConsumoTienda => ({
  ok: true,
  desde: '2026-10-19',
  hasta: '2026-11-15',
  dias: 28,
  completa: true,
  avisos: [],
  pedidos: 1000,
  cobertura: 0.9,
  insumos: [{ insumoId: 'cafe', insumo: 'CAFÉ TOSTADO EN GRANO WHITE 1.5 KG', cantidad: 42000 }],
});

function falsas(o: Partial<DepsOvs> = {}) {
  const guardadas: CorridaGuardar[] = [];
  const bitacora: FilaBitacora[] = [];
  const correos: { para: string[]; asunto: string; html: string }[] = [];
  const deps: DepsOvs = {
    ahora: () => AHORA,
    tiendas: async () => TIENDAS,
    comunes: async () => COMUNES,
    pedidos: async () => [],
    consumo: async () => consumoOk(),
    anterior: async () => null,
    yaCalculada: async () => false,
    guardar: async (c) => {
      guardadas.push(c);
    },
    bitacora: async (f) => {
      bitacora.push(f);
    },
    enviar: async (para, asunto, html) => {
      correos.push({ para, asunto, html });
      return 'enviado';
    },
    ...o,
  };
  return { deps, guardadas, bitacora, correos };
}

describe('corrida semanal de la OV sugerida', () => {
  it('calcula cada tienda con sus ventanas y guarda una corrida por (semana, tienda)', async () => {
    const consumo = vi.fn(async (_id: number, _desde: string, _hasta: string) => consumoOk());
    const pedidos = vi.fn(async (_apertura: string, _desde: string) => [] as PedidoPlan[]);
    const anterior = vi.fn(async (_id: number, _semana: string) => null as CorridaAnterior | null);
    const f = falsas({ consumo, pedidos, anterior });
    const r = await correrOvs(f.deps);
    expect(consumo).toHaveBeenCalledWith(519, '2026-10-19', '2026-11-15');
    expect(pedidos).toHaveBeenCalledWith('411', '2026-08-17');
    expect(anterior).toHaveBeenCalledWith(519, '2026-11-16');
    expect(f.guardadas.map((g) => [g.semana, g.company_id, g.estado, g.cadencia])).toEqual([
      ['2026-11-16', 519, 'ok', 14],
      ['2026-11-16', 460, 'ok', 14],
    ]);
    expect(f.guardadas[0].lineas).toEqual([
      {
        sku: 'INS-CAF-003',
        nombre: 'Cafe en Grano White 1.5 Kg',
        origen: 'receta',
        k: 1,
        diario: 1,
        necesidad: 14,
        ya_pedido: 0,
        arrastre: 0,
        sugerido: 14,
        monto: 5880,
      },
    ]);
    expect(r.semana).toBe('2026-11-16');
    expect(r.correo).toBe('enviado');
    expect(f.correos[0].para).toEqual(['compras@mx.thecoffee.jp']);
    expect(f.correos[0].asunto).toBe('Orden de venta sugerida (piloto) — semana del 16 nov 2026');
    expect(f.bitacora).toEqual([
      expect.objectContaining({ inicio: AHORA.toISOString(), ok: true, error: null }),
    ]);
  });

  it('una tienda que falla no detiene a las demás: queda en error con su motivo y el correo lo dice', async () => {
    const f = falsas({
      consumo: async (companyId) =>
        companyId === 519 ? { ok: false, motivo: 'El proveedor no respondió.' } : consumoOk(),
    });
    const r = await correrOvs(f.deps);
    expect(f.guardadas[0]).toMatchObject({
      company_id: 519,
      estado: 'error',
      error: 'POS: El proveedor no respondió.',
      cadencia: null,
      lineas: [],
    });
    expect(f.guardadas[1]).toMatchObject({ company_id: 460, estado: 'ok' });
    expect(f.correos[0].html).toContain('No se calculó esta semana: POS: El proveedor no respondió.');
    expect(f.correos[0].html).toContain('Pasaje Parián');
    expect(r.tiendas.map((t) => t.estado)).toEqual(['error', 'ok']);
    expect(f.bitacora[0]).toMatchObject({ ok: false, error: expect.stringContaining('519') });
  });

  it('el puente caído en una tienda también la deja en error sin frenar a la otra', async () => {
    const f = falsas({
      pedidos: async (apertura) => {
        if (apertura === '411') throw new Error('No se pudieron leer los pedidos del sitio viejo.');
        return [];
      },
    });
    await correrOvs(f.deps);
    expect(f.guardadas.map((g) => [g.company_id, g.estado, g.error])).toEqual([
      [519, 'error', 'No se pudieron leer los pedidos del sitio viejo.'],
      [460, 'ok', null],
    ]);
  });

  it('arrastre y medición de la semana anterior; repetir la semana no acumula el arrastre', async () => {
    const pedido: PedidoPlan = {
      id: 'p1',
      apertura_id: '411',
      fecha_pedido: '2026-11-12T17:00:00Z',
      status: 'pagado',
      items: [{ sku: 'INS-CAF-003', nombre: 'Cafe', cantidad: 9 }],
      items_editados: null,
    };
    const anterior = vi.fn(async (_id: number, _semana: string): Promise<CorridaAnterior | null> => ({
      semana: '2026-11-09',
      lineas: [{ sku: 'INS-CAF-003', sugerido: 10, arrastre: 0.5 }],
    }));
    const f = falsas({ pedidos: async () => [pedido], anterior });
    await correrOvs(f.deps);
    await correrOvs(f.deps);
    const mexicana = f.guardadas.filter((g) => g.company_id === 519);
    expect(mexicana).toHaveLength(2);
    expect(mexicana[1].lineas).toEqual(mexicana[0].lineas);
    expect(mexicana[0].lineas[0]).toMatchObject({
      k: 0.8,
      diario: 0.8,
      necesidad: 11.2,
      arrastre: -0.3,
      sugerido: 12,
    });
    expect(anterior.mock.calls.every(([, semana]) => semana === '2026-11-16')).toBe(true);
    expect(f.correos[0].html).toContain(`sugerimos ${pesos(4200)}; desde entonces pidió ${pesos(3780)}`);
  });

  it('sin variables de correo: guarda las corridas y la bitácora dice "correo no configurado"', async () => {
    const f = falsas({ enviar: async () => 'no-configurado' });
    const r = await correrOvs(f.deps);
    expect(f.guardadas).toHaveLength(2);
    expect(r.correo).toBe('no-configurado');
    expect(f.bitacora[0]).toMatchObject({
      ok: true,
      resumen: expect.objectContaining({ correo: 'correo no configurado' }),
    });
  });

  it('si fallan los datos comunes, cada tienda queda en error y el correo sale a las direcciones por omisión', async () => {
    const f = falsas({
      comunes: async () => {
        throw new Error('No se pudieron leer los pedidos del sitio viejo. Intenta de nuevo en unos minutos.');
      },
    });
    await correrOvs(f.deps);
    expect(f.guardadas.map((g) => g.estado)).toEqual(['error', 'error']);
    expect(f.correos[0].para).toEqual(CORREOS_OVS);
  });

  it('si guardar falla, la tienda sigue en el correo y la bitácora marca el error', async () => {
    const f = falsas({
      guardar: async (c) => {
        if (c.company_id === 460) throw new Error('com_ovs_guardar: timeout');
      },
    });
    const r = await correrOvs(f.deps);
    expect(r.tiendas.map((t) => t.guardada)).toEqual([true, false]);
    expect(f.correos[0].html).toContain('No se pudo guardar la corrida: com_ovs_guardar: timeout');
    expect(f.bitacora[0]).toMatchObject({ ok: false, error: expect.stringContaining('460') });
  });
});

describe('dependencias reales (escrituras)', () => {
  it('guardar llama com_ovs_guardar y la bitácora escribe com_sync_log con proceso com-ovs', async () => {
    const llamadas: unknown[][] = [];
    const db = {
      rpc: async (fn: string, args: unknown) => {
        llamadas.push(['rpc', fn, args]);
        return { data: 1, error: null };
      },
      from: (tabla: string) => ({
        insert: async (fila: unknown) => {
          llamadas.push(['insert', tabla, fila]);
          return { error: null };
        },
      }),
    };
    const deps = depsReales(db as never);
    await deps.guardar({
      semana: '2026-11-16',
      company_id: 519,
      cadencia: 14,
      estado: 'ok',
      error: null,
      lineas: [],
    });
    await deps.bitacora({ inicio: 'a', fin: 'b', ok: true, resumen: { x: 1 }, error: null });
    expect(llamadas).toEqual([
      [
        'rpc',
        'com_ovs_guardar',
        {
          p_semana: '2026-11-16',
          p_company: 519,
          p_cadencia: 14,
          p_estado: 'ok',
          p_error: null,
          p_lineas: [],
        },
      ],
      [
        'insert',
        'com_sync_log',
        { proceso: 'com-ovs', inicio: 'a', fin: 'b', ok: true, resumen: { x: 1 }, error: null },
      ],
    ]);
  });
});

describe('revisión final: una semana ya calculada no se recalcula sin forzar', () => {
  it('sin forzar, la tienda con corrida ok de esta semana se omite (no se guarda ni sale en el correo); las demás sí', async () => {
    const yaCalculada = vi.fn(async (id: number, _semana: string) => id === 519);
    const f = falsas({ yaCalculada });
    const r = await correrOvs(f.deps);
    expect(yaCalculada).toHaveBeenCalledWith(519, '2026-11-16');
    expect(f.guardadas.map((g) => g.company_id)).toEqual([460]);
    expect(r.tiendas.find((t) => t.company_id === 519)).toMatchObject({ omitida: true, guardada: false });
    expect(f.correos).toHaveLength(1);
    expect(f.correos[0].html).not.toContain('La Mexicana');
  });

  it('si todas ya estaban calculadas no manda correo', async () => {
    const f = falsas({ yaCalculada: async () => true });
    const r = await correrOvs(f.deps);
    expect(f.guardadas).toEqual([]);
    expect(f.correos).toEqual([]);
    expect(r.correo).toBe('sin-tiendas');
  });

  it('con forzar recalcula aunque ya haya corrida ok', async () => {
    const yaCalculada = vi.fn(async () => true);
    const f = falsas({ yaCalculada });
    await correrOvs(f.deps, { forzar: true });
    expect(yaCalculada).not.toHaveBeenCalled();
    expect(f.guardadas.map((g) => g.company_id)).toEqual([519, 460]);
  });
});

describe('cada 14 días (pedido del usuario 2026-11-20)', () => {
  // Cliente falso que registra los filtros de cada consulta y responde según la tabla.
  function dbConsultas(respuestas: Record<string, unknown>) {
    const filtros: string[][] = [];
    const db = {
      from: (tabla: string) => {
        const f: string[] = [tabla];
        filtros.push(f);
        const q: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'gt', 'lt', 'lte', 'order', 'limit'])
          q[m] = (...a: unknown[]) => {
            f.push(`${m}:${a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join('=')}`);
            return q;
          };
        q.maybeSingle = async () => respuestas[tabla] ?? { data: null, error: null };
        q.then = (r: (x: unknown) => unknown) =>
          Promise.resolve(respuestas[tabla] ?? { data: [], error: null }).then(r);
        return q;
      },
    };
    return { db, filtros };
  }

  it('yaCalculada: hay corrida ok de la tienda en los últimos 14 días (semana > lunes − 14)', async () => {
    const { db, filtros } = dbConsultas({ com_ovs_corridas: { data: [{ id: 'x' }], error: null } });
    expect(await depsReales(db as never).yaCalculada(519, '2026-11-23')).toBe(true);
    expect(filtros[0]).toEqual(
      expect.arrayContaining([
        'eq:company_id=519',
        'eq:estado=ok',
        'gt:semana=2026-11-09',
        'lte:semana=2026-11-23',
      ]),
    );
  });

  it('yaCalculada: sin corridas en ese rango da false', async () => {
    const { db } = dbConsultas({ com_ovs_corridas: { data: [], error: null } });
    expect(await depsReales(db as never).yaCalculada(519, '2026-11-30')).toBe(false);
  });

  it('anterior: la corrida ok más reciente antes de este lunes, no la de hace 7 días', async () => {
    const { db, filtros } = dbConsultas({
      com_ovs_corridas: { data: { id: 'c1', semana: '2026-11-16' }, error: null },
      com_ovs_lineas: { data: [{ sku: 'A', sugerido: 2, arrastre: 0.1 }], error: null },
    });
    const a = await depsReales(db as never).anterior(519, '2026-11-30');
    expect(a).toEqual({ semana: '2026-11-16', lineas: [{ sku: 'A', sugerido: 2, arrastre: 0.1 }] });
    expect(filtros[0]).toEqual(
      expect.arrayContaining(['eq:company_id=519', 'eq:estado=ok', 'lt:semana=2026-11-30', 'limit:1']),
    );
    expect(filtros[0].some((x) => x.startsWith('order:semana'))).toBe(true);
  });
});
