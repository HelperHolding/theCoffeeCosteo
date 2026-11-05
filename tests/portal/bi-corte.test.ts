import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { asegurarTiendasBi, cortar, rappiServicio } from '../../lib/sucursales/corte-servidor';
import { sucursalesConfiguradas } from '../../lib/sucursales/config';
import type { LecturaNormal } from '../../lib/sucursales/datos';

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
const clienteCorte = (opts: { existentes?: number[]; rpcError?: string } = {}) => {
  const llamadas: { que: string; tabla?: string; args?: unknown; opts?: unknown }[] = [];
  const respuestaSelect = { data: (opts.existentes ?? []).map((company_id) => ({ company_id })), error: null };
  const db = {
    from: (tabla: string) => ({
      select: () => {
        const r = Promise.resolve(tabla === 'bi_tiendas' ? respuestaSelect : { data: [], error: null });
        return Object.assign(r, { order: () => ({ range: async () => ({ data: [], error: null }) }) });
      },
      upsert: async (args: unknown, o?: unknown) => (llamadas.push({ que: 'upsert', tabla, args, opts: o }), { error: null }),
      insert: async (args: unknown) => (llamadas.push({ que: 'insert', tabla, args }), { error: null }),
      update: (args: unknown) => (
        llamadas.push({ que: 'update', tabla, args }),
        { lt: () => ({ not: async () => ({ error: null }) }) }
      ),
    }),
    rpc: async (nombre: string, args: unknown) => {
      llamadas.push({ que: 'rpc', tabla: nombre, args });
      return { error: opts.rpcError ? { message: opts.rpcError } : null };
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

const base = sucursalesConfiguradas[0];
const cfg = (rappiPortal: boolean) => ({ ...base, rappiPortal });

describe('cortar: guarda también el BI', () => {
  it('llama a bi_guardar_dia por tienda y día, con rappiPortal de la configuración', async () => {
    for (const rp of [true, false]) {
      const { db, llamadas } = clienteCorte({ existentes: [base.companyId] });
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
    (db as { rpc: unknown }).rpc = async () => {
      throw new Error('sin red');
    };
    const r = await cortar(db, { fechas: ['2020-01-01'], sucursales: [cfg(false)], leer: async () => lectura('completa') });
    expect(r.escritas).toBe(1);
    expect(r.bi.fallidos[0].motivo).toBe('sin red');
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

  it('dos cortes seguidos del mismo día llaman dos veces a bi_guardar_dia (el reemplazo es de la base)', async () => {
    const { db, llamadas } = clienteCorte({ existentes: [base.companyId] });
    for (let i = 0; i < 2; i++)
      await cortar(db, { fechas: ['2020-01-01'], sucursales: [cfg(false)], leer: async () => lectura('completa') });
    expect(llamadas.filter((l) => l.que === 'rpc')).toHaveLength(2);
  });
});

describe('asegurarTiendasBi', () => {
  it('hace upsert con ignoreDuplicates solo de las faltantes, como Franquicia sin franquiciatario', async () => {
    const [a, b] = sucursalesConfiguradas;
    const { db, llamadas } = clienteCorte({ existentes: [a.companyId] });
    const altas = await asegurarTiendasBi(db, [a, b]);
    expect(altas).toEqual([b.companyId]);
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
    expect(await asegurarTiendasBi(db, [a])).toEqual([]);
    expect(llamadas.some((l) => l.que === 'upsert')).toBe(false);
  });
});
