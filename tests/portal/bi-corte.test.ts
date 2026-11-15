import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { asegurarTiendasBi, cortar, rappiServicio } from '../../lib/sucursales/corte-servidor';
import { sucursalesConfiguradas } from '../../lib/sucursales/config';
import type { LecturaNormal } from '../../lib/sucursales/datos';
import { lineasBi } from '../../lib/bi/lineas';
import type { PedidoNormal } from '../../lib/sucursales/normalizar';

const fila = (id: string, tienda: string, canal: string | null) => ({
  rappi_pedido_id: id,
  rappi_tienda_id: tienda,
  creado_local: '2026-11-03T10:00:00',
  fecha_local: '2026-11-03',
  estado: 'finished',
  estado_nombre: 'Finalizado',
  en_disputa: false,
  estado_disputa: null,
  metodo_pago: 'rappi_pay',
  bruto: 100,
  descuento_aliado: null,
  estado_anterior: null,
  revisar: false,
  rappi_tiendas: canal ? { canal } : null,
  rappi_pedido_productos: [{ linea: 1, nombre: 'Latte', unidades: 1, precio: 100, opciones: [] }],
});

// Cliente falso: from().select().eq().gte().lte().limit() devuelve las filas.
const clienteCon = (filas: unknown[]) => {
  const selects: string[] = [];
  const cadena = {
    eq: () => cadena,
    gte: () => cadena,
    lte: () => cadena,
    limit: async () => ({ data: filas, error: null }),
  };
  const db = { from: () => ({ select: (s: string) => (selects.push(s), cadena) }) };
  return { db: db as never, selects };
};

describe('rappiServicio: Turbo', () => {
  it('marca RAPPI_TURBO en tienda turbo y RAPPI_PORTAL en normal', async () => {
    const { db, selects } = clienteCon([fila('1', 'MX1', 'turbo'), fila('2', 'MX2', 'normal')]);
    const fuente = rappiServicio(db, { rappiPortal: true, companyId: 1 } as never)!;
    const pedidos = (await fuente('2026-11-03', '2026-11-03'))!;
    expect(selects[0]).toContain('rappi_tiendas(canal)');
    expect(pedidos.map((p) => p.tipo)).toEqual(['RAPPI_TURBO', 'RAPPI_PORTAL']);
  });
});

// Cliente falso del corte: registra el orden de las llamadas a rpc, upsert, insert y update.
const clienteCorte = (
  opts: {
    existentes?: number[];
    rpcError?: string;
    altaFalla?: number[];
    rpcCuelga?: boolean;
    portalDesde?: string | null;
    portalFalla?: boolean;
  } = {},
) => {
  const llamadas: { que: string; tabla?: string; args?: unknown; opts?: unknown }[] = [];
  const respuestaSelect = { data: (opts.existentes ?? []).map((company_id) => ({ company_id })), error: null };
  const db = {
    from: (tabla: string) => ({
      select: () => {
        const r = Promise.resolve(tabla === 'bi_tiendas' ? respuestaSelect : { data: [], error: null });
        const rappi = {
          eq: () => rappi,
          order: () => ({
            limit: async () =>
              opts.portalFalla
                ? { data: null, error: { message: 'sin acceso' } }
                : { data: opts.portalDesde ? [{ fecha_local: opts.portalDesde }] : [], error: null },
          }),
        };
        if (tabla === 'rappi_pedidos') return rappi;
        return Object.assign(r, { order: () => ({ range: async () => ({ data: [], error: null }) }) });
      },
      upsert: async (args: unknown, o?: unknown) => {
        llamadas.push({ que: 'upsert', tabla, args, opts: o });
        const id = (args as { company_id?: number }[])[0]?.company_id;
        const falla = tabla === 'bi_tiendas' && id !== undefined && (opts.altaFalla ?? []).includes(id);
        return { error: falla ? { message: 'store_id duplicado' } : null };
      },
      insert: async (args: unknown) => (llamadas.push({ que: 'insert', tabla, args }), { error: null }),
      update: (args: unknown) => (
        llamadas.push({ que: 'update', tabla, args }),
        { lt: () => ({ not: async () => ({ error: null }) }) }
      ),
    }),
    // Como el de supabase-js: un constructor con abortSignal. Con rpcCuelga nunca responde, salvo que se aborte.
    rpc: (nombre: string, args: unknown) => {
      llamadas.push({ que: 'rpc', tabla: nombre, args });
      let senal: AbortSignal | undefined;
      const resultado = (): Promise<{ error: { message: string } | null }> =>
        opts.rpcCuelga
          ? new Promise((_, rechazar) => {
              senal?.addEventListener('abort', () => rechazar(senal!.reason));
            })
          : Promise.resolve({ error: opts.rpcError ? { message: opts.rpcError } : null });
      const c = {
        abortSignal: (x: AbortSignal) => ((senal = x), c),
        then: (ok: never, no: never) => resultado().then(ok, no),
      };
      return c;
    },
  };
  return { db: db as never, llamadas };
};

