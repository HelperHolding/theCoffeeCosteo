import { describe, expect, it } from 'vitest';
import zoho from '../../docs/bi/zoho/filtros.json';
import { aJsonRpc, fechaRelativa } from '@/lib/bi/filtros';

const HOY = '2026-11-05'; // jueves; semana ISO del 2 al 8 de noviembre

describe('fechaRelativa', () => {
  const esperado: Record<string, [string, string]> = {
    Hoy: ['2026-11-05', '2026-11-05'],
    Ayer: ['2026-11-04', '2026-11-04'],
    'Esta semana': ['2026-11-02', '2026-11-05'],
    'Semana anterior': ['2026-10-26', '2026-11-01'],
    '2 semanas anteriores': ['2026-10-19', '2026-10-25'],
    '3 semanas anteriores': ['2026-10-12', '2026-10-18'],
    '4 semanas anteriores': ['2026-10-05', '2026-10-11'],
    'Últimas 4 semanas': ['2026-10-05', '2026-11-01'],
    'Este mes': ['2026-11-01', '2026-11-05'],
    'Mes anterior': ['2026-10-01', '2026-10-31'],
    'Últimos 3 meses': ['2026-08-01', '2026-10-31'],
    'Este trimestre': ['2026-10-01', '2026-11-05'],
    'Trimestre anterior': ['2026-07-01', '2026-09-30'],
    'Este año': ['2026-01-01', '2026-11-05'],
    'Año anterior': ['2025-01-01', '2025-12-31'],
  };
  it('cubre exactamente las opciones de filtros.json', () => {
    expect(Object.keys(esperado).sort()).toEqual([...zoho.fechaRelativa].sort());
  });
  for (const [opcion, [desde, hasta]] of Object.entries(esperado)) {
    it(opcion, () => expect(fechaRelativa(opcion, HOY)).toEqual({ desde, hasta }));
  }
  it('opción desconocida da null', () => expect(fechaRelativa('Others', HOY)).toBeNull());
  it('cruza el cambio de año', () => {
    expect(fechaRelativa('Mes anterior', '2026-01-15')).toEqual({ desde: '2025-12-01', hasta: '2025-12-31' });
    expect(fechaRelativa('Trimestre anterior', '2026-02-10')).toEqual({ desde: '2025-10-01', hasta: '2025-12-31' });
    expect(fechaRelativa('Semana anterior', '2026-01-01')).toEqual({ desde: '2025-12-22', hasta: '2025-12-28' });
  });
});

describe('aJsonRpc', () => {
  it('pasa a snake_case y omite vacíos y undefined', () => {
    expect(
      aJsonRpc({
        desde: '2026-10-05', hasta: '2026-10-06', companias: [513], dias: [], horas: [9], semanas: ['W41 2026'],
        aniosOperando: [1], comparable: false, cafe: ['Sí'], montoMin: 0, montoMax: undefined, productos: undefined,
      }),
    ).toEqual({
      desde: '2026-10-05', hasta: '2026-10-06', companias: [513], horas: [9], semanas: ['W41 2026'],
      anios_operando: [1], comparable: false, cafe: ['Sí'], monto_min: 0,
    });
  });
  it('pasa hoy si viene', () => {
    expect(aJsonRpc({ desde: 'a', hasta: 'b', companias: [1], hoy: '2026-11-05' })).toMatchObject({ hoy: '2026-11-05' });
  });
});
