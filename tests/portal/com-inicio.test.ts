import { describe, expect, it } from 'vitest';
import {
  armarInicio,
  diaCdmx,
  enTransito,
  estadoDoh,
  leadTimePrometido,
  mesesHasta,
  montoOcsOperativas,
  montoPedido,
  ocsProximas,
  pctCompras,
  porcentajeMermas,
  relativo,
  resumenInventario,
  salidas30,
  tendencia,
  ventaDiaria,
} from '../../lib/comercializadora/inicio';
import { agruparOcs, type MovCompra } from '../../lib/comercializadora/ordenes';
import { fechaCorta } from '../../lib/comercializadora/fechas';

const compra = (o: Partial<MovCompra>): MovCompra => ({
  id: String(Math.random()),
  folio: 'F1',
  fecha: '2026-11-01',
  sku: 'x',
  cantidad: 5,
  cantidad_recibida: 0,
  monto: null,
  destino: 'CEDIS',
  fecha_arribo: null,
  proveedor: 'P',
  estado: null,
  ...o,
});
const art = (o: Record<string, unknown>) => ({
  sku: 'A',
  nombre: 'Café',
  estatus: 'Activo',
  categoria: 'Insumos',
  created_at: null,
  costo_unitario: null,
  saldo_cedis: 0,
  zoho_stock: null,
  zoho_stock_fisico: null,
  zoho_sync_at: null,
  ...o,
});
const venta = (o: Record<string, unknown>) => ({
  folio: 'V1',
  sku: 'A',
  cantidad: 1,
  estado: 'enviado',
  fecha_envio: '2026-11-10',
  ...o,
});

