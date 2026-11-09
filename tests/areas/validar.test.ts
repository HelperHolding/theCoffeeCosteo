import { describe, expect, it } from 'vitest';
import { validarArqueo, validarTicket } from '../../lib/areas/validar';
import type { ArqueoCaja, TicketCompleto } from '../../lib/areas/tipos';

const PROHIBIDOS = ['Rubén Darío'];
const ticket = (): TicketCompleto => ({
  Cabecera: {
    COD_TPV: 'TC01',
    NUM_SES: 20261109,
    NUM_TIK: 32235824,
    TIP_OPE: 'V',
    MOM_OPE: '2026-11-09 10:15:00',
    IMP_VEN: 428.5,
    ID_MVO_DTO: 0,
    IMP_DTG: 19.5,
  },
  Detalles: [
    {
      NUM_LIN: 1,
      COD_ART: 1001,
      DES_ART: 'Latte',
      UNI_VEN: 1,
      PRE_UNI: 348,
      PRE_UNI_SIN_IVA: 300,
      PRE_UNI_SIN_IEPS: 300,
      PRE_FIN: 348,
      IMP_DTO: 20,
      POR_IVA: 16,
      BAS_IVA: 300,
      IMP_IVA: 48,
      POR_IEPS: 0,
      BAS_IEPS: 0,
      IMP_IEPS: 0,
    },
    {
      NUM_LIN: 2,
      COD_ART: 1002,
      DES_ART: 'Croissant',
      UNI_VEN: 1,
      PRE_UNI: 100,
      PRE_UNI_SIN_IVA: 86.21,
      PRE_UNI_SIN_IEPS: 86.21,
      PRE_FIN: 100,
      IMP_DTO: 0,
      POR_IVA: 16,
      BAS_IVA: 86.21,
      IMP_IVA: 13.79,
      POR_IEPS: 0,
      BAS_IEPS: 0,
      IMP_IEPS: 0,
    },
  ],
  FormasDePago: [{ NUM_ORD: 1, COD_FPG: 102, COD_MON: 1, IMP_FPG: 428.5, IMP_DIV: 428.5, CAM_MON: 1 }],
});
const arqueo = (): ArqueoCaja => ({
  COD_TPV: 'TC01',
  NUM_SES: 20261109,
  Fecha: '2026-11-09',
  Hora: '10:15:00',
  Monto: 428.5,
  Descuadres: 0,
});

describe('validarTicket', () => {
  it('un ticket correcto no tiene motivos', () => {
    expect(validarTicket(ticket(), PROHIBIDOS)).toEqual([]);
  });
  it('rechaza un DES_ART de 151 caracteres', () => {
    const t = ticket();
    t.Detalles[0].DES_ART = 'x'.repeat(151);
    expect(validarTicket(t, PROHIBIDOS).join(' ')).toMatch(/DES_ART/);
  });
  it('rechaza un ticket sin detalles o sin formas de pago', () => {
    expect(validarTicket({ ...ticket(), Detalles: [] }, PROHIBIDOS)).not.toEqual([]);
    expect(validarTicket({ ...ticket(), FormasDePago: [] }, PROHIBIDOS)).not.toEqual([]);
  });
  it('rechaza si las formas de pago no suman IMP_VEN', () => {
    const t = ticket();
    t.FormasDePago[0].IMP_FPG = 400;
    t.FormasDePago[0].IMP_DIV = 400;
    expect(validarTicket(t, PROHIBIDOS).join(' ')).toMatch(/formas de pago/i);
  });
  it('rechaza si IMP_FPG no es IMP_DIV × CAM_MON', () => {
    const t = ticket();
    t.FormasDePago[0].CAM_MON = 2;
    expect(validarTicket(t, PROHIBIDOS).join(' ')).toMatch(/IMP_FPG/);
  });
  it('rechaza si Σ PRE_FIN − IMP_DTG no es IMP_VEN', () => {
    const t = ticket();
    t.Cabecera.IMP_DTG = 10;
    expect(validarTicket(t, PROHIBIDOS).join(' ')).toMatch(/IMP_DTG/);
  });
  it('rechaza si IMP_IVA no es PRE_FIN − BAS_IVA', () => {
    const t = ticket();
    t.Detalles[1].IMP_IVA = 16;
    expect(validarTicket(t, PROHIBIDOS).join(' ')).toMatch(/IMP_IVA/);
  });
  it('acepta diferencias de un centavo por redondeo', () => {
    const t = ticket();
    t.Detalles[1].IMP_IVA = 13.8;
    expect(validarTicket(t, PROHIBIDOS)).toEqual([]);
  });
  it('rechaza un texto con el nombre de la tienda sin importar acentos ni mayúsculas', () => {
    const t = ticket();
    t.Detalles[0].DES_ART = 'Latte RUBEN DARIO';
    expect(validarTicket(t, PROHIBIDOS).join(' ')).toMatch(/anonimato/i);
  });
  it('rechaza un IMP_DTO negativo', () => {
    const t = ticket();
    t.Detalles[0].IMP_DTO = -1;
    expect(validarTicket(t, PROHIBIDOS)).not.toEqual([]);
  });
});

describe('validarArqueo', () => {
  it('un arqueo que suma sus tickets no tiene motivos', () => {
    expect(validarArqueo(arqueo(), [ticket()], PROHIBIDOS)).toEqual([]);
  });
  it('rechaza un COD_TPV de 5 caracteres', () => {
    expect(validarArqueo({ ...arqueo(), COD_TPV: 'TC001' }, [ticket()], PROHIBIDOS).join(' ')).toMatch(
      /COD_TPV/,
    );
  });
  it('rechaza un Monto que no es la suma de IMP_VEN', () => {
    expect(validarArqueo({ ...arqueo(), Monto: 500 }, [ticket()], PROHIBIDOS).join(' ')).toMatch(/Monto/);
  });
});

describe('validar · anonimato sin citar el texto', () => {
  it('el motivo dice dónde está el nombre pero no lo repite', () => {
    const t = ticket();
    t.Detalles[0].DES_ART = 'Latte Rubén Darío';
    const m = validarTicket(t, PROHIBIDOS).join(' ');
    expect(m).toMatch(/Anonimato/);
    expect(m).not.toMatch(/rub[eé]n|dar[ií]o/i);
  });
});
