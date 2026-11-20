import { describe, expect, it } from 'vitest';
import type { PedidoPlan } from '../../supabase/functions/_shared/planEngine.ts';
import {
  CORREOS_OVS,
  cadencia,
  calcularLineas,
  calibracion,
  comprasEn,
  conArrastre,
  correosOvs,
  diarioPorSku,
  lunesDe,
  medicion,
  pedidosResurtido,
  ultimoPedido,
  type FilaCatalogoOv,
  type PedidoTienda,
} from '../../lib/comercializadora/ovSugerida';

const CAT: FilaCatalogoOv[] = [
  {
    sku: 'INS-CAF-003',
    nombre: 'Cafe en Grano White 1.5 Kg',
    estatus: 'Compra Recurrente',
    costo_unitario: 420,
  },
  {
    sku: 'INS-DES-021',
    nombre: 'Vaso Caliente Grande 12 Oz (500 Pzs)',
    estatus: 'Compra Recurrente',
    costo_unitario: 568.19,
  },
  { sku: 'INS-BEB-032', nombre: 'Pulpa de Maracuya 500ml', estatus: 'Inactivo', costo_unitario: 70.67 },
  {
    sku: 'INS-BA-068',
    nombre: 'SERVILLETAS THE COFFEE (6,000 PIEZAS)',
    estatus: 'Compra Recurrente',
    costo_unitario: 951,
  },
  {
    sku: 'MP-OPE-022',
    nombre: 'Acrilico Soporte Para Tarjeta',
    estatus: 'Compra Recurrente',
    costo_unitario: null,
  },
];
const ped = (
  id: string,
  fecha_pedido: string,
  items: unknown,
  extra: Partial<PedidoPlan> = {},
): PedidoPlan => ({
  id,
  apertura_id: '411',
  fecha_pedido,
  status: 'pagado',
  items,
  items_editados: null,
  notas_shopify: null,
  ...extra,
});
const pt = (fecha: string, lineas: Record<string, number> = {}, id = fecha): PedidoTienda => ({
  id,
  fecha,
  lineas,
});
const resurtido = (
  pedidos: PedidoPlan[],
  mapa: { shopify_nombre: string; sku: string }[] = [],
  apertura: string[] = [],
) => pedidosResurtido({ pedidos, aperturaId: '411', pedidosApertura: apertura, mapa, catalogo: CAT });

describe('fechas y destinatarios', () => {
  it('lunesDe da el lunes ISO de la semana', () => {
    expect(lunesDe('2026-11-16')).toBe('2026-11-16');
    expect(lunesDe('2026-11-18')).toBe('2026-11-16');
    expect(lunesDe('2026-11-22')).toBe('2026-11-16');
  });

  it('correosOvs usa ovs.correos si es válido y, si no, las dos direcciones del piloto', () => {
    expect(CORREOS_OVS).toEqual(['compras@mx.thecoffee.jp', 'scervera@mx.thecoffee.jp']);
    expect(correosOvs({ ovs: { correos: ['Ana@MX.thecoffee.jp', 'ana@mx.thecoffee.jp'] } })).toEqual([
      'ana@mx.thecoffee.jp',
    ]);
    expect(correosOvs(null)).toEqual(CORREOS_OVS);
    expect(correosOvs({ ovs: { correos: [] } })).toEqual(CORREOS_OVS);
    expect(correosOvs({ ovs: { correos: ['no-es-correo'] } })).toEqual(CORREOS_OVS);
  });
});

