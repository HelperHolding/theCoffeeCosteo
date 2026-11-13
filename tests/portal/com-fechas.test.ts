import { describe, expect, it } from 'vitest';
import { difDias, fechaCorta, hoyCdmx, masDias } from '../../lib/comercializadora/fechas';

describe('fechas de Comercializadora', () => {
  it('hoy es el día de Ciudad de México, no el de UTC', () => {
    expect(hoyCdmx(new Date('2026-11-13T05:30:00Z'))).toBe('2026-11-12'); // 23:30 del 12 en CDMX
    expect(hoyCdmx(new Date('2026-11-13T06:30:00Z'))).toBe('2026-11-13');
  });
  it('suma y resta días cruzando meses y años', () => {
    expect(masDias('2026-12-30', 3)).toBe('2027-01-02');
    expect(masDias('2026-03-01', -1)).toBe('2026-02-28');
    expect(difDias('2026-11-28', '2026-12-05')).toBe(7);
  });
  it('fecha corta en español', () => {
    expect(fechaCorta('2026-12-05')).toBe('5 dic');
  });
});
