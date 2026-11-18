// Plan 3f: el plan local completo sobre el motor (con la simulación del servidor) y las columnas nuevas que lee la carga.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ puente: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => m.puente }));
import { limpiarMotor, motorPlan, planLocalMotor, type MotorListo } from '../../lib/comercializadora/motor';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import {
  BORR_SEM,
  datosSem,
  SRV_SEM,
  ZPROV_SEM,
} from '../../supabase/functions/_shared/pruebas/fixturesSem.ts';

const listo = (R = datosSem(), cfg: Record<string, unknown> = {}): MotorListo => ({
  ok: true,
  R,
  cfg: normalizarCfgMotor(cfg),
  version: 1,
});

describe('plan local del motor (Plan de abastos y Esta semana)', () => {
  beforeEach(() => limpiarMotor());

  it('usa la simulación del servidor si está vigente, y calcula una sola vez por datos + configuración', () => {
    const mt = listo(datosSem({ srv: SRV_SEM }));
    const c = planLocalMotor(mt);
    expect(planLocalMotor(mt)).toBe(c);
    expect(c.fuenteCant).toBe('servidor');
    expect(c.rows.find((r) => r.sku === 'LOC-JAR-001')?.calc.pedirHoy).toBe(36);
    expect(c.vendorDe['jarabes mx']).toBe('v4');
  });

  it('con la simulación vieja (ok=false) se queda con el cálculo local', () => {
    const c = planLocalMotor(
      listo(datosSem({ srv: { ...SRV_SEM, ok: false, motivo: 'corrida de hace 40 h' } })),
    );
    expect(c.fuenteCant).toBe('local');
  });
});

describe('lo que lee la carga para el plan 3f', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://x');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'k');
    limpiarMotor();
    m.puente = dbFalsa({
      com_legado_pedidos: [],
      com_legado_aperturas: [],
      com_legado_pedidos_apertura: [],
    }).db;
  });
  afterEach(() => vi.unstubAllEnvs());

  it('pide la clasificación del catálogo, la fecha de sincronización de los borradores y los días de crédito', async () => {
    const columnas: Record<string, string[]> = {};
    const { db } = dbFalsa({
      com_plan_config: [{ id: 1, config: {}, version: 2 }],
      com_catalogo: [{ sku: 'LOC-JAR-001', nombre: 'Jarabe', estatus: 'Compra Recurrente' }],
      com_zoho_proveedor: ZPROV_SEM,
      com_zoho_oc_lineas: BORR_SEM.map((l) => ({ ...l, zoho_po_id: l.po_number, status: 'draft' })),
    });
    const espia = {
      ...db,
      from: (t: string) => {
        const q = db.from(t);
        const sel = q.select;
        q.select = (c?: string) => ((columnas[t] ??= []).push(c ?? ''), sel(c));
        return q;
      },
    };
    const r = await motorPlan(espia, new Date('2026-11-13T18:00:00Z'));
    if (!r.ok) throw new Error(r.error);
    expect(columnas.com_catalogo[0]).toContain('clasificacion_detallada');
    expect(columnas.com_zoho_oc_lineas[0]).toContain('synced_at');
    expect(columnas.com_zoho_proveedor[0]).toBe('vendor_id,nombre,minimo_compra,dias_credito');
    expect(r.R.zprov?.find((z) => z.vendor_id === 'v3')?.dias_credito).toBe(30);
    expect(r.R.ocZohoBorr).toHaveLength(BORR_SEM.length);
  });
});
