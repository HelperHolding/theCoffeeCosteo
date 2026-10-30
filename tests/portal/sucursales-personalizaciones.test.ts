import { describe, expect, it } from 'vitest';

import { claveCosto, costear, type DatosCosteo } from '../../lib/sucursales/costeo';
import type { LineaNormal, PedidoNormal } from '../../lib/sucursales/normalizar';
import {
  PERSONALIZACIONES_AJUSTADAS,
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
      latte('Milk', 'Oatmilk'),
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

describe('ajustes calculados (etapa 1b)', () => {
  const ICED_VANILLA = '15556232-34f4-490e-a9b7-0c01998bc4c1';
  const AMERICANO = '500360bd-fd76-4e22-bf01-9bd3ed6e2ae7';
  const l = (insumo: string, cantidad: number, costoUnitario: number, activo = true) => ({
    lineaId: insumo,
    insumoId: insumo,
    insumo,
    unidad: 'ml',
    cantidad,
    costoUnitario,
    activo,
  });
  const conLineas = (o: Partial<DatosCosteo> = {}): DatosCosteo => ({
    ...datos(),
    enlaces: new Map([
      ['5IL', { recetaId: ICED_LATTE, receta: 'Iced Latte' }],
      ['1IC', { recetaId: ICED_VANILLA, receta: 'Iced Vanilla' }],
      ['2AM', { recetaId: AMERICANO, receta: 'Americano' }],
    ]),
    costos: new Map([
      [claveCosto(ICED_LATTE, 'Chica'), { costoCent: 1544, usaInactivo: false }],
      [claveCosto(ICED_VANILLA, 'Chica'), { costoCent: 1900, usaInactivo: false }],
      [claveCosto(AMERICANO, 'Chica'), { costoCent: 1100, usaInactivo: false }],
    ]),
    lineas: new Map([
      [
        claveCosto(ICED_LATTE, 'Chica'),
        [l('LECHE ENTERA', 170, 0.022), l('CAFÉ TOSTADO EN GRANO WHITE 1.5 KG', 18, 0.4)],
      ],
      [
        claveCosto(ICED_VANILLA, 'Chica'),
        [
          l('LECHE ENTERA', 170, 0.022),
          l('JARABE DE VANILLA 1 LT (3 PZAS)', 15, 0.23),
          l('CHIP DE SABOR CHOCOLATE 1 KG', 4, 0.18),
        ],
      ],
      [claveCosto(AMERICANO, 'Chica'), [l('CAFÉ TOSTADO EN GRANO WHITE 1.5 KG', 18, 0.4)]],
    ]),
    sustitutos: new Map([['LECHE DESLACTOSADAS', { costoUnitario: 0.03, activo: true }]]),
    ...o,
  });
  const vaso = (codigo: string, nombre: string, ...extras: string[]) =>
    linea(codigo, nombre, 7000, [c('Regular - 440ml'), ...extras.map((n) => c(n))]);
  const costeo = (d: DatosCosteo, ...ls: LineaNormal[]) => costear([pedido(...ls)], d).resumen;

  it('deslactosada: cambia la leche entera, misma cantidad; suma la diferencia de costo', () => {
    const r = costeo(conLineas(), vaso('5IL', 'Iced Latte', 'Lactose free', 'Without Honey'));
    expect(r.completo.lineas).toBe(1);
    expect(r.completo.costoCent).toBe(1544 + Math.round(170 * (0.03 - 0.022) * 100));
  });

  it('cantidad total con ml en el nombre y «sin chispas»: con los costos de la receta', () => {
    const r = costeo(
      conLineas(),
      vaso('1IC', 'Iced Vanilla', 'More Vanilla (20ml)'),
      vaso('1IC', 'Iced Vanilla', 'Without Sprinkles'),
      vaso('1IC', 'Iced Vanilla', 'Average Vanilla (10ml)', 'Lactose free'),
    );
    expect(r.completo.lineas).toBe(3);
    expect(r.completo.costoCent).toBe(
      3 * 1900 +
        Math.round(5 * 0.23 * 100) -
        Math.round(4 * 0.18 * 100) +
        Math.round((-5 * 0.23 + 170 * 0.008) * 100),
    );
  });

  it('sin datos para calcular queda parcial: sin sustitutos (migración 26), sin líneas (25) o sin ajuste en esa receta', () => {
    expect(
      costeo(conLineas({ sustitutos: undefined }), vaso('5IL', 'Iced Latte', 'Lactose free')).parcial.motivos
        .personalizacion,
    ).toBe(1);
    expect(
      costeo(conLineas({ lineas: undefined }), vaso('5IL', 'Iced Latte', 'Lactose free')).parcial.motivos
        .personalizacion,
    ).toBe(1);
    // Americano no lleva leche: «Lactose free» la agrega y no está en la lista.
    expect(
      costeo(conLineas(), vaso('2AM', 'Americano', 'Lactose free')).parcial.motivos.personalizacion,
    ).toBe(1);
    // Un ajuste verificado junto a una personalización que pide datos sigue parcial.
    expect(
      costeo(conLineas(), vaso('5IL', 'Iced Latte', 'Lactose free', 'Average Honey')).parcial.lineas,
    ).toBe(1);
  });

  it('shots (Carlo y Operaciones, 2026-10-30): Single 18 g (la receta), Double 36 g y Extra Double 72 g', () => {
    const shot = Math.round(18 * 0.4 * 100); // 18 g de café White en centavos
    const r = costeo(
      conLineas(),
      vaso('5IL', 'Iced Latte', 'Single Shot (18ml)'),
      vaso('5IL', 'Iced Latte', 'Double shot (36ml)'),
      vaso('5IL', 'Iced Latte', 'Double shot (36ml)', 'Lactose free'),
      vaso('2AM', 'Americano', 'Double shot (36ml)'),
      vaso('5IL', 'Iced Latte', 'Extra Double shot (36ml)'),
    );
    expect(r.completo.lineas).toBe(5);
    expect(r.parcial.lineas).toBe(0);
    // Extra Double = dos Double = 72 g: tres shots más que la receta.
    expect(r.completo.costoCent).toBe(
      1544 +
        (1544 + shot) +
        (1544 + shot + Math.round(170 * 0.008 * 100)) +
        (1100 + shot) +
        (1544 + 3 * shot),
    );
  });

  it('el sustituto inactivo vuelve la línea parcial por costo', () => {
    const d = conLineas({
      sustitutos: new Map([['LECHE DESLACTOSADAS', { costoUnitario: 0.03, activo: false }]]),
    });
    expect(costeo(d, vaso('5IL', 'Iced Latte', 'Lactose free')).parcial.motivos.costo).toBe(1);
  });

  it('integridad: ajustes solo en recetas reales, sin repetir neutras, y nunca deslactosada en Americano o Cold brew', () => {
    const neutras = new Set(
      Object.entries(PERSONALIZACIONES_NEUTRAS).flatMap(([r, ns]) => ns.map((n) => `${r}:${n}`)),
    );
    for (const [receta, ajustes] of Object.entries(PERSONALIZACIONES_AJUSTADAS)) {
      expect(receta).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      for (const n of Object.keys(ajustes)) expect(neutras.has(`${receta}:${n}`), n).toBe(false);
    }
    expect(PERSONALIZACIONES_AJUSTADAS[AMERICANO]?.['Lactose free']).toBeUndefined();
    expect(
      PERSONALIZACIONES_AJUSTADAS['00f47aba-88e6-4ebc-a815-5833f8b29871']?.['Lactose free'],
    ).toBeUndefined();
    for (const n of ['Single Shot (18ml)', 'Average Honey', 'Oatmilk', 'Chipotle Mayo'])
      expect(
        Object.values(PERSONALIZACIONES_AJUSTADAS).some((a) => n in a),
        n,
      ).toBe(false);
  });
});
