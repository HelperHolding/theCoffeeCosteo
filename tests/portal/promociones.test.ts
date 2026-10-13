import { expect, it } from 'vitest';
import { simularPromocion, type EscenarioPromo } from '../../lib/portal/promociones';

const base: EscenarioPromo = {
  costo: 40,
  unidades: 1,
  precio: 116,
  descuento: 0,
  iva: 16,
  comision: 0,
  baseComision: 'sin-iva',
  extra: 0,
  objetivo: 50,
};

it('descuento y combo se aplican una vez; la comisión cambia con su base', () => {
  const neto = simularPromocion({
    ...base,
    precio: 232,
    descuento: 50,
    unidades: 2,
    comision: 10,
    extra: 5,
  })!;
  expect(neto.cobro).toBe(116);
  expect(Math.abs(neto.neto - 100)).toBeLessThan(1e-8);
  expect(neto.costo).toBe(80);
  expect(Math.abs(neto.contribucion - 5)).toBeLessThan(1e-8);
  const bruto = simularPromocion({ ...base, comision: 10, baseComision: 'con-iva' })!;
  expect(bruto.comision).toBeCloseTo(11.6, 8);
  expect(Math.abs(bruto.contribucion - 48.4)).toBeLessThan(1e-8);
});

it('el precio objetivo redondea hacia arriba y cumple el objetivo después del descuento', () => {
  const e = { ...base, descuento: 20, comision: 15, baseComision: 'con-iva' as const, extra: 3 };
  const r = simularPromocion(e)!;
  const objetivo = simularPromocion({ ...e, precio: r.precioObjetivo! })!;
  expect(objetivo.margen).toBeGreaterThanOrEqual(0.5);
  expect(simularPromocion({ ...e, precio: r.precioObjetivo! - 0.01 })!.margen).toBeLessThan(0.5);
  expect(Math.abs(simularPromocion({ ...e, precio: r.precioEquilibrio! })!.contribucion)).toBeLessThan(0.01);
});

it('los escenarios inválidos no dan cifras; un objetivo imposible no da precio', () => {
  for (const cambio of [
    { precio: 0 },
    { costo: -1 },
    { descuento: 100 },
    { comision: 100 },
    { unidades: 1.5 },
    { extra: NaN },
    { objetivo: 100 },
  ])
    expect(simularPromocion({ ...base, ...cambio })).toBeNull();
  expect(simularPromocion({ ...base, comision: 90, baseComision: 'con-iva' })!.precioObjetivo).toBeNull();
  expect(simularPromocion({ ...base, precio: 20 })!.contribucion).toBeLessThan(0);
});
