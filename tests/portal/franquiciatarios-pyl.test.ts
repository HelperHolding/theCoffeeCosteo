import { describe, expect, it } from 'vitest';
import { armarPyl, fijosVigentes, lunesDe, metasDe } from '../../lib/franquiciatarios/pyl';

// F5: P&L mensual y metas de venta (día, semana, mes).
const fijos = fijosVigentes([
  { id: 1, concepto: 'renta', monto: 38381, origen: 'zoho', nombre: 'Importado de Zoho', registrado_en: 'a' },
  {
    id: 2,
    concepto: 'nomina',
    monto: 53000,
    origen: 'zoho',
    nombre: 'Importado de Zoho',
    registrado_en: 'a',
  },
  { id: 3, concepto: 'nomina', monto: 55000, origen: 'manual', nombre: 'Laura', registrado_en: 'b' }, // corrige
  {
    id: 4,
    concepto: 'energia',
    monto: 5300,
    origen: 'zoho',
    nombre: 'Importado de Zoho',
    registrado_en: 'a',
  },
]);

describe('fijosVigentes', () => {
  it('el último registro de cada concepto manda, en el orden de los conceptos', () => {
    expect(fijos.map((f) => [f.concepto, f.monto, f.origen])).toEqual([
      ['renta', 38381, 'zoho'],
      ['nomina', 55000, 'manual'],
      ['energia', 5300, 'zoho'],
    ]);
  });
});

describe('armarPyl', () => {
  const base = {
    diasMes: 30,
    diasTranscurridos: 15,
    ventaCent: 11_600_000, // $116,000 con IVA → $100,000 sin IVA
    descuentoCent: 200_000,
    ventaRappiCent: 2_320_000, // $23,200
    comisionPosCent: 116_000, // $1,160
    iva: 0.16,
    comisionRappi: 0.18,
    compras: 34_800, // $30,000 sin IVA
    cajaChica: 1_000,
    fijos,
  };
  it('líneas sin IVA, contribución, utilidad y proyección al cierre', () => {
    const p = armarPyl(base);
    const v = Object.fromEntries(p.lineas.map((l) => [l.clave, l]));
    expect(v.venta.real).toBe(116000);
    expect(v.netas.real).toBe(100000);
    // (23,200 × 18 % + 1,160) / 1.16 = (4,176 + 1,160) / 1.16 = 4,600
    expect(v.comisiones.real).toBe(4600);
    expect(v.compras.real).toBe(30000);
    expect(v.bruto.real).toBe(65400);
    expect(v.contribucion.real).toBe(64400);
    expect(v.utilidad.real).toBe(64400 - 98681);
    // A la mitad del mes: las variables se duplican y los fijos quedan igual.
    expect(v.netas.proyeccion).toBe(200000);
    expect(v['fijo-renta'].proyeccion).toBe(38381);
    expect(v.utilidad.proyeccion).toBe(128800 - 98681);
    expect(v['fijo-nomina'].nota).toBe('Capturado por Laura');
    expect(v['fijo-renta'].nota).toBe('Zoho · Gastos Sucursales');
  });
  it('punto de equilibrio en venta con IVA = fijos ÷ (contribución ÷ venta)', () => {
    const p = armarPyl(base);
    expect(p.puntoEquilibrio).toBeCloseTo(98681 / (64400 / 116000), 1);
    expect(
      armarPyl({ ...base, ventaCent: 0, ventaRappiCent: 0, comisionPosCent: 0 }).puntoEquilibrio,
    ).toBeNull();
  });
  it('el saldo de la app va en su propia línea (no es comisión) y baja el margen', () => {
    const p = armarPyl({ ...base, saldoAppCent: 232_000 }); // $2,320 → $2,000 sin IVA
    const v = Object.fromEntries(p.lineas.map((l) => [l.clave, l]));
    expect(v.comisiones.real).toBe(4600);
    expect(v['saldo-app'].real).toBe(2000);
    expect(v.bruto.real).toBe(63400);
    expect(armarPyl(base).lineas.some((l) => l.clave === 'saldo-app')).toBe(false);
  });
  it('sin descuentos no muestra la línea; mes cerrado: proyección = real', () => {
    const p = armarPyl({ ...base, descuentoCent: 0, diasTranscurridos: 30 });
    expect(p.lineas.some((l) => l.clave === 'descuentos')).toBe(false);
    expect(p.lineas.every((l) => l.real === l.proyeccion)).toBe(true);
  });
});

describe('metas', () => {
  it('lunes de la semana', () => {
    expect(lunesDe('2026-11-20')).toBe('2026-11-16'); // viernes
    expect(lunesDe('2026-11-22')).toBe('2026-11-16'); // domingo
    expect(lunesDe('2026-11-16')).toBe('2026-11-16');
  });
  it('día, semana (lunes a domingo) y mes; sin meta → null, nunca cero', () => {
    const diarias = ['2026-11-15', '2026-11-16', '2026-11-20', '2026-11-22', '2026-11-23'].map(
      (fecha, i) => ({
        fecha,
        venta_cent: (i + 1) * 100_000,
        tickets: 10,
      }),
    );
    expect(metasDe('2026-11-20', diarias, 31_469_100)).toEqual({
      dia: 3000,
      semana: 2000 + 3000 + 4000,
      mes: 314691,
      semanaDesde: '2026-11-16',
      semanaHasta: '2026-11-22',
    });
    expect(metasDe('2026-11-20', [], null)).toMatchObject({ dia: null, semana: null, mes: null });
  });
});
