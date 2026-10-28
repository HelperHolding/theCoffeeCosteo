import { describe, expect, it } from 'vitest';

import { claveCosto, costear, type DatosCosteo } from '../../lib/sucursales/costeo';
import type { LineaNormal, PedidoNormal } from '../../lib/sucursales/normalizar';
import {
  PERSONALIZACIONES_NEUTRAS,
  TEMPERATURAS,
  personalizacionNeutra,
} from '../../lib/sucursales/personalizaciones-verificadas';

// Recetas reales: Iced Latte (vaso verificado) y Grilled Ham & Cheese Sandwich (Único).
const ICED_LATTE = 'fcf0d45d-76b2-48a4-8d96-d8abc228eca8';
const GRILLED_HAM = 'ae3742b2-0188-4fc3-88c4-533a8ecb40c9';
const MUG = 'cef677b4-0976-4640-8bc7-2ce82337466f'; // la receta suma las dos tazas: no puede ser neutra

const datos = (): DatosCosteo => ({
  leidoEn: '2026-10-28T03:00:00.000Z',
  iva: 0.16,
  enlaces: new Map([
    ['5IL', { recetaId: ICED_LATTE, receta: 'Iced Latte' }],
    ['MQ1', { recetaId: GRILLED_HAM, receta: 'Grilled Ham & Cheese Sandwich' }],
  ]),
  costos: new Map([
    [claveCosto(ICED_LATTE, 'Chica'), { costoCent: 1544, usaInactivo: false }],
    [claveCosto(ICED_LATTE, 'Grande'), { costoCent: 1828, usaInactivo: false }],
    [claveCosto(GRILLED_HAM, 'Único'), { costoCent: 3674, usaInactivo: false }],
  ]),
  unicas: new Set([GRILLED_HAM]),
});

const c = (nombre: string, importeCent = 0) => ({ codigo: nombre, nombre, importeCent, descuentoPct: 0 });
const linea = (
  codigo: string,
  nombre: string,
  importeCent: number,
  customs: ReturnType<typeof c>[],
): LineaNormal => ({
  codigo,
  nombre,
  importeCent,
  descuentoPct: 0,
  customs,
});
let id = 1;
const pedido = (...lineas: LineaNormal[]): PedidoNormal => ({
  id: id++,
  fecha: '2026-10-20',
  segundo: 0,
  hora: '10:00',
  origen: 'mostrador',
  ventaCent: lineas.reduce((s, l) => s + l.importeCent + l.customs.reduce((t, x) => t + x.importeCent, 0), 0),
  netoCent: null,
  descuentoCent: 0,
  metodo: 'CARTAO',
  tipo: 'CREDIT',
  lineas,
  numeroPedidoRappi: null,
  cuadra: true,
});
const latte = (...extras: string[]) =>
  linea('5IL', 'Iced Latte', 7000, [c('Regular - 440ml'), ...extras.map((n) => c(n))]);
const costeo = (...ls: LineaNormal[]) => costear([pedido(...ls)], datos()).resumen;

describe('personalizaciones neutras', () => {
  it('temperatura (con «°» o «º») y opciones de la receta: costeo completo con el costo de la receta', () => {
    const r = costeo(latte('Original (60°C)'), latte('Warm (50ºC)'), latte('Milk', 'Without Honey'));
    expect(r.completo.lineas).toBe(3);
    expect(r.completo.costoCent).toBe(3 * 1544);
    expect(r.parcial.lineas).toBe(0);
  });

  it('basta una personalización que cambia la receta para que la línea sea parcial', () => {
    const r = costeo(
      latte('Lactose free'),
      latte('Milk', 'Double shot (36ml)'),
      latte('Without Honey', 'Average Honey'),
    );
    expect(r.completo.lineas).toBe(0);
    expect(r.parcial.motivos.personalizacion).toBe(3);
  });

  it('la lista es por receta: «Without Chipotle Mayo» es neutra en el sándwich, no en el Iced Latte', () => {
    const r = costeo(
      linea('MQ1', 'Grilled Ham & Cheese Sandwich', 8900, [c('Without Chipotle Mayo')]),
      latte('Without Chipotle Mayo'),
    );
    expect(r.completo.lineas).toBe(1);
    expect(r.completo.costoCent).toBe(3674);
    expect(r.completo.margenCent).toBe(Math.round(8900 / 1.16) - 3674);
    expect(r.parcial.motivos.personalizacion).toBe(1);
  });

  it('«Chipotle Mayo» sigue siendo parcial: la salsa no está en la receta', () => {
    const r = costeo(linea('MQ1', 'Grilled Ham & Cheese Sandwich', 8900, [c('Chipotle Mayo')]));
    expect(r.parcial.motivos.personalizacion).toBe(1);
  });

  it('una personalización neutra no suple el tamaño: sin vaso en una receta de dos tamaños sigue parcial', () => {
    const r = costeo(linea('5IL', 'Iced Latte', 7000, [c('Milk'), c('Original (60°C)')]));
    expect(r.parcial.motivos.tamano).toBe(1);
  });
});

describe('integridad de la lista', () => {
  it('solo ids de receta y nombres no vacíos', () => {
    for (const [receta, nombres] of Object.entries(PERSONALIZACIONES_NEUTRAS)) {
      expect(receta).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(nombres.length).toBeGreaterThan(0);
      for (const n of nombres) expect(n.trim()).toBe(n);
    }
    expect(TEMPERATURAS.size).toBe(6);
  });

  it('no incluye opciones que cambian cantidades o insumos (requieren calcular la diferencia)', () => {
    const cambian = [
      'Lactose free',
      'Oatmilk',
      'Almond Milk',
      'Coconut Milk',
      'Double shot (36ml)',
      'Single Shot (18ml)',
      'Extra Double shot (36ml)',
      'Less Honey',
      'Average Honey',
      'More Honey',
      'Chipotle Mayo',
      'Without Sprinkles',
      'More Vanilla (20ml)',
      'Less Vanilla (10ml)',
      'Cold brew - White',
      'Hot Drip White',
    ];
    const todas = new Set(Object.values(PERSONALIZACIONES_NEUTRAS).flat());
    for (const n of cambian) expect(todas.has(n), n).toBe(false);
  });

  it('Mug no tiene opciones neutras: su receta suma las dos tazas', () => {
    expect(personalizacionNeutra(MUG, 'Mug Black')).toBe(false);
    expect(PERSONALIZACIONES_NEUTRAS[MUG]).toBeUndefined();
  });
});
