import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { importacionesMotor, limpiarMotor, type MotorListo } from '../../lib/comercializadora/motor';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { datosImp } from '../../supabase/functions/_shared/pruebas/fixturesImp.ts';

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
