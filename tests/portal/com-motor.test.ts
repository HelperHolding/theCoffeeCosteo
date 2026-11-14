import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ puente: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => m.puente }));
import { SIN_PUENTE } from '../../lib/comercializadora/legado';
import {
  limpiarMotor,
  memoMotor,
  motorPlan,
  servidorPlan,
  SIN_DATOS_PLAN,
} from '../../lib/comercializadora/motor';

const AHORA = new Date('2026-11-13T18:00:00Z'); // 13-nov 12:00 CDMX
const ped = (o: Record<string, unknown>) => ({
  id: 'p',
  apertura_id: null,
  franquiciatario_email: 'f@x.com',
  fecha_pedido: '2026-11-10T18:00:00Z',
  status: 'enviado',
  items: [{ sku: 'A', cantidad: 2 }],
  items_editados: null,
  notas_shopify: null,
  es_llenado_canal: false,
  marketing_proyecto_id: null,
  ...o,
});

function puente() {
  return dbFalsa({
    // El primero es el más viejo: dbFalsa no ordena y primerPedidoLegado toma la primera fila.
    com_legado_pedidos: [
      ped({ id: 'p4', fecha_pedido: '2026-05-01T12:00:00Z' }),
      ped({ id: 'p1', apertura_id: 'ap1' }),
      ped({ id: 'p2', status: 'cancelado' }),
      ped({ id: 'p3', status: null }),
    ],
    com_legado_aperturas: [
      { id: 'ap1', estatus: 'por_abrir', fecha: '2026-11-20', sucursal: 'Polanco' },
      { id: 'ap2', estatus: 'activa', fecha: '2026-01-10', sucursal: 'Roma' },
    ],
    com_legado_pedidos_apertura: [{ pedido_id: 'p1' }, { pedido_id: null }],
  });
}
function sesion(extra: Record<string, Record<string, unknown>[]> = {}) {
  return dbFalsa({
    com_plan_config: [{ id: 1, config: {}, version: 3 }],
    com_catalogo: [
      { sku: 'A', nombre: 'Vaso', estatus: 'Compra Recurrente', costo_unitario: 2 },
      { sku: 'B', nombre: 'Viejo', estatus: 'Inactivo' },
    ],
    com_lead_times: [{ sku: 'A', dias: 9 }],
    com_sku_mapping: [{ shopify_nombre: 'Vaso 12oz', sku: 'A' }],
    com_movimientos: [
      {
        id: 'm1',
        tipo: 'compra',
        sku: 'A',
        folio: 'OC-1',
        fecha: '2026-11-01',
        cantidad: 10,
        cantidad_recibida: 0,
      },
      {
        id: 'm2',
        tipo: 'venta',
        estado: 'por_enviar',
        sku: 'A',
        folio: 'V-1',
        cantidad: 3,
        fecha: '2026-11-12',
      },
      {
        id: 'm3',
        tipo: 'venta',
        estado: 'enviado',
        sku: 'A',
        folio: 'V-0',
        cantidad: 9,
        fecha: '2026-11-01',
      },
      {
        id: 'm4',
        tipo: 'ajuste',
        motivo: 'Conteo físico',
        sku: 'A',
        origen: 'CEDIS',
        fecha_conteo: '2026-11-01',
      },
      { id: 'm5', tipo: 'ajuste', motivo: 'Conteo físico', sku: 'A', origen: 'Yulius', fecha: '2026-10-20' },
    ],
    com_zoho_oc_lineas: [
      {
        zoho_po_id: 'z1',
        po_number: 'OC-9',
        status: 'draft',
        sku: 'A',
        cantidad: 5,
        cantidad_recibida: 0,
        precio: 2,
      },
      {
        zoho_po_id: 'z2',
        po_number: 'OC-8',
        status: 'open',
        sku: 'A',
        cantidad: 5,
        cantidad_recibida: 0,
        precio: 2,
      },
    ],
    com_sync_log: [],
    com_pago_proyectado: [],
    ...extra,
  });
}

