import { describe, expect, it } from 'vitest';
import { aArqueo } from '../../lib/areas/arqueo';
import type { TicketCompleto } from '../../lib/areas/tipos';

const t = (mom: string, venta: number) =>
  ({ Cabecera: { MOM_OPE: mom, IMP_VEN: venta } }) as unknown as TicketCompleto;

describe('aArqueo', () => {
  it('suma IMP_VEN en centavos y toma la hora del último ticket', () => {
    expect(
      aArqueo('2026-11-09', [
        t('2026-11-09 18:40:05', 65.1),
        t('2026-11-09 08:01:00', 0.2),
        t('2026-11-09 12:00:00', 100),
      ]),
    ).toEqual({
      COD_TPV: 'TC01',
      NUM_SES: 20261109,
      Fecha: '2026-11-09',
      Hora: '18:40:05',
      Monto: 165.3,
      Descuadres: 0,
    });
  });
});