const lectura = (estado: LecturaNormal['estado'], error: LecturaNormal['error'] = null): LecturaNormal => ({
  desde: '2020-01-01',
  hasta: '2020-01-01',
  leidoEn: 0,
  estado,
  error,
  avisos: [],
  totalDeclarado: null,
  pedidos: [],
});

const pedidoPrueba = (id: number, extra: Partial<PedidoNormal> = {}): PedidoNormal => ({
  id, fecha: '2020-01-01', segundo: 36000, hora: '10:00:00', origen: 'mostrador', ventaCent: 0, netoCent: null,
  descuentoCent: 0, metodo: 'CARTAO', tipo: 'EMV', numeroPedidoRappi: null, cuadra: true,
  lineas: [{ codigo: 'LAT', nombre: 'Latte', importeCent: 5000, descuentoPct: 0, customs: [] }],
  ...extra,
});

const base = sucursalesConfiguradas[0];
const cfg = (rappiPortal: boolean) => ({ ...base, rappiPortal });

describe('cortar: guarda también el BI', () => {
  it('llama a bi_guardar_dia por tienda y día, con rappiPortal de la configuración', async () => {
    for (const rp of [true, false]) {
      const { db, llamadas } = clienteCorte({ existentes: [base.companyId], portalDesde: '2020-01-01' });
      const r = await cortar(db, { fechas: ['2020-01-01'], sucursales: [cfg(rp)], leer: async () => lectura('completa') });
      const rpc = llamadas.filter((l) => l.que === 'rpc');
      expect(rpc).toHaveLength(1);
      expect(rpc[0].tabla).toBe('bi_guardar_dia');
      expect(rpc[0].args).toMatchObject({
        p_fuente: 'pos',
        p_company: base.companyId,
        p_fecha: '2020-01-01',
        p_completa: true,
        p_lineas: [],
        p_rappi_portal: rp,
      });
      expect(r.bi).toEqual({ guardados: 1, fallidos: [], altas: [] });
    }
  });

  it('p_lineas trae las líneas reales y p_leido_en es el mismo instante que leido_en del resumen', async () => {
    const pedidos = [
      pedidoPrueba(1, {
        lineas: [
          {
            codigo: 'LAT', nombre: 'Latte', importeCent: 5000, descuentoPct: 0,
            customs: [{ codigo: 'OAT', nombre: 'Leche de avena', importeCent: 800, descuentoPct: 0 }],
          },
        ],
      }),
      pedidoPrueba(2, { segundo: 50000, origen: 'app', metodo: 'PIX', tipo: 'ONLINE' }),
    ];
    const { db, llamadas } = clienteCorte({ existentes: [base.companyId] });
    await cortar(db, {
      fechas: ['2020-01-01'],
      sucursales: [cfg(false)],
      leer: async () => ({ ...lectura('completa'), pedidos }),
    });
    const rpc = llamadas.find((l) => l.que === 'rpc')!.args as { p_lineas: unknown; p_leido_en: string };
    expect(rpc.p_lineas).toEqual(lineasBi(pedidos));
    expect((rpc.p_lineas as { importe_cent: number }[])[0].importe_cent).toBe(5800);
    const filas = llamadas.find((l) => l.que === 'upsert' && l.tabla === 'sucursales_resumen_dia')!.args as {
      company_id: number; fecha: string; leido_en: string;
    }[];
    const fila = filas.find((f) => f.company_id === base.companyId && f.fecha === '2020-01-01')!;
    expect(new Date(rpc.p_leido_en).toISOString()).toBe(rpc.p_leido_en);
    expect(rpc.p_leido_en).toBe(fila.leido_en);
  });

  it('un día con estado error no llama a bi_guardar_dia', async () => {
    const { db, llamadas } = clienteCorte({ existentes: [base.companyId] });
    const r = await cortar(db, {
      fechas: ['2020-01-01'],
      sucursales: [cfg(false)],
      leer: async () => lectura('error', 'red' as never),
    });
    expect(llamadas.some((l) => l.que === 'rpc')).toBe(false);
    expect(r.bi.guardados).toBe(0);
    expect(r.fallidas).toHaveLength(1);
  });

  it('si bi_guardar_dia falla, el resumen se guarda igual y el fallo queda en el resultado y en el historial', async () => {
    const { db, llamadas } = clienteCorte({ existentes: [base.companyId], rpcError: 'tienda sin alta' });
    const r = await cortar(db, { fechas: ['2020-01-01'], sucursales: [cfg(false)], leer: async () => lectura('completa') });
    expect(llamadas.some((l) => l.que === 'upsert' && l.tabla === 'sucursales_resumen_dia')).toBe(true);
    expect(r.escritas).toBe(1);
    expect(r.bi.fallidos).toEqual([{ companyId: base.companyId, fecha: '2020-01-01', motivo: 'tienda sin alta' }]);
    const corte = llamadas.find((l) => l.que === 'insert' && l.tabla === 'sucursales_cortes')!;
    expect((corte.args as { mensaje: string }).mensaje).toContain('BI sin guardar: ');
    expect((corte.args as { mensaje: string }).mensaje).toContain('tienda sin alta');
  });

  it('un error lanzado por la red al guardar el BI tampoco rompe el corte', async () => {
    const { db } = clienteCorte({ existentes: [base.companyId] });
    (db as { rpc: unknown }).rpc = () => ({
      abortSignal() {
        return this;
      },
      then: (_ok: never, no: (e: Error) => void) => Promise.resolve().then(() => no(new Error('sin red'))),
    });
    const r = await cortar(db, { fechas: ['2020-01-01'], sucursales: [cfg(false)], leer: async () => lectura('completa') });
    expect(r.escritas).toBe(1);
    expect(r.bi.fallidos[0].motivo).toBe('sin red');
  });

  it('cada parte del mensaje tiene su propio tope: muchas «Sin leer» no ocultan «BI sin guardar»', async () => {
    const { db, llamadas } = clienteCorte({ existentes: [base.companyId], rpcError: 'x' });
    const muchas = Array.from({ length: 60 }, (_, i) => `2019-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`);
    await cortar(db, {
      fechas: ['2020-01-01', ...muchas],
      sucursales: [cfg(false)],
      leer: async (_c, f) =>
        f === '2020-01-01' ? lectura('completa') : lectura('error', 'red-muy-larga-para-llenar-el-mensaje' as never),
    });
    const corte = llamadas.find((l) => l.que === 'insert' && l.tabla === 'sucursales_cortes')!;
    const mensaje = (corte.args as { mensaje: string }).mensaje;
    expect(mensaje.length).toBeLessThanOrEqual(1003);
    expect(mensaje.startsWith('Sin leer: ')).toBe(true);
    expect(mensaje).toContain(' | BI sin guardar: ');
  });

  it('da de alta las tiendas faltantes antes de los guardados', async () => {
    const { db, llamadas } = clienteCorte({ existentes: [] });
    const r = await cortar(db, { fechas: ['2020-01-01'], sucursales: [cfg(false)], leer: async () => lectura('completa') });
    const iAlta = llamadas.findIndex((l) => l.que === 'upsert' && l.tabla === 'bi_tiendas');
    const iRpc = llamadas.findIndex((l) => l.que === 'rpc');
    expect(iAlta).toBeGreaterThanOrEqual(0);
    expect(iAlta).toBeLessThan(iRpc);
    expect(r.bi.altas).toEqual([base.companyId]);
  });

  it('un alta que falla queda en bi.fallidos con su companyId y no frena las demás ni el corte', async () => {
    const [a, b] = sucursalesConfiguradas;
    const { db } = clienteCorte({ existentes: [], altaFalla: [a.companyId] });
    const r = await cortar(db, { fechas: ['2020-01-01'], sucursales: [a, b], leer: async () => lectura('completa') });
    expect(r.bi.altas).toEqual([b.companyId]);
    expect(r.bi.fallidos.filter((f) => f.fecha === '*')).toEqual([
      { companyId: a.companyId, fecha: '*', motivo: 'alta de tienda: store_id duplicado' },
    ]);
    expect(r.escritas).toBe(2);
  });

  it('dos cortes seguidos del mismo día llaman dos veces a bi_guardar_dia (el reemplazo es de la base)', async () => {
    const { db, llamadas } = clienteCorte({ existentes: [base.companyId] });
    for (let i = 0; i < 2; i++)
      await cortar(db, { fechas: ['2020-01-01'], sucursales: [cfg(false)], leer: async () => lectura('completa') });
    expect(llamadas.filter((l) => l.que === 'rpc')).toHaveLength(2);
  });
});