describe('Inicio: dinero (port de renderComInicio)', () => {
  it('_pedMonto: monto si es > 0; si no, Σ precio × cantidad de los items (también como texto JSON)', () => {
    expect(montoPedido({ monto: 500, items: [] })).toBe(500);
    expect(
      montoPedido({ monto: 0, items: '[{"precio":"10.5","cantidad":2},{"precio":3,"cantidad":1}]' }),
    ).toBe(24);
    expect(montoPedido({ monto: null, items: 'no es json' })).toBe(0);
    expect(montoPedido({ monto: null, items: [{ nombre: 'x' }] })).toBe(0);
  });

  it('_montoOCsPorFolio: un monto por folio (el último no nulo), sin folios de Equipo; cuenta folios distintos', () => {
    const filas = [
      { folio: 'A', monto: 100, sku: 'x' },
      { folio: 'A', monto: null, sku: 'y' },
      { folio: 'B', monto: 50, sku: 'eq' },
      { folio: 'C', monto: 30, sku: 'x' },
      { folio: 'C', monto: 40, sku: 'x' },
      { folio: null, monto: 9, sku: 'x' },
    ];
    expect(montoOcsOperativas(filas, { x: 'Insumos', y: 'Insumos', eq: 'Equipo' })).toEqual({
      monto: 140,
      folios: 3,
    });
  });

  it('% Compras/Ventas: 45–55 verde, >55–65 ámbar, lo demás rojo; sin ventas = sin dato', () => {
    expect(pctCompras(50, 100)).toMatchObject({ pct: 50, tono: 'ok' });
    expect(pctCompras(60, 100)).toMatchObject({ pct: 60, tono: 'bajo' });
    expect(pctCompras(70, 100)).toMatchObject({ pct: 70, tono: 'pierde' });
    expect(pctCompras(40, 100)).toMatchObject({ pct: 40, tono: 'pierde' });
    expect(pctCompras(10, 0)).toMatchObject({ pct: null, tono: 'neutro', texto: 'Sin datos suficientes' });
  });

  it('meses: los 5 que terminan en el mes de hoy, cruzando el año', () => {
    expect(mesesHasta('2026-02-10', 5)).toEqual(['2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('día de CDMX: un pedido a las 21:00 del 31 de oct en CDMX cuenta en octubre aunque en UTC sea 1 de nov', () => {
    expect(diaCdmx('2026-11-01T03:00:00Z')).toBe('2026-10-31');
    expect(diaCdmx('2026-11-05')).toBe('2026-11-05');
  });

  it('tendencia: ventas por día de CDMX, compras operativas por fecha de la OC, conteos del mes', () => {
    const t = tendencia(
      '2026-11-13',
      [
        { fecha_pedido: '2026-11-01T03:00:00Z', monto: 100, items: null },
        { fecha_pedido: '2026-11-02T18:00:00Z', monto: 200, items: null },
      ],
      [compra({ folio: 'A', monto: 50, fecha: '2026-11-05' })],
      { x: 'Insumos' },
    );
    expect(t).toHaveLength(5);
    expect(t[4]).toMatchObject({
      mes: '2026-11',
      etiqueta: 'Nov 26',
      ventas: 200,
      compras: 50,
      pct: 25,
      tono: 'pierde',
      pedidos: 1,
      ocs: 1,
      sinMonto: false,
      actual: true,
    });
    expect(t[3]).toMatchObject({ mes: '2026-10', ventas: 100, compras: 0, pct: 0, actual: false });
  });

  it('compras del mes sin monto capturado se señalan', () => {
    const t = tendencia('2026-11-13', [], [compra({ folio: 'A', monto: null, fecha: '2026-11-05' })], {});
    expect(t[4]).toMatchObject({ compras: 0, ocs: 1, sinMonto: true });
  });
});

describe('Inicio: compras', () => {
  const hoy = '2026-11-13';
  const grupos = agruparOcs([
    compra({ folio: 'F1', fecha_arribo: '2026-11-16', monto: 100 }),
    compra({ folio: 'F2', fecha_arribo: '2026-11-23', monto: 70 }),
    compra({ folio: 'F3', fecha_arribo: '2026-11-15', cantidad_recibida: 5 }),
    compra({ folio: 'F4', fecha_arribo: '2026-11-12' }),
    compra({ folio: 'F5', fecha_arribo: null }),
  ]);

  it('OCs próximas: sin recibir y con arribo entre hoy y hoy + 7', () => {
    expect(ocsProximas(grupos, hoy)).toEqual({ folios: ['F1'], monto: 100 });
  });

  it('en tránsito: sin recibir, por fecha de arribo y las sin fecha al final', () => {
    expect(enTransito(grupos).map((g) => g.folio)).toEqual(['F4', 'F1', 'F2', 'F5']);
  });

  it('lead time prometido: promedio de arribo − emisión de las OCs con ambas fechas, redondeado', () => {
    const g = agruparOcs([
      compra({ folio: 'A', fecha: '2026-11-01', fecha_arribo: '2026-11-11' }),
      compra({ folio: 'B', fecha: '2026-11-01', fecha_arribo: '2026-11-06' }),
      compra({ folio: 'C', fecha: '2026-11-01', fecha_arribo: null }),
    ]);
    expect(leadTimePrometido(g)).toEqual({ dias: 8, ocs: 2 });
    expect(leadTimePrometido([])).toEqual({ dias: null, ocs: 0 });
  });

  it('fecha relativa del arribo', () => {
    expect(relativo('2026-11-13', hoy)).toBe('Hoy');
    expect(relativo('2026-11-14', hoy)).toBe('Mañana');
    expect(relativo('2026-11-11', hoy)).toBe('Hace 2 d');
    expect(relativo('2026-11-18', hoy)).toBe(fechaCorta('2026-11-18'));
    expect(relativo(null, hoy)).toBe('—');
  });
});

describe('Inicio: inventario', () => {
  it('estado por días de inventario: urgente ≤ LT, pronto ≤ max(2·LT, 14); LT por omisión 7; sin venta < 0.01', () => {
    expect(estadoDoh(0, 0.005, 5)).toBe('sin_venta');
    expect(estadoDoh(10, 2, 5)).toBe('urgente');
    expect(estadoDoh(20, 2, 5)).toBe('pronto');
    expect(estadoDoh(30, 2, 5)).toBe('ok');
    expect(estadoDoh(14, 2, undefined)).toBe('urgente');
  });

  it('venta diaria: enviados de 90 días entre min(90, días de vida)', () => {
    expect(ventaDiaria({ sku: 'A', created_at: '2026-11-03T12:00:00Z' }, { A: 30 }, '2026-11-13')).toBe(3);
    expect(ventaDiaria({ sku: 'A', created_at: null }, { A: 180 }, '2026-11-13')).toBe(2);
    expect(ventaDiaria({ sku: 'B', created_at: null }, { A: 180 }, '2026-11-13')).toBe(0);
  });

  it('sin stock, críticos (sin tope), faltantes vs comprometido y stock bajo sin venta; ignora inactivos', () => {
    const r = resumenInventario({
      hoy: '2026-11-13',
      catalogo: [
        art({ sku: 'A', saldo_cedis: 0 }),
        art({ sku: 'B', saldo_cedis: 5 }),
        art({ sku: 'C', saldo_cedis: 4 }),
        art({ sku: 'D', saldo_cedis: 10 }),
        art({ sku: 'E', saldo_cedis: 0, estatus: 'Inactivo' }),
      ] as never,
      ventas90: [venta({ sku: 'D', cantidad: 180 }), venta({ sku: 'D', cantidad: 50, estado: 'por_enviar' })],
      porEnviar: [
        venta({ sku: 'B', cantidad: 8, estado: 'por_enviar' }),
        venta({ sku: 'A', cantidad: 2, estado: 'por_enviar' }),
      ],
      leadTimes: [{ sku: 'D', dias: 5 }],
    });
    expect(r.sinStock.map((x) => [x.sku, x.comprometido])).toEqual([['A', 2]]);
    expect(r.criticos).toBe(1);
    expect(r.faltantes).toEqual([
      expect.objectContaining({ sku: 'B', saldo: 5, comprometido: 8, faltante: 3 }),
    ]);
    expect(r.stockBajo.map((x) => x.sku)).toEqual(['C']); // B (5 piezas) queda fuera: ya está en faltantes
    expect(r.cedisTotal).toBe(19);
    expect(r.activos).toBe(4);
  });

  it('salidas de 30 días: folios distintos y piezas enviadas', () => {
    expect(
      salidas30(
        [
          venta({ folio: 'V1', cantidad: 3, fecha_envio: '2026-11-03' }),
          venta({ folio: 'V1', cantidad: 2, fecha_envio: '2026-11-03' }),
          venta({ folio: 'V2', cantidad: 9, fecha_envio: '2026-10-01' }),
          venta({ folio: 'V3', cantidad: 4, estado: 'por_enviar', fecha_envio: '2026-11-12' }),
        ],
        '2026-11-13',
      ),
    ).toEqual({ folios: 1, uds: 5 });
  });

  it('mermas: |cantidad| × costo del momento ÷ valor del inventario CEDIS, a 2 decimales', () => {
    const cat = [
      art({ sku: 'A', saldo_cedis: 10, costo_unitario: 100 }),
      art({ sku: 'B', saldo_cedis: 5 }),
    ] as never;
    expect(
      porcentajeMermas(
        [
          { cantidad: -2, costo_unitario_momento: 50 },
          { cantidad: -1, costo_unitario_momento: null },
        ],
        cat,
      ),
    ).toEqual({ pct: 10, n: 2 });
    expect(porcentajeMermas([], [art({ saldo_cedis: 0 })] as never)).toEqual({ pct: null, n: 0 });
  });

  it('armarInicio junta todo con los conteos de compras de la pantalla Órdenes', () => {
    const r = armarInicio({
      hoy: '2026-11-13',
      catalogo: [art({ sku: 'x', saldo_cedis: 3 })] as never,
      porEnviar: [],
      ventas90: [],
      compras: [compra({ folio: 'F1', fecha_arribo: '2026-11-10', monto: 10, fecha: '2026-11-02' })],
      leadTimes: [],
      mermas: [],
      pedidos: [{ fecha_pedido: '2026-11-05T18:00:00Z', monto: 40, items: null }],
    });
    expect(r.compras).toMatchObject({ abiertas: 1, atrasadas: 1 });
    expect(r.mes).toMatchObject({ ventas: 40, compras: 10, pct: 25 });
    expect(r.transito.map((g) => g.folio)).toEqual(['F1']);
  });
});
