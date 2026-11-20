import { describe, expect, it } from 'vitest';
import {
  efectivoHasta,
  gastosEfectivoHasta,
  gastosVigentes,
  resumenArqueo,
  type GastoCaja,
  type PedidoCaja,
} from '../../lib/franquiciatarios/caja';

// F4: lo esperado en caja (efectivo del POS en el día de operación hasta la hora del arqueo) y el resumen.
const s = (h: number, m = 0) => h * 3600 + m * 60;
const ped = (fecha: string, segundo: number, metodo: string, ventaCent: number): PedidoCaja => ({
  fecha,
  segundo,
  metodo,
  ventaCent,
});

describe('efectivoHasta', () => {
  const pedidos = [
    ped('2026-11-20', s(3, 50), 'DINHEIRO', 999), // antes de las 4:00: día anterior
    ped('2026-11-20', s(8), 'DINHEIRO', 10000),
    ped('2026-11-20', s(9), 'CARTAO', 50000), // tarjeta: no es efectivo
    ped('2026-11-20', s(14), 'DINHEIRO', 5000),
    ped('2026-11-21', s(1), 'DINHEIRO', 700), // después de medianoche: sigue en el día 20
    ped('2026-11-21', s(5), 'DINHEIRO', 300), // ya es el día 21
  ];
  it('medio turno: solo el efectivo del día hasta la hora del arqueo', () => {
    expect(efectivoHasta(pedidos, '2026-11-20', { fecha: '2026-11-20', segundo: s(13) })).toBe(10000);
  });
  it('cierre después de medianoche: incluye lo de la madrugada hasta el arqueo, nunca después de las 4:00', () => {
    expect(efectivoHasta(pedidos, '2026-11-20', { fecha: '2026-11-21', segundo: s(1, 30) })).toBe(15700);
    expect(efectivoHasta(pedidos, '2026-11-20', { fecha: '2026-11-21', segundo: s(9) })).toBe(15700);
  });
});

describe('gastos y resumen', () => {
  const g = (id: number, monto: number | null, extra: Partial<GastoCaja> = {}): GastoCaja => ({
    id,
    dia: '2026-11-20',
    concepto: 'x',
    categoria: 'insumos',
    monto,
    en_efectivo: true,
    comprobante: false,
    nota: null,
    anula_id: null,
    nombre: 'Laura',
    registrado_en: '2026-11-20T16:00:00Z',
    ...extra,
  });
  it('sin anulados ni anulaciones; solo efectivo y hasta la hora', () => {
    const gastos = [
      g(1, 80),
      g(2, 120),
      g(3, null, { anula_id: 2, concepto: null, categoria: null, nota: 'doble' }),
      g(4, 300, { en_efectivo: false }),
      g(5, 50, { registrado_en: '2026-11-20T23:00:00Z' }),
    ];
    expect(gastosVigentes(gastos).map((x) => x.id)).toEqual([1, 4, 5]);
    expect(gastosEfectivoHasta(gastos, '2026-11-20T20:00:00Z')).toBe(80);
  });
  it('esperado = fondo + efectivo − gastos; fuera de tolerancia', () => {
    expect(
      resumenArqueo({ contado: 1650, fondo: 1500, tolerancia: 20, efectivoCent: 25050, gastos: 80 }),
    ).toEqual({
      contado: 1650,
      fondo: 1500,
      efectivoPos: 250.5,
      gastos: 80,
      esperado: 1670.5,
      diferencia: -20.5,
      fuera: true,
    });
    expect(
      resumenArqueo({ contado: 1670, fondo: 1500, tolerancia: 20, efectivoCent: 25050, gastos: 80 }).fuera,
    ).toBe(false);
  });
});