describe('cortar: un BI lento no tumba el resumen', () => {
  it('con una RPC que nunca responde, el resumen y sucursales_cortes se guardan y el tiempo agotado queda en bi.fallidos', async () => {
    const { db, llamadas } = clienteCorte({ existentes: [base.companyId], rpcCuelga: true });
    const r = await cortar(db, {
      fechas: ['2020-01-01'],
      sucursales: [cfg(false)],
      leer: async () => lectura('completa'),
      biTimeoutMs: 20,
    });
    expect(r.escritas).toBe(1);
    expect(r.bi.guardados).toBe(0);
    expect(r.bi.fallidos).toHaveLength(1);
    expect(r.bi.fallidos[0].fecha).toBe('2020-01-01');
    expect(llamadas.some((l) => l.que === 'upsert' && l.tabla === 'sucursales_resumen_dia')).toBe(true);
    const corte = llamadas.find((l) => l.que === 'insert' && l.tabla === 'sucursales_cortes')!;
    expect((corte.args as { mensaje: string }).mensaje).toContain('BI sin guardar: ');
  });

  it('agotado el presupuesto, los guardados que faltan quedan como «sin tiempo» y no se llama a la RPC', async () => {
    const { db, llamadas } = clienteCorte({ existentes: [base.companyId] });
    const r = await cortar(db, {
      fechas: ['2020-01-01', '2020-01-02'],
      sucursales: [cfg(false)],
      leer: async () => lectura('completa'),
      biPresupuestoMs: 0,
    });
    expect(llamadas.some((l) => l.que === 'rpc')).toBe(false);
    expect(r.bi.guardados).toBe(0);
    expect(r.bi.fallidos.map((f) => f.motivo)).toEqual(['sin tiempo', 'sin tiempo']);
    expect(r.escritas).toBe(2);
  });

  it('con presupuesto infinito (script de historial) no se omite ningún guardado, aunque pase el tiempo', async () => {
    const { db, llamadas } = clienteCorte({ existentes: [base.companyId] });
    const fs = Array.from({ length: 30 }, (_, i) => `2020-01-${String(i + 1).padStart(2, '0')}`);
    vi.useFakeTimers();
    try {
      const r = await cortar(db, {
        fechas: fs,
        sucursales: [cfg(false)],
        leer: async () => {
          vi.setSystemTime(Date.now() + 3_600_000);
          return lectura('completa');
        },
        biPresupuestoMs: Number.POSITIVE_INFINITY,
      });
      expect(llamadas.filter((l) => l.que === 'rpc')).toHaveLength(30);
      expect(r.bi.guardados).toBe(30);
      expect(r.bi.fallidos.filter((f) => f.motivo === 'sin tiempo')).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('con BI_CARGA=0 no hay llamadas al BI y bi viene en ceros', async () => {
    vi.stubEnv('BI_CARGA', '0');
    try {
      const { db, llamadas } = clienteCorte({ existentes: [] });
      const r = await cortar(db, { fechas: ['2020-01-01'], sucursales: [cfg(true)], leer: async () => lectura('completa') });
      expect(llamadas.some((l) => l.que === 'rpc' || l.tabla === 'bi_tiendas')).toBe(false);
      expect(r.bi).toEqual({ guardados: 0, fallidos: [], altas: [] });
      expect(r.escritas).toBe(1);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('el upsert del resumen ocurre antes del primer bi_guardar_dia', async () => {
    const { db, llamadas } = clienteCorte({ existentes: [base.companyId] });
    await cortar(db, { fechas: ['2020-01-01'], sucursales: [cfg(false)], leer: async () => lectura('completa') });
    const iResumen = llamadas.findIndex((l) => l.que === 'upsert' && l.tabla === 'sucursales_resumen_dia');
    const iRpc = llamadas.findIndex((l) => l.que === 'rpc');
    const iCorte = llamadas.findIndex((l) => l.que === 'insert' && l.tabla === 'sucursales_cortes');
    expect(iResumen).toBeGreaterThanOrEqual(0);
    expect(iResumen).toBeLessThan(iRpc);
    expect(iRpc).toBeLessThan(iCorte);
  });
});

describe('cortar: p_rappi_portal solo desde que existe el portal de la tienda', () => {
  it('portal desde 2026-10-24: el 23 manda false y el 24 manda true', async () => {
    const { db, llamadas } = clienteCorte({ existentes: [base.companyId], portalDesde: '2026-10-24' });
    const r = await cortar(db, {
      fechas: ['2026-10-23', '2026-10-24'],
      sucursales: [cfg(true)],
      leer: async () => lectura('completa'),
    });
    const porFecha = Object.fromEntries(
      llamadas
        .filter((l) => l.que === 'rpc')
        .map((l) => [(l.args as { p_fecha: string }).p_fecha, (l.args as { p_rappi_portal: boolean }).p_rappi_portal]),
    );
    expect(porFecha).toEqual({ '2026-10-23': false, '2026-10-24': true });
    expect(r.bi.fallidos).toEqual([]);
  });

  it('tienda con portal pero sin pedidos aún: manda false', async () => {
    const { db, llamadas } = clienteCorte({ existentes: [base.companyId], portalDesde: null });
    await cortar(db, { fechas: ['2020-01-01'], sucursales: [cfg(true)], leer: async () => lectura('completa') });
    expect((llamadas.find((l) => l.que === 'rpc')!.args as { p_rappi_portal: boolean }).p_rappi_portal).toBe(false);
  });

  it('si la consulta del inicio falla, manda false y lo anota con fecha *', async () => {
    const { db, llamadas } = clienteCorte({ existentes: [base.companyId], portalFalla: true });
    const r = await cortar(db, { fechas: ['2020-01-01'], sucursales: [cfg(true)], leer: async () => lectura('completa') });
    expect((llamadas.find((l) => l.que === 'rpc')!.args as { p_rappi_portal: boolean }).p_rappi_portal).toBe(false);
    expect(r.bi.fallidos).toEqual([
      { companyId: base.companyId, fecha: '*', motivo: 'inicio del portal de Rappi: sin acceso' },
    ]);
    expect(r.bi.guardados).toBe(1);
  });
});

describe('asegurarTiendasBi', () => {
  it('hace upsert con ignoreDuplicates solo de las faltantes, como Franquicia sin franquiciatario', async () => {
    const [a, b] = sucursalesConfiguradas;
    const { db, llamadas } = clienteCorte({ existentes: [a.companyId] });
    const { altas, fallidos } = await asegurarTiendasBi(db, [a, b]);
    expect(altas).toEqual([b.companyId]);
    expect(fallidos).toEqual([]);
    const up = llamadas.find((l) => l.que === 'upsert')!;
    expect(up.tabla).toBe('bi_tiendas');
    expect(up.opts).toEqual({ onConflict: 'company_id', ignoreDuplicates: true });
    expect(up.args).toEqual([
      {
        company_id: b.companyId,
        store_id: b.lookerStoreId,
        nombre: b.nombre,
        franquiciatario: null,
        tipo: 'Franquicia',
        fecha_apertura: null,
        origen_apertura: null,
      },
    ]);
  });

  it('sin faltantes no escribe nada', async () => {
    const [a] = sucursalesConfiguradas;
    const { db, llamadas } = clienteCorte({ existentes: [a.companyId] });
    expect(await asegurarTiendasBi(db, [a])).toEqual({ altas: [], fallidos: [] });
    expect(llamadas.some((l) => l.que === 'upsert')).toBe(false);
  });
});