describe('motor del plan: carga (port de _planDatCargar) y caché', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://x');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'k');
    limpiarMotor();
    m.puente = puente().db;
  });
  afterEach(() => vi.unstubAllEnvs());

  it('arma los datos crudos: catálogo sin inactivos, pedidos vigentes de la ventana, kits, conteos y borradores', async () => {
    const r = await motorPlan(sesion().db, AHORA);
    if (!r.ok) throw new Error(r.error);
    expect(r.version).toBe(3);
    expect(r.R.hoy).toBe('2026-11-13');
    expect(r.R.hist).toBe(90); // ventana de Importaciones por defecto
    expect(r.R.histReal).toBe(197); // 1-may → 13-nov, días de CDMX, +1
    expect(r.R.cat.map((c) => c.sku)).toEqual(['A']);
    expect(r.R.pedidos.map((p) => p.id)).toEqual(['p1']); // p4 fuera de la ventana; cancelado y status nulo fuera
    expect(r.R.comp.map((x) => x.id)).toEqual(['m2']);
    expect(r.R.aperturas).toEqual([
      {
        id: 'ap1',
        estatus: 'en_proceso',
        estatusOrig: 'por_abrir',
        fecha: '2026-11-20',
        sucursal: 'Polanco',
      },
      { id: 'ap2', estatus: 'activa', estatusOrig: 'activa', fecha: '2026-01-10', sucursal: 'Roma' },
    ]);
    expect(r.R.kit).toEqual({ ap1: true });
    expect(r.R.pedAper).toEqual([{ pedido_id: 'p1' }]);
    expect(r.R.conteoUlt).toEqual({ cedis: { A: '2026-11-01' }, yulius: { A: '2026-10-20' } });
    expect(r.R.ocZohoBorr?.map((l) => l.po_number)).toEqual(['OC-9']);
    expect(r.R.srv).toMatchObject({ ok: false, motivo: 'sin corrida' });
    expect(r.R.avisos).toEqual([]);
  });

  it('sin puente o sin llave de servicio: no calcula y lo dice claro', async () => {
    m.puente = dbFalsa({}, [{ tabla: 'com_legado_pedidos', op: 'select' }]).db;
    expect(await motorPlan(sesion().db, AHORA)).toEqual({ ok: false, error: SIN_PUENTE });
    limpiarMotor();
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(await motorPlan(sesion().db, AHORA)).toEqual({ ok: false, error: SIN_PUENTE });
  });

  it('si falla una lectura obligatoria de com_*, no calcula', async () => {
    const s = dbFalsa({ com_plan_config: [{ id: 1, config: {}, version: 1 }] }, [
      { tabla: 'com_catalogo', op: 'select' },
    ]);
    expect(await motorPlan(s.db, AHORA)).toEqual({ ok: false, error: SIN_DATOS_PLAN });
  });

  it('sin aperturas: sigue con un aviso (el plan no suma aperturas ni kits)', async () => {
    const p = puente();
    m.puente = dbFalsa(p.tablas, [{ tabla: 'com_legado_aperturas', op: 'select' }]).db;
    const r = await motorPlan(sesion().db, AHORA);
    if (!r.ok) throw new Error(r.error);
    expect(r.R.avisos).toEqual(['aperturas']);
    expect(r.R.aperturas).toEqual([]);
    expect(r.R.kit).toEqual({});
  });

  it('reutiliza los datos 10 minutos; después, o al cambiar el día de CDMX, vuelve a leer', async () => {
    const s = sesion();
    const lecturas = () => s.consultas.filter((c) => c.tabla === 'com_catalogo').length;
    await motorPlan(s.db, new Date('2026-11-14T05:50:00Z')); // 13-nov 23:50 CDMX
    await motorPlan(s.db, new Date('2026-11-14T05:58:00Z'));
    expect(lecturas()).toBe(1);
    const r = await motorPlan(s.db, new Date('2026-11-14T06:01:00Z')); // 14-nov 00:01 CDMX
    expect(lecturas()).toBe(2);
    expect(r.ok && r.R.hoy).toBe('2026-11-14');
    await motorPlan(s.db, new Date('2026-11-14T06:12:00Z'));
    expect(lecturas()).toBe(3);
  });

  it('si otra persona guarda una configuración que pide más historia, vuelve a leer con esa historia', async () => {
    const s = sesion();
    await motorPlan(s.db, AHORA);
    s.tablas.com_plan_config[0].config = { compra: { bt_semanas: 12, prox_dias: 14 } };
    s.tablas.com_plan_config[0].version = 4;
    const r = await motorPlan(s.db, new Date(AHORA.getTime() + 60_000));
    expect(r.ok && [r.R.hist, r.version]).toEqual([198, 4]);
  });

  it('memoMotor calcula una vez por datos + configuración; limpiarMotor la vacía', async () => {
    const r = await motorPlan(sesion().db, AHORA);
    if (!r.ok) throw new Error(r.error);
    const fn = vi.fn(() => 42);
    expect(memoMotor(r, 'kpi', fn)).toBe(42);
    expect(memoMotor(r, 'kpi', fn)).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
    limpiarMotor();
    memoMotor(r, 'kpi', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('simulación del servidor: reciente y completa, incompleta o vieja', async () => {
    const log = (filas: number, calc = '2026-11-13T12:30:00Z') => ({
      com_sync_log: [
        {
          proceso: 'com-proyeccion',
          ok: true,
          inicio: calc,
          resumen: { calculado_at: calc, filas, sinCosto: ['Z'] },
        },
      ],
      com_pago_proyectado: [
        {
          id: 1,
          calculado_at: '2026-11-13T12:30:00Z',
          sku: 'A',
          tipo: 'proyectado',
          fecha_oc: '2026-11-13',
          cantidad: 4,
          monto: 8,
        },
        {
          id: 2,
          calculado_at: '2026-11-13T12:30:00Z',
          sku: 'A',
          tipo: 'oc',
          fecha_pago: '2026-11-20',
          monto: 20,
        },
      ],
    });
    const ok = await servidorPlan(sesion(log(2)).db, AHORA.getTime());
    expect(ok).toMatchObject({ ok: true, sinCosto: ['Z'], compras: [{ sku: 'A', cantidad: 4 }] });
    expect((await servidorPlan(sesion(log(5)).db, AHORA.getTime())).motivo).toBe(
      'corrida incompleta (se está recalculando)',
    );
    expect((await servidorPlan(sesion(log(2, '2026-11-12T02:00:00Z')).db, AHORA.getTime())).motivo).toBe(
      'corrida de hace 40 h',
    );
  });
});
