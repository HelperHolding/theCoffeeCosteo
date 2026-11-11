import { describe, expect, it } from 'vitest';
import { codigoPago, FORMAS_PAGO } from '../../lib/areas/pagos';

describe('codigoPago', () => {
  it.each([
    ['DINHEIRO', 'CASH', 101],
    ['DINHEIRO', 'CONTINGENCY', 101],
    ['CARTAO', 'EMV', 102],
    ['CARTAO', 'CONTACTLESS_EMV', 102],
    ['CARTAO', 'CONTINGENCY', 102],
    ['CARTAO', 'WALLET', 103],
    ['VIRTUAL_WALLET', 'WALLET', 103],
    ['WALLET_BALANCE', 'WALLET', 104],
  ])('%s / %s → %i', (metodo, tipo, codigo) => {
    expect(codigoPago({ metodo, tipo })).toBe(codigo);
  });
  it('Rappi no se maneja con Areas: no tiene código', () => {
    for (const tipo of ['CREDIT', 'RAPPI_PORTAL', 'RAPPI_TURBO'])
      expect(codigoPago({ metodo: 'RAPPI', tipo })).toBeNull();
  });
  it('una combinación desconocida no tiene código', () => {
    expect(codigoPago({ metodo: 'IFOOD', tipo: 'CONTINGENCY' })).toBeNull();
    expect(codigoPago({ metodo: 'CARTAO', tipo: 'OTRO' })).toBeNull();
    expect(codigoPago({ metodo: '', tipo: '' })).toBeNull();
  });
  it('cada código que devuelve existe en FORMAS_PAGO', () => {
    expect(FORMAS_PAGO.map((f) => f.codigo)).toEqual([101, 102, 103, 104]);
  });
});
