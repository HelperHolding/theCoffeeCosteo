// Correcciones de la revisión final del plan 4 (I1: reversa sin auto.modo del portal; I3: tope de tiempo del job de OVs).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { deltaTabla } from '../../scripts/migracion-legado/reversa-comercializadora-lib';

const T = { tabla: 'com_plan_config', llave: ['id'], secuencia: null } as never;
const COLS = ['id', 'config', 'version'];

describe('revisión plan 4 (I1): la reversa no le devuelve al viejo el modo de OC del portal', () => {
  it('conserva auto.modo del viejo y lleva lo demás de la configuración del portal', () => {
    const portal = [
      { id: 1, version: 9, config: { auto: { modo: 'simulacion', correos: ['a@x'] }, inv: { base: 'x' } } },
    ];
    const viejo = [
      { id: 1, version: 8, config: { auto: { modo: 'real', correos: [] }, inv: { base: 'y' } } },
    ];
    const d = deltaTabla(T, COLS, portal, viejo);
    expect(d.upserts).toEqual([
      { id: 1, version: 9, config: { auto: { modo: 'real', correos: ['a@x'] }, inv: { base: 'x' } } },
    ]);
  });

  it('si lo único distinto es auto.modo, no hay nada que regresar', () => {
    const portal = [{ id: 1, version: 8, config: { auto: { modo: 'simulacion' }, inv: { base: 'x' } } }];
    const viejo = [{ id: 1, version: 8, config: { auto: { modo: 'real' }, inv: { base: 'x' } } }];
    expect(deltaTabla(T, COLS, portal, viejo).upserts).toEqual([]);
  });

  it('las demás tablas no cambian', () => {
    const t = { tabla: 'com_lead_times', llave: ['sku'], secuencia: null } as never;
    const d = deltaTabla(t, ['sku', 'dias'], [{ sku: 'A', dias: 5 }], [{ sku: 'A', dias: 7 }]);
    expect(d.upserts).toEqual([{ sku: 'A', dias: 5 }]);
  });
});

describe('revisión plan 4 (I3): el job de OVs no se queda colgado si el puente no responde', () => {
  it('el comando del cron pone un tope de tiempo antes de derivar', () => {
    const sql = readFileSync('supabase/migrations/20261118000070_comercializadora_ov_pedidos.sql', 'utf8');
    const cmd = sql.match(/cron\.schedule\('com-ov-pedidos', '[^']+', \$c\$(.*?)\$c\$/s)?.[1] ?? '';
    expect(cmd).toMatch(/set statement_timeout = '5min';\s*select public\.com_derivar_ov\(true\)/);
  });
});
