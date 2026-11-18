import { describe, expect, it } from 'vitest';
import {
  enCamino,
  filasQuePedir,
  kpisQuePedir,
  ordenQuePedir,
  proveedoresQuePedir,
  saldoCedis,
  type DatosQuePedir,
} from '../../lib/comercializadora/quepedir';
import { aCsv } from '../../lib/comercializadora/formato';

const cat = (o: Record<string, unknown>) => ({
  sku: 'A',
  nombre: 'Café',
  zoho_stock: 10,
  zoho_stock_fisico: null,
  zoho_sync_at: '2026-11-12T10:00:00Z',
  saldo_cedis: 99,
  saldo_yulius: 0,
  costo_unitario: 50,
  zoho_vendor_id: 'v1',
  zoho_vendor_name: 'Prov 1',
  ...o,
});

describe('saldoCedis (_comSaldoCedis)', () => {
  it('sin sync de Zoho usa saldo_cedis; con sync prefiere el físico y si no el contable', () => {
    expect(saldoCedis(cat({ zoho_sync_at: null }) as never)).toBe(99);
    expect(saldoCedis(cat({ zoho_stock_fisico: 7 }) as never)).toBe(7);
    expect(saldoCedis(cat({}) as never)).toBe(10);
  });
});

describe('enCamino', () => {
  it('suma lo pendiente de OCs abiertas e ignora cerradas, canceladas, void y (sin-sku)', () => {
    expect(
      enCamino([
        { sku: 'A', status: 'open', cantidad: 10, cantidad_recibida: 4 },
        { sku: 'A', status: 'partially_received', cantidad: 5, cantidad_recibida: 0 },
        { sku: 'A', status: 'Closed', cantidad: 9, cantidad_recibida: 0 },
        { sku: 'B', status: 'cancelled', cantidad: 9, cantidad_recibida: 0 },
        { sku: '(sin-sku)', status: 'open', cantidad: 9, cantidad_recibida: 0 },
        { sku: 'C', status: 'open', cantidad: 3, cantidad_recibida: 5 },
      ]),
    ).toEqual({ A: 11 });
  });
});

const datos = (o: Partial<DatosQuePedir> = {}): DatosQuePedir => ({
  catalogo: [
    cat({}) as never,
    cat({ sku: 'B', costo_unitario: null, zoho_vendor_id: null, zoho_vendor_name: null }) as never,
  ],
  minmax: [
    { sku: 'A', venta_diaria: 2 },
    { sku: 'B', venta_diaria: 0 },
  ],
  compras: [
    {
      sku: 'A',
      fecha_oc: '2026-11-12',
      cantidad: 5,
      monto: 250,
      adelanto_cierre: true,
      cierre_tarde: false,
      adelanto_minimo: false,
      bajo_minimo: false,
    },
    { sku: 'A', fecha_oc: '2026-12-30', cantidad: 9, monto: 450 },
  ],
  camino: { A: 3 },
  yulius: true,
  resumen: { sinCosto: ['B'], sinProveedor: [] },
  ...o,
});

describe('filasQuePedir (_qpFilas)', () => {
  it('una fila por SKU del mín/máx, con compras dentro del horizonte (las vencidas cuentan)', () => {
    const [a, b] = filasQuePedir(datos(), 15, '2026-11-13');
    expect(a).toMatchObject({
      sku: 'A',
      disp: 10,
      camino: 3,
      venta: 2,
      dias: 5,
      pedir: true,
      cant: 5,
      monto: 250,
      veces: 1,
      adelanto: true,
      costo: 50,
    });
    expect(b).toMatchObject({
      sku: 'B',
      dias: null,
      pedir: false,
      costo: null,
      vendor: '(sin proveedor)',
      nota: 'sin costo',
    });
  });
  it('suma saldo de 3PL solo con inv.yulius', () => {
    const d = datos({
      catalogo: [cat({ saldo_yulius: 4 }) as never],
      minmax: [{ sku: 'A', venta_diaria: 1 }],
    });
    expect(filasQuePedir(d, 7, '2026-11-13')[0].disp).toBe(14);
    expect(filasQuePedir({ ...d, yulius: false }, 7, '2026-11-13')[0].disp).toBe(10);
  });
});

describe('proveedoresQuePedir (_qpProveedores)', () => {
  it('agrupa en pesos (no suma piezas de artículos distintos) y guarda el día más corto', () => {
    const filas = filasQuePedir(datos(), 15, '2026-11-13');
    const [p] = proveedoresQuePedir(filas).filter((x) => x.vendor === 'v1');
    expect(p).toMatchObject({
      aPedir: 1,
      piezas: 5,
      monto: 250,
      valor: 500,
      ventaValor: 100,
      dias: 5,
      diasMin: 5,
      pedir: true,
    });
  });
});

describe('orden y KPIs', () => {
  it('primero lo que hay que pedir, luego menos días; sin venta al final', () => {
    const f = [
      { pedir: false, dias: 1, sku: 'X' },
      { pedir: true, dias: null, sku: 'Y' },
      { pedir: true, dias: 3, sku: 'Z' },
    ] as never[];
    expect([...f].sort(ordenQuePedir).map((x: { sku: string }) => x.sku)).toEqual(['Z', 'Y', 'X']);
  });
  it('KPIs: artículos, monto, proveedores con pedido y artículos con menos de N días', () => {
    const k = kpisQuePedir(filasQuePedir(datos(), 15, '2026-11-13'), 7);
    expect(k).toEqual({ articulos: 1, monto: 250, proveedores: 1, cortos: 1 });
  });
});

describe('aCsv', () => {
  it('escapa comillas, comas y saltos, con BOM para Excel', () => {
    const t = aCsv(
      [{ a: 'x,"y"', b: 2 }],
      [
        ['a', 'A'],
        ['b', 'B'],
      ],
    );
    expect(t).toBe('﻿A,B\r\n"x,""y""",2\r\n');
  });
});