describe('pedidos de resurtido (§4.1)', () => {
  it('deja fuera otra apertura, cancelados, pedidos y notas de apertura, llenado y marketing', () => {
    const r = resurtido(
      [
        ped('p1', '2026-11-10T16:00:00Z', [{ sku: 'INS-CAF-003', nombre: 'Cafe', cantidad: 3 }]),
        ped('p2', '2026-11-10T16:00:00Z', [{ sku: 'INS-CAF-003', cantidad: 1 }], { apertura_id: '354' }),
        ped('p3', '2026-11-10T16:00:00Z', [{ sku: 'INS-CAF-003', cantidad: 1 }], { status: 'cancelado' }),
        ped('p4', '2026-11-10T16:00:00Z', [{ sku: 'INS-CAF-003', cantidad: 1 }]),
        ped('p5', '2026-11-10T16:00:00Z', [{ sku: 'INS-CAF-003', cantidad: 1 }], {
          notas_shopify: 'Pedido de apertura',
        }),
        ped('p6', '2026-11-10T16:00:00Z', [{ sku: 'INS-CAF-003', cantidad: 1 }], { es_llenado_canal: true }),
        ped('p7', '2026-11-10T16:00:00Z', [{ sku: 'INS-CAF-003', cantidad: 1 }], {
          marketing_proyecto_id: 'm1',
        }),
      ],
      [],
      ['p4'],
    );
    expect(r.pedidos).toEqual([{ id: 'p1', fecha: '2026-11-10', lineas: { 'INS-CAF-003': 3 } }]);
  });

  it('items_editados manda (aunque venga vacío), recupera el sku por nombre, usa el mapa y el SKU canónico', () => {
    const r = resurtido(
      [
        ped(
          'p1',
          '2026-11-02T16:00:00Z',
          [
            { sku: 'INS-CAF-003', nombre: 'Cafe White', cantidad: 2 },
            { sku: 'INS-DES-021', nombre: 'Vaso 12', cantidad: 1 },
          ],
          { items_editados: [{ nombre: 'Cafe White', cantidad: 5 }] },
        ),
        ped('p2', '2026-11-03T16:00:00Z', [{ sku: 'INS-CAF-003', nombre: 'x', cantidad: 1 }], {
          items_editados: [],
        }),
        ped(
          'p3',
          '2026-11-04T16:00:00Z',
          JSON.stringify([
            { nombre: 'Servilletas', cantidad: '2' },
            { sku: ' ins-des-021 ', nombre: 'v', cantidad: 1 },
            { nombre: 'Sin mapeo', cantidad: 1 },
            { sku: 'INS-BA-076', nombre: 'Cafe 1kg', cantidad: 7 },
            { sku: 'INS-CAF-003', nombre: 'negativo', cantidad: -1 },
          ]),
        ),
      ],
      [{ shopify_nombre: 'Servilletas', sku: 'INS-BA-068' }],
    );
    expect(r.pedidos).toEqual([
      { id: 'p1', fecha: '2026-11-02', lineas: { 'INS-CAF-003': 5 } },
      { id: 'p2', fecha: '2026-11-03', lineas: {} },
      { id: 'p3', fecha: '2026-11-04', lineas: { 'INS-BA-068': 2, 'INS-DES-021': 1 } },
    ]);
    expect(r.sinSku).toBe(1);
    expect(r.fueraDeCatalogo).toEqual(['INS-BA-076']);
  });

  it('usa el día local de CDMX (23:30 del 16 = 05:30 UTC del 17)', () => {
    const r = resurtido([ped('p1', '2026-11-17T05:30:00Z', [{ sku: 'INS-CAF-003', cantidad: 1 }])]);
    expect(r.pedidos[0].fecha).toBe('2026-11-16');
  });
});

describe('cadencia (pedido del usuario 2026-11-20: fija en 14 días)', () => {
  const HOY = '2026-11-16';
  it('siempre 14 días, aunque la tienda pida más seguido o más espaciado', () => {
    expect(cadencia([pt('2026-11-01'), pt('2026-11-04'), pt('2026-11-07')], HOY)).toEqual({
      dias: 14,
      porDefecto: false,
      diasConPedido: 3,
    });
    expect(cadencia([pt('2026-08-20'), pt('2026-10-01')], HOY).dias).toBe(14);
  });
  it('cuenta los días con pedido de los últimos 90 días (dos el mismo día son uno)', () => {
    expect(
      cadencia([pt('2026-11-01', {}, 'a'), pt('2026-11-01', {}, 'b'), pt('2026-11-15')], HOY).diasConPedido,
    ).toBe(2);
    expect(cadencia([pt('2026-08-01'), pt('2026-11-01')], HOY).diasConPedido).toBe(1);
    expect(cadencia([], HOY)).toEqual({ dias: 14, porDefecto: false, diasConPedido: 0 });
  });
  it('último pedido y compras por ventana', () => {
    const ps = [pt('2026-10-05', { A: 1 }), pt('2026-11-09', { A: 2, B: 1 }), pt('2026-11-20', { A: 9 })];
    expect(ultimoPedido(ps, HOY)).toBe('2026-11-09');
    expect(ultimoPedido([], HOY)).toBeNull();
    expect([...comprasEn(ps, '2026-10-05', '2026-11-09')]).toEqual([
      ['A', 3],
      ['B', 1],
    ]);
  });
});

