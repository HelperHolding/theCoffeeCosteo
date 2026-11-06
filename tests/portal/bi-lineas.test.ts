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

  it('prorratea el neto: 3 líneas con neto 3 % menor suman exactamente netoCent', () => {
    const p = pedido({
      origen: 'app', metodo: 'WALLET', ventaCent: 9810, netoCent: 9516,
      lineas: [linea('A', 3333), linea('B', 3333), linea('C', 3144)],
    });
    const r = lineasBi([p]);
    expect(r.map((x) => x.importe_cent)).toEqual([3333, 3333, 3144]);
    expect(r.reduce((s, x) => s + x.importe_neto_cent, 0)).toBe(9516);
    expect(r[0].importe_neto_cent).toBe(Math.round(3333 * (9516 / 9810)));
  });

  it('netoCent null (Rappi del portal): neto = bruto', () => {
    const r = lineasBi([pedido({ origen: 'rappi', ventaCent: 5000, netoCent: null, lineas: [linea('A', 3000), linea('B', 2000)] })]);
    expect(r.map((x) => x.importe_neto_cent)).toEqual([3000, 2000]);
  });

  it('Rappi del POS con comisión de 17.6 %', () => {
    const r = lineasBi([pedido({ origen: 'rappi', ventaCent: 10000, netoCent: 8240, lineas: [linea('A', 6000), linea('B', 4000)] })]);
    expect(r.reduce((s, x) => s + x.importe_neto_cent, 0)).toBe(8240);
    expect(r[0].importe_neto_cent).toBe(4944);
  });

  it('antes del 2026-03-01 Zoho usaba lo cobrado: neto = bruto aunque la API traiga neto', () => {
    const p = { ventaCent: 9810, netoCent: 9516, lineas: [linea('A', 5000), linea('B', 4810)] };
    expect(lineasBi([pedido({ ...p, fecha: '2026-02-28' })]).map((x) => x.importe_neto_cent)).toEqual([5000, 4810]);
    expect(lineasBi([pedido({ ...p, fecha: '2026-03-01' })]).reduce((s, x) => s + x.importe_neto_cent, 0)).toBe(9516);
  });

  it('pedido que no cuadra: solo redondea por línea', () => {
    const r = lineasBi([pedido({ ventaCent: 9000, netoCent: 8730, cuadra: false, lineas: [linea('A', 3333), linea('B', 3333)] })]);
    expect(r.map((x) => x.importe_neto_cent)).toEqual([3233, 3233]);
  });
});
