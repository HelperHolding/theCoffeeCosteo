import { expect, it } from 'vitest';
import { cumpleFiltro, ordenarPorMargen, type MargenRappi } from '../../lib/portal/margen-rappi';

const m = (pct: number | null, estado: MargenRappi['estado']): { margenRappi: MargenRappi } => ({
  margenRappi: { pct, importe: pct === null ? null : pct * 100, estado },
});
const ok = { nombre: 'ok', precios: [m(0.55, 'ok'), m(0.6, 'ok')] };
const mixto = { nombre: 'mixto', precios: [m(0.3, 'bajo'), m(0.52, 'ok')] };
const pierde = { nombre: 'pierde', precios: [m(-0.05, 'pierde')] };
const sinPrecio = { nombre: 'sin', precios: [m(null, 'sin-precio')] };
const vacio = { nombre: 'vacio', precios: [] };
const filas = [ok, mixto, pierde, sinPrecio, vacio];

it('filtra por estado del margen Rappi en cualquier tamaño; "en objetivo" exige todos', () => {
  const nombres = (f: Parameters<typeof cumpleFiltro>[1]) =>
    filas.filter((x) => cumpleFiltro(x, f)).map((x) => x.nombre);
  expect(nombres('todos')).toHaveLength(5);
  expect(nombres('atencion')).toEqual(['mixto', 'pierde']);
  expect(nombres('bajo')).toEqual(['mixto']);
  expect(nombres('pierde')).toEqual(['pierde']);
  expect(nombres('ok')).toEqual(['ok']);
  expect(nombres('sin-precio')).toEqual(['sin', 'vacio']);
});

it('ordena por el peor tamaño (menor) o el mejor (mayor), con los productos sin dato al final', () => {
  expect(ordenarPorMargen(filas, 'menor').map((x) => x.nombre)).toEqual([
    'pierde',
    'mixto',
    'ok',
    'sin',
    'vacio',
  ]);
  expect(ordenarPorMargen(filas, 'mayor').map((x) => x.nombre)).toEqual([
    'ok',
    'mixto',
    'pierde',
    'sin',
    'vacio',
  ]);
  expect(ordenarPorMargen(filas, 'nombre')).toBe(filas);
});