describe('insumo → SKU (§4.4) y calibración (§4.5)', () => {
  it('consumo diario por SKU = Σ consumo ÷ factor ÷ días; sin mapeo activo no entra y se lista', () => {
    const r = diarioPorSku({
      dias: 28,
      insumos: [
        { insumoId: 'cafe', insumo: 'CAFÉ TOSTADO EN GRANO WHITE 1.5 KG', cantidad: 42000 },
        { insumoId: 'cafe2', insumo: 'OTRO CAFÉ', cantidad: 21000 },
        { insumoId: 'vaso12', insumo: 'VASO CALIENTE PAPEL KRAFT 12 OZ (1,000 PZS)', cantidad: 1400 },
        { insumoId: 'leche', insumo: 'LECHE ENTERA', cantidad: 90000 },
        { insumoId: 'hielo', insumo: 'HIELO', cantidad: 0 },
      ],
      mapeo: [
        { insumo_id: 'cafe', sku: 'INS-CAF-003', factor: 1500, activo: true },
        { insumo_id: 'cafe2', sku: 'INS-CAF-003', factor: 1500, activo: true },
        { insumo_id: 'vaso12', sku: 'INS-DES-021', factor: 500, activo: true },
        { insumo_id: 'leche', sku: 'X', factor: 1, activo: false },
      ],
    });
    expect([...r.porSku.keys()]).toEqual(['INS-CAF-003', 'INS-DES-021']);
    expect(r.porSku.get('INS-CAF-003')).toBeCloseTo(1.5);
    expect(r.porSku.get('INS-DES-021')).toBeCloseTo(0.1); // 1400 / 500 / 28
    expect(r.sinMapeo).toEqual(['LECHE ENTERA']);
  });

  it('k = compras 90 días ÷ (diario × 90), acotado a [0.8, 1.5]; sin compras o sin consumo, 1', () => {
    expect(calibracion(90, 1)).toBe(1);
    expect(calibracion(108, 1)).toBeCloseTo(1.2);
    expect(calibracion(45, 1)).toBe(0.8);
    expect(calibracion(180, 1)).toBe(1.5);
    expect(calibracion(0, 1)).toBe(1);
    expect(calibracion(10, 0)).toBe(1);
  });
});

describe('arrastre (§4.9)', () => {
  const caso = (n: number, ya: number, prev: number) => conArrastre(n, ya, prev);
  it('redondea con tolerancia de 0.2 y guarda lo que sobra o falta', () => {
    expect(caso(10, 0, 0)).toMatchObject({ sugerido: 10 });
    expect(caso(10, 0, 0).arrastre).toBeCloseTo(0);
    expect(caso(1.2, 0, 0).sugerido).toBe(1);
    expect(caso(1.2, 0, 0).arrastre).toBeCloseTo(0.2);
    expect(caso(1.21, 0, 0).sugerido).toBe(2);
    expect(caso(1.21, 0, 0).arrastre).toBeCloseTo(-0.79);
    expect(caso(0.15, 0, 0)).toEqual({ bruto: 0.15, sugerido: 0, arrastre: 0.15 });
  });
  it('suma el arrastre anterior (positivo o negativo)', () => {
    expect(caso(3.6, 0, 0.9).sugerido).toBe(5);
    expect(caso(3.6, 0, 0.9).arrastre).toBeCloseTo(-0.5);
    expect(caso(0.5, 0, -0.4).sugerido).toBe(0);
    expect(caso(0.5, 0, -0.4).arrastre).toBeCloseTo(0.1);
  });
  it('resta lo ya pedido y acota el arrastre a ±1 paquete', () => {
    expect(caso(2, 5, 0)).toEqual({ bruto: -3, sugerido: 0, arrastre: -1 });
    expect(caso(1.1, 0, 0).sugerido).toBe(1);
  });
});

