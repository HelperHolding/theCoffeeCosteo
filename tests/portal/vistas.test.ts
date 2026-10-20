import { expect, it } from 'vitest';
import { veMargenRappiEnTabla } from '../../lib/portal/vistas';

it('la columna de margen Rappi se decide por user_id exacto, no por rol ni coincidencias parciales', () => {
  expect(veMargenRappiEnTabla('184edce3-1d2c-486c-957d-aed731ba1692')).toBe(true);
  expect(veMargenRappiEnTabla('184EDCE3-1D2C-486C-957D-AED731BA1692')).toBe(false);
  expect(veMargenRappiEnTabla('184edce3')).toBe(false);
  expect(veMargenRappiEnTabla('')).toBe(false);
});
