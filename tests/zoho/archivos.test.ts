import { describe, expect, it } from 'vitest';
import { nombreLimpio } from '../../scripts/zoho/archivos';

describe('nombreLimpio', () => {
  it('repara UTF-8 leído como Latin-1, también en NFD, y deja intactos los nombres sanos', () => {
    expect(nombreLimpio('PresentaciA\u0303\u00b3n.pdf')).toBe('Presentación.pdf');
    expect(nombreLimpio('PresentaciÃ³n.pdf')).toBe('Presentación.pdf');
    expect(nombreLimpio('Cotizacio\u0301n Año.pdf')).toBe('Cotización Año.pdf');
    expect(nombreLimpio('  ')).toBe('archivo');
    expect(nombreLimpio(null)).toBe('archivo');
  });
});