describe('líneas de la sugerencia (§4.6–4.11)', () => {
  const HOY = '2026-11-16';
  const pedidos = [
    pt('2026-08-01', { 'INS-DES-021': 50 }), // fuera de los 90 días
    pt('2026-09-01', { 'INS-CAF-003': 30, 'INS-BA-068': 1 }),
    pt('2026-10-15', { 'INS-CAF-003': 78, 'INS-BA-068': 2, 'MP-OPE-022': 9 }),
    pt(HOY, { 'INS-CAF-003': 4 }), // pedido hoy: ya pedido
  ];
  const receta = new Map([
    ['INS-CAF-003', 1],
    ['INS-DES-021', 0.1],
    ['INS-BEB-032', 0.05],
  ]);

  it('receta × k, historial ÷ 90, ya pedido, arrastre, inactivos aparte y monto', () => {
    const r = calcularLineas({
      hoy: HOY,
      cadencia: 14,
      recetaDiaria: receta,
      skusReceta: new Set(receta.keys()),
      pedidos,
      catalogo: CAT,
      arrastrePrevio: new Map([['INS-CAF-003', 0.3]]),
    });
    expect(r.lineas).toEqual([
      {
        sku: 'INS-BA-068',
        nombre: 'SERVILLETAS THE COFFEE (6,000 PIEZAS)',
        origen: 'historial',
        k: null,
        diario: 0.0333,
        necesidad: 0.4667,
        ya_pedido: 0,
        arrastre: -0.5333,
        sugerido: 1,
        monto: 951,
      },
      {
        sku: 'INS-CAF-003',
        nombre: 'Cafe en Grano White 1.5 Kg',
        origen: 'receta',
        k: 1.2,
        diario: 1.2,
        necesidad: 16.8,
        ya_pedido: 4,
        arrastre: 0.1,
        sugerido: 13,
        monto: 5460,
      },
      {
        sku: 'INS-DES-021',
        nombre: 'Vaso Caliente Grande 12 Oz (500 Pzs)',
        origen: 'receta',
        k: 1,
        diario: 0.1,
        necesidad: 1.4,
        ya_pedido: 0,
        arrastre: -0.6,
        sugerido: 2,
        monto: 1136.38,
      },
      {
        sku: 'MP-OPE-022',
        nombre: 'Acrilico Soporte Para Tarjeta',
        origen: 'historial',
        k: null,
        diario: 0.1,
        necesidad: 1.4,
        ya_pedido: 0,
        arrastre: -0.6,
        sugerido: 2,
        monto: null,
      },
    ]);
    expect(r.inactivos).toEqual([{ sku: 'INS-BEB-032', nombre: 'Pulpa de Maracuya 500ml' }]);
  });

  it('un SKU de receta sin venta en 28 días sigue siendo de receta (no pasa a historial)', () => {
    const r = calcularLineas({
      hoy: HOY,
      cadencia: 14,
      recetaDiaria: new Map(),
      skusReceta: new Set(['INS-BA-068']),
      pedidos,
      catalogo: CAT,
      arrastrePrevio: new Map(),
    });
    expect(r.lineas.find((l) => l.sku === 'INS-BA-068')).toMatchObject({
      origen: 'receta',
      k: 1,
      diario: 0,
      sugerido: 0,
    });
  });
});

describe('medición contra la semana anterior (§7)', () => {
  it('lo sugerido la semana pasada contra lo pedido desde su lunes, con montos', () => {
    const m = medicion({
      anteriores: [
        { sku: 'INS-CAF-003', sugerido: 13 },
        { sku: 'INS-DES-021', sugerido: 2 },
        { sku: 'MP-OPE-022', sugerido: 0 },
      ],
      desde: '2026-11-09',
      hoy: '2026-11-16',
      pedidos: [
        pt('2026-11-08', { 'INS-CAF-003': 50 }),
        pt('2026-11-12', { 'INS-CAF-003': 12, 'INS-BA-068': 1 }),
        pt('2026-11-16', { 'INS-CAF-003': 1 }),
      ],
      catalogo: CAT,
    });
    expect(m).toEqual({
      desde: '2026-11-09',
      filas: [
        {
          sku: 'INS-BA-068',
          nombre: 'SERVILLETAS THE COFFEE (6,000 PIEZAS)',
          sugerido: 0,
          pedido: 1,
          diferencia: 1,
        },
        { sku: 'INS-CAF-003', nombre: 'Cafe en Grano White 1.5 Kg', sugerido: 13, pedido: 13, diferencia: 0 },
        {
          sku: 'INS-DES-021',
          nombre: 'Vaso Caliente Grande 12 Oz (500 Pzs)',
          sugerido: 2,
          pedido: 0,
          diferencia: -2,
        },
      ],
      montoSugerido: 6596.38,
      montoPedido: 6411,
    });
  });
});
