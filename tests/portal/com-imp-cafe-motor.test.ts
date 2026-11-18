import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ puente: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => m.puente }));
import {
  cafeMotor,
  cafeOrdenesMotor,
  importacionesMotor,
  limpiarMotor,
  motorPlan,
  type MotorListo,
} from '../../lib/comercializadora/motor';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { datosImp, ZPROV } from '../../supabase/functions/_shared/pruebas/fixturesImp.ts';

const listo = (cfg: Record<string, unknown> = {}, R = datosImp()): MotorListo => ({
  ok: true,
  R,
  cfg: normalizarCfgMotor(cfg),
  version: 1,
});

describe('Importaciones sobre el motor del servidor', () => {
  beforeEach(() => limpiarMotor());

  it('calcula una vez por datos + configuración + escenario de la vista', () => {
    const mt = listo();
    const a = importacionesMotor(mt, null);
    expect(importacionesMotor(mt, null)).toBe(a);
    expect(a.esc).toBe('Base');
    expect(a.S.meses).toHaveLength(15);
    const p = importacionesMotor(mt, 'Pesimista');
    expect(p).not.toBe(a);
    expect(p.esc).toBe('Pesimista');
  });

  it('la configuración guardada sin sección imp usa la de la hoja (19 artículos)', () => {
    const c = importacionesMotor(listo(), null);
    expect(c.cfg.imp.orden).toHaveLength(19);
    expect(c.ent.items.length).toBe(19);
  });
});

describe('Café sobre el motor del servidor y los mínimos de proveedor', () => {
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

  const sesion = (fallar: { tabla: string; op: string }[] = []) =>
    dbFalsa(
      {
        com_plan_config: [{ id: 1, config: {}, version: 2 }],
        com_catalogo: [{ sku: 'INS-CAF-001', nombre: 'Café tostado 1 kg', estatus: 'Compra Recurrente' }],
        com_zoho_proveedor: ZPROV,
      },
      fallar,
    );

  it('lee los mínimos de proveedor de Zoho (R.zprov); si falla, sigue con el aviso "mínimos de proveedor"', async () => {
    const r = await motorPlan(sesion().db, new Date('2026-11-13T18:00:00Z'));
    if (!r.ok) throw new Error(r.error);
    expect(r.R.zprov).toEqual(ZPROV);
    expect(r.R.avisos).toEqual([]);
    limpiarMotor();
    const f = await motorPlan(
      sesion([{ tabla: 'com_zoho_proveedor', op: 'select' }]).db,
      new Date('2026-11-13T18:00:00Z'),
    );
    if (!f.ok) throw new Error(f.error);
    expect([f.R.zprov, f.R.avisos]).toEqual([[], ['mínimos de proveedor']]);
  });

  it('cafeMotor y cafeOrdenesMotor calculan una vez; el escenario de la vista cambia la corrida', () => {
    const mt = listo({}, datosImp({ zprov: ZPROV }));
    const a = cafeMotor(mt, null);
    expect(cafeMotor(mt, null)).toBe(a);
    expect([a.esc, cafeMotor(mt, 'Optimista').esc]).toEqual(['Base', 'Optimista']);
    const o = cafeOrdenesMotor(mt);
    expect(cafeOrdenesMotor(mt)).toBe(o);
    expect(o.provs.map((g) => g.key).sort()).toEqual(['caficultores omac', 'tostador local']);
  });
});
