import { describe, expect, it } from 'vitest';
import { estadoMinimo, origenMinimo, validarMonto } from '../../lib/comercializadora/minimos';

describe('mínimos (port de _minEstado, _minOrigenTxt, _minValidar)', () => {
  it('estado: error gana a pendiente; si no, sincronizado', () => {
    expect(estadoMinimo({ minimo_error: 'sin campo', minimo_pendiente: true })).toEqual({
      k: 'error',
      txt: 'Error: sin campo',
    });
    expect(estadoMinimo({ minimo_pendiente: true })).toEqual({ k: 'pendiente', txt: 'Pendiente de enviar' });
    expect(estadoMinimo({})).toEqual({ k: 'ok', txt: 'Sincronizado' });
  });
  it('origen con fecha corta', () => {
    expect(origenMinimo({ minimo_origen: 'migracion' })).toBe('Migrado');
    expect(origenMinimo({ minimo_origen: 'zoho', minimo_editado_at: '2026-11-12T18:00:00Z' })).toBe(
      'Zoho, 12 nov',
    );
    expect(origenMinimo({})).toBe('—');
  });
  it('monto: miles con coma, $ y hasta 2 decimales; lo demás es inválido', () => {
    expect(validarMonto('15000')).toBe(15000);
    expect(validarMonto('$15,000.50')).toBe(15000.5);
    expect(validarMonto('15.123')).toBeNull();
    expect(validarMonto('1,5')).toBeNull();
    expect(validarMonto('-3')).toBeNull();
    expect(validarMonto('1e5')).toBeNull();
  });
});
