import { describe, expect, it } from 'vitest';
import { validarCampo, validarMinMax } from '../../lib/comercializadora/catalogo';

describe('catálogo (port de _planEditarCampo y _comEditarMinMax)', () => {
  it('lead time: vacío = 0, 0–365, redondeado', () => {
    expect(validarCampo('lt', '')).toEqual({ valor: 0 });
    expect(validarCampo('lt', '12.6')).toEqual({ valor: 13 });
    expect(validarCampo('lt', '400')).toEqual({
      error: 'El lead time debe ser un número de 0 a 365 días (vacío o 0 = sin capturar)',
    });
  });
  it('apertura, mínimo y seguridad ≥ 0; múltiplo ≥ 1; seguridad vacía = null', () => {
    expect(validarCampo('apertura', '2.5')).toEqual({ valor: 2.5 });
    expect(validarCampo('minimo', '-1')).toEqual({ error: 'Ingresa un número mayor o igual a 0' });
    expect(validarCampo('multiplo', '0')).toEqual({ error: 'Ingresa un número mayor o igual a 1' });
    expect(validarCampo('dseg', '')).toEqual({ valor: null });
  });
  it('mín/máx manual: vacío = usar el calculado; ≥ 0; máx ≥ mín', () => {
    expect(validarMinMax('', '')).toEqual({ min: null, max: null });
    expect(validarMinMax('10', '')).toEqual({ min: 10, max: null });
    expect(validarMinMax('-1', '5')).toEqual({
      error: 'Valores inválidos: el mínimo y el máximo deben ser números de 0 o más.',
    });
    expect(validarMinMax('10', '5')).toEqual({ error: 'Valores inválidos: el máximo debe ser ≥ mínimo.' });
  });
});
