import { describe, expect, it } from 'vitest';
import { agruparPagos, kpisPagos, periodoPago } from '../../lib/comercializadora/pagos';

const p = (o: Record<string, unknown>) => ({
  tipo: 'proyectado',
  sku: 'A',
  nombre: 'Café',
  vendor_id: 'v1',
  vendor_name: 'Prov',
  fecha_oc: '2026-11-13',
  fecha_pago: '2026-11-20',
  cantidad: 1,
  monto: 100,
  ...o,
});

describe('periodos de pago (_pagPeriodo)', () => {
  it('semana de lunes a domingo', () => {
    expect(periodoPago('2026-11-13', 'semana')).toMatchObject({
      ini: '2026-11-09',
      fin: '2026-11-15',
      etiqueta: '9 nov',
    });
    expect(periodoPago('2026-11-15', 'semana').ini).toBe('2026-11-09'); // domingo
  });
  it('quincena 1–15 y 16–fin de mes, y mes completo', () => {
    expect(periodoPago('2026-02-20', 'quincena')).toMatchObject({
      ini: '2026-02-16',
      fin: '2026-02-28',
      etiqueta: '16–28 feb',
    });
    expect(periodoPago('2026-11-03', 'quincena')).toMatchObject({ ini: '2026-11-01', fin: '2026-11-15' });
    expect(periodoPago('2026-12-31', 'mes')).toMatchObject({
      ini: '2026-12-01',
      fin: '2026-12-31',
      etiqueta: 'dic 2026',
    });
  });
});

describe('agruparPagos (_pagAgrupar)', () => {
  it('columnas desde el periodo de hoy; lo vencido cae en hoy; sin comprometido si se pide', () => {
    const filas = [
      p({ fecha_pago: '2026-11-01', monto: 50, tipo: 'comprometido' }),
      p({ fecha_pago: '2026-11-20', monto: 100 }),
      p({ fecha_pago: '2026-11-25', monto: 30, vendor_id: 'v2', vendor_name: 'Otro' }),
    ];
    const r = agruparPagos(filas as never, 'semana', 'fecha_pago', true, '2026-11-13');
    expect(r.periodos.map((x) => x.ini)).toEqual(['2026-11-09', '2026-11-16', '2026-11-23']);
    expect(r.tot['2026-11-09']).toEqual({ proy: 0, comp: 50, cant: 1 });
    expect(r.provs.map((x) => [x.nombre, x.total])).toEqual([
      ['Prov', 150],
      ['Otro', 30],
    ]);
    const sin = agruparPagos(filas as never, 'semana', 'fecha_pago', false, '2026-11-13');
    expect(sin.tot['2026-11-09']).toBeUndefined();
  });
});

describe('kpisPagos', () => {
  it('esta semana (hasta el domingo, con lo vencido), próximos 30 días, periodo más pesado y comprometido', () => {
    const k = kpisPagos(
      [
        p({ fecha_pago: '2026-11-10', monto: 40, tipo: 'comprometido' }),
        p({ fecha_pago: '2026-11-15', monto: 60 }),
        p({ fecha_pago: '2026-12-01', monto: 500 }),
        p({ fecha_pago: '2027-01-30', monto: 900 }),
      ] as never,
      '2026-11-13',
    );
    expect(k).toEqual({
      estaSemana: 100,
      proximos30: 600,
      pesado: { etiqueta: '25 ene', monto: 900 },
      comprometido: 40,
    });
  });
});
