import { describe, expect, it } from 'vitest';
import { cambio, horaCorte, periodoAnterior } from '@/lib/bi/comparacion';

const ant = (fr: string | undefined, desde: string, hasta: string) => periodoAnterior(fr, { desde, hasta });

describe('periodoAnterior', () => {
  it('días: Hoy y Ayer comparan contra el día previo', () => {
    expect(ant('hoy', '2026-11-19', '2026-11-19')).toEqual({ desde: '2026-11-18', hasta: '2026-11-18' });
    expect(ant('ayer', '2026-11-18', '2026-11-18')).toEqual({ desde: '2026-11-17', hasta: '2026-11-17' });
  });

  it('semanas: mismos días de la semana previa', () => {
    expect(ant('esta-semana', '2026-11-16', '2026-11-18')).toEqual({ desde: '2026-11-09', hasta: '2026-11-11' });
    for (const fr of ['semana-anterior', '2-semanas-anteriores', '3-semanas-anteriores', '4-semanas-anteriores'])
      expect(ant(fr, '2026-11-09', '2026-11-15')).toEqual({ desde: '2026-11-02', hasta: '2026-11-08' });
    expect(ant('ultimas-4-semanas', '2026-10-19', '2026-11-15')).toEqual({ desde: '2026-09-21', hasta: '2026-10-18' });
  });

  it('meses: mismo tramo del mes anterior, recortado al fin de mes', () => {
    expect(ant('este-mes', '2026-11-01', '2026-11-19')).toEqual({ desde: '2026-10-01', hasta: '2026-10-19' });
    expect(ant('este-mes', '2026-03-01', '2026-03-31')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(ant('este-mes', '2028-03-01', '2028-03-30')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
    expect(ant('mes-anterior', '2026-03-01', '2026-03-31')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(ant('ultimos-3-meses', '2026-08-01', '2026-10-31')).toEqual({ desde: '2026-05-01', hasta: '2026-07-31' });
  });

  it('trimestres y años', () => {
    expect(ant('este-trimestre', '2026-10-01', '2026-11-19')).toEqual({ desde: '2026-07-01', hasta: '2026-08-19' });
    expect(ant('este-trimestre', '2026-04-01', '2026-05-31')).toEqual({ desde: '2026-01-01', hasta: '2026-02-28' });
    expect(ant('trimestre-anterior', '2026-07-01', '2026-09-30')).toEqual({ desde: '2026-04-01', hasta: '2026-06-30' });
    expect(ant('este-ano', '2026-01-01', '2026-11-19')).toEqual({ desde: '2025-01-01', hasta: '2025-11-19' });
    expect(ant('este-ano', '2028-01-01', '2028-02-29')).toEqual({ desde: '2027-01-01', hasta: '2027-02-28' });
    expect(ant('ano-anterior', '2025-01-01', '2025-12-31')).toEqual({ desde: '2024-01-01', hasta: '2024-12-31' });
  });

  it('rango libre: los N días inmediatamente anteriores, también al cruzar el año', () => {
    expect(ant(undefined, '2026-11-01', '2026-11-10')).toEqual({ desde: '2026-10-22', hasta: '2026-10-31' });
    expect(ant(undefined, '2026-01-01', '2026-01-03')).toEqual({ desde: '2025-12-29', hasta: '2025-12-31' });
  });
});

describe('horaCorte', () => {
  it('solo si el periodo termina hoy y el último corte es de hoy (hora de CDMX)', () => {
    // 17:30 UTC = 11:30 en CDMX
    expect(horaCorte('2026-11-19T17:30:00Z', '2026-11-19', '2026-11-19')).toBe(11);
    expect(horaCorte('2026-11-19T17:30:00Z', '2026-11-18', '2026-11-19')).toBeNull();
    expect(horaCorte(null, '2026-11-19', '2026-11-19')).toBeNull();
  });

  it('el corte de ayer (madrugada, antes del primer corte de hoy) no recorta', () => {
    // 03:00 UTC del 19 = 21:00 del 18 en CDMX
    expect(horaCorte('2026-11-19T03:00:00Z', '2026-11-19', '2026-11-19')).toBeNull();
  });
});

describe('cambio', () => {
  it('sube, baja e igual (menos de 0.1 %)', () => {
    expect(cambio(110, 100)).toEqual({ pct: 0.1, dir: 'sube' });
    expect(cambio(90, 100)).toEqual({ pct: -0.1, dir: 'baja' });
    expect(cambio(100.05, 100)).toEqual({ pct: expect.closeTo(0.0005, 6), dir: 'igual' });
  });

  it('sin base no hay comparación (nunca +∞ %)', () => {
    expect(cambio(100, 0)).toBeNull();
    expect(cambio(100, null)).toBeNull();
    expect(cambio(null, 100)).toBeNull();
  });
});
