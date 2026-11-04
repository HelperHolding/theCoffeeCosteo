import { describe, expect, it } from 'vitest';
import { sucursalesConfiguradas } from '../../lib/sucursales/config';
import { enZona } from '../../lib/sucursales/tiempo';

// Las sucursales se dan de alta por lotes (docs/sucursales/15): ningún id repetido y toda zona válida.
describe('configuración de sucursales', () => {
  it('company_id y número Jestor únicos', () => {
    const ids = sucursalesConfiguradas.map((s) => s.companyId);
    const jestor = sucursalesConfiguradas.map((s) => s.lookerStoreId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(jestor).size).toBe(jestor.length);
  });

  it('cada zona horaria existe y cada sucursal tiene ciudad y alcance', () => {
    for (const s of sucursalesConfiguradas) {
      expect(() => enZona(new Date('2026-11-03T18:00:00Z'), s.zona), `${s.nombre}: ${s.zona}`).not.toThrow();
      expect(s.ciudad.trim(), s.nombre).not.toBe('');
      expect(s.alcance.trim(), s.nombre).not.toBe('');
    }
  });

  it('Cd. Juárez y Tijuana con el desfase fijo de sus tickets (el POS no cambió de horario el 1-nov)', () => {
    const zona = (id: number) => sucursalesConfiguradas.find((s) => s.companyId === id)?.zona;
    expect(zona(612)).toBe('Etc/GMT+6');
    expect(zona(613)).toBe('Etc/GMT+7');
    // 3-nov 23:47 UTC: 17:47 con UTC−6 y 16:47 con UTC−7, como el último pedido de cada una.
    const t = new Date('2026-11-03T23:47:00Z');
    expect(enZona(t, 'Etc/GMT+6').segundo).toBe(17 * 3600 + 47 * 60);
    expect(enZona(t, 'Etc/GMT+7').segundo).toBe(16 * 3600 + 47 * 60);
  });
});
