import { describe, expect, it } from 'vitest';
import { lineasBi } from '../../lib/bi/lineas';
import type { LineaNormal, PedidoNormal } from '../../lib/sucursales/normalizar';

const linea = (codigo: string, importeCent: number, extra: Partial<LineaNormal> = {}): LineaNormal => ({
  codigo, nombre: `Producto ${codigo}`, importeCent, descuentoPct: 0, customs: [], ...extra,
});
const pedido = (extra: Partial<PedidoNormal> = {}): PedidoNormal => ({
  id: 1001, fecha: '2026-11-04', segundo: 36000, hora: '10:00:00', origen: 'mostrador', ventaCent: 0, netoCent: null,
  descuentoCent: 0, metodo: 'CARTAO', tipo: 'EMV', lineas: [], numeroPedidoRappi: null, cuadra: true, ...extra,
});

describe('lineasBi', () => {
  it('mostrador con 2 líneas: importe con modificadores, líneas 1 y 2, pedido como texto', () => {
    const r = lineasBi([pedido({
      lineas: [
        linea('LAT', 6000, { customs: [{ codigo: 'LECHE', nombre: 'Leche', importeCent: 1000, descuentoPct: 0 }] }),
        linea('CRO', 4500),
      ],
      ventaCent: 11500,
    })]);
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.linea)).toEqual([1, 2]);
    expect(r.map((x) => x.importe_cent)).toEqual([7000, 4500]);
    expect(r[0]).toMatchObject({ pedido: '1001', canal: 'mostrador', smartphone: false, opcion_consumo: null, unidades: 1, codigo: 'LAT' });
  });

  it('hora = floor(segundo / 3600)', () => {
    expect(lineasBi([pedido({ segundo: 86399, lineas: [linea('A', 100)] })])[0].hora).toBe(23);
    expect(lineasBi([pedido({ segundo: 3600, lineas: [linea('A', 100)] })])[0].hora).toBe(1);
  });

  it('app: canal app, smartphone true, método y tipo como vienen', () => {
    const r = lineasBi([pedido({ origen: 'app', metodo: 'PIX', tipo: 'ONLINE', lineas: [linea('A', 100)] })])[0];
    expect(r).toMatchObject({ canal: 'app', smartphone: true, metodo_pago: 'PIX', tipo_pago: 'ONLINE' });
  });

  it('Rappi del POS: canal rappi, smartphone false', () => {
    const r = lineasBi([pedido({ origen: 'rappi', metodo: 'RAPPI', tipo: 'CREDIT', lineas: [linea('A', 100)] })])[0];
    expect(r).toMatchObject({ canal: 'rappi', smartphone: false, metodo_pago: 'RAPPI', tipo_pago: 'CREDIT' });
  });

  it('descuento de línea derivado del porcentaje', () => {
    const d = (pct: number) =>
      lineasBi([pedido({ lineas: [linea('A', 8000, { descuentoPct: pct })] })])[0].descuento_cent;
    expect(d(20)).toBe(2000);
    expect(d(100)).toBe(0);
    expect(d(0)).toBe(0);
  });

  it('pedido sin líneas no produce renglones', () => {
    expect(lineasBi([pedido()])).toEqual([]);
  });

  it('la suma de importes de un pedido que cuadra es su venta', () => {
    const p = pedido({
      lineas: [linea('A', 5000, { customs: [{ codigo: 'X', nombre: 'X', importeCent: 500, descuentoPct: 0 }] }), linea('B', 3000)],
      ventaCent: 8500,
    });
    expect(lineasBi([p]).reduce((s, x) => s + x.importe_cent, 0)).toBe(p.ventaCent);
  });
});
